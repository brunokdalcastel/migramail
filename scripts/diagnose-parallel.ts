import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defaultMigrationOptions, type Account } from '../src/shared/model'
import { JobManager } from '../src/main/imapsync/manager'

// Somente login das contas públicas do imapsync; não copia nem exclui mensagens.
const out = resolve(process.env['MIGRAMAIL_DIAGNOSTIC_DIR'] ?? '../parallel-diagnostic')
mkdirSync(out, { recursive: true })
const started = Date.now()
const events: unknown[] = []
const record = (event: object): void => {
  const entry = { elapsedMs: Date.now() - started, ...event }
  events.push(entry)
  console.log(JSON.stringify(entry))
}
const manager = new JobManager({
  parallelism: 2,
  command: () => ({ file: resolve('vendor/imapsync/imapsync.exe'), prefixArgs: [] }),
  jobPaths: (id) => ({ pidfile: join(out, `${id}.pid`), logdir: out, logfile: `${id}.txt` }),
  log: (message) => record({ message }),
})
const account = (id: string): Account => ({
  id,
  label: id,
  source: {
    profileId: null,
    host: 'test1.lamiral.info',
    port: 993,
    security: 'ssl',
    preset: 'none',
    user: 'test1',
    allowInvalidCert: false,
    rememberPassword: false,
  },
  dest: {
    profileId: null,
    host: 'test2.lamiral.info',
    port: 993,
    security: 'ssl',
    preset: 'none',
    user: 'test2',
    allowInvalidCert: true,
    rememberPassword: false,
  },
  options: { ...defaultMigrationOptions },
})
const firstOutput = new Set<string>()
manager.onLog((id, lines) => {
  if (!firstOutput.has(id)) {
    firstOutput.add(id)
    record({ id, phase: 'first-output' })
  }
  for (const line of lines) {
    if (/^Host[12]: success login|^Exiting with|^Host[12]: connecting/.test(line))
      record({ id, phase: line })
  }
})
async function main(): Promise<void> {
  const ids = ['parallel-a', 'parallel-b'].map((id) =>
    manager.enqueue(
      account(id),
      'login',
      { password1: 'secret1', password2: 'secret2' },
      [],
      'batch',
    ),
  )
  record({
    phase: 'enqueued',
    jobs: manager.list().map((j) => ({ id: j.id, state: j.state, startedAt: j.startedAt })),
  })
  const deadline = Date.now() + 150_000
  while (manager.hasRunning() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 500))
  if (manager.hasRunning()) {
    record({ phase: 'timeout' })
    await manager.stopAll()
  }
  const result = manager
    .list()
    .map((j) => ({
      id: j.id,
      accountId: j.accountId,
      state: j.state,
      status: j.status,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
      loggedIn: j.progress.loggedIn,
      exitCode: j.exitCode,
      error: j.error,
    }))
  record({ phase: 'result', jobs: result })
  writeFileSync(join(out, 'result.json'), JSON.stringify({ ids, events, jobs: result }, null, 2))
  if (result.some((j) => j.status !== 'ok')) process.exitCode = 1
}
void main()
