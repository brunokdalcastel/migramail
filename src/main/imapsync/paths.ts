import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { Account } from '@shared/model'
import { UserError } from '../errors'
import type { JobFilePaths } from './args'
import { logFileName } from './job'

// Único lugar que sabe onde fica o imapsync.exe e onde cada job grava PID e log.

/** `resources/imapsync/` no app instalado; `vendor/imapsync/` em dev. */
export function imapsyncExe(): string {
  const exe = app.isPackaged
    ? join(process.resourcesPath, 'imapsync', 'imapsync.exe')
    : join(app.getAppPath(), 'vendor', 'imapsync', 'imapsync.exe')
  if (!existsSync(exe)) {
    throw new UserError(
      app.isPackaged
        ? 'O motor de migração (imapsync.exe) não foi encontrado. Reinstale o MigraMail.'
        : `imapsync.exe não encontrado em ${exe}.`,
    )
  }
  return exe
}

/** Pasta dos logs do imapsync (`%APPDATA%\MigraMail\logs`, RF9). */
export function logsDir(): string {
  return join(app.getPath('userData'), 'logs')
}

/** PID único por job (nunca o padrão compartilhado do imapsync) e log nomeado pela conta. */
export function jobPaths(jobId: string, account: Account): JobFilePaths {
  return {
    pidfile: join(app.getPath('userData'), 'run', `${jobId}.pid`),
    logdir: logsDir(),
    logfile: logFileName(account.label || account.source.user, new Date(), jobId),
  }
}
