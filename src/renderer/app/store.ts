import { create } from 'zustand'
import {
  accountSchema,
  type Account,
  type BatchSummary,
  type JobSnapshot,
  type ServerProfile,
} from '@shared/model'
import type { AppSettings } from '@shared/schemas'
import { invoke, on } from '../lib/api'

// Estado global da UI: jobs (alimentados pelos eventos do main), o log só do job aberto na
// tela, avisos (toasts), settings, perfis e as contas salvas. Senha nunca passa por aqui: os
// formulários guardam a digitada no próprio estado local até iniciar (o lote, em
// pages/batch/passwords.ts).

export type ToastKind = 'info' | 'ok' | 'warn' | 'error'
export interface Toast {
  id: number
  kind: ToastKind
  text: string
}

export interface SavedPasswords {
  [accountId: string]: { source: boolean; dest: boolean }
}

/** Linhas de log guardadas do job aberto (o main guarda as mesmas 2.000). */
export const LOG_MAX_LINES = 2000

interface AppState {
  jobs: Record<string, JobSnapshot>
  /** Job cujo log está na tela; só ele recebe as linhas do `jobs:log`. */
  logJobId: string | null
  logLines: string[]
  /** Enquanto o `jobs:log` não volta, as linhas que chegam já estão no que ele vai trazer. */
  logLoading: boolean
  toasts: Toast[]
  settings: AppSettings | null
  profiles: ServerProfile[]
  /** `null` até o primeiro `accounts:load`. */
  accounts: { single: Account | null; batch: Account[] } | null
  savedPasswords: SavedPasswords
  /** Painel do lote (jobs de "Várias contas"). */
  batch: BatchSummary | null

  toast: (text: string, kind?: ToastKind) => void
  dismissToast: (id: number) => void
  watchLog: (jobId: string | null) => void
  setSettings: (settings: AppSettings) => void
  loadProfiles: () => Promise<void>
  /** Grava a conta de "Uma conta" mantendo a lista do lote. */
  saveSingle: (single: Account) => Promise<void>
  /** Grava a tabela do lote; linhas ainda incompletas ficam só na memória. */
  saveBatch: (batch: Account[]) => Promise<void>
}

let seq = 0
const TOAST_MS = 5000
const ERROR_TOAST_MS = 10_000

export const useApp = create<AppState>((set, get) => ({
  jobs: {},
  logJobId: null,
  logLines: [],
  logLoading: false,
  toasts: [],
  settings: null,
  profiles: [],
  accounts: null,
  savedPasswords: {},
  batch: null,

  toast: (text, kind = 'info') => {
    const id = ++seq
    set({ toasts: [...get().toasts.slice(-3), { id, kind, text }] })
    // erro fica mais tempo (e some antes se o usuário clicar)
    setTimeout(() => get().dismissToast(id), kind === 'error' ? ERROR_TOAST_MS : TOAST_MS)
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),

  watchLog: (jobId) => {
    if (get().logJobId === jobId) return
    set({ logJobId: jobId, logLines: [], logLoading: jobId !== null })
    if (jobId === null) return
    invoke('jobs:log', { jobId }).then(
      ({ lines }) => {
        if (get().logJobId === jobId) set({ logLines: lines, logLoading: false })
      },
      () => {
        if (get().logJobId === jobId) set({ logLoading: false })
      },
    )
  },

  setSettings: (settings) => set({ settings }),

  loadProfiles: async () => set({ profiles: await invoke('profiles:list') }),

  saveSingle: async (single) => {
    const batch = get().accounts?.batch ?? []
    // já no store: a tela que abrir antes de o main responder lê esta versão
    set({ accounts: { single, batch } })
    const state = await invoke('accounts:save', { single, batch: validOnly(batch) })
    set({
      accounts: { single: state.single, batch: get().accounts?.batch ?? batch },
      savedPasswords: state.savedPasswords,
    })
  },

  saveBatch: async (batch) => {
    const single = get().accounts?.single ?? null
    set({ accounts: { single, batch } })
    const state = await invoke('accounts:save', { single, batch: validOnly(batch) })
    set({ savedPasswords: state.savedPasswords })
  },
}))

/** O main só grava conta completa; a linha em edição fica na memória até ficar válida. */
function validOnly(accounts: Account[]): Account[] {
  return accounts.flatMap((a) => {
    const parsed = accountSchema.safeParse(a)
    return parsed.success ? [parsed.data] : []
  })
}

/** Liga os eventos do main ao store e carrega o estado inicial. Devolve o unsubscribe. */
export function connectStore(): () => void {
  const { setState, getState } = useApp
  const offs = [
    on('jobs:changed', (snapshots) => {
      const jobs = { ...getState().jobs }
      for (const s of snapshots) jobs[s.id] = s
      setState({ jobs })
    }),
    on('jobs:removed', ({ jobId }) => {
      const jobs = { ...getState().jobs }
      delete jobs[jobId]
      setState({ jobs })
    }),
    on('jobs:log', ({ jobId, lines }) => {
      const s = getState()
      if (s.logJobId !== jobId || s.logLoading) return
      const next = s.logLines.concat(lines)
      setState({ logLines: next.length > LOG_MAX_LINES ? next.slice(-LOG_MAX_LINES) : next })
    }),
    on('settings:changed', (settings) => setState({ settings })),
    on('jobs:batch', (batch) => setState({ batch })),
  ]

  const fail = (err: Error): void => getState().toast(err.message, 'error')
  invoke('jobs:list').then((list) => {
    // eventos que chegaram antes valem mais (são mais novos)
    const jobs: Record<string, JobSnapshot> = {}
    for (const s of list) jobs[s.id] = s
    setState({ jobs: { ...jobs, ...getState().jobs } })
  }, fail)
  invoke('settings:get').then((settings) => setState({ settings }), fail)
  invoke('jobs:batchSummary').then((batch) => setState({ batch: getState().batch ?? batch }), fail)
  getState().loadProfiles().catch(fail)
  invoke('accounts:load').then(
    (state) =>
      setState({
        accounts: { single: state.single, batch: state.batch },
        savedPasswords: state.savedPasswords,
      }),
    fail,
  )

  return () => {
    for (const off of offs) off()
  }
}

/** Job mais recente de uma conta (o "Rodar de novo" troca o antigo por um novo). */
export function latestJobOf(jobs: Record<string, JobSnapshot>, accountId: string) {
  let latest: JobSnapshot | null = null
  for (const j of Object.values(jobs)) {
    if (j.accountId === accountId && (!latest || j.queuedAt > latest.queuedAt)) latest = j
  }
  return latest
}

export const isActive = (job: JobSnapshot | null): boolean =>
  job !== null && job.state !== 'finished'
