import { useApp, type Toast } from '../app/store'
import { t } from '../i18n/pt-BR'

// Avisos no canto inferior: resultado de ações, avisos do jobs:start e erros. Clicar fecha;
// sozinhos somem em 5 s (erro em 10 s, ver store.ts).

const TONE: Record<Toast['kind'], string> = {
  info: 'border-line-strong',
  ok: 'border-ok/40',
  warn: 'border-warn/50',
  error: 'border-danger/50',
}

export function ToastHost(): React.JSX.Element {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex w-[min(560px,calc(100vw-32px))] -translate-x-1/2 flex-col items-center gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          title={t('common.dismiss')}
          onClick={() => dismiss(toast.id)}
          className={`enter pointer-events-auto cursor-pointer rounded-md border bg-surface px-4 py-3 text-left text-sm text-fg shadow-pop ${TONE[toast.kind]}`}
        >
          {toast.text}
        </button>
      ))}
    </div>
  )
}
