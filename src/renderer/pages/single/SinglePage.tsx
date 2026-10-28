import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { accountSchema, applyProfile, type Account, type JobMode } from '@shared/model'
import { isActive, latestJobOf, useApp } from '../../app/store'
import { Button } from '../../components/Button'
import {
  EndpointForm,
  endpointErrors,
  hasErrors,
  type EndpointErrors,
} from '../../components/EndpointForm'
import { ConfirmDialog, PageHeader } from '../../components/Form'
import { Icon } from '../../components/Icon'
import { JobPanel } from '../../components/JobPanel'
import { OptionsForm } from '../../components/OptionsForm'
import { t } from '../../i18n/pt-BR'
import { blankAccount } from '../../lib/accounts'
import { invoke } from '../../lib/api'

// "Uma conta": origem e destino lado a lado, opções e os quatro botões (Testar login, Medir,
// Simular, Migrar). O formulário é gravado sozinho (sem senha) para reabrir onde parou; as
// senhas digitadas ficam só neste estado e vão ao main no jobs:start.

const SAVE_DELAY_MS = 800

const MODES: readonly { mode: JobMode; label: 'single.login' | 'single.sizes' | 'single.dry' }[] = [
  { mode: 'login', label: 'single.login' },
  { mode: 'sizes', label: 'single.sizes' },
  { mode: 'dry', label: 'single.dry' },
]

export function SinglePage(): React.JSX.Element {
  const saved = useApp((s) => s.accounts)
  // espera o accounts:load para não criar uma conta nova por cima da salva
  if (!saved) return <PageHeaderOnly />
  return <SingleForm initial={saved.single} />
}

function PageHeaderOnly(): React.JSX.Element {
  return (
    <div className="px-9 py-8">
      <PageHeader title={t('single.title')} />
    </div>
  )
}

function SingleForm({ initial }: { initial: Account | null }): React.JSX.Element {
  const profiles = useApp((s) => s.profiles)
  const savedPasswords = useApp((s) => s.savedPasswords)
  const saveSingle = useApp((s) => s.saveSingle)
  const toast = useApp((s) => s.toast)

  const [base, setAccount] = useState<Account>(() => initial ?? blankAccount())
  const [password1, setPassword1] = useState('')
  const [password2, setPassword2] = useState('')
  const [optionsValid, setOptionsValid] = useState(true)
  const [attempted, setAttempted] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  // perfil editado ou excluído em "Perfis": os lados presos a ele acompanham. Lista vazia =
  // perfis ainda não carregados (os prontos sempre existem); aplicar viraria "Personalizado".
  const account = useMemo(
    () =>
      profiles.length === 0
        ? base
        : {
            ...base,
            source: applyProfile(base.source, profiles),
            dest: applyProfile(base.dest, profiles),
          },
    [base, profiles],
  )

  const job = useApp((s) => latestJobOf(s.jobs, account.id))
  const active = isActive(job)

  // grava o formulário (sem senha) um pouco depois da última mudança, se estiver válido; ao
  // sair da tela grava o que estiver pendente (a tela é recriada a partir do store)
  const pendingSave = useRef<Account | null>(null)
  const flushSave = useCallback(() => {
    const pending = pendingSave.current
    pendingSave.current = null
    if (pending) saveSingle(pending).catch(() => undefined)
  }, [saveSingle])
  useEffect(() => {
    const parsed = accountSchema.safeParse(account)
    if (!parsed.success) return
    pendingSave.current = parsed.data
    const timer = setTimeout(flushSave, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [account, flushSave])
  useEffect(() => flushSave, [flushSave])

  const flags = savedPasswords[account.id] ?? { source: false, dest: false }
  const errors = useMemo(() => {
    const source = endpointErrors(
      account.source,
      password1 !== '' || (account.source.rememberPassword && flags.source),
      t('single.missingPassword1'),
    )
    const dest = endpointErrors(
      account.dest,
      password2 !== '' || (account.dest.rememberPassword && flags.dest),
      t('single.missingPassword2'),
    )
    return { source, dest }
  }, [account, password1, password2, flags.source, flags.dest])
  const valid = !hasErrors(errors.source) && !hasErrors(errors.dest) && optionsValid

  const shown = (e: EndpointErrors): EndpointErrors => (attempted ? e : {})
  const onOptionsValid = useCallback((v: boolean) => setOptionsValid(v), [])

  const start = async (mode: JobMode): Promise<void> => {
    setAttempted(true)
    const parsed = accountSchema.safeParse(account)
    if (!valid || !parsed.success) {
      toast(t('form.fixErrors'), 'error')
      return
    }
    setBusy(true)
    try {
      const { warnings } = await invoke('jobs:start', {
        account: parsed.data,
        mode,
        password1: password1 || undefined,
        password2: password2 || undefined,
      })
      for (const w of warnings) toast(w, 'warn')
      // atualiza o aviso de senha lembrada (o jobs:start acabou de gravar ou apagar)
      await saveSingle(parsed.data).catch(() => undefined)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const stop = (): void => {
    if (!job) return
    invoke('jobs:stop', { jobId: job.id }).catch((err: Error) => toast(err.message, 'error'))
  }

  return (
    <div className="flex flex-col gap-6 px-9 py-8">
      <PageHeader title={t('single.title')} />

      <fieldset disabled={active} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <EndpointForm
            side="source"
            value={account.source}
            onChange={(source) => setAccount((a) => ({ ...a, source }))}
            password={password1}
            onPassword={setPassword1}
            passwordSaved={flags.source}
            profiles={profiles}
            errors={shown(errors.source)}
          />
          <EndpointForm
            side="dest"
            value={account.dest}
            onChange={(dest) => setAccount((a) => ({ ...a, dest }))}
            password={password2}
            onPassword={setPassword2}
            passwordSaved={flags.dest}
            profiles={profiles}
            errors={shown(errors.dest)}
          />
        </div>
        <OptionsForm
          key={account.id}
          value={account.options}
          onChange={(options) => setAccount((a) => ({ ...a, options }))}
          onValidChange={onOptionsValid}
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-2.5">
        {active ? (
          <Button
            variant="danger"
            onClick={stop}
            disabled={job?.state === 'stopping'}
            className="min-w-[140px]"
          >
            <Icon name="stop" size={14} />
            {t('single.stop')}
          </Button>
        ) : (
          <>
            {MODES.map(({ mode, label }) => (
              <Button key={mode} disabled={busy} onClick={() => void start(mode)}>
                {t(label)}
              </Button>
            ))}
            <Button
              variant="primary"
              disabled={busy}
              className="min-w-[140px]"
              onClick={() => {
                setAttempted(true)
                if (valid) setConfirming(true)
                else toast(t('form.fixErrors'), 'error')
              }}
            >
              <Icon name="play" size={14} />
              {t('single.migrate')}
            </Button>
          </>
        )}
      </div>

      {job && <JobPanel job={job} />}

      <ConfirmDialog
        open={confirming}
        title={t('single.confirmTitle')}
        message={t('single.confirmMessage', {
          user1: account.source.user,
          host1: account.source.host,
          user2: account.dest.user,
          host2: account.dest.host,
        })}
        confirm={t('single.migrate')}
        danger={false}
        onConfirm={() => void start('migrate')}
        onClose={() => setConfirming(false)}
      />
    </div>
  )
}
