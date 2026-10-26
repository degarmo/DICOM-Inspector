// Render build/icon.svg into build/icon.ico (PNG-compressed entries, 16-256 px).
// Usage: npm run icon
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Resvg } from '@resvg/resvg-js'

const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]
const buildDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')
const svg = readFileSync(join(buildDir, 'icon.svg'))

const images = SIZES.map((size) => ({
  size,
  png: new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng(),
}))

// ICO layout: 6-byte header, one 16-byte directory entry per image, then the PNG data.
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)

let offset = 6 + 16 * images.length
const entries = images.map(({ size, png }) => {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size >= 256 ? 0 : size, 0)
  entry.writeUInt8(size >= 256 ? 0 : size, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += png.length
  return entry
})

const ico = Buffer.concat([header, ...entries, ...images.map((image) => image.png)])
writeFileSync(join(buildDir, 'icon.ico'), ico)
console.log(`Wrote build/icon.ico (${SIZES.join(', ')} px, ${ico.length} bytes)`)
