// Põe o imapsync.exe 2.314 e a licença em vendor/imapsync/ (o exe não vai para o git).
// Baixa o zip oficial de imapsync.lamiral.info/dist2, confere o SHA-256 do zip e do exe e
// extrai só o exe, com o tar.exe do Windows. Se o exe certo já estiver lá, não faz nada.
// Uso: npm run fetch-imapsync
//      npm run fetch-imapsync -- --from C:\Tools\imapsync\imapsync_2.314   (sem internet)
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const VERSION = '2.314'
const ZIP_URL = `https://imapsync.lamiral.info/dist2/imapsync_${VERSION}.zip`
const ZIP_SHA256 = '61972bf94532bf186dd6d6ee54a4c70bb7ab3bdb79f324321cd742fd50953a0c'
const EXE_SHA256 = '329c0bfecab410a2bf5e57cc3319aa00b8e494fd792fe3a5476db9efdb1d2aab'

// O zip não traz arquivo de licença; o texto abaixo é o de https://imapsync.lamiral.info/LICENSE
const LICENSE = `imapsync ${VERSION} - Copyright Gilles LAMIRAL <gilles@lamiral.info>
https://imapsync.lamiral.info/

                NO LIMIT PUBLIC LICENSE
                 Version 0/0, June 2012

Gilles LAMIRAL
La Billais
35580 Baulon
France

                NO LIMIT PUBLIC LICENSE
Terms and conditions for copying, distribution, modification
or anything else.

 0 No limits to do anything with this work and this license.
 1 GOTO 0
`

const root = resolve(__dirname, '..')
const outDir = join(root, 'vendor', 'imapsync')
const outExe = join(outDir, 'imapsync.exe')

const sha256 = (file: string): string =>
  createHash('sha256').update(readFileSync(file)).digest('hex')

function check(file: string, expected: string, what: string): void {
  const actual = sha256(file)
  if (actual !== expected) {
    throw new Error(`SHA-256 do ${what} não confere:\n  esperado ${expected}\n  obtido   ${actual}`)
  }
}

async function download(dest: string): Promise<void> {
  console.log(`baixando ${ZIP_URL}`)
  const res = await fetch(ZIP_URL)
  if (!res.ok) throw new Error(`download falhou: HTTP ${res.status}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

/** O tar do Windows (bsdtar) abre zip; o tar do Git Bash, não. */
function extractExe(zip: string, dest: string): string {
  const tar = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe')
  execFileSync(tar, ['-xf', zip, '-C', dest, `imapsync_${VERSION}/imapsync.exe`])
  return join(dest, `imapsync_${VERSION}`, 'imapsync.exe')
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'LICENSE.txt'), LICENSE)

  if (existsSync(outExe) && sha256(outExe) === EXE_SHA256) {
    console.log(`vendor/imapsync/imapsync.exe ${VERSION} já está no lugar`)
    return
  }

  const fromIdx = process.argv.indexOf('--from')
  if (fromIdx !== -1) {
    const from = process.argv[fromIdx + 1]
    if (!from) throw new Error('--from precisa da pasta do imapsync')
    const exe = join(from, 'imapsync.exe')
    check(exe, EXE_SHA256, 'imapsync.exe')
    copyFileSync(exe, outExe)
  } else {
    const work = mkdtempSync(join(tmpdir(), 'migramail-fetch-'))
    try {
      const zip = join(work, `imapsync_${VERSION}.zip`)
      await download(zip)
      check(zip, ZIP_SHA256, 'zip')
      const exe = extractExe(zip, work)
      check(exe, EXE_SHA256, 'imapsync.exe')
      copyFileSync(exe, outExe)
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  }
  console.log(`vendor/imapsync/imapsync.exe ${VERSION} pronto`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
