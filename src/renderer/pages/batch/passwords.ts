import { create } from 'zustand'
import type { RowPasswords } from './rows'

// Senhas do lote digitadas ou vindas do CSV: só na memória do renderer (somem ao fechar o app,
// sobrevivem à troca de tela). Vão ao main no jobs:start; as de lados com "lembrar senha"
// ficam guardadas pelo main com a criptografia do Windows.

interface BatchPasswords {
  byAccount: Record<string, RowPasswords>
  set: (accountId: string, patch: Partial<RowPasswords>) => void
  merge: (entries: ReadonlyMap<string, RowPasswords>) => void
  drop: (accountIds: readonly string[]) => void
}

export const useBatchPasswords = create<BatchPasswords>((set, get) => ({
  byAccount: {},
  set: (accountId, patch) => {
    const prev = get().byAccount[accountId] ?? { password1: '', password2: '' }
    set({ byAccount: { ...get().byAccount, [accountId]: { ...prev, ...patch } } })
  },
  merge: (entries) => set({ byAccount: { ...get().byAccount, ...Object.fromEntries(entries) } }),
  drop: (accountIds) => {
    const next = { ...get().byAccount }
    for (const id of accountIds) delete next[id]
    set({ byAccount: next })
  },
}))
