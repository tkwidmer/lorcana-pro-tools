import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const extensionDir = path.join(__dirname, 'chrome-extension')
const publicDir = path.join(__dirname, 'public')

// Ensure public directory exists
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true })
}

// Copy extension files to public directory for hosting
const extensionPublicDir = path.join(publicDir, 'lorcana-extension')
if (fs.existsSync(extensionPublicDir)) {
  fs.rmSync(extensionPublicDir, { recursive: true })
}
fs.mkdirSync(extensionPublicDir, { recursive: true })

// Copy all extension files
const copy = (src, dest) => {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
    fs.readdirSync(src).forEach(file => {
      copy(path.join(src, file), path.join(dest, file))
    })
  } else {
    fs.copyFileSync(src, dest)
  }
}

copy(extensionDir, extensionPublicDir)

// Create manifest.json for download
const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8'))
manifest.update_url = 'https://lorcana-pro-tools.vercel.app/extension-updates.xml'

fs.writeFileSync(
  path.join(extensionPublicDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2)
)

console.log('✓ Extension copied to public/lorcana-extension')
console.log('  Users can now load this unpacked extension from chrome://extensions')
