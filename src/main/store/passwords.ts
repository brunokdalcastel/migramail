import type { Account, JobSecrets, Side } from '@shared/model'
import { UserError } from '../errors'
import { getSecret, hasSecret, removeSecret, secretIds, setSecret } from '../secrets'

// Senhas lembradas por conta e lado. Só existe segredo salvo enquanto o lado está com
// "lembrar senha" marcado; desmarcar apaga.

/** Senhas digitadas; vazia ou ausente = usar a lembrada. */
export interface TypedPasswords {
  password1?: string | undefined
  password2?: string | undefined
}

export interface SavedPasswordFlags {
  source: boolean
  dest: boolean
}

const key = (accountId: string, side: Side): string => `pw:${accountId}:${side}`

function sideOf(account: Account, typed: TypedPasswords, side: Side) {
  return side === 1
    ? { endpoint: account.source, value: typed.password1 }
    : { endpoint: account.dest, value: typed.password2 }
}

/** O que o renderer pode saber: só se há senha salva em cada lado. */
export function savedPasswordFlags(accountId: string): SavedPasswordFlags {
  return { source: hasSecret(key(accountId, 1)), dest: hasSecret(key(accountId, 2)) }
}

/** Senhas do job: a digitada ou, com "lembrar senha", a salva. Falta alguma ⇒ UserError. */
export function resolvePasswords(account: Account, typed: TypedPasswords): JobSecrets {
  const pick = (side: Side): string | null => {
    const { endpoint, value } = sideOf(account, typed, side)
    if (value) return value
    return endpoint.rememberPassword ? getSecret(key(account.id, side)) : null
  }
  const password1 = pick(1)
  if (!password1) throw new UserError('Informe a senha da origem.', 'missing_password')
  const password2 = pick(2)
  if (!password2) throw new UserError('Informe a senha do destino.', 'missing_password')
  return { password1, password2 }
}

/**
 * Aplica o "lembrar senha" de cada lado: marcado e com senha digitada ⇒ salva (cifrada);
 * desmarcado ⇒ apaga. Lança UserError se a criptografia do sistema não estiver disponível.
 */
export function rememberPasswords(account: Account, typed: TypedPasswords): void {
  for (const side of [1, 2] as const) {
    const { endpoint, value } = sideOf(account, typed, side)
    if (!endpoint.rememberPassword) removeSecret(key(account.id, side))
    else if (value) setSecret(key(account.id, side), value)
  }
}

/** Apaga as senhas de contas que não estão mais salvas. */
export function forgetPasswordsExcept(accountIds: ReadonlySet<string>): void {
  for (const id of secretIds()) {
    const m = /^pw:(.+):[12]$/.exec(id)
    if (m?.[1] && !accountIds.has(m[1])) removeSecret(id)
  }
}
