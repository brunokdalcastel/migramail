import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultMigrationOptions } from '@shared/model'

type RawHandler = (event: unknown, payload: unknown) => Promise<unknown>
const handlers = new Map<string, RawHandler>()
const send = vi.fn()
const paths = { userData: '' }

vi.mock('electron', () => ({
  app: {
    getPath: () => paths.userData,
    getName: () => 'MigraMail',
    getVersion: () => '0.1.0',
    isPackaged: false,
  },
  shell: { openPath: vi.fn(async () => ''), openExternal: vi.fn(async () => undefined) },
  ipcMain: {
    handle: (channel: string, fn: RawHandler) => handlers.set(channel, fn),
    removeHandler: (channel: string) => handlers.delete(channel),
  },
}))

vi.mock('../logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

vi.mock('../windows', () => ({
  isAppUrl: (url: string) => url.startsWith('file:///app/'),
  getMainWindow: () => ({ webContents: { send } }),
}))

const { handle, registerIpc } = await import('./register')
const { UserError } = await import('../errors')

const profile = {
  name: 'Perfil',
  host: 'imap.example.com',
  port: 993,
  security: 'ssl',
  preset: 'none',
  allowInvalidCert: false,
  extraArgs: '',
}

function account(source: { host?: string; user?: string }) {
  const endpoint = { ...profile, profileId: null, user: 'a@example.com', rememberPassword: false }
  return {
    id: 'a',
    label: '',
    source: { ...endpoint, ...source },
    dest: endpoint,
    options: defaultMigrationOptions,
  }
}

const fromApp = { senderFrame: { url: 'file:///app/index.html' } }
const call = (channel: string, payload: unknown, event: unknown = fromApp) =>
  handlers.get(channel)!(event, payload)

beforeEach(() => {
  paths.userData = mkdtempSync(join(tmpdir(), 'migramail-ipc-'))
  handlers.clear()
  send.mockClear()
  registerIpc()
})
afterEach(() => {
  rmSync(paths.userData, { recursive: true, force: true })
})

describe('IPC register', () => {
  it.each([
    ['settings:update', { parallelism: 9 }],
    ['settings:update', { parallelism: 2.5 }],
    ['settings:update', { lastMode: 'outro' }],
    ['settings:update', { senha: 'x' }],
    ['app:info', { qualquer: true }],
    ['profiles:save', { ...profile, port: 0 }],
    ['profiles:delete', { id: '' }],
    ['accounts:importCsv', { path: '' }],
    ['jobs:start', { account: account({ host: 'h'.repeat(254) }), mode: 'migrate' }],
    ['jobs:start', { account: account({ user: 'u'.repeat(321) }), mode: 'migrate' }],
    ['jobs:start', { account: account({}), mode: 'migrate', password1: 'p'.repeat(1025) }],
    ['jobs:start', { account: account({}), mode: 'apagar' }],
    ['jobs:stop', { jobId: 5 }],
  ])(
    'payload inválido em %s (%j) volta erro de validação sem chamar o handler',
    async (channel, bad) => {
      const fn = vi.fn()
      handle(channel as 'settings:update', fn)
      expect(await call(channel, bad)).toEqual({
        ok: false,
        code: 'invalid_payload',
        message: 'Dados inválidos na solicitação.',
      })
      expect(fn).not.toHaveBeenCalled()
    },
  )

  it('recusa remetente fora do app e frame que já não existe', async () => {
    expect(
      await call('settings:get', undefined, { senderFrame: { url: 'https://evil.example/' } }),
    ).toMatchObject({ ok: false, code: 'forbidden_sender' })
    expect(await call('settings:get', undefined, { senderFrame: null })).toMatchObject({
      ok: false,
      code: 'forbidden_sender',
    })
  })

  it('exceção comum vira internal sem vazar a mensagem', async () => {
    handle('settings:get', () => {
      throw new Error('segredo')
    })
    expect(await call('settings:get', undefined)).toEqual({
      ok: false,
      code: 'internal',
      message: 'Falha interna.',
    })
  })

  it('em dev, resposta fora do contrato vira invalid_response', async () => {
    handle('app:info', () => ({ name: 1 }) as never)
    expect(await call('app:info', undefined)).toMatchObject({ ok: false, code: 'invalid_response' })
  })

  it('UserError chega com código e mensagem em pt-BR', async () => {
    handle('settings:get', () => {
      throw new UserError('Esta conta já está em andamento', 'job_running')
    })
    expect(await call('settings:get', undefined)).toEqual({
      ok: false,
      code: 'job_running',
      message: 'Esta conta já está em andamento',
    })
  })
})

describe('canais da Fase 1', () => {
  it('app:info devolve nome e versão', async () => {
    expect(await call('app:info', undefined)).toMatchObject({
      ok: true,
      data: { name: 'MigraMail', version: '0.1.0' },
    })
  })

  it('settings:get começa nos padrões', async () => {
    expect(await call('settings:get', undefined)).toEqual({
      ok: true,
      data: { parallelism: 2, lastMode: 'single', showBytesPercent: true },
    })
  })

  it('settings:update salva, transmite settings:changed e mantém o resto', async () => {
    const res = (await call('settings:update', { parallelism: 4 })) as { data: unknown }
    expect(res).toEqual({
      ok: true,
      data: { parallelism: 4, lastMode: 'single', showBytesPercent: true },
    })
    expect(send).toHaveBeenCalledWith('settings:changed', res.data)
    expect(await call('settings:get', undefined)).toMatchObject({ data: { parallelism: 4 } })
  })
})
