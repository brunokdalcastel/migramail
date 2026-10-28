import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const paths = { userData: '' }
const encryption = { available: true }
// Cifra falsa (XOR) só para o teste: o valor salvo não pode conter o texto do segredo.
const xor = (b: Buffer): Buffer => Buffer.from(b.map((x) => x ^ 0x5a))

vi.mock('electron', () => ({
  app: { getPath: () => paths.userData },
  safeStorage: {
    isEncryptionAvailable: () => encryption.available,
    encryptString: (v: string) => xor(Buffer.from(v, 'utf8')),
    decryptString: (b: Buffer) => xor(b).toString('utf8'),
  },
}))

vi.mock('./logger', () => ({ logger: { warn: vi.fn() } }))

const { getSecret, hasSecret, removeSecret, secretIds, setSecret } = await import('./secrets')

const PASSWORD = 'senha-teste-1234567890'

beforeEach(() => {
  encryption.available = true
  paths.userData = mkdtempSync(join(tmpdir(), 'migramail-secrets-'))
})
afterEach(() => rmSync(paths.userData, { recursive: true, force: true }))

describe('secrets', () => {
  it('salva, lê, informa e remove', () => {
    expect(hasSecret('pw:a:1')).toBe(false)
    setSecret('pw:a:1', PASSWORD)
    setSecret('pw:a:2', 'x')
    expect(hasSecret('pw:a:1')).toBe(true)
    expect(getSecret('pw:a:1')).toBe(PASSWORD)
    expect(secretIds()).toEqual(['pw:a:1', 'pw:a:2'])
    removeSecret('pw:a:1')
    expect(hasSecret('pw:a:1')).toBe(false)
    expect(getSecret('pw:a:1')).toBeNull()
    expect(getSecret('pw:a:2')).toBe('x')
  })

  it('nunca grava o segredo em texto puro', () => {
    setSecret('pw:a:1', PASSWORD)
    const raw = readFileSync(join(paths.userData, 'secrets.json'), 'utf8')
    expect(raw).not.toContain(PASSWORD)
    const stored = (JSON.parse(raw) as Record<string, string>)['pw:a:1']!
    expect(stored).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(Buffer.from(stored, 'base64').toString('utf8')).not.toContain(PASSWORD)
  })

  it('sem criptografia disponível recusa e não salva', () => {
    encryption.available = false
    expect(() => setSecret('pw:a:1', PASSWORD)).toThrow(/Criptografia/)
    expect(hasSecret('pw:a:1')).toBe(false)
  })
})
