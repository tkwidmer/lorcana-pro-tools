---
name: ui-screenshots
description: Use this whenever a change touches a page's UI and needs a screenshot for the PR body, or a change has to be seen working in a real browser (a file upload, a clipboard copy, an OBS view). Runs the Vite dev server and Playwright with the mocks that let supporter-gated pages and the Stream Overlay surfaces render without a Supabase session, and names the three traps that cost a round trip each (the Vercel preview gate, pkill killing the shell, the build rewriting the extension zip).
---

# UI screenshots with Playwright

Chromium and Playwright are pre-installed in the cloud session. Screenshots are taken against the local dev server, never the Vercel preview (it sits behind a deployment-protection gate that blocks headless access).

## Steps

1. **Start the dev server in its own Bash call**, in the background, and confirm it answers:
   ```bash
   (PORT=5173 npm run dev > "$SCRATCH/dev.log" 2>&1 &); sleep 4; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
   ```
2. **Write the script in the scratchpad** (never in the repo) and run it with `node`:
   ```js
   import { chromium } from '/home/user/lorcana-pro-tools/node_modules/playwright/index.mjs'
   const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
   const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
   const page = await ctx.newPage()
   await page.goto('http://localhost:5173/<route>')
   await page.waitForSelector('text=<something the page renders>')
   await page.screenshot({ path: '/home/user/lorcana-pro-tools/docs/screenshots/<kebab-name>.png' })
   await browser.close()
   ```
   A 1920×1080 viewport for an OBS view; `fullPage: true` for a long page.
3. **Save to `docs/screenshots/<kebab-name>.png`**, commit it on the branch, and reference it in the PR body as `https://raw.githubusercontent.com/tkwidmer/lorcana-pro-tools/<branch>/docs/screenshots/<name>.png`. Before/after pairs when a layout changed.
4. **Stop the server in its own Bash call**: `pkill -f '[n]ode.*vite'` returns exit 144 and kills the shell it runs in, so nothing else goes in that call.
5. If `npm run build` ran, it rewrote `public/lorcana-extension.zip` with only timestamp changes: `git checkout -- public/lorcana-extension.zip` before committing.

## Mocks

Nothing in dev reaches Supabase or the `/api/*` functions (Vite serves the SPA and the `/api/cards` proxy only), so console errors such as "Failed to load duels.ink tokens" and a "field data failed to load" banner are expected and not a defect.

**A supporter-gated page** needs a session and an admin profile. Set both on the context before any `goto`:
```js
const session = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400,
  user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'owner@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }
await ctx.addInitScript(s => localStorage.setItem('sb-nnuqpxygtivrvvsnpzaz-auth-token', JSON.stringify(s)), session)
await ctx.route('**/rest/v1/profiles*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, supporter_tier: 'admin' }) }))
await ctx.route('**/auth/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) }))
```

**The Stream Overlay panel** also needs its tables. Return the mock row array on GET and the row on any write; writes are optimistic locally, so the UI updates either way:
```js
await ctx.route('**/rest/v1/stream_tables*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.request().method() === 'GET' ? [row] : row) }))
```
The row needs every column `rowToState()` reads; copy the fixture row from `src/lib/__tests__/streamOverlay.test.js` and add `owner_id`, `controller_key`, `created_at`.

**The OBS view, controller and caster notes** read the public RPC instead; one intercept covers all three:
```js
await page.route('**/rest/v1/rpc/get_stream_table*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row) }))
```

**A file upload**: `await page.setInputFiles('input[type=file]', '/absolute/path')`, then wait for what the upload produces (`page.waitForFunction(() => document.querySelector('textarea').value.includes('…'))`).

**A clipboard copy**: create the context with `permissions: ['clipboard-read', 'clipboard-write']`, click the button, then `await page.evaluate(() => navigator.clipboard.readText())` to assert what landed.

**Card data** loads for real through the `/api/cards` proxy; give it a few seconds before asserting anything that depends on matched cards.
