import { describeExit, type ExitStatus } from '@shared/exitCodes'
import type { JobProgress, JobSnapshot } from '@shared/model'
import { t } from '../i18n/pt-BR'

// Textos do andamento e do resultado de um job, a partir do snapshot. Lógica pura (testada
// em jobText.test.ts); o JobPanel e a tabela do lote usam.

/** Linha de andamento: "Medindo pastas 4/26", "Copiando pasta 2/26 [Archive]"… */
export function phaseText(job: JobSnapshot): string {
  if (job.state === 'queued') return t('job.queued')
  if (job.state === 'stopping') return t('job.stopping')
  const p = job.progress
  switch (p.phase) {
    case 'starting':
      return t('job.starting')
    case 'login':
      return t('job.login')
    case 'sizing':
      return p.sizingTotal > 0
        ? t('job.sizingN', { i: p.sizingIndex, n: p.sizingTotal })
        : t('job.sizing')
    case 'copying':
      return t(p.mode === 'dry' ? 'job.simulating' : 'job.copying', {
        i: p.folderIndex,
        n: p.folderTotal,
        folder: p.currentFolder ?? '',
      })
    case 'finalSizing':
      return t('job.finalSizing')
    case 'done':
      return t('job.finishing')
  }
}

export type ResultTone = ExitStatus | 'stopped'

export interface JobResult {
  tone: ResultTone
  title: string
  hint: string
  /** "Código 161 (EXIT_AUTHENTICATION_FAILURE_USER1)", para quem for pesquisar. */
  code: string | null
}

const OK_TITLE = {
  login: 'job.loginOk',
  sizes: 'job.sizesOk',
  dry: 'job.dryOk',
  migrate: null,
} as const

/** Resultado de um job terminado (`null` enquanto roda). */
export function jobResult(job: JobSnapshot): JobResult | null {
  if (job.state !== 'finished') return null
  if (job.stoppedByUser) {
    return { tone: 'stopped', title: t('job.stopped'), hint: t('job.stoppedHint'), code: null }
  }
  if (job.error)
    return { tone: 'error', title: t('job.failedToStart'), hint: job.error, code: null }
  const exitCode = job.exitCode ?? 1
  const info = describeExit(exitCode, job.progress.summary.exitName)
  const okKey = info.status === 'ok' ? OK_TITLE[job.mode] : null
  const unsimulated = job.mode === 'dry' ? job.progress.dryUnsimulatedFolders.length : 0
  return {
    tone: info.status,
    title: okKey ? t(okKey) : info.title,
    hint: unsimulated > 0 ? t('job.dryUnsimulated', { n: unsimulated }) : info.hint,
    code: exitCode === 0 ? null : t('job.exitCode', { code: exitCode, name: info.name }),
  }
}

/**
 * "Falta copiar" estimado: o do parser (calculado ao começar a cópia) ou, só com a medição
 * ("Medir tamanho"), a mesma conta Σ max(0, origem − destino) sobre as pastas medidas.
 */
export function estimateToCopy(p: JobProgress): number | null {
  if (p.estimatedToCopy !== null) return p.estimatedToCopy
  let total: number | null = null
  for (const f of Object.values(p.folders)) {
    if (f.size1 === null) continue
    total = (total ?? 0) + Math.max(0, f.size1 - (f.size2 ?? 0))
  }
  return total
}
