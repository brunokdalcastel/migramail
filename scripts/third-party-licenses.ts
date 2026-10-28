// Gera THIRD_PARTY_LICENSES.md: pacotes npm distribuídos (asar + o que o Vite embute no
// renderer), com a licença de cada um. Falha se aparecer licença incompatível com distribuir
// o app fechado (GPL, AGPL, LGPL, SSPL) ou pacote sem licença declarada.
// Uso: npm run licenses
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = resolve(__dirname, '..')

interface Pkg {
  name: string
  version: string
  license: string
  repository: string
}

function readPkg(dir: string): Pkg | null {
  try {
    const json = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      name?: string
      version?: string
      license?: string | { type?: string }
      repository?: string | { url?: string }
    }
    if (!json.name || !json.version) return null
    const license = typeof json.license === 'string' ? json.license : (json.license?.type ?? '?')
    const repo =
      typeof json.repository === 'string' ? json.repository : (json.repository?.url ?? '')
    return {
      name: json.name,
      version: json.version,
      license,
      repository: repo.replace(/^git\+/, '').replace(/\.git$/, ''),
    }
  } catch {
    return null
  }
}

// O que vai para o usuário: dependências de produção (node_modules do asar) + as libs que o
// Vite embute no bundle do renderer + o próprio Electron.
const RENDERER_BUNDLED = [
  'react',
  'react-dom',
  'zustand',

  'echarts',

  'tailwindcss',
  '@fontsource-variable/geist',
  '@fontsource-variable/geist-mono',
]

const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
}

/** Pasta do pacote como o Node resolveria a partir de `fromDir`. */
function resolvePkg(name: string, fromDir: string): string | null {
  let dir = fromDir
  for (;;) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const seen = new Map<string, Pkg>()
const visited = new Set<string>()
const queue: Array<[string, string]> = [
  ...Object.keys(rootPkg.dependencies ?? {}),
  ...RENDERER_BUNDLED,
  'electron',
].map((n) => [n, root])
while (queue.length) {
  const [name, from] = queue.shift()!
  const dir = resolvePkg(name, from)
  if (!dir || visited.has(dir)) continue
  visited.add(dir)
  const pkg = readPkg(dir)
  if (pkg) seen.set(`${pkg.name}@${pkg.version}`, pkg)
  const deps =
    (
      JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>
      }
    ).dependencies ?? {}
  // o pacote npm do electron só baixa o binário; as deps dele não vão para o usuário
  if (name !== 'electron') for (const dep of Object.keys(deps)) queue.push([dep, dir])
}
const packages = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))

const lines = [
  '# Licenças de terceiros',
  '',
  'Gerado por `npm run licenses` (scripts/third-party-licenses.ts). Não editar à mão.',
  '',
  'O imapsync.exe (NO LIMIT PUBLIC LICENSE) vai junto, fora do asar: ver NOTICE.',
  '',
  `## Pacotes npm distribuídos (${packages.length})`,
  '',
  '| Pacote | Versão | Licença | Repositório |',
  '|---|---|---|---|',
  ...packages.map((p) => `| ${p.name} | ${p.version} | ${p.license} | ${p.repository} |`),
  '',
]
writeFileSync(join(root, 'THIRD_PARTY_LICENSES.md'), lines.join('\n'))

const COPYLEFT = /\b(A?GPL|LGPL|SSPL)/i
const unknown = packages.filter((p) => p.license === '?')
const copyleft = packages.filter((p) => COPYLEFT.test(p.license))
console.log(`THIRD_PARTY_LICENSES.md: ${packages.length} pacotes`)
if (unknown.length || copyleft.length) {
  for (const p of unknown) console.error(`sem licença declarada: ${p.name}@${p.version}`)
  for (const p of copyleft)
    console.error(`licença incompatível: ${p.name}@${p.version} (${p.license})`)
  process.exit(1)
}
