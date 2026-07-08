// Decodes the QR code embedded in a duels.ink deck-share image, for the
// Discord "Decode Deck QR" message command in discord-interactions.ts.
//
// Uses Jimp (pure JS image decoding) rather than sharp: sharp ships native
// per-platform binaries, which is a real risk in a Vercel serverless
// function bundle. Jimp has no native dependencies, trading a bit of speed
// for guaranteed portability.
import { Jimp } from 'jimp'
import { createRequire } from 'node:module'

// jsqr ships a CJS default export; requiring it directly avoids any
// esModuleInterop ambiguity over how `import jsQR from 'jsqr'` resolves.
const require = createRequire(import.meta.url)
const jsQR: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null =
  require('jsqr')

// Deck share images can be large; downscaling keeps decoding fast without
// losing enough resolution to read the QR code.
const MAX_DIMENSION = 1600

export async function decodeQrFromBuffer(buffer: Buffer): Promise<string | null> {
  const image = await Jimp.read(buffer)

  if (image.bitmap.width > MAX_DIMENSION || image.bitmap.height > MAX_DIMENSION) {
    image.scaleToFit({ w: MAX_DIMENSION, h: MAX_DIMENSION })
  }

  const { data, width, height } = image.bitmap
  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length)
  const result = jsQR(pixels, width, height)
  return result ? result.data : null
}

export async function decodeQrFromImageUrl(url: string): Promise<string | null> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download image (HTTP ${response.status})`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  return decodeQrFromBuffer(buffer)
}
