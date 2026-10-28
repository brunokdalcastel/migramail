// Publica o instalador já gerado (npm run dist) numa Release do GitHub: v<versão> com o
// arquivo versionado e uma cópia "MigraMail-Setup.exe" (alvo fixo de
// releases/latest/download/MigraMail-Setup.exe). As notas vêm do RELEASE.md.
// Exige árvore limpa e a branch enviada. O repo brunokdalcastel/migramail é privado: o download
// exige estar logado no GitHub.
// Uso: npm run release
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(__dirname, '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  version: string
}
const run = (cmd: string, args: string[]): string =>
  execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim()

if (run('git', ['status', '--porcelain'])) throw new Error('Há mudanças sem commit.')
run('git', ['push', '-q', 'origin', 'HEAD'])

const versioned = join(root, 'dist', `MigraMail-Setup-${version}.exe`)
if (!existsSync(versioned)) throw new Error(`Falta ${versioned}: rode npm run dist antes.`)
const stable = join(root, 'dist', 'MigraMail-Setup.exe')
copyFileSync(versioned, stable)

const notesFile = join(root, 'RELEASE.md')
if (!existsSync(notesFile)) throw new Error('Falta o RELEASE.md com as notas da versão.')

console.log(
  run('gh', [
    'release',
    'create',
    `v${version}`,
    versioned,
    stable,
    '--repo',
    'brunokdalcastel/migramail',
    '--title',
    `MigraMail ${version}`,
    '--notes-file',
    notesFile,
  ]),
)
