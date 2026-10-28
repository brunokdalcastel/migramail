import { defaultPort, type Preset, type Security } from '@shared/model'
import { t } from '../i18n/pt-BR'
import { Check, Field, Select, TextInput } from './Form'

// Campos de servidor usados no perfil e em cada lado da conta: host, porta, segurança,
// ajustes do provedor e "aceitar certificado inválido" (com o aviso vermelho).

export interface ServerValue {
  host: string
  port: number
  security: Security
  preset: Preset
  allowInvalidCert: boolean
}

export interface ServerErrors {
  host?: string | undefined
  port?: string | undefined
}

const SECURITIES: readonly Security[] = ['ssl', 'tls', 'none']
const PRESETS: readonly Preset[] = ['none', 'gmail', 'office']

/** Erros de host e porta (vazio = válido). */
export function serverErrors(v: ServerValue): ServerErrors {
  const errors: ServerErrors = {}
  if (!v.host.trim()) errors.host = t('form.required')
  if (!Number.isInteger(v.port) || v.port < 1 || v.port > 65535) errors.port = t('form.portRange')
  return errors
}

/** Troca a segurança; a porta acompanha se ainda estava no padrão da anterior. */
export function withSecurity<T extends ServerValue>(v: T, security: Security): T {
  const port = v.port === defaultPort(v.security) ? defaultPort(security) : v.port
  return { ...v, security, port }
}

export function ServerFields({
  value,
  onChange,
  disabled = false,
  errors = {},
  idPrefix,
}: {
  value: ServerValue
  onChange: (patch: Partial<ServerValue>) => void
  disabled?: boolean
  errors?: ServerErrors
  idPrefix: string
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <Field label={t('server.host')} error={errors.host}>
          <TextInput
            id={`${idPrefix}-host`}
            value={value.host}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
            placeholder="imap.exemplo.com.br"
            aria-invalid={errors.host ? true : undefined}
            onChange={(e) => onChange({ host: e.target.value })}
          />
        </Field>
        <Field label={t('server.port')} error={errors.port}>
          <TextInput
            inputMode="numeric"
            value={value.port ? String(value.port) : ''}
            disabled={disabled}
            aria-invalid={errors.port ? true : undefined}
            className="num"
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 5)
              onChange({ port: digits ? Number(digits) : 0 })
            }}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('server.security')}>
          <Select
            value={value.security}
            disabled={disabled}
            onChange={(e) => onChange(withSecurity(value, e.target.value as Security))}
          >
            {SECURITIES.map((s) => (
              <option key={s} value={s}>
                {t(`server.security.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('server.preset')}>
          <Select
            value={value.preset}
            disabled={disabled}
            onChange={(e) => onChange({ preset: e.target.value as Preset })}
          >
            {PRESETS.map((p) => (
              <option key={p} value={p}>
                {t(`server.preset.${p}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {value.security === 'none' && (
        <p className="m-0 text-[13px] text-warn">{t('server.securityNone')}</p>
      )}
      {value.security !== 'none' && (
        <div>
          <Check
            label={t('server.invalidCert')}
            checked={value.allowInvalidCert}
            disabled={disabled}
            onChange={(allowInvalidCert) => onChange({ allowInvalidCert })}
          />
          {value.allowInvalidCert && (
            <p
              role="alert"
              className="m-0 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger"
            >
              {t('server.invalidCertWarn')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
