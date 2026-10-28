import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { EChartsCoreOption } from 'echarts/core'
import type { JobSnapshot, JobSeriesPoint } from '@shared/model'
import { useApp } from '../app/store'
import { t, fmtNumber, type TextKey } from '../i18n/pt-BR'
import { invoke } from '../lib/api'
import { formatBytes, formatDuration, formatPercent, formatSpeed } from '../lib/format'
import { estimateToCopy, jobResult, phaseText, type ResultTone } from '../lib/jobText'
import { Button, ProgressBar } from './Button'
import { Chart, chartColors } from './Chart'
import { Tabs } from './Form'
import { Icon } from './Icon'

// Andamento e resultado de um job: fase, barras de %, cartões, gráfico e as abas Resumo,
// Pastas e Log. Usado em "Uma conta" e no painel lateral do lote.

type Tab = 'summary' | 'folders' | 'log'

const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'summary', label: t('job.tab.summary') },
  { key: 'folders', label: t('job.tab.folders') },
  { key: 'log', label: t('job.tab.log') },
]

const TONE: Record<ResultTone, { box: string; text: string; icon: 'check' | 'warning' | 'stop' }> =
  {
    ok: { box: 'border-ok/40 bg-ok/10', text: 'text-ok', icon: 'check' },
    warning: { box: 'border-warn/40 bg-warn/10', text: 'text-warn', icon: 'warning' },
    error: { box: 'border-danger/40 bg-danger/10', text: 'text-danger', icon: 'warning' },
    stopped: { box: 'border-line-strong bg-hover', text: 'text-fg-2', icon: 'stop' },
  }

const dash = '—'
const bytesOr = (n: number | null): string => (n === null ? dash : formatBytes(n))
const countOr = (n: number | null): string => (n === null ? dash : fmtNumber(n))

export function JobPanel({ job }: { job: JobSnapshot }): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('summary')
  const box = useRef<HTMLElement>(null)
  const toast = useApp((s) => s.toast)
  const watchLog = useApp((s) => s.watchLog)
  const showBytes = useApp((s) => s.settings?.showBytesPercent ?? true)
  const result = jobResult(job)
  const p = job.progress
  const running = job.state !== 'finished'
  const transfers = job.mode === 'dry' || job.mode === 'migrate'

  useEffect(() => {
    watchLog(job.id)
  }, [job.id, watchLog])
  useEffect(() => () => watchLog(null), [watchLog])

  // job novo (iniciar ou rodar de novo): traz o painel para a tela, abaixo dos formulários
  useEffect(() => {
    if (job.state !== 'finished')
      box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id])

  const fail = (err: Error): void => toast(err.message, 'error')
  const openLog = (): void => void invoke('jobs:openLog', { jobId: job.id }).catch(fail)
  const retry = (): void => void invoke('jobs:retry', { jobId: job.id }).catch(fail)

  return (
    <section
      ref={box}
      aria-label={t(`job.mode.${job.mode}`)}
      className="glass flex scroll-mt-6 flex-col gap-5 p-5"
    >
      <div className="flex flex-col gap-1">
        <span className="label">{t(`job.mode.${job.mode}`)}</span>
        {running && (
          <div className="flex items-center gap-2.5 text-lg font-semibold" aria-live="polite">
            <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-accent shadow-glow" />
            {phaseText(job)}
          </div>
        )}
        {running && p.phase === 'starting' && (
          <p className="m-0 text-[13px] text-muted">{t('job.startingNote')}</p>
        )}
      </div>

      {result && (
        <div className={`flex flex-col gap-3 rounded-md border p-4 ${TONE[result.tone].box}`}>
          <div
            className={`flex items-center gap-2.5 text-lg font-semibold ${TONE[result.tone].text}`}
          >
            <Icon name={TONE[result.tone].icon} size={20} />
            {result.title}
          </div>
          {result.hint && <p className="m-0 text-fg-2">{result.hint}</p>}
          {p.summary.mostFrequentError && (
            <p className="num m-0 break-words text-[13px] text-fg-2">
              {t('job.mostFrequent', { error: p.summary.mostFrequentError })}
            </p>
          )}
          {result.code && <p className="num m-0 text-xs text-muted">{result.code}</p>}
          <div className="flex flex-wrap gap-2.5">
            <Button onClick={openLog} disabled={!job.logPath}>
              <Icon name="file" />
              {t('job.openLog')}
            </Button>
            <Button onClick={retry}>
              <Icon name="retry" />
              {t('job.retry')}
            </Button>
          </div>
        </div>
      )}

      {p.quotaExceeded && (
        <p
          role="alert"
          className="m-0 flex gap-2.5 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 font-medium text-danger"
        >
          <Icon name="warning" size={20} className="shrink-0" />
          {t('job.quota')}
        </p>
      )}

      {transfers && (job.percentMessages !== null || p.phase === 'copying') && (
        <div className="flex flex-col gap-3">
          <Percent
            label={t('job.percentMessages')}
            value={job.percentMessages}
            tone={result?.tone === 'ok' ? 'ok' : 'accent'}
          />
          {/* a estimativa por bytes só guia durante a cópia; no fim valem os números reais */}
          {showBytes && running && job.percentBytes !== null && (
            <Percent label={t('job.percentBytes')} value={job.percentBytes} tone="accent" />
          )}
        </div>
      )}

      <Tabs items={TABS} value={tab} onChange={setTab} label={t('job.tabs')} />
      {tab === 'summary' && <Summary job={job} />}
      {tab === 'folders' && <Folders job={job} />}
      {tab === 'log' && <Log />}
    </section>
  )
}

export function Percent({
  label,
  value,
  tone,
}: {
  label: string
  value: number | null
  tone: 'accent' | 'ok'
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="num text-fg">{formatPercent(value)}</span>
      </div>
      <ProgressBar value={(value ?? 0) / 100} tone={tone} label={label} />
    </div>
  )
}

function Stat({ label, value }: { label: TextKey; value: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-line bg-white/[0.02] px-3.5 py-3">
      <span className="text-[13px] text-muted">{t(label)}</span>
      <span className="num text-lg text-fg">{value}</span>
    </div>
  )
}

function Summary({ job }: { job: JobSnapshot }): React.JSX.Element {
  const p = job.progress
  const s = p.summary
  const running = job.state !== 'finished'

  const sides = (
    <div className="flex flex-wrap gap-2.5">
      {(
        [
          ['endpoint.source', 1, job.sourceUser, job.sourceHost],
          ['endpoint.dest', 2, job.destUser, job.destHost],
        ] as const
      ).map(([label, side, user, host]) => (
        <div
          key={side}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md border border-line bg-white/[0.02] px-3.5 py-3"
        >
          <Icon
            name={p.loggedIn[side] ? 'check' : 'clock'}
            size={20}
            className={p.loggedIn[side] ? 'shrink-0 text-ok' : 'shrink-0 text-muted'}
          />
          <div className="flex min-w-0 flex-col">
            <span className="text-[13px] text-muted">
              {t(label)} · {t(p.loggedIn[side] ? 'job.loggedIn' : 'job.notLoggedIn')}
            </span>
            <span className="truncate" title={`${user} @ ${host}`}>
              {user} <span className="text-muted">@ {host}</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  )

  if (job.mode === 'login') return sides

  const sizes = (
    <>
      <Stat label="job.size1" value={bytesOr(p.totalSize1)} />
      <Stat label="job.size2" value={bytesOr(p.totalSize2)} />
      <Stat label="job.toCopy" value={bytesOr(estimateToCopy(p))} />
    </>
  )

  return (
    <div className="flex flex-col gap-4">
      {sides}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2.5">
        {sizes}
        {job.mode !== 'sizes' && (
          <>
            <Stat label="job.sent" value={formatBytes(s.bytesTransferred ?? p.bytesSent)} />
            <Stat label="job.copied" value={fmtNumber(s.messagesTransferred ?? p.msgsCopied)} />
            <Stat label="job.skipped" value={countOr(s.messagesSkipped)} />
            <Stat label="job.errors" value={fmtNumber(s.errors ?? p.msgErrors)} />
            <Stat
              label="job.speed"
              value={running && p.speedKiBs !== null ? formatSpeed(p.speedKiBs) : dash}
            />
            <Stat
              label="job.eta"
              value={running && p.etaSeconds !== null ? formatDuration(p.etaSeconds) : dash}
            />
          </>
        )}
      </div>
      {job.mode !== 'sizes' && job.series.length > 1 && <ProgressChart series={job.series} />}
    </div>
  )
}

/** % ao longo do tempo (mensagens sólida, bytes tracejada); também usado no painel do lote. */
export function ProgressChart({
  series,
  label = t('job.chart'),
}: {
  series: JobSeriesPoint[]
  label?: string
}): React.JSX.Element {
  const showBytes = useApp((s) => s.settings?.showBytesPercent ?? true)
  const last = series.at(-1)?.t
  const option = useMemo<EChartsCoreOption>(() => {
    const c = chartColors()
    const t0 = series[0]?.t ?? 0
    const at = (x: JobSeriesPoint): number => Math.round((x.t - t0) / 1000)
    const line = (
      name: string,
      color: string,
      data: [number, number | null][],
      dashed: boolean,
    ) => ({
      name,
      type: 'line',
      showSymbol: false,
      connectNulls: true,
      data,
      lineStyle: { color, width: 2, type: dashed ? 'dashed' : 'solid' },
      itemStyle: { color },
    })
    return {
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: unknown) => (typeof v === 'number' ? formatPercent(v) : '—'),
      },
      legend: { top: 0, right: 0, textStyle: { color: c.muted } },
      grid: { left: 8, right: 12, top: 32, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value',
        min: 0,
        axisLabel: { formatter: (v: number) => formatDuration(v) },
        splitLine: { show: false },
      },
      yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%' } },
      series: [
        line(
          t('job.percentMessages'),
          c.accent,
          series.map((x) => [at(x), x.percentMessages]),
          false,
        ),
        ...(showBytes
          ? [
              line(
                t('job.percentBytes'),
                c.series2,
                series.map((x) => [at(x), x.percentBytes]),
                true,
              ),
            ]
          : []),
      ],
    }
    // a série só cresce: o último ponto e o tamanho bastam para saber se mudou
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.length, last, showBytes])
  return <Chart option={option} label={label} height={220} />
}

function Folders({ job }: { job: JobSnapshot }): React.JSX.Element {
  const p = job.progress
  if (p.folderOrder.length === 0) {
    return <p className="m-0 text-fg-2">{t('job.noFolders')}</p>
  }
  return (
    <div className="max-h-[420px] overflow-auto rounded-md border border-line">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-surface text-left text-[13px] text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">{t('job.folder')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('job.msgs1')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('job.sizeCol1')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('job.msgs2')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('job.sizeCol2')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('job.diff')}</th>
          </tr>
        </thead>
        <tbody>
          {p.folderOrder.map((name) => {
            const f = p.folders[name]
            if (!f) return null
            const missing = f.size2 === null
            const diff = f.msgs1 === null ? null : Math.max(0, f.msgs1 - (f.msgs2 ?? 0))
            return (
              <tr key={name} className="border-t border-line">
                <td className="max-w-[280px] truncate px-3 py-1.5" title={name}>
                  {name}
                </td>
                <td className="num px-3 py-1.5 text-right">{countOr(f.msgs1)}</td>
                <td className="num px-3 py-1.5 text-right">{bytesOr(f.size1)}</td>
                <td className="num px-3 py-1.5 text-right">
                  {missing ? (
                    <span className="text-muted">{t('job.notInDest')}</span>
                  ) : (
                    countOr(f.msgs2)
                  )}
                </td>
                <td className="num px-3 py-1.5 text-right">{bytesOr(f.size2)}</td>
                <td className={`num px-3 py-1.5 text-right ${diff ? 'text-warn' : 'text-muted'}`}>
                  {countOr(diff)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const ROW_PX = 20
const LOG_HEIGHT_PX = 360
const OVERSCAN = 10

/** Log do job aberto: lista virtualizada simples; acompanha o fim se o usuário estiver lá. */
function Log(): React.JSX.Element {
  const lines = useApp((s) => s.logLines)
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [scrollTop, setScrollTop] = useState(0)

  useLayoutEffect(() => {
    const el = box.current
    if (el && stick.current) {
      el.scrollTop = el.scrollHeight
      setScrollTop(el.scrollTop)
    }
  }, [lines])

  if (lines.length === 0) return <p className="m-0 text-fg-2">{t('job.noLog')}</p>

  const first = Math.max(0, Math.floor(scrollTop / ROW_PX) - OVERSCAN)
  const last = Math.min(lines.length, Math.ceil((scrollTop + LOG_HEIGHT_PX) / ROW_PX) + OVERSCAN)

  return (
    <div
      ref={box}
      role="log"
      aria-label={t('job.logLabel')}
      tabIndex={0}
      onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - ROW_PX
        setScrollTop(el.scrollTop)
      }}
      className="num overflow-auto rounded-md border border-line bg-black/30 text-xs text-fg-2 select-text"
      style={{ height: LOG_HEIGHT_PX }}
    >
      <div style={{ height: lines.length * ROW_PX, position: 'relative' }}>
        {lines.slice(first, last).map((line, i) => (
          <div
            key={first + i}
            className="absolute inset-x-0 whitespace-pre px-3"
            style={{ top: (first + i) * ROW_PX, height: ROW_PX, lineHeight: `${ROW_PX}px` }}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}
