import { UserError } from '../errors'
import { checkExtraArgs, splitArgs } from '@shared/extraArgs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { accountSchema, type Account } from '@shared/model'
import { logger } from '../logger'
import { readJsonFile, writeFileAtomic } from '../settings'

// accounts.json em %APPDATA%\MigraMail: o último formulário de "Uma conta" e a última tabela
// de "Várias contas", para reabrir o app onde parou. Sem senha: as lembradas ficam no
// secrets.json (store/passwords.ts).

export interface SavedAccounts {
  single: Account | null
  batch: Account[]
}

const accountsPath = (): string => join(app.getPath('userData'), 'accounts.json')

/** Conta inválida é descartada com log; o resto do arquivo é aproveitado. */
export function loadAccounts(): SavedAccounts {
  const path = accountsPath()
  const raw = readJsonFile(path)
  if (!raw || typeof raw !== 'object') {
    if (existsSync(path)) logger.warn('[accounts] accounts.json ilegível; começando vazio')
    return { single: null, batch: [] }
  }
  const { single: rawSingle, batch: rawBatch } = raw as { single?: unknown; batch?: unknown }

  let single: Account | null = null
  if (rawSingle != null) {
    const parsed = accountSchema.safeParse(rawSingle)
    if (parsed.success) single = parsed.data
    else logger.warn('[accounts] conta de "Uma conta" descartada')
  }

  const batch: Account[] = []
  const seen = new Set<string>()
  if (Array.isArray(rawBatch)) {
    rawBatch.forEach((entry, i) => {
      const parsed = accountSchema.safeParse(entry)
      if (!parsed.success || seen.has(parsed.data.id)) {
        logger.warn(`[accounts] linha ${i} de "Várias contas" descartada`)
        return
      }
      seen.add(parsed.data.id)
      batch.push(parsed.data)
    })
  }
  return { single, batch }
}

/** Grava só o que passa no schema (campos a mais, como uma senha, ficam de fora). */
export function saveAccounts(state: SavedAccounts): void {
  const data = {
    single: state.single ? accountSchema.parse(state.single) : null,
    batch: state.batch.map((a) => accountSchema.parse(a)),
  }
  for (const a of data.single ? [data.single, ...data.batch] : data.batch) {
    const { errors } = checkExtraArgs(splitArgs(a.options.extraArgs))
    if (errors.length) throw new UserError(errors.join(' '))
  }
  writeFileAtomic(accountsPath(), JSON.stringify(data, null, 2))
}
