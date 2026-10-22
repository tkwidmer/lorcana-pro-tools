# Public Tournament Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the admin-imported Tournament History archive as three public pages — an event list, an event's standings + bracket, and a player's cross-event record — with zero new Vercel functions.

**Architecture:** Four new public `?endpoint=` reads are added to the existing `api/tournament-history.ts` dispatcher (and three existing reads lose their session requirement in favour of edge caching). A pure client library (`src/lib/resultsArchive.js`) derives outcomes, summaries and the bracket's render shape so the server stays a thin data layer. Three new pages reuse the design-system primitives and the existing `EliminationBracket` component.

**Tech Stack:** React 19 + React Router 7 + Tailwind 4 (client), Vercel serverless TS + Supabase service-role client (server), Vitest (unit tests).

**Spec:** `docs/superpowers/specs/2026-10-22-public-tournament-results-design.md` — read it first; it holds the verified data facts and the response shapes.

## Global Constraints

- **No new file under `api/`.** Vercel Hobby caps a deployment at 12 functions; this feature must add zero (see CLAUDE.md "Function budget").
- **No `dark:` Tailwind variants, no hex colours, no `bg-black` fills** (CLAUDE.md "Dark Mode"). Use palette + brand tokens (`bg-white`, `bg-gray-50`, `text-gray-500`, `text-forge-ink`, `Badge variant="forge"`).
- **Page wrapper is `w-full px-6 py-8`**, no `max-w-* mx-auto` on the primary content (CLAUDE.md "Pages → Shared Libs → Storage").
- **Use `src/components/ui/*`** (`Button`, `Card`, `PageHeader`, `Input`, `Tabs`/`Tab`, `Badge`) and `StatCard` rather than hand-rolled class strings.
- **Public reads never send an `Authorization` header.** Session/admin reads keep `apiFetch`.
- **Public responses set `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`** (`search-players`: `s-maxage=60`).
- **Route ids are RPH ids**: `:eventId` = `rph_event_id`, `:playerId` = `rph_player_id`, always strings.
- New catalog tool needs an icon present in `TOOL_ICONS` (`siteSections.test.js` enforces it).
- Commit after every task. No model identifiers in commits or the PR. Commit trailer lines per the session's attribution reminder.
- Before pushing: `npm run lint`, `npm test`, `npm run build` all green.

## Review Focus

1. **A player with no standings rows but matches (or vice versa)** — `player` must 404 only when there are no standings rows; `playerSummary` must not throw on `events: []` or `matches: []`. Test added in Task 3 (`playerSummary` with empty inputs).
2. **A bye in the bracket or in a player's matches** — `toBracketMatch` must emit one relationship and `match_is_bye: true`; `matchOutcome` returns `'bye'` with `opponent: null`, and byes never count in `record` or `rivals`. Tests in Task 3.
3. **An event larger than 1,000 players** — `getEventStandings` must page `.range()` until a short page; a 2,052-row event must return 2,052 standings. Covered by the `fetchAllRanges` unit-free design (loop until `rows.length < PAGE`), verified manually against DLC Richmond (`rph_event_id` of the 2,052-player event) in Task 7.
4. **Date-only strings west of Greenwich** — `formatEventDate('2026-01-10')` must render 10 Jan in any TZ. Test in Task 3 pins it by comparing against the manually constructed local date.
5. **Unknown event or player id** — API returns 404 JSON; pages render a "not found" card with a link back, not the error boundary. Tasks 2 and 5.

---

### Task 1: Event date fix (migration + import)

**Files:**
- Create: `supabase/migrations/018_tournament_history_event_date.sql`
- Modify: `api/_lib/tournamentImport.ts` (add `eventDateOf`, `eliminationPhaseName`)
- Modify: `api/tournament-history.ts:~85` (`eventDate:` in `handleImport`)

**Interfaces:**
- Produces: `eventDateOf(eventDetails: any): string | null` (YYYY-MM-DD local to the event's timezone), `eliminationPhaseName(eventDetails: any): string | null`.

- [ ] **Step 1: Write the migration**

```sql
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Backfill event_date from the stored RPH payload. The import read
-- `start_date` / `event_date`, which RPH never sends (its field is
-- `start_datetime`, plus a `timezone`), so every event imported before this
-- migration has NULL here — and every "newest first" sort over the archive
-- was a no-op. raw_event_details holds the original payload, so this is a
-- pure derivation. Idempotent: only touches NULL rows.
UPDATE public.tournament_history_events
SET event_date = ((raw_event_details->>'start_datetime')::timestamptz
                  AT TIME ZONE COALESCE(NULLIF(raw_event_details->>'timezone', ''), 'UTC'))::date
WHERE event_date IS NULL
  AND raw_event_details->>'start_datetime' IS NOT NULL;

-- The public event page reads one event's elimination-phase matches.
CREATE INDEX IF NOT EXISTS tournament_history_matches_event_idx
  ON public.tournament_history_matches (event_id, phase_name);
```

- [ ] **Step 2: Add the two helpers to `api/_lib/tournamentImport.ts`** (after `deriveTournamentStructure`)

```ts
// RPH's elimination phase, by the same rule getTournamentStructure() uses
// client-side (src/lib/tournamentApi.js). Swiss phase names vary wildly
// across organizers ("Phase 1", "Day 1 Swiss", ""), so the bracket is
// identified by round_type, never by name.
export function eliminationPhaseName(eventDetails: any): string | null {
  const phase = (eventDetails?.tournament_phases ?? []).find(
    (p: any) => p.round_type === 'RANKED_SINGLE_ELIMINATION'
  )
  return phase?.phase_name ?? null
}

// Calendar date of the event where it was played: RPH gives start_datetime
// with an offset plus an IANA timezone. Formatting in that zone (en-CA gives
// YYYY-MM-DD) avoids a late-evening US event landing on the next UTC day.
// Falls back to the UTC date when the timezone is missing or unknown.
export function eventDateOf(eventDetails: any): string | null {
  const start = eventDetails?.start_datetime
  if (!start) return null
  const date = new Date(start)
  if (Number.isNaN(date.getTime())) return null
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: eventDetails?.timezone || 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}
```

- [ ] **Step 3: Use it in `handleImport`** — replace `eventDate: eventDetails?.start_date ?? eventDetails?.event_date ?? null,` with `eventDate: eventDateOf(eventDetails),` and add `eventDateOf` to the import list at the top of `api/tournament-history.ts`.

- [ ] **Step 4: Apply the migration to the live project** with the Supabase MCP `apply_migration` tool (`project_id: nnuqpxygtivrvvsnpzaz`, name `018_tournament_history_event_date`, the SQL above). Then `execute_sql`: `select count(*) filter (where event_date is null) as still_null, min(event_date), max(event_date) from tournament_history_events` — expect `still_null = 0`.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit -p . 2>/dev/null || npx tsc --noEmit api/tournament-history.ts api/_lib/tournamentImport.ts --esModuleInterop --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck` (whichever the repo's existing TS setup supports; `npm run build` in Task 7 is the real gate).

```bash
git add supabase/migrations/018_tournament_history_event_date.sql api/_lib/tournamentImport.ts api/tournament-history.ts
git commit -m "Tournament history: derive event_date from RPH start_datetime, backfill archive"
```

---

### Task 2: Public read endpoints

**Files:**
- Modify: `api/_lib/tournamentHistorySupabase.ts` (new query helpers)
- Modify: `api/tournament-history.ts` (new handlers, auth changes, cache headers)

**Interfaces:**
- Consumes: `eliminationPhaseName`, from Task 1.
- Produces (HTTP): `events`, `event`, `event-player`, `player` as specified in the spec's "Response shapes"; `player-history`, `head-to-head`, `search-players` now public.

- [ ] **Step 1: Add query helpers to `tournamentHistorySupabase.ts`**

```ts
const PAGE = 1000 // PostgREST's default max-rows; .range() pages past it.

// Pages a query in PAGE-row ranges until a short page comes back. `build`
// must return a fresh query each call (a PostgREST builder is single-use).
async function fetchAllRanges<T>(build: () => any): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE) return rows
  }
}

const EVENT_COLUMNS =
  'id, rph_event_id, event_name, event_url, event_date, store_name, gameplay_format, starting_player_count, top_cut_size, has_elimination, total_swiss_rounds, event_tier'

export async function listEvents() {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_events')
    .select(EVENT_COLUMNS)
    .order('event_date', { ascending: false, nullsFirst: false })
    .order('starting_player_count', { ascending: false, nullsFirst: false })
  if (error) throw error
  return data ?? []
}

// rank-1 standing per event, keyed by the event's db id.
export async function getWinners(): Promise<Map<string, { playerId: string; playerName: string }>> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_standings')
    .select('event_id, rph_player_id, player_name')
    .eq('rank', 1)
  if (error) throw error
  const out = new Map<string, { playerId: string; playerName: string }>()
  for (const r of data ?? []) out.set(r.event_id, { playerId: r.rph_player_id, playerName: r.player_name })
  return out
}

// The one place raw_event_details is read back: the event page needs the
// elimination phase's name to pick out the bracket.
export async function getEventByRphId(rphEventId: string) {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_events')
    .select(`${EVENT_COLUMNS}, raw_event_details`)
    .eq('rph_event_id', rphEventId)
    .maybeSingle()
  if (error) throw error
  return data
}

export function getEventStandings(eventDbId: string) {
  const supabase = getSupabaseServiceClient()
  return fetchAllRanges<any>(() =>
    supabase
      .from('tournament_history_standings')
      .select('rph_player_id, player_name, rank, match_points, record, made_top_cut')
      .eq('event_id', eventDbId)
      .order('rank', { ascending: true, nullsFirst: false })
      .order('id') // stable order across .range() pages
  )
}

const MATCH_COLUMNS =
  'round_number, phase_name, table_number, player1_id, player1_name, player2_id, player2_name, winner_id, is_bye, is_draw, games_won_by_winner, games_won_by_loser'

export async function getEventMatches(eventDbId: string, phaseName: string) {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_matches')
    .select(MATCH_COLUMNS)
    .eq('event_id', eventDbId)
    .eq('phase_name', phaseName)
    .order('round_number').order('table_number')
  if (error) throw error
  return data ?? []
}

export async function getEventPlayerMatches(eventDbId: string, playerId: string) {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_matches')
    .select(MATCH_COLUMNS)
    .eq('event_id', eventDbId)
    .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)
    .order('round_number')
  if (error) throw error
  return data ?? []
}

// Every archived match a player appears in, joined to the event id. A
// frequent player across ~20 majors is a few hundred rows; paged anyway.
export function getPlayerMatches(playerId: string) {
  const supabase = getSupabaseServiceClient()
  return fetchAllRanges<any>(() =>
    supabase
      .from('tournament_history_matches')
      .select(`${MATCH_COLUMNS}, event:tournament_history_events(rph_event_id, event_date)`)
      .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)
      .order('id') // stable order across .range() pages
  )
}
```

`playerId` is validated with `ID_RE` in the handler before it reaches the `.or()` filter string (PostgREST filter syntax would otherwise accept commas/dots from the URL).

Also extend `getPlayerHistory`'s select so the public player page gets format and tier: add `gameplay_format, event_tier, event_url` to the embedded `event(...)` column list.

- [ ] **Step 2: Add the handlers and shape mappers to `api/tournament-history.ts`**

```ts
import { eliminationPhaseName, eventDateOf, /* …existing */ } from './_lib/tournamentImport.js'
import { listEvents, getWinners, getEventByRphId, getEventStandings, getEventMatches, getEventPlayerMatches, getPlayerMatches, /* …existing */ } from './_lib/tournamentHistorySupabase.js'

const PUBLIC_CACHE = 'public, s-maxage=300, stale-while-revalidate=3600'

function eventShape(r: any) {
  return {
    eventId: r.rph_event_id,
    eventName: r.event_name,
    eventUrl: r.event_url ?? null,
    eventDate: r.event_date ?? null,
    storeName: r.store_name ?? null,
    gameplayFormat: r.gameplay_format ?? null,
    startingPlayerCount: r.starting_player_count ?? null,
    topCutSize: r.top_cut_size ?? null,
    hasElimination: Boolean(r.has_elimination),
    totalSwissRounds: r.total_swiss_rounds ?? 0,
    eventTier: r.event_tier ?? null,
  }
}

function matchShape(r: any, eventId: string) {
  return {
    eventId,
    roundNumber: r.round_number,
    phaseName: r.phase_name ?? null,
    tableNumber: r.table_number ?? null,
    player1: { id: r.player1_id, name: r.player1_name ?? null },
    player2: r.player2_id ? { id: r.player2_id, name: r.player2_name ?? null } : null,
    winnerId: r.winner_id ?? null,
    isBye: Boolean(r.is_bye),
    isDraw: Boolean(r.is_draw),
    gamesWonByWinner: r.games_won_by_winner ?? null,
    gamesWonByLoser: r.games_won_by_loser ?? null,
  }
}

async function handleEvents(req: VercelRequest, res: VercelResponse) {
  try {
    const [rows, winners] = await Promise.all([listEvents(), getWinners()])
    res.setHeader('Cache-Control', PUBLIC_CACHE)
    return res.status(200).json({
      events: rows.map((r: any) => ({ ...eventShape(r), winner: winners.get(r.id) ?? null })),
    })
  } catch (err) {
    console.error('tournament-history events failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load events' })
  }
}

async function handleEvent(req: VercelRequest, res: VercelResponse) {
  const eventId = str(req.query.eventId)
  if (!eventId || !ID_RE.test(eventId)) return res.status(400).json({ error: 'Invalid eventId' })
  try {
    const row = await getEventByRphId(eventId)
    if (!row) return res.status(404).json({ error: 'Event not found' })
    const phase = eliminationPhaseName(row.raw_event_details)
    const [standings, bracketRows] = await Promise.all([
      getEventStandings(row.id),
      phase ? getEventMatches(row.id, phase) : Promise.resolve([]),
    ])
    res.setHeader('Cache-Control', PUBLIC_CACHE)
    return res.status(200).json({
      event: eventShape(row),
      standings: standings.map((s: any) => ({
        playerId: s.rph_player_id, playerName: s.player_name, rank: s.rank,
        matchPoints: s.match_points, record: s.record, madeTopCut: Boolean(s.made_top_cut),
      })),
      bracket: bracketRows.map((m: any) => matchShape(m, eventId)),
    })
  } catch (err) {
    console.error('tournament-history event failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load event' })
  }
}

async function handleEventPlayer(req: VercelRequest, res: VercelResponse) {
  const eventId = str(req.query.eventId)
  const playerId = str(req.query.playerId)
  if (!eventId || !ID_RE.test(eventId)) return res.status(400).json({ error: 'Invalid eventId' })
  if (!playerId || !ID_RE.test(playerId)) return res.status(400).json({ error: 'Invalid playerId' })
  try {
    const row = await getEventByRphId(eventId)
    if (!row) return res.status(404).json({ error: 'Event not found' })
    const rows = await getEventPlayerMatches(row.id, playerId)
    res.setHeader('Cache-Control', PUBLIC_CACHE)
    return res.status(200).json({ matches: rows.map((m: any) => matchShape(m, eventId)) })
  } catch (err) {
    console.error('tournament-history event-player failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load player matches' })
  }
}

async function handlePlayer(req: VercelRequest, res: VercelResponse) {
  const playerId = str(req.query.playerId)
  if (!playerId || !ID_RE.test(playerId)) return res.status(400).json({ error: 'Invalid playerId' })
  try {
    const [history, matchRows] = await Promise.all([getPlayerHistory(playerId), getPlayerMatches(playerId)])
    if (history.length === 0) return res.status(404).json({ error: 'Player not found' })
    const events = history.map((r: any) => ({
      eventId: r.event?.rph_event_id ?? null,
      eventName: r.event?.event_name ?? null,
      eventDate: r.event?.event_date ?? null,
      storeName: r.event?.store_name ?? null,
      gameplayFormat: r.event?.gameplay_format ?? null,
      eventTier: r.event?.event_tier ?? null,
      rank: r.rank,
      matchPoints: r.match_points,
      record: r.record,
      madeTopCut: Boolean(r.made_top_cut),
      topCutSize: r.event?.top_cut_size ?? null,
      startingPlayerCount: r.event?.starting_player_count ?? null,
    }))
    res.setHeader('Cache-Control', PUBLIC_CACHE)
    return res.status(200).json({
      playerId,
      playerName: history[0].player_name, // getPlayerHistory sorts newest first
      events,
      matches: matchRows.map((m: any) => matchShape(m, m.event?.rph_event_id ?? null)),
    })
  } catch (err) {
    console.error('tournament-history player failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load player' })
  }
}
```

- [ ] **Step 3: Drop the session requirement on the three existing reads and add cache headers.** In `handlePlayerHistory`, `handleHeadToHead`, `handleSearchPlayers`: delete the two `requireSession` lines, and `res.setHeader('Cache-Control', PUBLIC_CACHE)` before each 200 (`search-players` uses `'public, s-maxage=60, stale-while-revalidate=300'`). In `handleSearchPlayers`, change the empty-query guard to `if (!q || q.trim().length < 3) return res.status(200).json({ players: [] })`. Update the comment on `requireSession` in `api/_lib/requireAdmin.ts` so it names `pairing-badges` as its remaining caller. Leave `pairing-badges`, `recent-imports`, `suggested-imports`, `import` as they are.

- [ ] **Step 4: Wire the dispatcher** — add to the `switch`:

```ts
    case 'events':
      return handleEvents(req, res)
    case 'event':
      return handleEvent(req, res)
    case 'event-player':
      return handleEventPlayer(req, res)
    case 'player':
      return handlePlayer(req, res)
```

Update the header comment on the route to say the archive's read endpoints are public and edge-cached, with `import`/`recent-imports`/`suggested-imports` admin-only and `pairing-badges` session-only.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/tournamentHistorySupabase.ts api/_lib/requireAdmin.ts api/tournament-history.ts
git commit -m "Tournament history: public, edge-cached read endpoints for events, standings, brackets and players"
```

---

### Task 3: Pure client library `resultsArchive.js` (TDD)

**Files:**
- Create: `src/lib/resultsArchive.js`
- Create: `src/lib/__tests__/resultsArchive.test.js`

**Interfaces:**
- Produces: `MAJOR_MIN_PLAYERS`, `isMajor(event)`, `matchOutcome(match, playerId)`, `toBracketMatch(match)`, `playerSummary({ events, matches, playerId })`, `formatEventDate(yyyyMmDd)`, `ordinal(n)`.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import {
  MAJOR_MIN_PLAYERS, isMajor, matchOutcome, toBracketMatch, playerSummary, formatEventDate, ordinal,
} from '../resultsArchive'

const m = (over = {}) => ({
  eventId: 'e1', roundNumber: 1, phaseName: 'Phase 1', tableNumber: 4,
  player1: { id: 'A', name: 'Alice' }, player2: { id: 'B', name: 'Bob' },
  winnerId: 'A', isBye: false, isDraw: false, gamesWonByWinner: 2, gamesWonByLoser: 1,
  ...over,
})

describe('isMajor', () => {
  it('uses the 32-player floor inclusively', () => {
    expect(MAJOR_MIN_PLAYERS).toBe(32)
    expect(isMajor({ startingPlayerCount: 32 })).toBe(true)
    expect(isMajor({ startingPlayerCount: 31 })).toBe(false)
    expect(isMajor({ startingPlayerCount: null })).toBe(false)
  })
})

describe('matchOutcome', () => {
  it('reports a win from the winner side with the score as played', () => {
    expect(matchOutcome(m(), 'A')).toEqual({ result: 'win', opponent: { id: 'B', name: 'Bob' }, score: '2-1' })
  })
  it('flips the score for the loser', () => {
    expect(matchOutcome(m(), 'B')).toEqual({ result: 'loss', opponent: { id: 'A', name: 'Alice' }, score: '1-2' })
  })
  it('handles draws, byes and unreported results', () => {
    expect(matchOutcome(m({ isDraw: true, winnerId: null }), 'A').result).toBe('draw')
    expect(matchOutcome(m({ winnerId: null }), 'A').result).toBe('draw')
    expect(matchOutcome(m({ isBye: true, player2: null, winnerId: null }), 'A')).toEqual({ result: 'bye', opponent: null, score: null })
  })
  it('returns a null score when game counts are missing', () => {
    expect(matchOutcome(m({ gamesWonByWinner: null }), 'A').score).toBeNull()
  })
})

describe('toBracketMatch', () => {
  it('produces the RPH match shape EliminationBracket renders', () => {
    const out = toBracketMatch(m({ phaseName: 'Top 32', roundNumber: 2 }))
    expect(out).toMatchObject({
      round_number: 2, table_number: 4, phase_name: 'Top 32', status: 'COMPLETE',
      match_is_bye: false, match_is_intentional_draw: false, match_is_unintentional_draw: false, winning_player: 'A',
    })
    expect(out.player_match_relationships).toEqual([
      { player_order: 1, player: { id: 'A' }, user_event_status: { best_identifier: 'Alice' } },
      { player_order: 2, player: { id: 'B' }, user_event_status: { best_identifier: 'Bob' } },
    ])
  })
  it('emits one relationship for a bye', () => {
    const out = toBracketMatch(m({ isBye: true, player2: null, winnerId: null }))
    expect(out.match_is_bye).toBe(true)
    expect(out.player_match_relationships).toHaveLength(1)
  })
})

describe('playerSummary', () => {
  const events = [
    { eventId: 'e1', eventName: 'DLC Richmond', rank: 12, madeTopCut: true, startingPlayerCount: 2052 },
    { eventId: 'e2', eventName: 'DLC Ghent', rank: 12, madeTopCut: true, startingPlayerCount: 2030 },
    { eventId: 'e3', eventName: 'CCQ Trial', rank: 40, madeTopCut: false, startingPlayerCount: 60 },
  ]
  const matches = [
    m({ eventId: 'e1', winnerId: 'A' }),
    m({ eventId: 'e1', winnerId: 'B', roundNumber: 2 }),
    m({ eventId: 'e2', player2: { id: 'C', name: 'Cara' }, winnerId: 'A' }),
    m({ eventId: 'e2', isDraw: true, winnerId: null, roundNumber: 2 }),
    m({ eventId: 'e3', isBye: true, player2: null, winnerId: null }),
  ]
  it('counts events, cuts, record (excluding byes) and best finish (ties → larger event)', () => {
    const s = playerSummary({ events, matches, playerId: 'A' })
    expect(s.eventsPlayed).toBe(3)
    expect(s.topCuts).toBe(2)
    expect(s.record).toEqual({ wins: 2, losses: 1, draws: 1 })
    expect(s.bestFinish).toEqual({ rank: 12, eventId: 'e1', eventName: 'DLC Richmond', startingPlayerCount: 2052 })
  })
  it('ranks rivals by meetings then wins, capped at 10, byes excluded', () => {
    const s = playerSummary({ events, matches, playerId: 'A' })
    expect(s.rivals.map((r) => r.playerId)).toEqual(['B', 'C'])
    expect(s.rivals[0]).toEqual({ playerId: 'B', playerName: 'Bob', meetings: 3, wins: 1, losses: 1, draws: 1 })
    const many = Array.from({ length: 12 }, (_, i) => m({ player2: { id: `P${i}`, name: `P${i}` } }))
    expect(playerSummary({ events: [], matches: many, playerId: 'A' }).rivals).toHaveLength(10)
  })
  it('is safe on empty inputs', () => {
    expect(playerSummary({ events: [], matches: [], playerId: 'A' })).toEqual({
      eventsPlayed: 0, topCuts: 0, bestFinish: null, record: { wins: 0, losses: 0, draws: 0 }, rivals: [],
    })
  })
})

describe('formatEventDate', () => {
  it('renders a date-only string as that calendar day in any timezone', () => {
    const expected = new Date(2026, 0, 10).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    expect(formatEventDate('2026-01-10')).toBe(expected)
  })
  it('renders a dash for null', () => {
    expect(formatEventDate(null)).toBe('—')
  })
})

describe('ordinal', () => {
  it('handles the teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 112].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '112th'])
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/__tests__/resultsArchive.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/resultsArchive.js`**

```js
// Pure helpers behind the public Tournament Results pages (/results/*):
// derive a player's outcome from an archived match, roll a player's archive
// up into summary stats, and adapt archived bracket rows to the RPH match
// shape EliminationBracket already renders. Server shapes are documented in
// docs/superpowers/specs/2026-10-22-public-tournament-results-design.md.

// The discovery sweep that feeds the archive also picks up 4–8 player "CCQ
// trial" events; the results list hides anything under this by default.
export const MAJOR_MIN_PLAYERS = 32

export function isMajor(event) {
  return (event.startingPlayerCount ?? 0) >= MAJOR_MIN_PLAYERS
}

// A player's view of one archived match. An unreported result (no winner,
// not flagged a draw) counts as a draw, matching the head-to-head endpoint.
export function matchOutcome(match, playerId) {
  if (match.isBye || !match.player2) return { result: 'bye', opponent: null, score: null }
  const opponent = match.player1.id === playerId ? match.player2 : match.player1
  const won = match.winnerId === playerId
  const lost = match.winnerId != null && match.winnerId !== playerId
  const result = match.isDraw || !match.winnerId ? 'draw' : won ? 'win' : lost ? 'loss' : 'draw'
  const w = match.gamesWonByWinner
  const l = match.gamesWonByLoser
  const score = w == null || l == null ? null : result === 'loss' ? `${l}-${w}` : `${w}-${l}`
  return { result, opponent, score }
}

function relationship(order, player) {
  return { player_order: order, player: { id: player.id }, user_event_status: { best_identifier: player.name } }
}

export function toBracketMatch(match) {
  const relationships = [relationship(1, match.player1)]
  if (match.player2) relationships.push(relationship(2, match.player2))
  return {
    round_number: match.roundNumber,
    table_number: match.tableNumber,
    phase_name: match.phaseName,
    status: 'COMPLETE',
    match_is_bye: match.isBye,
    match_is_intentional_draw: match.isDraw,
    match_is_unintentional_draw: false,
    winning_player: match.winnerId,
    player_match_relationships: relationships,
  }
}

const MAX_RIVALS = 10

export function playerSummary({ events, matches, playerId }) {
  const record = { wins: 0, losses: 0, draws: 0 }
  const byOpponent = new Map()
  for (const match of matches) {
    const { result, opponent } = matchOutcome(match, playerId)
    if (result === 'bye') continue
    record[`${result === 'win' ? 'wins' : result === 'loss' ? 'losses' : 'draws'}`] += 1
    const r = byOpponent.get(opponent.id) ?? { playerId: opponent.id, playerName: opponent.name, meetings: 0, wins: 0, losses: 0, draws: 0 }
    r.meetings += 1
    r[result === 'win' ? 'wins' : result === 'loss' ? 'losses' : 'draws'] += 1
    if (opponent.name) r.playerName = opponent.name
    byOpponent.set(opponent.id, r)
  }
  const rivals = [...byOpponent.values()]
    .sort((a, b) => b.meetings - a.meetings || b.wins - a.wins)
    .slice(0, MAX_RIVALS)

  let bestFinish = null
  for (const e of events) {
    if (e.rank == null) continue
    const better = !bestFinish || e.rank < bestFinish.rank ||
      (e.rank === bestFinish.rank && (e.startingPlayerCount ?? 0) > (bestFinish.startingPlayerCount ?? 0))
    if (better) bestFinish = { rank: e.rank, eventId: e.eventId, eventName: e.eventName, startingPlayerCount: e.startingPlayerCount ?? null }
  }

  return {
    eventsPlayed: events.length,
    topCuts: events.filter((e) => e.madeTopCut).length,
    bestFinish,
    record,
    rivals,
  }
}

// event_date is a date-only string; parsing it with `new Date(str)` would
// read it as UTC midnight and show the previous day west of Greenwich.
export function formatEventDate(yyyyMmDd) {
  if (!yyyyMmDd) return '—'
  const [y, mo, d] = yyyyMmDd.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ordinal(n) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'
  return `${n}${suffix}`
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/__tests__/resultsArchive.test.js` → all PASS. Fix the implementation, not the tests, if the rivals name rule ("name from the most recent meeting") disagrees: matches are not guaranteed sorted, so sort `matches` by `eventDate`? The `player` endpoint doesn't return per-match dates; keep "last seen in iteration order" and leave it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/resultsArchive.js src/lib/__tests__/resultsArchive.test.js
git commit -m "Add resultsArchive helpers: match outcomes, player summary, bracket adapter"
```

---

### Task 4: Client API functions

**Files:**
- Modify: `src/lib/tournamentHistoryApi.js`

**Interfaces:**
- Produces: `fetchArchiveEvents()`, `fetchArchiveEvent(eventId)`, `fetchArchiveEventPlayer(eventId, playerId)`, `fetchArchivePlayer(playerId)`; `fetchPlayerTournamentHistory`, `fetchHeadToHead`, `searchTournamentPlayers` now work signed-out.
- Errors: a 404 throws an `Error` with `.status = 404` so pages can show "not found".

- [ ] **Step 1: Add `publicFetch` and the four functions**

```js
// Public, edge-cached reads (see api/tournament-history.ts). No session
// header on purpose: none is required, and an Authorization header on the
// request would also bypass the edge cache that stands in for auth here.
async function publicFetch(query) {
  const res = await fetch(`/api/tournament-history${query}`)
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    const err = new Error(error.error || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return res.json()
}

export async function fetchArchiveEvents() {
  return publicFetch('?endpoint=events')
}

export async function fetchArchiveEvent(eventId) {
  return publicFetch(`?endpoint=event&eventId=${encodeURIComponent(eventId)}`)
}

export async function fetchArchiveEventPlayer(eventId, playerId) {
  return publicFetch(`?endpoint=event-player&eventId=${encodeURIComponent(eventId)}&playerId=${encodeURIComponent(playerId)}`)
}

export async function fetchArchivePlayer(playerId) {
  return publicFetch(`?endpoint=player&playerId=${encodeURIComponent(playerId)}`)
}
```

Switch `fetchPlayerTournamentHistory`, `fetchHeadToHead`, `searchTournamentPlayers` from `apiFetch` to `publicFetch`. Update the file's header comment: reads are public; only import/admin/badge calls attach the session JWT.

- [ ] **Step 2: Commit**

```bash
git add src/lib/tournamentHistoryApi.js
git commit -m "tournamentHistoryApi: public fetchers for the results archive"
```

---

### Task 5: The three pages, routes, catalog entry, icon, titles, sitemap

**Files:**
- Create: `src/pages/ResultsPage.jsx`, `src/pages/ResultsEventPage.jsx`, `src/pages/ResultsPlayerPage.jsx`
- Create: `src/components/ArchiveFootnote.jsx` (the one-line "as published on RPH" note shared by the three pages)
- Modify: `src/App.jsx` (three routes, public), `src/lib/siteSections.js` (tool entry), `src/lib/toolIcons.js` (`podium`), `src/lib/routeTitle.js` (title, prefix, description), `public/sitemap.xml` (`/results`), `src/lib/__tests__/routeTitle.test.js` (one case)

**Interfaces:**
- Consumes: everything from Tasks 3 and 4; `EliminationBracket` (`src/components/EliminationBracket.jsx`, props `allMatches`, `phaseName`), `StatCard` (`src/components/StatCard.jsx`), ui primitives.

- [ ] **Step 1: Catalog, icon, titles, sitemap**

`toolIcons.js` — add (three podium steps and a winner's tick):

```js
  podium: ['M3 21h18', 'M8 21V11h8v10', 'M3 21v-6h5', 'M16 15h5v6', 'M10 7l1.5 1.5L14.5 5'],
```

`siteSections.js` — first tool in Tournament Tools:

```js
      {
        path: '/results',
        name: 'Tournament Results',
        icon: 'podium',
        description: 'Browse final standings, top-cut brackets and every player\'s record across imported Disney Lorcana Challenges, qualifiers and other major events.',
      },
```

`routeTitle.js` — `TITLES['/results'] = 'Tournament Results'`; `PREFIXES` add `['/results/', 'Tournament Results']` (before `/rules/` is fine; order only matters for overlapping prefixes); `DESCRIPTIONS['/results'] = 'Final standings, top-cut brackets and cross-event player records from Disney Lorcana Challenges, qualifiers and other major events.'`.

`routeTitle.test.js` — add:

```js
  it('titles the results archive and its sub-routes', () => {
    expect(routeTitle('/results')).toBe('Tournament Results · InkbornForge')
    expect(routeTitle('/results/players/123')).toBe('Tournament Results · InkbornForge')
  })
```

`public/sitemap.xml` — add a `<url>` for `https://lorcana-pro-tools.vercel.app/results`, priority 0.8, after `/rules`.

Run `npx vitest run src/lib/__tests__/siteSections.test.js src/lib/__tests__/routeTitle.test.js` → PASS.

- [ ] **Step 2: `ArchiveFootnote.jsx`**

```jsx
// Provenance line under every public results page.
export function ArchiveFootnote() {
  return (
    <p className="text-xs text-gray-400 mt-8">
      Results as published on Ravensburger Play Hub. Players appear under the name they registered with.
    </p>
  )
}
```

- [ ] **Step 3: `ResultsPage.jsx`**

```jsx
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchArchiveEvents, searchTournamentPlayers } from '../lib/tournamentHistoryApi'
import { isMajor, formatEventDate, MAJOR_MIN_PLAYERS } from '../lib/resultsArchive'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Field'
import { ArchiveFootnote } from '../components/ArchiveFootnote'

const SEARCH_MIN = 3
const SEARCH_DEBOUNCE_MS = 300

function PlayerSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < SEARCH_MIN) { setResults([]); return }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(() => {
      searchTournamentPlayers(q)
        .then((data) => { if (!cancelled) setResults(data.players ?? []) })
        .catch(() => { if (!cancelled) setResults([]) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, SEARCH_DEBOUNCE_MS)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  return (
    <div className="relative max-w-md">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a player…"
        aria-label="Find a player"
      />
      {query.trim().length >= SEARCH_MIN && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-sm max-h-80 overflow-y-auto">
          {searching && results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">No players match.</p>
          ) : (
            results.map((p) => (
              <button
                key={p.playerId}
                type="button"
                onClick={() => navigate(`/results/players/${p.playerId}`)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50"
              >
                <span className="text-sm font-medium text-gray-900">{p.playerName}</span>
                {p.lastSeenEventName && <span className="block text-xs text-gray-500">{p.lastSeenEventName}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function ResultsPage() {
  const [events, setEvents] = useState(null)
  const [error, setError] = useState(null)
  const [showSmall, setShowSmall] = useState(false)

  useEffect(() => {
    fetchArchiveEvents().then((d) => setEvents(d.events ?? [])).catch((e) => setError(e.message))
  }, [])

  const visible = useMemo(() => (events ?? []).filter((e) => showSmall || isMajor(e)), [events, showSmall])

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Tournament Results"
        description="Final standings, brackets and player records from every major event in the archive."
      />
      <div className="mb-6"><PlayerSearch /></div>

      <Card className="p-4">
        <label className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <input type="checkbox" checked={showSmall} onChange={(e) => setShowSmall(e.target.checked)} />
          Show events under {MAJOR_MIN_PLAYERS} players
        </label>
        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : events === null ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-500">No events imported yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Event</th><th className="py-2 pr-4">Store</th>
                  <th className="py-2 pr-4">Format</th><th className="py-2 pr-4 text-right">Players</th><th className="py-2">Winner</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.eventId} className="border-b border-gray-100">
                    <td className="py-2 pr-4 whitespace-nowrap text-gray-500">{formatEventDate(e.eventDate)}</td>
                    <td className="py-2 pr-4"><Link to={`/results/events/${e.eventId}`} className="font-medium text-gray-900 hover:underline">{e.eventName}</Link></td>
                    <td className="py-2 pr-4 text-gray-500">{e.storeName ?? '—'}</td>
                    <td className="py-2 pr-4 text-gray-500">{e.gameplayFormat ?? '—'}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{e.startingPlayerCount ?? '—'}</td>
                    <td className="py-2">{e.winner ? <Link to={`/results/players/${e.winner.playerId}`} className="hover:underline">{e.winner.playerName}</Link> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ArchiveFootnote />
    </div>
  )
}
```

- [ ] **Step 4: `ResultsEventPage.jsx`**

```jsx
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchArchiveEvent } from '../lib/tournamentHistoryApi'
import { toBracketMatch, formatEventDate } from '../lib/resultsArchive'
import { EliminationBracket } from '../components/EliminationBracket'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Field'
import { Tabs, Tab } from '../components/ui/Tabs'
import { ArchiveFootnote } from '../components/ArchiveFootnote'

function describe(event) {
  return [
    formatEventDate(event.eventDate),
    event.storeName,
    event.gameplayFormat,
    event.startingPlayerCount != null && `${event.startingPlayerCount} players`,
    event.totalSwissRounds > 0 && `${event.totalSwissRounds} Swiss rounds`,
    event.topCutSize && `Top ${event.topCutSize}`,
  ].filter(Boolean).join(' · ')
}

export function ResultsEventPage() {
  const { eventId } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('standings')
  const [filter, setFilter] = useState('')

  useEffect(() => {
    setData(null); setError(null)
    fetchArchiveEvent(eventId).then(setData).catch(setError)
  }, [eventId])

  const standings = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const rows = data?.standings ?? []
    return q ? rows.filter((s) => s.playerName.toLowerCase().includes(q)) : rows
  }, [data, filter])

  if (error) {
    return (
      <div className="w-full px-6 py-8">
        <Card className="p-6 max-w-md">
          <p className="text-gray-900 font-medium mb-2">{error.status === 404 ? 'Event not found' : 'Could not load this event'}</p>
          <Link to="/results" className="text-sm text-forge-ink hover:underline">← All results</Link>
        </Card>
      </div>
    )
  }
  if (!data) return <div className="w-full px-6 py-8 text-sm text-gray-500">Loading…</div>

  const { event, bracket } = data
  const hasBracket = bracket.length > 0

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title={event.eventName}
        description={describe(event)}
        actions={event.eventUrl && <Button variant="quiet" href={event.eventUrl}>View on Play Hub</Button>}
      />
      <Link to="/results" className="text-sm text-gray-500 hover:underline">← All results</Link>

      <Tabs className="mt-4 mb-4">
        <Tab active={tab === 'standings'} onClick={() => setTab('standings')}>Standings</Tab>
        {hasBracket && <Tab active={tab === 'bracket'} onClick={() => setTab('bracket')}>Bracket</Tab>}
      </Tabs>

      {tab === 'standings' ? (
        <Card className="p-4">
          <div className="max-w-xs mb-4">
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name…" aria-label="Filter standings by name" />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-4 text-right">Rank</th><th className="py-2 pr-4">Player</th><th className="py-2 pr-4">Record</th><th className="py-2 pr-4 text-right">Points</th><th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr key={s.playerId} className="border-b border-gray-100">
                  <td className="py-1.5 pr-4 text-right tabular-nums text-gray-500">{s.rank ?? '—'}</td>
                  <td className="py-1.5 pr-4"><Link to={`/results/players/${s.playerId}`} className="font-medium text-gray-900 hover:underline">{s.playerName}</Link></td>
                  <td className="py-1.5 pr-4 tabular-nums">{s.record ?? '—'}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{s.matchPoints ?? '—'}</td>
                  <td className="py-1.5">{s.madeTopCut && <Badge variant="forge">Top cut</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {standings.length === 0 && <p className="text-sm text-gray-500 py-4">No players match.</p>}
        </Card>
      ) : (
        <Card className="p-4">
          <EliminationBracket allMatches={bracket.map(toBracketMatch)} phaseName={bracket[0].phaseName} />
        </Card>
      )}
      <ArchiveFootnote />
    </div>
  )
}
```

Check `Badge`'s actual prop name for the forge variant and `Button`'s `href`/`variant` props in `src/components/ui/` before using them; match what exists.

- [ ] **Step 5: `ResultsPlayerPage.jsx`**

```jsx
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchArchivePlayer, fetchArchiveEventPlayer } from '../lib/tournamentHistoryApi'
import { playerSummary, matchOutcome, formatEventDate, ordinal } from '../lib/resultsArchive'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { StatCard } from '../components/StatCard'
import { ArchiveFootnote } from '../components/ArchiveFootnote'

const RESULT_CLASS = { win: 'text-green-700', loss: 'text-red-700', draw: 'text-gray-500', bye: 'text-gray-400' }
const RESULT_LABEL = { win: 'Win', loss: 'Loss', draw: 'Draw', bye: 'Bye' }

function EventRounds({ eventId, playerId }) {
  const [matches, setMatches] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    fetchArchiveEventPlayer(eventId, playerId).then((d) => setMatches(d.matches)).catch((e) => setError(e.message))
  }, [eventId, playerId])
  if (error) return <p className="text-xs text-red-700 py-2">{error}</p>
  if (!matches) return <p className="text-xs text-gray-500 py-2">Loading rounds…</p>
  if (matches.length === 0) return <p className="text-xs text-gray-500 py-2">No match data for this event.</p>
  return (
    <table className="w-full text-xs my-2">
      <tbody>
        {matches.map((m) => {
          const o = matchOutcome(m, playerId)
          return (
            <tr key={`${m.phaseName}-${m.roundNumber}-${m.tableNumber}`}>
              <td className="py-1 pr-3 text-gray-500 whitespace-nowrap">{m.phaseName ? `${m.phaseName} · ` : ''}R{m.roundNumber}</td>
              <td className="py-1 pr-3">{o.opponent ? <Link to={`/results/players/${o.opponent.id}`} className="hover:underline">{o.opponent.name ?? o.opponent.id}</Link> : '—'}</td>
              <td className={`py-1 pr-3 font-medium ${RESULT_CLASS[o.result]}`}>{RESULT_LABEL[o.result]}</td>
              <td className="py-1 tabular-nums text-gray-500">{o.score ?? ''}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function ResultsPlayerPage() {
  const { playerId } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null) // eventId whose rounds are expanded

  useEffect(() => {
    setData(null); setError(null); setOpen(null)
    fetchArchivePlayer(playerId).then(setData).catch(setError)
  }, [playerId])

  const summary = useMemo(() => data && playerSummary({ events: data.events, matches: data.matches, playerId }), [data, playerId])

  if (error) {
    return (
      <div className="w-full px-6 py-8">
        <Card className="p-6 max-w-md">
          <p className="text-gray-900 font-medium mb-2">{error.status === 404 ? 'Player not found' : 'Could not load this player'}</p>
          <Link to="/results" className="text-sm text-forge-ink hover:underline">← All results</Link>
        </Card>
      </div>
    )
  }
  if (!data) return <div className="w-full px-6 py-8 text-sm text-gray-500">Loading…</div>

  const { record, bestFinish, rivals } = summary
  return (
    <div className="w-full px-6 py-8">
      <PageHeader title={data.playerName} description={`Across ${summary.eventsPlayed} imported ${summary.eventsPlayed === 1 ? 'event' : 'events'}`} />
      <Link to="/results" className="text-sm text-gray-500 hover:underline">← All results</Link>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-6">
        <StatCard label="Events played" value={summary.eventsPlayed} />
        <StatCard label="Top cuts" value={summary.topCuts} />
        <StatCard label="Best finish" value={bestFinish ? `${ordinal(bestFinish.rank)} of ${bestFinish.startingPlayerCount ?? '?'}` : '—'} />
        <StatCard label="Match record" value={`${record.wins}-${record.losses}${record.draws ? `-${record.draws}` : ''}`} />
      </div>

      <Card title="Events" className="p-4 mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Event</th><th className="py-2 pr-4">Finish</th><th className="py-2 pr-4">Record</th><th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {data.events.map((e) => (
              <Fragment key={e.eventId}>
                <tr className="border-b border-gray-100 cursor-pointer hover:bg-gray-50" onClick={() => setOpen(open === e.eventId ? null : e.eventId)}>
                  <td className="py-2 pr-4 whitespace-nowrap text-gray-500">{formatEventDate(e.eventDate)}</td>
                  <td className="py-2 pr-4"><Link to={`/results/events/${e.eventId}`} onClick={(ev) => ev.stopPropagation()} className="font-medium text-gray-900 hover:underline">{e.eventName}</Link></td>
                  <td className="py-2 pr-4 tabular-nums">{e.rank != null ? `#${e.rank}` : '—'}{e.startingPlayerCount ? ` of ${e.startingPlayerCount}` : ''}</td>
                  <td className="py-2 pr-4 tabular-nums">{e.record ?? '—'}</td>
                  <td className="py-2">{e.madeTopCut && <Badge variant="forge">Top cut</Badge>}</td>
                </tr>
                {open === e.eventId && (
                  <tr><td colSpan={5} className="bg-gray-50 px-3"><EventRounds eventId={e.eventId} playerId={playerId} /></td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Most-faced opponents" className="p-4">
        {rivals.length === 0 ? <p className="text-sm text-gray-500">No matches recorded.</p> : (
          <table className="w-full text-sm">
            <tbody>
              {rivals.map((r) => (
                <tr key={r.playerId} className="border-b border-gray-100">
                  <td className="py-1.5 pr-4"><Link to={`/results/players/${r.playerId}`} className="font-medium text-gray-900 hover:underline">{r.playerName ?? r.playerId}</Link></td>
                  <td className="py-1.5 pr-4 text-gray-500">{r.meetings} {r.meetings === 1 ? 'meeting' : 'meetings'}</td>
                  <td className="py-1.5 tabular-nums">{r.wins}-{r.losses}{r.draws ? `-${r.draws}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <ArchiveFootnote />
    </div>
  )
}
```

(Import `Fragment` from React. Check `StatCard`'s props — `label`/`value`/`size` — in `src/components/StatCard.jsx` and match them.)

- [ ] **Step 6: Routes in `App.jsx`** — import the three pages and add, next to `/tournament-lookup`:

```jsx
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/results/events/:eventId" element={<ResultsEventPage />} />
        <Route path="/results/players/:playerId" element={<ResultsPlayerPage />} />
```

Not wrapped in `SupporterRoute`; not added to `SUPPORTER_PATHS`.

- [ ] **Step 7: Lint and test** — `npm run lint` and `npm test` → clean. Then `npm run dev` and open `/results`: with no `/api` functions locally the page should show its error text inside the card, not the error boundary. Open `/results/events/x` and `/results/players/x` and confirm the same (error card, "← All results" link).

- [ ] **Step 8: Commit**

```bash
git add src/pages/ResultsPage.jsx src/pages/ResultsEventPage.jsx src/pages/ResultsPlayerPage.jsx src/components/ArchiveFootnote.jsx src/App.jsx src/lib/siteSections.js src/lib/toolIcons.js src/lib/routeTitle.js src/lib/__tests__/routeTitle.test.js public/sitemap.xml
git commit -m "Add public Tournament Results pages: event list, standings and bracket, player records"
```

---

### Task 6: Cross-link from the caster pairing modal + CLAUDE.md

**Files:**
- Modify: `src/components/PairingHistoryPanel.jsx` (`PlayerSummaryCard`)
- Modify: `CLAUDE.md` (routes table, API table, "Tournament History Archive" section, siteSections/Nav mention is automatic)

- [ ] **Step 1: Link from `PlayerSummaryCard`** — give it a `playerId` prop (both call sites already have `p1.id`/`p2.id`) and render under `<TopCutList …/>`:

```jsx
<Link to={`/results/players/${playerId}`} className="inline-block mt-2 text-xs text-forge-ink hover:underline">
  Full history →
</Link>
```

(`import { Link } from 'react-router-dom'` — the file already imports `useNavigate` from there.)

- [ ] **Step 2: CLAUDE.md** — add three rows to the routes table after `/tournament-lookup`:

```
| `/results` | `ResultsPage.jsx` | Public Tournament Results — every imported archive event (newest first, events under 32 players hidden behind a toggle) with a player-name search. See "Tournament History Archive" |
| `/results/events/:eventId` | `ResultsEventPage.jsx` | One archived event (`rph_event_id`): final standings (all rows, name filter) and the top-cut bracket via `EliminationBracket` |
| `/results/players/:playerId` | `ResultsPlayerPage.jsx` | One player (`rph_player_id`) across every imported event: events played, top cuts, best finish, match record, per-event finishes with expandable round-by-round, most-faced opponents. Unrelated to `/players/:name` |
```

In the API table, change `/api/tournament-history`'s Auth cell to: "Public for the archive reads (`events`, `event`, `event-player`, `player`, `player-history`, `head-to-head`, `search-players`; edge-cached 5 min, search 1 min) — `import`, `recent-imports`, `suggested-imports` require admin tier; `pairing-badges` requires any signed-in session". Update the Notes cell to list the four new endpoints. In the intro sentence of "API Routes" that calls `/api/tournament-history` "the exception", qualify it: it verifies sessions on its admin/badge endpoints; its archive reads are public.

Add a paragraph to "Tournament History Archive" after **Caster UI:**

```
**Public results pages:** `/results`, `/results/events/:eventId` and `/results/players/:playerId` (catalog tool "Tournament Results", Tournament Tools) expose the same archive without a session — the first free, linkable surface on it. Reads are edge-cached (`Cache-Control: s-maxage`) instead of session-gated, since the data only changes on admin import. `src/lib/resultsArchive.js` (unit-tested) derives a player's outcome per match, the summary stats (record excludes byes; best finish ties go to the larger event; up to 10 most-faced opponents) and adapts archived bracket rows to the RPH match shape `EliminationBracket` renders. Elimination matches are picked by the phase whose `round_type` is `RANKED_SINGLE_ELIMINATION` in `raw_event_details` (Swiss phase names vary per organizer). `event_date` is derived from RPH's `start_datetime` in the event's `timezone` (`eventDateOf()` in `tournamentImport.ts`); migration `018` backfilled it — every earlier import had left it NULL because the code read a field RPH doesn't send. The results list hides events under `MAJOR_MIN_PLAYERS` (32) by default because the discovery sweep also imports tiny CCQ trial events. Per-event/per-player sitemap entries and prerendering are deliberately not done (prerender runs against `vite preview`, which has no `/api` functions).
```

Also add `resultsArchive.js` to the Shared Libraries table and `ArchiveFootnote.jsx` to the Components table, one line each.

- [ ] **Step 3: Commit**

```bash
git add src/components/PairingHistoryPanel.jsx CLAUDE.md
git commit -m "Link the pairing modal to public player pages; document the results archive"
```

---

### Task 7: Verify, push, PR

- [ ] **Step 1: Full checks** — `npm run lint && npm test && npm run build` all green. If `build` runs `prerender.js` and needs Chromium, `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` is the env var it reads (see the file header).

- [ ] **Step 2: Push** — `git push -u origin claude/zealous-faraday-k6h5cw` (retry with 2s/4s/8s/16s backoff on network errors only).

- [ ] **Step 3: Open the PR** with the GitHub MCP tools (`mcp__github__create_pull_request`, ready for review, base = the repo default branch). Title: "Public Tournament Results: event list, standings, brackets and player pages". Body: what/why in three short paragraphs (the archive was invisible outside a pairing click; zero new functions; the event_date bug and backfill), a bullet list of endpoints and routes, the manual-verification notes, and the Vercel preview link per the `vercel-preview-url` skill (poll the vercel[bot] comment; if the preview is SSO-gated say so and skip screenshots rather than guess the URL). Then `subscribe_pr_activity`.

- [ ] **Step 4: Manual verification on the preview (if reachable)** — open `/results`, the largest event (`Disney Lorcana Challenge: Richmond`, 2,052 players: confirm the standings table ends at rank 2052 and the Bracket tab shows a Top 32 → Final column set), its winner's player page (stat cards, expand a row, rivals), and a nonsense id for the 404 card. Screenshot each and attach to the PR body. If the preview can't be reached, say so explicitly in the PR.
