import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { describeExit } from '@shared/exitCodes'
import type { JobMode, JobPhase, JobProgress } from '@shared/model'
import { applyLine, classifyLine, createLineSplitter, derive, initialProgress } from './parser'

const fixtures = resolve(__dirname, '../../../test/fixtures/imapsync')

function run(
  file: string,
  mode: JobMode,
): { p: JobProgress; phases: JobPhase[]; percents: number[] } {
  const text = readFileSync(resolve(fixtures, file), 'utf8')
  let p = initialProgress(mode)
  const phases: JobPhase[] = [p.phase]
  const percents: number[] = []
  const splitter = createLineSplitter((line) => {
    const parsed = classifyLine(line)
    if (!parsed) return
    p = applyLine(p, parsed)
    if (phases.at(-1) !== p.phase) phases.push(p.phase)
    const pm = derive(p).percentMessages
    if (pm !== null) percents.push(pm)
  })
  splitter.push(text)
  splitter.flush()
  return { p, phases, percents }
}

describe('run_sizes.txt (--justfoldersizes)', () => {
  const { p, phases } = run('run_sizes.txt', 'sizes')

  it('termina done com código 0', () => {
    expect(p.phase).toBe('done')
    expect(p.exitCode).toBe(0)
    expect(p.summary.exitName).toBe('EX_OK')
    expect(phases).toEqual(['starting', 'login', 'sizing', 'done'])
  })

  it('lê os totais e as 26 pastas', () => {
    expect(p.totalSize1).toBe(412660890)
    expect(p.totalSize2).toBe(7986266278)
    expect(p.totalMessages).toBe(2263)
    expect(p.folderOrder).toHaveLength(26)
    expect(p.sizingIndex).toBe(26)
    expect(p.sizingTotal).toBe(26)
    expect(p.folders['Archive']).toEqual({ size1: 47720, msgs1: 1, size2: 3865137, msgs2: 6 })
  })

  it('usa o nome UTF-8 das pastas com acento', () => {
    expect(p.folders['Entwürfe']).toEqual({ size1: 3695, msgs1: 2, size2: 3695, msgs2: 2 })
    expect(p.folders['init.收件箱']?.msgs1).toBe(21)
  })

  it('não tem % sem cópia', () => {
    expect(derive(p).percentMessages).toBeNull()
  })
})

describe('run_copy.txt (migração real)', () => {
  const { p, phases, percents } = run('run_copy.txt', 'migrate')

  it('passa por todas as fases na ordem', () => {
    expect(phases).toEqual(['starting', 'login', 'sizing', 'copying', 'finalSizing', 'done'])
    expect(p.loggedIn).toEqual({ 1: true, 2: true })
  })

  it('soma os bytes igual ao Total bytes transferred', () => {
    expect(p.msgsCopied).toBe(8)
    expect(p.bytesSent).toBe(169494)
    expect(p.summary.bytesTransferred).toBe(169494)
    expect(p.summary.messagesTransferred).toBe(8)
    expect(p.summary.messagesSkipped).toBe(1)
    expect(p.summary.errors).toBe(0)
    expect(p.exitCode).toBe(0)
  })

  it('a % por mensagens sobe até 100', () => {
    expect(percents.at(-1)).toBe(100)
    for (let i = 1; i < percents.length; i++) {
      expect(percents[i]).toBeGreaterThanOrEqual(percents[i - 1] ?? 0)
    }
  })

  it('a estimativa sai da medição inicial; a final só atualiza o tamanho do destino', () => {
    expect(p.totalMessages).toBe(9)
    expect(p.totalSize1).toBe(170544)
    expect(p.totalSize2).toBe(169494)
    expect(p.estimatedToCopy).toBe(170544)
    expect(p.folders['Borrador']).toEqual({ size1: 17714, msgs1: 8, size2: null, msgs2: null })
    expect(p.finalFolders['Borrador']).toEqual({ size1: 17714, msgs1: 8, size2: 16664, msgs2: 7 })
    expect(derive(p).percentBytes).toBeCloseTo((169494 / 170544) * 100, 5)
  })

  it('guarda pasta atual, velocidade e ETA', () => {
    expect(p.folderIndex).toBe(2)
    expect(p.folderTotal).toBe(2)
    expect(p.currentFolder).toBe('INBOX.Urlaub')
    expect(p.currentFolderDest).toBe('gui_probe_bruno.INBOX.Urlaub')
    expect(p.speedMsgs).toBe(0.59)
    expect(p.speedKiBs).toBeCloseTo(12.243)
    expect(p.etaSeconds).toBe(0)
  })
})

describe('run_badauth.txt (senha errada na origem)', () => {
  const { p } = run('run_badauth.txt', 'login')

  it('sai com 161 traduzido', () => {
    expect(p.exitCode).toBe(161)
    expect(p.summary.exitName).toBe('EXIT_AUTHENTICATION_FAILURE_USER1')
    expect(p.loggedIn).toEqual({ 1: false, 2: true })
    expect(p.summary.mostFrequentError).toMatch(/^ERR_AUTHENTICATION_FAILURE_USER1\. Check/)
    expect(describeExit(p.exitCode ?? -1).title).toBe('Falha de login na origem')
  })
})

describe('run_dry_newfolders.txt (--dry com pastas que não existem no destino)', () => {
  const { p } = run('run_dry_newfolders.txt', 'dry')

  it('termina 0 sem simular nenhuma mensagem', () => {
    expect(p.exitCode).toBe(0)
    expect(p.msgsCopied).toBe(0)
    expect(derive(p).percentMessages).toBe(0)
  })

  it('anota cada pasta da origem não simulada uma vez só', () => {
    // a linha sai também para as pastas-pai criadas (gui_probe_bruno_f5, .INBOX)
    expect(p.dryUnsimulatedFolders).toEqual(['Borrador', 'INBOX.Urlaub'])
  })
})

describe('classifyLine: casos sintéticos', () => {
  it('linha do --dry não tem bytes', () => {
    const line =
      'msg Borrador/37 copying to gui_probe_bruno.Borrador \t(not really since --dry mode) ETA: Monday 26 October 2026-10-26 21:32:22 -0300  27 s  7/9 msgs left'
    expect(classifyLine(line)).toEqual({
      kind: 'msgCopied',
      bytes: null,
      dry: true,
      speedMsgs: null,
      speedKiBs: null,
      etaSeconds: 27,
      left: 7,
      total: 9,
    })
  })

  it('copying to sem --dry (saída do --debug) não conta como cópia', () => {
    expect(
      classifyLine(
        'msg Borrador/37 copying to gui_probe_bruno.Borrador  ETA: x  1 s  1/9 msgs left',
      ),
    ).toBeNull()
  })

  it('velocidade em MiB/s vira KiB/s', () => {
    const parsed = classifyLine(
      'msg INBOX/9 {5000000}          copied to INBOX/9          3.10 msgs/s  2.500 MiB/s 9.000 MiB copied ETA: x  12 s  40/100 msgs left',
    )
    expect(parsed).toMatchObject({ kind: 'msgCopied', bytes: 5000000, speedKiBs: 2560, left: 40 })
  })

  it('pasta que ainda não existe no destino', () => {
    expect(
      classifyLine('Host2 folder     1/2 [gui_probe_bruno.Borrador]           does not exist yet'),
    ).toEqual({
      kind: 'folderSize',
      side: 2,
      index: 1,
      total: 2,
      folder: 'gui_probe_bruno.Borrador',
      size: null,
      messages: null,
    })
  })

  it('nome com acento em UTF-7 + UTF-8', () => {
    expect(
      classifyLine(
        'Host1 folder   13/26 [Entw&APw-rfe] = [Entwürfe]         Size:      3695 Messages:     2 Biggest:      2813',
      ),
    ).toMatchObject({ kind: 'folderSize', folder: 'Entwürfe', size: 3695, messages: 2 })
    expect(
      classifyLine(
        'Folder     3/9 [Entw&APw-rfe] = [Entwürfe]      -> [x.Entw&APw-rfe] = [x.Entwürfe]',
      ),
    ).toMatchObject({ kind: 'folderStart', source: 'Entwürfe', dest: 'x.Entwürfe' })
  })

  it('tolera \\r no fim', () => {
    expect(classifyLine('Detected 3 errors\r')).toEqual({ kind: 'statErrors', count: 3 })
  })

  it('reconhece erro de mensagem e cota', () => {
    expect(
      classifyLine('- msg INBOX/3 {12} could not append ( Subject:[x] ) to folder INBOX: NO'),
    ).toEqual({
      kind: 'msgError',
    })
    expect(
      classifyLine('Host2: Quota limit will be exceeded! Over 120 % ( 10 bytes / 8 bytes )'),
    ).toEqual({
      kind: 'quotaExceeded',
    })
  })

  it('ignora linhas sem interesse', () => {
    expect(classifyLine('Host1: found 26 folders.')).toBeNull()
    expect(classifyLine('Exiting because of --justfoldersizes')).toBeNull()
    expect(classifyLine('')).toBeNull()
  })
})

describe('applyLine e derive', () => {
  it('cota e erros de mensagem acumulam', () => {
    let p = initialProgress('migrate')
    p = applyLine(p, { kind: 'quotaExceeded' })
    p = applyLine(p, { kind: 'msgError' })
    p = applyLine(p, { kind: 'msgError' })
    expect(p.quotaExceeded).toBe(true)
    expect(p.msgErrors).toBe(2)
  })

  it('caixa vazia (0 mensagens) chega a 100%', () => {
    const p = applyLine(initialProgress('migrate'), {
      kind: 'eta',
      etaSeconds: 0,
      left: 0,
      total: 0,
    })
    expect(derive(p).percentMessages).toBe(100)
  })

  it('% por bytes é limitada a 100', () => {
    const p = { ...initialProgress('migrate'), estimatedToCopy: 100, bytesSent: 250 }
    expect(derive(p).percentBytes).toBe(100)
  })
})

describe('createLineSplitter', () => {
  it('junta linha partida em dois pedaços e tira \\r', () => {
    const lines: string[] = []
    const s = createLineSplitter((l) => lines.push(l))
    s.push('Detected 0 err')
    expect(lines).toEqual([])
    s.push('ors\r\nExiting with return value 0 (EX_OK')
    expect(lines).toEqual(['Detected 0 errors'])
    s.push(': successful termination)')
    s.flush()
    expect(lines).toEqual([
      'Detected 0 errors',
      'Exiting with return value 0 (EX_OK: successful termination)',
    ])
  })

  it('flush sem resto não emite linha vazia', () => {
    const lines: string[] = []
    const s = createLineSplitter((l) => lines.push(l))
    s.push('a\n')
    s.flush()
    expect(lines).toEqual(['a'])
  })
})
