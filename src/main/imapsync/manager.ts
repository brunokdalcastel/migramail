// Fila de jobs do imapsync com paralelismo 1–5, parada, repetição e visão do lote.
// O comando e os caminhos vêm por injeção (instance.ts no app, exe falso nos testes).
// Sem electron: roda no Vitest.
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  HOST_CONCURRENCY_WARN,
  type Account,
  type BatchSummary,
  type JobMode,
  type JobScope,
  type JobSecrets,
  type JobSeriesPoint,
  type JobSnapshot,
  type JobStatus,
} from '@shared/model'
import { UserError } from '../errors'
import { buildArgs, buildEnv, checkExtraArgs, splitArgs, type JobFilePaths } from './args'
import { Job, SERIES_MAX, type KillTree } from './job'

export const PARALLELISM_MIN = 1
export const PARALLELISM_MAX = 5
export { HOST_CONCURRENCY_WARN }

export interface SpawnCommand {
  file: string
  prefixArgs: string[]
}

export interface JobManagerOptions {
  parallelism: number
  /** Resolvido a cada início: o exe pode faltar (lança UserError) sem derrubar o manager. */
  command: () => SpawnCommand
  jobPaths: (jobId: string, account: Account) => JobFilePaths
  throttleMs?: number
  sampleMs?: number
  killTree?: KillTree
  /** Só ids, modos, códigos e tempos (regra do logger.ts). */
  log?: (message: string) => void
}

interface Entry {
  job: Job
  secrets: JobSecrets
  profileExtraArgs: string[]
}

const ACTIVE: ReadonlySet<JobStatus> = new Set(['queued', 'running', 'stopping'])

function clampParallelism(n: number): number {
  return Math.min(PARALLELISM_MAX, Math.max(PARALLELISM_MIN, Math.round(n)))
}

export class JobManager {
  private parallelism: number
  /** Map mantém a ordem de inserção: é a fila FIFO. */
  private readonly entries = new Map<string, Entry>()
  private readonly changeListeners = new Set<(snapshot: JobSnapshot) => void>()
  private readonly logListeners = new Set<(jobId: string, lines: string[]) => void>()
  private readonly removeListeners = new Set<(jobId: string) => void>()
  private series: JobSeriesPoint[] = []
  private sampleEvery = 1
  private sampleTick = 0
  private sampleTimer: NodeJS.Timeout | null = null

  constructor(private readonly options: JobManagerOptions) {
    this.parallelism = clampParallelism(options.parallelism)
  }

  onChange(listener: (snapshot: JobSnapshot) => void): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  onLog(listener: (jobId: string, lines: string[]) => void): () => void {
    this.logListeners.add(listener)
    return () => this.logListeners.delete(listener)
  }

  /** Job tirado da lista: trocado por um novo da mesma conta, ou removido (`remove`). */
  onRemove(listener: (jobId: string) => void): () => void {
    this.removeListeners.add(listener)
    return () => this.removeListeners.delete(listener)
  }

  setParallelism(n: number): void {
    this.parallelism = clampParallelism(n)
    this.pump()
  }

  /**
   * Põe a conta na fila. Recusa extras proibidos (senha na linha de comando, caminhos do app)
   * e conta que já tem job ativo. As senhas ficam só nesta memória, para o retry. O job
   * terminado anterior da mesma conta sai da lista: fica só o mais recente de cada conta.
   */
  enqueue(
    account: Account,
    mode: JobMode,
    secrets: JobSecrets,
    profileExtraArgs: string[] = [],
    scope: JobScope = 'single',
  ): string {
    const tokens = [...profileExtraArgs, account.options.extraArgs].flatMap(splitArgs)
    const { errors } = checkExtraArgs(tokens)
    if (errors.length > 0) throw new UserError(errors.join(' '))
    if (this.activeJobFor(account.id)) throw new UserError('Esta conta já está em andamento.')

    for (const [oldId, entry] of this.entries) {
      if (entry.job.account.id === account.id) this.drop(oldId)
    }
    // lote parado começando de novo: o gráfico total recomeça do zero
    if (scope === 'batch' && this.batchEntries().every((e) => e.job.state === 'finished')) {
      this.series = []
      this.sampleEvery = 1
      this.sampleTick = 0
    }

    const id = randomUUID()
    const paths = this.options.jobPaths(id, account)
    const job = new Job(
      id,
      account,
      mode,
      {
        pidfile: paths.pidfile,
        scope,
        logPath: join(paths.logdir, paths.logfile),
        throttleMs: this.options.throttleMs,
        sampleMs: this.options.sampleMs,
        killTree: this.options.killTree,
      },
      {
        change: (snapshot) => this.emitChange(snapshot),
        log: (jobId, lines) => {
          for (const listener of this.logListeners) listener(jobId, lines)
        },
      },
    )
    this.entries.set(id, { job, secrets, profileExtraArgs })
    void job.done.then(() => this.onJobDone(job))
    this.emitChange(job.snapshot())
    this.options.log?.(`[jobs] ${id} na fila (${mode})`)
    this.pump()
    return id
  }

  async stop(jobId: string): Promise<void> {
    await this.get(jobId).job.stop()
  }

  /**
   * Cancela a fila e para os que rodam. Resolve `true` quando todos os processos saíram, ou
   * `false` se o prazo acabar antes.
   */
  async stopAll(timeoutMs = 5000): Promise<boolean> {
    const jobs = [...this.entries.values()].map((e) => e.job)
    // fila primeiro: um job que termina não pode puxar outro da fila durante a parada
    for (const job of jobs) if (job.state === 'queued') void job.stop()
    const all = Promise.all(jobs.map((job) => job.stop())).then(() => true)
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs)
    })
    const result = await Promise.race([all, timeout])
    clearTimeout(timer)
    return result
  }

  /** Roda de novo um job terminado, com a mesma conta, modo e senhas; troca o job antigo. */
  retry(jobId: string): string {
    const entry = this.get(jobId)
    if (entry.job.state !== 'finished')
      throw new UserError('Esta migração ainda está em andamento.')
    this.drop(jobId)
    const { job } = entry
    return this.enqueue(job.account, job.mode, entry.secrets, entry.profileExtraArgs, job.scope)
  }

  /** Tira da lista um job terminado (a linha saiu da tabela do lote). */
  remove(jobId: string): void {
    if (this.get(jobId).job.state !== 'finished')
      throw new UserError('Esta migração ainda está em andamento.')
    this.drop(jobId)
  }

  list(): JobSnapshot[] {
    return [...this.entries.values()].map((e) => e.job.snapshot())
  }

  /** Últimas linhas da saída do job (aba Log). */
  logTail(jobId: string): string[] {
    return [...this.get(jobId).job.logTail]
  }

  /** Jobs na fila, rodando ou parando. */
  activeCount(): number {
    return [...this.entries.values()].filter((e) => ACTIVE.has(e.job.status)).length
  }

  hasRunning(): boolean {
    return this.activeCount() > 0
  }

  /** Hosts com mais de 3 jobs rodando ao mesmo tempo (RF10). */
  concurrencyWarnings(): { host: string; count: number }[] {
    const counts = new Map<string, number>()
    for (const { job } of this.entries.values()) {
      if (job.state !== 'running' && job.state !== 'stopping') continue
      const hosts = new Set(
        [job.account.source.host, job.account.dest.host].map((h) => h.toLowerCase()),
      )
      for (const host of hosts) counts.set(host, (counts.get(host) ?? 0) + 1)
    }
    return [...counts]
      .filter(([, count]) => count > HOST_CONCURRENCY_WARN)
      .map(([host, count]) => ({ host, count }))
  }

  /** Só os jobs de "Várias contas". */
  batchSummary(): BatchSummary {
    const counts: Record<JobStatus, number> = {
      queued: 0,
      running: 0,
      stopping: 0,
      ok: 0,
      warning: 0,
      error: 0,
      stopped: 0,
    }
    const snapshots = this.batchEntries().map((e) => e.job.snapshot())
    for (const s of snapshots) counts[s.status]++
    return { counts, total: snapshots.length, ...this.overall(snapshots), series: [...this.series] }
  }

  /**
   * % do lote = média das contas que copiam (Simular/Migrar): a que ainda não chegou na cópia
   * conta 0 e a que terminou sem ser parada conta 100. Somar as mensagens só das contas já em
   * cópia fazia a % cair cada vez que uma conta da fila começava.
   */
  private overall(snapshots: JobSnapshot[]): Omit<JobSeriesPoint, 't'> {
    let bytesSent = 0
    let n = 0
    let sumMessages = 0
    let sumBytes = 0
    let anyBytes = false
    for (const s of snapshots) {
      bytesSent += s.progress.bytesSent
      if (s.mode !== 'dry' && s.mode !== 'migrate') continue
      n++
      const done = s.state === 'finished' && !s.stoppedByUser
      sumMessages += done ? 100 : (s.percentMessages ?? 0)
      if (s.percentBytes !== null) anyBytes = true
      sumBytes += done ? 100 : (s.percentBytes ?? s.percentMessages ?? 0)
    }
    return {
      percentMessages: n > 0 ? sumMessages / n : null,
      percentBytes: n > 0 && anyBytes ? sumBytes / n : null,
      bytesSent,
    }
  }

  private get(jobId: string): Entry {
    const entry = this.entries.get(jobId)
    if (!entry) throw new UserError('Migração não encontrada.')
    return entry
  }

  private drop(jobId: string): void {
    this.entries.delete(jobId)
    for (const listener of this.removeListeners) listener(jobId)
  }

  private batchEntries(): Entry[] {
    return [...this.entries.values()].filter((e) => e.job.scope === 'batch')
  }

  private activeJobFor(accountId: string): Job | undefined {
    for (const { job } of this.entries.values()) {
      if (job.account.id === accountId && job.state !== 'finished') return job
    }
    return undefined
  }

  private runningCount(entries: Iterable<Entry> = this.entries.values()): number {
    let n = 0
    for (const { job } of entries) {
      if (job.state === 'running' || job.state === 'stopping') n++
    }
    return n
  }

  /** Começa jobs da fila até o limite de paralelismo. */
  private pump(): void {
    for (const entry of this.entries.values()) {
      if (this.runningCount() >= this.parallelism) break
      if (entry.job.state === 'queued') this.startJob(entry)
    }
    this.updateSampling()
  }

  private startJob({ job, secrets, profileExtraArgs }: Entry): void {
    try {
      const command = this.options.command()
      const paths = this.options.jobPaths(job.id, job.account)
      mkdirSync(dirname(paths.pidfile), { recursive: true })
      mkdirSync(paths.logdir, { recursive: true })
      const args = buildArgs(job.account, job.mode, paths, profileExtraArgs)
      job.start(command.file, [...command.prefixArgs, ...args], buildEnv(secrets))
      this.options.log?.(`[jobs] ${job.id} iniciado (pid ${job.pid ?? '?'})`)
    } catch (err) {
      job.fail(err)
    }
  }

  private onJobDone(job: Job): void {
    const took =
      job.startedAt !== null ? `${Math.round((Date.now() - job.startedAt) / 1000)} s` : 'na fila'
    this.options.log?.(
      `[jobs] ${job.id} terminou: ${job.status} (código ${job.exitCode ?? '-'}, ${took})`,
    )
    this.pump()
  }

  private emitChange(snapshot: JobSnapshot): void {
    for (const listener of this.changeListeners) listener(snapshot)
  }

  /** Série do lote: amostra enquanto houver job do lote rodando, com a regra da série do job. */
  private updateSampling(): void {
    const batchRunning = (): boolean => this.runningCount(this.batchEntries()) > 0
    const running = batchRunning()
    if (running && !this.sampleTimer) {
      // sem amostra imediata: "Iniciar todas" põe as contas na fila uma a uma, e no 1º início
      // os jobs terminados das outras linhas (100%) ainda estão na lista
      this.sampleTimer = setInterval(() => {
        this.sampleTick++
        if (this.sampleTick % this.sampleEvery === 0) this.sample()
        if (!batchRunning()) this.updateSampling()
      }, this.options.sampleMs ?? 2000)
    } else if (!running && this.sampleTimer) {
      clearInterval(this.sampleTimer)
      this.sampleTimer = null
      this.sample()
    }
  }

  private sample(): void {
    const snapshots = this.batchEntries().map((e) => e.job.snapshot())
    this.series.push({ t: Date.now(), ...this.overall(snapshots) })
    if (this.series.length > SERIES_MAX) {
      this.series = this.series.filter((_, i) => i % 2 === 0)
      this.sampleEvery *= 2
    }
  }
}
