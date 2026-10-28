// Números da migração em texto pt-BR: tamanhos em KiB/MiB/GiB (base 1024, como o imapsync),
// durações curtas e velocidade. Lógica pura, testada em format.test.ts.

const UNITS = ['KiB', 'MiB', 'GiB', 'TiB'] as const

const oneDecimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/** `1536` → `1,5 KiB`; abaixo de 1 KiB fica em bytes (`512 B`). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${integer.format(Math.max(0, bytes || 0))} B`
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  // a partir de 100 a casa decimal só polui (`412 MiB`, não `412,3 MiB`)
  const text = value >= 100 ? integer.format(value) : oneDecimal.format(value)
  return `${text} ${UNITS[unit]}`
}

/** `45` → `45 s`; `200` → `3 min 20 s`; `3900` → `1 h 05 min`. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s} s`
  if (s < 3600) {
    const rest = s % 60
    return rest ? `${Math.floor(s / 60)} min ${String(rest).padStart(2, '0')} s` : `${s / 60} min`
  }
  const h = Math.floor(s / 3600)
  const min = Math.floor((s % 3600) / 60)
  return `${h} h ${String(min).padStart(2, '0')} min`
}

/** Velocidade do imapsync (KiB/s) no mesmo formato dos tamanhos: `2,3 MiB/s`. */
export function formatSpeed(kibPerSecond: number): string {
  return `${formatBytes(kibPerSecond * 1024)}/s`
}

/** `42.4` → `42%`; `null` → `—`. */
export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.floor(value)}%`
}
