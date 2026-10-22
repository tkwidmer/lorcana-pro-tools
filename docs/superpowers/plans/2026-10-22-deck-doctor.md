# Deck Doctor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A supporter-gated `/deck-doctor` page that puts a player's own list beside duels.ink's average build and card lift for the matching archetype, their own per-card wins-above-replacement, and their matchup record versus the field's, ending in a short verdict.

**Architecture:** All new logic is a pure, unit-tested library (`src/lib/deckDoctor.js`) over data the app already fetches: match history rows (`your_decklist` per game), the public meta feed (`profiles`, `cardLift`, `pairCardLift`, `archetypeMatchups`, `matchups`), imported gamelogs (`computeCardImpact`) and card data. One page composes it. No server changes, no new functions, no new storage beyond two localStorage preferences.

**Tech Stack:** React 19 + React Router 7 + Tailwind 4, Vitest. Existing helpers: `aggregateArchetypes`/`representativeProfile` (`metaSynthesis.js`), `computeCardImpact` (`cardImpact.js`), `shrinkWR`/`diffInterval` (`practiceSim.js`), `deckFingerprint`, `buildCardIdToCard`, `matchDeckList`/`buildCardIndex`, `deckInks`, `matchupKey`/`resolveColors`.

**Spec:** `docs/superpowers/specs/2026-10-22-deck-doctor-design.md` — read it first. Its "Data facts" section is verified against production; do not re-derive them.

## Global Constraints

- **No new file under `api/`** (Vercel function budget, CLAUDE.md).
- **No `dark:` variants, no hex colours, no `bg-black` fills.** Palette + brand tokens only.
- **Page wrapper `w-full px-6 py-8`**; `src/components/ui/*` primitives (`Button`, `Card`, `PageHeader`, `Input`/`Textarea`/`Select`, `Badge` with `tone`, `Tabs`/`Tab`) and `StatCard({ label, value, hint })`, `InkIcons({ colors })`.
- **Every read of `profiles`, `cardLift`, `pairCardLift`, `archetypeMatchups` is null-safe**; a missing field hides its section, never throws.
- **Current era only.** `fetchStats({ queue, period: 'all_time' })` is already era-scoped; never pass `era`.
- **Supporter-gated:** route wrapped in `<SupporterRoute>`, path added to `SUPPORTER_PATHS`.
- Catalog icon must exist in `TOOL_ICONS` (`siteSections.test.js` enforces).
- Commit after each task; trailer lines per the session attribution reminder; no model identifiers anywhere in the repo or PR.
- Before pushing: `npm run lint`, `npm test`, `npm run build` all green.

## Review Focus

1. **Centroid card ids absent from the card database** (a card LorcanaJSON hasn't published) — lists must render the raw id, never crash on `undefined.fullName`. Pinned in Task 4 (`nameOf` fallback) and tested in Task 2 (`diffBuild` operates on ids only).
2. **A deck whose colours have no archetype in the feed, or a 3-ink list** — `assignArchetype` returns null and `archetypeCandidates` returns `[]`; the page shows the "no archetype" path. Tested in Task 2.
3. **Mirrored `archetypeMatchups` rows** — when the player's archetype is side B, wins are `games − winsA`. Tested in Task 2.
4. **Match-history rows with `your_decklist: null` or `result: 'abandoned' | 'draw'`** — excluded from versions/matchups rather than crashing or counting as losses. Tested in Task 2.
5. **Set 14 today: `profiles: []`, `pairCardLift: null`** — the page must render sections 4 and 5 and the banner. Tested in Task 2 (verdict with null archetype) and checked manually in Task 6 against the live feed, which is in exactly this state.

---

### Task 1: `fetchAllMatchHistory` in `duelsApi.js`

**Files:**
- Modify: `src/lib/duelsApi.js` (after `fetchMatchHistory`)
- Modify: `src/pages/PracticePlanPage.jsx` (replace the inline 20-page loop)

**Interfaces:**
- Produces: `fetchAllMatchHistory({ maxPages = 20, limit = 100, source, queue } = {}) → Promise<MatchHistoryRow[]>`.

- [ ] **Step 1: Add the helper**

```js
// Every page of match history up to `maxPages` (20 × 100 ≈ 2,000 games),
// following next_cursor. PracticePlanPage and DeckDoctorPage both need the
// whole history, not a page at a time.
export async function fetchAllMatchHistory({ maxPages = 20, limit = 100, source, queue } = {}) {
  let cursor
  const all = []
  for (let i = 0; i < maxPages; i++) {
    const data = await fetchMatchHistory({ cursor, limit, source, queue })
    all.push(...(data.games ?? []))
    cursor = data.next_cursor
    if (!cursor) break
  }
  return all
}
```

- [ ] **Step 2: Use it in `PracticePlanPage.jsx`** — the effect that currently loops `for (let i = 0; i < 20; i++) { … fetchMatchHistory({ cursor, limit: 100 }) … }` becomes:

```js
      try {
        const all = await fetchAllMatchHistory()
        if (!cancelled) setGames(all)
      } catch (err) {
```

Update the import line to bring in `fetchAllMatchHistory` and drop `fetchMatchHistory` if no longer referenced there.

- [ ] **Step 3: Lint, test, commit** — `npm run lint && npx vitest run` → clean.

```bash
git add src/lib/duelsApi.js src/pages/PracticePlanPage.jsx
git commit -m "duelsApi: fetchAllMatchHistory, shared by Practice Plan"
```

---

### Task 2: Pure library `deckDoctor.js` (TDD)

**Files:**
- Create: `src/lib/deckDoctor.js`
- Create: `src/lib/__tests__/deckDoctor.test.js`

**Interfaces (produced, used verbatim by Task 4):**

```js
export const MIN_ARCHETYPE_OVERLAP = 0.5
export const MIN_MATCHUP_GAMES = 5
export function countsFromDecklist(yourDecklist)                 // [{cardId,count}] → Map<cardId, count>
export function constructedDecks(games, deckNames)              // → [{ key, deckId, name, colors: string[], queueName, games, wins, losses, latestDecklist }]
export function deckVersions(games)                              // games of ONE deck → [{ fingerprint, counts: Map, games, wins, losses, firstAt, lastAt, diffFromLatest: {onlyMine, onlyField, countDiffs} }] newest first
export function archetypeCandidates(stats, colors, myCounts)    // → [{ key, name, overlap, shared, total, profile, archetype }] sorted by overlap desc
export function assignArchetype(stats, colors, myCounts)        // best candidate or null (below MIN_ARCHETYPE_OVERLAP)
export function diffBuild(myCounts, centroidCounts)              // → { onlyMine: [{cardId, mine}], onlyField: [{cardId, field}], countDiffs: [{cardId, mine, field}] }
export function liftChecklist(liftEntries, myCounts)             // → [{ cardId, lift, presence, mine, flag }] sorted by lift desc; [] for null
export function archetypeVsColorPairs(stats, archetypeKey)      // → Map<oppPairKey, { games, wins, winRate }>
export function colorPairField(stats, myColors)                  // → Map<oppPairKey, { games, winRate }> from stats.matchups (fallback)
export function personalMatchups(games)                          // games of ONE deck → Map<oppPairKey, { games, wins, losses }>
export function matchupTable(personal, field, { minGames = MIN_MATCHUP_GAMES } = {}) // → rows joined + shrunk + significance
export function defaultQueueFor(queueName)                       // 'Infinity BO3' → 'infinity-bo3', etc.
export function deckDoctorVerdict(input)                         // → [{ type: 'text', text }]
```

`oppPairKey` is `matchupKey(colors)` from `inkColors.js` (resolved ink names sorted and joined with `+`, e.g. `ruby+sapphire`) for both personal and field sides, so they join. Note `pairCardLift` is keyed differently by duels.ink: lowercase sorted names joined with `/` (`amber/ruby`).

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import {
  MIN_ARCHETYPE_OVERLAP, countsFromDecklist, constructedDecks, deckVersions, archetypeCandidates, assignArchetype,
  diffBuild, liftChecklist, archetypeVsColorPairs, colorPairField, personalMatchups, matchupTable, defaultQueueFor,
  deckDoctorVerdict,
} from '../deckDoctor'
import { matchupKey } from '../inkColors'

const list = (pairs) => pairs.map(([cardId, count]) => ({ cardId, count }))
const game = (over = {}) => ({
  your_deck_id: 'd1', your_deck_colors: 'amber/emerald', your_decklist: list([['1-1', 4], ['1-2', 4]]),
  result: 'win', opp_deck_colors: 'ruby/sapphire', queue_id: 'q', queue_name: 'Core Set 14 BO1', started_at: '2026-10-10T10:00:00Z',
  ...over,
})
const profile = (over = {}) => ({
  id: 'p1', colors: ['amber', 'emerald'], archetypeName: 'Circle of Life', gamesPlayed: 1000, wins: 540, sampleCount: 100,
  centroidCounts: { '1-1': 4, '1-2': 4, '1-3': 2 },
  cardLift: [
    { cardId: '1-3', lift: 1.2, presence: 0.3 },
    { cardId: '1-9', lift: 0.8, presence: 0.2 },
    { cardId: '1-2', lift: -0.9, presence: 0.9 },
  ],
  ...over,
})

describe('countsFromDecklist', () => {
  it('maps ids to counts and ignores null', () => {
    expect([...countsFromDecklist(list([['1-1', 4], ['1-2', 2]]))]).toEqual([['1-1', 4], ['1-2', 2]])
    expect(countsFromDecklist(null).size).toBe(0)
  })
})

describe('constructedDecks', () => {
  it('groups by deck id, names from the map, excludes sealed and draft, counts only wins and losses', () => {
    const games = [
      game(), game({ result: 'loss' }), game({ result: 'draw' }), game({ result: 'abandoned' }),
      game({ your_deck_id: null, your_decklist: list([['2-1', 4]]), your_deck_colors: 'ruby/steel' }),
      game({ your_deck_id: 's', queue_name: 'Sealed' }), game({ your_deck_id: 'dr', queue_id: 'draft-x' }),
    ]
    const decks = constructedDecks(games, { d1: 'Max Goof' })
    expect(decks.map((d) => d.name)).toEqual(['Max Goof', 'Ruby/Steel'])
    expect(decks[0]).toMatchObject({ key: 'd1', deckId: 'd1', colors: ['amber', 'emerald'], queueName: 'Core Set 14 BO1', games: 2, wins: 1, losses: 1 })
    expect(decks[1].deckId).toBeNull()
    expect(decks[1].key).toBeTruthy()
  })
  it('skips games without a decklist', () => {
    expect(constructedDecks([game({ your_deck_id: null, your_decklist: null })], {})).toEqual([])
  })
})

describe('deckVersions', () => {
  it('groups a deck by list fingerprint, newest first, with a diff from the latest list', () => {
    const old = list([['1-1', 4], ['1-3', 4]])
    const games = [
      game({ started_at: '2026-10-12T10:00:00Z' }),
      game({ started_at: '2026-10-01T10:00:00Z', your_decklist: old, result: 'loss' }),
      game({ started_at: '2026-10-02T10:00:00Z', your_decklist: old }),
    ]
    const v = deckVersions(games)
    expect(v).toHaveLength(2)
    expect(v[0]).toMatchObject({ games: 1, wins: 1, losses: 0, firstAt: '2026-10-12T10:00:00Z' })
    expect(v[0].diffFromLatest).toEqual({ onlyMine: [], onlyField: [], countDiffs: [] })
    expect(v[1]).toMatchObject({ games: 2, wins: 1, losses: 1, firstAt: '2026-10-01T10:00:00Z', lastAt: '2026-10-02T10:00:00Z' })
    expect(v[1].diffFromLatest.onlyMine).toEqual([{ cardId: '1-3', mine: 4 }])
    expect(v[1].diffFromLatest.onlyField).toEqual([{ cardId: '1-2', field: 4 }])
  })
})

describe('archetype assignment', () => {
  const stats = { profiles: [profile(), profile({ id: 'p2', archetypeName: 'Songs', centroidCounts: { '1-1': 4, '9-9': 4 } }), profile({ id: 'p3', colors: ['ruby', 'sapphire'], archetypeName: 'Pawpsicle' })] }
  const mine = countsFromDecklist(list([['1-1', 4], ['1-2', 4], ['1-4', 2]]))
  it('ranks same-colour archetypes by overlap and picks the best', () => {
    const c = archetypeCandidates(stats, ['emerald', 'amber'], mine)
    expect(c.map((x) => x.archetype.archetypeName)).toEqual(['Circle of Life', 'Songs'])
    expect(c[0]).toMatchObject({ shared: 8, total: 10, overlap: 0.8 })
    expect(assignArchetype(stats, ['amber', 'emerald'], mine).key).toBe(c[0].key)
  })
  it('returns null below the overlap floor and with no same-colour archetype', () => {
    expect(MIN_ARCHETYPE_OVERLAP).toBe(0.5)
    expect(assignArchetype(stats, ['amber', 'emerald'], countsFromDecklist(list([['7-7', 4], ['7-8', 4]])))).toBeNull()
    expect(assignArchetype(stats, ['steel', 'sapphire'], mine)).toBeNull()
    expect(archetypeCandidates({ profiles: [] }, ['amber', 'emerald'], mine)).toEqual([])
    expect(archetypeCandidates({}, ['amber', 'emerald'], mine)).toEqual([])
  })
})

describe('diffBuild', () => {
  const mine = countsFromDecklist(list([['1-1', 4], ['1-2', 2], ['1-5', 1]]))
  it('separates only-mine, only-field and count differences', () => {
    expect(diffBuild(mine, { '1-1': 4, '1-2': 4, '1-3': 2 })).toEqual({
      onlyMine: [{ cardId: '1-5', mine: 1 }],
      onlyField: [{ cardId: '1-3', field: 2 }],
      countDiffs: [{ cardId: '1-2', mine: 2, field: 4 }],
    })
  })
  it('is empty for identical lists and tolerates a null centroid', () => {
    expect(diffBuild(mine, { '1-1': 4, '1-2': 2, '1-5': 1 })).toEqual({ onlyMine: [], onlyField: [], countDiffs: [] })
    expect(diffBuild(mine, null).onlyMine).toHaveLength(3)
  })
})

describe('liftChecklist', () => {
  const mine = countsFromDecklist(list([['1-2', 4], ['1-9', 1], ['1-7', 2]]))
  it('flags missing positive-lift and present negative-lift cards, sorted by lift', () => {
    const rows = liftChecklist([
      { cardId: '1-3', lift: 1.2, presence: 0.3 }, { cardId: '1-9', lift: 0.8, presence: 0.2 },
      { cardId: '1-2', lift: -0.9, presence: 0.9 }, { cardId: '1-7', lift: -0.1, presence: 0.5 },
    ], mine)
    expect(rows.map((r) => [r.cardId, r.mine, r.flag])).toEqual([
      ['1-3', 0, 'missing-positive'], ['1-9', 1, null], ['1-7', 2, 'present-negative'], ['1-2', 4, 'present-negative'],
    ])
  })
  it('returns [] for a null or empty list', () => {
    expect(liftChecklist(null, mine)).toEqual([])
    expect(liftChecklist(undefined, mine)).toEqual([])
  })
})

describe('archetypeVsColorPairs', () => {
  const stats = {
    profiles: [profile(), profile({ id: 'p1b' }), profile({ id: 'p3', colors: ['ruby', 'sapphire'], archetypeName: 'Pawpsicle' }), profile({ id: 'p4', colors: ['steel', 'sapphire'], archetypeName: 'Items' })],
    archetypeMatchups: [
      { archetypeIdA: 'p1', archetypeIdB: 'p3', games: 100, winsA: 60 },
      { archetypeIdA: 'p3', archetypeIdB: 'p1b', games: 50, winsA: 20 },   // mirrored: our wins = 30
      { archetypeIdA: 'p4', archetypeIdB: 'p1', games: 10, winsA: 7 },
      { archetypeIdA: 'p3', archetypeIdB: 'p4', games: 999, winsA: 1 },    // not ours
    ],
  }
  it('rolls both directions up to the opponent colour pair across all variants', () => {
    const key = assignArchetype(stats, ['amber', 'emerald'], countsFromDecklist(list([['1-1', 4], ['1-2', 4]]))).key
    const m = archetypeVsColorPairs(stats, key)
    expect(m.get(matchupKey(['ruby', 'sapphire']))).toEqual({ games: 150, wins: 90, winRate: 60 })
    expect(m.get(matchupKey(['sapphire', 'steel']))).toEqual({ games: 10, wins: 3, winRate: 30 })
    expect(m.size).toBe(2)
  })
  it('is empty without archetypeMatchups', () => {
    expect(archetypeVsColorPairs({ profiles: [profile()] }, 'x').size).toBe(0)
  })
})

describe('colorPairField', () => {
  it('reads stats.matchups in either direction', () => {
    const stats = { matchups: [
      { colorsA: ['amber', 'emerald'], colorsB: ['ruby', 'sapphire'], games: 200, winRate: 55 },
      { colorsA: ['steel', 'sapphire'], colorsB: ['amber', 'emerald'], games: 80, winRate: 40 },
    ] }
    const m = colorPairField(stats, ['amber', 'emerald'])
    expect(m.get(matchupKey(['ruby', 'sapphire']))).toEqual({ games: 200, winRate: 55 })
    expect(m.get(matchupKey(['sapphire', 'steel']))).toEqual({ games: 80, winRate: 60 })
  })
})

describe('personalMatchups', () => {
  it('counts wins and losses per opponent pair, skipping draws, abandoned and 3-ink opponents', () => {
    const m = personalMatchups([
      game(), game({ result: 'loss' }), game({ result: 'draw' }), game({ result: 'abandoned' }),
      game({ opp_deck_colors: 'amber/ruby/steel' }), game({ opp_deck_colors: null }),
    ])
    expect(m.get(matchupKey(['ruby', 'sapphire']))).toEqual({ games: 2, wins: 1, losses: 1 })
    expect(m.size).toBe(1)
  })
})

describe('matchupTable', () => {
  it('joins personal to field, shrinks toward the field rate, and marks only significant gaps', () => {
    const rs = matchupKey(['ruby', 'sapphire'])
    const ss = matchupKey(['sapphire', 'steel'])
    const personal = new Map([[rs, { games: 40, wins: 8, losses: 32 }], [ss, { games: 3, wins: 3, losses: 0 }]])
    const field = new Map([[rs, { games: 1000, wins: 550, winRate: 55 }], [ss, { games: 500, wins: 250, winRate: 50 }]])
    const rows = matchupTable(personal, field)
    expect(rows.map((r) => r.oppKey)).toEqual([rs, ss])
    expect(rows[0]).toMatchObject({ games: 40, wins: 8, losses: 32, fieldWinRate: 55, significant: true })
    expect(rows[0].shrunkWinRate).toBeCloseTo(((8 + 0.55 * 10) / 50) * 100, 5)
    expect(rows[0].gap).toBeLessThan(0)
    expect(rows[1]).toMatchObject({ games: 3, significant: false, belowMin: true })
  })
  it('keeps a personal row with no field data, with nulls', () => {
    const k = matchupKey(['amber', 'steel'])
    const [row] = matchupTable(new Map([[k, { games: 6, wins: 3, losses: 3 }]]), new Map())
    expect(row).toMatchObject({ fieldWinRate: null, gap: null, significant: false })
    expect(row.shrunkWinRate).toBe(50)
  })
})

describe('defaultQueueFor', () => {
  it('maps queue names to stats queue keys', () => {
    expect(defaultQueueFor('Core Set 14 BO1')).toBe('core-bo1')
    expect(defaultQueueFor('Core Set 14 BO3')).toBe('core-bo3')
    expect(defaultQueueFor('Infinity BO1')).toBe('infinity-bo1')
    expect(defaultQueueFor('Infinity Constructed BO3')).toBe('infinity-bo3')
    expect(defaultQueueFor(null)).toBe('core-bo1')
  })
})

describe('deckDoctorVerdict', () => {
  const nameOf = (id) => ({ '1-3': 'Rafiki', '1-2': 'Simba', '1-9': 'Nala' }[id] ?? id)
  it('names the archetype, the missing lift cards, the negative cards you run, the weakest card and the worst matchup', () => {
    const blocks = deckDoctorVerdict({
      eraName: 'Set 14',
      archetype: { name: 'Amber/Emerald Circle of Life', shared: 47, total: 60 },
      lifts: liftChecklist(profile().cardLift, countsFromDecklist(list([['1-2', 4]]))),
      impact: [{ name: 'Simba', war: -2.3, gamesWith: 14, lowSample: false }, { name: 'Nala', war: 1, gamesWith: 20, lowSample: false }],
      matchups: [{ oppColors: ['ruby', 'sapphire'], games: 23, wins: 7, shrunkWinRate: 31, fieldWinRate: 48, gap: -17, significant: true }],
    })
    const text = blocks.map((b) => b.text).join('\n')
    expect(blocks.every((b) => b.type === 'text')).toBe(true)
    expect(text).toContain('Amber/Emerald Circle of Life')
    expect(text).toContain('47 of 60')
    expect(text).toContain('Rafiki')
    expect(text).toContain('Nala')
    expect(text).toContain('Simba')
    expect(text).toContain('Ruby/Sapphire')
    expect(text).toContain('23 games')
  })
  it('omits each sentence whose input is empty and explains a missing archetype', () => {
    const blocks = deckDoctorVerdict({ eraName: 'Set 14', archetype: null, noProfiles: true, lifts: [], impact: [], matchups: [] })
    expect(blocks).toHaveLength(2)
    expect(blocks[0].text).toContain("hasn't published")
    expect(blocks[1].text).toContain('sample noise')
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/__tests__/deckDoctor.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/deckDoctor.js`**

```js
import { aggregateArchetypes, representativeProfile } from './metaSynthesis'
import { deckFingerprint } from './deckFingerprint'
import { matchupKey, resolveColors } from './inkColors'
import { shrinkWR, diffInterval } from './practiceSim'

// Pure helpers behind /deck-doctor: a player's own list (from match-history
// rows, which carry the exact decklist played in every game) against the
// field's average build and card lift for the matching duels.ink archetype,
// plus their matchup record against the field's. Design:
// docs/superpowers/specs/2026-10-22-deck-doctor-design.md. Every read of the
// undocumented meta fields (profiles, cardLift, pairCardLift,
// archetypeMatchups) is null-safe: a missing field empties a section.

export const MIN_ARCHETYPE_OVERLAP = 0.5
export const MIN_MATCHUP_GAMES = 5
const MAX_PAGE_SIZE_CARDS = 60

export function countsFromDecklist(yourDecklist) {
  const m = new Map()
  for (const { cardId, count } of yourDecklist ?? []) if (count > 0) m.set(cardId, (m.get(cardId) ?? 0) + count)
  return m
}

function isLimited(g) {
  const s = `${g.queue_id ?? ''} ${g.queue_name ?? ''}`.toLowerCase()
  return s.includes('sealed') || s.includes('draft')
}

function colorsOf(str) {
  return str ? resolveColors([str]) : []
}

function titleCase(c) {
  return c[0].toUpperCase() + c.slice(1)
}

// One entry per deck the player has used in a constructed queue, same
// grouping MatchHistoryPage uses (deck id, else list fingerprint). Draws and
// abandoned games count as games played but neither wins nor losses.
export function constructedDecks(games, deckNames = {}) {
  const byKey = new Map()
  for (const g of games) {
    if (isLimited(g) || !g.your_decklist?.length) continue
    const key = g.your_deck_id ?? deckFingerprint(g.your_decklist)
    if (!key) continue
    let d = byKey.get(key)
    if (!d) {
      const colors = colorsOf(g.your_deck_colors)
      d = {
        key, deckId: g.your_deck_id ?? null, colors,
        name: (g.your_deck_id && deckNames[g.your_deck_id]) || colors.map(titleCase).join('/') || 'Unknown deck',
        queueName: g.queue_name ?? null, games: 0, wins: 0, losses: 0, latestDecklist: g.your_decklist,
      }
      byKey.set(key, d)
    }
    if (g.result === 'win') d.wins += 1
    else if (g.result === 'loss') d.losses += 1
    if (g.result === 'win' || g.result === 'loss') d.games += 1
    if (g.started_at && (!d.latestAt || g.started_at > d.latestAt)) { d.latestAt = g.started_at; d.latestDecklist = g.your_decklist }
  }
  return [...byKey.values()].sort((a, b) => b.games - a.games)
}

export function diffBuild(myCounts, centroidCounts) {
  const field = new Map(Object.entries(centroidCounts ?? {}))
  const onlyMine = [], onlyField = [], countDiffs = []
  for (const [cardId, mine] of myCounts) {
    const f = field.get(cardId)
    if (f == null) onlyMine.push({ cardId, mine })
    else if (f !== mine) countDiffs.push({ cardId, mine, field: f })
  }
  for (const [cardId, f] of field) if (!myCounts.has(cardId)) onlyField.push({ cardId, field: f })
  const byCount = (k) => (a, b) => b[k] - a[k] || a.cardId.localeCompare(b.cardId)
  onlyMine.sort(byCount('mine')); onlyField.sort(byCount('field'))
  countDiffs.sort((a, b) => Math.abs(b.field - b.mine) - Math.abs(a.field - a.mine) || a.cardId.localeCompare(b.cardId))
  return { onlyMine, onlyField, countDiffs }
}

// Versions of one deck: its games grouped by the exact list played, newest
// first, each diffed against the latest list (so "4-2 on the version before
// I cut X" is visible). Draws/abandoned count toward games only.
export function deckVersions(games) {
  const byFp = new Map()
  for (const g of games) {
    if (!g.your_decklist?.length) continue
    const fp = deckFingerprint(g.your_decklist)
    let v = byFp.get(fp)
    if (!v) { v = { fingerprint: fp, counts: countsFromDecklist(g.your_decklist), games: 0, wins: 0, losses: 0, firstAt: g.started_at, lastAt: g.started_at }; byFp.set(fp, v) }
    v.games += 1
    if (g.result === 'win') v.wins += 1
    else if (g.result === 'loss') v.losses += 1
    if (g.started_at < v.firstAt) v.firstAt = g.started_at
    if (g.started_at > v.lastAt) v.lastAt = g.started_at
  }
  const versions = [...byFp.values()].sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))
  const latest = versions[0]?.counts ?? new Map()
  return versions.map((v) => ({ ...v, diffFromLatest: diffBuild(v.counts, Object.fromEntries(latest)) }))
}

function sameColors(a, b) {
  const x = [...a].sort().join('/'), y = [...b].sort().join('/')
  return x === y
}

// Same-colour archetypes ranked by how much of the list matches the
// representative variant's average build: shared = Σ min(mine, centroid),
// overlap = shared / the larger of the two deck sizes.
export function archetypeCandidates(stats, colors, myCounts) {
  if (!stats?.profiles?.length || !colors?.length) return []
  const mineTotal = [...myCounts.values()].reduce((s, n) => s + n, 0)
  return aggregateArchetypes(stats.profiles)
    .filter((a) => sameColors(a.colors, colors))
    .map((archetype) => {
      const profile = representativeProfile(stats, archetype.key)
      const centroid = profile?.centroidCounts ?? {}
      let shared = 0, centroidTotal = 0
      for (const [cardId, n] of Object.entries(centroid)) { centroidTotal += n; shared += Math.min(n, myCounts.get(cardId) ?? 0) }
      const total = Math.max(mineTotal, centroidTotal, 1)
      return { key: archetype.key, name: archetype.name, overlap: shared / total, shared, total, profile, archetype }
    })
    .sort((a, b) => b.overlap - a.overlap)
}

export function assignArchetype(stats, colors, myCounts) {
  const best = archetypeCandidates(stats, colors, myCounts)[0]
  return best && best.overlap >= MIN_ARCHETYPE_OVERLAP ? best : null
}

export function liftChecklist(liftEntries, myCounts) {
  return (liftEntries ?? [])
    .map((e) => {
      const mine = myCounts.get(e.cardId) ?? 0
      const flag = e.lift > 0 && mine === 0 ? 'missing-positive' : e.lift < 0 && mine > 0 ? 'present-negative' : null
      return { cardId: e.cardId, lift: e.lift, presence: e.presence ?? null, mine, flag }
    })
    .sort((a, b) => b.lift - a.lift)
}

function pct(wins, games) {
  return games > 0 ? Math.round((wins / games) * 10000) / 100 : null
}

// The field's record for one archetype against each opponent colour pair,
// rolled up from duels.ink's profile-id-keyed archetypeMatchups across every
// variant of the archetype, both directions (as side B, wins = games − winsA).
export function archetypeVsColorPairs(stats, archetypeKey) {
  const out = new Map()
  if (!stats?.profiles?.length || !stats.archetypeMatchups?.length) return out
  const archetype = aggregateArchetypes(stats.profiles).find((a) => a.key === archetypeKey)
  if (!archetype) return out
  const mine = new Set(archetype.ids)
  const colorsById = new Map(stats.profiles.map((p) => [p.id, p.colors]))
  const add = (oppId, games, wins) => {
    const colors = colorsById.get(oppId)
    if (!colors) return
    const k = matchupKey(colors)
    const cur = out.get(k) ?? { games: 0, wins: 0 }
    out.set(k, { games: cur.games + games, wins: cur.wins + wins })
  }
  for (const m of stats.archetypeMatchups) {
    if (mine.has(m.archetypeIdA) && !mine.has(m.archetypeIdB)) add(m.archetypeIdB, m.games, m.winsA)
    else if (mine.has(m.archetypeIdB) && !mine.has(m.archetypeIdA)) add(m.archetypeIdA, m.games, m.games - m.winsA)
  }
  for (const [k, v] of out) out.set(k, { ...v, winRate: pct(v.wins, v.games) })
  return out
}

// Fallback field: colour pair vs colour pair from stats.matchups (what
// Practice Plan uses), when no archetype is assigned.
export function colorPairField(stats, myColors) {
  const out = new Map()
  const myKey = matchupKey(myColors ?? [])
  for (const m of stats?.matchups ?? []) {
    const a = matchupKey(m.colorsA), b = matchupKey(m.colorsB)
    if (a === myKey) out.set(b, { games: m.games, winRate: m.winRate })
    else if (b === myKey) out.set(a, { games: m.games, winRate: m.winRate == null ? null : Math.round((100 - m.winRate) * 100) / 100 })
  }
  return out
}

export function personalMatchups(games) {
  const out = new Map()
  for (const g of games) {
    if (g.result !== 'win' && g.result !== 'loss') continue
    const opp = colorsOf(g.opp_deck_colors)
    if (opp.length !== 2) continue
    const k = matchupKey(opp)
    const cur = out.get(k) ?? { games: 0, wins: 0, losses: 0 }
    cur.games += 1
    if (g.result === 'win') cur.wins += 1; else cur.losses += 1
    out.set(k, cur)
  }
  return out
}

// One row per opponent pair the player has faced: record, win rate shrunk
// toward the field's (practiceSim.shrinkWR), the field's rate, and whether
// the gap is beyond sample noise (Newcombe interval excludes zero).
export function matchupTable(personal, field, { minGames = MIN_MATCHUP_GAMES } = {}) {
  const rows = []
  for (const [oppKey, p] of personal) {
    const f = field.get(oppKey) ?? null
    const fieldWinRate = f?.winRate ?? null
    const shrunkWinRate = shrinkWR(p.wins, p.games, fieldWinRate) * 100
    let gap = null, significant = false
    if (fieldWinRate != null && f.games > 0) {
      gap = (p.wins / p.games) * 100 - fieldWinRate
      const fieldWins = f.wins ?? Math.round((fieldWinRate / 100) * f.games)
      const [lo, hi] = diffInterval(p.wins, p.games, fieldWins, f.games)
      significant = p.games >= minGames && (hi < 0 || lo > 0)
    }
    rows.push({ oppKey, oppColors: oppKey.split('+'), games: p.games, wins: p.wins, losses: p.losses, shrunkWinRate, fieldWinRate, fieldGames: f?.games ?? null, gap, significant, belowMin: p.games < minGames })
  }
  return rows.sort((a, b) => b.games - a.games)
}

export function defaultQueueFor(queueName) {
  const s = (queueName ?? '').toLowerCase()
  const format = s.includes('infinity') ? 'infinity' : 'core'
  const mode = s.includes('bo3') ? 'bo3' : 'bo1'
  return `${format}-${mode}`
}

const text = (t) => ({ type: 'text', text: t })
const fmtPp = (n) => `${n > 0 ? '+' : ''}${n.toFixed(1)} pp`
const fmtPct = (n) => `${Math.round(n)}%`
const pairLabel = (colors) => colors.map(titleCase).join('/')

// The verdict: three to five sentences, every optional one omitted when its
// input is empty. `nameOf` resolves a duels.ink card id to a display name.
export function deckDoctorVerdict({ eraName, archetype, noProfiles = false, lifts = [], impact = [], matchups = [], nameOf = (id) => id }) {
  const blocks = []
  if (archetype) blocks.push(text(`Your list is ${archetype.name}: ${archetype.shared} of ${archetype.total} cards match the field's average build.`))
  else if (noProfiles) blocks.push(text(`duels.ink hasn't published ${eraName ?? 'this set'}'s archetype builds yet, so there is no field build to compare against. Your own results below still apply.`))
  else blocks.push(text(`Your list doesn't match any ${eraName ?? 'current'} archetype closely, so the comparison uses the field for your colours instead.`))

  const missing = lifts.filter((l) => l.flag === 'missing-positive')
  if (missing.length) blocks.push(text(`You're missing ${missing.length} of the field's win-rate-lift cards: ${missing.slice(0, 4).map((l) => `${nameOf(l.cardId)} (${fmtPp(l.lift)}${l.presence != null ? `, in ${fmtPct(l.presence * 100)} of lists` : ''})`).join(', ')}.`))
  const negative = lifts.filter((l) => l.flag === 'present-negative')
  if (negative.length) blocks.push(text(`You run ${negative.length} card${negative.length === 1 ? '' : 's'} that correlate${negative.length === 1 ? 's' : ''} with losing in this field: ${negative.slice(0, 4).map((l) => `${nameOf(l.cardId)} (${fmtPp(l.lift)})`).join(', ')}.`))

  const weakest = impact.filter((c) => c.war != null && !c.lowSample).sort((a, b) => a.war - b.war)[0]
  if (weakest && weakest.war < 0) blocks.push(text(`Over your own games, ${weakest.name} is your weakest card by wins above replacement (${weakest.war.toFixed(1)} WAR across ${weakest.gamesWith} games with it).`))

  const worst = matchups.filter((m) => m.significant && m.gap < 0).sort((a, b) => a.gap - b.gap)[0]
  if (worst) blocks.push(text(`Your worst matchup relative to the field: vs ${pairLabel(worst.oppColors)}, ${fmtPct(worst.shrunkWinRate)} over ${worst.games} games where the field wins ${fmtPct(worst.fieldWinRate)}.`))
  else blocks.push(text('No matchup where your results differ from the field’s beyond sample noise.'))
  return blocks
}
```

Remove the unused `MAX_PAGE_SIZE_CARDS` constant before committing (lint will flag it). If `matchupKey` does not return a `/`-joined sorted string, read `inkColors.js` and adapt `oppColors: oppKey.split('+')` to however it joins.

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/__tests__/deckDoctor.test.js` → PASS. Fix the implementation, not the tests, except where a test encodes a wrong assumption about an existing helper's output format (then fix the test to the helper's real format and say so in the commit body).

- [ ] **Step 5: Commit**

```bash
git add src/lib/deckDoctor.js src/lib/__tests__/deckDoctor.test.js
git commit -m "Add deckDoctor helpers: archetype assignment, build diff, lift checklist, matchups vs field, verdict"
```

---

### Task 3: Route, gating, catalog, icon, titles

**Files:**
- Modify: `src/lib/access.js` (add `/deck-doctor`), `src/lib/__tests__/access.test.js` (assert it)
- Modify: `src/lib/siteSections.js` (Coaching Tools entry after Practice Plan), `src/lib/toolIcons.js` (`stethoscope`)
- Modify: `src/lib/routeTitle.js` (`TITLES['/deck-doctor'] = 'Deck Doctor'`), `src/lib/__tests__/routeTitle.test.js`
- Modify: `src/App.jsx` (route, wrapped in `SupporterRoute`; page file created in Task 4, so add the import then and keep this task's commit green by creating a stub page first)

- [ ] **Step 1: Catalog entry and icon**

```js
      {
        path: '/deck-doctor',
        name: 'Deck Doctor',
        icon: 'stethoscope',
        description: 'Your list beside the field\'s average build for your archetype, the cards that lift or sink its win rate, your own card performance, and where your matchups lag the field.',
      },
```

```js
  stethoscope: ['M6 3v6a5 5 0 0 0 10 0V3', 'M11 14v2a4 4 0 0 0 8 0v-3', 'M19 10a2 2 0 1 0 0 .01', 'M4 3h2', 'M16 3h2'],
```

- [ ] **Step 2: Gating and titles** — add `'/deck-doctor'` to `SUPPORTER_PATHS`; add `expect(isSupporterPath('/deck-doctor')).toBe(true)` to the access test's known-paths case; `TITLES['/deck-doctor'] = 'Deck Doctor'`; a `routeTitle('/deck-doctor')` assertion in `routeTitle.test.js`.

- [ ] **Step 3: Stub page and route** — create `src/pages/DeckDoctorPage.jsx` exporting `DeckDoctorPage` that renders `<div className="w-full px-6 py-8"><PageHeader title="Deck Doctor" /></div>`; in `App.jsx` import it and add, next to `/practice-plan`:

```jsx
        <Route path="/deck-doctor" element={<SupporterRoute><DeckDoctorPage /></SupporterRoute>} />
```

- [ ] **Step 4: Lint, test, commit**

```bash
git add src/lib/access.js src/lib/__tests__/access.test.js src/lib/siteSections.js src/lib/toolIcons.js src/lib/routeTitle.js src/lib/__tests__/routeTitle.test.js src/pages/DeckDoctorPage.jsx src/App.jsx
git commit -m "Register /deck-doctor: supporter-gated route, catalog entry, title"
```

---

### Task 4: `DeckDoctorPage.jsx`

**Files:**
- Modify: `src/pages/DeckDoctorPage.jsx` (replace the stub)
- Create: `src/components/deckDoctor/BuildDiff.jsx`, `src/components/deckDoctor/LiftChecklist.jsx`, `src/components/deckDoctor/MatchupsVsField.jsx`, `src/components/deckDoctor/YourCards.jsx` (one section each, so the page stays a composer)

**Interfaces:**
- Consumes everything from Task 2 verbatim; `fetchAllMatchHistory` (Task 1); `fetchStats`, `fetchPersonalStats`, `getToken` (`duelsApi.js`); `getAllGamelogs` (`gamelogHistory.js`); `computeCardImpact` (`cardImpact.js`); `useCards`; `buildCardIdToCard` (`cardIdResolver.js`); `buildCardIndex` (`cardAnalysis.js`); `matchDeckList` (`decklistShared.js`); `deckInks` (`streamOverlay.js`); `DeckListCard` (entries `{ key, name, count, card }`); `InkIcons`; `StatCard`; `winrateTextColor`/`deltaColor` (`statColors.js`).

- [ ] **Step 1: Page state and data loading**

```jsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getToken, fetchAllMatchHistory, fetchStats, fetchPersonalStats } from '../lib/duelsApi'
import { getAllGamelogs } from '../lib/gamelogHistory'
import { computeCardImpact } from '../lib/cardImpact'
import { useCards } from '../hooks/useCards'
import { buildCardIdToCard } from '../lib/cardIdResolver'
import { buildCardIndex } from '../lib/cardAnalysis'
import { matchDeckList } from '../lib/decklistShared'
import { deckInks } from '../lib/streamOverlay'
import {
  countsFromDecklist, constructedDecks, deckVersions, archetypeCandidates, assignArchetype, diffBuild, liftChecklist,
  archetypeVsColorPairs, colorPairField, personalMatchups, matchupTable, defaultQueueFor, deckDoctorVerdict, MIN_ARCHETYPE_OVERLAP,
} from '../lib/deckDoctor'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Select, Textarea } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { DeckListCard } from '../components/DeckListCard'
import { BuildDiff } from '../components/deckDoctor/BuildDiff'
import { LiftChecklist } from '../components/deckDoctor/LiftChecklist'
import { MatchupsVsField } from '../components/deckDoctor/MatchupsVsField'
import { YourCards } from '../components/deckDoctor/YourCards'

const QUEUES = [
  { id: 'core-bo1', name: 'Core BO1' }, { id: 'core-bo3', name: 'Core BO3' },
  { id: 'infinity-bo1', name: 'Infinity BO1' }, { id: 'infinity-bo3', name: 'Infinity BO3' },
]
const PREFS_KEY = 'lorcana_deck_doctor'
const DECK_NAMES_KEY = 'lorcana_deck_names'

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
```

State: `queue` (from prefs, else null until a deck is chosen), `deckKey` (prefs), `pasted` (string), `mode` (`'deck' | 'paste'`), `games`/`gamesError`, `stats`/`statsError`, `gamelogs`, `deckVersionsByDeckId`, `archetypeOverride` (key or null, reset when the deck changes). Loading: on mount, if `getToken()` → `fetchAllMatchHistory()` and `getAllGamelogs()`; on `queue` change → `fetchStats({ queue, period: 'all_time' })`; on selected deck with a real `deckId` → `fetchPersonalStats({ deckId })` once, cached. Follow the `key={…}`/derived-state pattern the Results pages used rather than `setState` inside effects where lint objects (`react-hooks/set-state-in-effect`).

- [ ] **Step 2: Derived data (all `useMemo`)**

```jsx
const cardById = useMemo(() => buildCardIdToCard(cards), [cards])
const nameOf = (id) => cardById[id]?.fullName ?? cardById[id]?.name ?? id
const cardIndex = useMemo(() => buildCardIndex(cards ?? []), [cards])
const idOfCard = (card) => `${card.setCode}-${card.number}`

const decks = useMemo(() => constructedDecks(games, readJson(DECK_NAMES_KEY, {})), [games])
const deck = decks.find((d) => d.key === deckKey) ?? decks[0] ?? null
const deckGames = useMemo(() => deck ? games.filter((g) => (g.your_deck_id ?? deckFingerprint(g.your_decklist)) === deck.key) : [], [games, deck])

// Paste mode: match lines to cards, derive ids and colours.
const pastedEntries = useMemo(() => mode === 'paste' ? matchDeckList(pasted, cardIndex) : [], [mode, pasted, cardIndex])
const myCounts = useMemo(() => mode === 'paste'
  ? new Map(pastedEntries.map((e) => [idOfCard(e.card), e.count]))
  : countsFromDecklist(deck?.latestDecklist), [mode, pastedEntries, deck])
const myColors = mode === 'paste' ? deckInks(pastedEntries).slice(0, 2) : (deck?.colors ?? [])

const effectiveQueue = queue ?? defaultQueueFor(deck?.queueName)
const noProfiles = !!stats && !(stats.profiles?.length)
const candidates = useMemo(() => archetypeCandidates(stats, myColors, myCounts), [stats, myColors, myCounts])
const auto = assignArchetype(stats, myColors, myCounts)
const archetype = (archetypeOverride && candidates.find((c) => c.key === archetypeOverride)) || auto
const centroid = archetype?.profile?.centroidCounts ?? null
const diff = useMemo(() => centroid ? diffBuild(myCounts, centroid) : null, [myCounts, centroid])
const archetypeLifts = useMemo(() => liftChecklist(archetype?.profile?.cardLift, myCounts), [archetype, myCounts])
const pairLifts = useMemo(() => liftChecklist(stats?.pairCardLift?.[[...myColors].sort().join('/')], myCounts), [stats, myColors, myCounts])
const versions = useMemo(() => deckVersions(deckGames), [deckGames])
const field = useMemo(() => archetype ? archetypeVsColorPairs(stats, archetype.key) : colorPairField(stats, myColors), [stats, archetype, myColors])
const matchups = useMemo(() => matchupTable(personalMatchups(deckGames), field), [deckGames, field])
const deckGamelogs = useMemo(() => deck?.deckId ? gamelogs.filter((g) => g.deck_id === deck.deckId) : [], [gamelogs, deck])
const impact = useMemo(() => deckGamelogs.length ? computeCardImpact(deckGamelogs, { deckVersions: deck?.deckId ? deckVersionsByDeckId[deck.deckId] : null }).results : [], [deckGamelogs, deck, deckVersionsByDeckId])
const verdict = useMemo(() => deckDoctorVerdict({ eraName: stats?.meta?.eras?.currentEra?.name, archetype, noProfiles, lifts: [...archetypeLifts, ...pairLifts], impact, matchups, nameOf }), [...])
```

`pairCardLift` keys are lowercase sorted `'amber/ruby'`; `myColors` from `resolveColors` are lowercase ink names, so sorting and joining with `/` matches (this is a different separator from `matchupKey`'s `+`).

- [ ] **Step 3: Render**

Order: `PageHeader` (title "Deck Doctor", description "Your list against the field's build, lift cards, your own card performance, and your matchups versus the field."). Controls row in a `Card`: `Select` queue (label shows `stats.meta.queue.name` when loaded), `Select` deck (`${d.name} · ${d.queueName ?? ''} · ${d.wins}-${d.losses}`), and a "Paste a list instead" `Button variant="quiet"` toggling `mode`; in paste mode a `Textarea` (8 rows, placeholder `4 Card Name`) replaces the deck select. Gate states as the spec's table: no token → `Card` with a link to `/settings`; token but no decks → the "No ranked games…" line plus the paste toggle; `noProfiles` → an amber-tinted banner (`bg-amber-50 text-amber-800 border-amber-200`) "duels.ink hasn't published {era} archetype builds yet; the build comparison appears when it does."

Then the sections, each a `Card` with a `title`, in the spec's order:

1. **Verdict** — `verdict.map((b, i) => <p key={i} className="text-gray-900">{b.text}</p>)`.
2. **Your list vs the field's build** — hidden when `noProfiles`. Archetype picker (`Select` over `candidates`, option text `${c.name} · ${Math.round(c.overlap * 100)}% match`, value `c.key`, plus a "No archetype" option when `auto` is null) above two `DeckListCard`s in `grid md:grid-cols-2 gap-4`: yours (`entries` built from `myCounts` → `{ key: id, name: nameOf(id), count, card: cardById[id] ?? null }`) and the field's (same from `centroid`; subtitle "duels.ink's average build for the most-played variant · {profile.sampleCount} decks · {profile.gamesPlayed} games"). Beneath: `<BuildDiff diff={diff} lifts={archetypeLifts} nameOf={nameOf} />`. Under that a compact **Versions** strip (deck mode only): one row per version, `formatted date range · W-L · "+A −B" summary of diffFromLatest`, the latest labelled "current".
3. **Lift checklist** — hidden when both lists are empty: `<LiftChecklist title="In your archetype" rows={archetypeLifts} nameOf={nameOf} />` and `<LiftChecklist title={`In ${pairLabel}`} rows={pairLifts} nameOf={nameOf} />`.
4. **Your cards** — deck mode only: `<YourCards impact={impact} lifts={[...archetypeLifts, ...pairLifts]} hasGamelogs={deckGamelogs.length > 0} />`; without gamelogs it renders the import prompt linking to `/analytics`.
5. **Matchups vs the field** — deck mode only: `<MatchupsVsField rows={matchups} fieldLabel={archetype ? `${archetype.name} (field)` : `${pairLabel} (field, by colour pair)`} />`.

Footnote: "Field data from duels.ink's public meta stats for {queue name}, current set only. Lift is the card's win rate minus its archetype's, in percentage points."

- [ ] **Step 4: Section components**

`BuildDiff.jsx` — three columns (`grid md:grid-cols-3 gap-4`): "Only in your list" (`×{mine}`), "Count differs" (`you {mine} · field {field}`), "Only in the field's build" (`×{field}`, with "in {presence}% of lists" when the id appears in `lifts`). Each card row: `nameOf(cardId)`, and a small lift pill when found in `lifts` (`+0.8 pp` coloured by `deltaColor`). Empty column → "Nothing here." in `text-gray-400`.

`LiftChecklist.jsx` — table: Card · Lift (`deltaColor`, `+x.x pp`) · In lists (`presence` as %) · In your list (`✓ ×n` or `✗`). Row background `bg-forge-soft` for `missing-positive`, `bg-red-50` for `present-negative`. Props `{ title, rows, nameOf }`; renders nothing when `rows.length === 0`.

`YourCards.jsx` — two small tables from `impact` (which `computeCardImpact` already sorts by WAR desc): "Pulling their weight" = top 5 with `war > 0`, "Underperforming" = bottom 8 with `war < 0`, columns Card · WAR · Win% with · Win% without · Games with, `lowSample` rows in `text-gray-400`, plus a "Field lift" column from `lifts` when the card's id matches (`impact` rows carry `name`; match through `nameOf` of the lift's cardId). Without gamelogs: `<p>` "Import this deck's gamelogs in <Link to="/analytics">Analytics</Link> to see which of your cards win games." Props `{ impact, lifts, hasGamelogs, nameOf }`.

`MatchupsVsField.jsx` — table: Opponent (`<InkIcons colors={row.oppColors} size={18} />`) · Games · Record · Your win rate (shrunk; `winrateTextColor`) · {fieldLabel} · Gap (`deltaColor`, `±x.x pp`, with a forge `Badge` "beyond noise" when `significant`); rows with `belowMin` greyed and the header noting "fewer than 5 games greyed". Empty → "No ranked games with this deck yet."

- [ ] **Step 5: Lint, test, run** — `npm run lint && npx vitest run`; then `npm run dev`, open `/deck-doctor` signed in as admin if the dev session has one, else confirm the gate card renders and the page never hits the error boundary.

- [ ] **Step 6: Commit**

```bash
git add src/pages/DeckDoctorPage.jsx src/components/deckDoctor
git commit -m "Deck Doctor page: verdict, build diff, lift checklist, your cards, matchups vs the field"
```

---

### Task 5: CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` — routes table row; `deckDoctor.js` in Shared Libraries; `components/deckDoctor/*` in Components; add `/deck-doctor` to the supporter-gated list; a new "### Deck Doctor" section after "Meta Synthesis" that states: data sources (match-history `your_decklist` per game, `profiles`/`cardLift`/`pairCardLift`/`archetypeMatchups`, gamelogs for WAR), the archetype assignment rule and 50% floor, that `pairCardLift` is a per-colour-pair lift list the feed carries, the current-era-only rule, the no-profiles degraded state (verified empty for Set 14 on 2026-10-22), and that `fetchAllMatchHistory` is shared with Practice Plan. Also note the `?endpoint=stats` row: add `pairCardLift` to the undocumented fields list.

- [ ] **Step 1: Edit, commit**

```bash
git add CLAUDE.md
git commit -m "Document Deck Doctor"
```

---

### Task 6: Verify, push, update the PR

- [ ] **Step 1:** `npm run lint && npm test && npm run build` (set `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1223/chrome-linux64/chrome` for the prerender step; revert `public/lorcana-extension.zip` if the build rewrote it).
- [ ] **Step 2:** `git push -u origin claude/zealous-faraday-k6h5cw` (no force; retry on network errors only).
- [ ] **Step 3:** The branch already has an open PR, [tkwidmer/lorcana-pro-tools#284](https://github.com/tkwidmer/lorcana-pro-tools/pull/284), opened for the design spec. Do **not** open a new PR. Update that PR with `mcp__github__update_pull_request`: title "Deck Doctor: your list versus the field", body describing what/why, endpoints used, the degraded Set 14 state, the verification done, and the Vercel preview link per the `vercel-preview-url` skill. If the preview is SSO-gated, say so and skip screenshots rather than guess.
- [ ] **Step 4:** Live check with the owner's duels.ink token is not possible from the sandbox; in the PR body list exactly what the owner should click: `/deck-doctor` with their most-played Core deck (today: banner + sections 4 and 5), the Infinity queue if it has profiles, and paste mode with a Stock Deck list.
