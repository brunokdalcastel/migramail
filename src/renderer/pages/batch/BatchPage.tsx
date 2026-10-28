import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CsvError } from '@shared/csv'
import { accountSchema, applyProfile, type Account, type JobMode } from '@shared/model'
import { latestJobOf, useApp } from '../../app/store'
import { Button } from '../../components/Button'
import { PageHeader, Select } from '../../components/Form'
import { Icon } from '../../components/Icon'
import { t } from '../../i18n/pt-BR'
import { blankAccount } from '../../lib/accounts'
import { invoke, pathForFile } from '../../lib/api'
import { AccountsTable, type RowActions } from './AccountsTable'
import {
  ApplyProfileDialog,
  DetailsDrawer,
  PasswordsDialog,
  StartDialog,
  withProfile,
  type PendingStart,
} from './BatchDialogs'
import { BatchSummary } from './BatchSummary'
import { useBatchPasswords } from './passwords'
import { hasPasswords, mergeImport, planStart, rowName } from './rows'

// "Várias contas": tabela editável, importar/exportar CSV, aplicar perfil, modo e paralelismo,
// iniciar/parar/repetir e o painel do lote. A tabela é gravada sozinha (sem senha, só as linhas
// completas); as senhas do lote ficam na memória (passwords.ts) até o jobs:start.

const SAVE_DELAY_MS = 800
const TOASTS_MAX = 3

const MODES: readonly {
  mode: JobMode
  label: 'single.login' | 'single.sizes' | 'single.dry' | 'single.migrate'
}[] = [
  { mode: 'login', label: 'single.login' },
  { mode: 'sizes', label: 'single.sizes' },
  { mode: 'dry', label: 'single.dry' },
  { mode: 'migrate', label: 'single.migrate' },
]

const modeLabel = (mode: JobMode): string => t(MODES.find((m) => m.mode === mode)!.label)

export function BatchPage(): React.JSX.Element {
  const saved = useApp((s) => s.accounts)
  // espera o accounts:load para não apagar a tabela salva
  if (!saved) {
    return (
      <div className="px-9 py-8">
        <PageHeader title={t('batch.title')} />
      </div>
    )
  }
  return <BatchEditor initial={saved.batch} />
}

function BatchEditor({ initial }: { initial: Account[] }): React.JSX.Element {
  const profiles = useApp((s) => s.profiles)
  const savedPasswords = useApp((s) => s.savedPasswords)
  const allJobs = useApp((s) => s.jobs)
  const summary = useApp((s) => s.batch)
  const parallelism = useApp((s) => s.settings?.parallelism ?? 2)
  const saveBatch = useApp((s) => s.saveBatch)
  const toast = useApp((s) => s.toast)
  const typed = useBatchPasswords((s) => s.byAccount)
  const mergePasswords = useBatchPasswords((s) => s.merge)
  const dropPasswords = useBatchPasswords((s) => s.drop)

  const [base, setRows] = useState<Account[]>(initial)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [mode, setMode] = useState<JobMode>('login')
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [passwordsId, setPasswordsId] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [pending, setPending] = useState<
    (PendingStart & { modeOf: (a: Account) => JobMode }) | null
  >(null)
  const [importErrors, setImportErrors] = useState<CsvError[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // linhas presas a um perfil acompanham a edição dele (lista vazia = perfis não carregados)
  const rows = useMemo(
    () =>
      profiles.length === 0
        ? base
        : base.map((a) => ({
            ...a,
            source: applyProfile(a.source, profiles),
            dest: applyProfile(a.dest, profiles),
          })),
    [base, profiles],
  )

  const jobs = useMemo(() => {
    const byAccount: Record<string, ReturnType<typeof latestJobOf>> = {}
    for (const a of rows) byAccount[a.id] = latestJobOf(allJobs, a.id)
    return byAccount
  }, [rows, allJobs])
  const isActive = useCallback(
    (id: string) => {
      const job = jobs[id]
      return job != null && job.state !== 'finished'
    },
    [jobs],
  )

  const passwordOk = useMemo(() => {
    const ok: Record<string, { source: boolean; dest: boolean }> = {}
    for (const a of rows) ok[a.id] = hasPasswords(a, typed[a.id], savedPasswords[a.id])
    return ok
  }, [rows, typed, savedPasswords])

  // grava a tabela um pouco depois da última mudança; ao sair da tela grava o pendente
  const pendingSave = useRef<Account[] | null>(null)
  const flushSave = useCallback(() => {
    const next = pendingSave.current
    pendingSave.current = null
    if (next) saveBatch(next).catch(() => undefined)
  }, [saveBatch])
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    pendingSave.current = rows
    const timer = setTimeout(flushSave, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [rows, flushSave])
  useEffect(() => flushSave, [flushSave])

  const fail = useCallback((err: Error) => toast(err.message, 'error'), [toast])

  const update = useCallback((id: string, fn: (a: Account) => Account) => {
    setRows((list) => list.map((a) => (a.id === id ? fn(a) : a)))
  }, [])

  // ---- importar / exportar ----

  const importPath = async (path: string): Promise<void> => {
    try {
      const result = await invoke('accounts:importCsv', { path })
      const merged = mergeImport(rows, result.rows, profiles)
      setRows((list) => [...list, ...merged.added])
      mergePasswords(merged.passwords)
      setImportErrors(result.errors)
      const added = merged.added.length
      if (added > 0 || (result.errors.length === 0 && merged.duplicateLines.length === 0))
        toast(added === 1 ? t('batch.importedOne') : t('batch.imported', { n: added }), 'ok')
      if (merged.duplicateLines.length > 0)
        toast(t('batch.duplicates', { n: merged.duplicateLines.length }), 'info')
    } catch (err) {
      fail(err as Error)
    }
  }

  const importFile = (file: File | undefined): void => {
    if (!file) return
    const path = pathForFile(file)
    if (!path) toast(t('batch.notFromDisk'), 'error')
    else void importPath(path)
  }

  const exportCsv = async (): Promise<void> => {
    const accounts = rows.flatMap((a) => {
      const parsed = accountSchema.safeParse(a)
      return parsed.success ? [parsed.data] : []
    })
    if (accounts.length === 0) {
      toast(t('batch.exportNothing'), 'warn')
      return
    }
    try {
      const { path } = await invoke('accounts:exportCsv', { accounts })
      if (path) toast(t('batch.exported', { path }), 'ok')
    } catch (err) {
      fail(err as Error)
    }
  }

  // ---- iniciar / parar ----

  const requestStart = (targets: readonly Account[], modeOf: (a: Account) => JobMode): void => {
    const plan = planStart(targets, {
      isActive,
      passwords: typed,
      saved: savedPasswords,
      parallelism,
    })
    const modes = new Set(plan.ready.map(modeOf))
    const migrate = modes.has('migrate')
    const issues = plan.missingPassword.length + plan.invalid.length + plan.crowdedHosts.length > 0
    const label = modes.size === 1 ? modeLabel([...modes][0]!) : modeLabel(mode)
    if (migrate || issues || plan.ready.length === 0) {
      setPending({ plan, modeLabel: label, migrate, modeOf })
    } else void runStart(plan.ready, modeOf)
  }

  const runStart = async (ready: Account[], modeOf: (a: Account) => JobMode): Promise<void> => {
    setBusy(true)
    const warnings = new Set<string>()
    const errors: string[] = []
    let started = 0
    for (const a of ready) {
      const pw = typed[a.id]
      try {
        const res = await invoke('jobs:start', {
          account: accountSchema.parse(a),
          mode: modeOf(a),
          password1: pw?.password1 || undefined,
          password2: pw?.password2 || undefined,
          scope: 'batch',
        })
        started++
        for (const w of res.warnings) warnings.add(w)
      } catch (err) {
        errors.push(t('batch.startErrors', { name: rowName(a), message: (err as Error).message }))
      }
    }
    setBusy(false)
    if (started > 0)
      toast(started === 1 ? t('batch.startedOne') : t('batch.started', { n: started }), 'ok')
    for (const w of [...warnings].slice(0, TOASTS_MAX)) toast(w, 'warn')
    for (const e of errors.slice(0, TOASTS_MAX)) toast(e, 'error')
    if (errors.length > TOASTS_MAX)
      toast(t('batch.andMore', { n: errors.length - TOASTS_MAX }), 'error')
    // o jobs:start acabou de gravar ou apagar as senhas lembradas: atualiza os avisos
    await saveBatch(rows).catch(() => undefined)
  }

  const stopAll = (): void => {
    for (const a of rows) {
      const job = jobs[a.id]
      if (job && job.state !== 'finished') invoke('jobs:stop', { jobId: job.id }).catch(fail)
    }
  }

  const failedRows = rows.filter((a) => jobs[a.id]?.status === 'error')
  const retryErrors = (): void => {
    if (failedRows.length === 0) {
      toast(t('batch.noErrors'), 'info')
      return
    }
    // jobs:start (não retry): usa a senha e os dados corrigidos na tabela
    requestStart(failedRows, (a) => jobs[a.id]?.mode ?? mode)
  }

  const removeRow = (id: string): void => {
    const job = jobs[id]
    if (job) invoke('jobs:remove', { jobId: job.id }).catch(() => undefined)
    setRows((list) => list.filter((a) => a.id !== id))
    setSelected((s) => {
      const next = new Set(s)
      next.delete(id)
      return next
    })
    dropPasswords([id])
  }

  // ações das linhas: estáveis para as linhas memorizadas não renderizarem à toa
  const latest = useRef({ rows, jobs, mode, requestStart, removeRow })
  useLayoutEffect(() => {
    latest.current = { rows, jobs, mode, requestStart, removeRow }
  })
  const actions = useMemo<RowActions>(() => {
    const find = (id: string): Account | undefined => latest.current.rows.find((a) => a.id === id)
    return {
      onChange: update,
      onSelect: (id, on) =>
        setSelected((s) => {
          const next = new Set(s)
          if (on) next.add(id)
          else next.delete(id)
          return next
        }),
      onStart: (id) => {
        const a = find(id)
        const m = latest.current.mode
        if (a) latest.current.requestStart([a], () => m)
      },
      onStop: (id) => {
        const job = latest.current.jobs[id]
        if (job) invoke('jobs:stop', { jobId: job.id }).catch(fail)
      },
      onRetry: (id) => {
        const a = find(id)
        const m = latest.current.jobs[id]?.mode ?? latest.current.mode
        if (a) latest.current.requestStart([a], () => m)
      },
      onDetails: setDetailsId,
      onRemove: (id) => latest.current.removeRow(id),
      onPasswords: setPasswordsId,
    }
  }, [update, fail])

  const selectedRows = rows.filter((a) => selected.has(a.id))
  const anyActive = rows.some((a) => isActive(a.id))
  const details = rows.find((a) => a.id === detailsId) ?? null
  const passwordsRow = rows.find((a) => a.id === passwordsId) ?? null

  const applyProfiles = (
    source: string | null | undefined,
    dest: string | null | undefined,
  ): void => {
    const target = (a: Account): boolean => selected.has(a.id) && !isActive(a.id)
    const n = rows.filter(target).length
    setRows((list) =>
      list.map((a) => {
        if (!target(a)) return a
        let next = a
        if (source !== undefined) next = withProfile(next, 'source', source, profiles)
        if (dest !== undefined) next = withProfile(next, 'dest', dest, profiles)
        return next
      }),
    )
    toast(n === 1 ? t('batch.appliedOne') : t('batch.applied', { n }), 'ok')
  }

  return (
    <div
      className="relative flex flex-col gap-5 px-9 py-8"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        importFile(e.dataTransfer.files[0])
      }}
    >
      <PageHeader title={t('batch.title')}>
        <Button onClick={() => fileInput.current?.click()}>
          <Icon name="upload" size={16} />
          {t('batch.import')}
        </Button>
        <Button onClick={() => void exportCsv()} disabled={rows.length === 0}>
          <Icon name="download" size={16} />
          {t('batch.export')}
        </Button>
        <Button onClick={() => setRows((list) => [...list, blankAccount()])}>
          <Icon name="plus" size={16} />
          {t('batch.add')}
        </Button>
        <Button onClick={() => setApplying(true)} disabled={selectedRows.length === 0}>
          <Icon name="server" size={16} />
          {t('batch.applyProfile')}
        </Button>
      </PageHeader>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={(e) => {
          importFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">{t('batch.mode')}</span>
          <Select value={mode} onChange={(e) => setMode(e.target.value as JobMode)}>
            {MODES.map((m) => (
              <option key={m.mode} value={m.mode}>
                {t(m.label)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">{t('batch.parallelism')}</span>
          <Select
            value={parallelism}
            onChange={(e) =>
              invoke('settings:update', { parallelism: Number(e.target.value) }).catch(fail)
            }
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </label>
        <Button
          variant="primary"
          className="min-w-[150px]"
          disabled={busy || rows.length === 0}
          onClick={() => requestStart(rows, () => mode)}
        >
          <Icon name="play" size={14} />
          {t('batch.startAll')}
        </Button>
        <Button variant="danger" disabled={!anyActive} onClick={stopAll}>
          <Icon name="stop" size={14} />
          {t('batch.stopAll')}
        </Button>
        <Button disabled={busy || failedRows.length === 0} onClick={retryErrors}>
          <Icon name="retry" size={16} />
          {t('batch.retryErrors')}
        </Button>
        {selectedRows.length > 0 && (
          <span className="pb-3 text-[13px] text-muted">
            {t('batch.selected', { n: selectedRows.length })}
          </span>
        )}
      </div>

      {importErrors.length > 0 && (
        <section
          aria-label={t('batch.importErrors')}
          className="flex flex-col gap-2 rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-[13px]"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-warn">{t('batch.importErrors')}</span>
            <button
              type="button"
              onClick={() => setImportErrors([])}
              className="flex size-8 cursor-pointer items-center justify-center rounded-md text-fg-2 hover:bg-active"
            >
              <Icon name="close" size={16} label={t('common.dismiss')} />
            </button>
          </div>
          <ul className="m-0 flex max-h-40 list-none flex-col gap-0.5 overflow-y-auto p-0 text-fg-2">
            {importErrors.map((e) => (
              <li key={e.line}>{t('batch.importLine', { line: e.line, message: e.message })}</li>
            ))}
          </ul>
        </section>
      )}

      {summary && summary.total > 0 && <BatchSummary summary={summary} />}

      {rows.length === 0 ? (
        <div className="glass flex flex-col gap-2 p-6">
          <p className="m-0 text-fg-2">{t('batch.empty')}</p>
          <p className="m-0 text-[13px] text-muted">{t('batch.formatHint')}</p>
        </div>
      ) : (
        <AccountsTable
          rows={rows}
          jobs={jobs}
          passwordOk={passwordOk}
          profiles={profiles}
          selected={selected}
          onSelectAll={(on) => setSelected(on ? new Set(rows.map((a) => a.id)) : new Set())}
          actions={actions}
        />
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-accent-line bg-[var(--overlay)] text-lg font-semibold text-accent">
          {t('batch.drop')}
        </div>
      )}

      <PasswordsDialog
        account={passwordsRow}
        saved={passwordsRow ? savedPasswords[passwordsRow.id] : undefined}
        onChange={(fn) => passwordsRow && update(passwordsRow.id, fn)}
        onClose={() => setPasswordsId(null)}
      />
      <ApplyProfileDialog
        open={applying}
        count={selectedRows.length}
        profiles={profiles}
        onApply={applyProfiles}
        onClose={() => setApplying(false)}
      />
      <StartDialog
        pending={pending}
        parallelism={parallelism}
        onStart={() => pending && void runStart(pending.plan.ready, pending.modeOf)}
        onClose={() => setPending(null)}
      />
      <DetailsDrawer
        account={details}
        job={details ? (jobs[details.id] ?? null) : null}
        saved={details ? savedPasswords[details.id] : undefined}
        profiles={profiles}
        onChange={(fn) => details && update(details.id, fn)}
        onClose={() => setDetailsId(null)}
      />
    </div>
  )
}
