// Importação e exportação da lista de contas. Aceita o CSV com cabeçalho do app e o
// file.txt oficial do imapsync (`host1;user1;senha1;host2;user2;senha2;extras;`).
// Sem Node: main e renderer usam.
import { defaultPort, type Account, type Security } from './model'

export interface DraftEndpoint {
  host: string
  port: number
  security: Security
  user: string
}

/** Uma linha importada, antes de virar `Account` (a senha vai para o cofre, não para a conta). */
export interface AccountDraft {
  /** Linha no arquivo (1-based), para mensagens de erro e de aviso. */
  line: number
  source: DraftEndpoint
  dest: DraftEndpoint
  password1: string
  password2: string
  extraArgs: string
}

export interface CsvError {
  line: number
  message: string
}

const HEADER = ['host1', 'user1', 'password1', 'host2', 'user2', 'password2', 'extra'] as const
type Column = (typeof HEADER)[number]

/** Divide uma linha em campos; aspas duplas protegem o separador e `""` é uma aspa. */
function splitFields(line: string, sep: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') inQuotes = false
      else current += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === sep) {
      fields.push(current)
      current = ''
    } else current += ch
  }
  fields.push(current)
  return fields
}

/** `host` ou `host:porta`. Sem porta: SSL 993; porta 143 vira STARTTLS. */
export function parseHost(raw: string): { host: string; port: number; security: Security } | null {
  const m = /^([^\s:]+)(?::(\d{1,5}))?$/.exec(raw.trim())
  if (!m?.[1]) return null
  const port = m[2] ? Number(m[2]) : defaultPort('ssl')
  if (port < 1 || port > 65535) return null
  return { host: m[1], port, security: port === 143 ? 'tls' : 'ssl' }
}

function isHeader(fields: string[]): boolean {
  return fields[0]?.trim().toLowerCase() === 'host1'
}

export function parseAccountsCsv(text: string): { rows: AccountDraft[]; errors: CsvError[] } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const rows: AccountDraft[] = []
  const errors: CsvError[] = []

  // Formato: decidido pela primeira linha útil.
  let sep = ';'
  let columns: Column[] = [...HEADER]
  let started = false

  lines.forEach((raw, i) => {
    const lineNo = i + 1
    const line = raw.trim()
    if (!line || line.startsWith('#')) return

    if (!started) {
      started = true
      const first = line.split(';').length >= line.split(',').length ? ';' : ','
      const fields = splitFields(line, first)
      if (isHeader(fields)) {
        sep = first
        columns = fields.map((f) => {
          const name = f.trim().toLowerCase()
          return (name === 'extras' ? 'extra' : name) as Column
        })
        return
      }
    }

    const fields = splitFields(line, sep)
    const get = (c: Column): string | undefined => {
      const idx = columns.indexOf(c)
      return idx === -1 ? undefined : fields[idx]
    }
    const required: Column[] = ['host1', 'user1', 'password1', 'host2', 'user2', 'password2']
    const missing = required.filter((c) => get(c) === undefined)
    if (missing.length > 0) {
      errors.push({ line: lineNo, message: `faltam colunas (${missing.join(', ')})` })
      return
    }

    const h1 = parseHost(get('host1') ?? '')
    const h2 = parseHost(get('host2') ?? '')
    const u1 = (get('user1') ?? '').trim()
    const u2 = (get('user2') ?? '').trim()
    const problems: string[] = []
    if (!h1) problems.push('host1 inválido')
    if (!h2) problems.push('host2 inválido')
    if (!u1) problems.push('user1 vazio')
    if (!u2) problems.push('user2 vazio')
    if (!h1 || !h2 || problems.length > 0) {
      errors.push({ line: lineNo, message: problems.join(', ') })
      return
    }

    rows.push({
      line: lineNo,
      source: { ...h1, user: u1 },
      dest: { ...h2, user: u2 },
      password1: get('password1') ?? '',
      password2: get('password2') ?? '',
      extraArgs: (get('extra') ?? '').trim(),
    })
  })

  return { rows, errors }
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** `host` (SSL na 993) ou `host:porta`; o inverso do `parseHost`. */
export function hostField(e: Account['source']): string {
  return e.port === defaultPort(e.security) && e.security === 'ssl' ? e.host : `${e.host}:${e.port}`
}

/** CSV com cabeçalho e a coluna de senha sempre vazia. */
export function exportAccountsCsv(accounts: Account[]): string {
  const lines = [HEADER.join(',')]
  for (const a of accounts) {
    lines.push(
      [
        hostField(a.source),
        a.source.user,
        '',
        hostField(a.dest),
        a.dest.user,
        '',
        a.options.extraArgs,
      ]
        .map(csvField)
        .join(','),
    )
  }
  return lines.join('\r\n') + '\r\n'
}
