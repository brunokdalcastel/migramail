// Códigos de saída do imapsync 2.314 (fonte, linhas 1079-1105; RE §3) traduzidos para a
// interface. Sem Node: main e renderer usam.

export type ExitStatus = 'ok' | 'warning' | 'error'

export interface ExitInfo {
  /** Nome da constante no imapsync (o mesmo que aparece no log). */
  name: string
  status: ExitStatus
  title: string
  hint: string
}

export const EXIT_CODES: Record<number, ExitInfo> = {
  0: { name: 'EX_OK', status: 'ok', title: 'Concluído', hint: '' },
  1: {
    name: 'EXIT_CATCH_ALL',
    status: 'error',
    title: 'Erro inesperado',
    hint: 'Veja o log para o detalhe do erro.',
  },
  6: {
    name: 'EXIT_BY_SIGNAL',
    status: 'error',
    title: 'Interrompido',
    hint: 'O processo foi encerrado antes de terminar. Rodar de novo continua de onde parou.',
  },
  7: {
    name: 'EXIT_BY_FILE',
    status: 'warning',
    title: 'Parado por arquivo de parada',
    hint: 'O imapsync encontrou o arquivo de parada (--abort). Rodar de novo continua de onde parou.',
  },
  8: {
    name: 'EXIT_PID_FILE_ERROR',
    status: 'error',
    title: 'Erro no arquivo de PID',
    hint: 'Outro processo pode estar usando o mesmo arquivo de PID. Feche migrações antigas e tente de novo.',
  },
  10: {
    name: 'EXIT_CONNECTION_FAILURE',
    status: 'error',
    title: 'Falha de conexão',
    hint: 'Confira host, porta e segurança, e se a rede ou o firewall liberam o IMAP.',
  },
  101: {
    name: 'EXIT_CONNECTION_FAILURE_HOST1',
    status: 'error',
    title: 'Falha de conexão na origem',
    hint: 'Confira host, porta e segurança da origem, e se a rede ou o firewall liberam o IMAP.',
  },
  102: {
    name: 'EXIT_CONNECTION_FAILURE_HOST2',
    status: 'error',
    title: 'Falha de conexão no destino',
    hint: 'Confira host, porta e segurança do destino, e se a rede ou o firewall liberam o IMAP.',
  },
  12: {
    name: 'EXIT_TLS_FAILURE',
    status: 'error',
    title: 'Falha de TLS',
    hint: 'O certificado do servidor não foi aceito ou a segurança escolhida não confere. Confira SSL/STARTTLS e o certificado do servidor.',
  },
  16: {
    name: 'EXIT_AUTHENTICATION_FAILURE',
    status: 'error',
    title: 'Falha de login',
    hint: 'Verifique usuário e senha. No Gmail/M365 use senha de app.',
  },
  161: {
    name: 'EXIT_AUTHENTICATION_FAILURE_USER1',
    status: 'error',
    title: 'Falha de login na origem',
    hint: 'Verifique usuário e senha da origem. No Gmail/M365 use senha de app.',
  },
  162: {
    name: 'EXIT_AUTHENTICATION_FAILURE_USER2',
    status: 'error',
    title: 'Falha de login no destino',
    hint: 'Verifique usuário e senha do destino. No Gmail/M365 use senha de app.',
  },
  21: {
    name: 'EXIT_SUBFOLDER1_NO_EXISTS',
    status: 'error',
    title: 'Subpasta da origem não existe',
    hint: 'A pasta indicada em --subfolder1 não existe na origem.',
  },
  111: {
    name: 'EXIT_WITH_ERRORS',
    status: 'warning',
    title: 'Terminou com erros',
    hint: 'Algumas mensagens não foram copiadas. Veja o erro mais frequente e rode de novo: o que já foi copiado é pulado.',
  },
  112: {
    name: 'EXIT_WITH_ERRORS_MAX',
    status: 'error',
    title: 'Limite de erros atingido',
    hint: 'A migração parou ao chegar no máximo de erros (--errorsmax). Corrija a causa e rode de novo.',
  },
  113: {
    name: 'EXIT_OVERQUOTA',
    status: 'error',
    title: 'Destino sem cota',
    hint: 'A caixa de destino está cheia. Aumente a cota ou libere espaço e rode de novo.',
  },
  114: {
    name: 'EXIT_ERR_APPEND',
    status: 'error',
    title: 'Erro ao gravar mensagens no destino',
    hint: 'O destino recusou mensagens (APPEND). Mensagem grande demais ou cota são as causas mais comuns.',
  },
  115: {
    name: 'EXIT_ERR_FETCH',
    status: 'error',
    title: 'Erro ao ler mensagens da origem',
    hint: 'A origem não entregou algumas mensagens (FETCH). Rode de novo; se repetir, veja o log.',
  },
  116: {
    name: 'EXIT_ERR_CREATE',
    status: 'error',
    title: 'Erro ao criar pasta no destino',
    hint: 'O destino não aceitou criar uma pasta. Confira nomes, permissões e o separador de pastas.',
  },
  117: {
    name: 'EXIT_ERR_SELECT',
    status: 'error',
    title: 'Erro ao abrir pasta',
    hint: 'Uma pasta não pôde ser aberta (SELECT). Confira se ela existe e se o usuário tem acesso.',
  },
  118: {
    name: 'EXIT_TRANSFER_EXCEEDED',
    status: 'warning',
    title: 'Limite de transferência atingido',
    hint: 'A migração parou no limite de transferência (--exitwhenover). Rode de novo para continuar.',
  },
  119: {
    name: 'EXIT_ERR_APPEND_VIRUS',
    status: 'error',
    title: 'Mensagem recusada pelo antivírus',
    hint: 'O destino recusou mensagens por conter vírus. Veja no log quais foram.',
  },
  120: {
    name: 'EXIT_ERR_FLAGS',
    status: 'error',
    title: 'Erro ao gravar marcações',
    hint: 'O destino recusou flags (lida, importante…) de algumas mensagens.',
  },
  121: {
    name: 'EXIT_ERR_SEARCH',
    status: 'error',
    title: 'Erro de busca no servidor',
    hint: 'O servidor falhou no SEARCH. Rode de novo; se repetir, veja o log.',
  },
}

/** Entrada conhecida para o código, ou uma genérica com o nome que veio do log. */
export function describeExit(code: number, nameFromLog?: string | null): ExitInfo {
  const known = EXIT_CODES[code]
  if (known) return known
  return {
    name: nameFromLog || `código ${code}`,
    status: 'error',
    title: `Terminou com código ${code}`,
    hint: 'Código não reconhecido. Veja o log para o detalhe.',
  }
}
