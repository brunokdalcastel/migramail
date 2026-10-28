import { memo, useState } from 'react'
import { hostField, parseHost } from '@shared/csv'
import type { Account, Endpoint, JobSnapshot, ServerProfile } from '@shared/model'
import { ProgressBar } from '../../components/Button'
import { Icon, type IconName } from '../../components/Icon'
import { t } from '../../i18n/pt-BR'
import { formatBytes, formatDuration, formatPercent } from '../../lib/format'
import { jobResult, phaseText, type ResultTone } from '../../lib/jobText'
import { rowName } from './rows'

// Tabela do lote: uma linha por conta, com host/usuário editáveis na própria linha (travados
// enquanto a conta roda), senha (● ou vazio, editada num diálogo), status, % e ações. Clicar
// fora dos campos abre os detalhes da conta.

export interface RowActions {
  onChange: (id: string, update: (a: Account) => Account) => void
  onSelect: (id: string, selected: boolean) => void
  onStart: (id: string) => void
  onStop: (id: string) => void
  onRetry: (id: string) => void
  onDetails: (id: string) => void
  onRemove: (id: string) => void
  onPasswords: (id: string) => void
}

const TONE_TEXT: Record<ResultTone, string> = {
  ok: 'text-ok',
  warning: 'text-warn',
  error: 'text-danger',
  stopped: 'text-fg-2',
}

const CELL_INPUT =
  'h-9 w-full min-w-0 rounded-md border border-line-strong bg-glass px-2.5 text-sm text-fg outline-none focus:border-accent-line disabled:opacity-60 aria-[invalid=true]:border-danger'

export function AccountsTable({
  rows,
  jobs,
  passwordOk,
  profiles,
  selected,
  onSelectAll,
  actions,
}: {
  rows: readonly Account[]
  /** Job mais recente de cada conta. */
  jobs: Readonly<Record<string, JobSnapshot | null>>
  passwordOk: Readonly<Record<string, { source: boolean; dest: boolean }>>
  profiles: readonly ServerProfile[]
  selected: ReadonlySet<string>
  onSelectAll: (selected: boolean) => void
  actions: RowActions
}): React.JSX.Element {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[940px] table-fixed border-collapse text-sm">
        <thead className="bg-white/[0.03] text-left text-[13px] text-muted">
          <tr>
            <th className="w-10 px-3 py-2.5">
              <input
                type="checkbox"
                aria-label={t('batch.col.selectAll')}
                checked={allSelected}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="size-4 cursor-pointer accent-[var(--accent)]"
              />
            </th>
            <th className="w-[100px] px-2 py-2.5 font-medium">{t('batch.col.label')}</th>
            <th className="px-2 py-2.5 font-medium">{t('batch.col.source')}</th>
            <th className="px-2 py-2.5 font-medium">{t('batch.col.dest')}</th>
            <th className="w-[60px] px-2 py-2.5 font-medium">{t('batch.col.password')}</th>
            <th className="w-[150px] px-2 py-2.5 font-medium">{t('batch.col.status')}</th>
            <th className="w-[80px] px-2 py-2.5 font-medium">{t('batch.col.percent')}</th>
            <th className="w-[72px] px-2 py-2.5 text-right font-medium">{t('batch.col.sent')}</th>
            <th className="w-[64px] px-2 py-2.5 text-right font-medium">{t('batch.col.eta')}</th>
            <th className="w-[140px] px-2 py-2.5 text-right font-medium">
              {t('batch.col.actions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              job={jobs[row.id] ?? null}
              pwOk={passwordOk[row.id]}
              profiles={profiles}
              selected={selected.has(row.id)}
              actions={actions}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

const Row = memo(function Row({
  row,
  job,
  pwOk,
  profiles,
  selected,
  actions,
}: {
  row: Account
  job: JobSnapshot | null
  pwOk: { source: boolean; dest: boolean } | undefined
  profiles: readonly ServerProfile[]
  selected: boolean
  actions: RowActions
}): React.JSX.Element {
  const active = job !== null && job.state !== 'finished'
  const name = rowName(row)
  const result = job ? jobResult(job) : null
  const transfers = job !== null && (job.mode === 'dry' || job.mode === 'migrate')
  const p = job?.progress
  const bothPasswords = pwOk?.source === true && pwOk.dest === true

  const side = (key: 'source' | 'dest') => (
    <SideCell
      endpoint={row[key]}
      disabled={active}
      profile={profiles.find((x) => x.id === row[key].profileId) ?? null}
      onChange={(patch) =>
        actions.onChange(row.id, (a) => ({ ...a, [key]: { ...a[key], ...patch } }))
      }
    />
  )

  return (
    <tr
      className={`cursor-pointer border-t border-line align-top transition-colors hover:bg-hover ${selected ? 'bg-accent-soft/40' : ''}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('input, button, select, label, a')) return
        actions.onDetails(row.id)
      }}
    >
      <td className="px-3 py-2.5">
        <input
          type="checkbox"
          aria-label={`${t('batch.col.select')} ${name}`}
          checked={selected}
          onChange={(e) => actions.onSelect(row.id, e.target.checked)}
          className="mt-2.5 size-4 cursor-pointer accent-[var(--accent)]"
        />
      </td>
      <td className="px-2 py-2">
        <input
          className={CELL_INPUT}
          value={row.label}
          disabled={active}
          aria-label={t('batch.col.label')}
          spellCheck={false}
          onChange={(e) => {
            const label = e.target.value
            actions.onChange(row.id, (a) => ({ ...a, label }))
          }}
        />
      </td>
      <td className="px-2 py-2">{side('source')}</td>
      <td className="px-2 py-2">{side('dest')}</td>
      <td className="px-2 py-2">
        <button
          type="button"
          onClick={() => actions.onPasswords(row.id)}
          title={t('batch.passwordEdit', { name })}
          aria-label={t('batch.passwordEdit', { name })}
          className={`mt-1 flex h-9 cursor-pointer items-center gap-1 rounded-md border px-2 ${bothPasswords ? 'border-line-strong text-fg-2' : 'border-warn/50 text-warn'} hover:bg-active`}
        >
          <Icon name="key" size={14} />
          <span className="num text-xs" aria-hidden>
            {bothPasswords ? '●●' : pwOk?.source || pwOk?.dest ? '●○' : '○○'}
          </span>
          <span className="sr-only">
            {t(bothPasswords ? 'batch.passwordBoth' : 'batch.passwordMissing')}
          </span>
        </button>
      </td>
      <td className="px-2 py-2">
        <div className="flex min-h-9 items-center gap-2 pt-1">
          {!job ? (
            <span className="text-muted">{t('batch.idle')}</span>
          ) : result ? (
            <span className={`line-clamp-2 ${TONE_TEXT[result.tone]}`} title={result.hint}>
              {result.title}
            </span>
          ) : (
            <>
              <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent shadow-glow" />
              <span className="truncate" title={phaseText(job)}>
                {phaseText(job)}
              </span>
            </>
          )}
        </div>
      </td>
      <td className="px-2 py-2">
        {transfers && job.percentMessages !== null ? (
          <div className="flex flex-col gap-1 pt-1.5">
            <span className="num text-xs">{formatPercent(job.percentMessages)}</span>
            <ProgressBar
              value={job.percentMessages / 100}
              tone={result?.tone === 'ok' ? 'ok' : 'accent'}
              label={`${t('job.percentMessages')} ${name}`}
            />
          </div>
        ) : (
          <Dash />
        )}
      </td>
      <td className="px-2 py-2 text-right text-xs">
        {transfers && p ? (
          <Num>{formatBytes(p.summary.bytesTransferred ?? p.bytesSent)}</Num>
        ) : (
          <Dash />
        )}
      </td>
      <td className="px-2 py-2 text-right text-xs">
        {active && p?.etaSeconds != null ? <Num>{formatDuration(p.etaSeconds)}</Num> : <Dash />}
      </td>
      <td className="px-2 py-2">
        <div className="flex justify-end gap-1">
          {active ? (
            <IconButton
              icon="stop"
              label={t('batch.stop')}
              tone="danger"
              disabled={job.state === 'stopping'}
              onClick={() => actions.onStop(row.id)}
            />
          ) : (
            <>
              <IconButton
                icon="play"
                label={t('batch.start')}
                onClick={() => actions.onStart(row.id)}
              />
              {job && (
                <IconButton
                  icon="retry"
                  label={t('batch.retry')}
                  onClick={() => actions.onRetry(row.id)}
                />
              )}
            </>
          )}
          <IconButton
            icon="edit"
            label={t('batch.details')}
            onClick={() => actions.onDetails(row.id)}
          />
          <IconButton
            icon="trash"
            label={t('batch.remove')}
            disabled={active}
            onClick={() => actions.onRemove(row.id)}
          />
        </div>
      </td>
    </tr>
  )
})

function Dash(): React.JSX.Element {
  return <span className="mt-2 inline-block text-sm text-muted">—</span>
}

function Num({ children }: { children: string }): React.JSX.Element {
  return <span className="num mt-2.5 inline-block">{children}</span>
}

function IconButton({
  icon,
  label,
  onClick,
  disabled = false,
  tone = 'normal',
}: {
  icon: IconName
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: 'normal' | 'danger'
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-8 cursor-pointer items-center justify-center rounded-md disabled:cursor-default disabled:opacity-40 ${tone === 'danger' ? 'text-danger hover:bg-danger/15' : 'text-fg-2 hover:bg-active hover:text-fg'}`}
    >
      <Icon name={icon} size={16} label={label} />
    </button>
  )
}

/** Host (ou host:porta) e usuário de um lado. Com perfil, o host fica travado. */
function SideCell({
  endpoint,
  disabled,
  profile,
  onChange,
}: {
  endpoint: Endpoint
  disabled: boolean
  profile: ServerProfile | null
  onChange: (patch: Partial<Endpoint>) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      {profile ? (
        <input
          className={CELL_INPUT}
          value={hostField(endpoint)}
          disabled
          title={t('batch.fromProfile', { name: profile.name })}
          aria-label={t('batch.fromProfile', { name: profile.name })}
        />
      ) : (
        // key: o texto em edição recomeça quando o valor muda por fora (Aplicar perfil)
        <HostInput
          key={hostField(endpoint)}
          endpoint={endpoint}
          disabled={disabled}
          onChange={onChange}
        />
      )}
      <input
        className={CELL_INPUT}
        value={endpoint.user}
        disabled={disabled}
        placeholder={t('batch.userPlaceholder')}
        aria-label={t('endpoint.user')}
        aria-invalid={!endpoint.user.trim() || undefined}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onChange({ user: e.target.value })}
      />
    </div>
  )
}

function HostInput({
  endpoint,
  disabled,
  onChange,
}: {
  endpoint: Endpoint
  disabled: boolean
  onChange: (patch: Partial<Endpoint>) => void
}): React.JSX.Element {
  const initial = hostField(endpoint)
  const [text, setText] = useState(initial)
  const parsed = text.trim() ? parseHost(text) : null
  const invalid = parsed === null

  const commit = (): void => {
    if (text.trim() === initial || !parsed) return
    onChange(parsed)
  }

  return (
    <input
      className={CELL_INPUT}
      value={text}
      disabled={disabled}
      placeholder={t('batch.hostPlaceholder')}
      aria-label={t('server.host')}
      aria-invalid={invalid || undefined}
      title={invalid ? t('batch.hostInvalid') : undefined}
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
    />
  )
}
