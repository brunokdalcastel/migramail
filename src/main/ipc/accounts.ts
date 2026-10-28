import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { app, dialog } from 'electron'
import { exportAccountsCsv, parseAccountsCsv } from '@shared/csv'
import { applyProfile, type Account } from '@shared/model'
import { UserError } from '../errors'
import { logger } from '../logger'
import { writeFileAtomic } from '../settings'
import { loadAccounts, saveAccounts, type SavedAccounts } from '../store/accounts'
import {
  forgetPasswordsExcept,
  rememberPasswords,
  savedPasswordFlags,
  type SavedPasswordFlags,
} from '../store/passwords'
import { listProfiles } from '../store/profiles'
import { getMainWindow } from '../windows'
import { handle } from './register'

// Canais das contas salvas e do CSV. O caminho do CSV vem do renderer (arquivo escolhido ou
// arrastado); aqui só conferimos extensão, tamanho e existência antes de ler.

const CSV_MAX_BYTES = 5 * 1024 * 1024
const CSV_EXTENSIONS = new Set(['.csv', '.txt'])

/** Contas com os dados atuais dos perfis e o aviso de senha lembrada de cada uma. */
function accountsState(saved: SavedAccounts) {
  const profiles = listProfiles()
  const refresh = (a: Account): Account => ({
    ...a,
    source: applyProfile(a.source, profiles),
    dest: applyProfile(a.dest, profiles),
  })
  const single = saved.single ? refresh(saved.single) : null
  const batch = saved.batch.map(refresh)
  const savedPasswords: Record<string, SavedPasswordFlags> = {}
  for (const a of single ? [single, ...batch] : batch)
    savedPasswords[a.id] = savedPasswordFlags(a.id)
  return { single, batch, savedPasswords }
}

/** UTF-8; se não for válido, o ANSI do Excel em pt-BR (Windows-1252). */
function decodeText(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

export function registerAccountsHandlers(): void {
  handle('accounts:load', () => accountsState(loadAccounts()))

  handle('accounts:save', ({ single, batch, passwords }) => {
    const state = { single, batch }
    saveAccounts(state)
    const all = single ? [single, ...batch] : batch
    forgetPasswordsExcept(new Set(all.map((a) => a.id)))
    for (const typed of passwords ?? []) {
      const account = all.find((a) => a.id === typed.accountId)
      if (account) rememberPasswords(account, typed)
    }
    return accountsState(state)
  })

  handle('accounts:importCsv', ({ path }) => {
    if (!CSV_EXTENSIONS.has(extname(path).toLowerCase())) {
      throw new UserError('Escolha um arquivo .csv ou .txt.')
    }
    if (!existsSync(path)) throw new UserError('Arquivo não encontrado.')
    if (statSync(path).size > CSV_MAX_BYTES) {
      throw new UserError('Arquivo grande demais (máximo de 5 MB).')
    }
    const result = parseAccountsCsv(decodeText(readFileSync(path)))
    logger.info(
      `[accounts] CSV importado: ${result.rows.length} linhas, ${result.errors.length} erros`,
    )
    return result
  })

  handle('accounts:exportCsv', async ({ accounts }) => {
    const win = getMainWindow()
    const options: Electron.SaveDialogOptions = {
      title: 'Exportar contas (sem senhas)',
      defaultPath: join(app.getPath('documents'), 'contas-migramail.csv'),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { path: null }
    // BOM: o Excel só lê os acentos como UTF-8 com ele
    writeFileAtomic(result.filePath, '﻿' + exportAccountsCsv(accounts))
    logger.info(`[accounts] CSV exportado: ${accounts.length} contas`)
    return { path: result.filePath }
  })
}
