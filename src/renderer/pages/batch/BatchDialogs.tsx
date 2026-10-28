import { useState } from 'react'
import { applyProfile, type Account, type JobSnapshot, type ServerProfile } from '@shared/model'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { EndpointForm } from '../../components/EndpointForm'
import { Check, Field, Select, TextInput } from '../../components/Form'
import { Icon } from '../../components/Icon'
import { JobPanel } from '../../components/JobPanel'
import { OptionsForm } from '../../components/OptionsForm'
import { t } from '../../i18n/pt-BR'
import { useBatchPasswords } from './passwords'
import { rowName, type SavedFlags, type StartPlan } from './rows'

// Diálogos da tela "Várias contas": senhas de uma linha, aplicar perfil às selecionadas,
// confirmação antes de iniciar (com os avisos) e o painel lateral com os detalhes da conta.

const NAMES_MAX = 5

/** "a, b, c e mais 4". */
function names(list: readonly Account[]): string {
  const shown = list.slice(0, NAMES_MAX).map(rowName).join(', ')
  const rest = list.length - NAMES_MAX
  return rest > 0 ? `${shown} ${t('batch.andMore', { n: rest })}` : shown
}

export function PasswordsDialog({
  account,
  saved,
  onChange,
  onClose,
}: {
  account: Account | null
  saved: SavedFlags | undefined
  onChange: (update: (a: Account) => Account) => void
  onClose: () => void
}): React.JSX.Element | null {
  const typed = useBatchPasswords((s) => (account ? s.byAccount[account.id] : undefined))
  const setTyped = useBatchPasswords((s) => s.set)
  if (!account) return null
  const name = rowName(account)
  const sides = [
    ['source', 'password1', 'batch.password1', 'batch.remember1'],
    ['dest', 'password2', 'batch.password2', 'batch.remember2'],
  ] as const

  return (
    <Dialog
      open
      onClose={onClose}
      label={t('batch.passwordsTitle', { name })}
      className="flex w-[460px] max-w-[calc(100vw-32px)] flex-col gap-4 rounded-lg p-6"
    >
      <h2 className="m-0 text-lg font-semibold">{t('batch.passwordsTitle', { name })}</h2>
      {sides.map(([side, key, label, remember], i) => (
        <div key={side} className="flex flex-col gap-1">
          <Field label={`${t(label)} · ${account[side].user || '—'}`}>
            <TextInput
              type="password"
              autoFocus={i === 0}
              autoComplete="new-password"
              spellCheck={false}
              value={typed?.[key] ?? ''}
              placeholder={
                saved?.[side] && account[side].rememberPassword
                  ? t('endpoint.passwordSaved')
                  : undefined
              }
              onChange={(e) => setTyped(account.id, { [key]: e.target.value })}
            />
          </Field>
          <Check
            label={t(remember)}
            checked={account[side].rememberPassword}
            onChange={(rememberPassword) =>
              onChange((a) => ({ ...a, [side]: { ...a[side], rememberPassword } }))
            }
          />
        </div>
      ))}
      <p className="m-0 text-[13px] text-muted">{t('endpoint.rememberHint')}</p>
      <div className="flex justify-end">
        <Button variant="primary" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </Dialog>
  )
}

const KEEP = '__keep__'

export function ApplyProfileDialog({
  open,
  count,
  profiles,
  onApply,
  onClose,
}: {
  open: boolean
  count: number
  profiles: readonly ServerProfile[]
  /** `undefined` = não mudar o lado; `null` = Personalizado. */
  onApply: (source: string | null | undefined, dest: string | null | undefined) => void
  onClose: () => void
}): React.JSX.Element {
  const [source, setSource] = useState(KEEP)
  const [dest, setDest] = useState(KEEP)
  const decode = (v: string): string | null | undefined => (v === KEEP ? undefined : v || null)
  const select = (value: string, set: (v: string) => void, label: string) => (
    <Field label={label}>
      <Select value={value} onChange={(e) => set(e.target.value)}>
        <option value={KEEP}>{t('batch.keep')}</option>
        <option value="">{t('server.custom')}</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </Field>
  )
  return (
    <Dialog
      open={open}
      onClose={onClose}
      label={t('batch.applyTitle')}
      className="flex w-[480px] max-w-[calc(100vw-32px)] flex-col gap-4 rounded-lg p-6"
    >
      <h2 className="m-0 text-lg font-semibold">{t('batch.applyTitle')}</h2>
      <p className="m-0 text-[13px] text-muted">{t('batch.selected', { n: count })}</p>
      {select(source, setSource, t('endpoint.source'))}
      {select(dest, setDest, t('endpoint.dest'))}
      <p className="m-0 text-[13px] text-muted">{t('batch.applyHint')}</p>
      <div className="flex justify-end gap-2.5">
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          variant="primary"
          disabled={source === KEEP && dest === KEEP}
          onClick={() => {
            onApply(decode(source), decode(dest))
            onClose()
          }}
        >
          {t('batch.apply')}
        </Button>
      </div>
    </Dialog>
  )
}

/** Muda o perfil de um lado (`null` solta do perfil mantendo host/porta/segurança). */
export function withProfile(
  a: Account,
  side: 'source' | 'dest',
  profileId: string | null,
  profiles: readonly ServerProfile[],
): Account {
  return { ...a, [side]: applyProfile({ ...a[side], profileId }, profiles) }
}

export interface PendingStart {
  plan: StartPlan
  modeLabel: string
  migrate: boolean
}

export function StartDialog({
  pending,
  parallelism,
  onStart,
  onClose,
}: {
  pending: PendingStart | null
  parallelism: number
  onStart: () => void
  onClose: () => void
}): React.JSX.Element | null {
  if (!pending) return null
  const { plan } = pending
  const n = plan.ready.length
  const title =
    n === 0
      ? t('batch.nothingToStart')
      : n === 1
        ? t('batch.confirmTitleOne')
        : t('batch.confirmTitle', { n })
  return (
    <Dialog
      open
      onClose={onClose}
      label={title}
      className="flex w-[520px] max-w-[calc(100vw-32px)] flex-col gap-4 rounded-lg p-6"
    >
      <h2 className="m-0 text-lg font-semibold">{title}</h2>
      {n > 0 && (
        <p className="m-0 text-fg-2">
          {t('batch.confirmMode', { mode: pending.modeLabel, p: parallelism })}
          {pending.migrate && ` ${t('batch.confirmMigrate')}`}
        </p>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
        {plan.missingPassword.length > 0 && (
          <Warn text={t('batch.missingPassword', { names: names(plan.missingPassword) })} />
        )}
        {plan.invalid.length > 0 && (
          <Warn text={t('batch.invalidRows', { names: names(plan.invalid) })} />
        )}
        {plan.crowdedHosts.map(({ host, count }) => (
          <Warn key={host} text={t('batch.crowded', { host, count })} />
        ))}
      </ul>
      <div className="flex justify-end gap-2.5">
        <Button autoFocus onClick={onClose}>
          {t(n > 0 ? 'common.cancel' : 'common.close')}
        </Button>
        {n > 0 && (
          <Button
            variant="primary"
            onClick={() => {
              onClose()
              onStart()
            }}
          >
            <Icon name="play" size={14} />
            {t('batch.startN', { n })}
          </Button>
        )}
      </div>
    </Dialog>
  )
}

function Warn({ text }: { text: string }): React.JSX.Element {
  return (
    <li className="flex gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-warn">
      <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
      {text}
    </li>
  )
}

/** Painel lateral: andamento da conta (JobPanel) e todos os dados dela, editáveis se parada. */
export function DetailsDrawer({
  account,
  job,
  saved,
  profiles,
  onChange,
  onClose,
}: {
  account: Account | null
  job: JobSnapshot | null
  saved: SavedFlags | undefined
  profiles: readonly ServerProfile[]
  onChange: (update: (a: Account) => Account) => void
  onClose: () => void
}): React.JSX.Element | null {
  const typed = useBatchPasswords((s) => (account ? s.byAccount[account.id] : undefined))
  const setTyped = useBatchPasswords((s) => s.set)
  if (!account) return null
  const active = job !== null && job.state !== 'finished'
  const title = t('batch.detailsTitle', { name: rowName(account) })

  return (
    <Dialog
      open
      onClose={onClose}
      label={title}
      placement="right"
      className="flex h-full w-[760px] max-w-[calc(100vw-48px)] flex-col overflow-y-auto"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-6 py-4">
        <h2 className="m-0 truncate text-lg font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-2 hover:bg-active hover:text-fg"
        >
          <Icon name="close" label={t('common.close')} />
        </button>
      </div>
      <div className="flex flex-col gap-5 p-6">
        {job ? <JobPanel job={job} /> : <p className="m-0 text-fg-2">{t('batch.noJob')}</p>}
        {active && <p className="m-0 text-[13px] text-muted">{t('batch.running')}</p>}
        <fieldset disabled={active} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
          <Field label={t('batch.label')} hint={t('batch.labelHint')}>
            <TextInput
              value={account.label}
              spellCheck={false}
              onChange={(e) => {
                const label = e.target.value
                onChange((a) => ({ ...a, label }))
              }}
            />
          </Field>
          <EndpointForm
            side="source"
            value={account.source}
            onChange={(source) => onChange((a) => ({ ...a, source }))}
            password={typed?.password1 ?? ''}
            onPassword={(password1) => setTyped(account.id, { password1 })}
            passwordSaved={saved?.source ?? false}
            profiles={profiles}
          />
          <EndpointForm
            side="dest"
            value={account.dest}
            onChange={(dest) => onChange((a) => ({ ...a, dest }))}
            password={typed?.password2 ?? ''}
            onPassword={(password2) => setTyped(account.id, { password2 })}
            passwordSaved={saved?.dest ?? false}
            profiles={profiles}
          />
          <OptionsForm
            key={account.id}
            value={account.options}
            onChange={(options) => onChange((a) => ({ ...a, options }))}
            onValidChange={noop}
          />
        </fieldset>
      </div>
    </Dialog>
  )
}

const noop = (): void => undefined
