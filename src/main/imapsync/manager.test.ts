import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { describeExit } from '@shared/exitCodes'
import { defaultMigrationOptions, type Account, type Endpoint } from '@shared/model'
import { splitArgs } from './args'
import { Job, logFileName } from './job'
import { JobManager } from './manager'

const root = resolve(__dirname, '../../..')
const fake = join(root, 'test/fixtures/fake-imapsync.mjs')
const SECRETS = { password1: 'origem-segredo-123', password2: 'destino-segredo-456' }

/**
 * Opções do exe falso: vão nos argumentos extras, que entram no fim da linha de comando.
 * Sem `--delay` a saída sai de uma vez (o timer do Windows tem ~15 ms de resolução).
 */
function fakeArgs(file: string, extra = '--delay 0'): string {
  return `--fixture "${join(root, 'test', 'fixtures', 'imapsync', file)}" ${extra}`
}

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'migramail-test-'))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function endpoint(host: string, user: string): Endpoint {
  return {
    profileId: null,
    host,
    port: 993,
    security: 'ssl',
    preset: 'none',
    allowInvalidCert: false,
    user,
    rememberPassword: false,
  }
}

function account(id: string, extraArgs: string, host = 'imap.origem.test'): Account {
  return {
    id,
    label: `Conta ${id}`,
    source: endpoint(host, `${id}@origem.test`),
    dest: endpoint('imap.destino.test', `${id}@destino.test`),
    options: { ...defaultMigrationOptions, extraArgs },
  }
}

function createManager(parallelism: number): JobManager {
  return new JobManager({
    parallelism,
    command: () => ({ file: process.execPath, prefixArgs: [fake] }),
    jobPaths: (jobId) => ({
      pidfile: join(tmp, 'run', `${jobId}.pid`),
      logdir: join(tmp, 'logs'),
      logfile: `${jobId}.txt`,
    }),
    throttleMs: 20,
    sampleMs: 50,
  })
}

async function waitAll(m: JobManager, ids: string[]): Promise<void> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (m.list().every((s) => !ids.includes(s.id) || s.state === 'finished')) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('jobs não terminaram')
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('JobManager com exe falso', () => {
  it('nunca roda mais jobs que o paralelismo', async () => {
    const m = createManager(2)
    let maxRunning = 0
    m.onChange(() => {
      const running = m.list().filter((s) => s.state === 'running' || s.state === 'stopping')
      maxRunning = Math.max(maxRunning, running.length)
    })
    const ids = [1, 2, 3, 4, 5].map((n) =>
      m.enqueue(account(`a${n}`, fakeArgs('run_badauth.txt')), 'migrate', SECRETS, [], 'batch'),
    )
    expect(m.list().filter((s) => s.state === 'running')).toHaveLength(2)
    await waitAll(m, ids)
    expect(maxRunning).toBe(2)
    expect(m.batchSummary().counts.error).toBe(5)
    expect(m.hasRunning()).toBe(false)
  })

  it('reproduz a cópia real e chega a 100%', async () => {
    const m = createManager(1)
    const id = m.enqueue(account('c', fakeArgs('run_copy.txt')), 'migrate', SECRETS, [], 'batch')
    await waitAll(m, [id])
    const s = m.list()[0]!
    expect(s.status).toBe('ok')
    expect(s.exitCode).toBe(0)
    expect(s.progress.msgsCopied).toBe(8)
    expect(s.progress.bytesSent).toBe(169494)
    expect(s.percentMessages).toBe(100)
    expect(s.series.length).toBeGreaterThanOrEqual(2)
    expect(s.series.at(-1)?.percentMessages).toBe(100)
    expect(m.batchSummary().percentMessages).toBe(100)
    expect(m.logTail(id)).toContain('IMAPSYNC_PASSWORD1 MASKED')
  })

  it('lote: soma só os jobs do lote, fica o job mais novo de cada conta e remove', async () => {
    const m = createManager(2)
    const removed: string[] = []
    m.onRemove((jobId) => removed.push(jobId))
    const single = m.enqueue(account('u', fakeArgs('run_badauth.txt')), 'login', SECRETS)
    const first = m.enqueue(
      account('b', fakeArgs('run_badauth.txt')),
      'login',
      SECRETS,
      [],
      'batch',
    )
    await waitAll(m, [single, first])
    expect(m.list().find((s) => s.id === first)?.scope).toBe('batch')
    expect(m.batchSummary().total).toBe(1)
    expect(m.batchSummary().counts.error).toBe(1)

    // a mesma conta de novo: o job terminado sai da lista
    const second = m.enqueue(
      account('b', fakeArgs('run_copy.txt')),
      'migrate',
      SECRETS,
      [],
      'batch',
    )
    expect(removed).toEqual([first])
    await waitAll(m, [second])
    expect(m.batchSummary().counts.ok).toBe(1)
    expect(m.batchSummary().series.at(-1)?.percentMessages).toBe(100)

    m.remove(second)
    expect(removed).toEqual([first, second])
    expect(m.batchSummary().total).toBe(0)
    expect(m.list().map((s) => s.id)).toEqual([single])
  })

  it('% do lote é a média das contas: a da fila conta 0, a terminada 100', async () => {
    const m = createManager(1)
    const a = m.enqueue(account('m', fakeArgs('run_copy.txt')), 'migrate', SECRETS, [], 'batch')
    m.enqueue(account('n', fakeArgs('run_copy.txt', '--delay 50')), 'migrate', SECRETS, [], 'batch')
    await waitAll(m, [a])
    expect(m.batchSummary().percentMessages).toBeGreaterThanOrEqual(50)
    expect(m.batchSummary().percentMessages).toBeLessThan(100)
    await m.stopAll()
    // login/medição não entram na média
    const only = createManager(1)
    const l = only.enqueue(account('l', fakeArgs('run_badauth.txt')), 'login', SECRETS, [], 'batch')
    await waitAll(only, [l])
    expect(only.batchSummary().percentMessages).toBeNull()
  })

  it('stopAll para o job em andamento (Parado) e cancela a fila', async () => {
    const m = createManager(1)
    const id = m.enqueue(account('s', fakeArgs('run_copy.txt', '--delay 50')), 'migrate', SECRETS)
    const queued = m.enqueue(account('q', fakeArgs('run_copy.txt')), 'migrate', SECRETS)
    await sleep(300)
    expect(m.list()[0]?.state).toBe('running')
    expect(await m.stopAll()).toBe(true)
    const [stopped, cancelled] = m.list()
    expect(stopped?.id).toBe(id)
    expect(stopped?.status).toBe('stopped')
    expect(stopped?.stoppedByUser).toBe(true)
    expect(cancelled?.id).toBe(queued)
    expect(cancelled?.status).toBe('stopped')
    expect(cancelled?.startedAt).toBeNull()
  })

  it('o processo parado não fica vivo', async () => {
    const m = createManager(1)
    const id = m.enqueue(account('k', fakeArgs('run_copy.txt', '--delay 50')), 'migrate', SECRETS)
    await sleep(300)
    const entries = (m as unknown as { entries: Map<string, { job: { pid: number | null } }> })
      .entries
    const pid = entries.get(id)!.job.pid
    expect(pid).not.toBeNull()
    await m.stop(id)
    expect(() => process.kill(pid!, 0)).toThrow()
  })

  it('senhas vão pelo env, nunca nos args, no log nem no snapshot', async () => {
    const m = createManager(1)
    const report = join(tmp, 'report.json')
    const id = m.enqueue(
      account('p', fakeArgs('run_badauth.txt', `--delay 0 --report "${report}" --leak`)),
      'migrate',
      SECRETS,
    )
    await waitAll(m, [id])
    const r = JSON.parse(readFileSync(report, 'utf8')) as {
      argv: string[]
      env: { password1: string; password2: string }
    }
    expect(r.env).toEqual(SECRETS)
    expect(r.argv.join(' ')).not.toContain(SECRETS.password1)
    expect(r.argv.join(' ')).not.toContain(SECRETS.password2)
    expect(r.argv).toContain('--sslargs1')

    const tail = m.logTail(id)
    expect(tail).toContain('DEBUG LOGIN test1 MASKED')
    const everything = JSON.stringify({ list: m.list(), tail, summary: m.batchSummary() })
    expect(everything).not.toContain(SECRETS.password1)
    expect(everything).not.toContain(SECRETS.password2)
  })

  it('job 161 termina com erro traduzido', async () => {
    const m = createManager(1)
    const id = m.enqueue(account('e', fakeArgs('run_badauth.txt')), 'login', SECRETS)
    await waitAll(m, [id])
    const s = m.list()[0]!
    expect(s.exitCode).toBe(161)
    expect(s.status).toBe('error')
    expect(describeExit(s.exitCode!).title).toBe('Falha de login na origem')
  })

  it('recusa conta já em andamento e extras proibidos', async () => {
    const m = createManager(1)
    const a = account('d', fakeArgs('run_badauth.txt'))
    const id = m.enqueue(a, 'migrate', SECRETS)
    expect(() => m.enqueue(a, 'migrate', SECRETS)).toThrow('Esta conta já está em andamento.')
    expect(() => m.enqueue(account('x', '--password1 abc'), 'migrate', SECRETS)).toThrow(
      /--password1/,
    )
    // vale também para os extras do perfil
    expect(() =>
      m.enqueue(account('y', ''), 'migrate', SECRETS, ['--debugimap --showpasswords']),
    ).toThrow(/--showpasswords/)
    await waitAll(m, [id])
  })

  it('retry roda de novo com a mesma conta e troca o job antigo', async () => {
    const m = createManager(1)
    const removed: string[] = []
    m.onRemove((jobId) => removed.push(jobId))
    const first = m.enqueue(account('r', fakeArgs('run_badauth.txt')), 'migrate', SECRETS)
    expect(() => m.retry(first)).toThrow('ainda está em andamento')
    await waitAll(m, [first])
    const second = m.retry(first)
    expect(removed).toEqual([first])
    expect(m.list().map((s) => s.id)).toEqual([second])
    await waitAll(m, [second])
    expect(m.list()[0]?.exitCode).toBe(161)
  })

  it('exe ausente termina o job com erro, sem travar a fila', async () => {
    let calls = 0
    const m = new JobManager({
      parallelism: 1,
      command: () => {
        if (calls++ === 0) throw new Error('imapsync.exe não encontrado')
        return { file: process.execPath, prefixArgs: [fake] }
      },
      jobPaths: (jobId) => ({ pidfile: join(tmp, `${jobId}.pid`), logdir: tmp, logfile: 'x.txt' }),
      throttleMs: 20,
    })
    const a = m.enqueue(account('m1', fakeArgs('run_badauth.txt')), 'login', SECRETS)
    const b = m.enqueue(account('m2', fakeArgs('run_badauth.txt')), 'login', SECRETS)
    await waitAll(m, [a, b])
    const [sa, sb] = m.list()
    expect(sa?.status).toBe('error')
    expect(sa?.error).toBe('imapsync.exe não encontrado')
    expect(sb?.exitCode).toBe(161)
  })

  it('avisa quando mais de 3 jobs rodam no mesmo host', async () => {
    const m = createManager(5)
    const ids = [1, 2, 3, 4].map((n) =>
      m.enqueue(
        account(`h${n}`, fakeArgs('run_copy.txt', '--delay 20'), 'IMAP.Shared.test'),
        'migrate',
        SECRETS,
      ),
    )
    expect(m.concurrencyWarnings()).toEqual([
      { host: 'imap.shared.test', count: 4 },
      { host: 'imap.destino.test', count: 4 },
    ])
    await m.stopAll()
    expect(m.concurrencyWarnings()).toEqual([])
    await waitAll(m, ids)
  })
})

describe('logFileName', () => {
  it('limpa o nome e leva data e id curto', () => {
    const date = new Date(2026, 9, 27, 8, 5, 9)
    expect(logFileName('joão.silva@empresa.com.br / caixa', date, 'abcdef12-3456')).toBe(
      'joão.silva@empresa.com.br_caixa_20261027-080509_abcdef12.txt',
    )
  })
})

describe('Job parado', () => {
  it('apaga a pasta temp-<pid> que o exe deixa no TEMP', async () => {
    const job = new Job(
      'j1',
      account('t', fakeArgs('run_copy.txt', '--delay 50')),
      'migrate',
      { pidfile: join(tmp, 'j1.pid'), logPath: join(tmp, 'j1.txt'), tempDir: tmp },
      { change: () => {}, log: () => {} },
    )
    job.start(
      process.execPath,
      [fake, ...splitArgs(fakeArgs('run_copy.txt', '--delay 50'))],
      process.env,
    )
    const parTemp = join(tmp, 'par-usuario', `temp-${job.pid}`)
    mkdirSync(parTemp, { recursive: true })
    writeFileSync(join(parTemp, 'perl.dll'), 'x')
    const other = join(tmp, 'par-usuario', 'temp-1')
    mkdirSync(other)
    await sleep(200)
    await job.stop()
    await sleep(300)
    expect(job.status).toBe('stopped')
    expect(existsSync(parTemp)).toBe(false)
    expect(existsSync(other)).toBe(true)
  })
})
