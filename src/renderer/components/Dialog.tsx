import { useEffect, useRef, type ReactNode } from 'react'

// Diálogo modal: foco preso dentro dele (Tab dá a volta), Esc fecha, o foco volta para onde
// estava ao fechar. O conteúdo decide o primeiro foco com `autoFocus`. Mesmo comportamento do
// Memora, com a entrada animada em CSS (sem lib de animação).

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Próximo elemento do Tab dentro do diálogo, dando a volta nas pontas. */
export function nextFocus<T>(items: readonly T[], current: T | null, back: boolean): T | undefined {
  if (items.length === 0) return undefined
  const i = current === null ? -1 : items.indexOf(current)
  if (back) return items[i <= 0 ? items.length - 1 : i - 1]
  return items[i < 0 || i === items.length - 1 ? 0 : i + 1]
}

export function Dialog({
  open,
  onClose,
  label,
  children,
  className = '',
  placement = 'center',
}: {
  open: boolean
  onClose: () => void
  label: string
  children: ReactNode
  className?: string
  placement?: 'center' | 'top' | 'right'
}): React.JSX.Element | null {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const el = box.current
    if (el && !el.contains(document.activeElement)) {
      ;(
        el.querySelector<HTMLElement>('[autofocus]') ??
        el.querySelector<HTMLElement>(FOCUSABLE) ??
        el
      ).focus()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !box.current) return
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const target = nextFocus(items, document.activeElement as HTMLElement | null, e.shiftKey)
      if (target) {
        e.preventDefault()
        target.focus()
      }
    }
    // na captura: o diálogo vence os atalhos da tela de baixo
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  const position = {
    center: 'items-center justify-center',
    top: 'items-start justify-center pt-[12vh]',
    right: 'items-stretch justify-end',
  }[placement]

  return (
    <div
      className={`fade fixed inset-0 z-40 flex bg-[var(--overlay)] ${position}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`enter border border-line-strong bg-surface shadow-pop outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  )
}
