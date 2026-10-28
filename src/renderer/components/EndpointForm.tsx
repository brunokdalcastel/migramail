import { useState } from 'react'
import { applyProfile, type Endpoint, type ServerProfile } from '@shared/model'
import { t } from '../i18n/pt-BR'
import { Check, Field, Select, TextInput } from './Form'
import { Icon } from './Icon'
import { ServerFields, serverErrors, type ServerErrors } from './ServerFields'

// Um lado da conta (origem ou destino). Com perfil escolhido, host/porta/segurança/ajustes
// vêm dele e ficam travados; "Personalizado" destrava. A senha fica no estado de quem usa o
// formulário (nunca no Endpoint) e só vai ao main no jobs:start.

export interface EndpointErrors extends ServerErrors {
  user?: string | undefined
  password?: string | undefined
}

/** Erros do lado; `passwordOk` diz se há senha digitada ou lembrada utilizável. */
export function endpointErrors(e: Endpoint, passwordOk: boolean, missing: string): EndpointErrors {
  const errors: EndpointErrors = serverErrors(e)
  if (!e.user.trim()) errors.user = t('form.required')
  if (!passwordOk) errors.password = missing
  return errors
}

export const hasErrors = (errors: object): boolean =>
  Object.values(errors).some((v) => v !== undefined)

export function EndpointForm({
  side,
  value,
  onChange,
  password,
  onPassword,
  passwordSaved,
  profiles,
  errors = {},
}: {
  side: 'source' | 'dest'
  value: Endpoint
  onChange: (next: Endpoint) => void
  password: string
  onPassword: (password: string) => void
  /** Há senha lembrada para este lado. */
  passwordSaved: boolean
  profiles: readonly ServerProfile[]
  errors?: EndpointErrors
}): React.JSX.Element {
  const [showPassword, setShowPassword] = useState(false)
  const profile = profiles.find((p) => p.id === value.profileId) ?? null
  const id = `endpoint-${side}`

  return (
    <section aria-labelledby={`${id}-title`} className="glass flex flex-col gap-4 p-5">
      <h2 id={`${id}-title`} className="label m-0">
        {t(side === 'source' ? 'endpoint.source' : 'endpoint.dest')}
      </h2>

      <Field
        label={t('server.profile')}
        hint={profile ? t('server.lockedHint', { name: profile.name }) : undefined}
      >
        <Select
          value={value.profileId ?? ''}
          onChange={(e) => {
            const profileId = e.target.value || null
            onChange(applyProfile({ ...value, profileId }, profiles))
          }}
        >
          <option value="">{t('server.custom')}</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>

      <ServerFields
        idPrefix={id}
        value={value}
        disabled={profile !== null}
        errors={errors}
        onChange={(patch) => onChange({ ...value, ...patch })}
      />

      <Field label={t('endpoint.user')} error={errors.user}>
        <TextInput
          value={value.user}
          spellCheck={false}
          autoComplete="off"
          placeholder="usuario@exemplo.com.br"
          aria-invalid={errors.user ? true : undefined}
          onChange={(e) => onChange({ ...value, user: e.target.value })}
        />
      </Field>

      <Field label={t('endpoint.password')} error={errors.password}>
        <div className="flex gap-2">
          <TextInput
            type={showPassword ? 'text' : 'password'}
            value={password}
            autoComplete="new-password"
            spellCheck={false}
            className="min-w-0 flex-1"
            placeholder={
              passwordSaved && value.rememberPassword ? t('endpoint.passwordSaved') : undefined
            }
            aria-invalid={errors.password ? true : undefined}
            onChange={(e) => onPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            title={t(showPassword ? 'common.hide' : 'common.show')}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line-strong bg-hover text-fg-2 hover:bg-active hover:text-fg"
          >
            <Icon
              name={showPassword ? 'eyeOff' : 'eye'}
              label={t(showPassword ? 'common.hide' : 'common.show')}
            />
          </button>
        </div>
      </Field>

      <Check
        label={t('endpoint.remember')}
        hint={t('endpoint.rememberHint')}
        checked={value.rememberPassword}
        onChange={(rememberPassword) => onChange({ ...value, rememberPassword })}
      />
    </section>
  )
}
