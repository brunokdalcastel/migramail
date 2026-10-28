// Gera build/icon.ico (ícone do .exe, do instalador e da barra de tarefas) com o mesmo
// envelope do logo da barra de título (Icon "logo"): quadrado arredondado na cor de destaque
// e o envelope no traço escuro. Entradas BMP 32 bits em 16, 24, 32, 48, 64 e 256 px.
// Uso: npm run icon
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SIZES = [16, 24, 32, 48, 64, 256]

// Icon.tsx: 'M3 6h18v12H3zM3 7l9 6 9-6' (grade 24×24)
const STROKES: (readonly [number, number])[][] = [
  [
    [3, 6],
    [21, 6],
    [21, 18],
    [3, 18],
    [3, 6],
  ],
  [
    [3, 7],
    [12, 13],
    [21, 7],
  ],
]

/** Distância do ponto ao segmento AB. */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** BGRA de cima para baixo. Cores de tokens.css: --accent #22d3ee e --accent-fg #04161a. */
function draw(size: number): Buffer {
  const buf = Buffer.alloc(size * size * 4)
  const bg = [0xee, 0xd3, 0x22]
  const fg = [0x1a, 0x16, 0x04]
  const half = size / 2
  const radius = size * 0.24
  const inner = half - radius
  // o envelope ocupa ~72% do quadrado
  const scale = (size * 0.72) / 24
  const offset = half - 12 * scale
  const lines = STROKES.map((pts) => pts.map(([x, y]) => [offset + x * scale, offset + y * scale]))
  const stroke = Math.max(0.9, 2.4 * scale) / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const qx = Math.max(Math.abs(px - half) - inner, 0)
      const qy = Math.max(Math.abs(py - half) - inner, 0)
      const alpha = Math.max(0, Math.min(1, 0.5 - (Math.hypot(qx, qy) - radius)))
      if (alpha === 0) continue
      let d = Infinity
      for (const pts of lines) {
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, ay] = pts[i]!
          const [bx, by] = pts[i + 1]!
          d = Math.min(d, segmentDistance(px, py, ax!, ay!, bx!, by!))
        }
      }
      const cover = Math.max(0, Math.min(1, stroke - d + 0.5))
      const i = (y * size + x) * 4
      for (let k = 0; k < 3; k++) buf[i + k] = Math.round(bg[k]! * (1 - cover) + fg[k]! * cover)
      buf[i + 3] = Math.round(alpha * 255)
    }
  }
  return buf
}

/** DIB do ICO: cabeçalho com altura dobrada, BGRA de baixo para cima e máscara AND zerada. */
function dib(size: number): Buffer {
  const bgra = draw(size)
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    bgra.copy(pixels, (size - 1 - y) * size * 4, y * size * 4, (y + 1) * size * 4)
  }
  const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size)
  return Buffer.concat([header, pixels, mask])
}

const images = SIZES.map(dib)
const dir = Buffer.alloc(6 + 16 * SIZES.length)
dir.writeUInt16LE(1, 2)
dir.writeUInt16LE(SIZES.length, 4)
let offset = dir.length
SIZES.forEach((size, i) => {
  const e = 6 + 16 * i
  dir.writeUInt8(size % 256, e)
  dir.writeUInt8(size % 256, e + 1)
  dir.writeUInt16LE(1, e + 4)
  dir.writeUInt16LE(32, e + 6)
  dir.writeUInt32LE(images[i]!.length, e + 8)
  dir.writeUInt32LE(offset, e + 12)
  offset += images[i]!.length
})

const out = resolve(__dirname, '..', 'build')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'icon.ico'), Buffer.concat([dir, ...images]))
console.log(`build/icon.ico (${SIZES.join(', ')} px)`)
