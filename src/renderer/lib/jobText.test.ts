import { describe, expect, it } from 'vitest'
import { initialProgress, type JobMode, type JobProgress, type JobSnapshot } from '@shared/model'
import { estimateToCopy, jobResult, phaseText } from './jobText'

function job(
  mode: JobMode,
  patch: Partial<JobSnapshot> = {},
  progress: Partial<JobProgress> = {},
): JobSnapshot {
  return {
    id: 'j1',
    accountId: 'a1',
    label: '',
    sourceHost: 'test1.lamiral.info',
    sourceUser: 'test1',
    destHost: 'test2.lamiral.info',
    destUser: 'test2',
    mode,
    scope: 'single',
    state: 'running',
    status: 'running',
    progress: { ...initialProgress(mode), ...progress },
    percentMessages: null,
    percentBytes: null,
    series: [],
    exitCode: null,
    stoppedByUser: false,
    error: null,
    queuedAt: 0,
    startedAt: 0,
    finishedAt: null,
    logPath: null,
    ...patch,
  }
}

describe('phaseText', () => {
  it('fila, início e parada', () => {
    expect(phaseText(job('migrate', { state: 'queued', status: 'queued' }))).toBe('Na fila')
    expect(phaseText(job('migrate'))).toBe('Iniciando…')
    expect(phaseText(job('migrate', { state: 'stopping', status: 'stopping' }))).toBe('Parando…')
  })

  it('medição e cópia com contadores', () => {
    expect(phaseText(job('sizes', {}, { phase: 'sizing', sizingIndex: 4, sizingTotal: 26 }))).toBe(
      'Medindo pastas 4/26',
    )
    const copying = { phase: 'copying', folderIndex: 2, folderTotal: 26, currentFolder: 'Archive' }
    expect(phaseText(job('migrate', {}, copying as Partial<JobProgress>))).toBe(
      'Copiando pasta 2/26 [Archive]',
    )
    expect(phaseText(job('dry', {}, copying as Partial<JobProgress>))).toBe(
      'Simulando pasta 2/26 [Archive]',
    )
  })
})

describe('jobResult', () => {
  const finished = { state: 'finished', finishedAt: 1 } as const

  it('null enquanto roda', () => {
    expect(jobResult(job('migrate'))).toBeNull()
  })

  it('sucesso com o título do modo', () => {
    expect(jobResult(job('login', { ...finished, status: 'ok', exitCode: 0 }))).toMatchObject({
      tone: 'ok',
      title: 'Login funcionou nos dois servidores',
      code: null,
    })
    expect(jobResult(job('migrate', { ...finished, status: 'ok', exitCode: 0 }))?.title).toBe(
      'Concluído',
    )
  })

  it('simulação com pastas que não existem no destino explica a % parada', () => {
    const r = jobResult(
      job(
        'dry',
        { ...finished, status: 'ok', exitCode: 0 },
        { dryUnsimulatedFolders: ['Borrador', 'INBOX.Urlaub'] },
      ),
    )
    expect(r?.title).toBe('Simulação concluída (nada foi copiado)')
    expect(r?.hint).toContain('(2 nesta conta)')
  })

  it('senha errada na origem (test/fixtures/imapsync/run_badauth.txt)', () => {
    const r = jobResult(job('login', { ...finished, status: 'error', exitCode: 161 }))
    expect(r).toMatchObject({ tone: 'error', title: 'Falha de login na origem' })
    expect(r?.code).toBe('Código 161 (EXIT_AUTHENTICATION_FAILURE_USER1)')
  })

  it('parado pelo usuário e falha ao iniciar', () => {
    expect(
      jobResult(
        job('migrate', { ...finished, status: 'stopped', stoppedByUser: true, exitCode: 6 }),
      )?.tone,
    ).toBe('stopped')
    expect(
      jobResult(
        job('migrate', { ...finished, status: 'error', error: 'imapsync.exe não encontrado' }),
      ),
    ).toMatchObject({ tone: 'error', title: 'Não foi possível iniciar' })
  })
})

describe('estimateToCopy', () => {
  it('usa o do parser quando houver', () => {
    expect(estimateToCopy({ ...initialProgress('migrate'), estimatedToCopy: 10 })).toBe(10)
  })

  it('na medição soma origem − destino por pasta (pasta nova conta inteira)', () => {
    const p = {
      ...initialProgress('sizes'),
      folders: {
        INBOX: { size1: 100, msgs1: 2, size2: 40, msgs2: 1 },
        Nova: { size1: 50, msgs1: 1, size2: null, msgs2: null },
        Maior: { size1: 10, msgs1: 1, size2: 30, msgs2: 2 },
      },
    }
    expect(estimateToCopy(p)).toBe(110)
    expect(estimateToCopy(initialProgress('sizes'))).toBeNull()
  })
})
