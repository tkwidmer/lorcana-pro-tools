import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

// Renders the extension's toolbar icons from the InkbornForge mark.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = path.join(__dirname, 'public', 'inkborn_forge_mark.png')
const iconsDir = path.join(__dirname, 'chrome-extension', 'icons')

for (const size of [16, 48, 128]) {
  await sharp(source).resize(size, size).png().toFile(path.join(iconsDir, `icon-${size}.png`))
  console.log(`✓ Generated icon-${size}.png`)
}
