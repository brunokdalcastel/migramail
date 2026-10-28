import type { ReactNode } from 'react'
import { t, type TextKey } from '../i18n/pt-BR'
import { Icon, type IconName } from '../components/Icon'

// Moldura do app: barra de título própria (área arrastável; os botões do Windows vêm do
// titleBarOverlay, à direita), barra lateral e o conteúdo da página atual.

export const PAGES = ['single', 'batch', 'profiles', 'about'] as const
export type Page = (typeof PAGES)[number]

export const NAV: readonly { page: Page; label: TextKey; icon: IconName }[] = [
  { page: 'single', label: 'nav.single', icon: 'user' },
  { page: 'batch', label: 'nav.batch', icon: 'users' },
  { page: 'profiles', label: 'nav.profiles', icon: 'server' },
  { page: 'about', label: 'nav.about', icon: 'info' },
]

/** Largura reservada aos botões de minimizar/maximizar/fechar do Windows. */
const CAPTION_BUTTONS_PX = 140

export function Shell({
  page,
  version,
  onNavigate,
  children,
}: {
  page: Page
  version: string | null
  onNavigate: (page: Page) => void
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <div
        className="drag flex h-9 shrink-0 items-center gap-2 pl-4 text-[13px] text-muted"
        style={{ paddingRight: CAPTION_BUTTONS_PX }}
      >
        <span className="flex size-[18px] items-center justify-center rounded-[5px] bg-accent text-accent-fg">
          <Icon name="logo" size={12} strokeWidth={2.6} />
        </span>
        {t('app.name')}
      </div>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label={t('nav.label')}
          className="flex w-[232px] shrink-0 flex-col gap-1 border-r border-white/[0.06] bg-white/[0.015] px-3.5 pb-4 pt-3"
        >
          {NAV.map((item) => {
            const active = item.page === page
            return (
              <button
                key={item.page}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(item.page)}
                className={`flex h-11 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-left text-[15px] font-medium transition-colors duration-150 ${active ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-hover hover:text-fg'}`}
              >
                <Icon name={item.icon} />
                {t(item.label)}
              </button>
            )
          })}
          {version && (
            <div className="mt-auto px-3 pt-3 text-[13px] text-muted">
              {t('shell.version', { version })}
            </div>
          )}
        </nav>
        <main className="relative min-w-0 flex-1 overflow-y-auto">
          <div key={page} className="enter min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
