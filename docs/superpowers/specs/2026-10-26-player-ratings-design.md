# Player ratings from the Tournament History archive (Glicko-1)

**Status:** approved for implementation. Public on the `/results/*` pages; surfaced on the Stream Overlay player card and caster notes.

## Player problem

The archive holds every result from 195 imported events, but a player page says only "events played, top cuts, best finish". Nothing answers "how strong is this player?" or "who are the strongest players on this weekend's bracket?", which is what players search for after an event and what casters want on air.

## Data check (2026-10-26, live project)

| Fact | Value |
|---|---|
| Matches | 140,316 |
| Byes (`is_bye`) | 816 |
| Draws (`is_draw`) | 3,695 |
| Not bye, not draw, `winner_id` null (unreported / dropped) | 3,236 |
| `winner_id` not one of the two players | 0 |
| Events, all with `event_date` | 195 (2025-07-19 to 2026-10-24) |
| Dates with more than one event | 50 |
| Distinct players | 17,846 |
| Players with 8+ matches | 12,850 |
| Players with 20+ matches | 4,168 |

Every match carries both `rph_player_id`s (`player1_id`/`player2_id`), `winner_id`, `is_bye`, `is_draw`, `round_number`, `phase_name` and its event's `event_date`. That is everything Glicko needs. The data is bursty (6 to 12 matches per event, events weeks apart, most players seen once), which is the case Glicko's rating deviation exists for.

## The rating

Glicko-1 (Glickman, "The Glicko system"), not Glicko-2: volatility adds nothing for players who play a few bursts a year.

- Scale: rating 1500 ± 350 for a new player (`INITIAL_RATING`, `INITIAL_RD`). `q = ln(10) / 400`.
- **Rating period = one event.** Events are processed in `event_date` order, ties by `rph_event_id`; all of an event's non-bye, non-draw-less matches update together, so round order inside an event does not matter. Swiss and top cut both count.
- Scores: win 1, loss 0, draw 0.5. Byes and matches with no winner (not bye, not draw, `winner_id` null) are skipped.
- **Deviation inflation** before a player's period: `RD = min(sqrt(RD² + c² · days_since_last_period), 350)`, with `c` chosen so a well-known player (RD 60) returns to 350 after 365 days of absence: `c = sqrt((350² − 60²) / 365) ≈ 18.05`. A player's first period starts from 1500 / 350 with no inflation.
- Update per period, for player with (r, RD) against opponents j with (r_j, RD_j) as they stood **at the start of the period** (opponents' ratings do not change mid-period):
  - `g(RD) = 1 / sqrt(1 + 3 q² RD² / π²)`
  - `E_j = 1 / (1 + 10^(−g(RD_j)(r − r_j) / 400))`
  - `d² = 1 / (q² Σ g(RD_j)² E_j (1 − E_j))`
  - `r' = r + q / (1/RD² + 1/d²) · Σ g(RD_j)(s_j − E_j)`
  - `RD' = sqrt(1 / (1/RD² + 1/d²))`
- **Established** means `RD ≤ 100`; otherwise the rating is **provisional** and the player is shown with the rating but not ranked.

The pure function must reproduce Glickman's worked example: a 1500/200 player who beats 1400/30, loses to 1550/100 and loses to 1700/300 in one period ends at **1464 / 151.4** (round to one decimal). That is the first unit test.

## What the user sees

- **`/results/ratings`** (new public page, "Player Ratings", linked from the Tournament Results header and the catalog under Tournament Tools): the top 100 established players: rank, name (link to their player page), rating ± RD, matches, record, last event, change since their previous event. A note above the table: "Glicko rating over imported majors and side events; a player is ranked once their rating deviation is 100 or under, which takes about two events."
- **`/results/players/:id`**: a "Rating" tile beside the existing ones, reading `1,712 ± 60` with rank `#14` when established or "Provisional" when not, and a small rating-over-events line under it (one point per event, `history`).
- **Stream Overlay player card** (`buildPlayerCard`): a rating per side, shown on the card beside the Majors tile; `casterPoints()` gets one sentence ("Rated 1,712, ranked 14th in the archive") when established. **`PairingHistoryPanel`**: the same number per player.

## How it works

**Pure math** in `api/_lib/glicko.ts`: `g()`, `expectedScore()`, `updatePlayer(player, results)`, `inflate(player, days)`, and `rateEvents(events)` which takes `[{ rphEventId, eventDate, matches: [{ player1Id, player2Id, winnerId, isDraw }] }]` in any order and returns `Map<playerId, { rating, rd, matches, wins, losses, draws, lastEventDate, history: [{ rphEventId, eventDate, rating, rd }] }>`. No I/O, fully tested in `api/_lib/__tests__/glicko.test.ts` (the worked example; ordering independence inside a period; inflation cap at 350; byes and unreported matches skipped; draws as 0.5).

**Storage**: migration `025_tournament_history_ratings.sql` creates `tournament_history_ratings` (`player_id text primary key`, `player_name text`, `rating numeric`, `rd numeric`, `matches int`, `wins int`, `losses int`, `draws int`, `last_event_date date`, `history jsonb`, `updated_at timestamptz`), RLS enabled with zero policies like its sibling tables (service-role only). An index on `(rd, rating desc)` serves the leaderboard. **Write the file only; do not apply it live** (the integrator applies it through the Supabase MCP).

**Recompute** is always from scratch (an import can add an older event, which changes everything after it): `recomputeRatings()` in `api/_lib/tournamentHistorySupabase.ts` reads every match (`event_id, player1_id, player1_name, player2_id, player2_name, winner_id, is_bye, is_draw`, joined to the event's `rph_event_id` and `event_date`), runs `rateEvents()`, and upserts the result in chunks of 1,000. Two things to know: supabase-js returns at most 1,000 rows per request unless `.range()` pages are used, so page the match read explicitly; and a Vercel Hobby function defaults to 10 s, so set `maxDuration` for `api/tournament-history.ts` in `vercel.json` (60 is allowed) and keep the match read to the columns above. The endpoint is `?endpoint=recompute-ratings`, POST, accepted with either an admin session (`requireAdmin`) or the `CRON_SECRET` bearer, the same way the ticks are gated. `AdminTournamentImportPage` gets a "Recompute ratings" button that calls it and shows the player count and elapsed time; a new workflow `.github/workflows/ratings-recompute.yml` calls it nightly (03:00 UTC) with `CRON_SECRET` so an import never leaves ratings stale for more than a day.

**Read endpoints** on `api/tournament-history.ts` (no new function file): `?endpoint=ratings` returns `{ updatedAt, players: [{ rank, playerId, playerName, rating, rd, matches, wins, losses, draws, lastEventDate, delta }] }` for established players ordered by rating, top 100, edge-cached like the other archive reads. `player` and `player-history` gain `rating: { rating, rd, matches, rank, established, history }` (`rank` null when provisional; `null` rating when the player has no rated matches). Rank is computed at read time by counting established players with a higher rating, one indexed query.

**Client**: `tournamentHistoryApi.js` gains `fetchRatings()`; `resultsArchive.js` gains `formatRating()` (`1,712 ± 60`) and `ratingDelta()`; the page and tiles above; `streamOverlay.js`'s `buildPlayerCard()` carries `rating` and `rank` per player and `casterPoints()` adds its sentence, with the fixture in `streamOverlay.test.js` extended.

**Docs**: a "Player ratings" section in `docs/agents/tournaments.md` (the model, the recompute, the thresholds), the route in CLAUDE.md's routes table and the table in its Storage table, the API endpoints in `docs/agents/api-routes.md`, a `docs/TOOLS.md` entry under Tournament, and a screenshot of the ratings page and the player tile for the PR per `docs/agents/ui-screenshots.md` (mock `?endpoint=ratings` and `?endpoint=player` responses with `page.route`).

## Build order

1. `glicko.ts` + tests against the worked example.
2. Migration file, `recomputeRatings()`, the `recompute-ratings` endpoint, `vercel.json` `maxDuration`, the admin button, the workflow.
3. `ratings` endpoint and the `rating` field on `player` / `player-history`; client functions.
4. `/results/ratings` page, the player tile and sparkline, the catalog entry.
5. Player card, caster points, `PairingHistoryPanel`.
6. Docs, screenshots.

## Risks

- Ratings get argued about. The page says what they are and are not (imported events only, Glicko, provisional until RD ≤ 100). Never rank a provisional player.
- The 3,236 unreported matches are skipped, not counted as losses; say so in the docs.
- Recompute time grows with the archive. At 140k matches the math is milliseconds; the read is the cost, hence paging and `maxDuration`.
