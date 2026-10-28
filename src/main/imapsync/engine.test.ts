import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { engineCacheFile, engineVersion } from './engine'

vi.mock('../logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'migramail-engine-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('engineVersion', () => {
  it('usa o cache quando tamanho e data do exe batem (sem rodar o exe)', async () => {
    const exe = join(dir, 'imapsync.exe')
    writeFileSync(exe, 'não é um executável')
    const { size, mtimeMs } = statSync(exe)
    const cache = engineCacheFile(dir)
    writeFileSync(cache, JSON.stringify({ size, mtimeMs, version: '2.314' }))
    expect(await engineVersion(exe, cache)).toBe('2.314')
  })

  it('cache de outro exe roda de novo; saída sem versão vira null e não grava', async () => {
    const cache = engineCacheFile(dir)
    writeFileSync(cache, JSON.stringify({ size: 1, mtimeMs: 1, version: '2.000' }))
    // node --version imprime "v24…": não é a saída do imapsync
    expect(await engineVersion(process.execPath, cache)).toBeNull()
    expect(JSON.parse(readFileSync(cache, 'utf8'))).toMatchObject({ version: '2.000' })
  })
})
