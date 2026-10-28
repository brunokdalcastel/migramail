import { useEffect, useState } from 'react'
import { useApp } from '../../app/store'
import { Button } from '../../components/Button'
import { PageHeader } from '../../components/Form'
import { Icon } from '../../components/Icon'
import { t } from '../../i18n/pt-BR'
import { invoke } from '../../lib/api'

// Sobre: versão do app e do motor, crédito ao imapsync e atalho para a pasta de logs.
// A versão do motor leva ~30 s na primeira vez (roda o imapsync.exe); depois vem do cache.

export function AboutPage({ version }: { version: string | null }): React.JSX.Element {
  const toast = useApp((s) => s.toast)
  const [engine, setEngine] = useState<string | null | 'loading'>('loading')

  useEffect(() => {
    let alive = true
    invoke('about:engine').then(
      (r) => alive && setEngine(r.version),
      () => alive && setEngine(null),
    )
    return () => {
      alive = false
    }
  }, [])

  const fail = (err: Error): void => toast(err.message, 'error')

  return (
    <div className="flex flex-col gap-6 px-9 py-8">
      <PageHeader title={t('about.title')} />

      <section className="glass flex max-w-[720px] flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-[10px] bg-accent text-accent-fg">
            <Icon name="logo" size={22} strokeWidth={2.2} />
          </span>
          <div className="flex flex-col">
            <span className="text-[18px] font-semibold">{t('app.name')}</span>
            <span className="text-[14px] text-muted">{t('about.tagline')}</span>
          </div>
        </div>
        <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[15px]">
          <dt className="text-muted">{t('about.appVersion')}</dt>
          <dd className="m-0">{version ?? '…'}</dd>
          <dt className="text-muted">{t('about.engineVersion')}</dt>
          <dd className="m-0">
            {engine === 'loading'
              ? t('about.engineLoading')
              : engine
                ? t('about.engineValue', { version: engine })
                : t('about.engineUnknown')}
          </dd>
        </dl>
        <div className="flex flex-wrap gap-2.5">
          <Button onClick={() => invoke('about:openLogs').catch(fail)}>
            <Icon name="folder" />
            {t('about.openLogs')}
          </Button>
        </div>
      </section>

      <section className="glass flex max-w-[720px] flex-col gap-3 p-5">
        <h2 className="label m-0">{t('about.creditTitle')}</h2>
        <p className="m-0 text-fg-2">{t('about.credit')}</p>
        <p className="m-0 text-[14px] text-muted">{t('about.notOfficial')}</p>
        <div>
          <Button variant="ghost" onClick={() => invoke('about:openSite').catch(fail)}>
            {t('about.site')}
          </Button>
        </div>
      </section>
    </div>
  )
}
