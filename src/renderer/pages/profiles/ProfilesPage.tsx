import { useMemo, useState } from 'react'
import { checkExtraArgs, splitArgs } from '@shared/extraArgs'
import { isBuiltinProfile, type ServerProfile } from '@shared/model'
import { useApp } from '../../app/store'
import { Button } from '../../components/Button'
import { hasErrors } from '../../components/EndpointForm'
import { ConfirmDialog, Field, Notes, PageHeader, TextInput } from '../../components/Form'
import { Icon } from '../../components/Icon'
import { ServerFields, serverErrors } from '../../components/ServerFields'
import { t } from '../../i18n/pt-BR'
import { invoke } from '../../lib/api'

// Perfis de servidor: lista à esquerda (os prontos no topo, somente leitura) e o formulário
// do perfil escolhido à direita. Salvar e excluir passam pelo main, que confere nome repetido.

type Draft = Omit<ServerProfile, 'id'> & { id?: string }

const blankDraft = (): Draft => ({
  name: '',
  host: '',
  port: 993,
  security: 'ssl',
  preset: 'none',
  allowInvalidCert: false,
  extraArgs: '',
})

export function ProfilesPage(): React.JSX.Element {
  const profiles = useApp((s) => s.profiles)
  const loadProfiles = useApp((s) => s.loadProfiles)
  const toast = useApp((s) => s.toast)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)

  const readOnly = draft?.id !== undefined && isBuiltinProfile(draft.id)
  const extra = useMemo(() => checkExtraArgs(splitArgs(draft?.extraArgs ?? '')), [draft?.extraArgs])

  const open = (next: Draft | null): void => {
    setDraft(next)
    setAttempted(false)
  }

  const fail = (err: Error): void => toast(err.message, 'error')

  const save = async (): Promise<void> => {
    if (!draft) return
    setAttempted(true)
    if (hasErrors(serverErrors(draft)) || !draft.name.trim() || extra.errors.length > 0) {
      toast(t('form.fixErrors'), 'error')
      return
    }
    setBusy(true)
    try {
      const saved = await invoke('profiles:save', draft)
      await loadProfiles()
      open(saved)
      toast(t('profiles.saved'), 'ok')
    } catch (err) {
      fail(err as Error)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!draft?.id) return
    try {
      await invoke('profiles:delete', { id: draft.id })
      await loadProfiles()
      open(null)
      toast(t('profiles.deleted'), 'ok')
    } catch (err) {
      fail(err as Error)
    }
  }

  const fieldErrors = attempted && draft ? serverErrors(draft) : {}
  const nameError = attempted && draft && !draft.name.trim() ? t('form.required') : undefined

  return (
    <div className="flex flex-col gap-6 px-9 py-8">
      <PageHeader title={t('profiles.title')}>
        <Button variant="primary" onClick={() => open(blankDraft())}>
          <Icon name="plus" />
          {t('profiles.new')}
        </Button>
      </PageHeader>

      <p className="m-0 flex items-center gap-2.5 text-fg-2">
        <Icon name="info" className="shrink-0 text-accent" />
        {t('profiles.appPasswordNote')}
      </p>

      <div className="grid grid-cols-[280px_1fr] items-start gap-5">
        <nav aria-label={t('profiles.list')} className="glass flex flex-col gap-1 p-2">
          {profiles.map((p) => {
            const selected = draft?.id === p.id
            return (
              <button
                key={p.id}
                type="button"
                aria-current={selected ? 'true' : undefined}
                onClick={() => open(p)}
                className={`flex min-h-11 cursor-pointer flex-col items-start justify-center rounded-[10px] px-3 py-2 text-left transition-colors ${selected ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-hover hover:text-fg'}`}
              >
                <span className="flex w-full items-center gap-2 font-medium">
                  <span className="truncate">{p.name}</span>
                  {isBuiltinProfile(p.id) && (
                    <span className="rounded-sm border border-line-strong px-1.5 text-[11px] font-normal text-muted">
                      {t('profiles.builtin')}
                    </span>
                  )}
                </span>
                <span className="num w-full truncate text-xs text-muted">
                  {p.host}:{p.port}
                </span>
              </button>
            )
          })}
        </nav>

        {draft ? (
          <section
            aria-label={draft.name || t('profiles.new')}
            className="glass flex flex-col gap-4 p-5"
          >
            {readOnly && <p className="m-0 text-[13px] text-muted">{t('profiles.builtinHint')}</p>}
            <fieldset disabled={readOnly} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
              <Field label={t('profiles.name')} error={nameError}>
                <TextInput
                  autoFocus={!draft.id}
                  value={draft.name}
                  aria-invalid={nameError ? true : undefined}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <ServerFields
                idPrefix="profile"
                value={draft}
                errors={fieldErrors}
                onChange={(patch) => setDraft({ ...draft, ...patch })}
              />
              <Field label={t('server.extraArgs')} hint={t('server.extraArgsHint')}>
                <TextInput
                  value={draft.extraArgs}
                  spellCheck={false}
                  className="num text-sm"
                  aria-invalid={extra.errors.length > 0 ? true : undefined}
                  onChange={(e) => setDraft({ ...draft, extraArgs: e.target.value })}
                />
              </Field>
              <Notes errors={extra.errors} warnings={extra.warnings} />
            </fieldset>

            <div className="flex flex-wrap gap-2.5">
              {readOnly ? (
                <Button
                  onClick={() => {
                    const copy: Draft = {
                      ...draft,
                      name: t('profiles.copyOf', { name: draft.name }),
                    }
                    delete copy.id
                    open(copy)
                  }}
                >
                  <Icon name="copy" />
                  {t('profiles.duplicate')}
                </Button>
              ) : (
                <>
                  <Button variant="primary" disabled={busy} onClick={() => void save()}>
                    {t('common.save')}
                  </Button>
                  {draft.id && (
                    <Button variant="danger" onClick={() => setDeleting(true)}>
                      <Icon name="trash" />
                      {t('common.delete')}
                    </Button>
                  )}
                </>
              )}
            </div>
          </section>
        ) : (
          <p className="m-0 py-4 text-fg-2">{t('profiles.empty')}</p>
        )}
      </div>

      <ConfirmDialog
        open={deleting}
        title={t('profiles.deleteTitle')}
        message={t('profiles.deleteMessage', { name: draft?.name ?? '' })}
        confirm={t('common.delete')}
        onConfirm={() => void remove()}
        onClose={() => setDeleting(false)}
      />
    </div>
  )
}
