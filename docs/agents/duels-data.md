# duels.ink data: match history, gamelogs, meta stats and the tools on them

Read before touching Match History, Analytics, the Library and player profiles, Winrate Matrix, Meta Synthesis, Deck Doctor, the Deck Iteration Lab, Practice Plan, Stock Deck Lists, Deck Insights or the Game Scraper. The `duels-api-docs` skill fetches the upstream docs; `gamelog-pipeline` holds the parsing invariants; `chrome-extension-mv3` holds the scraper's 4-script relay.

## Match History Game Object Shape

Key fields on game objects from the duels.ink API:
- `your_player` (1 or 2), `your_deck_id`, `your_deck_colors` ("ruby/sapphire"), `your_decklist` (array of `{cardId, count}`)
- `opp_display_name`, `opp_deck_colors` (the opponent's decklist is never returned)
- `started_at` (ISO string — game time), `went_first`, `result`, `queue_name`
- `gamelog_id`, `mmr_delta`, `your_lore`, `opp_lore`

## Match History Filters

`MatchHistoryPage` uses a cascading filter pattern where each filter layer narrows the options available to filters below it:

```
games → afterDate → afterQueue → afterMyColors → afterOppColors → filteredGames
```

`SessionInsights` (the Sessions & Tilt card) reads `filteredGames`, so every filter above scopes it too.

Color options exclude 3+ ink entries (sealed/limited formats). Deck identity uses `your_deck_id` (stable API field) with `deckFingerprint(your_decklist)` as fallback. Deck names are stored in localStorage under `lorcana_deck_names`.

`sessionStats.js` behind the Sessions & Tilt card: `buildSessions()` excludes bot games and starts a new session after a `SESSION_GAP_MINUTES` (30) gap between `ended_at` and the next `started_at`; it throws on a row missing either timestamp. Also `winRateByPosition()`, `winRateAfterLossStreak()` (streaks reset at session boundaries, and draws don't move them), `winRateByTimeOfDay()`/`winRateByDayOfWeek()` (browser-local time), and `stopLossSuggestion()`, which only suggests a break when the after-streak gap's `diffInterval()` is entirely below zero with at least 15 games.

## Gamelog Pipeline

This is the most complex data flow in the app:

1. `fetchGamelogBuffer(gameId)` in `duelsApi.js` hits `/api/duels?endpoint=gamelog`, which fetches a gzip binary from `https://duels.ink/g/{id}`
2. `decompressGzip(arrayBuffer)` in `parseGamelog.js` decompresses via native `DecompressionStream('gzip')`
3. `parseGamelog(id, logs, meta)` processes an array of log entries with `{type, player, turnNumber, data, visibility}` shape into a structured object with per-player draw sequences, challenges, lore events, and card effects
4. The result is saved to IndexedDB via `gamelogHistory.js` and displayed in `AnalyticsPage` or `GameView`

Key parsing details in `parseGamelog.js`:
- `ON_PLAY_DRAWS` map tracks cards that draw on play (e.g. Junior Woodchuck Guidebook → 2 draws); uses `pendingDrawSource`/`pendingDrawCount` to attribute subsequent `CARD_DRAWN` events to the source card
- `CARD_PUT_INTO_INKWELL` with `fromZone === 'field'` means the *other* player caused the removal (e.g. Let It Go, Hades) — attribute as effectRemovals on the other player's last played card
- `lastPlayedByPlayer` tracks the most recently played card per player for effect attribution
- `plays: [{ turn, player, cardName, cardId }]` lists every `CARD_PLAYED` in event order; `turns[].plays` is only a count

## Turning points

The Analytics section of that name (`components/analytics/TurningPoints.jsx`) and the drilldown's lore race (`LoreRaceChart` in `GamelogDetail.jsx`) run on `turningPoints.js` (pure, tested). A round is duels.ink's shared `turnNumber` (the first player's opening round is solo), and the UI says "round".
- **Lore curve** (`loreCurve`): each player's total after each round 0..N, carried forward from `loreEvents`, both starting at 0.
- **Decisive round** (`decisiveRound`): the first round after which the winner's lead is never lost or tied again; a wire-to-wire game's is the round of the winner's first lore. Null for a game without a winner and for one the winner did not finish ahead on lore (a concession or timeout while level or behind), so those count as games but not in the decisive-round stats.
- **Deficit** (losses): the winner's lead at the decisive round. **Comeback**: a win in which you trailed by `COMEBACK_LORE` (5) or more at any round from round 3 on. **Late-deficit win rate**: your win rate in games where you trailed by 5 or more after round 5.
- `aggregateTurningPoints(games)` takes games with `myPlayerNum` resolved (Analytics passes its enriched games, so every filter applies) and leaves out games without a winner. "Usually decided on round a to b" is the middle half (quartiles) of the decisive rounds. Rates carry `wilsonInterval()` and `n`; under `MIN_GAMES` (10) the section says "Import more games", and each sentence needs 5 games of its own.
- The decisive-round cards come from the parser's `plays`. `AnalyticsPage` adds `plays` to a stored record that has `_rawLogs` but no `plays` after the games render (an effect on `games`, written back with `saveGamelog`); a record without `_rawLogs` simply has no card data.

## Chrome Extension

`/chrome-extension/` is a separate artifact built with Manifest V3. `npm run build` calls `build-extension.js` which packages it into `/public/lorcana-extension.zip`. It does not share source with the main React app.

Data flow when spectating a duels.ink game:

1. User visits `duels.ink/spectate/{uuid}`
2. `patch.js` (MAIN world, `document_start`) patches `WebSocket.prototype` to intercept all game messages
3. `relay.js` (ISOLATED world) receives `postMessage` from `patch.js` and forwards to `background.js`
4. `background.js` (service worker) stores game state in `chrome.storage.local` under `lorcana_active_games`, keyed by UUID; prunes entries older than 2 hours
5. `bridge.js` (injected on lorcana-pro-tools pages) polls `chrome.storage.local` and posts a `lorcana_active_games` message to the page
6. `GameScraperPage` listens for the message and renders the live game state

The extension merges incoming `spectator_update` payloads — any field that ever appeared in a game's `meta` is retained across updates.

## Unified Opponent Profiles

`/library?tab=players` and `/players/:name` merge two independent opponent-tracking systems into one view — there is no route dedicated to gamelog-only opponent data anymore (`/opponent-directory` redirects to `/library?tab=players`):
- **Scouted games** (`scoutedGames.js`) — full board-state snapshots captured via the Chrome extension or an imported shared snapshot. Games may not even involve the signed-in user (spectating two strangers is possible), so stats here are tracked per named player as *that player's own* record, not "my record against them".
- **Imported duels.ink gamelogs** (`gamelogHistory.js`, aggregated per-opponent by `opponentDirectory.js`'s `buildDirectory()`) — always games the signed-in user actually played, with coarser per-card totals (played/inked/discarded/destroyed) but no turn-by-turn detail. `buildDirectory()`'s `wins`/`losses` are from *my* perspective (my record against that opponent); `playerProfiles.js` flips them (`wins`/`losses` swapped) when merging so the unified profile's `wins`/`losses` consistently mean "this opponent's own record", matching the scouted side.

`playerProfiles.js` does the merge:
- `listPlayers(records, gamelogs)` — per-opponent summary (games/W-L/deck count) for the Players tab list, keyed by name across both sources. `scoutedGameCount`/`gamelogGameCount` are broken out so the UI can show where the numbers came from.
- `buildPlayerProfile(records, gamelogs, name)` — full per-opponent detail for `PlayerProfilePage`. Decks are bucketed by ink-color key (`matchupKey()`) and merged via `mergeDeckBuckets()`: a deck seen in only one source keeps that source's fields (`hasScoutedData`/`hasGamelogData` flags tell the UI which); a deck seen in both sums games/wins/losses and combines card stats by name (scouted `plays`/`inks` — max observed in a single game, used for the inferred-decklist `estimatedCopies` — alongside gamelog `played`/`inked`/`discarded`/`destroyed`, summed across games). Play-pattern stats (quests/turn, ink rate, went-first rate) require the full per-turn log a gamelog import doesn't carry, so they're scouted-only and read as 0 for a gamelog-only deck.

The two sources can't be deduplicated against each other — there's no shared game ID between a spectated match and a duels.ink gamelog export — so if the same physical game was somehow captured by both, it's counted twice rather than merged 1:1. In practice this is rare enough not to matter (spectating your own game and also importing its gamelog).

## Winrate Matrix & Metagame Analysis

`AnalyticsPage` builds its matchup matrix from imported gamelogs (`gamelogHistory.js`) via `buildWinrateMatrix.js`. (`WinrateMatrixPage` is unrelated — it pulls public meta stats from the duels.ink API via `fetchStats`, not local records.) `buildWinrateMatrix.js`:
- Groups games by `(myColors, oppColors)` pair using sorted JSON string keys
- Tracks wins, games, and first/second player splits per matchup
- Returns `{ matchups, colorPairs, totalGames, winLossMatrix }` — the matrix is a nested map `[playerColorKey][oppColorKey]`

`metagameAnalysis.js` (`analyzeOpponentMetagame`) groups by opponent color pair and returns frequency + win rate sorted by game count.

`WinrateMatrixPage` (defaults to Core Bo1) has two collapsible sections. **Win Rates** (open by default) groups by Archetypes (default) or Ink pairs and shows a Matrix (default) or a List; the archetype matrix is `archetypeMatrix()` (`metaSynthesis.js`) — archetypes with ≥1% of the meta, pairings under 30 games blanked — and the archetype list expands a row's matchups inline. **Archetype Meta Drift** is built on grouped archetypes (`aggregateArchetypes`, below). When opened, it fetches the last 5 of `meta.availableWeeks` (`period=week:<startDate>`) for the selected queue/ranks in parallel. `archetypeDrift()` (`metaDrift.js`) gives one row per archetype with each week's win rate, games and play rate, plus the overall change from the first week to the latest complete week (not week-over-week), plus a "Last week" column for the latest complete week vs the one before; each change header names its span. The in-progress week is shown but excluded, since its sample is partial. Rows sort by the latest complete week's games or win rate. Clicking an archetype expands `archetypeMatchupDrift()` in a row directly beneath it: its win rate vs each other archetype per week (mirrors omitted). Nothing is stored — it works on a first visit. "% of the meta" everywhere (this page, Meta Synthesis) is `metaShare()` (`metaSynthesis.js`): share of decks, archetype games ÷ (2 × `activity.totalGames`), since every game has two decks (`colorPairs` games sum to exactly 2× `totalGames`). duels.ink's own "play rate" divides by games and is twice this. Named archetypes cover ~80% of decks in Core, so their shares sum to less than 100%. (Drift used to diff daily color-pair snapshots saved in IndexedDB; `db.js` v5 drops that `metaSnapshots` store.)

The page's Archetypes table uses `aggregateArchetypes()` (`metaSynthesis.js`), same as Meta Synthesis: duels.ink's `profiles` are per-build-variant clusters, it reuses one `archetypeName` across several `archetypeSlug`s of the same colors, and one slug can carry several names — so profiles are grouped by colors + `archetypeName`, the only distinction a player can see (Core Bo1 Set 13: 89 named profiles → 30 archetypes). `archetypeMatchups` is keyed by profile `id` and is rolled up to the same groups by `archetypeMatchupSummary()`.

## Meta Synthesis

`MetaSynthesisPage` turns duels.ink's `/api/stats/meta` response (`fetchStats`) into plain English. `metaSynthesis.js` holds pure, unit-tested functions:
- `aggregateArchetypes()` merges duels.ink's per-variant cluster profiles into one archetype per colors + archetype name.
- `buildSynthesis()` covers most-played, top and bottom win rate with a sample floor, matchup summaries, and best/worst signature cards.
- `compareRankBands()` / `compareWeeks()` produce the "higher ranks vs lower" and "this week vs last" deltas.

The page defaults to the user's own rank band (`fetchCurrentMmr` → `rankTiers.js`) and the latest week, offers Core/Infinity × Bo1/Bo3, persists filters in localStorage (`lorcana_meta_synthesis_filters`), and has a share image (`metaSynthesisShareImage.js`).

## Deck Doctor

`DeckDoctorPage` (`/deck-doctor`, supporter-gated, Coaching Tools) joins three things the app already has for one deck. All logic is in `deckDoctor.js` (pure, unit-tested); the page composes it and the `components/deckDoctor/*` sections.

- **Your list and results** come from match history (`fetchAllMatchHistory()`): every row carries the exact `your_decklist`, so decks group by `your_deck_id` (else list fingerprint) as on Match History, and a deck's versions are its games grouped by fingerprint. Sealed/draft queues are excluded. Match-history queue ids aren't stats queue keys, so decks aren't filtered by queue; choosing a deck defaults the field queue from its `queue_name` (`defaultQueueFor()`), and the user can override. A pasted `4 Card Name` list works too (field sections only); LorcanaJSON lists a reprint under each printing's id and duels.ink names one, so `countsFromPasted()` takes the printing the feed uses (`fieldCardIds()`).
- **The field** is `fetchStats({ queue, period: 'all_time' })`, current era only. `assignArchetype()` scores each same-colour archetype (`aggregateArchetypes()`) by overlap with its representative variant's `centroidCounts` — Σ min(yours, centroid) ÷ the larger deck — and assigns none below 50% (`MIN_ARCHETYPE_OVERLAP`); a picker offers the others with their overlap. Lift comes from the profile's `cardLift` and from `pairCardLift`, a per-colour-pair list of 10 lift entries the feed also carries, keyed `amber/ruby` (lowercase, sorted, `/`). The field's matchup rate is `archetypeMatchups` rolled up from profile ids to opponent colour pairs (as side B, wins = games − winsA), falling back to colour-pair `matchups` when no archetype is assigned.
- **Your cards** are `computeCardImpact()` over imported gamelogs whose `deck_id` matches, with `fetchPersonalStats()` deck versions as Analytics does; without imports the section is a prompt.

Every read of the undocumented fields is null-safe and hides its own section. With no profiles for the era the page shows a banner and only the verdict and your own sections. Note on the feed (checked 2026-10-22): an unscoped `period=all_time` call returns no profiles for Set 14, but the era-scoped call `fetchStats` makes (`era=set-14-core`) returns 78; an unknown era key silently falls back to the current era (`meta.eraResolution: 'current'`), and Set 13's key is `set-13`.

## Deck Iteration Lab

`DeckLabPage` (`/deck-lab`, supporter-gated, Coaching Tools) loads the whole match history (`fetchAllMatchHistory({ limit: 250, maxPages: Infinity, onPage })`, progress shown as it pages) and runs it through `deckVersions.js`: `fromMatchHistoryRow()` → `buildDeckVersions(games, buildCardIdToName(cards))`. Versions are keyed by card *name*, so a reprint or promo swap stays one version (`docs/FEATURE_PROPOSALS.md` §3 has the evidence). A card id missing from LorcanaJSON makes `buildDeckVersions()` throw, and the page shows that error rather than guessing. The timeline and compare views are `components/deckVersions/DeckVersionTimeline` and `DeckVersionCompare`, built to be reused by Match History and Analytics (build steps 4 and 5). Deck names come from `lorcana_deck_names` plus `fetchDecks()`; `?deck=<your_deck_id>` selects a deck.

## Stock Deck Lists

`StockDecksPage` (`/stock-decks`) shows a starting list for every named duels.ink archetype, grouped by ink pair. Each folder in `STOCK_DECK_FOLDERS` (`stockDecks.js`) pins one duels.ink queue + era (`fetchEraStats()` in `duelsApi.js`, `period=all_time`), so an old set's folder keeps showing that set's lists; add a folder per new set or meta. A list is the `centroidCounts` (duels.ink's average build, cardId → copies) of the archetype's most-played variant (`representativeProfile()` in `metaSynthesis.js`). Centroids occasionally total 61–62 cards; the page shows the real total rather than trimming.

`ForgeDecksPage` (`/forge-decks`) shows the site's own recommended lists in the same folders, one file each at `content/forge-decks/<folder id>/<slug>.txt`: a `name`/`inks`/optional `note` frontmatter block (`frontmatter.js`, shared with the blog) over `4 Card Name` lines. `forgeDecks.js` loads them at build time and throws on a malformed file; card names are matched to LorcanaJSON `fullName` at runtime, and unmatched names are listed under the list rather than hidden. Adding a file publishes it.

## Deck Insights and hand inference

**Draw odds** (`DrawOddsPage.jsx`, which exports `DeckInsightsPage`): `drawOddsMath.js` uses log-space binomial coefficients to avoid overflow and the hypergeometric distribution for exact draw probabilities; `monteCarloSim.js` runs 10,000-iteration simulations for mulligan decisions, scry effects, multi-group joint probabilities and 12-turn quest-pressure curves.

**Hand inference** (`handInference.js` + `HandPredictor.jsx`): hypergeometric P(≥1 copy in hand) given remaining deck size and current hand size, combining observed deck composition with historical player profiles as a prior.
