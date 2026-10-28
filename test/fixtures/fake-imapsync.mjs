// imapsync.exe falso para os testes do JobManager: reimprime uma saída real de test/fixtures/imapsync/ linha
// a linha e sai com o código do `Exiting with return value` dela.
//   --fixture <arquivo>  saída a reproduzir (obrigatório)
//   --delay <ms>         atraso entre linhas (padrão 5; 0 imprime tudo de uma vez)
//   --report <arquivo>   grava argv e as senhas recebidas no env, para o teste conferir
//   --leak               imprime a senha da origem numa linha (testa a máscara do log)
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

const report = opt('--report')
if (report) {
  const env = {
    password1: process.env.IMAPSYNC_PASSWORD1,
    password2: process.env.IMAPSYNC_PASSWORD2,
  }
  writeFileSync(report, JSON.stringify({ argv: args, env }))
}

const lines = readFileSync(opt('--fixture'), 'utf8').split(/\r?\n/)
const exit = /^Exiting with return value (\d+)/m.exec(lines.join('\n'))
const delay = Number(opt('--delay') ?? 5)

const out = [`IMAPSYNC_PASSWORD1 ${process.env.IMAPSYNC_PASSWORD1 ? 'MASKED' : '(vazio)'}`]
if (args.includes('--leak')) out.push(`DEBUG LOGIN test1 ${process.env.IMAPSYNC_PASSWORD1}`)
out.push(...lines)

process.exitCode = exit ? Number(exit[1]) : 0

let i = 0
const next = () => {
  if (i >= out.length) return
  process.stdout.write(out[i++] + '\n')
  setTimeout(next, delay)
}

if (delay === 0) process.stdout.write(out.join('\n') + '\n')
else next()
