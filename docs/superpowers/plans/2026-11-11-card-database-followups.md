# Card Database Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TCGplayer prices (daily snapshot), a list view with `display:`/`usd`/`order:usd`, card-name links from deck lists, Analytics, Deck Insights and Deck Doctor to the card pages, and a per-card duels.ink meta section on the card page.

**Architecture:** Prices are a static `public/card-prices.json` written daily by a GitHub Action from TCGplayer's `pricepoints` endpoint (the shape Dreamborn ships as SQLite); the client loads it once. The query engine gains `display:` and `usd`. Links go through the existing `cardPath` plus a `cardLinkIndex(cards)` for name-only call sites. Meta stats reuse the `/api/stats/meta` feed Stock Decks already reads, through a new pure `cardMetaStats.js`.

**Tech Stack:** React 19, React Router 7, Tailwind 4, Vitest, GitHub Actions (Node 20), LorcanaJSON, duels.ink `/api/stats/meta`, TCGplayer `mpapi.tcgplayer.com` (unofficial).

**Spec:** `docs/superpowers/specs/2026-11-11-card-database-followups-design.md`. Prerequisite: the first plan's Task 9 (`docs/superpowers/plans/2026-11-11-card-database.md`) is done first, so `cardQuery.js` already has `fo:`, `date:` and the order aliases; this plan edits that file on top.

## Global Constraints

- No `dark:` variants; palette utilities and `ui/` building blocks only; `forge` for the one primary action or current selection; status colors semantic.
- No new runtime `api/*.ts` function for prices: the snapshot is static. Anything that reads the snapshot fails loudly when it is absent (`QuerySyntaxError` in the query engine, the hook's `error` on the page); nothing guesses a price.
- One URL builder for a card: `cardPath(card)`; name-only call sites go through `cardLinkIndex(cards)`.
- Never nest an interactive element in another: `CardBar` links only where it is not already a button; the OBS overlay stays inert.
- Every read of duels.ink's undocumented meta fields (`profiles`, `centroidCounts`, `cardLift`, `pairCardLift`) is null-safe and empties its section, as `deckDoctor.js` does.
- Commit messages end with the session's attribution lines; no model identifiers in any pushed artifact. Work stays on `claude/upbeat-curie-wncgen`; PR tkwidmer/lorcana-pro-tools#366 is already open, do not open another.
- Lorcana has no sideboard; say "tech slots" if deck advice ever appears (it does not here).

## Review Focus

1. A printing with no `tcgPlayerId` (five new cards) or an id missing from the snapshot must show "—" and never match `usd` terms, not render `$undefined` or throw. Pinned in Task 1 (`printingPrice`/`usdOf`/`priceLabel` tests) and Task 3 (`usd` on a priceless card).
2. The snapshot script must not commit a half-fetched file: more than 2% failed ids or any thrown fetch fails the run. Pinned in Task 1 (`assertCoverage` test).
3. `withDirective` must not touch a quoted value that merely contains the key (`o:"display:grid"`) and must replace, not duplicate, an existing directive. Pinned in Task 3 (`withDirective` tests).
4. A card named only in an archetype's lift list (not its average build) must still appear with `copies` 0, and a card present in both must appear once. Pinned in Task 6 (`cardMetaRows` tests).
5. The Decklist Inspector's `CardBar` (a toggle button) must not become a link; `DeckListCard`'s must. Pinned in Task 8 (a render check in the browser step, and `CardBar` ignores `link` when `onToggle` is set).

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/cardPrices.js` (+ test) | `pricePoints`, `assertCoverage`, `printingPrice`, `usdOf`, `priceLabel` |
| `scripts/card-prices.mjs`, `.github/workflows/card-prices.yml`, `public/card-prices.json` | The daily snapshot |
| `src/hooks/useCardPrices.js` | Load the snapshot once |
| `src/lib/cardQuery.js` (+ test) | `display:`, `usd`, `order:usd`, `withDirective`; `runQuery` returns `{ cards, display }` and takes `prices` |
| `src/pages/CardSearchPage.jsx` | List view, view toggle, sortable headers, prices |
| `src/pages/CardPage.jsx` | Prices in Buy and Printings; "In the duels.ink meta" section |
| `src/lib/cardMetaStats.js` (+ test) | `cardMetaRows`, `cardPairLift` |
| `src/components/CardMetaSection.jsx` | The meta section (fetch per folder, tabs, table) |
| `src/lib/cardPrintings.js` (+ test), `src/components/CardLink.jsx`, `src/components/DecklistCardBar.jsx`, `src/components/DeckListCard.jsx`, `src/components/analytics/StatTables.jsx`, `src/pages/AnalyticsPage.jsx`, `src/pages/DrawOddsPage.jsx`, `src/pages/DeckDoctorPage.jsx`, `src/components/deckDoctor/{BuildDiff,LiftChecklist,YourCards}.jsx` | Card-name links |
| `docs/agents/cards.md`, `docs/agents/duels-data.md`, `CLAUDE.md`, `docs/screenshots/cards-list.png`, `docs/screenshots/cards-card-meta.png` | Docs and PR screenshots |

---

### Task 1: `cardPrices.js`, the snapshot script and workflow

**Files:**
- Create: `src/lib/cardPrices.js`
- Test: `src/lib/__tests__/cardPrices.test.js`
- Create: `scripts/card-prices.mjs`
- Create: `.github/workflows/card-prices.yml`
- Create: `public/card-prices.json` (first run of the script, committed)

**Interfaces:**
- Produces: `pricePoints(points)` → `{ normal: number|null, foil: number|null }` from the TCGplayer array; `assertCoverage(total, failed)` throws when `failed / total > 0.02`; `printingPrice(prices, card)` → the entry for `card.externalLinks.tcgPlayerId` or `null`; `usdOf(entry)` → `entry.normal ?? entry.foil ?? null` (null entry → null); `priceLabel(entry)` → string. Snapshot shape: `{ updatedAt: ISO string, source: 'TCGplayer market price', prices: { [tcgPlayerId: string]: { normal, foil } } }`.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import { pricePoints, assertCoverage, printingPrice, usdOf, priceLabel } from '../cardPrices'

const points = [
  { printingType: 'Normal', marketPrice: 4.71, buylistMarketPrice: null, listedMedianPrice: 5.21 },
  { printingType: 'Foil', marketPrice: 69.94, buylistMarketPrice: null, listedMedianPrice: null },
]

describe('pricePoints', () => {
  it('reads the normal and foil market prices', () => {
    expect(pricePoints(points)).toEqual({ normal: 4.71, foil: 69.94 })
    expect(pricePoints([{ printingType: 'Foil', marketPrice: 947.01 }])).toEqual({ normal: null, foil: 947.01 })
    expect(pricePoints([])).toEqual({ normal: null, foil: null })
  })
})

describe('assertCoverage', () => {
  it('allows up to 2% failures and throws above', () => {
    expect(() => assertCoverage(1000, 20)).not.toThrow()
    expect(() => assertCoverage(1000, 21)).toThrow('21 of 1000')
  })
})

describe('printingPrice / usdOf / priceLabel', () => {
  const prices = { 507512: { normal: 4.71, foil: 69.94 }, 510153: { normal: null, foil: 947.01 } }
  it('finds a printing by its TCGplayer id and tolerates missing ones', () => {
    expect(printingPrice(prices, { externalLinks: { tcgPlayerId: 507512 } })).toEqual({ normal: 4.71, foil: 69.94 })
    expect(printingPrice(prices, { externalLinks: { tcgPlayerId: 1 } })).toBeNull()
    expect(printingPrice(prices, {})).toBeNull()
    expect(printingPrice(null, { externalLinks: { tcgPlayerId: 507512 } })).toBeNull()
  })
  it('usdOf is the non-foil price, or the foil price when only foil exists', () => {
    expect(usdOf(prices[507512])).toBe(4.71)
    expect(usdOf(prices[510153])).toBe(947.01)
    expect(usdOf({ normal: null, foil: null })).toBeNull()
    expect(usdOf(null)).toBeNull()
  })
  it('labels', () => {
    expect(priceLabel(prices[507512])).toBe('$4.71 · foil $69.94')
    expect(priceLabel(prices[510153])).toBe('foil $947.01')
    expect(priceLabel({ normal: 0.14, foil: null })).toBe('$0.14')
    expect(priceLabel(null)).toBe('—')
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/lib/__tests__/cardPrices.test.js`
Expected: FAIL, cannot resolve `../cardPrices`.

- [ ] **Step 3: Implement the lib**

`src/lib/cardPrices.js` (no bare-specifier imports: `scripts/card-prices.mjs` loads it under plain Node):

```js
// TCGplayer market prices, read from the daily snapshot public/card-prices.json
// that scripts/card-prices.mjs writes from mpapi.tcgplayer.com's unofficial
// /v2/product/{id}/pricepoints. Keyed by LorcanaJSON's externalLinks.tcgPlayerId.

export const MAX_FAILED_SHARE = 0.02

export function pricePoints(points) {
  const by = type => points.find(p => p.printingType === type)?.marketPrice ?? null
  return { normal: by('Normal'), foil: by('Foil') }
}

export function assertCoverage(total, failed) {
  if (failed / total > MAX_FAILED_SHARE) throw new Error(`${failed} of ${total} TCGplayer ids failed; not writing a partial snapshot`)
}

export function printingPrice(prices, card) {
  const id = card.externalLinks?.tcgPlayerId
  return (id != null && prices?.[id]) || null
}

export const usdOf = entry => entry?.normal ?? entry?.foil ?? null

const usd = n => `$${n.toFixed(2)}`

export function priceLabel(entry) {
  if (!entry) return '—'
  const parts = []
  if (entry.normal != null) parts.push(usd(entry.normal))
  if (entry.foil != null) parts.push(`foil ${usd(entry.foil)}`)
  return parts.length ? parts.join(' · ') : '—'
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/lib/__tests__/cardPrices.test.js`
Expected: PASS.

- [ ] **Step 5: The script**

`scripts/card-prices.mjs`:

```js
// Writes public/card-prices.json: TCGplayer market prices for every printing
// LorcanaJSON knows a tcgPlayerId for. Run daily by
// .github/workflows/card-prices.yml, or locally: `node scripts/card-prices.mjs`.
// The endpoint is unofficial (mpapi.tcgplayer.com, no auth, no CORS); 80 ids at
// concurrency 8 took about a second when this was written (2026-11-11).
// Fails without writing when more than 2% of ids fail, so a bad day never
// replaces yesterday's snapshot.
import fs from 'fs'
import { fileURLToPath } from 'url'
import { pricePoints, assertCoverage } from '../src/lib/cardPrices.js'

const CARDS_URL = 'https://lorcanajson.org/files/current/en/allCards.json'
const PRICE_URL = id => `https://mpapi.tcgplayer.com/v2/product/${id}/pricepoints`
const CONCURRENCY = 8
const out = fileURLToPath(new URL('../public/card-prices.json', import.meta.url))

const cardsRes = await fetch(CARDS_URL)
if (!cardsRes.ok) throw new Error(`LorcanaJSON returned ${cardsRes.status}`)
const { cards } = await cardsRes.json()
const ids = [...new Set(cards.map(c => c.externalLinks?.tcgPlayerId).filter(id => id != null))]

const prices = {}
const failed = []
let next = 0
async function worker() {
  while (next < ids.length) {
    const id = ids[next++]
    const res = await fetch(PRICE_URL(id))
    if (!res.ok) { failed.push([id, res.status]); continue }
    prices[id] = pricePoints(await res.json())
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

assertCoverage(ids.length, failed.length)
if (failed.length) console.warn(`${failed.length} ids without a price:`, failed.slice(0, 10))

fs.writeFileSync(out, JSON.stringify({ updatedAt: new Date().toISOString(), source: 'TCGplayer market price', prices }))
console.log(`Wrote ${Object.keys(prices).length} prices to ${out}`)
```

Run it once: `node scripts/card-prices.mjs`. Expected: "Wrote 355x prices"; `public/card-prices.json` about 120 KB; `node -e "const p=require('./public/card-prices.json');console.log(p.prices['507512'])"` prints `{ normal: <number>, foil: <number> }`.

- [ ] **Step 6: The workflow**

`.github/workflows/card-prices.yml`:

```yaml
name: Card Prices

# Daily TCGplayer market-price snapshot for the card database
# (public/card-prices.json), committed to main when it changed.
on:
  schedule:
    - cron: '37 9 * * *'
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  snapshot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: node scripts/card-prices.mjs
      - name: Commit the snapshot
        run: |
          git add public/card-prices.json
          if git diff --cached --quiet; then exit 0; fi
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git commit -m "Card prices for $(date -u +%F)"
          git push origin HEAD:main
```

(No `npm ci`: the script imports only `src/lib/cardPrices.js`, which has no dependencies.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/cardPrices.js src/lib/__tests__/cardPrices.test.js scripts/card-prices.mjs .github/workflows/card-prices.yml public/card-prices.json
git commit -m "Card prices: daily TCGplayer market-price snapshot"
```

---

### Task 2: `useCardPrices`

**Files:**
- Create: `src/hooks/useCardPrices.js`

**Interfaces:**
- Produces: `useCardPrices()` → `{ prices: Record<id, {normal, foil}> | null, updatedAt: string|null, error: string|null }`. `prices` is `null` until loaded. One fetch per page load, shared by every caller.

- [ ] **Step 1: Write the hook**

```js
import { useEffect, useState } from 'react'

const PRICES_URL = '/card-prices.json'

// One fetch per page load, shared by every component that asks.
let snapshot = null
function loadSnapshot() {
  snapshot ??= fetch(PRICES_URL).then(async res => {
    if (!res.ok) throw new Error(`Failed to load card prices (HTTP ${res.status})`)
    return res.json()
  })
  snapshot.catch(() => { snapshot = null })
  return snapshot
}

export function useCardPrices() {
  const [state, setState] = useState({ prices: null, updatedAt: null, error: null })
  useEffect(() => {
    let mounted = true
    loadSnapshot().then(
      data => mounted && setState({ prices: data.prices, updatedAt: data.updatedAt, error: null }),
      err => mounted && setState({ prices: null, updatedAt: null, error: err.message }),
    )
    return () => { mounted = false }
  }, [])
  return state
}
```

- [ ] **Step 2: Lint and commit**

Run: `npm run lint`
Expected: clean.

```bash
git add src/hooks/useCardPrices.js
git commit -m "useCardPrices: load the price snapshot once"
```

---

### Task 3: `display:`, `usd`, `order:usd`, `withDirective`

**Files:**
- Modify: `src/lib/cardQuery.js`
- Test: `src/lib/__tests__/cardQuery.test.js`

**Interfaces:**
- Consumes: `printingPrice`, `usdOf` from `cardPrices.js`.
- Produces: `parseQuery(q, sets, prices = null)` → adds `display: 'grid' | 'list'`; `runQuery(cards, sets, q, prices = null)` → `{ cards: Card[], display }` (**breaking**: callers and the existing `runQuery` tests switch to `.cards`); `withDirective(q, key, value)` → string; `ORDERS` gains `'usd'`.

- [ ] **Step 1: Update the existing `runQuery` tests and append new ones**

In the existing `describe('runQuery')` block, every `runQuery(...)` whose result is indexed or mapped becomes `runQuery(...).cards`, and the empty-query case becomes `expect(runQuery(all, sets, '  ')).toEqual({ cards: [], display: 'grid' })`. Then append:

```js
import { withDirective } from '../cardQuery'

describe('display and withDirective', () => {
  it('display: directive, grid by default, checklist as an alias of list', () => {
    expect(parseQuery('elsa', sets).display).toBe('grid')
    expect(parseQuery('elsa display:list', sets).display).toBe('list')
    expect(parseQuery('elsa display:checklist', sets).display).toBe('list')
    expect(() => parseQuery('display:text', sets)).toThrow(QuerySyntaxError)
    expect(runQuery(cards, sets, 't:song display:list').display).toBe('list')
  })

  it('withDirective replaces, appends or removes a directive and leaves quoted text alone', () => {
    expect(withDirective('t:song', 'display', 'list')).toBe('t:song display:list')
    expect(withDirective('t:song display:list', 'display', 'grid')).toBe('t:song display:grid')
    expect(withDirective('display:list t:song', 'display', null)).toBe('t:song')
    expect(withDirective('o:"display:list" t:song', 'display', 'list')).toBe('o:"display:list" t:song display:list')
    expect(withDirective('t:song order:cost dir:desc', 'order', 'name')).toBe('t:song dir:desc order:name')
  })
})

describe('usd', () => {
  const prices = { 507512: { normal: 4.71, foil: 69.94 }, 510153: { normal: null, foil: 947.01 } }
  const priced = [
    { ...elsa, externalLinks: { tcgPlayerId: 507512 } },
    { ...teKa, externalLinks: { tcgPlayerId: 510153 } },
    song, // no id: never priced
  ]
  const run = q => runQuery(priced, sets, q, prices).cards.map(c => c.fullName)

  it('compares the non-foil price, or the foil price when only foil exists; unpriced cards never match', () => {
    expect(run('usd>=4')).toEqual(['Elsa - Spirit of Winter', 'Te Kā - The Burning One'])
    expect(run('usd<5')).toEqual(['Elsa - Spirit of Winter'])
    expect(run('usd>=0')).not.toContain('Be Our Guest')
  })

  it('order:usd sorts priced cards, unpriced last', () => {
    expect(run('order:usd dir:desc')).toEqual(['Te Kā - The Burning One', 'Elsa - Spirit of Winter', 'Be Our Guest'])
    expect(run('order:usd')).toEqual(['Elsa - Spirit of Winter', 'Te Kā - The Burning One', 'Be Our Guest'])
  })

  it('throws without a snapshot', () => {
    expect(() => parseQuery('usd>1', sets)).toThrow('Prices are not loaded')
    expect(() => runQuery(priced, sets, 'order:usd')).toThrow('Prices are not loaded')
    expect(() => parseQuery('usd:cheap', sets, prices)).toThrow(QuerySyntaxError)
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/lib/__tests__/cardQuery.test.js`
Expected: FAIL (`withDirective` not exported, `display` undefined, `.cards` undefined).

- [ ] **Step 3: Implement**

In `src/lib/cardQuery.js`:

```js
import { printingPrice, usdOf } from './cardPrices'
```

Add `'usd'` to `ORDERS`. In `compileTerm(term, sets, opts, prices)` (add the fourth parameter and thread it through `parse(tokens, sets, opts, prices)`), new cases:

```js
    case 'usd': {
      if (!prices) throw new QuerySyntaxError('Prices are not loaded')
      const n = Number(value)
      if (value === '' || Number.isNaN(n)) throw new QuerySyntaxError(`"${value}" isn't a price`)
      const cmp = cmpOp(op)
      return c => {
        const p = usdOf(printingPrice(prices, c))
        return p != null && cmp(p, n)
      }
    }
    case 'display': {
      const v = norm(value)
      const display = v === 'checklist' ? 'list' : v
      if (display !== 'grid' && display !== 'list') throw new QuerySyntaxError('display must be grid or list')
      opts.display = display
      return () => true
    }
```

`parseQuery`:
```js
export function parseQuery(q, sets, prices = null) {
  const opts = { order: 'name', direction: 'asc', unique: 'cards', display: 'grid' }
  const tokens = tokenize(q)
  const predicate = tokens.length ? parse(tokens, sets, opts, prices) : () => true
  if (opts.order === 'usd' && !prices) throw new QuerySyntaxError('Prices are not loaded')
  return { predicate, ...opts }
}
```

`ORDER_KEY` entries take `(sets, prices)`; add:
```js
  usd: (sets, prices) => c => usdOf(printingPrice(prices, c)) ?? (direction => direction)(Infinity),
```
Simpler and correct: unpriced cards last in both directions needs a two-part key. Replace the single-key sort with: compute `key = ORDER_KEY[order](sets, prices)`, and in the comparator treat `null`/`undefined`/`Infinity` keys as "after everything" regardless of `sign`:
```js
const ORDER_KEY = {
  // …existing entries, each now (sets, prices) => c => value…
  usd: (sets, prices) => c => usdOf(printingPrice(prices, c)),
}

export function runQuery(cards, sets, q, prices = null) {
  if (!q.trim()) return { cards: [], display: 'grid' }
  const { predicate, order, direction, unique, display } = parseQuery(q, sets, prices)
  let hits = cards.filter(predicate)
  if (unique === 'cards') { /* unchanged */ }
  const key = ORDER_KEY[order](sets, prices)
  const sign = direction === 'desc' ? -1 : 1
  const missingLast = (a, b) => (a == null) - (b == null)
  hits.sort((a, b) => {
    const ka = key(a), kb = key(b)
    return missingLast(ka, kb) || sign * compare(ka, kb) ||
      compare(norm(a.fullName), norm(b.fullName)) || setOrder(a) - setOrder(b) ||
      (a.promoGrouping ? 1 : 0) - (b.promoGrouping ? 1 : 0) || a.number - b.number
  })
  return { cards: hits, display }
}
```
(The existing keys return `-1`/`''` for missing values and keep doing so; only `usd` returns `null`, so `missingLast` only affects it.)

`withDirective` (exported, at the end of the file):
```js
// Rewrites one directive inside a query string, leaving every other token,
// including quoted values, untouched. value null removes it.
export function withDirective(q, key, value) {
  const kept = []
  for (const t of tokenize(q)) if (!(t.type === 'term' && t.key === key)) kept.push(t)
  const text = kept.map(t => t.text).join(' ')
  return value == null ? text : `${text} ${key}:${value}`.trim()
}
```
This needs each token to remember its source text: in `tokenize`, record `text: m[0].trim()` on every pushed token (one field added to each `tokens.push`), and `(`/`)`/`-`/`exact` tokens join back the same way. Because `-` and `(` are separate tokens, joining with spaces turns `-(a or b)` into `- ( a or b )`; that still parses identically (the tokenizer skips whitespace), and the test strings above avoid it. Add one assertion to the `withDirective` test: `expect(parseQuery(withDirective('-(t:song or k:rush) c:ruby', 'display', 'list'), sets).display).toBe('list')`.

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/lib/__tests__/cardQuery.test.js && npm test`
Expected: PASS everywhere. `CardSearchPage` still compiles but reads the old array shape; Task 4 fixes it next, so do not push between these two tasks.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cardQuery.js src/lib/__tests__/cardQuery.test.js
git commit -m "cardQuery: display:, usd, order:usd, withDirective"
```

---

### Task 4: List view on `/cards`

**Files:**
- Modify: `src/pages/CardSearchPage.jsx`
- Modify: `src/components/CardSearchSyntax.jsx` (rows for `usd:` and `display:`)

**Interfaces:**
- Consumes: `runQuery(cards, sets, q, prices)` → `{ cards, display }`; `withDirective`; `useCardPrices()`; `printingPrice`, `usdOf`, `priceLabel`; `legality` (Core/Infinity cells); `InkIcons`, `CostBadge`.

- [ ] **Step 1: Rewrite the page**

```jsx
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCards } from '../hooks/useCards'
import { useCardPrices } from '../hooks/useCardPrices'
import { runQuery, withDirective, QuerySyntaxError } from '../lib/cardQuery'
import { cardPath } from '../lib/cardPrintings'
import { legality } from '../lib/cardLegality'
import { printingPrice, usdOf, priceLabel } from '../lib/cardPrices'
import { resolveColors } from '../lib/inkColors'
import { PageHeader } from '../components/ui/PageHeader'
import { Input } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { InkIcons } from '../components/InkIcons'
import { CostBadge } from '../components/DecklistCardBar'
import { CardSearchSyntax } from '../components/CardSearchSyntax'

const PAGE = 120
const COLUMNS = [
  ['name', 'Name'], ['color', 'Inks'], ['cost', 'Cost'], [null, 'Type'], ['strength', 'S/W/L'],
  ['rarity', 'Rarity'], ['set', 'Set'], [null, 'Core'], [null, 'Infinity'], ['usd', 'TCGplayer'],
]
const LEGAL = { legal: 'text-green-700', banned: 'text-red-700', rotated: 'text-gray-400', not_legal: 'text-gray-400' }

const usd = n => (n == null ? '—' : `$${n.toFixed(2)}`)

function ListView({ results, prices, q, setQ }) {
  // Clicking a sortable header rewrites order:, flipping dir: on a repeat click.
  const sortBy = key => {
    const current = /\border:(\S+)/.exec(q)?.[1]
    const desc = /\bdir(?:ection)?:desc\b/.test(q)
    const flip = current === key && !desc
    setQ(withDirective(withDirective(q, 'order', key), 'dir', flip ? 'desc' : null))
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
            {COLUMNS.map(([key, label]) => (
              <th key={label} className="py-2 pr-3 font-semibold whitespace-nowrap">
                {key ? <button type="button" onClick={() => sortBy(key)} className="hover:text-gray-900">{label}</button> : label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map(card => {
            const l = legality(card)
            const price = printingPrice(prices, card)
            return (
              <tr key={cardPath(card)} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-1.5 pr-3"><Link to={cardPath(card)} className="text-gray-900 hover:underline">{card.fullName}</Link></td>
                <td className="py-1.5 pr-3"><InkIcons colors={resolveColors([card.color])} size={16} /></td>
                <td className="py-1.5 pr-3"><CostBadge cost={card.cost} inkable={card.inkwell} /></td>
                <td className="py-1.5 pr-3 text-gray-600 whitespace-nowrap">{card.type}{card.subtypesText ? ` • ${card.subtypesText}` : ''}</td>
                <td className="py-1.5 pr-3 tabular-nums text-gray-700">{card.type === 'Character' ? `${card.strength}/${card.willpower}/${card.lore}` : card.type === 'Location' ? `–/${card.willpower}/${card.lore}` : ''}</td>
                <td className="py-1.5 pr-3 text-gray-600">{card.rarity}</td>
                <td className="py-1.5 pr-3 text-gray-600 whitespace-nowrap">{card.setCode} #{card.number}{card.variant ?? ''}</td>
                <td className={`py-1.5 pr-3 ${LEGAL[l.Core.status]}`}>{l.Core.status === 'legal' ? 'Legal' : l.Core.status === 'banned' ? 'Banned' : '—'}</td>
                <td className={`py-1.5 pr-3 ${LEGAL[l.Infinity.status]}`}>{l.Infinity.status === 'legal' ? 'Legal' : l.Infinity.status === 'banned' ? 'Banned' : '—'}</td>
                <td className="py-1.5 tabular-nums text-gray-700" title={priceLabel(price)}>{usd(usdOf(price))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function GridView({ results, prices }) {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
      {results.map(card => (
        <li key={cardPath(card)}>
          <Link to={cardPath(card)} className="block group">
            <img src={card.images.thumbnail} alt={card.fullName} loading="lazy" className="w-full rounded-lg border border-gray-200 group-hover:border-gray-900 transition-colors" />
            <span className="block mt-1 text-xs text-gray-700 truncate">{card.fullName}</span>
            <span className="block text-xs text-gray-500 tabular-nums">{usd(usdOf(printingPrice(prices, card)))}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function CardSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const [draft, setDraft] = useState(q)
  const [shown, setShown] = useState(PAGE)
  const [helpOpen, setHelpOpen] = useState(false)
  const [draftFor, setDraftFor] = useState(q)
  if (draftFor !== q) {
    setDraftFor(q)
    setDraft(q)
    setShown(PAGE)
  }
  const { cards, sets, loading: cardsLoading, error: cardsError } = useCards()
  const { prices, error: pricesError } = useCardPrices()
  const loading = cardsLoading || (!prices && !pricesError)
  const error = cardsError ?? pricesError
  const setQ = next => setSearchParams(next.trim() ? { q: next.trim() } : {})

  const outcome = useMemo(() => {
    if (!q.trim() || loading) return null
    try {
      return runQuery(cards, sets, q, prices)
    } catch (e) {
      if (e instanceof QuerySyntaxError) return { syntaxError: e.message }
      throw e
    }
  }, [cards, sets, q, prices, loading])

  function submit(e) {
    e.preventDefault()
    setShown(PAGE)
    setQ(draft)
  }

  const results = outcome?.cards
  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Card Search"
        description="Every Lorcana card, searchable the way Scryfall searches Magic."
        actions={<Button size="sm" variant="quiet" onClick={() => setHelpOpen(o => !o)}>{helpOpen ? 'Hide syntax' : 'Syntax'}</Button>}
      />
      <form onSubmit={submit} className="flex gap-2 max-w-3xl mb-6">
        <Input value={draft} onChange={e => setDraft(e.target.value)} placeholder='k:shift c:amethyst f:core — or just a name' className="flex-1 font-mono" autoFocus spellCheck={false} />
        <Button type="submit" variant="primary" disabled={loading}>Search</Button>
      </form>

      {error && <p className="text-sm text-red-700 mb-4">{error}</p>}
      {loading && !error && <p className="text-sm text-gray-500">Loading card data…</p>}

      {(helpOpen || (!q.trim() && !loading)) && (
        <Card title="Search syntax" className="p-4 mb-8"><CardSearchSyntax /></Card>
      )}

      {outcome?.syntaxError && <p className="text-sm text-red-700">{outcome.syntaxError}</p>}

      {results && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <p className="text-sm text-gray-500">{results.length.toLocaleString()} card{results.length === 1 ? '' : 's'}</p>
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant={outcome.display === 'grid' ? 'primary' : 'quiet'} onClick={() => setQ(withDirective(q, 'display', null))}>Grid</Button>
              <Button size="sm" variant={outcome.display === 'list' ? 'primary' : 'quiet'} onClick={() => setQ(withDirective(q, 'display', 'list'))}>List</Button>
            </div>
          </div>
          {outcome.display === 'list'
            ? <ListView results={results.slice(0, shown)} prices={prices} q={q} setQ={setQ} />
            : <GridView results={results.slice(0, shown)} prices={prices} />}
          {results.length > shown && (
            <div className="mt-6 text-center">
              <Button onClick={() => setShown(s => s + PAGE)}>Show {Math.min(PAGE, results.length - shown)} more</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

If `pricesError` is set the page still searches (prices are not needed for most queries) but shows the error line; a `usd` term then reports "Prices are not loaded" from the engine. That is the one place prices are allowed to be absent, and it is visible.

- [ ] **Step 2: Syntax rows**

In `CardSearchSyntax.jsx` add `['usd:', 'TCGplayer market price (non-foil, or foil when only foil exists)', 'usd<1 · usd>=20 order:usd']` after the `year:`/`date:` rows and append ` · display:list` to the directives row's example, with "grid list" in its description.

- [ ] **Step 3: Verify in the browser**

Per `docs/agents/ui-screenshots.md`: `/cards?q=k%3Ashift%20f%3Acore%20display%3Alist%20order%3Ausd%20dir%3Adesc` → wait for `text=TCGplayer`, screenshot `docs/screenshots/cards-list.png` (1400×1000). Assert a `$` price appears in the first row. Click "Grid" and assert the URL's `q` lost `display:list`. Open `/cards?q=usd%3E%3D50` and assert at least one card and that every shown price is ≥ 50 in the list view.

- [ ] **Step 4: Lint, test, commit**

Run: `npm run lint && npm test`
Expected: green.

```bash
git add src/pages/CardSearchPage.jsx src/components/CardSearchSyntax.jsx docs/screenshots/cards-list.png
git commit -m "Card Search: list view, display:, prices"
```

---

### Task 5: Prices on the card page

**Files:**
- Modify: `src/pages/CardPage.jsx`

**Interfaces:**
- Consumes: `useCardPrices()`, `printingPrice`, `priceLabel`.

- [ ] **Step 1: Edit**

Import `useCardPrices` and `{ printingPrice, priceLabel }`. In `CardPage`, after `useCards()`: `const { prices, updatedAt, error: pricesError } = useCardPrices()`.

Printings rows: after the rarity span add
```jsx
<span className="w-40 tabular-nums text-gray-700">{priceLabel(printingPrice(prices, p))}</span>
```
before the promo/foil span.

Buy section becomes:
```jsx
<Section title="Buy">
  <p className="text-lg text-gray-900 tabular-nums mb-1">{priceLabel(printingPrice(prices, card))}</p>
  <p className="text-xs text-gray-500 mb-3">
    {pricesError ? pricesError : updatedAt ? `TCGplayer market price, ${updatedAt.slice(0, 10)}` : 'Loading prices…'}
  </p>
  <div className="flex flex-wrap gap-2">
    {/* the three Buttons, unchanged */}
  </div>
</Section>
```
The section now renders whenever `card.externalLinks` exists (as before).

- [ ] **Step 2: Verify, lint, commit**

Browser: `/cards/1/42` shows a dollar figure in Buy and one per printing row (the enchanted row shows `foil $…` only). `/cards/14/6` (Honey Lemon, no TCGplayer id yet) shows `—` and no crash.

```bash
git add src/pages/CardPage.jsx
git commit -m "Card page: TCGplayer prices per printing"
```

---

### Task 6: `cardMetaStats.js`

**Files:**
- Create: `src/lib/cardMetaStats.js`
- Test: `src/lib/__tests__/cardMetaStats.test.js`

**Interfaces:**
- Consumes: `aggregateArchetypes`, `representativeProfile`, `metaShare` from `metaSynthesis.js`.
- Produces: `cardMetaRows(stats, ids)` → `[{ key, name, colors, gamesPlayed, winRate, metaShare, copies, presence, winRateWith, lift }]` sorted by `gamesPlayed` desc; `cardPairLift(stats, ids)` → `[{ pair, presence, winRateWith, lift }]` sorted by lift desc. `ids` is the list of every duels.ink id the card's printings carry (`cardKey` of each printing).

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import { cardMetaRows, cardPairLift } from '../cardMetaStats'

const stats = {
  activity: { totalGames: 1000 },
  profiles: [
    { id: 'a1', colors: ['amber', 'amethyst'], archetypeName: 'Midrange', gamesPlayed: 600, wins: 330,
      centroidCounts: { '9-40': 4, '1-5': 2 }, cardLift: [{ cardId: '9-40', lift: 3.2, winRateWith: 56.1, presence: 0.9 }] },
    { id: 'a2', colors: ['amber', 'amethyst'], archetypeName: 'Midrange', gamesPlayed: 100, wins: 50,
      centroidCounts: { '1-5': 4 }, cardLift: [] },
    { id: 'b', colors: ['amber', 'emerald'], archetypeName: 'Princess Aggro', gamesPlayed: 300, wins: 180,
      centroidCounts: {}, cardLift: [{ cardId: '1-42', lift: -1.5, winRateWith: 48, presence: 0.2 }] },
    { id: 'c', colors: ['amethyst', 'ruby'], archetypeName: 'Peter Pan', gamesPlayed: 150, wins: 60, centroidCounts: { '1-5': 1 } },
    { id: 'd', colors: ['steel', 'ruby'], archetypeName: null, gamesPlayed: 1000, wins: 500, centroidCounts: { '1-42': 4 } },
  ],
  pairCardLift: {
    'amber/amethyst': [{ cardId: '9-40', lift: 2.0, winRateWith: 55, presence: 0.8 }],
    'amber/emerald': [{ cardId: '1-42', lift: -0.5, winRateWith: 49, presence: 0.1 }],
  },
}
// Elsa's ids across printings: set 1 and the set 9 reprint.
const elsaIds = ['1-42', '9-40']

describe('cardMetaRows', () => {
  it('one row per named archetype whose average build or lift list names any of the card ids', () => {
    const rows = cardMetaRows(stats, elsaIds)
    expect(rows.map(r => [r.name, r.copies, r.lift])).toEqual([
      ['Amber/Amethyst Midrange', 4, 3.2],
      ['Amber/Emerald Princess Aggro', 0, -1.5],
    ])
    expect(rows[0]).toMatchObject({ gamesPlayed: 700, winRate: 54.29, metaShare: 35, presence: 0.9, winRateWith: 56.1, colors: ['amber', 'amethyst'] })
    expect(rows[1]).toMatchObject({ presence: 0.2, winRateWith: 48 })
  })

  it('uses the most-played variant\'s build, and leaves lift null when only the centroid names the card', () => {
    const rows = cardMetaRows(stats, ['1-5'])
    expect(rows.map(r => [r.name, r.copies, r.lift])).toEqual([
      ['Amber/Amethyst Midrange', 2, null],
      ['Amethyst/Ruby Peter Pan', 1, null],
    ])
  })

  it('ignores uncurated profiles and tolerates missing fields', () => {
    expect(cardMetaRows({ profiles: [{ id: 'x', colors: ['steel'], archetypeName: null, gamesPlayed: 5, wins: 2, centroidCounts: { '1-42': 4 } }] }, ['1-42'])).toEqual([])
    expect(cardMetaRows({}, ['1-42'])).toEqual([])
    expect(cardMetaRows(null, ['1-42'])).toEqual([])
  })
})

describe('cardPairLift', () => {
  it('collects every colour pair lift entry for the card, best lift first', () => {
    expect(cardPairLift(stats, elsaIds)).toEqual([
      { pair: 'amber/amethyst', presence: 0.8, winRateWith: 55, lift: 2.0 },
      { pair: 'amber/emerald', presence: 0.1, winRateWith: 49, lift: -0.5 },
    ])
    expect(cardPairLift({}, elsaIds)).toEqual([])
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/lib/__tests__/cardMetaStats.test.js`
Expected: FAIL, cannot resolve.

- [ ] **Step 3: Implement**

```js
// One card's standing in duels.ink's /api/stats/meta feed (the same response
// Stock Decks and Deck Doctor read): which named archetypes run it, how many
// copies their average build carries, and its per-archetype and per-colour-pair
// lift. A card is looked up by every duels.ink id its printings carry, because
// the feed names one printing per card. Every undocumented field is null-safe.
import { aggregateArchetypes, representativeProfile, metaShare } from './metaSynthesis'

const pct = (wins, games) => (games > 0 ? Math.round((wins / games) * 10000) / 100 : null)

export function cardMetaRows(stats, ids) {
  const wanted = new Set(ids)
  const totalGames = stats?.activity?.totalGames ?? 0
  const rows = []
  for (const archetype of aggregateArchetypes(stats?.profiles)) {
    const build = representativeProfile(stats, archetype.key)
    const copies = Object.entries(build?.centroidCounts ?? {}).filter(([id]) => wanted.has(id)).reduce((sum, [, n]) => sum + n, 0)
    const lift = (build?.cardLift ?? []).find(e => wanted.has(e.cardId)) ?? null
    if (copies === 0 && !lift) continue
    rows.push({
      key: archetype.key,
      name: archetype.name,
      colors: archetype.colors,
      gamesPlayed: archetype.gamesPlayed,
      winRate: pct(archetype.wins, archetype.gamesPlayed),
      metaShare: metaShare(archetype.gamesPlayed, totalGames),
      copies,
      presence: lift?.presence ?? null,
      winRateWith: lift?.winRateWith ?? null,
      lift: lift?.lift ?? null,
    })
  }
  return rows.sort((a, b) => b.gamesPlayed - a.gamesPlayed)
}

export function cardPairLift(stats, ids) {
  const wanted = new Set(ids)
  const rows = []
  for (const [pair, list] of Object.entries(stats?.pairCardLift ?? {})) {
    for (const e of list ?? []) {
      if (wanted.has(e.cardId)) rows.push({ pair, presence: e.presence ?? null, winRateWith: e.winRateWith ?? null, lift: e.lift ?? null })
    }
  }
  return rows.sort((a, b) => (b.lift ?? -Infinity) - (a.lift ?? -Infinity))
}
```

Check the `winRate: 54.29` and `metaShare: 35` expectations against `aggregateArchetypes` (wins 380 of 700 → 54.29) and `metaShare(700, 1000)` = 700 / 2000 × 100 = 35; the test fixes the numbers, the code must not round `metaShare` itself.

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/lib/__tests__/cardMetaStats.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cardMetaStats.js src/lib/__tests__/cardMetaStats.test.js
git commit -m "cardMetaStats: a card's archetypes, copies and lift from the meta feed"
```

---

### Task 7: "In the duels.ink meta" on the card page

**Files:**
- Create: `src/components/CardMetaSection.jsx`
- Modify: `src/pages/CardPage.jsx`

**Interfaces:**
- Consumes: `fetchEraStats({ queue, era })` (`duelsApi.js`, public), `STOCK_DECK_FOLDERS` (`stockDecks.js`), `cardMetaRows`, `cardPairLift`, `cardKey` (`cardIdResolver.js`), `Tabs`/`Tab`, `InkIcons`, `fmtPp` and `signColor` (as `LiftChecklist.jsx` uses them).
- Produces: `<CardMetaSection printings={Card[]} />`.

- [ ] **Step 1: Write the component**

```jsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchEraStats } from '../lib/duelsApi'
import { STOCK_DECK_FOLDERS } from '../lib/stockDecks'
import { cardMetaRows, cardPairLift } from '../lib/cardMetaStats'
import { cardKey } from '../lib/cardIdResolver'
import { fmtPp } from '../lib/deckDoctor'
import { signColor } from '../lib/statColors'
import { Tabs, Tab } from './ui/Tabs'
import { InkIcons } from './InkIcons'

const pct = v => (v == null ? '—' : `${Math.round(v)}%`)
const share = v => (v == null ? '—' : `${v.toFixed(1)}%`)

// The card's standing in each current duels.ink meta (one tab per Stock Decks
// folder): the named archetypes whose average build runs it, with copies,
// presence, win rate with it and lift; then its colour-pair lift rows.
export function CardMetaSection({ printings }) {
  const [folder, setFolder] = useState(STOCK_DECK_FOLDERS[0])
  const [result, setResult] = useState({})
  const ids = useMemo(() => printings.map(cardKey), [printings])

  useEffect(() => {
    let mounted = true
    fetchEraStats({ queue: folder.queue, era: folder.era }).then(
      stats => mounted && setResult({ folderId: folder.id, stats }),
      err => mounted && setResult({ folderId: folder.id, error: err.message }),
    )
    return () => { mounted = false }
  }, [folder])

  const current = result.folderId === folder.id ? result : {}
  const rows = current.stats ? cardMetaRows(current.stats, ids) : []
  const pairs = current.stats ? cardPairLift(current.stats, ids) : []

  return (
    <section>
      <h2 className="font-display uppercase tracking-wide text-sm text-gray-500 mb-2">In the duels.ink meta</h2>
      <Tabs className="mb-3">
        {STOCK_DECK_FOLDERS.map(f => <Tab key={f.id} active={f.id === folder.id} onClick={() => setFolder(f)}>{f.title.split(' · ')[1]}</Tab>)}
      </Tabs>
      {current.error && <p className="text-sm text-red-700">{current.error}</p>}
      {!current.stats && !current.error && <p className="text-sm text-gray-500">Loading…</p>}
      {current.stats && rows.length === 0 && (
        <p className="text-sm text-gray-500">No named archetype's average build runs this card in {folder.title}.</p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="py-1 pr-3 font-semibold">Archetype</th>
                <th className="py-1 pr-3 font-semibold text-right">Copies</th>
                <th className="py-1 pr-3 font-semibold text-right">In lists</th>
                <th className="py-1 pr-3 font-semibold text-right">Win rate with</th>
                <th className="py-1 pr-3 font-semibold text-right">Lift</th>
                <th className="py-1 pr-3 font-semibold text-right">Meta share</th>
                <th className="py-1 font-semibold text-right">Games</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} className="border-b border-gray-100">
                  <td className="py-1 pr-3">
                    <Link to={`/stock-decks?folder=${folder.id}`} className="inline-flex items-center gap-1.5 text-gray-900 hover:underline">
                      <InkIcons colors={r.colors} size={14} />{r.name}
                    </Link>
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">{r.copies || '—'}</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-gray-600">{r.presence == null ? '—' : pct(r.presence * 100)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{r.winRateWith == null ? '—' : `${r.winRateWith.toFixed(1)}%`}</td>
                  <td className={`py-1 pr-3 text-right tabular-nums ${r.lift == null ? 'text-gray-400' : signColor(r.lift)}`}>{r.lift == null ? '—' : fmtPp(r.lift)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-gray-600">{share(r.metaShare)}</td>
                  <td className="py-1 text-right tabular-nums text-gray-600">{r.gamesPlayed.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pairs.length > 0 && (
        <p className="text-xs text-gray-500 mt-2">
          Colour-pair lift: {pairs.map(p => `${p.pair} ${fmtPp(p.lift)}`).join(' · ')}
        </p>
      )}
    </section>
  )
}
```

Confirm `fmtPp` is exported from `deckDoctor.js` and `signColor` from `statColors.js` (both are imported that way by `LiftChecklist.jsx`); if `fmtPp` lives elsewhere, import it from where `LiftChecklist.jsx` does.

- [ ] **Step 2: Mount it**

In `CardPage.jsx`, import `CardMetaSection` and render `<CardMetaSection printings={printings} />` between the Legality and Printings sections.

- [ ] **Step 3: Verify in the browser**

Dev never reaches `/api/duels` (Vite proxies only `/api/cards`), so mock it: `ctx.route('**/api/duels?*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }))` with a fixture built like Task 6's `stats` but using the real duels.ink id of the card under test (`/cards/9/40` is Elsa's set-9 reprint; use ids `['1-42', '9-40']`). Screenshot `docs/screenshots/cards-card-meta.png` with the meta table visible. Then route the mock to 500 and assert the section shows the error text, not a blank.

- [ ] **Step 4: Lint, test, commit**

```bash
git add src/components/CardMetaSection.jsx src/pages/CardPage.jsx docs/screenshots/cards-card-meta.png
git commit -m "Card page: the card's archetypes and lift from the duels.ink meta"
```

---

### Task 8: Card-name links across the site

**Files:**
- Modify: `src/lib/cardPrintings.js` (+ `__tests__/cardPrintings.test.js`): `cardLinkIndex`
- Create: `src/components/CardLink.jsx`
- Modify: `src/components/DecklistCardBar.jsx` (`link` prop), `src/components/DeckListCard.jsx` (pass it)
- Modify: `src/components/analytics/StatTables.jsx`, `src/pages/AnalyticsPage.jsx`
- Modify: `src/pages/DrawOddsPage.jsx` (legality table name cell)
- Modify: `src/pages/DeckDoctorPage.jsx`, `src/components/deckDoctor/BuildDiff.jsx`, `LiftChecklist.jsx`, `YourCards.jsx`

**Interfaces:**
- Produces: `cardLinkIndex(cards)` → `Map<fullName, path>`; `<CardLink name href className>` → `Link` when `href`, else `span`; `CardBar` prop `link` (ignored when `onToggle` is set); `DeckStats`/`ChallengeStats` prop `cardHref: name => path|null`; Deck Doctor components prop `hrefOf: cardId => path|null`.

- [ ] **Step 1: `cardLinkIndex` test and code**

Append to `cardPrintings.test.js`:
```js
import { cardLinkIndex } from '../cardPrintings'
it('cardLinkIndex maps every name to its primary printing\'s route', () => {
  const index = cardLinkIndex(cards)
  expect(index.get('Elsa - Spirit of Winter')).toBe('/cards/9/40')
  expect(index.get('Dalmatian Puppy - Tail Wagger')).toBe('/cards/8/38')
  expect(index.get('Nobody')).toBeUndefined()
})
```
In `cardPrintings.js`:
```js
export function cardLinkIndex(cards) {
  const index = new Map()
  for (const [name, printings] of groupPrintings(cards)) index.set(name, cardPath(primaryPrinting(printings)))
  return index
}
```
Run: `npx vitest run src/lib/__tests__/cardPrintings.test.js` → PASS.

- [ ] **Step 2: `CardLink`**

```jsx
import { Link } from 'react-router-dom'

// A card name that links to its card page when we know the printing.
export function CardLink({ name, href, className = '' }) {
  return href
    ? <Link to={href} className={`hover:underline ${className}`}>{name}</Link>
    : <span className={className}>{name}</span>
}
```

- [ ] **Step 3: `CardBar` and `DeckListCard`**

In `DecklistCardBar.jsx`: `import { Link } from 'react-router-dom'` and `import { cardPath } from '../lib/cardPrintings'`; signature `CardBar({ entry, selected, onToggle, link })`; before the plain-div branch:
```jsx
  // Deck lists link each bar to its card page; the overlay and the inspector
  // (whose bars are toggle buttons) do not pass `link`.
  if (link && !onToggle) {
    return (
      <Link to={cardPath(card)} style={{ ...inkFill(colors), color: textColor }} className={className}>
        {content}
      </Link>
    )
  }
```
In `DeckListCard.jsx`: `<CardBar key={entry.key} entry={entry} link />`.

- [ ] **Step 4: Analytics**

`AnalyticsPage.jsx`: `import { cardLinkIndex } from '../lib/cardPrintings'`; `const cardHref = useMemo(() => { const index = cardLinkIndex(cards); return name => index.get(name) ?? null }, [cards])`; pass `cardHref={cardHref}` to both `<DeckStats>` and `<ChallengeStats>`.

`StatTables.jsx`: import `CardLink`. `DeckStats({ filteredGames, subtitle, cardHref })` and `ChallengeStats({ filteredGames, subtitle, cardHref })` pass `cardHref` down to every table they render (`StatTable`, `MulliganTable`, `MultiCopyMulliganTable`, `DrawEffectsTable`, `ImpactTable`, `CrossGameChallengers`, `CrossGameDefenders`); each of those takes `cardHref` and renders its name cell as `<CardLink name={c.fullName} href={cardHref?.(c.fullName)} className="flex-1 text-gray-700 truncate" />` (keep each cell's existing classes; the `r.name` row at line ~323 uses `r.name`).

- [ ] **Step 5: Deck Insights**

`DrawOddsPage.jsx`, legality table name cell: import `cardPath` and `CardLink`; replace `{entry.name}` with `<CardLink name={entry.name} href={cardData ? cardPath(cardData) : null} />`.

- [ ] **Step 6: Deck Doctor**

`DeckDoctorPage.jsx`: `const hrefOf = useMemo(() => id => (cardById[id] ? cardPath(cardById[id]) : null), [cardById])`; pass `hrefOf={hrefOf}` wherever `nameOf={nameOf}` is passed to `BuildDiff`, `LiftChecklist` and `YourCards`. In those three components add the `hrefOf` prop and render `<CardLink name={nameOf(r.cardId)} href={hrefOf(r.cardId)} />` where `{nameOf(r.cardId)}` was rendered (in `YourCards`, where names are aggregated by name, keep a `hrefOf` lookup on the first cardId of each name).

- [ ] **Step 7: Verify in the browser**

`/stock-decks`: a card bar is an `<a href="/cards/…">`; click one and land on the card page. `/decklist-inspector` with a pasted list: bars are still `<button>`s. `/decklist-inspector/overlay`: no anchors. `/analytics` and `/deck-doctor` are supporter-gated: use the mocks in `docs/agents/ui-screenshots.md` and confirm a card name in the Analytics card table is a link (with imported gamelogs absent, assert the component renders; the unit of truth is the `CardLink` call).

- [ ] **Step 8: Lint, test, commit**

Run: `npm run lint && npm test`
Expected: green.

```bash
git add src/lib/cardPrintings.js src/lib/__tests__/cardPrintings.test.js src/components/CardLink.jsx src/components/DecklistCardBar.jsx src/components/DeckListCard.jsx src/components/analytics/StatTables.jsx src/pages/AnalyticsPage.jsx src/pages/DrawOddsPage.jsx src/pages/DeckDoctorPage.jsx src/components/deckDoctor
git commit -m "Link card names to their card pages"
```

---

### Task 9: Docs and PR

**Files:**
- Modify: `docs/agents/cards.md`, `docs/agents/duels-data.md`, `CLAUDE.md`

- [ ] **Step 1: Docs**

`docs/agents/cards.md`: add sections **Prices** (the snapshot: script, workflow, file shape, `cardPrices.js` helpers, "unofficial endpoint", the 2% rule, that `usd` throws without the snapshot), **List view** (`display:`, `withDirective`, header sorting), **Links** (`cardPath`, `cardLinkIndex`, `CardLink`, where `CardBar` links and where it must not), **Meta section** (`cardMetaStats.js`, the ids-across-printings rule, one `fetchEraStats` per Stock Decks folder). Update "Not built".

`docs/agents/duels-data.md`: one line under the Stock Decks or Deck Doctor section: the card page's meta section reads the same `/api/stats/meta` feed through `cardMetaStats.js`.

`CLAUDE.md`: Shared libraries "Cards and inks" row gains `cardPrices.js` and `cardMetaStats.js`; Scheduled GitHub Actions line gains `card-prices.yml` (daily, commits `public/card-prices.json`); Hooks line gains `useCardPrices`; Storage table gains a row `| \`public/card-prices.json\` | Daily TCGplayer market prices by \`tcgPlayerId\` (GitHub Action) |`.

- [ ] **Step 2: Full check, commit, push**

Run: `npm run lint && npm test && npm run build && git checkout -- public/lorcana-extension.zip`
Expected: green; the build confirms `/cards` still prerenders.

```bash
git add docs/agents/cards.md docs/agents/duels-data.md CLAUDE.md
git commit -m "Docs: prices, list view, card links, meta section"
git push -u origin claude/upbeat-curie-wncgen
```

- [ ] **Step 3: PR**

Update the description of tkwidmer/lorcana-pro-tools#366: a "Follow-ups" section listing the four additions, the two new screenshots by raw GitHub URL (`https://raw.githubusercontent.com/tkwidmer/lorcana-pro-tools/claude/upbeat-curie-wncgen/docs/screenshots/cards-list.png` and `…/cards-card-meta.png`), and a reviewer note that `card-prices.yml` commits to `main` daily (one commit per day on days prices move) and uses an unofficial TCGplayer endpoint.

---

## Self-review

- **Spec coverage:** §1 prices → T1 (snapshot, script, workflow, lib), T2 (hook), T3 (`usd`, `order:usd`), T4 (list/grid prices), T5 (card page). §2 list view → T3 (`display:`, `withDirective`), T4. §3 links → T8 (all five sites in the spec's table; the excluded ones stay excluded). §4 meta → T6, T7. Docs → T9.
- **Placeholders:** none; the only "unchanged" markers point at code that exists on the branch today (`runQuery`'s `unique` block, the three Buy buttons).
- **Type consistency:** `printingPrice(prices, card)`/`usdOf`/`priceLabel` (T1 → T3, T4, T5); `runQuery` → `{ cards, display }` and `prices` arg (T3 → T4); `withDirective(q, key, value|null)` (T3 → T4); `cardMetaRows`/`cardPairLift(stats, ids)` (T6 → T7); `cardLinkIndex`, `CardLink`, `CardBar link`, `cardHref`, `hrefOf` (T8 internal).
- **Review Focus:** 1 → T1 tests + T3 `usd` on `song`; 2 → T1 `assertCoverage`; 3 → T3 `withDirective` tests; 4 → T6 first two tests; 5 → T8 step 3 guard and step 7 check.
