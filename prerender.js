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
import { preview } from 'vite'
import { chromium } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, 'dist')
const PORT = 4174

const ROUTES = [
  '/',
  '/proxy',
  '/coconut-deck-builder',
  '/limited-guide',
  '/rules',
  '/deck-comparison',
  '/winrate-matrix',
  '/lore-tracker',
]

async function main() {
  // Vite's JS preview API rather than spawning `npx vite preview`: killing the
  // npx wrapper left the vite server orphaned and holding the build's stdout.
  const server = await preview({ preview: { port: PORT, strictPort: true } })

  try {
    // No catch: on Vercel's build image Chromium needs the `nss` package,
    // installed by vercel.json's installCommand. If it can't launch, fail the
    // build rather than silently shipping the bare shell for every route.
    const browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
      args: ['--no-sandbox'],
    })
    const page = await browser.newPage()

    for (const route of ROUTES) {
      await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle', timeout: 10000 })
      const html = await page.content()

      const outDir = route === '/' ? distDir : path.join(distDir, route)
      fs.mkdirSync(outDir, { recursive: true })
      fs.writeFileSync(path.join(outDir, 'index.html'), html)
      console.log(`Prerendered ${route}`)
    }

    await browser.close()
  } finally {
    await server.close()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
