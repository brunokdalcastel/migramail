import type { IpcErrorCode } from '@shared/ipc'

/**
 * Erro com mensagem pensada para o usuário. O IPC repassa código e mensagem deste tipo;
 * qualquer outra exceção vira `internal` para não vazar detalhes.
 */
export class UserError extends Error {
  override name = 'UserError'

  constructor(
    message: string,
    readonly code: IpcErrorCode = 'user_error',
  ) {
    super(message)
  }
}

/** Mensagens em pt-BR dos erros do próprio IPC. */
export const IPC_ERROR_MESSAGES = {
  invalid_payload: 'Dados inválidos na solicitação.',
  forbidden_sender: 'Remetente não autorizado.',
  unknown_channel: 'Canal desconhecido.',
  invalid_response: 'Resposta inválida do processo principal.',
  internal: 'Falha interna.',
} as const

export type IpcFailure = { ok: false; code: IpcErrorCode; message: string }

export function ipcFailure(code: keyof typeof IPC_ERROR_MESSAGES): IpcFailure {
  return { ok: false, code, message: IPC_ERROR_MESSAGES[code] }
}
