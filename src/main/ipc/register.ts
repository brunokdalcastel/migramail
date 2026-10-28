import { mkdirSync } from 'node:fs'
import { app, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import {
  ipc,
  ipcEvents,
  type IpcChannel,
  type IpcEvent,
  type IpcEventPayload,
  type IpcRequest,
  type IpcResponse,
  type IpcResult,
} from '@shared/ipc'
import { UserError, ipcFailure } from '../errors'
import { engineCacheFile, engineVersion } from '../imapsync/engine'
import { imapsyncExe, logsDir } from '../imapsync/paths'
import { logger } from '../logger'
import { getSettings, onSettingsChanged, updateSettings } from '../settings'
import { getMainWindow, isAppUrl } from '../windows'
import { registerAccountsHandlers } from './accounts'
import { registerJobsHandlers } from './jobs'
import { registerProfilesHandlers } from './profiles'

type Handler<K extends IpcChannel> = (
  req: IpcRequest<K>,
  event: IpcMainInvokeEvent,
) => IpcResponse<K> | Promise<IpcResponse<K>>

/**
 * Registra um canal. Recusa remetentes fora do app, valida o pedido com o schema de ipc.ts
 * (inválido nem chega ao handler), confere a resposta em dev e nunca deixa uma exceção
 * atravessar para o renderer.
 */
export function handle<K extends IpcChannel>(channel: K, fn: Handler<K>): void {
  const { req: reqSchema, res: resSchema } = ipc[channel]
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (event, raw: unknown): Promise<IpcResult<unknown>> => {
    const senderUrl = event.senderFrame?.url
    if (!senderUrl || !isAppUrl(senderUrl)) {
      logger.warn(`[ipc] ${channel}: remetente recusado`)
      return ipcFailure('forbidden_sender')
    }
    const parsed = reqSchema.safeParse(raw)
    if (!parsed.success) {
      logger.warn(`[ipc] ${channel}: payload inválido`)
      return ipcFailure('invalid_payload')
    }
    try {
      const data = await fn(parsed.data as IpcRequest<K>, event)
      if (!app.isPackaged && !resSchema.safeParse(data).success) {
        logger.error(`[ipc] ${channel}: resposta fora do contrato`)
        return ipcFailure('invalid_response')
      }
      return { ok: true, data }
    } catch (err) {
      if (err instanceof UserError) return { ok: false, code: err.code, message: err.message }
      // só a mensagem: payloads podem ter senhas
      logger.error(`[ipc] ${channel}: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
      return ipcFailure('internal')
    }
  })
}

/** Envio tipado main → renderer (janela principal). */
export function broadcast<E extends IpcEvent>(event: E, payload: IpcEventPayload<E>): void {
  if (!app.isPackaged && !ipcEvents[event].safeParse(payload).success) {
    logger.error(`[ipc] evento ${event}: payload fora do contrato`)
    return
  }
  getMainWindow()?.webContents.send(event, payload)
}

const IMAPSYNC_SITE = 'https://imapsync.lamiral.info/'

let offSettings: (() => void) | undefined

export function registerIpc(): void {
  handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
  }))

  handle('about:engine', async () => ({
    version: await engineVersion(imapsyncExe(), engineCacheFile(app.getPath('userData'))),
  }))
  handle('about:openLogs', async () => {
    mkdirSync(logsDir(), { recursive: true })
    const err = await shell.openPath(logsDir())
    if (err) throw new UserError(`Não foi possível abrir a pasta de logs: ${err}`)
    return null
  })
  handle('about:openSite', async () => {
    await shell.openExternal(IMAPSYNC_SITE)
    return null
  })

  handle('settings:get', () => getSettings())
  handle('settings:update', (patch) => updateSettings(patch))
  offSettings?.()
  offSettings = onSettingsChanged((settings) => broadcast('settings:changed', settings))

  registerProfilesHandlers()
  registerAccountsHandlers()
  registerJobsHandlers()
}
