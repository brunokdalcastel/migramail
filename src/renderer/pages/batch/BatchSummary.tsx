import type { BatchSummary as Summary, JobStatus } from '@shared/model'
import { useApp } from '../../app/store'
import { Percent, ProgressChart } from '../../components/JobPanel'
import { fmtNumber, t, type TextKey } from '../../i18n/pt-BR'
import { formatBytes } from '../../lib/format'

// Painel do lote: % geral por mensagens e por bytes (estimado), contas por status, total
// enviado e o gráfico do total. Os números vêm do main (jobs:batch), só dos jobs do lote.

const COUNTS: readonly { key: TextKey; statuses: JobStatus[]; tone: string }[] = [
  { key: 'summary.done', statuses: ['ok'], tone: 'text-ok' },
  { key: 'summary.warning', statuses: ['warning'], tone: 'text-warn' },
  { key: 'summary.error', statuses: ['error'], tone: 'text-danger' },
  { key: 'summary.running', statuses: ['running', 'stopping'], tone: 'text-accent' },
  { key: 'summary.queued', statuses: ['queued'], tone: 'text-fg' },
  { key: 'summary.stopped', statuses: ['stopped'], tone: 'text-fg-2' },
]

export function BatchSummary({ summary }: { summary: Summary }): React.JSX.Element {
  const showBytes = useApp((s) => s.settings?.showBytesPercent ?? true)
  const c = summary.counts
  const running = c.running + c.stopping + c.queued > 0

  return (
    <section aria-label={t('summary.title')} className="glass flex flex-col gap-4 p-5">
      <span className="label">{t('summary.title')}</span>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">
        {COUNTS.map(({ key, statuses, tone }) => (
          <div
            key={key}
            className="flex flex-col gap-1 rounded-md border border-line bg-white/[0.02] px-3.5 py-3"
          >
            <span className="text-[13px] text-muted">{t(key)}</span>
            <span className={`num text-lg ${tone}`}>
              {fmtNumber(statuses.reduce((n, s) => n + c[s], 0))}
            </span>
          </div>
        ))}
        <div className="flex flex-col gap-1 rounded-md border border-line bg-white/[0.02] px-3.5 py-3">
          <span className="text-[13px] text-muted">{t('summary.sent')}</span>
          <span className="num text-lg text-fg">{formatBytes(summary.bytesSent)}</span>
        </div>
      </div>

      {summary.percentMessages !== null && (
        <div className="flex flex-col gap-3">
          <Percent
            label={t('summary.percentMessages')}
            value={summary.percentMessages}
            tone={!running && c.error === 0 && summary.percentMessages >= 100 ? 'ok' : 'accent'}
          />
          {showBytes && running && summary.percentBytes !== null && (
            <Percent label={t('summary.percentBytes')} value={summary.percentBytes} tone="accent" />
          )}
        </div>
      )}

      {summary.series.length > 1 && (
        <ProgressChart series={summary.series} label={t('summary.chart')} />
      )}
    </section>
  )
}
