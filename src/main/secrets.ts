import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import { UserError } from './errors'
import { logger } from './logger'
import { readJsonFile, writeFileAtomic } from './settings'

// Senhas lembradas, cifradas com safeStorage (DPAPI no Windows) e guardadas em base64 no
// secrets.json. Chaves `pw:<accountId>:1` (origem) e `pw:<accountId>:2` (destino), montadas em
// store/passwords.ts. Só o main lê o valor; o renderer só sabe se existe (hasSecret).

const secretsPath = (): string => join(app.getPath('userData'), 'secrets.json')

function readAll(): Record<string, string> {
  const raw = readJsonFile(secretsPath())
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(
    Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string' && !!e[1]),
  )
}

function writeAll(all: Record<string, string>): void {
  writeFileAtomic(secretsPath(), JSON.stringify(all))
}

export function setSecret(id: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    // nunca cair para texto puro
    throw new UserError('Criptografia do sistema indisponível: a senha não foi salva.')
  }
  const encrypted = safeStorage.encryptString(value).toString('base64')
  writeAll({ ...readAll(), [id]: encrypted })
}

export function getSecret(id: string): string | null {
  const encrypted = readAll()[id]
  if (!encrypted) return null
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    // ex.: arquivo copiado de outro usuário do Windows
    logger.warn(`[secrets] não foi possível decifrar o segredo ${id}`)
    return null
  }
}

export function hasSecret(id: string): boolean {
  return readAll()[id] !== undefined
}

export function removeSecret(id: string): void {
  const all = readAll()
  if (!(id in all)) return
  delete all[id]
  writeAll(all)
}

/** Ids de todos os segredos salvos (para apagar os de contas que saíram da lista). */
export function secretIds(): string[] {
  return Object.keys(readAll())
}
