import { describe, expect, it } from 'vitest'
import { exportAccountsCsv, parseAccountsCsv } from './csv'
import { defaultMigrationOptions, type Account } from './model'

describe('parseAccountsCsv', () => {
  it('file.txt oficial do imapsync, com comentário e ; no fim', () => {
    const text = [
      '# comentário',
      'test1.lamiral.info;test1;secret1;test2.lamiral.info;test2;secret2;',
      '',
      'a.com;u1;p1;b.com;u2;p2;--dry --nofoldersizes;',
    ].join('\n')
    const { rows, errors } = parseAccountsCsv(text)
    expect(errors).toEqual([])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      line: 2,
      source: { host: 'test1.lamiral.info', port: 993, security: 'ssl', user: 'test1' },
      dest: { host: 'test2.lamiral.info', port: 993, security: 'ssl', user: 'test2' },
      password1: 'secret1',
      password2: 'secret2',
      extraArgs: '',
    })
    expect(rows[1]?.line).toBe(4)
    expect(rows[1]?.extraArgs).toBe('--dry --nofoldersizes')
  })

  it('CSV com cabeçalho, vírgula, BOM, \\r\\n e aspas', () => {
    const text =
      '\uFEFFhost1,user1,password1,host2,user2,password2,extra\r\n' +
      'a.com,"Silva, Ana","pa""ss,1",b.com,ana@b.com,,"--f1f2 ""A B=C"""\r\n'
    const { rows, errors } = parseAccountsCsv(text)
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({
      line: 2,
      source: { user: 'Silva, Ana' },
      password1: 'pa"ss,1',
      password2: '',
      extraArgs: '--f1f2 "A B=C"',
    })
  })

  it('cabeçalho com ; e sem a coluna extra', () => {
    const { rows, errors } = parseAccountsCsv(
      'host1;user1;password1;host2;user2;password2\na;b;c;d;e;f\n',
    )
    expect(errors).toEqual([])
    expect(rows[0]?.extraArgs).toBe('')
  })

  it('host:porta; 143 vira STARTTLS', () => {
    const { rows } = parseAccountsCsv('mail.a.com:143;u;p;mail.b.com:10993;u;p;')
    expect(rows[0]?.source).toMatchObject({ host: 'mail.a.com', port: 143, security: 'tls' })
    expect(rows[0]?.dest).toMatchObject({ host: 'mail.b.com', port: 10993, security: 'ssl' })
  })

  it('linhas ruins viram erro com o número da linha, sem perder as boas', () => {
    const text = [
      'a.com;u;p;b.com;u;p;',
      'a.com;u;p;b.com',
      'a.com;;p;b:99999;u;p;',
      'c.com;u;p;d.com;u;p;',
    ].join('\n')
    const { rows, errors } = parseAccountsCsv(text)
    expect(rows.map((r) => r.line)).toEqual([1, 4])
    expect(errors).toEqual([
      { line: 2, message: 'faltam colunas (user2, password2)' },
      { line: 3, message: 'host2 inválido, user1 vazio' },
    ])
  })
})

describe('exportAccountsCsv', () => {
  const account: Account = {
    id: 'a1',
    label: 'x',
    source: {
      profileId: null,
      host: 'a.com',
      port: 993,
      security: 'ssl',
      preset: 'none',
      allowInvalidCert: false,
      user: 'Silva, Ana',
      rememberPassword: true,
    },
    dest: {
      profileId: null,
      host: 'b.com',
      port: 143,
      security: 'tls',
      preset: 'none',
      allowInvalidCert: false,
      user: 'ana@b.com',
      rememberPassword: true,
    },
    options: { ...defaultMigrationOptions, extraArgs: '--f1f2 "A=B"' },
  }

  it('gera cabeçalho, senhas vazias e volta igual na importação', () => {
    const csv = exportAccountsCsv([account])
    expect(csv).toBe(
      'host1,user1,password1,host2,user2,password2,extra\r\n' +
        'a.com,"Silva, Ana",,b.com:143,ana@b.com,,"--f1f2 ""A=B"""\r\n',
    )
    const { rows } = parseAccountsCsv(csv)
    expect(rows[0]).toMatchObject({
      source: { host: 'a.com', port: 993, user: 'Silva, Ana' },
      dest: { host: 'b.com', port: 143, security: 'tls' },
      password1: '',
      password2: '',
      extraArgs: '--f1f2 "A=B"',
    })
  })
})
