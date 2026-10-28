// Parser da saída do imapsync 2.314: classifica cada linha e monta o progresso com um
// redutor puro. Formatos conferidos em test/fixtures/imapsync/run_*.txt e no imapsync.pl.
// Sem electron: roda no Vitest.
import type { FolderSizes, JobProgress, Side } from '@shared/model'

export { initialProgress } from '@shared/model'

export type ParsedLine =
  | { kind: 'connecting'; side: Side }
  | { kind: 'login'; side: Side; host: string; user: string }
  | {
      kind: 'folderSize'
      side: Side
      index: number
      total: number
      folder: string
      size: number | null
      messages: number | null
    }
  | { kind: 'totalMessages'; side: Side; count: number }
  | { kind: 'totalSize'; side: Side; bytes: number }
  | { kind: 'quotaExceeded' }
  /** `--dry` com a pasta ainda inexistente no destino: a cópia dela não é simulada. */
  | { kind: 'dryNotSimulated' }
  | { kind: 'folderStart'; index: number; total: number; source: string; dest: string }
  | {
      kind: 'msgCopied'
      /** `null` no `--dry`: a linha não traz o tamanho. */
      bytes: number | null
      dry: boolean
      speedMsgs: number | null
      speedKiBs: number | null
      etaSeconds: number | null
      left: number | null
      total: number | null
    }
  | { kind: 'eta'; etaSeconds: number; left: number; total: number }
  | { kind: 'msgError' }
  | { kind: 'statMessagesTransferred'; count: number }
  | { kind: 'statMessagesSkipped'; count: number }
  | { kind: 'statBytesTransferred'; bytes: number }
  | { kind: 'statErrors'; count: number }
  | { kind: 'exit'; code: number; name: string }
  | { kind: 'mostFrequentError'; text: string }

// Nome de pasta como o imapsync imprime: `[X]` ou `[X] = [Y]` (Y = UTF-8 legível).
const FOLDER = String.raw`\[(.*?)\](?: = \[(.*?)\])?`

const RE = {
  connecting: /^Host([12]): connecting and login on host[12] /,
  login: /^Host([12]): success login on \[(.+?)\] with user \[(.+?)\]/,
  folderSize: new RegExp(
    String.raw`^Host([12]) folder\s+(\d+)/(\d+) ${FOLDER}\s+(?:Size:\s+(\d+)\s+Messages:\s+(\d+)|does not exist yet)`,
  ),
  totalMessages: /^Host([12]) Nb messages:\s+(\d+)/,
  totalSize: /^Host([12]) Total size:\s+(\d+) bytes/,
  quotaExceeded: /Quota limit will be exceeded/,
  // `Since --dry mode is on and folder [$h2_fold] on host2 does not exist yet, ...` (linha 10812)
  dryNotSimulated: /^Since --dry mode is on and folder \[.*\] on host2 does not exist yet/,
  folderStart: new RegExp(String.raw`^Folder\s+(\d+)/(\d+) ${FOLDER}\s+-> ${FOLDER}`),
  // `msg %s/%-19s copied to %s/%-10s %.2f msgs/s  %s/s %s copied ETA: ...` (fonte, linha 14018)
  msgCopied: /^msg (.+?) \{(\d+)\}\s+copied to /,
  // `msg $h1_fold/$h1_msg copying to $h2_fold \t(not really since --dry mode) ETA: ...` (linha 13002)
  msgDry: /^msg (.+?) copying to .*not really/,
  speed: /([\d.]+) msgs\/s\s+([\d.]+) (KiB|MiB|GiB|TiB)\/s/,
  etaTail: /ETA: .*?(\d+) s\s+(\d+)\/(\d+) msgs left/,
  eta: /^ETA: .*?(\d+) s\s+(\d+)\/(\d+) msgs left/,
  msgError: /^- msg .*could not/,
  statMessagesTransferred: /^Messages transferred\s+:\s+(\d+)/,
  statMessagesSkipped: /^Messages skipped\s+:\s+(\d+)/,
  statBytesTransferred: /^Total bytes transferred\s+:\s+(\d+)/,
  statErrors: /^Detected (\d+) errors/,
  exit: /^Exiting with return value (\d+) \((\w+)/,
  mostFrequentError: /^The most frequent error is (.*)/,
}

const UNIT_KIB: Record<string, number> = { KiB: 1, MiB: 1024, GiB: 1024 ** 2, TiB: 1024 ** 3 }

function side(s: string | undefined): Side {
  return s === '2' ? 2 : 1
}

function int(s: string | undefined): number {
  return Number.parseInt(s ?? '', 10)
}

/** Nome legível: o UTF-8 de `[X] = [Y]` quando houver, senão o próprio X. */
function folderName(raw: string | undefined, utf8: string | undefined): string {
  return utf8 ?? raw ?? ''
}

function parseMsg(line: string): ParsedLine | null {
  const copied = RE.msgCopied.exec(line)
  const dry = copied ? null : RE.msgDry.exec(line)
  if (!copied && !dry) return null
  const speed = RE.speed.exec(line)
  const eta = RE.etaTail.exec(line)
  return {
    kind: 'msgCopied',
    bytes: copied ? int(copied[2]) : null,
    dry: !copied,
    speedMsgs: speed ? Number(speed[1]) : null,
    speedKiBs: speed ? Number(speed[2]) * (UNIT_KIB[speed[3] ?? 'KiB'] ?? 1) : null,
    etaSeconds: eta ? int(eta[1]) : null,
    left: eta ? int(eta[2]) : null,
    total: eta ? int(eta[3]) : null,
  }
}

export function classifyLine(input: string): ParsedLine | null {
  const line = input.replace(/\r$/, '')
  let m: RegExpExecArray | null

  if (line.startsWith('msg ')) return parseMsg(line)
  if ((m = RE.eta.exec(line))) {
    return { kind: 'eta', etaSeconds: int(m[1]), left: int(m[2]), total: int(m[3]) }
  }
  if ((m = RE.folderSize.exec(line))) {
    const exists = m[6] !== undefined
    return {
      kind: 'folderSize',
      side: side(m[1]),
      index: int(m[2]),
      total: int(m[3]),
      folder: folderName(m[4], m[5]),
      size: exists ? int(m[6]) : null,
      messages: exists ? int(m[7]) : null,
    }
  }
  if ((m = RE.folderStart.exec(line))) {
    return {
      kind: 'folderStart',
      index: int(m[1]),
      total: int(m[2]),
      source: folderName(m[3], m[4]),
      dest: folderName(m[5], m[6]),
    }
  }
  if ((m = RE.connecting.exec(line))) return { kind: 'connecting', side: side(m[1]) }
  if ((m = RE.login.exec(line))) {
    return { kind: 'login', side: side(m[1]), host: m[2] ?? '', user: m[3] ?? '' }
  }
  if ((m = RE.totalMessages.exec(line))) {
    return { kind: 'totalMessages', side: side(m[1]), count: int(m[2]) }
  }
  if ((m = RE.totalSize.exec(line)))
    return { kind: 'totalSize', side: side(m[1]), bytes: int(m[2]) }
  if (RE.msgError.test(line)) return { kind: 'msgError' }
  if ((m = RE.statMessagesTransferred.exec(line))) {
    return { kind: 'statMessagesTransferred', count: int(m[1]) }
  }
  if ((m = RE.statMessagesSkipped.exec(line)))
    return { kind: 'statMessagesSkipped', count: int(m[1]) }
  if ((m = RE.statBytesTransferred.exec(line))) {
    return { kind: 'statBytesTransferred', bytes: int(m[1]) }
  }
  if ((m = RE.statErrors.exec(line))) return { kind: 'statErrors', count: int(m[1]) }
  if ((m = RE.exit.exec(line))) return { kind: 'exit', code: int(m[1]), name: m[2] ?? '' }
  if ((m = RE.mostFrequentError.exec(line))) return { kind: 'mostFrequentError', text: m[1] ?? '' }
  if (RE.quotaExceeded.test(line)) return { kind: 'quotaExceeded' }
  if (RE.dryNotSimulated.test(line)) return { kind: 'dryNotSimulated' }
  return null
}

const EMPTY_SIZES: FolderSizes = { size1: null, msgs1: null, size2: null, msgs2: null }

/** Grava a medição de um lado. As linhas do Host2 usam o nome do destino; o par é pelo índice. */
function recordSize(
  table: Record<string, FolderSizes>,
  order: string[],
  line: Extract<ParsedLine, { kind: 'folderSize' }>,
): { table: Record<string, FolderSizes>; order: string[] } {
  const key = line.side === 1 ? line.folder : (order[line.index - 1] ?? line.folder)
  const nextOrder = order.includes(key) ? order : [...order, key]
  const prev = table[key] ?? EMPTY_SIZES
  const sizes =
    line.side === 1
      ? { ...prev, size1: line.size, msgs1: line.messages }
      : { ...prev, size2: line.size, msgs2: line.messages }
  return { table: { ...table, [key]: sizes }, order: nextOrder }
}

function estimateToCopy(folders: Record<string, FolderSizes>): number | null {
  const all = Object.values(folders)
  if (all.length === 0) return null
  return all.reduce((sum, f) => sum + Math.max(0, (f.size1 ?? 0) - (f.size2 ?? 0)), 0)
}

function isCopyingOrLater(p: JobProgress): boolean {
  return p.phase === 'copying' || p.phase === 'finalSizing' || p.phase === 'done'
}

/** Entra na fase de cópia uma vez só: fixa a estimativa a partir da medição inicial. */
function enterCopying(p: JobProgress): JobProgress {
  if (isCopyingOrLater(p)) return p
  return { ...p, phase: 'copying', estimatedToCopy: estimateToCopy(p.folders) }
}

/** Redutor puro: aplica uma linha reconhecida ao progresso. */
export function applyLine(p: JobProgress, line: ParsedLine): JobProgress {
  switch (line.kind) {
    case 'connecting':
      return p.phase === 'starting' ? { ...p, phase: 'login' } : p
    case 'login':
      return {
        ...p,
        phase: p.phase === 'starting' ? 'login' : p.phase,
        loggedIn: { ...p.loggedIn, [line.side]: true },
      }
    case 'folderSize': {
      if (isCopyingOrLater(p)) {
        // A medição final repete a ordem da inicial: o Host2 casa pelo mesmo índice.
        const { table } = recordSize(p.finalFolders, p.folderOrder, line)
        return { ...p, phase: p.phase === 'done' ? 'done' : 'finalSizing', finalFolders: table }
      }
      const { table, order } = recordSize(p.folders, p.folderOrder, line)
      return {
        ...p,
        phase: 'sizing',
        folders: table,
        folderOrder: order,
        sizingIndex: line.index,
        sizingTotal: line.total,
      }
    }
    case 'totalMessages':
      if (isCopyingOrLater(p) || line.side !== 1) return p
      return { ...p, totalMessages: line.count }
    case 'totalSize':
      // A medição final só atualiza o destino (o "Tamanho no destino" mostra o depois); a
      // origem fica com a medição inicial, que é a base da estimativa.
      if (isCopyingOrLater(p)) return line.side === 2 ? { ...p, totalSize2: line.bytes } : p
      return line.side === 1 ? { ...p, totalSize1: line.bytes } : { ...p, totalSize2: line.bytes }
    case 'quotaExceeded':
      return { ...p, quotaExceeded: true }
    case 'dryNotSimulated':
      // sai uma linha por pasta criada (pais também): conta a pasta da origem uma vez só
      if (p.currentFolder === null || p.dryUnsimulatedFolders.includes(p.currentFolder)) return p
      return { ...p, dryUnsimulatedFolders: [...p.dryUnsimulatedFolders, p.currentFolder] }
    case 'folderStart':
      return {
        ...enterCopying(p),
        folderIndex: line.index,
        folderTotal: line.total,
        currentFolder: line.source,
        currentFolderDest: line.dest,
      }
    case 'msgCopied': {
      const next = enterCopying(p)
      return {
        ...next,
        msgsCopied: next.msgsCopied + 1,
        bytesSent: next.bytesSent + (line.bytes ?? 0),
        speedMsgs: line.speedMsgs ?? next.speedMsgs,
        speedKiBs: line.speedKiBs ?? next.speedKiBs,
        etaSeconds: line.etaSeconds ?? next.etaSeconds,
        msgsLeft: line.left ?? next.msgsLeft,
        msgsLeftTotal: line.total ?? next.msgsLeftTotal,
      }
    }
    case 'eta':
      return {
        ...enterCopying(p),
        etaSeconds: line.etaSeconds,
        msgsLeft: line.left,
        msgsLeftTotal: line.total,
      }
    case 'msgError':
      return { ...p, msgErrors: p.msgErrors + 1 }
    case 'statMessagesTransferred':
      return { ...p, summary: { ...p.summary, messagesTransferred: line.count } }
    case 'statMessagesSkipped':
      return { ...p, summary: { ...p.summary, messagesSkipped: line.count } }
    case 'statBytesTransferred':
      return { ...p, summary: { ...p.summary, bytesTransferred: line.bytes } }
    case 'statErrors':
      return { ...p, summary: { ...p.summary, errors: line.count } }
    case 'mostFrequentError':
      return { ...p, summary: { ...p.summary, mostFrequentError: line.text } }
    case 'exit':
      return {
        ...p,
        phase: 'done',
        exitCode: line.code,
        summary: { ...p.summary, exitName: line.name },
      }
  }
}

export interface DerivedProgress {
  /** % por mensagens processadas (copiadas + puladas); `null` antes da cópia. */
  percentMessages: number | null
  /** % por bytes sobre o "falta copiar" estimado; `null` sem estimativa. */
  percentBytes: number | null
}

function clampPercent(v: number): number {
  return Math.min(100, Math.max(0, v))
}

export function derive(p: JobProgress): DerivedProgress {
  const total = p.msgsLeftTotal ?? p.totalMessages
  let percentMessages: number | null = null
  if (p.msgsLeft !== null && total !== null) {
    percentMessages = total === 0 ? 100 : clampPercent(((total - p.msgsLeft) / total) * 100)
  }
  const percentBytes =
    p.estimatedToCopy !== null && p.estimatedToCopy > 0
      ? clampPercent((p.bytesSent / p.estimatedToCopy) * 100)
      : null
  return { percentMessages, percentBytes }
}

/** Junta pedaços de texto em linhas (`\n`, sem `\r`); a última incompleta só sai no flush. */
export function createLineSplitter(onLine: (line: string) => void): {
  push(chunk: string): void
  flush(): void
} {
  let buffer = ''
  return {
    push(chunk) {
      buffer += chunk
      let nl = buffer.indexOf('\n')
      while (nl !== -1) {
        onLine(buffer.slice(0, nl).replace(/\r$/, ''))
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf('\n')
      }
    },
    flush() {
      if (buffer.length > 0) onLine(buffer.replace(/\r$/, ''))
      buffer = ''
    },
  }
}
