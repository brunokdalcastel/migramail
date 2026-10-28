// Um processo do imapsync: spawn sem shell, leitura ao vivo da saída pelo parser, parada pela
// árvore de processos e série temporal para o gráfico. Sem electron: roda no Vitest.
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { readdirSync, rm, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeExit } from '@shared/exitCodes'
import type {
  Account,
  JobMode,
  JobScope,
  JobProgress,
  JobSeriesPoint,
  JobSnapshot,
  JobState,
  JobStatus,
} from '@shared/model'
import { applyLine, classifyLine, createLineSplitter, derive, initialProgress } from './parser'

/** Últimas linhas guardadas em memória para a aba Log. */
export const LOG_TAIL_MAX = 2000
/** Linha maior que isso é cortada no tail (o log em arquivo do imapsync fica inteiro). */
const LINE_MAX = 8000
/** Pontos da série antes de descartar um a cada dois. */
export const SERIES_MAX = 1800
/** Senha mais curta que isso não é mascarada no tail (mascararia pedaços comuns de texto). */
const MASK_MIN_LENGTH = 3

export type KillTree = (pid: number) => Promise<void>

export interface JobEvents {
  /** Snapshot novo; no máximo um a cada `throttleMs`, salvo troca de estado (imediata). */
  change(snapshot: JobSnapshot): void
  /** Linhas novas da saída desde o último aviso. */
  log(jobId: string, lines: string[]): void
}

export interface JobOptions {
  pidfile: string
  /** Tela de onde veio (padrão "Uma conta"). */
  scope?: JobScope
  logPath: string
  throttleMs?: number
  sampleMs?: number
  killTree?: KillTree
  /** Onde o exe extrai o runtime (`par-<usuário>\temp-<pid>`); padrão é o TEMP do processo. */
  tempDir?: string
}

/** `taskkill /T /F` derruba o imapsync.exe e o processo que o PAR extrai por baixo dele. */
export const taskkillTree: KillTree = (pid) =>
  new Promise((resolve) => {
    if (process.platform !== 'win32') {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // já saiu
      }
      resolve()
      return
    }
    const taskkill = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'taskkill.exe')
    // processo que já saiu faz o taskkill falhar; o fim do job vem pelo 'close' de qualquer jeito
    execFile(taskkill, ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve())
  })

/**
 * O imapsync.exe (PAR::Packer) extrai ~35 MB em `%TEMP%\par-<usuário>\temp-<pid>` a cada
 * execução. Ao sair normalmente deixa 2 arquivos; depois do taskkill deixa tudo. Apaga em
 * segundo plano ao fim de todo job.
 */
export function removeParTemp(tempDir: string, pid: number): void {
  let parDirs: string[]
  try {
    parDirs = readdirSync(tempDir).filter((name) => name.startsWith('par-'))
  } catch {
    return
  }
  for (const dir of parDirs) {
    rm(
      join(tempDir, dir, `temp-${pid}`),
      { recursive: true, force: true, maxRetries: 5, retryDelay: 200 },
      () => {},
    )
  }
}

/** Nome do log do imapsync: `<conta>_<AAAAMMDD-HHmmss>_<id curto>.txt`, sem caracteres ruins. */
export function logFileName(name: string, date: Date, jobId: string): string {
  const safe = name.replace(/[^\p{L}\p{N}._@-]+/gu, '_').slice(0, 80) || 'conta'
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `${safe}_${stamp}_${jobId.slice(0, 8)}.txt`
}

export class Job {
  state: JobState = 'queued'
  progress: JobProgress
  readonly logTail: string[] = []
  stoppedByUser = false
  error: string | null = null
  exitCode: number | null = null
  pid: number | null = null
  readonly queuedAt = Date.now()
  startedAt: number | null = null
  finishedAt: number | null = null
  /** Resolve quando o job termina (saída do processo, cancelamento na fila ou falha no spawn). */
  readonly done: Promise<void>

  private series: JobSeriesPoint[] = []
  private sampleEvery = 1
  private sampleTick = 0
  private sampleTimer: NodeJS.Timeout | null = null
  private emitTimer: NodeJS.Timeout | null = null
  private lastEmit = 0
  private pendingLog: string[] = []
  private masks: string[] = []
  private child: ChildProcess | null = null
  private resolveDone!: () => void
  private readonly throttleMs: number
  private readonly sampleMs: number
  private readonly killTree: KillTree

  constructor(
    readonly id: string,
    readonly account: Account,
    readonly mode: JobMode,
    private readonly options: JobOptions,
    private readonly events: JobEvents,
  ) {
    this.progress = initialProgress(mode)
    this.throttleMs = options.throttleMs ?? 250
    this.sampleMs = options.sampleMs ?? 2000
    this.killTree = options.killTree ?? taskkillTree
    this.done = new Promise((resolve) => (this.resolveDone = resolve))
  }

  /** Roda o imapsync. Senhas só no `env`; os `args` já vêm sem elas (args.ts). */
  start(file: string, args: string[], env: NodeJS.ProcessEnv): void {
    if (this.state !== 'queued') return
    this.state = 'running'
    this.startedAt = Date.now()
    this.masks = [env['IMAPSYNC_PASSWORD1'], env['IMAPSYNC_PASSWORD2']].filter(
      (s): s is string => typeof s === 'string' && s.length >= MASK_MIN_LENGTH,
    )

    let child: ChildProcess
    try {
      child = spawn(file, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      this.fail(err)
      return
    }
    this.child = child
    this.pid = child.pid ?? null

    for (const stream of [child.stdout, child.stderr]) {
      if (!stream) continue
      // um splitter por stream: linhas parciais de stdout e stderr não se misturam
      const splitter = createLineSplitter((line) => this.handleLine(line))
      stream.setEncoding('utf8')
      stream.on('data', (chunk: string) => splitter.push(chunk))
      stream.on('end', () => splitter.flush())
    }
    child.on('error', (err) => {
      // sem pid = o processo nem chegou a existir; o 'close' pode não vir
      if (child.pid === undefined) this.fail(err)
    })
    child.on('close', (code) => this.finish(code))

    this.sample()
    this.sampleTimer = setInterval(() => this.onSampleTick(), this.sampleMs)
    this.emitNow()
  }

  /** Para o job: na fila só cancela; rodando derruba a árvore de processos e espera sair. */
  async stop(): Promise<void> {
    if (this.state === 'queued') {
      this.stoppedByUser = true
      this.state = 'finished'
      this.finishedAt = Date.now()
      this.emitNow()
      this.resolveDone()
      return
    }
    if (this.state !== 'running') return this.done
    this.state = 'stopping'
    this.stoppedByUser = true
    this.emitNow()
    if (this.pid !== null) await this.killTree(this.pid)
    return this.done
  }

  /** Falha antes do imapsync rodar (exe ausente etc.): termina com erro e mensagem. */
  fail(err: unknown): void {
    if (this.state === 'finished') return
    this.error = err instanceof Error ? err.message : String(err)
    this.close()
  }

  get scope(): JobScope {
    return this.options.scope ?? 'single'
  }

  get status(): JobStatus {
    if (this.state !== 'finished') return this.state
    if (this.stoppedByUser) return 'stopped'
    if (this.error !== null || this.exitCode === null) return 'error'
    return describeExit(this.exitCode, this.progress.summary.exitName).status
  }

  snapshot(): JobSnapshot {
    const { percentMessages, percentBytes } = derive(this.progress)
    const a = this.account
    return {
      id: this.id,
      accountId: a.id,
      label: a.label,
      sourceHost: a.source.host,
      sourceUser: a.source.user,
      destHost: a.dest.host,
      destUser: a.dest.user,
      mode: this.mode,
      scope: this.scope,
      state: this.state,
      status: this.status,
      progress: this.progress,
      percentMessages,
      percentBytes,
      series: [...this.series],
      exitCode: this.exitCode,
      stoppedByUser: this.stoppedByUser,
      error: this.error,
      queuedAt: this.queuedAt,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      logPath: this.startedAt === null ? null : this.options.logPath,
    }
  }

  private handleLine(raw: string): void {
    let line = raw.length > LINE_MAX ? raw.slice(0, LINE_MAX) + ' …' : raw
    // defesa extra: com --debugimap nos extras o imapsync pode ecoar o LOGIN
    for (const secret of this.masks) line = line.replaceAll(secret, 'MASKED')
    this.logTail.push(line)
    if (this.logTail.length > LOG_TAIL_MAX)
      this.logTail.splice(0, this.logTail.length - LOG_TAIL_MAX)
    this.pendingLog.push(line)

    const parsed = classifyLine(line)
    if (parsed) this.progress = applyLine(this.progress, parsed)
    this.scheduleEmit()
  }

  private finish(code: number | null): void {
    if (this.state === 'finished') return
    this.exitCode = this.progress.exitCode ?? code
    this.close()
  }

  private close(): void {
    try {
      rmSync(this.options.pidfile, { force: true })
    } catch {
      // pidfile preso não impede o fim do job
    }
    if (this.sampleTimer) clearInterval(this.sampleTimer)
    this.sampleTimer = null
    this.child = null
    if (this.pid !== null) removeParTemp(this.options.tempDir ?? tmpdir(), this.pid)
    this.state = 'finished'
    this.finishedAt = Date.now()
    if (this.startedAt !== null) this.sample()
    this.emitNow()
    this.resolveDone()
  }

  private onSampleTick(): void {
    this.sampleTick++
    if (this.sampleTick % this.sampleEvery === 0) this.sample()
  }

  private sample(): void {
    const { percentMessages, percentBytes } = derive(this.progress)
    this.series.push({
      t: Date.now(),
      percentMessages,
      percentBytes,
      bytesSent: this.progress.bytesSent,
    })
    if (this.series.length > SERIES_MAX) {
      // metade dos pontos e metade da frequência: a série cobre o job inteiro com espaçamento igual
      this.series = this.series.filter((_, i) => i % 2 === 0)
      this.sampleEvery *= 2
    }
  }

  private scheduleEmit(): void {
    if (this.emitTimer) return
    const wait = Math.max(0, this.lastEmit + this.throttleMs - Date.now())
    this.emitTimer = setTimeout(() => this.emitNow(), wait)
  }

  private emitNow(): void {
    if (this.emitTimer) clearTimeout(this.emitTimer)
    this.emitTimer = null
    this.lastEmit = Date.now()
    if (this.pendingLog.length > 0) {
      const lines = this.pendingLog
      this.pendingLog = []
      this.events.log(this.id, lines)
    }
    this.events.change(this.snapshot())
  }
}
