import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const iconsDir = path.join(__dirname, 'chrome-extension', 'icons')

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true })
}

const svgPath = path.join(iconsDir, 'icon.svg')
const sizes = [16, 48, 128]

// Generate PNG icons from SVG
const svg = fs.readFileSync(svgPath)

for (const size of sizes) {
  sharp(svg, { density: 96 })
    .resize(size, size)
    .png()
    .toFile(path.join(iconsDir, `icon-${size}.png`))
    .then(() => console.log(`✓ Generated icon-${size}.png`))
    .catch(err => console.error(`Error generating icon-${size}.png:`, err))
}
