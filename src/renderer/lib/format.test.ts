import { describe, expect, it } from 'vitest'
import { formatBytes, formatDuration, formatPercent, formatSpeed } from './format'

describe('formatBytes', () => {
  it('fica em bytes abaixo de 1 KiB', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
  })

  it('usa base 1024 e vírgula decimal', () => {
    expect(formatBytes(1536)).toBe('1,5 KiB')
    expect(formatBytes(169494)).toBe('166 KiB')
    expect(formatBytes(20480)).toBe('20 KiB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MiB')
    expect(formatBytes(2.25 * 1024 ** 3)).toBe('2,3 GiB')
  })

  it('tira a casa decimal a partir de 100', () => {
    // Total size da origem em test/fixtures/imapsync/run_sizes.txt
    expect(formatBytes(412660890)).toBe('394 MiB')
  })

  it('valor inválido vira 0 B', () => {
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(-5)).toBe('0 B')
  })
})

describe('formatDuration', () => {
  it('segundos, minutos e horas', () => {
    expect(formatDuration(0)).toBe('0 s')
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(120)).toBe('2 min')
    expect(formatDuration(200)).toBe('3 min 20 s')
    expect(formatDuration(65)).toBe('1 min 05 s')
    expect(formatDuration(3900)).toBe('1 h 05 min')
    expect(formatDuration(36000)).toBe('10 h 00 min')
  })
})

describe('formatSpeed', () => {
  it('converte KiB/s', () => {
    expect(formatSpeed(512)).toBe('512 KiB/s')
    expect(formatSpeed(2355.2)).toBe('2,3 MiB/s')
  })
})

describe('formatPercent', () => {
  it('arredonda para baixo (100% só no fim)', () => {
    expect(formatPercent(99.9)).toBe('99%')
    expect(formatPercent(100)).toBe('100%')
    expect(formatPercent(null)).toBe('—')
  })
})
