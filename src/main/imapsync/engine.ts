import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { logger } from '../logger'
import { readJsonFile, writeFileAtomic } from '../settings'
import { removeParTemp } from './job'

// Versão do motor para a tela "Sobre". `imapsync.exe --version` leva ~30 s (o PAR extrai o
// runtime a cada execução), então roda uma vez e fica guardada em engine.json, presa ao
// tamanho e à data do exe: trocar o exe (nova versão do app) lê de novo.

const cacheSchema = z.object({ size: z.number(), mtimeMs: z.number(), version: z.string() })

const VERSION_TIMEOUT_MS = 120_000

let pending: Promise<string | null> | undefined

export function engineVersion(exe: string, cacheFile: string): Promise<string | null> {
  pending ??= readVersion(exe, cacheFile).finally(() => {
    pending = undefined
  })
  return pending
}

async function readVersion(exe: string, cacheFile: string): Promise<string | null> {
  const { size, mtimeMs } = statSync(exe)
  const cached = cacheSchema.safeParse(readJsonFile(cacheFile))
  if (cached.success && cached.data.size === size && cached.data.mtimeMs === mtimeMs) {
    return cached.data.version
  }
  const version = await runVersion(exe)
  if (version) writeFileAtomic(cacheFile, JSON.stringify({ size, mtimeMs, version }))
  return version
}

function runVersion(exe: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = execFile(
      exe,
      ['--version'],
      { windowsHide: true, timeout: VERSION_TIMEOUT_MS },
      (err, stdout) => {
        if (child.pid) removeParTemp(tmpdir(), child.pid)
        const version = /^\s*(\d+\.\d+(?:\.\d+)?)/.exec(stdout)?.[1] ?? null
        if (err || !version) {
          logger.warn(`[engine] --version falhou: ${err?.message ?? 'saída inesperada'}`)
        }
        resolve(version)
      },
    )
  })
}

export const engineCacheFile = (userData: string): string => join(userData, 'engine.json')
