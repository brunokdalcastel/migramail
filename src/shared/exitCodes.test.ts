import { describe, expect, it } from 'vitest'
import { describeExit, EXIT_CODES } from './exitCodes'

describe('describeExit', () => {
  it('traduz os códigos conhecidos', () => {
    expect(describeExit(0).status).toBe('ok')
    expect(describeExit(111)).toMatchObject({ status: 'warning', title: 'Terminou com erros' })
    expect(describeExit(113)).toMatchObject({ status: 'error', title: 'Destino sem cota' })
    expect(describeExit(161).hint).toMatch(/senha de app/)
  })

  it('código desconhecido usa o nome do log', () => {
    expect(describeExit(254, 'EXIT_TESTS_FAILED')).toMatchObject({
      name: 'EXIT_TESTS_FAILED',
      status: 'error',
      title: 'Terminou com código 254',
    })
  })

  it('cobre a tabela do RE §3', () => {
    const codes = [
      0,
      1,
      6,
      7,
      8,
      10,
      101,
      102,
      12,
      16,
      161,
      162,
      21,
      ...Array.from({ length: 11 }, (_, i) => 111 + i),
    ]
    for (const c of codes) expect(EXIT_CODES[c], `código ${c}`).toBeDefined()
  })
})
