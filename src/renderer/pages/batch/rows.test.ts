import { describe, expect, it } from 'vitest'
import type { AccountDraft } from '@shared/csv'
import { BUILTIN_PROFILES, type Account } from '@shared/model'
import { draftToAccount, mergeImport, planStart, type RowPasswords } from './rows'

function draft(
  line: number,
  user: string,
  host1 = 'imap.origem.test',
  pw = 'segredo',
): AccountDraft {
  return {
    line,
    source: { host: host1, port: 993, security: 'ssl', user },
    dest: { host: 'imap.destino.test', port: 993, security: 'ssl', user },
    password1: pw,
    password2: pw,
    extraArgs: '',
  }
}

describe('draftToAccount', () => {
  it('reconhece o perfil pronto pelo host e herda o ajuste do provedor', () => {
    const a = draftToAccount(draft(1, 'x@gmail.com', 'IMAP.gmail.com'), BUILTIN_PROFILES)
    expect(a.source.profileId).toBe('builtin:gmail')
    expect(a.source.preset).toBe('gmail')
    expect(a.dest.profileId).toBeNull()
    expect(a.source.rememberPassword).toBe(false)
  })

  it('leva os argumentos extras do arquivo para as opções', () => {
    const d = { ...draft(1, 'a'), extraArgs: '--subfolder2 Migrado' }
    expect(draftToAccount(d, []).options.extraArgs).toBe('--subfolder2 Migrado')
  })
})

describe('mergeImport', () => {
  it('pula conta repetida (na tabela ou no arquivo) e só atualiza a senha', () => {
    const existing = draftToAccount(draft(1, 'a@x.test'), [])
    const result = mergeImport(
      [existing],
      [
        { ...draft(2, 'A@X.test'), password1: 'nova' },
        draft(3, 'b@x.test'),
        { ...draft(4, 'b@x.test'), password1: '', password2: 'outra' },
      ],
      [],
    )
    expect(result.added.map((a) => a.source.user)).toEqual(['b@x.test'])
    expect(result.duplicateLines).toEqual([2, 4])
    expect(result.passwords.get(existing.id)).toEqual({ password1: 'nova', password2: 'segredo' })
    expect(result.passwords.get(result.added[0]!.id)).toEqual({
      password1: 'segredo',
      password2: 'outra',
    })
  })

  it('mesmo par com extras diferentes é outra conta', () => {
    const result = mergeImport(
      [],
      [
        { ...draft(1, 'a'), extraArgs: '--subfolder2 A' },
        { ...draft(2, 'a'), extraArgs: '--subfolder2 B' },
      ],
      [],
    )
    expect(result.added).toHaveLength(2)
    expect(result.duplicateLines).toEqual([])
  })

  it('linha sem senha não cria entrada de senha', () => {
    const result = mergeImport([], [draft(1, 'a', 'h', '')], [])
    expect(result.passwords.size).toBe(0)
  })
})

describe('planStart', () => {
  const rows = (n: number, host = 'imap.origem.test'): Account[] =>
    Array.from({ length: n }, (_, i) => draftToAccount(draft(i + 1, `u${i}`, host), []))
  const typed = (list: Account[]): Map<string, RowPasswords> =>
    new Map(list.map((a) => [a.id, { password1: 'p', password2: 'p' }]))

  it('separa prontas, sem senha, incompletas e já em andamento', () => {
    const [ready, noPw, saved, running, broken] = rows(5)
    saved!.source.rememberPassword = true
    saved!.dest.rememberPassword = true
    broken!.source.host = ''
    const passwords = typed([ready!, running!, broken!])
    const plan = planStart([ready!, noPw!, saved!, running!, broken!], {
      isActive: (id) => id === running!.id,
      passwords,
      saved: { [saved!.id]: { source: true, dest: true } },
      parallelism: 2,
    })
    expect(plan.ready).toEqual([ready, saved])
    expect(plan.missingPassword).toEqual([noPw])
    expect(plan.invalid).toEqual([broken])
    expect(plan.crowdedHosts).toEqual([])
  })

  it('senha lembrada sem "lembrar" marcado não conta', () => {
    const [a] = rows(1)
    const plan = planStart([a!], {
      isActive: () => false,
      passwords: {},
      saved: { [a!.id]: { source: true, dest: true } },
      parallelism: 2,
    })
    expect(plan.missingPassword).toEqual([a])
  })

  it('avisa quando mais de 3 contas do mesmo host rodariam juntas', () => {
    const list = rows(6)
    const ctx = { isActive: () => false, passwords: typed(list), saved: {} }
    expect(planStart(list, { ...ctx, parallelism: 3 }).crowdedHosts).toEqual([])
    expect(planStart(list, { ...ctx, parallelism: 4 }).crowdedHosts).toEqual([
      { host: 'imap.origem.test', count: 4 },
      { host: 'imap.destino.test', count: 4 },
    ])
  })
})
