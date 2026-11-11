# Card Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Scryfall-style card search (`/cards?q=`) and a page per printing (`/cards/:setCode/:number`) with abilities, rulings, Core/Infinity/Coconut legality and every other printing, computed client-side from the LorcanaJSON data the site already loads.

**Architecture:** Three pure libs in `src/lib/`, each unit-tested: `cardLegality.js` (status per format), `cardPrintings.js` (card URLs, printing groups, the printing to show for a name), `cardQuery.js` (tokenizer → recursive-descent parser → predicate; `runQuery` filters, dedupes by name, sorts). `useCards` starts returning the JSON's `sets` beside `cards`. Two pages render those results. No API route, no database, no dependency.

**Tech Stack:** React 19, React Router 7, Tailwind 4 (palette utilities, no `dark:`), Vitest. Card data: LorcanaJSON `allCards.json` via `/api/cards` (formatVersion 2.4.1).

**Spec:** `docs/superpowers/specs/2026-11-11-card-database-design.md` — read it first; it holds the verified data shapes and the full syntax table.

## Global Constraints

- No `dark:` variants; palette utilities only. `bg-gray-900` for a solid dark fill. Status colors semantic (green legal, red banned, gray otherwise).
- Use `ui/` building blocks (`Button`, `Card`, `PageHeader`, `Input`, `Badge`); `forge` only for the one primary action or current selection.
- Page wrappers are `w-full px-6 py-8`.
- New catalog tool needs an `icon` key in `src/lib/toolIcons.js` (`siteSections.test.js` enforces it).
- Unknown query keys/values throw `QuerySyntaxError`; no silent fallbacks, no guessing. Let the error reach the page.
- One way to build a card URL: `cardPath(card)` in `cardPrintings.js`, built on `cardKey` from `cardIdResolver.js`.
- Normalize text once: `norm()` in `cardQuery.js` strips accents (NFD), lowercases, collapses whitespace. `Te Kā` must match `te ka`.
- Lorcana has no sideboard; if deck advice ever appears, say "tech slots" (it does not here).
- Commit messages end with the session's attribution lines; no model identifiers in any pushed artifact.
- Card images come straight from `card.images.thumbnail` / `card.images.full` in `<img>` tags (plain `<img>` needs no CORS; `/api/card-image` is only for canvas work).

## Review Focus

1. A query with a stray `)` or an unclosed `(` or a dangling `or` must show a syntax message, not a blank grid or a crash. Pinned in Task 4 (`throws on unbalanced parentheses`, `throws on a dangling or`).
2. `cost:` on a card with no `cost` field, or `str>4` on an Action (no `strength`), must exclude the card, never throw or coerce `undefined` to 0. Pinned in Task 4 (`a missing stat never compares true`).
3. Hiram Flaversham (Core `allowed:false` with both `allowedUntilDate` and `bannedSinceDate`) must read **Banned**, not Rotated. Pinned in Task 2 (`banned beats rotated`).
4. `/cards/1/P1-1` and `/cards/3/4c` must resolve to the promo and the variant, and `/cards/1/42` must never resolve to the P1 promo numbered 42. Pinned in Task 3 (`findPrinting` tests).
5. `unique:cards` for `s:1` must show the set-1 printing of a name, not the latest reprint; without `s:` the latest base (non-promo, non-enchanted) printing shows. Pinned in Task 3 (`primaryPrinting`) and Task 5 (`runQuery picks the matching printing`).

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/cardsCache.js`, `src/hooks/useCards.js` | Cache and return `{ cards, sets }` |
| `src/lib/cardIdResolver.js` | Export `cardKey` |
| `src/lib/cardLegality.js` (+ test) | `FORMATS`, `formatStatus(card, format)`, `legality(card)` |
| `src/lib/cardPrintings.js` (+ test) | `cardPath`, `findPrinting`, `groupPrintings`, `primaryPrinting`, `setOrder` |
| `src/lib/cardQuery.js` (+ test) | `QuerySyntaxError`, `norm`, `parseQuery`, `runQuery` |
| `src/components/CardSearchSyntax.jsx` | The syntax reference table shown on `/cards` |
| `src/pages/CardSearchPage.jsx` | `/cards` |
| `src/pages/CardPage.jsx` | `/cards/:setCode/:number` |
| `src/App.jsx`, `src/lib/siteSections.js`, `src/lib/toolIcons.js`, `src/lib/routeTitle.js`, `prerender.js` | Routes, catalog entry, titles, prerender |
| `docs/agents/cards.md`, `CLAUDE.md`, `docs/screenshots/cards-*.png` | Docs and PR screenshots |

---

### Task 1: `useCards` returns `sets`

**Files:**
- Modify: `src/lib/cardsCache.js`
- Modify: `src/hooks/useCards.js`

**Interfaces:**
- Produces: `useCards()` → `{ cards: Card[], sets: Record<setCode, Set>, loading: boolean, error: string|null }`. Every existing caller destructures `cards` (and `loading`/`error`) only, so nothing else changes.
- `getCachedCards()` → `{ cards, sets } | null`; `setCachedCards({ cards, sets })`. A cached record without `sets` (written by the old code) is a miss, so the first load after deploy refetches once.

- [ ] **Step 1: Change the cache shape**

Replace the two functions in `src/lib/cardsCache.js`:

```js
export async function getCachedCards() {
  try {
    const store = await getTx(STORE, 'readonly')
    const cached = await promisify(store.get('current'))
    if (!cached?.cards || !cached.sets) return null
    const ONE_DAY = 24 * 60 * 60 * 1000
    if (Date.now() - cached.fetchedAt > ONE_DAY) return null
    return { cards: cached.cards, sets: cached.sets }
  } catch {
    return null
  }
}

export async function setCachedCards({ cards, sets }) {
  try {
    const store = await getTx(STORE, 'readwrite')
    await promisify(store.put({ version: 'current', cards, sets, fetchedAt: Date.now() }))
  } catch {
    // silently fail if storage is full
  }
}
```

- [ ] **Step 2: Return sets from the hook**

Replace the body of `src/hooks/useCards.js`:

```js
import { useState, useEffect } from 'react'
import { getCachedCards, setCachedCards } from '../lib/cardsCache'

const CARDS_URL = '/api/cards'
const CACHE_READ_TIMEOUT_MS = 3000

export function useCards() {
  const [data, setData] = useState({ cards: [], sets: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true

    async function loadCards() {
      try {
        // Try cache first — a stuck/corrupted IndexedDB connection can leave
        // this pending forever with no error, so race it against a timeout
        // and fall back to a fresh network fetch rather than hang the page.
        const cached = await Promise.race([
          getCachedCards(),
          new Promise(resolve => setTimeout(() => resolve(null), CACHE_READ_TIMEOUT_MS)),
        ])
        if (cached && mounted) {
          setData(cached)
          setLoading(false)
          return
        }

        const response = await fetch(CARDS_URL)
        if (!response.ok) throw new Error(`Failed to load card data (HTTP ${response.status})`)
        const json = await response.json()
        const fresh = { cards: json.cards, sets: json.sets }

        if (mounted) {
          setData(fresh)
          setLoading(false)
          await setCachedCards(fresh)
        }
      } catch (err) {
        if (mounted) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    loadCards()
    return () => { mounted = false }
  }, [])

  return { cards: data.cards, sets: data.sets, loading, error }
}
```

- [ ] **Step 3: Run the suite and lint**

Run: `npm test && npm run lint`
Expected: all green (no test covers these two files; this guards the callers).

- [ ] **Step 4: Commit**

```bash
git add src/lib/cardsCache.js src/hooks/useCards.js
git commit -m "useCards: keep LorcanaJSON sets beside the cards"
```

---

### Task 2: `cardLegality.js`

**Files:**
- Create: `src/lib/cardLegality.js`
- Test: `src/lib/__tests__/cardLegality.test.js`

**Interfaces:**
- Produces: `FORMATS = [{ key: 'Core', label: 'Core' }, { key: 'Infinity', label: 'Infinity' }, { key: 'FormatCoconut', label: 'Coconut' }]`; `formatStatus(card, formatKey)` → `{ status: 'legal' | 'banned' | 'rotated' | 'not_legal', since?: string, until?: string }`; `legality(card)` → `{ Core, Infinity, FormatCoconut }` of those.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import { FORMATS, formatStatus, legality } from '../cardLegality'

const card = allowedInFormats => ({ allowedInFormats })

describe('formatStatus', () => {
  it('reads legal, rotated and never-legal', () => {
    expect(formatStatus(card({ Core: { allowed: true } }), 'Core')).toEqual({ status: 'legal' })
    expect(formatStatus(card({ Core: { allowed: false, allowedUntilDate: '2025-09-05', rotationGroup: 1 } }), 'Core'))
      .toEqual({ status: 'rotated', until: '2025-09-05' })
    expect(formatStatus(card({ Core: { allowed: false } }), 'Core')).toEqual({ status: 'not_legal' })
    expect(formatStatus(card({}), 'Infinity')).toEqual({ status: 'not_legal' })
  })

  it('banned beats rotated (Hiram Flaversham)', () => {
    const hiram = card({
      Core: { allowed: false, allowedUntilDate: '2025-04-08', bannedSinceDate: '2025-04-08' },
      Infinity: { allowed: false, bannedSinceDate: '2026-03-26' },
    })
    expect(formatStatus(hiram, 'Core')).toEqual({ status: 'banned', since: '2025-04-08' })
    expect(formatStatus(hiram, 'Infinity')).toEqual({ status: 'banned', since: '2026-03-26' })
  })

  it('Coconut plays the Infinity pool minus its own bans', () => {
    expect(formatStatus(card({ Core: { allowed: true }, Infinity: { allowed: true } }), 'FormatCoconut')).toEqual({ status: 'legal' })
    expect(formatStatus(card({ Infinity: { allowed: true }, FormatCoconut: { allowed: false, bannedSinceDate: '2026-11-03' } }), 'FormatCoconut'))
      .toEqual({ status: 'banned', since: '2026-11-03' })
    expect(formatStatus(card({ Infinity: { allowed: false, bannedSinceDate: '2026-03-26' } }), 'FormatCoconut'))
      .toEqual({ status: 'banned', since: '2026-03-26' })
  })

  it('throws on an unknown format', () => {
    expect(() => formatStatus(card({}), 'Standard')).toThrow('Unknown format')
  })
})

describe('legality', () => {
  it('reports every format in FORMATS order', () => {
    const l = legality(card({ Core: { allowed: true }, Infinity: { allowed: true } }))
    expect(Object.keys(l)).toEqual(FORMATS.map(f => f.key))
    expect(l.FormatCoconut).toEqual({ status: 'legal' })
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/lib/__tests__/cardLegality.test.js`
Expected: FAIL, cannot resolve `../cardLegality`.

- [ ] **Step 3: Implement**

```js
// Format legality of one LorcanaJSON printing. `allowedInFormats` is already
// propagated by card name upstream (a set-1 printing of a card reprinted in
// set 9 reads Core-legal), so a printing's status is its name's status.
// Status: legal | banned (since) | rotated (until) | not_legal.
export const FORMATS = [
  { key: 'Core', label: 'Core' },
  { key: 'Infinity', label: 'Infinity' },
  { key: 'FormatCoconut', label: 'Coconut' },
]

function statusOf(entry) {
  if (!entry) return { status: 'not_legal' }
  if (entry.allowed) return { status: 'legal' }
  if (entry.bannedSinceDate) return { status: 'banned', since: entry.bannedSinceDate }
  if (entry.allowedUntilDate) return { status: 'rotated', until: entry.allowedUntilDate }
  return { status: 'not_legal' }
}

export function formatStatus(card, format) {
  const formats = card.allowedInFormats ?? {}
  switch (format) {
    case 'Core':
    case 'Infinity':
      return statusOf(formats[format])
    case 'FormatCoconut': {
      // Coconut has no pool of its own in the data: it plays the Infinity
      // pool, and FormatCoconut only ever carries a ban.
      const ban = formats.FormatCoconut?.bannedSinceDate
      return ban ? { status: 'banned', since: ban } : statusOf(formats.Infinity)
    }
    default:
      throw new Error(`Unknown format: ${format}`)
  }
}

export function legality(card) {
  return Object.fromEntries(FORMATS.map(f => [f.key, formatStatus(card, f.key)]))
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/lib/__tests__/cardLegality.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cardLegality.js src/lib/__tests__/cardLegality.test.js
git commit -m "cardLegality: Core, Infinity and Coconut status per printing"
```

---

### Task 3: `cardPrintings.js` and `cardKey` export

**Files:**
- Modify: `src/lib/cardIdResolver.js` (export `cardKey`)
- Create: `src/lib/cardPrintings.js`
- Test: `src/lib/__tests__/cardPrintings.test.js`

**Interfaces:**
- Consumes: `cardKey(card)` → `'1-42'`, `'1-P1-1'`, `'3-4c'` (now exported from `cardIdResolver.js`).
- Produces: `cardPath(card)` → `'/cards/1/42'`, `'/cards/1/P1-1'`, `'/cards/3/4c'`; `findPrinting(cards, setCode, number)` → card or `null`; `setOrder(card)` → number for sorting sets (numeric sets by number, quest sets after at 100+); `groupPrintings(cards)` → `Map<fullName, Card[]>` sorted by `setOrder`, promos after regular, then number, then variant; `primaryPrinting(printings)` → the printing to show for a name: among base printings (no `baseId`, no `promoGrouping`, no `variant`) the latest set, else the first printing.

- [ ] **Step 1: Export `cardKey`**

In `src/lib/cardIdResolver.js` change `function cardKey(card) {` to `export function cardKey(card) {`.

- [ ] **Step 2: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import { cardPath, findPrinting, groupPrintings, primaryPrinting, setOrder } from '../cardPrintings'

const elsa1 = { id: 42, setCode: '1', number: 42, fullName: 'Elsa - Spirit of Winter', rarity: 'Legendary' }
const elsa1Ench = { id: 207, setCode: '1', number: 207, baseId: 42, fullName: 'Elsa - Spirit of Winter', rarity: 'Enchanted' }
const elsaPromo = { id: 900, setCode: '1', number: 42, promoGrouping: 'P1', baseId: 42, fullName: 'Elsa - Spirit of Winter', rarity: 'Special' }
const elsa9 = { id: 1979, setCode: '9', number: 40, reprintOfId: 42, fullName: 'Elsa - Spirit of Winter', rarity: 'Legendary' }
const puppyC = { id: 438, setCode: '3', number: 4, variant: 'c', fullName: 'Dalmatian Puppy - Tail Wagger' }
const puppy8 = { id: 1702, setCode: '8', number: 38, reprintOfId: 436, fullName: 'Dalmatian Puppy - Tail Wagger' }
const quest = { id: 5000, setCode: 'Q1', number: 1, fullName: 'Anna - Ensnared Sister' }
const cards = [elsa9, elsaPromo, elsa1Ench, elsa1, puppy8, puppyC, quest]

describe('cardPath', () => {
  it('turns the duels.ink id into a route', () => {
    expect(cardPath(elsa1)).toBe('/cards/1/42')
    expect(cardPath(elsaPromo)).toBe('/cards/1/P1-42')
    expect(cardPath(puppyC)).toBe('/cards/3/4c')
    expect(cardPath(quest)).toBe('/cards/Q1/1')
  })
})

describe('findPrinting', () => {
  it('resolves a route back to its printing, promo and variant included', () => {
    expect(findPrinting(cards, '1', '42')).toBe(elsa1)
    expect(findPrinting(cards, '1', 'P1-42')).toBe(elsaPromo)
    expect(findPrinting(cards, '3', '4c')).toBe(puppyC)
    expect(findPrinting(cards, '1', '999')).toBeNull()
  })
})

describe('groupPrintings', () => {
  it('groups by fullName, regular printings before promos, sets in order', () => {
    const groups = groupPrintings(cards)
    expect(groups.get('Elsa - Spirit of Winter').map(c => c.id)).toEqual([42, 207, 900, 1979])
    expect(groups.get('Dalmatian Puppy - Tail Wagger').map(c => c.id)).toEqual([438, 1702])
  })

  it('sorts quest sets after the numbered sets', () => {
    expect(setOrder(quest)).toBeGreaterThan(setOrder({ setCode: '16' }))
  })
})

describe('primaryPrinting', () => {
  it('prefers the latest base printing over enchanteds, promos and variants', () => {
    expect(primaryPrinting([elsa1, elsa1Ench, elsaPromo, elsa9])).toBe(elsa9)
    expect(primaryPrinting([elsa1, elsa1Ench, elsaPromo])).toBe(elsa1)
    expect(primaryPrinting([puppyC, puppy8])).toBe(puppy8)
  })

  it('falls back to the first printing when none is a base printing', () => {
    expect(primaryPrinting([elsa1Ench, elsaPromo])).toBe(elsa1Ench)
  })
})
```

- [ ] **Step 3: Run to see it fail**

Run: `npx vitest run src/lib/__tests__/cardPrintings.test.js`
Expected: FAIL, cannot resolve `../cardPrintings`.

- [ ] **Step 4: Implement**

```js
// Printings of a card name and their routes. A route is the duels.ink id
// (`cardKey`) with the set split off: /cards/1/42, /cards/1/P1-42 (promo),
// /cards/3/4c (variant).
import { cardKey } from './cardIdResolver'

export const cardPath = card => '/cards/' + cardKey(card).replace('-', '/')

export function findPrinting(cards, setCode, number) {
  const key = `${setCode}-${number}`
  return cards.find(c => cardKey(c) === key) ?? null
}

// Numbered sets in order; quest sets (Q1, Q2…) after them.
export function setOrder(card) {
  const n = parseInt(card.setCode, 10)
  return Number.isNaN(n) ? 100 + parseInt(card.setCode.replace(/\D/g, ''), 10) : n
}

const byPrinting = (a, b) =>
  setOrder(a) - setOrder(b) ||
  (a.promoGrouping ? 1 : 0) - (b.promoGrouping ? 1 : 0) ||
  a.number - b.number ||
  (a.variant ?? '').localeCompare(b.variant ?? '')

export function groupPrintings(cards) {
  const groups = new Map()
  for (const c of cards) {
    const group = groups.get(c.fullName)
    if (group) group.push(c)
    else groups.set(c.fullName, [c])
  }
  for (const group of groups.values()) group.sort(byPrinting)
  return groups
}

const isBase = c => !c.baseId && !c.promoGrouping && !c.variant

// The printing to show for a name: the latest base printing (the current
// reprint), else whatever came first in printing order.
export function primaryPrinting(printings) {
  const base = printings.filter(isBase)
  const pool = base.length ? base : [...printings].sort(byPrinting)
  if (!base.length) return pool[0]
  return base.reduce((best, c) => (setOrder(c) > setOrder(best) ? c : best))
}
```

- [ ] **Step 5: Run to see it pass**

Run: `npx vitest run src/lib/__tests__/cardPrintings.test.js src/lib/__tests__/cardIdResolver.test.js`
Expected: PASS (the resolver tests still pass with the export).

- [ ] **Step 6: Commit**

```bash
git add src/lib/cardIdResolver.js src/lib/cardPrintings.js src/lib/__tests__/cardPrintings.test.js
git commit -m "cardPrintings: card routes, printing groups and the printing to show"
```

---

### Task 4: `cardQuery.js` parser and predicates

**Files:**
- Create: `src/lib/cardQuery.js`
- Test: `src/lib/__tests__/cardQuery.test.js`

**Interfaces:**
- Consumes: `legality(card)` (Task 2).
- Produces: `class QuerySyntaxError extends Error`; `norm(s)`; `parseQuery(q, sets)` → `{ predicate: card => boolean, order: string, direction: 'asc'|'desc', unique: 'cards'|'prints' }`. `runQuery` is Task 5 and lives in this same file.

The syntax table in the spec is the contract. Everything below implements it exactly; keep keys and aliases identical.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import { parseQuery, QuerySyntaxError, norm } from '../cardQuery'

const sets = {
  '1': { name: 'The First Chapter', releaseDate: '2023-09-01' },
  '9': { name: 'Fabled', releaseDate: '2025-09-05' },
  'Q1': { name: "Illumineer's Quest: Deep Trouble", releaseDate: '2024-05-31' },
}
const legal = { Core: { allowed: true }, Infinity: { allowed: true } }
const elsa = { setCode: '1', number: 42, fullName: 'Elsa - Spirit of Winter', name: 'Elsa', version: 'Spirit of Winter', type: 'Character', subtypesText: 'Floodborn • Hero • Queen • Sorcerer', subtypes: ['Floodborn', 'Hero', 'Queen', 'Sorcerer'], color: 'Amethyst', cost: 8, inkwell: false, strength: 4, willpower: 6, lore: 3, rarity: 'Legendary', keywordAbilities: ['Shift'], fullText: 'Shift 6 (You may pay 6 ⬡ to play this on top of one of\nyour characters named Elsa.)\nDEEP FREEZE When you play this character, exert up\nto 2 chosen characters.', flavorText: 'Ice is stronger than you may think.', artistsText: 'Matthew Robert Davies', story: 'Frozen', allowedInFormats: legal }
const teKa = { setCode: '9', number: 120, fullName: 'Te Kā - The Burning One', name: 'Te Kā', type: 'Character', subtypesText: 'Storyborn • Villain • Deity', subtypes: ['Storyborn', 'Villain', 'Deity'], color: 'Ruby', cost: 6, inkwell: true, strength: 6, willpower: 5, lore: 2, rarity: 'Super Rare', fullText: 'Rush', keywordAbilities: ['Rush'], artistsText: 'Someone', story: 'Moana', allowedInFormats: legal }
const duo = { setCode: '9', number: 99, fullName: 'Mickey Mouse & Minnie Mouse - Adventuring Duo', name: 'Mickey Mouse & Minnie Mouse', type: 'Character', subtypesText: 'Dreamborn • Hero', subtypes: ['Dreamborn', 'Hero'], color: 'Emerald-Sapphire', cost: 7, inkwell: true, strength: 5, willpower: 5, lore: 5, rarity: 'Rare', fullText: '', artistsText: 'A', story: 'Mickey Mouse & Friends', allowedInFormats: legal }
const song = { setCode: '1', number: 26, fullName: 'Be Our Guest', name: 'Be Our Guest', type: 'Action', subtypesText: 'Song', subtypes: ['Song'], color: 'Amber', cost: 2, inkwell: true, rarity: 'Common', fullText: '(A character with cost 2 or more can ⟳ to sing this\nsong for free.)\nLook at the top 4 cards of your deck.', artistsText: 'B', story: 'Beauty and the Beast', allowedInFormats: { Core: { allowed: false, allowedUntilDate: '2025-09-05' }, Infinity: { allowed: true } } }
const hiram = { setCode: '2', number: 149, fullName: 'Hiram Flaversham - Toymaker', name: 'Hiram Flaversham', type: 'Character', subtypesText: 'Storyborn • Ally • Inventor', subtypes: ['Storyborn', 'Ally', 'Inventor'], color: 'Sapphire', cost: 4, inkwell: true, strength: 1, willpower: 6, lore: 2, rarity: 'Rare', fullText: 'ARTIFICER When you play this character and whenever he quests, you may banish one of your items to draw 2 cards.', errata: ['x'], artistsText: 'C', story: 'The Great Mouse Detective', allowedInFormats: { Core: { allowed: false, allowedUntilDate: '2025-04-08', bannedSinceDate: '2025-04-08' }, Infinity: { allowed: false, bannedSinceDate: '2026-03-26' } } }
const promo = { ...elsa, number: 42, promoGrouping: 'P1', baseId: 42, rarity: 'Special' }
const quest = { setCode: 'Q1', number: 1, fullName: 'Anna - Ensnared Sister', name: 'Anna', type: 'Character', subtypesText: 'Storyborn • Hero • Queen', subtypes: ['Storyborn', 'Hero', 'Queen'], color: '', cost: 3, inkwell: false, strength: 2, willpower: 3, lore: 1, rarity: 'Special', fullText: '', artistsText: 'D', story: 'Frozen', allowedInFormats: { Core: { allowed: false }, Infinity: { allowed: false } } }
const cards = [elsa, teKa, duo, song, hiram, promo, quest]

const names = q => cards.filter(parseQuery(q, sets).predicate).map(c => c.fullName)
const uniq = q => [...new Set(names(q))]

describe('norm', () => {
  it('strips accents, case and wrapped whitespace', () => {
    expect(norm('Te Kā -  The\nBurning One')).toBe('te ka - the burning one')
  })
})

describe('name terms', () => {
  it('bare words search the name, accent-insensitively, ANDed', () => {
    expect(uniq('te ka')).toEqual(['Te Kā - The Burning One'])
    expect(uniq('spirit winter')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('"spirit of"')).toEqual(['Elsa - Spirit of Winter'])
  })

  it('!"name" is exact on fullName or name', () => {
    expect(uniq('!"Elsa - Spirit of Winter"')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('!elsa')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('!"Elsa - Spirit"')).toEqual([])
  })
})

describe('text terms', () => {
  it('o: searches the text across line wraps, ~ is the card name, regex works', () => {
    expect(uniq('o:"exert up to 2"')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('o:"characters named ~"')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('o:/banish .* items?/')).toEqual(['Hiram Flaversham - Toymaker'])
    expect(uniq('ft:ice')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('a:"robert davies"')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('story:frozen')).toEqual(['Elsa - Spirit of Winter', 'Anna - Ensnared Sister'])
    expect(uniq('v:"spirit of winter"')).toEqual(['Elsa - Spirit of Winter'])
  })

  it('rejects comparison operators on text', () => {
    expect(() => parseQuery('o>foo', sets)).toThrow(QuerySyntaxError)
  })
})

describe('type and keyword', () => {
  it('t: matches the type or any subtype; t= is the exact type', () => {
    expect(uniq('t:song')).toEqual(['Be Our Guest'])
    expect(uniq('t:floodborn')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('t=action')).toEqual(['Be Our Guest'])
    expect(uniq('t=hero')).toEqual([])
  })

  it('k: is an exact keyword', () => {
    expect(uniq('k:shift')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('k:rush')).toEqual(['Te Kā - The Burning One'])
    expect(uniq('k:shif')).toEqual([])
  })
})

describe('colors', () => {
  it('c: is at-least, c= exact, c<= within, c:m dual, c:colorless none', () => {
    expect(uniq('c:emerald')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('c=emerald')).toEqual([])
    expect(uniq('c=emerald,sapphire')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('c<=amber,amethyst')).toEqual(['Elsa - Spirit of Winter', 'Be Our Guest', 'Anna - Ensnared Sister'])
    expect(uniq('c:m')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('c:colorless')).toEqual(['Anna - Ensnared Sister'])
    expect(uniq('c>emerald')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('c!=ruby -c:colorless').sort()).toEqual(['Be Our Guest', 'Elsa - Spirit of Winter', 'Hiram Flaversham - Toymaker', 'Mickey Mouse & Minnie Mouse - Adventuring Duo'].sort())
  })

  it('ci: is the deck identity (card inks within the query)', () => {
    expect(uniq('ci:ruby,sapphire -c:colorless')).toEqual(['Te Kā - The Burning One', 'Hiram Flaversham - Toymaker'])
    expect(uniq('id:emerald')).toEqual(['Anna - Ensnared Sister'])
  })

  it('rejects an unknown ink', () => {
    expect(() => parseQuery('c:blue', sets)).toThrow('Unknown ink')
  })
})

describe('stats', () => {
  it('compares numbers and other stats', () => {
    expect(uniq('cost<=3')).toEqual(['Be Our Guest', 'Anna - Ensnared Sister'])
    expect(uniq('cost:7')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('str>=6')).toEqual(['Te Kā - The Burning One'])
    expect(uniq('will>str')).toEqual(['Elsa - Spirit of Winter', 'Hiram Flaversham - Toymaker', 'Anna - Ensnared Sister'])
    expect(uniq('lore>=3 is:inkable')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('pow!=4 t=character -c:colorless')).toEqual(['Te Kā - The Burning One', 'Mickey Mouse & Minnie Mouse - Adventuring Duo', 'Hiram Flaversham - Toymaker'])
  })

  it('a missing stat never compares true', () => {
    expect(uniq('str<100')).not.toContain('Be Our Guest')
    expect(uniq('move>=0')).toEqual([])
  })

  it('rejects a non-numeric value', () => {
    expect(() => parseQuery('cost:big', sets)).toThrow(QuerySyntaxError)
  })
})

describe('rarity, set, number, year', () => {
  it('orders rarities and accepts aliases', () => {
    expect(uniq('r:legendary')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('r>=sr -r:special')).toEqual(['Elsa - Spirit of Winter', 'Te Kā - The Burning One'])
    expect(uniq('r:c')).toEqual(['Be Our Guest'])
    expect(() => parseQuery('r:mythic', sets)).toThrow('Unknown rarity')
  })

  it('s: is a set code or a set-name substring', () => {
    expect(uniq('s:9')).toEqual(['Te Kā - The Burning One', 'Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('set:fabled')).toEqual(['Te Kā - The Burning One', 'Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('e:q1')).toEqual(['Anna - Ensnared Sister'])
  })

  it('cn: and year:', () => {
    expect(uniq('cn:42 -is:promo')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('cn<30 s:1')).toEqual(['Be Our Guest'])
    expect(uniq('year>=2025')).toEqual(['Te Kā - The Burning One', 'Mickey Mouse & Minnie Mouse - Adventuring Duo'])
  })
})

describe('legality and is:', () => {
  it('f: and banned:', () => {
    expect(uniq('f:core')).toEqual(['Elsa - Spirit of Winter', 'Te Kā - The Burning One', 'Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('f:infinity -f:core')).toEqual(['Be Our Guest'])
    expect(uniq('banned:core')).toEqual(['Hiram Flaversham - Toymaker'])
    expect(uniq('legal:coconut t:song')).toEqual(['Be Our Guest'])
    expect(() => parseQuery('f:standard', sets)).toThrow('Unknown format')
  })

  it('is: flags and not:', () => {
    expect(uniq('is:uninkable')).toEqual(['Elsa - Spirit of Winter', 'Anna - Ensnared Sister'])
    expect(uniq('is:dual')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('is:promo')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('is:quest')).toEqual(['Anna - Ensnared Sister'])
    expect(uniq('is:banned')).toEqual(['Hiram Flaversham - Toymaker'])
    expect(uniq('is:errata')).toEqual(['Hiram Flaversham - Toymaker'])
    expect(uniq('not:inkable')).toEqual(uniq('is:uninkable'))
    expect(() => parseQuery('is:foil', sets)).toThrow('Unknown is: value')
  })
})

describe('boolean structure', () => {
  it('or, negation and parentheses', () => {
    expect(uniq('t:song or k:rush')).toEqual(['Te Kā - The Burning One', 'Be Our Guest'])
    expect(uniq('(t:song OR k:rush) -c:ruby')).toEqual(['Be Our Guest'])
    expect(uniq('-(c:amber or c:amethyst or c:ruby or c:colorless)')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo', 'Hiram Flaversham - Toymaker'])
  })

  it('throws on unbalanced parentheses', () => {
    expect(() => parseQuery('(t:song', sets)).toThrow(QuerySyntaxError)
    expect(() => parseQuery('t:song)', sets)).toThrow(QuerySyntaxError)
  })

  it('throws on a dangling or', () => {
    expect(() => parseQuery('t:song or', sets)).toThrow(QuerySyntaxError)
    expect(() => parseQuery('or t:song', sets)).toThrow(QuerySyntaxError)
  })

  it('throws on an unknown key', () => {
    expect(() => parseQuery('usd>5', sets)).toThrow('Unknown search key "usd"')
  })
})

describe('directives', () => {
  it('reads order, direction and unique, with defaults', () => {
    expect(parseQuery('elsa', sets)).toMatchObject({ order: 'name', direction: 'asc', unique: 'cards' })
    expect(parseQuery('elsa order:cost dir:desc unique:prints', sets)).toMatchObject({ order: 'cost', direction: 'desc', unique: 'prints' })
    expect(() => parseQuery('order:price', sets)).toThrow('Unknown order')
    expect(() => parseQuery('unique:art', sets)).toThrow(QuerySyntaxError)
  })

  it('an empty query matches everything', () => {
    expect(names('')).toHaveLength(cards.length)
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/lib/__tests__/cardQuery.test.js`
Expected: FAIL, cannot resolve `../cardQuery`.

- [ ] **Step 3: Implement the tokenizer, parser and predicates**

```js
// Scryfall-style search over LorcanaJSON printings. parseQuery turns a query
// string into one predicate plus the order/unique directives; runQuery
// applies it. Unknown keys or values throw QuerySyntaxError, which the
// search page shows verbatim.
import { legality } from './cardLegality'
import { primaryPrinting, setOrder } from './cardPrintings'

export class QuerySyntaxError extends Error {}

export const norm = s =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const INKS = ['amber', 'amethyst', 'emerald', 'ruby', 'sapphire', 'steel']
const inks = c => (c.color ?? '').split('-').filter(Boolean).map(s => s.toLowerCase())

const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, 'super rare': 3, legendary: 4, enchanted: 5, special: 6, epic: 7, iconic: 8 }
const RARITY_ALIAS = { c: 'common', u: 'uncommon', r: 'rare', sr: 'super rare', 'super-rare': 'super rare', l: 'legendary', e: 'enchanted', s: 'special' }
const FORMAT_KEY = { core: 'Core', infinity: 'Infinity', coconut: 'FormatCoconut' }

const COMPARE = {
  '=': (a, b) => a === b,
  '!=': (a, b) => a !== b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
}
const cmpOp = op => COMPARE[op === ':' ? '=' : op]

const TEXT = {
  n: c => c.fullName, name: c => c.fullName,
  o: c => c.fullText, text: c => c.fullText, oracle: c => c.fullText,
  ft: c => c.flavorText, flavor: c => c.flavorText,
  a: c => c.artistsText, artist: c => c.artistsText,
  story: c => c.story,
  v: c => c.version, version: c => c.version,
}
const STAT = {
  cost: 'cost', mv: 'cost', cmc: 'cost',
  str: 'strength', strength: 'strength', pow: 'strength', power: 'strength',
  will: 'willpower', willpower: 'willpower', tou: 'willpower', toughness: 'willpower',
  lore: 'lore', l: 'lore',
  move: 'moveCost', movecost: 'moveCost',
}
const IS = {
  inkable: c => c.inkwell === true,
  inkwell: c => c.inkwell === true,
  uninkable: c => c.inkwell === false,
  dual: c => inks(c).length === 2,
  promo: c => !!c.promoGrouping,
  enchanted: c => c.rarity === 'Enchanted',
  reprint: c => !!c.reprintOfId,
  variant: c => !!c.variant,
  quest: c => c.setCode.startsWith('Q'),
  banned: c => Object.values(legality(c)).some(s => s.status === 'banned'),
  errata: c => (c.errata?.length ?? 0) > 0,
}
export const ORDERS = ['name', 'cost', 'set', 'rarity', 'strength', 'willpower', 'lore', 'released', 'number']

// --- tokenizer ---------------------------------------------------------------

// Groups: 1 "(" · 2 ")" · 3 "-" · 4 "!" + 5 its value · 6 or · 7 key 8 op 9 value · 10 quoted word · 11 bare word
const TOKEN = /\s*(?:(\()|(\))|(-)|(!)("(?:[^"\\]|\\.)*"|[^\s()]+)|(or)(?=[\s()]|$)|([A-Za-z]+)(!=|<=|>=|:|=|<|>)("(?:[^"\\]|\\.)*"|\/(?:[^/\\]|\\.)*\/|[^\s()]+)|("(?:[^"\\]|\\.)*")|([^\s()]+))/iy

const unquote = v => (v.startsWith('"') ? v.slice(1, -1).replace(/\\(.)/g, '$1') : v)

function tokenize(q) {
  const tokens = []
  const src = q.trim()
  let pos = 0
  while (pos < src.length) {
    TOKEN.lastIndex = pos
    const m = TOKEN.exec(src)
    if (!m) throw new QuerySyntaxError(`Can't read the query at "${src.slice(pos, pos + 12)}"`)
    pos = TOKEN.lastIndex
    if (m[1]) tokens.push({ type: '(' })
    else if (m[2]) tokens.push({ type: ')' })
    else if (m[3]) tokens.push({ type: '-' })
    else if (m[4]) tokens.push({ type: 'exact', value: unquote(m[5]) })
    else if (m[6]) tokens.push({ type: 'or' })
    else if (m[7]) tokens.push({ type: 'term', key: m[7].toLowerCase(), op: m[8], raw: m[9] })
    else if (m[10]) tokens.push({ type: 'term', key: 'name', op: ':', raw: m[10] })
    else tokens.push({ type: 'term', key: 'name', op: ':', raw: m[11] })
  }
  return tokens
}

// --- term compilers ----------------------------------------------------------

function textPredicate(get, op, raw) {
  if (raw.length >= 2 && raw.startsWith('/') && raw.endsWith('/')) {
    const re = new RegExp(raw.slice(1, -1), 'i')
    return c => re.test(norm(get(c)))
  }
  const value = norm(unquote(raw))
  const needle = value.includes('~') ? c => value.replaceAll('~', norm(c.name)) : () => value
  if (op === ':') return c => norm(get(c)).includes(needle(c))
  if (op === '=') return c => norm(get(c)) === needle(c)
  throw new QuerySyntaxError(`"${op}" can't be used with a text field`)
}

function statPredicate(field, op, value) {
  const other = STAT[value.toLowerCase()]
  const n = Number(value)
  if (!other && (value === '' || Number.isNaN(n))) throw new QuerySyntaxError(`"${value}" isn't a number or a stat`)
  const rhs = other ? c => c[other] : () => n
  const cmp = cmpOp(op)
  return c => {
    const a = c[field]
    const b = rhs(c)
    return typeof a === 'number' && typeof b === 'number' && cmp(a, b)
  }
}

function parseInks(value) {
  const v = norm(value)
  if (v === 'colorless' || v === 'c') return []
  return v.split(/[\s,/-]+/).filter(Boolean).map(ink => {
    if (!INKS.includes(ink)) throw new QuerySyntaxError(`Unknown ink "${ink}"`)
    return ink
  })
}

const subset = (a, b) => a.every(x => b.includes(x))

function colorPredicate(op, value, identity) {
  if (!identity && op === ':' && /^(m|multi|multicolor)$/i.test(value)) return c => inks(c).length >= 2
  const q = parseInks(value)
  if (q.length === 0) return c => inks(c).length === 0
  const effective = op === ':' ? (identity ? '<=' : '>=') : op
  switch (effective) {
    case '>=': return c => subset(q, inks(c))
    case '<=': return c => subset(inks(c), q)
    case '=': return c => subset(q, inks(c)) && subset(inks(c), q)
    case '!=': return c => !(subset(q, inks(c)) && subset(inks(c), q))
    case '>': return c => subset(q, inks(c)) && inks(c).length > q.length
    case '<': return c => subset(inks(c), q) && inks(c).length < q.length
    default: throw new QuerySyntaxError(`"${op}" can't be used with colors`)
  }
}

function rarityPredicate(op, value) {
  const v = norm(value)
  const name = RARITY_ALIAS[v] ?? v
  if (!(name in RARITY_RANK)) throw new QuerySyntaxError(`Unknown rarity "${value}"`)
  const cmp = cmpOp(op)
  return c => {
    const rank = RARITY_RANK[norm(c.rarity)]
    return rank != null && cmp(rank, RARITY_RANK[name])
  }
}

function formatOf(value) {
  const key = FORMAT_KEY[norm(value)]
  if (!key) throw new QuerySyntaxError(`Unknown format "${value}" (core, infinity, coconut)`)
  return key
}

function compileTerm({ key, op, raw }, sets, opts) {
  const value = unquote(raw)
  if (key in TEXT) return textPredicate(TEXT[key], op, raw)
  if (key in STAT) return statPredicate(STAT[key], op, value)
  switch (key) {
    case 'c': case 'color': case 'ink':
      return colorPredicate(op, value, false)
    case 'ci': case 'id': case 'identity':
      return colorPredicate(op, value, true)
    case 't': case 'type': {
      const v = norm(value)
      if (op === '=') return c => norm(c.type) === v
      if (op === ':') return c => norm(`${c.type} ${c.subtypesText ?? ''}`).includes(v)
      throw new QuerySyntaxError(`"${op}" can't be used with type`)
    }
    case 'k': case 'keyword': {
      const v = norm(value)
      return c => (c.keywordAbilities ?? []).some(k => norm(k) === v)
    }
    case 'r': case 'rarity':
      return rarityPredicate(op, value)
    case 's': case 'set': case 'e': {
      const v = norm(value)
      return c => norm(c.setCode) === v || norm(sets[c.setCode]?.name).includes(v)
    }
    case 'cn': case 'number': {
      if (op === ':' || op === '=') { const v = norm(value); return c => norm(`${c.number}${c.variant ?? ''}`) === v }
      const n = Number(value)
      if (Number.isNaN(n)) throw new QuerySyntaxError(`"${value}" isn't a number`)
      const cmp = cmpOp(op)
      return c => cmp(c.number, n)
    }
    case 'year': {
      const n = Number(value)
      if (Number.isNaN(n)) throw new QuerySyntaxError(`"${value}" isn't a year`)
      const cmp = cmpOp(op)
      return c => {
        const date = sets[c.setCode]?.releaseDate
        return !!date && cmp(Number(date.slice(0, 4)), n)
      }
    }
    case 'f': case 'format': case 'legal': {
      const fmt = formatOf(value)
      return c => legality(c)[fmt].status === 'legal'
    }
    case 'banned': {
      const fmt = formatOf(value)
      return c => legality(c)[fmt].status === 'banned'
    }
    case 'is': case 'not': {
      const p = IS[norm(value)]
      if (!p) throw new QuerySyntaxError(`Unknown is: value "${value}" (${Object.keys(IS).join(', ')})`)
      return key === 'is' ? p : c => !p(c)
    }
    case 'order': {
      const v = norm(value)
      if (!ORDERS.includes(v)) throw new QuerySyntaxError(`Unknown order "${value}" (${ORDERS.join(', ')})`)
      opts.order = v
      return () => true
    }
    case 'dir': case 'direction': {
      const v = norm(value)
      if (v !== 'asc' && v !== 'desc') throw new QuerySyntaxError(`direction must be asc or desc`)
      opts.direction = v
      return () => true
    }
    case 'unique': {
      const v = norm(value)
      if (v !== 'cards' && v !== 'prints') throw new QuerySyntaxError(`unique must be cards or prints`)
      opts.unique = v
      return () => true
    }
    default:
      throw new QuerySyntaxError(`Unknown search key "${key}"`)
  }
}

// --- parser ------------------------------------------------------------------
// expr := and ("or" and)* ; and := unary+ ; unary := "-" unary | "(" expr ")" | term | exact

function parse(tokens, sets, opts) {
  let i = 0
  const peek = () => tokens[i]
  const next = () => tokens[i++]

  function parseOr() {
    let left = parseAnd()
    while (peek()?.type === 'or') {
      next()
      const right = parseAnd()
      const l = left, r = right
      left = c => l(c) || r(c)
    }
    return left
  }

  function parseAnd() {
    const parts = []
    while (peek() && peek().type !== ')' && peek().type !== 'or') parts.push(parseUnary())
    if (parts.length === 0) throw new QuerySyntaxError('Expected a search term')
    return c => parts.every(p => p(c))
  }

  function parseUnary() {
    const t = next()
    if (t.type === '-') { const p = parseUnary(); return c => !p(c) }
    if (t.type === '(') {
      const p = parseOr()
      if (next()?.type !== ')') throw new QuerySyntaxError('Missing ")"')
      return p
    }
    if (t.type === 'exact') { const v = norm(t.value); return c => norm(c.fullName) === v || norm(c.name) === v }
    if (t.type === 'term') return compileTerm(t, sets, opts)
    throw new QuerySyntaxError(`Unexpected "${t.type}"`)
  }

  const predicate = parseOr()
  if (i < tokens.length) throw new QuerySyntaxError(`Unexpected "${tokens[i].type === ')' ? ')' : 'input'}"`)
  return predicate
}

export function parseQuery(q, sets) {
  const opts = { order: 'name', direction: 'asc', unique: 'cards' }
  const tokens = tokenize(q)
  const predicate = tokens.length ? parse(tokens, sets, opts) : () => true
  return { predicate, ...opts }
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/lib/__tests__/cardQuery.test.js`
Expected: PASS. The tests `story:frozen`, `order:cost` and `t:song or k:rush` pin that a bare `or` is the operator while words starting with "or" are not; the `(?=[\s()]|$)` lookahead on group 6 is what makes that hold.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cardQuery.js src/lib/__tests__/cardQuery.test.js
git commit -m "cardQuery: Scryfall-style query parser over LorcanaJSON printings"
```

---

### Task 5: `runQuery`

**Files:**
- Modify: `src/lib/cardQuery.js` (append)
- Test: `src/lib/__tests__/cardQuery.test.js` (append)

**Interfaces:**
- Consumes: `parseQuery`, `primaryPrinting`, `setOrder`.
- Produces: `runQuery(cards, sets, q)` → `Card[]` (printings), one per name unless `unique:prints`, sorted per `order`/`direction` with `fullName`, set, number tiebreaks.

- [ ] **Step 1: Append failing tests**

```js
import { runQuery } from '../cardQuery'

describe('runQuery', () => {
  const elsa9 = { ...elsa, setCode: '9', number: 40, reprintOfId: 42 }
  const all = [...cards, elsa9]

  it('dedupes by name and shows the latest base printing', () => {
    const r = runQuery(all, sets, 'elsa')
    expect(r).toHaveLength(1)
    expect(r[0]).toBe(elsa9)
  })

  it('picks the matching printing when the query narrows the set', () => {
    expect(runQuery(all, sets, 'elsa s:1')[0]).toBe(elsa)
    expect(runQuery(all, sets, 'elsa is:promo')[0]).toBe(promo)
  })

  it('unique:prints returns every printing in printing order', () => {
    expect(runQuery(all, sets, 'elsa unique:prints').map(c => `${c.setCode}-${c.promoGrouping ?? ''}${c.number}`)).toEqual(['1-42', '1-P142', '9-40'])
  })

  it('sorts by name by default, and by the requested order', () => {
    expect(runQuery(all, sets, '-c:colorless').map(c => c.fullName)).toEqual([
      'Be Our Guest', 'Elsa - Spirit of Winter', 'Hiram Flaversham - Toymaker', 'Mickey Mouse & Minnie Mouse - Adventuring Duo', 'Te Kā - The Burning One',
    ])
    expect(runQuery(all, sets, 't=character order:cost dir:desc').map(c => c.cost)).toEqual([8, 7, 6, 4, 3])
    expect(runQuery(all, sets, 'order:rarity').map(c => c.rarity)).toEqual(['Common', 'Rare', 'Rare', 'Super Rare', 'Legendary', 'Special'])
    expect(runQuery(all, sets, 'order:released dir:desc')[0].setCode).toBe('9')
  })

  it('returns nothing for an empty query', () => {
    expect(runQuery(all, sets, '  ')).toEqual([])
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/lib/__tests__/cardQuery.test.js`
Expected: FAIL, `runQuery` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/cardQuery.js`:

```js
// --- running a query ---------------------------------------------------------

const ORDER_KEY = {
  name: () => c => norm(c.fullName),
  cost: () => c => c.cost ?? -1,
  set: () => c => setOrder(c) * 1000 + c.number,
  rarity: () => c => RARITY_RANK[norm(c.rarity)] ?? -1,
  strength: () => c => c.strength ?? -1,
  willpower: () => c => c.willpower ?? -1,
  lore: () => c => c.lore ?? -1,
  released: sets => c => sets[c.setCode]?.releaseDate ?? '',
  number: () => c => c.number,
}

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

export function runQuery(cards, sets, q) {
  if (!q.trim()) return []
  const { predicate, order, direction, unique } = parseQuery(q, sets)
  let hits = cards.filter(predicate)
  if (unique === 'cards') {
    const groups = new Map()
    for (const c of hits) {
      const g = groups.get(c.fullName)
      if (g) g.push(c)
      else groups.set(c.fullName, [c])
    }
    hits = [...groups.values()].map(primaryPrinting)
  }
  const key = ORDER_KEY[order](sets)
  const sign = direction === 'desc' ? -1 : 1
  return hits.sort((a, b) =>
    sign * compare(key(a), key(b)) ||
    compare(norm(a.fullName), norm(b.fullName)) ||
    setOrder(a) - setOrder(b) ||
    (a.promoGrouping ? 1 : 0) - (b.promoGrouping ? 1 : 0) ||
    a.number - b.number)
}
```

Note `runQuery` on `unique:prints` relies on the final tiebreaks for printing order (set, regular before promo, number), which is what the test asserts.

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/lib/__tests__/cardQuery.test.js`
Expected: PASS.

- [ ] **Step 5: Sanity-run against real data**

```bash
node --input-type=module -e "
import { runQuery } from './src/lib/cardQuery.js'
const d = await (await fetch('https://lorcanajson.org/files/current/en/allCards.json')).json()
for (const q of ['k:shift c:amethyst f:core order:cost', 'o:\"draw a card\" is:inkable t=action', 'is:banned', 'r>=enchanted s:9 unique:prints', 'will>str lore>=3', '!\"Elsa - Spirit of Winter\" unique:prints']) {
  const r = runQuery(d.cards, d.sets, q)
  console.log(q, '→', r.length, r.slice(0, 3).map(c => c.fullName + ' [' + c.setCode + '-' + c.number + ']').join(' | '))
}
"
```
Expected: every line prints a count and three names; `is:banned` lists Hiram Flaversham among its results; no throw. If `cardLegality.js` or `cardPrintings.js` import with bare specifiers that Node can't resolve, add the `.js` extension in the import (the repo's `cardSearch.js` does the same for the MCP server).

- [ ] **Step 6: Commit**

```bash
git add src/lib/cardQuery.js src/lib/__tests__/cardQuery.test.js
git commit -m "cardQuery: runQuery dedupes by name and sorts"
```

---

### Task 6: `/cards` search page, catalog entry, titles, prerender

**Files:**
- Create: `src/components/CardSearchSyntax.jsx`
- Create: `src/pages/CardSearchPage.jsx`
- Modify: `src/App.jsx` (import + route beside `/proxy`)
- Modify: `src/lib/siteSections.js` (Resources, after Proxy Generator)
- Modify: `src/lib/toolIcons.js` (`search` icon)
- Modify: `src/lib/routeTitle.js` (title + description)
- Modify: `prerender.js` (`/cards` in `ROUTES`)
- Test: `src/lib/__tests__/routeTitle.test.js` (one assertion)

**Interfaces:**
- Consumes: `useCards()` → `{ cards, sets, loading, error }`; `runQuery(cards, sets, q)`; `QuerySyntaxError`; `cardPath(card)`.
- Produces: route `/cards?q=`; `CardSearchSyntax` (no props); links to `/cards/:setCode/:number` which Task 7 serves.

- [ ] **Step 1: Catalog, icon, title, prerender**

`src/lib/toolIcons.js`, add inside `TOOL_ICONS`:
```js
  search: ['M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z', 'M20 20l-4.3-4.3'],
```

`src/lib/siteSections.js`, Resources section, insert after the Proxy Generator entry:
```js
      {
        path: '/cards',
        name: 'Card Search',
        icon: 'search',
        description: 'Search every Lorcana card with Scryfall-style syntax — inks, cost, text, keywords, format legality — and open any printing for its abilities, rulings, legality and every other printing.',
      },
```

`src/lib/routeTitle.js`: add `'/cards': 'Card Search',` to `TITLES` and `'/cards': 'Search every Disney Lorcana card with Scryfall-style syntax, and browse each card\'s printings, rulings and format legality.',` to the descriptions map. Check how dynamic routes are matched (the `/players/` prefix rule in that file) so `/cards/1/42` also resolves to `Card Search`; add `/cards` to the same prefix list.

`prerender.js`: add `'/cards',` after `'/proxy',` in `ROUTES`.

Append to `src/lib/__tests__/routeTitle.test.js` inside the "matches dynamic routes by prefix" test:
```js
    expect(routeTitle('/cards')).toBe('Card Search · InkbornForge')
    expect(routeTitle('/cards/1/42')).toBe('Card Search · InkbornForge')
```

Run: `npx vitest run src/lib/__tests__/routeTitle.test.js src/lib/__tests__/siteSections.test.js`
Expected: PASS.

- [ ] **Step 2: The syntax reference component**

`src/components/CardSearchSyntax.jsx`:

```jsx
import { Link } from 'react-router-dom'

// The query language, one row per key, in the order a player reaches for
// them. Keep in step with cardQuery.js and docs/agents/cards.md.
const ROWS = [
  ['word, n:, name:', 'Card name (accent- and case-insensitive); !"Exact Name" for an exact match', 'elsa · !"Elsa - Spirit of Winter"'],
  ['o:, text:', 'Rules text; ~ is the card\'s own name; /regex/ allowed', 'o:"draw a card" · o:/banish .* item/'],
  ['t:, type:', 'Type or subtype; t= for the exact type', 't:song · t:floodborn · t=location'],
  ['k:, keyword:', 'A keyword ability', 'k:shift · k:evasive'],
  ['c:, ink:', 'Inks: c: at least, c= exactly, c<= within, c:m dual-ink, c:colorless', 'c:amethyst · c=amber,steel'],
  ['ci:, id:', 'Deck identity: every ink of the card within these', 'ci:amber,steel'],
  ['cost:', 'Ink cost', 'cost<=3 · cost=7'],
  ['str:, will:, lore:, move:', 'Strength, willpower, lore, move cost; compare to a number or another stat', 'str>=4 · will>str · lore>=3'],
  ['r:, rarity:', 'Rarity, ordered (c u r sr l e s)', 'r:legendary · r>=rare'],
  ['s:, set:', 'Set code or set name', 's:9 · s:q1 · set:fabled'],
  ['cn:, number:', 'Collector number', 'cn:4c · cn<10'],
  ['year:', 'Set release year', 'year>=2026'],
  ['f:, legal:, banned:', 'Format legality: core, infinity, coconut', 'f:core · banned:infinity'],
  ['is:, not:', 'inkable, uninkable, dual, promo, enchanted, reprint, variant, quest, banned, errata', 'is:inkable · -is:promo'],
  ['ft:, a:, story:, v:', 'Flavor text, artist, story, version (the subtitle)', 'a:"matthew robert davies" · story:frozen'],
  ['or, -, ( )', 'Any term, negation, grouping', '(t:song or k:rush) -c:ruby'],
  ['order:, dir:, unique:', 'name cost set rarity strength willpower lore released number · asc desc · cards prints', 'order:cost dir:desc unique:prints'],
]

export const EXAMPLES = [
  'k:shift c:amethyst f:core order:cost',
  'o:"draw a card" is:inkable t=action',
  't:song cost<=3 ci:amber,steel',
  'will>str lore>=3 f:core',
  'is:banned',
  'r>=enchanted s:14 unique:prints',
]

export function CardSearchSyntax() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map(q => (
          <Link key={q} to={`/cards?q=${encodeURIComponent(q)}`} className="font-mono text-xs bg-gray-100 text-gray-700 rounded px-2 py-1 hover:bg-gray-200">
            {q}
          </Link>
        ))}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {ROWS.map(([keys, what, example]) => (
            <tr key={keys} className="border-t border-gray-200 align-top">
              <td className="py-2 pr-4 font-mono text-xs whitespace-nowrap text-gray-900">{keys}</td>
              <td className="py-2 pr-4 text-gray-700">{what}</td>
              <td className="py-2 font-mono text-xs text-gray-500">{example}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: The search page**

`src/pages/CardSearchPage.jsx`:

```jsx
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCards } from '../hooks/useCards'
import { runQuery, QuerySyntaxError } from '../lib/cardQuery'
import { cardPath } from '../lib/cardPrintings'
import { PageHeader } from '../components/ui/PageHeader'
import { Input } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { CardSearchSyntax } from '../components/CardSearchSyntax'

const PAGE = 120

export function CardSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const [draft, setDraft] = useState(q)
  const [shown, setShown] = useState(PAGE)
  const [helpOpen, setHelpOpen] = useState(false)
  const { cards, sets, loading, error } = useCards()

  // Either a result list or the syntax message, never both.
  const outcome = useMemo(() => {
    if (!q.trim() || loading) return null
    try {
      return { results: runQuery(cards, sets, q) }
    } catch (e) {
      if (e instanceof QuerySyntaxError) return { syntaxError: e.message }
      throw e
    }
  }, [cards, sets, q, loading])

  function submit(e) {
    e.preventDefault()
    setShown(PAGE)
    setSearchParams(draft.trim() ? { q: draft.trim() } : {})
  }

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Card Search"
        description="Every Lorcana card, searchable the way Scryfall searches Magic."
        actions={<Button size="sm" variant="quiet" onClick={() => setHelpOpen(o => !o)}>{helpOpen ? 'Hide syntax' : 'Syntax'}</Button>}
      />

      <form onSubmit={submit} className="flex gap-2 max-w-3xl mb-6">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder='k:shift c:amethyst f:core — or just a name'
          className="flex-1 font-mono"
          autoFocus
          spellCheck={false}
        />
        <Button type="submit" variant="primary" disabled={loading}>Search</Button>
      </form>

      {error && <p className="text-sm text-red-700 mb-4">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading card data…</p>}

      {(helpOpen || (!q.trim() && !loading)) && (
        <Card title="Search syntax" className="p-4 mb-8">
          <CardSearchSyntax />
        </Card>
      )}

      {outcome?.syntaxError && (
        <p className="text-sm text-red-700">{outcome.syntaxError}</p>
      )}

      {outcome?.results && (
        <>
          <p className="text-sm text-gray-500 mb-4">
            {outcome.results.length.toLocaleString()} card{outcome.results.length === 1 ? '' : 's'}
          </p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {outcome.results.slice(0, shown).map(card => (
              <li key={cardPath(card)}>
                <Link to={cardPath(card)} className="block group">
                  <img
                    src={card.images.thumbnail}
                    alt={card.fullName}
                    loading="lazy"
                    className="w-full rounded-lg border border-gray-200 group-hover:border-gray-900 transition-colors"
                  />
                  <span className="block mt-1 text-xs text-gray-700 truncate">{card.fullName}</span>
                </Link>
              </li>
            ))}
          </ul>
          {outcome.results.length > shown && (
            <div className="mt-6 text-center">
              <Button onClick={() => setShown(s => s + PAGE)}>Show {Math.min(PAGE, outcome.results.length - shown)} more</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Route**

In `src/App.jsx`, import `CardSearchPage` beside the other page imports and add, after the `/proxy` route:
```jsx
        <Route path="/cards" element={<CardSearchPage />} />
```

- [ ] **Step 5: Verify in the browser**

Follow `docs/agents/ui-screenshots.md`. Start the dev server in its own Bash call, then a Playwright script that opens `http://localhost:5173/cards?q=k%3Ashift%20c%3Aamethyst%20f%3Acore`, waits for `text=cards`, screenshots to `docs/screenshots/cards-search.png` at 1400×1000; then opens `/cards?q=usd%3E5` and asserts the page contains `Unknown search key "usd"`; then `/cards` and asserts the syntax table shows. Stop the server in its own Bash call.

Expected: thumbnails in a grid with a count line; the error message; the help table.

- [ ] **Step 6: Lint, test, commit**

Run: `npm run lint && npm test`
Expected: green.

```bash
git add src/components/CardSearchSyntax.jsx src/pages/CardSearchPage.jsx src/App.jsx src/lib/siteSections.js src/lib/toolIcons.js src/lib/routeTitle.js src/lib/__tests__/routeTitle.test.js prerender.js docs/screenshots/cards-search.png
git commit -m "Card Search: /cards with Scryfall-style queries"
```

---

### Task 7: `/cards/:setCode/:number` card page

**Files:**
- Create: `src/pages/CardPage.jsx`
- Modify: `src/App.jsx` (import + route after `/cards`)

**Interfaces:**
- Consumes: `useCards()`; `findPrinting(cards, setCode, number)`, `groupPrintings(cards)`, `cardPath(card)`; `FORMATS`, `legality(card)`; `CostBadge` from `src/components/DecklistCardBar.jsx`; `InkIcons` from `src/components/InkIcons.jsx`; `resolveColors` from `src/lib/inkColors.js`.
- Produces: the page. Quick-search chips link to `/cards?q=…`.

- [ ] **Step 1: Write the page**

`src/pages/CardPage.jsx`:

```jsx
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCards } from '../hooks/useCards'
import { findPrinting, groupPrintings, cardPath } from '../lib/cardPrintings'
import { FORMATS, legality } from '../lib/cardLegality'
import { resolveColors } from '../lib/inkColors'
import { InkIcons } from '../components/InkIcons'
import { CostBadge } from '../components/DecklistCardBar'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'

const STATUS = {
  legal: { label: 'Legal', cls: 'bg-green-50 text-green-700 border-green-200' },
  banned: { label: 'Banned', cls: 'bg-red-50 text-red-700 border-red-200' },
  rotated: { label: 'Rotated', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  not_legal: { label: 'Not legal', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
}

const search = q => `/cards?q=${encodeURIComponent(q)}`

function Chip({ q, children }) {
  return <Link to={search(q)} className="font-mono text-xs bg-gray-100 text-gray-700 rounded px-2 py-0.5 hover:bg-gray-200">{children}</Link>
}

// Keyword abilities bold with their reminder in italics; named abilities
// with the name bold; everything else as written.
function Ability({ ability }) {
  if (ability.type === 'keyword') {
    return (
      <p>
        <b>{ability.keyword}{ability.keywordValue ? ` ${ability.keywordValue}` : ''}</b>
        {ability.reminderText && <i className="text-gray-500"> ({ability.reminderText})</i>}
      </p>
    )
  }
  return (
    <p>
      {ability.name && <b>{ability.name} </b>}
      {ability.effect ?? ability.fullText}
    </p>
  )
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="font-display uppercase tracking-wide text-sm text-gray-500 mb-2">{title}</h2>
      {children}
    </section>
  )
}

export function CardPage() {
  const { setCode, number } = useParams()
  const { cards, sets, loading, error } = useCards()
  const card = useMemo(() => findPrinting(cards, setCode, number), [cards, setCode, number])
  const printings = useMemo(() => (card ? groupPrintings(cards).get(card.fullName) : []), [cards, card])

  if (loading) return <div className="w-full px-6 py-8 text-sm text-gray-500">Loading card data…</div>
  if (error) return <div className="w-full px-6 py-8 text-sm text-red-700">{error}</div>
  if (!card) {
    return (
      <div className="w-full px-6 py-8">
        <p className="text-gray-700 mb-4">No card is printed as {setCode}-{number}.</p>
        <Button to="/cards">Card Search</Button>
      </div>
    )
  }

  const set = sets[card.setCode]
  const colors = resolveColors([card.color])
  const status = legality(card)
  const abilities = card.abilities ?? card.fullTextSections.map(fullText => ({ fullText }))
  const quickSearches = [
    ...(card.subtypes ?? []).map(s => ['t', s]),
    ...(card.keywordAbilities ?? []).map(k => ['k', k]),
    ['a', card.artistsText],
    ['story', card.story],
  ]

  return (
    <div className="w-full px-6 py-8">
      <div className="mb-6">
        <Link to="/cards" className="text-xs font-semibold uppercase tracking-widest text-forge-ink">Card Search</Link>
        <h1 className="text-3xl sm:text-4xl font-medium leading-tight text-gray-900 mt-1">{card.fullName}</h1>
        <p className="text-gray-500">{set?.name ?? `Set ${card.setCode}`} · #{card.number}{card.variant ?? ''} · {card.rarity}{card.promoSource ? ` · ${card.promoSource}` : ''}</p>
      </div>

      <div className="grid gap-8 md:grid-cols-[minmax(0,380px)_1fr]">
        <img src={card.images.full} alt={card.fullName} className="w-full rounded-xl" />

        <div className="space-y-8 min-w-0">
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
            <InkIcons colors={colors} size={24} />
            <CostBadge cost={card.cost} inkable={card.inkwell} />
            <span>{card.inkwell ? 'Inkable' : 'Uninkable'}</span>
            <span>·</span>
            <span>{card.type}{card.subtypesText ? ` • ${card.subtypesText}` : ''}</span>
            {card.type === 'Character' && <span>· {card.strength} ¤ / {card.willpower} ⛉ / {card.lore} ◆</span>}
            {card.type === 'Location' && <span>· {card.willpower} ⛉ / {card.lore} ◆ · move {card.moveCost}</span>}
          </div>

          {abilities.length > 0 && (
            <div className="space-y-2 text-gray-900 leading-relaxed">
              {abilities.map((a, i) => <Ability key={i} ability={a} />)}
            </div>
          )}
          {card.flavorText && <p className="italic text-gray-500 whitespace-pre-line">{card.flavorText}</p>}
          <p className="text-sm text-gray-500">Illustrated by {card.artistsText} · {card.story} · {card.fullIdentifier}</p>

          <Section title="Legality">
            <ul className="flex flex-wrap gap-2">
              {FORMATS.map(f => {
                const s = status[f.key]
                const tone = STATUS[s.status]
                return (
                  <li key={f.key} className={`border rounded px-3 py-1.5 text-sm ${tone.cls}`}>
                    <span className="font-semibold">{f.label}</span> · {tone.label}
                    {s.since && <span className="text-xs"> since {s.since}</span>}
                    {s.until && <span className="text-xs"> until {s.until}</span>}
                  </li>
                )
              })}
            </ul>
            {card.maxCopiesInDeck != null && <p className="text-sm text-gray-700 mt-2">Up to {card.maxCopiesInDeck} copies in a deck.</p>}
          </Section>

          <Section title={`Printings (${printings.length})`}>
            <ul className="divide-y divide-gray-200">
              {printings.map(p => {
                const current = p === card
                return (
                  <li key={cardPath(p)}>
                    <Link to={cardPath(p)} className={`flex flex-wrap gap-x-3 py-2 text-sm hover:bg-gray-50 ${current ? 'font-semibold text-forge-ink' : 'text-gray-700'}`}>
                      <span className="w-56">{sets[p.setCode]?.name ?? `Set ${p.setCode}`}</span>
                      <span className="w-16">#{p.number}{p.variant ?? ''}</span>
                      <span className="w-28">{p.rarity}</span>
                      <span className="text-gray-500">{p.promoSource ?? (p.foilTypes ?? []).filter(f => f !== 'None').join(', ')}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Section>

          {(card.clarifications?.length || card.errata?.length || card.historicData?.length) ? (
            <Section title="Rulings">
              <div className="space-y-3 text-sm text-gray-700">
                {(card.errata ?? []).map((e, i) => <p key={`e${i}`} className="whitespace-pre-line"><b>Errata.</b> {e}</p>)}
                {(card.clarifications ?? []).map((c, i) => <p key={`c${i}`} className="whitespace-pre-line">{c}</p>)}
                {(card.historicData ?? []).map((h, i) => (
                  <p key={`h${i}`} className="whitespace-pre-line text-gray-500"><b>Text until {h.usedUntil}.</b> {h.fullText}</p>
                ))}
              </div>
            </Section>
          ) : null}

          <Section title="Search">
            <div className="flex flex-wrap gap-2">
              {quickSearches.filter(([, v]) => v).map(([k, v]) => (
                <Chip key={`${k}:${v}`} q={`${k}:"${v}"`}>{k}:{v}</Chip>
              ))}
            </div>
          </Section>

          {card.externalLinks && (
            <Section title="Buy">
              <div className="flex flex-wrap gap-2">
                {card.externalLinks.tcgPlayerUrl && <Button size="sm" href={card.externalLinks.tcgPlayerUrl} target="_blank" rel="noreferrer">TCGplayer</Button>}
                {card.externalLinks.cardmarketUrl && <Button size="sm" href={card.externalLinks.cardmarketUrl} target="_blank" rel="noreferrer">Cardmarket</Button>}
                {card.externalLinks.cardTraderUrl && <Button size="sm" href={card.externalLinks.cardTraderUrl} target="_blank" rel="noreferrer">CardTrader</Button>}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}
```

Check `InkIcons`' props in `src/components/InkIcons.jsx` before using it (it takes `colors` and a `size`; match the real signature). `CostBadge` is already exported from `DecklistCardBar.jsx`.

- [ ] **Step 2: Route**

In `src/App.jsx`, import `CardPage` and add after the `/cards` route:
```jsx
        <Route path="/cards/:setCode/:number" element={<CardPage />} />
```

- [ ] **Step 3: Verify in the browser**

Per `docs/agents/ui-screenshots.md`: open `http://localhost:5173/cards/1/42` (Elsa - Spirit of Winter), wait for `text=Legality`, screenshot `docs/screenshots/cards-card.png` (`fullPage: true`); then `/cards/2/149` (Hiram Flaversham) and assert the page contains `Banned` twice; then `/cards/1/P1-1` and assert it shows `D23 Expo 2022`; then `/cards/3/4c` and assert `#4c`; then `/cards/1/99999` and assert `No card is printed as`. Stop the server in its own Bash call.

- [ ] **Step 4: Lint, test, commit**

Run: `npm run lint && npm test`
Expected: green.

```bash
git add src/pages/CardPage.jsx src/App.jsx docs/screenshots/cards-card.png
git commit -m "Card page: one printing with legality, printings and rulings"
```

---

### Task 8: Docs, PR

**Files:**
- Create: `docs/agents/cards.md`
- Modify: `CLAUDE.md` (routes table, libs table, deeper-reference table), `docs/agents/README.md` (one row)

- [ ] **Step 1: Write `docs/agents/cards.md`**

```markdown
# Card Search and card pages

Covers `src/pages/CardSearchPage.jsx`, `src/pages/CardPage.jsx`, `src/components/CardSearchSyntax.jsx`, `src/lib/cardQuery.js`, `src/lib/cardLegality.js`, `src/lib/cardPrintings.js`, and the `sets` half of `useCards`.

Design: `docs/superpowers/specs/2026-11-11-card-database-design.md` (the syntax table and the verified LorcanaJSON shapes).

## Data

Everything is computed client-side from `/api/cards` (LorcanaJSON `allCards.json`). `useCards()` returns `{ cards, sets }`; `sets[setCode]` has `name`, `type`, `releaseDate`. A card's identity is its `fullName`; printings of one name share cost, inks, stats and inkwell, and may differ in text. `cardKey(card)` in `cardIdResolver.js` is the duels.ink id (`1-42`, `1-P1-1`, `3-4c`) and `cardPath(card)` turns it into `/cards/1/42`, `/cards/1/P1-1`, `/cards/3/4c`.

## Legality (`cardLegality.js`)

Per format: `legal`, `banned` (since), `rotated` (until), `not_legal`; banned beats rotated. Coconut = Infinity status unless `FormatCoconut.bannedSinceDate` (the data carries no Coconut pool; this is the one assumption). LorcanaJSON already propagates legality by name, so a set-1 printing of a reprinted card is Core-legal.

## Query language (`cardQuery.js`)

Scryfall syntax on Lorcana fields; the table in `CardSearchSyntax.jsx` is the user-facing reference and must match `compileTerm`. Unknown keys or values throw `QuerySyntaxError`, which the page prints. `unique:cards` (default) shows one printing per name, chosen by `primaryPrinting` among the *matching* printings (so `s:1` shows the set-1 printing). Adding a key: one `case` in `compileTerm`, one row in `CardSearchSyntax.jsx`, one test.

## Not built

Prices, languages, card-name links from deck lists, per-card duels.ink stats, a list view, per-card `<title>`.
```

- [ ] **Step 2: CLAUDE.md and docs/agents/README.md**

In `CLAUDE.md`:
- Routes table, after the `/proxy` row: `| \`/cards\`, \`/cards/:setCode/:number\` | \`CardSearchPage\`, \`CardPage\` | Scryfall-style card search; one printing with legality, printings, rulings |`
- Shared libraries table, "Cards and inks" row: append `, \`cardQuery.js\` (Scryfall-style query parser and \`runQuery\`), \`cardLegality.js\` (Core/Infinity/Coconut status), \`cardPrintings.js\` (\`cardPath\`, printing groups)`.
- Deeper reference table: add `| Card Search, card pages, the query syntax | \`docs/agents/cards.md\` |`.
- Hooks line: `useCards` → "(card data and sets from `/api/cards`, IndexedDB-cached)".

In `docs/agents/README.md` add the row `| \`cards.md\` | Card Search, card pages, \`cardQuery.js\`, \`cardLegality.js\`, \`cardPrintings.js\` |`.

- [ ] **Step 3: Full check and commit**

Run: `npm run lint && npm test`
Expected: green.

```bash
git add docs/agents/cards.md CLAUDE.md docs/agents/README.md
git commit -m "Docs: Card Search and card pages"
```

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin claude/upbeat-curie-wncgen
```

Create the PR (ready for review) titled "Card Search and card pages: Scryfall for Lorcana". Body: what it adds, the syntax table link (`docs/agents/cards.md`), the two screenshots by raw GitHub URL (`https://raw.githubusercontent.com/tkwidmer/lorcana-pro-tools/claude/upbeat-curie-wncgen/docs/screenshots/cards-search.png` and `…/cards-card.png`), the Vercel preview link read from the vercel[bot] comment per the `vercel-preview-url` skill (added after the bot comments), and the Coconut-legality assumption called out for the reviewer. Then subscribe to the PR's activity.

---

## Self-review

- **Spec coverage:** routes (T6, T7), data (T1), legality rules (T2), every syntax key in the spec table (T4: text, type, keyword, colors, identity, stats, rarity, set, cn, year, format, banned, is/not, order/dir/unique; exact-name and regex in the tokenizer), card page content list (T7: image, name, inks, cost, type line, abilities, stats, flavor, artist/story, set/number/rarity/promo source, legality + max copies, printings, rulings, links, quick searches), catalog/prerender/title (T6), docs (T8).
- **Placeholders:** none; every step carries its code.
- **Type consistency:** `formatStatus`/`legality`/`FORMATS` (T2 → T4, T7); `cardPath`/`findPrinting`/`groupPrintings`/`primaryPrinting`/`setOrder` (T3 → T4, T5, T6, T7); `runQuery`/`QuerySyntaxError` (T4/T5 → T6); `useCards` returns `sets` (T1 → T6, T7).
- **Review Focus:** 1 → T4 boolean-structure tests; 2 → T4 `a missing stat never compares true`; 3 → T2 `banned beats rotated`; 4 → T3 `findPrinting`; 5 → T3 `primaryPrinting` + T5 `picks the matching printing`.
