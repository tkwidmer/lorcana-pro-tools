import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import AdmZip from 'adm-zip'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const extensionDir = path.join(__dirname, 'chrome-extension')
const distDir = path.join(__dirname, 'dist')
const publicDir = path.join(__dirname, 'public')

// Ensure directories exist
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true })
}
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true })
}

// Create zip file of the extension
const zip = new AdmZip()

const addToZip = (dir, zipPath = '') => {
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file)
    const zipFilePath = zipPath ? `${zipPath}/${file}` : file
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      addToZip(filePath, zipFilePath)
    } else {
      zip.addFile(zipFilePath, fs.readFileSync(filePath))
    }
  })
}

// Add chrome-extension folder contents
addToZip(extensionDir, 'chrome-extension')

// Write zip files to both dist and public
const zipPath = path.join(distDir, 'lorcana-extension.zip')
const publicZipPath = path.join(publicDir, 'lorcana-extension.zip')

zip.writeZip(zipPath)
zip.writeZip(publicZipPath)

console.log('✓ Extension zipped to dist/lorcana-extension.zip')
console.log('✓ Extension zip also copied to public/lorcana-extension.zip for download')
console.log('  Download link: /lorcana-extension.zip')
