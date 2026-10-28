import { describe, expect, it } from 'vitest'
import { defaultMigrationOptions, type Account, type Endpoint } from '@shared/model'
import { buildArgs, buildEnv, checkExtraArgs, splitArgs } from './args'

const paths = { pidfile: 'C:\\run\\j1.pid', logdir: 'C:\\logs', logfile: 'conta_j1.txt' }

function endpoint(over: Partial<Endpoint> = {}): Endpoint {
  return {
    profileId: null,
    host: 'test1.lamiral.info',
    port: 993,
    security: 'ssl',
    preset: 'none',
    allowInvalidCert: false,
    user: 'test1',
    rememberPassword: false,
    ...over,
  }
}

function account(over: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    label: 'Teste',
    source: endpoint(),
    dest: endpoint({ host: 'test2.lamiral.info', user: 'test2' }),
    options: defaultMigrationOptions,
    ...over,
  }
}

/** Valor que segue a opção na lista de argumentos. */
function valueOf(args: string[], option: string): string | undefined {
  const i = args.indexOf(option)
  return i === -1 ? undefined : args[i + 1]
}

describe('buildArgs', () => {
  it('nenhum token tem a senha e as senhas vão no env', () => {
    const secrets = { password1: 'secret1', password2: 'secret2' }
    const args = buildArgs(account(), 'migrate', paths)
    expect(args.some((a) => a.includes('secret1') || a.includes('secret2'))).toBe(false)
    expect(args.some((a) => /^--password/.test(a))).toBe(false)
    const env = buildEnv(secrets)
    expect(env.IMAPSYNC_PASSWORD1).toBe('secret1')
    expect(env.IMAPSYNC_PASSWORD2).toBe('secret2')
    expect(env.PATH ?? env.Path).toBe(process.env.PATH ?? process.env.Path)
  })

  it('servidores, segurança e verificação do certificado', () => {
    const args = buildArgs(account(), 'migrate', paths)
    expect(valueOf(args, '--host1')).toBe('test1.lamiral.info')
    expect(valueOf(args, '--user2')).toBe('test2')
    expect(valueOf(args, '--port1')).toBe('993')
    expect(args).toContain('--ssl1')
    expect(valueOf(args, '--sslargs1')).toBe('SSL_verify_mode=1')
    expect(valueOf(args, '--sslargs2')).toBe('SSL_verify_mode=1')
  })

  it('STARTTLS também valida; allowInvalidCert e sem criptografia não', () => {
    const args = buildArgs(
      account({
        source: endpoint({ security: 'tls', port: 143 }),
        dest: endpoint({ allowInvalidCert: true }),
      }),
      'migrate',
      paths,
    )
    expect(args).toContain('--tls1')
    expect(valueOf(args, '--sslargs1')).toBe('SSL_verify_mode=1')
    expect(args).not.toContain('--sslargs2')

    const plain = buildArgs(
      account({ source: endpoint({ security: 'none', port: 143 }) }),
      'login',
      paths,
    )
    expect(plain).toEqual(expect.arrayContaining(['--nossl1', '--notls1']))
    expect(plain).not.toContain('--sslargs1')
  })

  it('modo de cada job', () => {
    expect(buildArgs(account(), 'login', paths)).toContain('--justlogin')
    expect(buildArgs(account(), 'sizes', paths)).toContain('--justfoldersizes')
    expect(buildArgs(account(), 'dry', paths)).toContain('--dry')
    const migrate = buildArgs(account(), 'migrate', paths)
    expect(
      migrate.filter((a) => ['--justlogin', '--justfoldersizes', '--dry'].includes(a)),
    ).toEqual([])
  })

  it('fixos do app sempre presentes', () => {
    const args = buildArgs(account(), 'migrate', paths)
    expect(args).toContain('--no-modulesversion')
    expect(valueOf(args, '--pidfile')).toBe(paths.pidfile)
    expect(valueOf(args, '--logdir')).toBe(paths.logdir)
    expect(valueOf(args, '--logfile')).toBe(paths.logfile)
    expect(valueOf(args, '--errorsmax')).toBe('50')
  })

  it('opções da migração', () => {
    const args = buildArgs(
      account({
        options: {
          ...defaultMigrationOptions,
          automap: true,
          justfolders: true,
          subfolder2: ' antigo ',
          exclude: ['^Trash'],
          folders: ['INBOX', 'Sent'],
          f1f2: [{ from: 'Itens Enviados', to: 'Sent' }],
          syncinternaldates: false,
          maxBytesPerSecond: 500000,
          errorsMax: 10,
        },
      }),
      'migrate',
      paths,
    )
    expect(args).toContain('--automap')
    expect(args).toContain('--justfolders')
    expect(valueOf(args, '--subfolder2')).toBe('antigo')
    expect(valueOf(args, '--exclude')).toBe('^Trash')
    expect(args.filter((a) => a === '--folder')).toHaveLength(2)
    expect(valueOf(args, '--f1f2')).toBe('Itens Enviados=Sent')
    expect(args).toContain('--nosyncinternaldates')
    expect(valueOf(args, '--maxbytespersecond')).toBe('500000')
    expect(valueOf(args, '--errorsmax')).toBe('10')
  })

  it('preset antes das opções e extras por último', () => {
    const args = buildArgs(
      account({
        source: endpoint({ preset: 'gmail', host: 'imap.gmail.com' }),
        dest: endpoint({ preset: 'office', host: 'outlook.office365.com' }),
        options: { ...defaultMigrationOptions, extraArgs: '--nofoldersizes' },
      }),
      'migrate',
      paths,
      ['--maxlinelength 10000'],
    )
    // padrão: pastas com o mesmo nome, mesmo com o preset do Gmail (que ligaria o automap)
    expect(args).not.toContain('--automap')
    expect(args.indexOf('--gmail1')).toBeLessThan(args.indexOf('--noautomap'))
    expect(args.indexOf('--office2')).toBeLessThan(args.indexOf('--noautomap'))
    expect(args.slice(-3)).toEqual(['--maxlinelength', '10000', '--nofoldersizes'])
  })
})

describe('splitArgs', () => {
  it('respeita aspas duplas', () => {
    expect(splitArgs('--f1f2 "A B=C D" --dry')).toEqual(['--f1f2', 'A B=C D', '--dry'])
  })

  it('espaços repetidos, vazio e aspas vazias', () => {
    expect(splitArgs('  --a   b  ')).toEqual(['--a', 'b'])
    expect(splitArgs('')).toEqual([])
    expect(splitArgs('--subfolder2 ""')).toEqual(['--subfolder2', ''])
    expect(splitArgs('--exclude="Itens Excluídos"')).toEqual(['--exclude=Itens Excluídos'])
  })
})

describe('checkExtraArgs', () => {
  it('recusa senha na linha de comando e opções do app', () => {
    expect(checkExtraArgs(['--password1', 'x']).errors).toHaveLength(1)
    expect(checkExtraArgs(['--password2=x']).errors).toHaveLength(1)
    expect(checkExtraArgs(['-PASSWORD1', 'x']).errors).toHaveLength(1)
    expect(
      checkExtraArgs(['--pidfile', 'a', '--logdir', 'b', '--logfile', 'c']).errors,
    ).toHaveLength(3)
  })

  it('recusa opções que poriam a senha no log (testado no imapsync 2.314)', () => {
    expect(checkExtraArgs(['--showpasswords']).errors).toHaveLength(1)
    expect(checkExtraArgs(['--debugenv']).errors).toHaveLength(1)
    expect(checkExtraArgs(['--DebugEnv']).errors).toHaveLength(1)
    expect(checkExtraArgs(['--noshowpasswords', '--nodebugenv']).errors).toEqual([])
  })

  it('avisa que a depuração grava o conteúdo das mensagens', () => {
    const { errors, warnings } = checkExtraArgs(
      splitArgs('--debugimap --debugimap1 --debugimap2 --debugcontent'),
    )
    expect(errors).toEqual([])
    expect(warnings).toHaveLength(4)
  })

  it('avisa de opções perigosas', () => {
    const { errors, warnings } = checkExtraArgs([
      '--delete1',
      '--delete2',
      '--delete1emptyfolders',
      '--sslargs1',
      'SSL_verify_mode=0',
      '--nossl2',
    ])
    expect(errors).toEqual([])
    expect(warnings).toHaveLength(5)
  })

  it('não reclama de opções comuns', () => {
    expect(
      checkExtraArgs(splitArgs('--nofoldersizes --maxlinelength 10000 --passfile1 a.txt')),
    ).toEqual({
      errors: [],
      warnings: [],
    })
  })
})
