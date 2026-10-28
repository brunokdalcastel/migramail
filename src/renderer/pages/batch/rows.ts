import type { AccountDraft, DraftEndpoint } from '@shared/csv'
import {
  HOST_CONCURRENCY_WARN,
  accountSchema,
  applyProfile,
  defaultMigrationOptions,
  type Account,
  type Endpoint,
  type ServerProfile,
} from '@shared/model'

// Regras da tabela de "Várias contas", sem React: importar linhas do CSV, achar repetidas e
// decidir quais contas podem iniciar. Testado em rows.test.ts.

/** Senhas digitadas ou importadas de uma linha (só na memória do renderer). */
export interface RowPasswords {
  password1: string
  password2: string
}

export interface SavedFlags {
  source: boolean
  dest: boolean
}

/**
 * Origem e destino (host + usuário) e os extras identificam a conta, sem diferenciar
 * maiúsculas: o mesmo par com `--subfolder2` diferente é outra migração.
 */
const accountKey = (source: DraftEndpoint, dest: DraftEndpoint, extraArgs: string): string =>
  [source.host, source.user, dest.host, dest.user, extraArgs.trim()].join('|').toLowerCase()

/** Perfil com o mesmo host, porta e segurança (os prontos primeiro), para herdar os ajustes. */
export function matchProfile(e: DraftEndpoint, profiles: readonly ServerProfile[]): string | null {
  const host = e.host.toLowerCase()
  const p = profiles.find(
    (x) => x.host.toLowerCase() === host && x.port === e.port && x.security === e.security,
  )
  return p?.id ?? null
}

function draftEndpoint(e: DraftEndpoint, profiles: readonly ServerProfile[]): Endpoint {
  const endpoint: Endpoint = {
    profileId: matchProfile(e, profiles),
    host: e.host,
    port: e.port,
    security: e.security,
    preset: 'none',
    allowInvalidCert: false,
    user: e.user,
    rememberPassword: false,
  }
  return applyProfile(endpoint, profiles)
}

export function draftToAccount(d: AccountDraft, profiles: readonly ServerProfile[]): Account {
  return {
    id: crypto.randomUUID(),
    label: '',
    source: draftEndpoint(d.source, profiles),
    dest: draftEndpoint(d.dest, profiles),
    options: { ...defaultMigrationOptions, extraArgs: d.extraArgs },
  }
}

export interface ImportResult {
  added: Account[]
  /** Senhas das linhas novas e das repetidas (a repetida só atualiza a senha). */
  passwords: Map<string, RowPasswords>
  /** Linhas do arquivo que já estavam na tabela (ou repetidas no próprio arquivo). */
  duplicateLines: number[]
}

export function mergeImport(
  existing: readonly Account[],
  drafts: readonly AccountDraft[],
  profiles: readonly ServerProfile[],
): ImportResult {
  const byKey = new Map(
    existing.map((a) => [accountKey(a.source, a.dest, a.options.extraArgs), a.id]),
  )
  const added: Account[] = []
  const passwords = new Map<string, RowPasswords>()
  const duplicateLines: number[] = []
  for (const d of drafts) {
    const key = accountKey(d.source, d.dest, d.extraArgs)
    let id = byKey.get(key)
    if (id !== undefined) duplicateLines.push(d.line)
    else {
      const account = draftToAccount(d, profiles)
      added.push(account)
      byKey.set(key, account.id)
      id = account.id
    }
    if (d.password1 || d.password2) {
      const prev = passwords.get(id)
      passwords.set(id, {
        password1: d.password1 || (prev?.password1 ?? ''),
        password2: d.password2 || (prev?.password2 ?? ''),
      })
    }
  }
  return { added, passwords, duplicateLines }
}

/** Há senha utilizável para um lado: digitada, ou lembrada com "lembrar" marcado. */
export const sideHasPassword = (typed: string | undefined, e: Endpoint, saved: boolean): boolean =>
  !!typed || (e.rememberPassword && saved)

export function hasPasswords(
  a: Account,
  typed: RowPasswords | undefined,
  saved: SavedFlags | undefined,
): { source: boolean; dest: boolean } {
  return {
    source: sideHasPassword(typed?.password1, a.source, saved?.source ?? false),
    dest: sideHasPassword(typed?.password2, a.dest, saved?.dest ?? false),
  }
}

/** Nome curto da linha nas mensagens: rótulo, senão o usuário da origem. */
export const rowName = (a: Account): string => a.label.trim() || a.source.user.trim() || '—'

export interface StartPlan {
  ready: Account[]
  /** Dados incompletos (host/usuário vazio, porta inválida). */
  invalid: Account[]
  missingPassword: Account[]
  /** Hosts que teriam mais de 3 contas ao mesmo tempo com este paralelismo (RF10). */
  crowdedHosts: { host: string; count: number }[]
}

export function planStart(
  rows: readonly Account[],
  ctx: {
    isActive: (accountId: string) => boolean
    passwords: ReadonlyMap<string, RowPasswords> | Record<string, RowPasswords>
    saved: Record<string, SavedFlags>
    parallelism: number
  },
): StartPlan {
  const typedOf = (id: string): RowPasswords | undefined =>
    ctx.passwords instanceof Map
      ? ctx.passwords.get(id)
      : (ctx.passwords as Record<string, RowPasswords>)[id]
  const plan: StartPlan = { ready: [], invalid: [], missingPassword: [], crowdedHosts: [] }
  for (const a of rows) {
    if (ctx.isActive(a.id)) continue
    if (!accountSchema.safeParse(a).success) plan.invalid.push(a)
    else {
      const ok = hasPasswords(a, typedOf(a.id), ctx.saved[a.id])
      if (ok.source && ok.dest) plan.ready.push(a)
      else plan.missingPassword.push(a)
    }
  }
  const counts = new Map<string, number>()
  for (const a of plan.ready) {
    for (const host of new Set([a.source.host, a.dest.host].map((h) => h.trim().toLowerCase())))
      counts.set(host, (counts.get(host) ?? 0) + 1)
  }
  for (const [host, count] of counts) {
    const together = Math.min(count, ctx.parallelism)
    if (together > HOST_CONCURRENCY_WARN) plan.crowdedHosts.push({ host, count: together })
  }
  return plan
}
