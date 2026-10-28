import type {
  InvokeArgs,
  IpcChannel,
  IpcEvent,
  IpcEventPayload,
  IpcResponse,
  MigraMailBridge,
} from '@shared/ipc'

declare global {
  interface Window {
    migramail: MigraMailBridge
  }
}

/** Erro devolvido pelo main, com o código para a UI decidir o que mostrar. */
export class ApiError extends Error {
  override name = 'ApiError'

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** Chama o main; lança ApiError se a resposta vier com `ok: false`. */
export async function invoke<K extends IpcChannel>(
  channel: K,
  ...args: InvokeArgs<K>
): Promise<IpcResponse<K>> {
  const res = await window.migramail.invoke(channel, ...args)
  if (!res.ok) throw new ApiError(res.code, res.message)
  return res.data
}

/** Caminho no disco de um arquivo arrastado (`null` se não veio do disco). */
export const pathForFile = (file: File): string | null => window.migramail.pathForFile(file)

/** Assina um evento do main; devolve a função de unsubscribe. */
export function on<E extends IpcEvent>(
  event: E,
  listener: (payload: IpcEventPayload<E>) => void,
): () => void {
  return window.migramail.on(event, listener)
}
