# Public Tournament Results — design

## Why

The Tournament History archive (`tournament_history_events` / `_standings` / `_matches`) is the richest server-side data the site owns: 150 imported RPH events, ~33k standings rows, ~122k matches, ~17k distinct players keyed by RPH's stable `player.id`. Today it is reachable from exactly one place — clicking a pairing inside a live event on the supporter-gated Tournament Lookup page. Nobody can browse an event's final standings, look up a player's record across majors, or link to any of it.

This feature exposes the archive as three public, linkable pages. It is free-tier on purpose: it is the site's first search-indexable, shareable content built on real tournament data, and the natural landing page for anyone who played in or watched a major. RPH already publishes every name and result here, so nothing private is exposed.

## Data facts that shaped the design (verified against the live DB on 2026-10-22)

- 150 events, 33,498 standings, 121,848 matches, 17,042 distinct players. Largest event: 2,052 players (12 Swiss rounds + top 32 cut → ~12k match rows).
- **`event_date` is NULL on all 150 rows.** The import reads `eventDetails.start_date ?? eventDetails.event_date`, but RPH's event payload has `start_datetime` (ISO, with offset) and a `timezone` field. `raw_event_details` is stored, so the column can be backfilled. Without this fix every date-sorted list is arbitrary and `PairingHistoryPanel`'s "newest first" sort has been silently a no-op.
- `event_tier` is not a usable "is this a major" signal: 116 of 150 rows are `weekly_constructed` (stores mistag their DLCs), while the name-search discovery also pulls in 4–8 player "CCQ trial" events. `starting_player_count` is the honest size signal.
- Elimination matches are identified by `phase_name` matching the phase with `round_type === 'RANKED_SINGLE_ELIMINATION'` in `raw_event_details.tournament_phases` (same rule `getTournamentStructure()` uses client-side). Swiss phase names vary wildly ("Phase 1", "Day 1 Swiss", "Day One Swiss", "").
- Supabase's PostgREST returns at most 1,000 rows per request by default. Standings for a 2,000-player event need server-side range paging.
- Vercel function budget: 9 of 12 used. This feature adds **zero** functions — everything rides on `api/tournament-history.ts`'s `?endpoint=` dispatch.

## Routes

| Route | Page | Purpose |
|---|---|---|
| `/results` | `ResultsPage.jsx` | Event list (newest first) with a player-name search box |
| `/results/events/:eventId` | `ResultsEventPage.jsx` | One event: header, final standings (all rows, filterable by name), top-cut bracket |
| `/results/players/:playerId` | `ResultsPlayerPage.jsx` | One player across every imported event: summary stats, per-event finishes with expandable round-by-round, most-faced opponents |

`:eventId` is `rph_event_id`; `:playerId` is `rph_player_id`. Both are RPH's own ids, so links stay stable across re-imports. These are **not** supporter-gated (not added to `SUPPORTER_PATHS`). `/results/players/:id` is distinct from the existing supporter-only `/players/:name` (duels.ink opponent profiles); the two are unrelated and stay unrelated.

The catalog gets one entry: "Tournament Results" at `/results` in the Tournament Tools section with a new `podium` icon, so it appears on the home page, nav, sitemap page and ⌘K search; the two sub-routes are reached from it. `findTool()` already matches sub-routes by prefix, so `PageHeader`'s eyebrow works on all three pages.

## API changes (`api/tournament-history.ts`, no new function)

### Auth boundary

| Endpoint | Before | After |
|---|---|---|
| `import` | admin | admin (unchanged) |
| `recent-imports`, `suggested-imports` | admin | admin (unchanged) |
| `pairing-badges` | session | session (unchanged; only used inside gated Tournament Lookup) |
| `player-history`, `head-to-head`, `search-players` | session | **public** |
| `events`, `event`, `event-player`, `player` | — | **public (new)** |

Public endpoints set `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600` (`search-players`: `s-maxage=60`). The archive only changes on admin import, so a 5-minute edge cache is the abuse/cost control that `requireSession` used to be. `search-players` additionally returns `{ players: [] }` for a trimmed query under 3 characters to keep the trigram index from being hit per keystroke.

### Response shapes

Shared shape for a match row, `ArchivedMatch`:

```ts
{
  eventId: string,           // rph_event_id
  roundNumber: number,
  phaseName: string | null,
  tableNumber: number | null,
  player1: { id: string, name: string | null },
  player2: { id: string, name: string | null } | null,   // null = bye
  winnerId: string | null,
  isBye: boolean,
  isDraw: boolean,
  gamesWonByWinner: number | null,
  gamesWonByLoser: number | null,
}
```

Shared shape for an event, `ArchivedEvent`:

```ts
{
  eventId: string, eventName: string, eventUrl: string | null,
  eventDate: string | null,            // YYYY-MM-DD
  storeName: string | null, gameplayFormat: string | null,
  startingPlayerCount: number | null, topCutSize: number | null,
  hasElimination: boolean, totalSwissRounds: number, eventTier: string | null,
}
```

- `GET ?endpoint=events` → `{ events: (ArchivedEvent & { winner: { playerId, playerName } | null })[] }`, sorted by `eventDate` desc (nulls last), then `startingPlayerCount` desc. Winner is the rank-1 standing. Never selects `raw_event_details`.
- `GET ?endpoint=event&eventId=` → `{ event: ArchivedEvent, standings: { playerId, playerName, rank, matchPoints, record, madeTopCut }[] (ordered by rank, all rows), bracket: ArchivedMatch[] }`. `bracket` is every match whose `phase_name` equals the elimination phase's name derived from `raw_event_details.tournament_phases`; `[]` when the event has no elimination phase. 404 `{ error: 'Event not found' }` for an unknown id. Standings are fetched in 1,000-row ranges until a short page comes back.
- `GET ?endpoint=event-player&eventId=&playerId=` → `{ matches: ArchivedMatch[] }`, that player's matches in that event, ordered by round. 
- `GET ?endpoint=player&playerId=` → `{ playerId, playerName, events: PlayerEvent[], matches: ArchivedMatch[] }` where `PlayerEvent` is the existing `player-history` event shape plus `gameplayFormat` and `eventTier`, and `matches` is every archived match the player appears in (`player1_id = X OR player2_id = X`), with `eventId`. `playerName` is the name from the most recent event (by `eventDate`). 404 when the player has no standings rows. Aggregates (record, rivals, best finish) are computed client-side by a unit-tested pure function — keeps the server a thin data layer like the rest of this route.
- `player-history`, `head-to-head`, `search-players`: unchanged shapes.

### Supabase helpers (`api/_lib/tournamentHistorySupabase.ts`)

New: `listEvents()`, `getEventByRphId(rphEventId)` (selects `raw_event_details` only here, to derive the elimination phase name), `getEventStandings(eventDbId)` (range-paged), `getEventMatches(eventDbId, phaseName)`, `getEventPlayerMatches(eventDbId, playerId)`, `getPlayerMatches(playerId)`, `getWinners()` (standings with `rank = 1`, joined to `rph_event_id`). A small `fetchAllRanges(buildQuery)` helper pages `.range()` in 1,000s.

`api/_lib/tournamentImport.ts` gains `eliminationPhaseName(eventDetails)` (the `RANKED_SINGLE_ELIMINATION` phase's `phase_name`, or null) and `eventDateOf(eventDetails)` (local calendar date of `start_datetime` in the event's `timezone`, via `Intl.DateTimeFormat('en-CA', { timeZone })`, falling back to the UTC date when `timezone` is missing or invalid). `handleImport` uses `eventDateOf` for `eventDate`.

### Migration `supabase/migrations/018_tournament_history_event_date.sql`

```sql
-- Backfill event_date from the stored RPH payload: the import read a field
-- RPH doesn't send (start_date), so every row imported so far has NULL here.
UPDATE public.tournament_history_events
SET event_date = ((raw_event_details->>'start_datetime')::timestamptz
                  AT TIME ZONE COALESCE(NULLIF(raw_event_details->>'timezone', ''), 'UTC'))::date
WHERE event_date IS NULL AND raw_event_details->>'start_datetime' IS NOT NULL;

-- The public event page reads a whole event's elimination matches by event.
CREATE INDEX IF NOT EXISTS tournament_history_matches_event_idx
  ON public.tournament_history_matches (event_id, phase_name);
```

Applied to the live project (`nnuqpxygtivrvvsnpzaz`) through the Supabase MCP `apply_migration`; both statements are additive and idempotent. Verify afterwards: `SELECT count(*) FROM tournament_history_events WHERE event_date IS NULL` returns 0.

## Client

### `src/lib/tournamentHistoryApi.js`

Add `publicFetch(query)` — same error handling as `apiFetch`, no `Authorization` header (a public read must never carry a session token: it is not needed, and a token on the request would also defeat edge caching). Switch `fetchPlayerTournamentHistory`, `fetchHeadToHead`, `searchTournamentPlayers` to it. Add `fetchArchiveEvents()`, `fetchArchiveEvent(eventId)`, `fetchArchiveEventPlayer(eventId, playerId)`, `fetchArchivePlayer(playerId)`. Admin and badge calls keep `apiFetch`.

### `src/lib/resultsArchive.js` (pure, unit-tested in `src/lib/__tests__/resultsArchive.test.js`)

- `MAJOR_MIN_PLAYERS = 32`; `isMajor(event)` → `startingPlayerCount >= 32`. The results list hides smaller events by default behind a "Show events under 32 players" checkbox, so the 4–8 player CCQ trials the discovery sweep picks up don't bury the DLCs.
- `matchOutcome(match, playerId)` → `{ result: 'win' | 'loss' | 'draw' | 'bye', opponent: { id, name } | null, score: string | null }`. `score` is `"2-1"` from the player's point of view (`gamesWonByWinner`/`gamesWonByLoser` flipped for the loser), null when either is null. A match with `winnerId` null and not a draw/bye is `'draw'` (unreported result), matching `handleHeadToHead`'s existing convention.
- `toBracketMatch(match)` → the RPH match shape `EliminationBracket` renders: `{ round_number, table_number, phase_name, match_is_bye, match_is_intentional_draw: isDraw, match_is_unintentional_draw: false, winning_player: winnerId, status: 'COMPLETE', player_match_relationships: [{ player_order: 1, player: { id }, user_event_status: { best_identifier } }, …] }` (one relationship for a bye). This reuses the bracket component rather than writing a second one; its badge/favorite/pairing props are all optional and left undefined.
- `playerSummary({ events, matches, playerId })` → `{ eventsPlayed, topCuts, bestFinish: { rank, eventId, eventName, startingPlayerCount } | null, record: { wins, losses, draws }, rivals: { playerId, playerName, meetings, wins, losses, draws }[] }`. Record excludes byes. `bestFinish` is the lowest `rank` (ties → larger event). Rivals: group non-bye matches by opponent id, sorted by meetings desc then wins desc, top 10, name from the most recent meeting.
- `formatEventDate(yyyyMmDd)` → `"10 Jan 2026"` style, `"—"` for null. Date-only strings must be parsed as local calendar dates (split on `-`), not via `new Date('2026-01-10')`, which is UTC and shifts a day west of Greenwich.

### Pages

All three use `PageHeader`, `Card`, `Input`, `Badge`, `Tabs`/`Tab`, `StatCard`, `Button` from the design system, the full-width `w-full px-6 py-8` wrapper, and palette classes only (no `dark:` variants, no hex). Loading state is the small forge spinner pattern used in `PlayerMatchHistory`; errors render a short message in a `Card`, never a white screen.

**ResultsPage** — header "Tournament Results" / "Final standings, brackets and player records from every major event in the archive." A search `Input` ("Find a player…", debounced 300 ms, min 3 chars) shows a dropdown list of `{ playerName, lastSeenEventName }` rows linking to `/results/players/:id`. Below it the checkbox "Show events under 32 players" (off by default) and a table: Date · Event · Store · Format · Players · Winner. Event cell links to the event page; Winner links to the player page. Empty archive → "No events imported yet." Footer line on all three pages: "Results as published on Ravensburger Play Hub. Players appear under the name they registered with."

**ResultsEventPage** — header is the event name; description line "{date} · {store} · {format} · {players} players · {swiss} Swiss rounds · Top {cut}" (omit missing pieces), with a quiet `Button href` "View on Play Hub" when `eventUrl` is set. Tabs: **Standings** (always) and **Bracket** (only when `bracket.length > 0`). Standings: a name-filter `Input`, then Rank · Player (link) · Record · Points, with a forge `Badge` "Top cut" on `madeTopCut` rows. Bracket: `<EliminationBracket allMatches={bracket.map(toBracketMatch)} phaseName={bracket[0].phaseName} />`. Unknown id → "Event not found" card with a link back to `/results`.

**ResultsPlayerPage** — header is the player name, description "Across {n} imported events". Four `StatCard`s: Events played, Top cuts, Best finish ("3rd of 2,052" linking to the event), Match record ("41-17-2"). Then a Card "Events" table: Date · Event · Finish ("#12 of 2052") · Record · Top cut badge; clicking a row expands it inline and fetches `fetchArchiveEventPlayer` once, rendering Round · Opponent (link) · Result · Score via `matchOutcome`. Then a Card "Most-faced opponents" listing `rivals` as Name (link) · Meetings · Record. Unknown id → "Player not found" card.

### Cross-links and SEO

- `PairingHistoryPanel`'s `PlayerSummaryCard` gets a "Full history →" link to `/results/players/:id` under the top-cut list, so casters can open the full page from the modal.
- `routeTitle.js`: `TITLES['/results'] = 'Tournament Results'`, `PREFIXES` gains `['/results/', 'Tournament Results']`, `DESCRIPTIONS['/results']` = "Final standings, top-cut brackets and cross-event player records from Disney Lorcana Challenges, qualifiers and other major events."
- `public/sitemap.xml`: add `/results` at priority 0.8. Per-event and per-player sitemap entries are a follow-up (they need a build-time or runtime data fetch; not in scope).
- `prerender.js` is deliberately **not** extended: it runs against `vite preview`, where `/api/*` functions don't exist, so it would snapshot the error state.
- `siteSections.js`: new tool `{ path: '/results', name: 'Tournament Results', icon: 'podium', description: 'Browse final standings, top-cut brackets and every player\'s record across imported Disney Lorcana Challenges, qualifiers and other major events.' }` in Tournament Tools, placed first. `toolIcons.js` gains `podium`.

## Out of scope (deliberately)

- Archetype/decklist tagging of results (no deck data in the archive).
- A Player Pages sitemap or prerender.
- Any change to the import discovery sweep or event tiers.
- Merging with `/players/:name` (duels.ink opponent profiles).

## Testing

- Unit: `resultsArchive.test.js` covers `matchOutcome` (win/loss/draw/bye/unreported, score flip), `toBracketMatch` (two players and a bye), `playerSummary` (record excludes byes, best finish tie-break, rivals ordering and cap), `isMajor` boundary, `formatEventDate` (null, and that `2026-01-10` renders as 10 Jan regardless of TZ). `siteSections.test.js` and `routeTitle.test.js` keep passing with the new entries.
- `npm run lint`, `npm test`, `npm run build` all green before push.
- Manual: the three pages against the Vercel preview (local `npm run dev` has no `/api` functions, so the pages can only show their error state locally — the PR should say so if the preview is SSO-gated and screenshots couldn't be taken).
