import type { ButtonHTMLAttributes } from 'react'

// Botão base com os tokens. Altura mínima de 44 px (alvo de toque e de clique confortável).

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-fg font-semibold shadow-glow hover:bg-accent-hover disabled:shadow-none',
  secondary: 'border border-line-strong bg-hover text-fg hover:bg-active',
  ghost: 'text-accent hover:bg-accent-soft',
  danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
}

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }): React.JSX.Element {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md px-5 text-[15px] transition-colors duration-150 disabled:cursor-default disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

/** Barra de progresso fina (% da migração). `value` de 0 a 1. */
export function ProgressBar({
  value,
  tone = 'accent',
  label,
}: {
  value: number
  tone?: 'accent' | 'warn' | 'ok'
  label: string
}): React.JSX.Element {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  const color = { accent: 'bg-accent shadow-glow', warn: 'bg-warn', ok: 'bg-ok' }[tone]
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-2 overflow-hidden rounded-full bg-white/[0.07]"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
