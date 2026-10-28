import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { isChannel, isEventName, type MigraMailBridge } from '@shared/ipc'

// Nunca expor ipcRenderer cru: só invoke/on para canais declarados em ipc.ts.
const bridge: MigraMailBridge = {
  invoke(channel, ...args) {
    if (!isChannel(channel)) {
      return Promise.resolve({ ok: false, code: 'unknown_channel', message: 'Canal desconhecido.' })
    }
    return ipcRenderer.invoke(channel, args[0])
  },
  on(event, listener) {
    if (!isEventName(event)) throw new Error(`Evento desconhecido: ${String(event)}`)
    const wrapped = (_e: IpcRendererEvent, payload: unknown): void =>
      listener(payload as Parameters<typeof listener>[0])
    ipcRenderer.on(event, wrapped)
    return () => {
      ipcRenderer.removeListener(event, wrapped)
    }
  },
  pathForFile(file) {
    // arquivo que não veio do disco (colado da área de transferência) não tem caminho
    return webUtils.getPathForFile(file) || null
  },
}

contextBridge.exposeInMainWorld('migramail', bridge)
