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
  return tokens
}

/** Nome da opção sem traços, sem `=valor` e em minúsculas (`--Password1=x` → `password1`). */
function optionName(token: string): string | null {
  const m = /^--?([^=]+)/.exec(token)
  return m?.[1] ? m[1].toLowerCase() : null
}

const FORBIDDEN: Record<string, string> = {
  password1:
    'Não passe --password1: a senha ficaria visível na linha de comando. Use o campo de senha.',
  password2:
    'Não passe --password2: a senha ficaria visível na linha de comando. Use o campo de senha.',
  // testado no imapsync 2.314: --debugenv lista IMAPSYNC_PASSWORD1/2 e --showpasswords tira a
  // máscara do LOGIN no rastro do --debugimap; os dois iriam para o log em disco
  showpasswords: 'Não use --showpasswords: a senha apareceria na saída e no arquivo de log.',
  debugenv:
    'Não use --debugenv: ele imprime as variáveis de ambiente, que levam as senhas, e elas iriam para o arquivo de log.',
  pidfile: '--pidfile é controlado pelo app.',
  logdir: '--logdir é controlado pelo app.',
  logfile: '--logfile é controlado pelo app.',
}

const RISKY: Record<string, string> = {
  delete1: '--delete1 apaga as mensagens da origem depois de copiar.',
  delete2: '--delete2 apaga do destino as mensagens que não existem na origem.',
  delete1emptyfolders: '--delete1emptyfolders apaga pastas vazias da origem.',
  debugimap:
    '--debugimap grava todo o tráfego IMAP no log, com o conteúdo das mensagens (a senha continua mascarada).',
  debugimap1:
    '--debugimap1 grava todo o tráfego IMAP da origem no log, com o conteúdo das mensagens.',
  debugimap2:
    '--debugimap2 grava todo o tráfego IMAP do destino no log, com o conteúdo das mensagens.',
  debugcontent: '--debugcontent grava o conteúdo das mensagens no log.',
}

/** Erros impedem o job; avisos só aparecem na interface. */
export function checkExtraArgs(tokens: string[]): { errors: string[]; warnings: string[] } {
  const errors = new Set<string>()
  const warnings = new Set<string>()
  for (const token of tokens) {
    const name = optionName(token)
    if (name && FORBIDDEN[name]) errors.add(FORBIDDEN[name])
    if (name && RISKY[name]) warnings.add(RISKY[name])
    if (name && /^nossl[12]?$/.test(name)) {
      warnings.add(`--${name} desliga a criptografia: senha e mensagens trafegam em texto puro.`)
    }
    if (/SSL_verify_mode\s*=\s*0/i.test(token)) {
      warnings.add('SSL_verify_mode=0 desliga a validação do certificado do servidor (inseguro).')
    }
  }
  return { errors: [...errors], warnings: [...warnings] }
}
