/* global process */
// Prerenders the public (non-supporter-gated) marketing routes to static HTML
// after `vite build`, so crawlers that don't execute JS still see real
// per-page content instead of the bare index.html shell. Vercel serves these
// static files ahead of the SPA catch-all rewrite in vercel.json.
//
// This is prerendering, not SSR-with-hydration: the client bundle still does
// a full client-side render on load, briefly replacing the prerendered
// markup. That's fine for SEO (crawlers already read the static HTML) and
// invisible to real users in practice.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import { chromium } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, 'dist')
const PORT = 4174

const ROUTES = [
  '/',
  '/proxy',
  '/coconut-deck-builder',
  '/cut-calculator',
  '/limited-guide',
  '/rules',
  '/deck-comparison',
  '/winrate-matrix',
  '/leaderboard',
  '/lore-tracker',
]

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url)
        if (res.ok) return resolve()
      } catch {
        // server not up yet
      }
      if (Date.now() - start > timeoutMs) return reject(new Error(`Timed out waiting for ${url}`))
      setTimeout(tick, 250)
    }
    tick()
  })
}

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: __dirname,
    stdio: 'inherit',
  })

  try {
    await waitForServer(`http://localhost:${PORT}/`)

    const browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
      args: ['--no-sandbox'],
    })
    const page = await browser.newPage()

    for (const route of ROUTES) {
      try {
        await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle', timeout: 10000 })
        const html = await page.content()

        const outDir = route === '/' ? distDir : path.join(distDir, route)
        fs.mkdirSync(outDir, { recursive: true })
        fs.writeFileSync(path.join(outDir, 'index.html'), html)
        console.log(`Prerendered ${route}`)
      } catch (err) {
        console.warn(`Skipping prerender for ${route}: ${err.message}`)
      }
    }

    await browser.close()
  } finally {
    server.kill()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
