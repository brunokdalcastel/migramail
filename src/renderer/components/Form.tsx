import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { t } from '../i18n/pt-BR'

// Peças de formulário com os tokens: rótulo sempre visível (acessível), campos com 44 px de
// altura e foco no acento.

const FIELD =
  'h-11 rounded-md border border-line-strong bg-glass px-3 text-[15px] text-fg outline-none focus:border-accent-line disabled:opacity-50'

export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label: string
  hint?: string
  /** Erro de validação: aparece no lugar da dica, em vermelho. */
  error?: string | undefined
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[13px] text-muted">{label}</span>
      {children}
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : (
        hint && <span className="text-xs text-muted">{hint}</span>
      )}
    </label>
  )
}

export function TextInput({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input className={`${FIELD} ${className}`} {...props} />
}

export function TextArea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return (
    <textarea
      className={`min-h-[88px] resize-y rounded-md border border-line-strong bg-glass px-3 py-2.5 text-[15px] text-fg outline-none focus:border-accent-line disabled:opacity-50 ${className}`}
      {...props}
    />
  )
}

/** Lista de avisos (amarelo) e erros (vermelho) logo abaixo de um campo. */
export function Notes({
  errors = [],
  warnings = [],
}: {
  errors?: readonly string[]
  warnings?: readonly string[]
}): React.JSX.Element | null {
  if (errors.length === 0 && warnings.length === 0) return null
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
      {errors.map((e) => (
        <li key={e} className="text-danger">
          {e}
        </li>
      ))}
      {warnings.map((w) => (
        <li key={w} className="text-warn">
          {w}
        </li>
      ))}
    </ul>
  )
}

export function Select({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return (
    <select className={`${FIELD} cursor-pointer bg-surface pr-8 ${className}`} {...props}>
      {children}
    </select>
  )
}

/** Caixa de seleção com o rótulo ao lado (alvo de clique de 44 px). */
export function Check({
  label,
  checked,
  onChange,
  hint,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <label
      className={`flex min-h-11 items-start gap-3 py-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-[18px] cursor-pointer accent-[var(--accent)]"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px]">{label}</span>
        {hint && <span className="text-[13px] text-muted">{hint}</span>}
      </span>
    </label>
  )
}

export function PageHeader({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="m-0 text-[28px] font-bold tracking-tight">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  )
}

/** Confirmação de ação destrutiva; o botão de confirmar não é o foco inicial. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirm,
  danger = true,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message: string
  confirm: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      label={title}
      className="flex w-[440px] max-w-[calc(100vw-32px)] flex-col gap-4 rounded-lg p-6"
    >
      <h2 className="m-0 text-lg font-semibold">{title}</h2>
      <p className="m-0 text-fg-2">{message}</p>
      <div className="flex justify-end gap-2.5">
        <Button autoFocus onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={() => {
            onClose()
            onConfirm()
          }}
        >
          {confirm}
        </Button>
      </div>
    </Dialog>
  )
}

/** Abas em lista (vertical) ou em linha (Resumo, Pastas, Log); botões de verdade, navegáveis por Tab. */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  label,
  vertical = false,
}: {
  items: readonly { key: K; label: string }[]
  value: K
  onChange: (key: K) => void
  label: string
  vertical?: boolean
}): React.JSX.Element {
  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={`flex gap-1 ${vertical ? 'flex-col' : 'flex-wrap'}`}
    >
      {items.map((it) => {
        const active = it.key === value
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.key)}
            className={`flex h-10 cursor-pointer items-center rounded-[10px] px-3.5 text-left text-sm font-medium transition-colors ${active ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-hover hover:text-fg'}`}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
