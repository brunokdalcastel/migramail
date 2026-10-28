import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BUILTIN_PROFILES,
  applyProfile,
  defaultMigrationOptions,
  type Account,
  type Endpoint,
  type ServerProfile,
} from '@shared/model'

const paths = { userData: '' }
const warn = vi.fn()

vi.mock('electron', () => ({ app: { getPath: () => paths.userData } }))
vi.mock('../logger', () => ({ logger: { warn, info: vi.fn() } }))

const { deleteProfile, listProfiles, saveProfile } = await import('./profiles')
const { loadAccounts, saveAccounts } = await import('./accounts')

const file = (name: string): string => join(paths.userData, name)

beforeEach(() => {
  paths.userData = mkdtempSync(join(tmpdir(), 'migramail-store-'))
  warn.mockClear()
})
afterEach(() => rmSync(paths.userData, { recursive: true, force: true }))

const custom: Omit<ServerProfile, 'id'> = {
  name: 'Locaweb',
  host: 'imap.locaweb.com.br',
  port: 993,
  security: 'ssl',
  preset: 'none',
  allowInvalidCert: false,
  extraArgs: '',
}

function endpoint(profileId: string | null): Endpoint {
  return {
    profileId,
    host: 'antigo.example',
    port: 143,
    security: 'tls',
    preset: 'none',
    allowInvalidCert: false,
    user: 'ana@example.com',
    rememberPassword: true,
  }
}

function account(id: string): Account {
  return {
    id,
    label: `Conta ${id}`,
    source: endpoint(null),
    dest: endpoint('builtin:gmail'),
    options: defaultMigrationOptions,
  }
}

describe('perfis', () => {
  it('sem arquivo: só os prontos (Gmail e Microsoft 365)', () => {
    expect(listProfiles().map((p) => p.name)).toEqual(['Gmail', 'Microsoft 365'])
  })

  it('arquivo corrompido volta aos perfis prontos', () => {
    writeFileSync(file('profiles.json'), '{ isto não é json')
    expect(listProfiles()).toEqual(BUILTIN_PROFILES)
    expect(warn).toHaveBeenCalled()
  })

  it('entrada inválida é descartada sem perder as válidas', () => {
    const ok = { ...custom, id: 'p1' }
    writeFileSync(
      file('profiles.json'),
      JSON.stringify({
        profiles: [
          ok,
          { ...custom, id: 'p2', port: 99999 },
          { id: 'p3' },
          { ...custom, id: 'builtin:gmail', name: 'Gmail falso' },
          { ...ok, name: 'Duplicado' },
        ],
      }),
    )
    expect(listProfiles().map((p) => p.id)).toEqual(['builtin:gmail', 'builtin:office', 'p1'])
    expect(warn).toHaveBeenCalledTimes(4)
  })

  it('cria, edita e exclui', () => {
    const created = saveProfile(custom)
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    saveProfile({ ...created, port: 143, security: 'tls' })
    expect(listProfiles().find((p) => p.id === created.id)).toMatchObject({ port: 143 })
    expect(listProfiles()).toHaveLength(3)
    deleteProfile(created.id)
    expect(listProfiles()).toHaveLength(2)
  })

  it('prontos não mudam e nomes não se repetem', () => {
    expect(() => saveProfile({ ...BUILTIN_PROFILES[0]!, port: 143 })).toThrow(/prontos/)
    expect(() => deleteProfile('builtin:office')).toThrow(/prontos/)
    expect(() => saveProfile({ ...custom, name: 'gmail' })).toThrow(/mesmo nome|esse nome/)
    saveProfile(custom)
    expect(() => saveProfile({ ...custom, name: ' LOCAWEB ' })).toThrow(/esse nome/)
  })

  it('applyProfile usa os dados atuais do perfil e solta perfil excluído', () => {
    const profiles = listProfiles()
    expect(applyProfile(endpoint('builtin:gmail'), profiles)).toMatchObject({
      host: 'imap.gmail.com',
      port: 993,
      security: 'ssl',
      preset: 'gmail',
      user: 'ana@example.com',
    })
    expect(applyProfile(endpoint('sumiu'), profiles)).toEqual({
      ...endpoint(null),
    })
  })
})

describe('contas salvas', () => {
  it('sem arquivo ou corrompido: vazio', () => {
    expect(loadAccounts()).toEqual({ single: null, batch: [] })
    writeFileSync(file('accounts.json'), 'lixo')
    expect(loadAccounts()).toEqual({ single: null, batch: [] })
  })

  it('salva e reabre; conta inválida ou repetida é descartada', () => {
    saveAccounts({ single: account('s'), batch: [account('a'), account('b')] })
    expect(loadAccounts()).toEqual({ single: account('s'), batch: [account('a'), account('b')] })

    const raw = JSON.parse(readFileSync(file('accounts.json'), 'utf8')) as { batch: unknown[] }
    raw.batch.push({ id: 'ruim' }, account('a'))
    writeFileSync(file('accounts.json'), JSON.stringify(raw))
    expect(loadAccounts().batch.map((a) => a.id)).toEqual(['a', 'b'])
  })

  it('campo a mais (senha) não vai para o arquivo', () => {
    const withPassword = { ...account('s'), password: 'nao-pode-123' } as Account
    saveAccounts({ single: withPassword, batch: [] })
    expect(readFileSync(file('accounts.json'), 'utf8')).not.toContain('nao-pode-123')
  })
})
