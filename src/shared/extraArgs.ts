// Argumentos extras digitados pelo usuário (perfis e conta): divisão em tokens e conferência
// das opções proibidas ou arriscadas. Sem Node: o main confere ao iniciar e a interface mostra
// os avisos enquanto o usuário digita.

/** Divide por espaços respeitando aspas duplas (`--f1f2 "A B=C D"` → 2 tokens). */
export function splitArgs(s: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inQuotes = false
  let hasToken = false
  for (const ch of s) {
    if (ch === '"') {
      inQuotes = !inQuotes
      hasToken = true
    } else if (!inQuotes && /\s/.test(ch)) {
      if (hasToken) tokens.push(current)
      current = ''
      hasToken = false
    } else {
      current += ch
      hasToken = true
    }
  }
  if (hasToken) tokens.push(current)
  if (inQuotes) tokens.push('--invalid-quoting')
  return tokens
}

/** Apenas opções de dados: nunca comandos, credenciais, destino, modo ou exclusões. */
const VALUES: Record<string, 'text' | 'int'> = {
  subfolder2: 'text',
  folder: 'text',
  folderrec: 'text',
  folderfirst: 'text',
  folderlast: 'text',
  exclude: 'text',
  f1f2: 'text',
  maxlinelength: 'int',
  maxsize: 'int',
  minsize: 'int',
  maxage: 'int',
  minage: 'int',
  maxbytespersecond: 'int',
  errorsmax: 'int',
}
const FLAGS = new Set([
  'nofoldersizes',
  'foldersizes',
  'automap',
  'noautomap',
  'justfolders',
  'syncinternaldates',
  'nosyncinternaldates',
  'useuid',
  'nosyncflags',
  'noresyncflags',
  'noshowpasswords',
  'nodebugenv',
])

export function checkExtraArgs(tokens: string[]): { errors: string[]; warnings: string[] } {
  const errors = new Set<string>()
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    const match = /^--([a-z][a-z0-9]*)(?:=(.*))?$/.exec(token)
    const name = match?.[1]
    if (!name || (!Object.hasOwn(VALUES, name) && !FLAGS.has(name))) {
      errors.add(
        'Argumento extra não permitido. Use apenas opções documentadas, com nome completo e dois traços.',
      )
      continue
    }
    const inline = match[2]
    if (FLAGS.has(name)) {
      if (inline !== undefined) errors.add('Opção sem valor recebeu um valor.')
      continue
    }
    const value = inline ?? tokens[++i]
    if (value === undefined || !value || /^[+-]/.test(value) || /[\r\n\0]/.test(value)) {
      errors.add('Argumento extra exige um valor válido que não comece com traço ou +.')
    } else if (
      VALUES[name] === 'int' &&
      (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)
    ) {
      errors.add('Argumento extra exige um inteiro positivo seguro.')
    }
  }
  return { errors: [...errors], warnings: [] }
}
