import type * as ExtraArgsModule from '@shared/extraArgs'
vi.mock('@shared/extraArgs', async (original) => {
  const actual = await original<typeof ExtraArgsModule>()
  return {
    ...actual,
    checkExtraArgs: (tokens: string[]) => {
      const clean: string[] = []
      for (let i = 0; i < tokens.length; i++) {
        if (['--fixture', '--delay', '--report'].includes(tokens[i]!)) {
          i++
          continue
        }
        if (tokens[i] === '--leak') continue
        clean.push(tokens[i]!)
      }
      return actual.checkExtraArgs(clean)
    },
  }
})
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultMigrationOptions, type Account, type JobSnapshot } from '@shared/model'
import { JobManager } from '../imapsync/manager'

// IPC das contas e dos jobs ponta a ponta no main, com o exe falso no lugar do imapsync.

type RawHandler = (event: unknown, payload: unknown) => Promise<unknown>
const handlers = new Map<string, RawHandler>()
const send = vi.fn()
const paths = { userData: '' }
const xor = (b: Buffer): Buffer => Buffer.from(b.map((x) => x ^ 0x5a))

vi.mock('electron', () => ({
  app: {
    getPath: () => paths.userData,
    getName: () => 'MigraMail',
    getVersion: () => '0.1.0',
    isPackaged: false,
  },
  ipcMain: {
    handle: (channel: string, fn: RawHandler) => handlers.set(channel, fn),
    removeHandler: (channel: string) => handlers.delete(channel),
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (v: string) => xor(Buffer.from(v, 'utf8')),
    decryptString: (b: Buffer) => xor(b).toString('utf8'),
  },
  shell: { showItemInFolder: vi.fn() },
  dialog: {},
}))

vi.mock('../logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

vi.mock('../windows', () => ({
  isAppUrl: (url: string) => url.startsWith('file:///app/'),
  getMainWindow: () => ({ webContents: { send } }),
}))

const root = resolve(__dirname, '../../..')
const fake = join(root, 'test/fixtures/fake-imapsync.mjs')
const holder: { manager: JobManager | null } = { manager: null }

vi.mock('../imapsync/instance', () => ({ getJobManager: () => holder.manager }))

const { registerIpc } = await import('./register')

const PW1 = 'origem-segredo-123'
const PW2 = 'destino-segredo-456'

const fromApp = { senderFrame: { url: 'file:///app/index.html' } }
const call = (channel: string, payload?: unknown) => handlers.get(channel)!(fromApp, payload)

beforeEach(() => {
  paths.userData = mkdtempSync(join(tmpdir(), 'migramail-jobs-'))
  holder.manager = new JobManager({
    parallelism: 2,
    command: () => ({ file: process.execPath, prefixArgs: [fake] }),
    jobPaths: (jobId) => ({
      pidfile: join(paths.userData, 'run', `${jobId}.pid`),
      logdir: join(paths.userData, 'logs'),
      logfile: `${jobId}.txt`,
    }),
    throttleMs: 20,
    sampleMs: 50,
  })
  handlers.clear()
  send.mockClear()
  registerIpc()
})
afterEach(() => {
  rmSync(paths.userData, { recursive: true, force: true })
})

const report = (): string => join(paths.userData, 'report.json')

function account(id: string, remember: boolean): Account {
  const endpoint = (host: string, user: string) => ({
    profileId: null,
    host,
    port: 993,
    security: 'ssl' as const,
    preset: 'none' as const,
    allowInvalidCert: false,
    user,
    rememberPassword: remember,
  })
  return {
    id,
    label: `Conta ${id}`,
    source: endpoint('imap.origem.test', 'ana@origem.test'),
    dest: endpoint('imap.destino.test', 'ana@destino.test'),
    options: {
      ...defaultMigrationOptions,
      extraArgs: `--fixture "${join(root, 'test', 'fixtures', 'imapsync', 'run_copy.txt')}" --delay 0 --report "${report()}"`,
    },
  }
}

async function waitFinished(jobId: string): Promise<JobSnapshot> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const res = (await call('jobs:list')) as { data: JobSnapshot[] }
    const s = res.data.find((x) => x.id === jobId)
    if (s?.state === 'finished') {
      await new Promise((r) => setTimeout(r, 150)) // último jobs:changed
      return s
    }
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('job não terminou')
}

const envSeen = (): { password1: string; password2: string } =>
  (JSON.parse(readFileSync(report(), 'utf8')) as { env: { password1: string; password2: string } })
    .env

/** Tudo que está em disco no userData, concatenado. */
function allFiles(dir = paths.userData): string {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.name !== 'report.json')
    .map((e) =>
      e.isDirectory() ? allFiles(join(dir, e.name)) : readFileSync(join(dir, e.name), 'utf8'),
    )
    .join('\n')
}

describe('jobs:start', () => {
  it('sem senha digitada nem lembrada: pede a da origem e depois a do destino', async () => {
    expect(await call('jobs:start', { account: account('a', false), mode: 'login' })).toEqual({
      ok: false,
      code: 'missing_password',
      message: 'Informe a senha da origem.',
    })
    expect(
      await call('jobs:start', { account: account('a', false), mode: 'login', password1: PW1 }),
    ).toMatchObject({ ok: false, message: 'Informe a senha do destino.' })
  })

  it('nada do que vai ao renderer nem ao disco tem senha', async () => {
    await call('accounts:save', { single: account('a', true), batch: [] })
    const res = (await call('jobs:start', {
      account: account('a', true),
      mode: 'migrate',
      password1: PW1,
      password2: PW2,
    })) as { ok: true; data: { jobId: string; warnings: string[] } }
    expect(res.ok).toBe(true)
    const snapshot = await waitFinished(res.data.jobId)
    expect(snapshot.status).toBe('ok')
    expect(envSeen()).toEqual({ password1: PW1, password2: PW2 })

    const list = await call('jobs:list')
    const log = await call('jobs:log', { jobId: res.data.jobId })
    const loaded = await call('accounts:load')
    const toRenderer = JSON.stringify([res, list, log, loaded, send.mock.calls])
    expect(send.mock.calls.some(([event]) => event === 'jobs:changed')).toBe(true)
    expect(send.mock.calls.some(([event]) => event === 'jobs:log')).toBe(true)
    for (const pw of [PW1, PW2]) {
      expect(toRenderer).not.toContain(pw)
      expect(allFiles()).not.toContain(pw)
    }
    expect(loaded).toMatchObject({ data: { savedPasswords: { a: { source: true, dest: true } } } })
  })

  it('senha em branco usa a lembrada; desmarcar "lembrar" apaga', async () => {
    await call('accounts:save', { single: account('a', true), batch: [] })
    const first = (await call('jobs:start', {
      account: account('a', true),
      mode: 'login',
      password1: PW1,
      password2: PW2,
    })) as { data: { jobId: string } }
    await waitFinished(first.data.jobId)

    const second = (await call('jobs:start', {
      account: account('a', true),
      mode: 'login',
      password1: '',
    })) as { data: { jobId: string } }
    await waitFinished(second.data.jobId)
    expect(envSeen()).toEqual({ password1: PW1, password2: PW2 })

    const third = (await call('jobs:start', {
      account: account('a', false),
      mode: 'login',
      password1: 'outra-1',
      password2: 'outra-2',
    })) as { data: { jobId: string } }
    await waitFinished(third.data.jobId)
    expect(await call('accounts:load')).toMatchObject({
      data: { savedPasswords: { a: { source: false, dest: false } } },
    })
  })

  it('extras do perfil entram no comando e avisos de extras arriscados voltam', async () => {
    const profile = (await call('profiles:save', {
      name: 'Teste',
      host: 'imap.perfil.test',
      port: 993,
      security: 'ssl',
      preset: 'none',
      allowInvalidCert: false,
      extraArgs: '--nofoldersizes',
    })) as { data: { id: string } }
    const a = account('a', false)
    a.source.profileId = profile.data.id
    a.dest.profileId = profile.data.id
    const res = (await call('jobs:start', {
      account: a,
      mode: 'dry',
      password1: PW1,
      password2: PW2,
    })) as { data: { jobId: string; warnings: string[] } }
    expect(res.data.warnings).toEqual([])
    await waitFinished(res.data.jobId)
    const argv = (JSON.parse(readFileSync(report(), 'utf8')) as { argv: string[] }).argv
    expect(argv.filter((x) => x === '--nofoldersizes')).toHaveLength(1)
    // host vem do perfil, não do que o renderer mandou
    expect(argv[argv.indexOf('--host1') + 1]).toBe('imap.perfil.test')
  })

  it('jobs:retry troca o job e avisa jobs:removed; openLog sem job dá erro claro', async () => {
    const res = (await call('jobs:start', {
      account: account('a', false),
      mode: 'login',
      password1: PW1,
      password2: PW2,
    })) as { data: { jobId: string } }
    await waitFinished(res.data.jobId)
    const retry = (await call('jobs:retry', { jobId: res.data.jobId })) as {
      data: { jobId: string }
    }
    expect(retry.data.jobId).not.toBe(res.data.jobId)
    expect(send).toHaveBeenCalledWith('jobs:removed', { jobId: res.data.jobId })
    await waitFinished(retry.data.jobId)
    expect(envSeen()).toEqual({ password1: PW1, password2: PW2 })
    expect(await call('jobs:openLog', { jobId: 'nao-existe' })).toMatchObject({
      ok: false,
      message: 'Migração não encontrada.',
    })
  })
})

describe('jobs do lote', () => {
  it('jobs:start com scope batch entra no resumo; jobs:remove tira; nada leva senha', async () => {
    const res = (await call('jobs:start', {
      account: account('a', false),
      mode: 'login',
      password1: PW1,
      password2: PW2,
      scope: 'batch',
    })) as { data: { jobId: string } }
    await call('jobs:start', {
      account: account('s', false),
      mode: 'login',
      password1: PW1,
      password2: PW2,
    })
    await waitFinished(res.data.jobId)
    const summary = (await call('jobs:batchSummary')) as { data: { total: number } }
    expect(summary.data.total).toBe(1)

    // o evento jobs:batch chega depois de até 1 s
    await new Promise((r) => setTimeout(r, 1100))
    const batchEvents = send.mock.calls.filter(([name]) => name === 'jobs:batch')
    expect(batchEvents.length).toBeGreaterThan(0)
    const everything = JSON.stringify(send.mock.calls)
    expect(everything).not.toContain(PW1)
    expect(everything).not.toContain(PW2)

    expect(await call('jobs:remove', { jobId: res.data.jobId })).toMatchObject({ ok: true })
    expect(send).toHaveBeenCalledWith('jobs:removed', { jobId: res.data.jobId })
    expect(await call('jobs:batchSummary')).toMatchObject({ data: { total: 0 } })
  })
})

describe('accounts', () => {
  it('accounts:save lembra senhas, apaga as de contas removidas e não grava senha em JSON', async () => {
    const withExtra = { ...account('a', true), password1: PW1 }
    const saved = await call('accounts:save', {
      single: withExtra,
      batch: [account('b', true)],
      passwords: [
        { accountId: 'a', password1: PW1, password2: PW2 },
        { accountId: 'b', password1: PW1 },
      ],
    })
    expect(saved).toMatchObject({
      ok: true,
      data: {
        savedPasswords: { a: { source: true, dest: true }, b: { source: true, dest: false } },
      },
    })
    for (const name of ['accounts.json', 'secrets.json']) {
      const text = readFileSync(join(paths.userData, name), 'utf8')
      expect(text).not.toContain(PW1)
      expect(text).not.toContain(PW2)
    }
    const secrets = JSON.parse(
      readFileSync(join(paths.userData, 'secrets.json'), 'utf8'),
    ) as Record<string, string>
    expect(Object.keys(secrets).sort()).toEqual(['pw:a:1', 'pw:a:2', 'pw:b:1'])
    for (const v of Object.values(secrets)) expect(v).toMatch(/^[A-Za-z0-9+/]+=*$/)

    await call('accounts:save', { single: account('a', true), batch: [] })
    expect(
      Object.keys(JSON.parse(readFileSync(join(paths.userData, 'secrets.json'), 'utf8')) as object),
    ).toEqual(['pw:a:1', 'pw:a:2'])
  })

  it('importCsv lê UTF-8 e ANSI do Excel e recusa extensão errada', async () => {
    const utf8 = join(paths.userData, 'contas.csv')
    writeFileSync(utf8, 'imap.a.test;joão@a.test;s1;imap.b.test;joão@b.test;s2;\n')
    expect(await call('accounts:importCsv', { path: utf8 })).toMatchObject({
      ok: true,
      data: { rows: [{ source: { user: 'joão@a.test' }, password1: 's1' }], errors: [] },
    })
    const ansi = join(paths.userData, 'ansi.txt')
    writeFileSync(
      ansi,
      Buffer.from('imap.a.test;jo\xe3o@a.test;s1;imap.b.test;b@b.test;s2;\n', 'latin1'),
    )
    expect(await call('accounts:importCsv', { path: ansi })).toMatchObject({
      data: { rows: [{ source: { user: 'joão@a.test' } }] },
    })
    expect(await call('accounts:importCsv', { path: join(paths.userData, 'x.exe') })).toMatchObject(
      {
        ok: false,
        message: 'Escolha um arquivo .csv ou .txt.',
      },
    )
    expect(existsSync(join(paths.userData, 'x.exe'))).toBe(false)
  })
})

describe('accounts:importCsv com os fixtures (test/fixtures)', () => {
  const fixture = async (name: string) =>
    (
      (await call('accounts:importCsv', { path: join(root, 'test/fixtures', name) })) as {
        data: { rows: Record<string, unknown>[]; errors: unknown[] }
      }
    ).data

  it('file.txt no formato oficial: 4 contas, comentários e linhas vazias ignorados', async () => {
    const { rows, errors } = await fixture('file.txt')
    expect(errors).toEqual([])
    expect(rows.map((r) => (r['source'] as { host: string }).host)).toEqual([
      'host001_1',
      'host002_1',
      'host003_1',
      'test1.lamiral.info',
    ])
    expect(rows[3]).toMatchObject({ password1: 'secret1', password2: 'secret2', extraArgs: '' })
  })

  it('CSV com cabeçalho: aspas, acento, porta 143, senha vazia e linha quebrada', async () => {
    const { rows, errors } = await fixture('contas.csv')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      source: { host: 'imap.gmail.com', user: 'joão@cliente.com.br' },
      password1: 'se,nha',
      extraArgs: '--subfolder2 Migrado',
    })
    expect(rows[1]).toMatchObject({
      source: { host: 'mail.antigo.com.br', port: 143, security: 'tls' },
      password1: '',
    })
    expect(errors).toEqual([{ line: 4, message: expect.stringMatching(/faltam colunas/) }])
  })
})

describe('paralelismo escolhido no lote', () => {
  it('reconcilia o limite salvo antes de enfileirar outra conta', async () => {
    holder.manager!.setParallelism(1)
    await call('settings:update', { parallelism: 2 })
    const first = await call('jobs:start', {
      account: account('parallel-a', false),
      mode: 'migrate',
      password1: PW1,
      password2: PW2,
    })
    const second = await call('jobs:start', {
      account: account('parallel-b', false),
      mode: 'migrate',
      password1: PW1,
      password2: PW2,
    })
    try {
      expect(first).toMatchObject({ ok: true })
      expect(second).toMatchObject({ ok: true })
      expect(holder.manager!.list().filter((j) => j.state === 'running')).toHaveLength(2)
      expect(holder.manager!.list().every((j) => j.finishedAt === null)).toBe(true)
    } finally {
      await holder.manager!.stopAll()
    }
  })
})
