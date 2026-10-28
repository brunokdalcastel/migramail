import { useEffect, useState } from 'react'
import { ToastHost } from '../components/Toasts'
import { t } from '../i18n/pt-BR'
import { invoke } from '../lib/api'
import { AboutPage } from '../pages/about/AboutPage'
import { BatchPage } from '../pages/batch/BatchPage'
import { ProfilesPage } from '../pages/profiles/ProfilesPage'
import { SinglePage } from '../pages/single/SinglePage'
import { Shell, type Page } from './Shell'
import { connectStore } from './store'

// Raiz da UI: liga o store aos eventos do main, abre na última tela de migração usada e
// mostra a página atual.

function CurrentPage({ page, version }: { page: Page; version: string | null }): React.JSX.Element {
  switch (page) {
    case 'single':
      return <SinglePage />
    case 'batch':
      return <BatchPage />
    case 'profiles':
      return <ProfilesPage />
    case 'about':
      return <AboutPage version={version} />
  }
}

export function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('single')
  const [version, setVersion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => connectStore(), [])

  useEffect(() => {
    invoke('app:info').then(
      (info) => setVersion(info.version),
      (err: Error) => setError(t('app.error', { message: err.message })),
    )
    invoke('settings:get').then(
      (s) => setPage(s.lastMode),
      () => undefined,
    )
  }, [])

  const navigate = (next: Page): void => {
    setPage(next)
    if (next === 'single' || next === 'batch') {
      invoke('settings:update', { lastMode: next }).catch(() => undefined)
    }
  }

  return (
    <Shell page={page} version={version} onNavigate={navigate}>
      {error && <div className="px-9 pt-6 text-danger">{error}</div>}
      <CurrentPage page={page} version={version} />
      <ToastHost />
    </Shell>
  )
}
