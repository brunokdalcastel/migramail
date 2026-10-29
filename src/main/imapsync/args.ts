// Monta a linha de comando e o ambiente do imapsync.exe para um job. A senha nunca entra
// nos argumentos: vai por IMAPSYNC_PASSWORD1/2. Sem electron: roda no Vitest.
import { checkExtraArgs, splitArgs } from '@shared/extraArgs'
import type { Account, Endpoint, JobMode, JobSecrets, Side } from '@shared/model'

export { checkExtraArgs, splitArgs } from '@shared/extraArgs'

export interface JobFilePaths {
  pidfile: string
  logdir: string
  logfile: string
}

function endpointArgs(e: Endpoint, side: Side): string[] {
  const args = [`--host${side}`, e.host, `--user${side}`, e.user, `--port${side}`, String(e.port)]
  if (e.security === 'ssl') args.push(`--ssl${side}`)
  else if (e.security === 'tls') args.push(`--tls${side}`)
  else args.push(`--nossl${side}`, `--notls${side}`)
  // O padrão do imapsync é SSL_verify_mode=0 (não valida o certificado).
  if (e.security !== 'none' && !e.allowInvalidCert)
    args.push(`--sslargs${side}`, 'SSL_verify_mode=1')
  if (e.preset !== 'none') args.push(`--${e.preset}${side}`)
  return args
}

const MODE_ARGS: Record<JobMode, string[]> = {
  login: ['--justlogin'],
  sizes: ['--justfoldersizes'],
  dry: ['--dry'],
  migrate: [],
}

/**
 * Argumentos do imapsync, na ordem: servidores (com preset), modo, opções, fixos do app e,
 * por último, os extras (perfis e depois a conta) para o usuário poder sobrescrever.
 */
export function buildArgs(
  account: Account,
  mode: JobMode,
  paths: JobFilePaths,
  profileExtraArgs: string[] = [],
): string[] {
  const tokens = [...profileExtraArgs, account.options.extraArgs].flatMap(splitArgs)
  const { errors } = checkExtraArgs(tokens)
  if (errors.length) throw new Error(errors.join(' '))
  const o = account.options
  const args = [...endpointArgs(account.source, 1), ...endpointArgs(account.dest, 2)]
  args.push(...MODE_ARGS[mode])

  // explícito nos dois sentidos: os presets do Gmail ligam o automap sozinhos no imapsync
  args.push(o.automap ? '--automap' : '--noautomap')
  if (o.justfolders) args.push('--justfolders')
  if (o.subfolder2.trim()) args.push('--subfolder2', o.subfolder2.trim())
  for (const e of o.exclude) args.push('--exclude', e)
  for (const f of o.folders) args.push('--folder', f)
  for (const m of o.f1f2) args.push('--f1f2', `${m.from}=${m.to}`)
  args.push(o.syncinternaldates ? '--syncinternaldates' : '--nosyncinternaldates')
  if (o.maxBytesPerSecond !== null) args.push('--maxbytespersecond', String(o.maxBytesPerSecond))
  args.push('--errorsmax', String(o.errorsMax))

  args.push(
    '--no-modulesversion',
    '--pidfile',
    paths.pidfile,
    '--logdir',
    paths.logdir,
    '--logfile',
    paths.logfile,
  )

  for (const extra of profileExtraArgs) args.push(...splitArgs(extra))
  args.push(...splitArgs(o.extraArgs))
  return args
}

/** Ambiente do processo filho: herda o do app e acrescenta as senhas. */
export function buildEnv(secrets: JobSecrets): NodeJS.ProcessEnv {
  return {
    ...process.env,
    IMAPSYNC_PASSWORD1: secrets.password1,
    IMAPSYNC_PASSWORD2: secrets.password2,
  }
}
