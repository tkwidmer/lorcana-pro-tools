# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server (port 5173 or $PORT)
npm run build      # Build app + package Chrome extension
npm run build:ext  # Package the Chrome extension only
npm run lint       # ESLint (React hooks + refresh rules)
npm run preview    # Preview production build locally
npm test           # Run the Vitest unit suite once
npm run test:watch # Run Vitest in watch mode
```

Unit tests live in `src/lib/__tests__/` (Vitest) and cover the pure-logic libs:
`gameStats`, `handInference`, `inkColors`, `leakDetection`, `parseGamelog`,
`tournamentApi`. CI runs `npm test` on every push/PR (`.github/workflows/test.yml`).
UI and integration behavior is still validated manually.

## Pull Requests

When creating a pull request:

1. **Include Vercel preview link** — Add the live preview URL in the PR description so reviewers can test changes without building locally. Preview links follow the pattern `https://<branch-name>.<project>.vercel.app`
2. **Include screenshots for UI changes** — For any updates or new features affecting the user interface, capture and attach relevant screenshots in the PR body. Include before/after pairs when applicable

## Stack

React 19 + React Router 7 + Tailwind CSS 4 + Vite 8, deployed on Vercel. Serverless API routes live in `/api/*.ts` (TypeScript). Authentication via Supabase + Google OAuth. All game data is stored client-side in IndexedDB or localStorage. Supabase stores only the auth session plus a small `profiles` table that records each user's supporter tier (`supporter`/`admin`) — no game data is stored server-side.

## Environment Variables

Required in `.env` for local development:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Vercel also accepts `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` prefixes (both are checked in `supabaseClient.js`).

Optional: `VITE_DISCORD_CLIENT_ID` — the Application ID of the Discord bot (not a secret). When set, `HomePage` shows an "Add to Discord" card under a Community section linking to the bot's OAuth invite URL; when unset, that card is omitted.

Server-side only (set in Vercel, not `.env`):
- `DISCORD_PUBLIC_KEY` — used by `/api/discord-interactions` to verify Discord's request signature.
- `DISCORD_BOT_TOKEN` — used by `/api/discord-tournament-tick` to post proactive channel messages via the Discord Bot API (different from `DISCORD_PUBLIC_KEY`; this one's a real secret).
- `SUPABASE_SERVICE_ROLE_KEY` — used by `api/_lib/discordSupabase.ts` for server-side access to the `discord_favorite_players` table, bypassing RLS.
- `CRON_SECRET` — shared secret checked by `/api/discord-tournament-tick`; must match the same-named secret in the GitHub repo (Settings → Secrets and variables → Actions) used by `.github/workflows/tournament-tracker-tick.yml`.

See `discord-bot/README.md` for full setup.

## Architecture

### Pages → Shared Libs → Storage

Pages are in `src/pages/`. Each page is self-contained. Shared logic lives in `src/lib/`.

### Pages & Routes

Defined in `src/App.jsx`:

| Route | Page File | Purpose |
|---|---|---|
| `/` | `HomePage.jsx` | Dashboard — tool catalog organized into Resources, Deckbuilding, Coaching, Tournament, Scouting sections |
| `/login` | `LoginPage.jsx` | Google OAuth sign-in via Supabase |
| `/auth/callback` | `AuthCallbackPage.jsx` | OAuth redirect handler; checks session and redirects |
| `/proxy` | `ProxyGeneratorPage.jsx` | B&W proxy card generator — search cards, build print sheets (9/page) |
| `/coconut-deck-builder` | `CoconutDeckBuilderPage.jsx` | [Format Coconut] deck builder — pick a Coconut card, lock in up to 3 inks, build a singleton 60+ card deck with the format's copy-count exceptions enforced |
| `/cut-calculator` | `TournamentCutPage.jsx` | Swiss cut probability calculator using binomial/trinomial models |
| `/limited-guide` | `LimitedGuidePage.jsx` | Limited format reference — BREAD framework, mana curves, uninkable counts |
| `/deck-insights` | `DrawOddsPage.jsx` | Comprehensive deck analytics: draw odds, mulligan/scry simulation, keyword analysis, brickability, quest pressure curves |
| `/game-scraper` | `GameScraperPage.jsx` | Live game state viewer via Chrome extension (automatic) or bookmarklet (manual) |
| `/library` | `LibraryPage.jsx` | Saved games (`?tab=history`) and opponent player profiles (`?tab=players`) |
| `/scouting/game/:uuid` | `ScoutedGamePage.jsx` | Full game state replay with action log (single scraped snapshot) |
| `/players/:name` | `PlayerProfilePage.jsx` | Per-opponent stats — win rates, deck archetypes, matchup data |
| `/deck-comparison` | `DeckComparisonPage.jsx` | Paste two decklists to highlight differences |
| `/settings` | `SettingsPage.jsx` | Auth management and preferences |
| `/match-history` | `MatchHistoryPage.jsx` | duels.ink ranked match history with cascading filters |
| `/gamelog` | `GamelogViewerPage.jsx` | Load and display JSON gamelog files |
| `/analytics` | `AnalyticsPage.jsx` | Merged gamelog + team analytics — import your own games (.zip/.gz) or shared team exports; per-game drilldown (draw sequence, mulligans, leaks, challenge log), personal card/win-rate stats, and team-wide matchup matrix, metagame breakdown, and MMR/win-rate trends |
| `/winrate-matrix` | `WinrateMatrixPage.jsx` | Color-pair matchup matrix — head-to-head win rates, first-player advantage |
| `/practice-plan` | `PracticePlanPage.jsx` | Pre-tournament prep — select deck + meta, highlight matchups needing practice |
| `/leaderboard` | `LeaderboardPage.jsx` | duels.ink top 50 players by queue, MMR distribution |
| `/tournament-lookup` | `TournamentLookupPage.jsx` | Ravensburger live standings — paste event URL, find yourself, check tiebreakers, ID analysis |
| `/lore-tracker` | `LoreTrackerPage.jsx` | Mobile in-game lore counter with tap controls and audit log |
| `/admin` | `AdminPage.jsx` | Admin-only — search users by email and grant/revoke supporter access |

**Note:** `DrawOddsPage.jsx` exports `DeckInsightsPage` — the file name and component name differ.

**Supporter-gated routes:** These routes are wrapped in `<SupporterRoute>` in `App.jsx` and require an active supporter (or admin) — non-supporters see a gate: `/deck-insights`, `/game-scraper`, `/library`, `/scouting/game/:uuid`, `/players/:name`, `/match-history`, `/analytics`, `/practice-plan`, `/tournament-lookup`. The gated set is the single source of truth in `src/lib/access.js` (`SUPPORTER_PATHS`), reused by `HomePage` to badge tools as "Supporters". `/admin` enforces its own admin-only redirect via `useSupporter`.

All routes render inside a single `<ErrorBoundary>` (keyed on `location.pathname`) so a render-time throw in one tool shows a fallback instead of white-screening the SPA; `Nav` sits outside the boundary and stays usable.

Legacy redirects:
- `/replay-analyzer` → `/analytics`
- `/gamelog-analyzer` → `/analytics` (the two pages were merged into one — see below)
- `/team-analytics` → `/analytics` (renamed)
- `/game-library` → `/analytics`
- `/shared` → `/library`
- `/legality-checker` → `/deck-insights`

### Components

In `src/components/`:

| File | Purpose |
|---|---|
| `Nav.jsx` | Top navigation bar — settings link + a username dropdown (logout, plus an Admin link for admins); hidden on `/lore-tracker` |
| `ErrorBoundary.jsx` | Class-based error boundary with a "Something broke" fallback (Try again / Reload / Back to tools; dev-only stack trace). Resets when its `resetKey` prop changes. Wraps the routes in `App.jsx` |
| `SupporterRoute.jsx` | Route guard — renders children for supporters/admins, otherwise a "Supporters only" gate (sign-in CTA when logged out). Reads `useSupporter` |
| `GameView.jsx` | Unified game display — player panels (lore bar, ink meter, field, hand predictor), action log, export button; reused across `GameScraperPage`, `LibraryPage`, `ScoutedGamePage` |
| `HandPredictor.jsx` | Bayesian hand inference display — shows top 12 cards with P(≥1 in hand) given observed deck + player profile |
| `SearchBar.jsx` | Fuzzy card search dropdown with quantity selector (×1–×4); used by proxy generator |
| `ProxyCard.jsx` | Printable card proxy renderer — portrait (2.5"×3.5") and landscape (location) layouts; print-optimized with Georgia serif fonts |

Ink color images are rendered inline in each page — there is no shared `InkIcons` component. `MatchHistoryPage` defines a local `InkIcons` function; `AnalyticsPage` defines a local `InkImg` function. Both render `<img src={/ink/${inkName}.png} />`.

### Hooks

In `src/hooks/`:

| File | Returns | Purpose |
|---|---|---|
| `useAuth.js` | `{ user, isLoading, error }` | Supabase session — checks on mount, subscribes to auth state changes, and ensures a `profiles` row exists for the user |
| `useSupporter.js` | `{ user, isAdmin, isSupporter, tier, isLoading }` | Reads the user's `supporter_tier` from the `profiles` table; `isSupporter` is true for both `supporter` and `admin` |
| `useCards.js` | `{ cards, loading, error }` | Fetches card data from `/api/cards`, falls back to IndexedDB cache via `cardsCache.js` |

### Shared Libraries

In `src/lib/`:

| File | Purpose |
|---|---|
| `supabaseClient.js` | Supabase client init; exports `loginWithGoogle`, `logout`, `getSession`, `getCurrentUser` |
| `access.js` | `SUPPORTER_PATHS` set + `isSupporterPath()` — single source of truth for supporter-gated routes (used by `App.jsx` and `HomePage`) |
| `db.js` | IndexedDB abstraction for the `lorcana_pro_tools` DB — `openDB()`, `getTx()`, `promisify()` |
| `cardsCache.js` | IndexedDB card data caching (stored in `cards` store of `lorcana_pro_tools` DB) |
| `inkColors.js` | Ink color normalization — `resolveInkName()` (red→ruby, etc.), `resolveColors()`, `matchupKey()` |
| `scoutedGames.js` | IndexedDB CRUD for scraped game snapshots (`lorcana_pro_tools` DB, `games` store, keyed by `uuid`) — powers the Scouting Library |
| `coconutCards.js` | Static data for the 18 beta [Format Coconut] cards — ink, associated base card `fullName`, ability text, and the Nick Wilde → Pawpsicle extra-copy exception |
| `coconutFormat.js` | [Format Coconut] deck rules — `getCardLimit()` (1, or 4 for the Coconut card/its extra-copy exception), ink legality, and `validateDeck()` (60+ cards, singleton, ink) |
| `coconutDecks.js` | IndexedDB CRUD for saved Coconut decks (`lorcana_pro_tools` DB, `coconutDecks` store, keyed by `id`) |
| `gamelogHistory.js` | IndexedDB CRUD for parsed gamelogs (`lorcana_gamelogs` DB, `gamelogs` store, keyed by `id`) |
| `gameStats.js` | Aggregate stats across game records — matchups, card plays, ink curves |
| `gameSnapshot.js` | Export/import game state as JSON files for sharing |
| `playerProfiles.js` | Build opponent deck profiles and win rates from saved game history |
| `handInference.js` | Hypergeometric P(≥1 in hand) calculator — powers `HandPredictor` |
| `leakDetection.js` | Detect when hand information is leaked (quests, zones); used by `PracticePlanPage` and `AnalyticsPage` |
| `tournamentShareImage.js` | Renders a shareable summary image (canvas) for tournament/practice results |
| `parseGamelog.js` | Decompress gzip + parse raw gamelog entries into structured game state |
| `buildWinrateMatrix.js` | Aggregate color-pair matchup data from game records into a win/loss matrix |
| `metagameAnalysis.js` | Opponent metagame breakdown — deck frequency and win rates by color pair |
| `duelsApi.js` | duels.ink API client — match history, gamelog, replay fetches |
| `leaderboardApi.js` | Fetches duels.ink ranked leaderboards via `/api/duels?endpoint=leaderboard` |
| `tournamentApi.js` | Ravensburger tournament API — event details, standings, matches, registrations, ID analysis |
| `gameExport.js` | Serialize game records for sharing (used by `AnalyticsPage`) |
| `gameImport.js` | Deserialize imported game records |
| `exportGameIds.js` | CSV export of game IDs |

### Access Control & Supporters

- Supabase `profiles` table (`supabase/migrations/001_profiles.sql`, `002_admin.sql`) holds `supporter_tier` (`supporter` | `admin`), `supporter_source`, `supporter_since`. RLS lets users read their own row; only admins (via the `is_admin()` security-definer function, with `tkwidmer@gmail.com` as a JWT-email bootstrap fallback) may update tiers. A trigger auto-creates a profile row on signup.
- `useSupporter` reads the tier; `SupporterRoute` gates the routes in `SUPPORTER_PATHS`; `AdminPage` is the UI for granting/revoking access. Gating is client-side UX only — the `/api/*` proxies do **not** check supporter status.

### API Routes

Vercel serverless functions in `/api/*.ts`. Most are thin forwarding proxies with error handling and caching headers. No server-side auth on those — tokens are forwarded from the client.

| Endpoint | Upstream | Auth | Notes |
|---|---|---|---|
| `/api/duels` | Various duels.ink endpoints | Bearer token (except `stats`, `leaderboard`) | Single consolidated proxy for everything duels.ink, dispatched by `?endpoint=` — `match-history`, `gamelog`, `gamelog-bulk`, `replay`, `deck`, `stats`, `leaderboard`. Folded into one function (rather than one route per endpoint) because Vercel's Hobby plan caps a deployment at 12 serverless functions. `deck` additionally takes `?personalStats=1` to hit `/api/account/personal-stats` (undocumented — not in duels.ink's `/api-docs.md`) for per-deck-version stats, including each version's exact card list + timeframe, used by `AnalyticsPage`'s Card Impact (WAR) to confirm whether a card was actually in the deck for a given game. |
| `/api/tournament` | Ravensburger API | Public | Routes by `?type=` param: `event`, `matches`, `registrations`, `standings`; handles pagination |
| `/api/proxy` | duels.ink spectate | Cookie-based | Tries 3 endpoints; used by bookmarklet/direct URL approach |
| `/api/discord-interactions` | Discord Interactions webhook | Ed25519 signature (`DISCORD_PUBLIC_KEY`) | Not a proxy — implements the Discord bot's commands (Decode Deck QR, `/tournament`, `/favorite`, `/unfavorite`, `/favorites`) directly. See `discord-bot/README.md`. |
| `/api/discord-tournament-tick` | None (internal) | Shared secret (`CRON_SECRET`) | Called every 30 min by `.github/workflows/tournament-tracker-tick.yml`; posts an update to Discord for any favorited player whose rank/record changed, and auto-deactivates favorites once an event ends. |

LorcanaJSON card data (`/api/cards`) is a rewrite, not a serverless function — handled by Vite proxy in dev and by `vercel.json` in production, both pointing to `https://lorcanajson.org/files/current/en/allCards.json`.

### Discord Bot (`api/discord-interactions.ts`)

The Discord bot (message command "Decode Deck QR" + `/tournament`, `/favorite`, `/unfavorite`, `/favorites` slash commands) is implemented as a Vercel serverless function receiving Discord's HTTP Interactions webhook — not a persistent gateway process. `discord-bot/` only holds a one-time script to register the commands with Discord's API; the actual command logic lives in `api/discord-interactions.ts` and `api/_lib/discordQr.ts` / `discordTournamentApi.ts` / `discordTournamentEmbeds.ts`. Image QR decoding uses `jimp` + `jsqr` (not `sharp`, whose native binaries are a portability risk in a serverless bundle). `discordTournamentApi.ts` is a standalone port of `src/lib/tournamentApi.js` that calls the public Ravensburger API directly, since this function isn't behind `/api/tournament`. Requires a `DISCORD_PUBLIC_KEY` env var in Vercel for request signature verification. See `discord-bot/README.md` for full setup.

`/favorite url:<event> player:<name>` tracks a player in the channel it's run from; a scheduled tick (`api/discord-tournament-tick.ts`, triggered by GitHub Actions every 30 minutes — Vercel Hobby's Cron Jobs only run once/day, so that couldn't drive this) checks all active favorites, groups them by event to minimize API calls, and posts an update embed only when a tracked player's rank/record actually changed since the last check. Favorites are stored in the `discord_favorite_players` Supabase table (`supabase/migrations/003_discord_favorite_players.sql`) — RLS is enabled with zero policies, since this table is only ever touched server-side via `api/_lib/discordSupabase.ts` (a service-role client, bypassing RLS entirely; separate from the anon-key client the main web app uses). `/unfavorite` deactivates a tracked row; `/favorites` lists current ones in the channel. A favorite auto-deactivates once its event's current round can no longer be resolved (tournament finished).

### Storage

| Layer | DB / Key | Contents |
|---|---|---|
| IndexedDB `lorcana_pro_tools` v2 | `games` store (key: `uuid`) | Scraped game snapshots from `GameScraperPage` |
| IndexedDB `lorcana_pro_tools` v2 | `cards` store (key: `version`) | Cached LorcanaJSON card data |
| IndexedDB `lorcana_pro_tools` v3 | `coconutDecks` store (key: `id`) | Saved [Format Coconut] decks from `CoconutDeckBuilderPage` |
| IndexedDB `lorcana_gamelogs` v1 | `gamelogs` store (key: `id`) | Parsed gamelogs from `AnalyticsPage` |
| localStorage `duels_api_tokens` | — | Array of duels.ink Bearer tokens (multi-account); `duels_api_active_token_id` selects the active one. Legacy single-token `duels_api_token` is auto-migrated on first access (see `duelsApi.js`) |
| localStorage `lorcana_deck_names` | — | User-assigned deck names (keyed by `your_deck_id`) |
| localStorage (various) | — | Form state for `DrawOddsPage`, filter state, lore tracker (`lorcana_lore_tracker`), etc. |
| `chrome.storage.local` | `lorcana_active_games` | Active game states captured by the Chrome extension (2-hour TTL) |
| Supabase `auth` | session | Google OAuth user session |
| Supabase `profiles` table | row per user | Supporter tier metadata only (see Access Control); no game data stored server-side |

### External APIs

**duels.ink** — Authenticated via Bearer token. Tokens are stored in localStorage (`duels_api_tokens`, with `duels_api_active_token_id` choosing the active account) and managed on the Settings page. The active token is passed through the Vercel proxy routes. No server-side validation.

**LorcanaJSON** — Card data from `https://lorcanajson.org/files/current/en/allCards.json`. Cached in IndexedDB after first load. In dev, `vite.config.js` proxies `/api/cards`; in production, `vercel.json` rewrites it.

**Ravensburger Tournament API** — Public API for live tournament events. Accessed via `/api/tournament` which routes by `?type=` param. Pagination is handled by `fetchAllRegistrations()` in `tournamentApi.js` which loops until `next_page_number === null`. The `getTournamentStructure()` helper resolves current round, advancement requirements, and top-cut info from the raw event response.

### Gamelog Pipeline

This is the most complex data flow in the app:

1. `fetchGamelogBuffer(gameId)` in `duelsApi.js` hits `/api/duels?endpoint=gamelog`, which fetches a gzip binary from `https://duels.ink/g/{id}`
2. `decompressGzip(arrayBuffer)` in `parseGamelog.js` decompresses via native `DecompressionStream('gzip')`
3. `parseGamelog(id, logs, meta)` processes an array of log entries with `{type, player, turnNumber, data, visibility}` shape into a structured object with per-player draw sequences, challenges, lore events, and card effects
4. The result is saved to IndexedDB via `gamelogHistory.js` and displayed in `AnalyticsPage` or `GameView`

Key parsing details in `parseGamelog.js`:
- `ON_PLAY_DRAWS` map tracks cards that draw on play (e.g. Junior Woodchuck Guidebook → 2 draws); uses `pendingDrawSource`/`pendingDrawCount` to attribute subsequent `CARD_DRAWN` events to the source card
- `CARD_PUT_INTO_INKWELL` with `fromZone === 'field'` means the *other* player caused the removal (e.g. Let It Go, Hades) — attribute as effectRemovals on the other player's last played card
- `lastPlayedByPlayer` tracks the most recently played card per player for effect attribution

### Chrome Extension

`/chrome-extension/` is a separate artifact built with Manifest V3. `npm run build` calls `build-extension.js` which packages it into `/public/lorcana-extension.zip`. It does not share source with the main React app.

Data flow when spectating a duels.ink game:

1. User visits `duels.ink/spectate/{uuid}`
2. `patch.js` (MAIN world, `document_start`) patches `WebSocket.prototype` to intercept all game messages
3. `relay.js` (ISOLATED world) receives `postMessage` from `patch.js` and forwards to `background.js`
4. `background.js` (service worker) stores game state in `chrome.storage.local` under `lorcana_active_games`, keyed by UUID; prunes entries older than 2 hours
5. `bridge.js` (injected on lorcana-pro-tools pages) polls `chrome.storage.local` and posts a `lorcana_active_games` message to the page
6. `GameScraperPage` listens for the message and renders the live game state

The extension merges incoming `spectator_update` payloads — any field that ever appeared in a game's `meta` is retained across updates.

### Match History Filters

`MatchHistoryPage` uses a cascading filter pattern where each filter layer narrows the options available to filters below it:

```
games → afterDate → afterQueue → afterMyColors → afterOppColors → filteredGames
```

Color options exclude 3+ ink entries (sealed/limited formats). Deck identity uses `your_deck_id` (stable API field) with `deckFingerprint(your_decklist)` as fallback. Deck names are stored in localStorage under `lorcana_deck_names`.

### Match History Game Object Shape

Key fields on game objects from the duels.ink API:
- `your_player` (1 or 2), `your_deck_id`, `your_deck_colors` ("ruby/sapphire"), `your_decklist` (array of `{cardId, count}`)
- `opp_display_name`, `opp_deck_colors`, `opp_decklist`
- `started_at` (ISO string — game time), `went_first`, `result`, `queue_name`
- `gamelog_id`, `mmr_delta`, `your_lore`, `opp_lore`

### Winrate Matrix & Metagame Analysis

`AnalyticsPage` builds its matchup matrix from imported gamelogs (`gamelogHistory.js`) via `buildWinrateMatrix.js`. (`WinrateMatrixPage` is unrelated — it pulls public meta stats from the duels.ink API via `fetchStats`, not local records.) `buildWinrateMatrix.js`:
- Groups games by `(myColors, oppColors)` pair using sorted JSON string keys
- Tracks wins, games, and first/second player splits per matchup
- Returns `{ matchups, colorPairs, totalGames, winLossMatrix }` — the matrix is a nested map `[playerColorKey][oppColorKey]`

`metagameAnalysis.js` (`analyzeOpponentMetagame`) groups by opponent color pair and returns frequency + win rate sorted by game count.

### Tournament Lookup

`TournamentLookupPage` accepts a Ravensburger tournament URL and extracts the event ID. It uses `tournamentApi.js` for all data:
- `fetchEventDetails` → raw event + phases + rounds
- `getTournamentStructure` → resolved current round, top-cut size, rounds remaining, advancement requirements
- `fetchTournamentStandings` → paginated standings for a specific round
- `fetchAllRegistrations` → all registered players (paginated loop)
- `analyzeId` → ID safety analysis: compares player's points buffer vs cut line, counts players who could pass them if everyone wins
- `analyzeAdvancement` → status (secured/possible/eliminated) toward the next phase cutoff

### Ink Color Icons

PNG files at `/public/ink/{color}.png` for: amber, amethyst, emerald, ruby, sapphire, steel. Each page that needs them renders `<img src={/ink/${inkName}.png} />` directly — there is no shared component. Use `resolveColors()` from `inkColors.js` to normalize raw color strings (e.g. "red/blue", "Ruby") before using them as icon keys.

### Key Algorithms

**Draw odds (DrawOddsPage / `deck-insights`)** — Uses log-space binomial coefficients to avoid overflow. Hypergeometric distribution for exact card draw probabilities. Monte Carlo simulation (10,000 iterations) for mulligan decisions, scry effects, multi-group joint probabilities, and 12-turn quest pressure curves.

**Hand inference (handInference.js + HandPredictor.jsx)** — Hypergeometric P(≥1 copy in hand) given remaining deck size and current hand size. Combines observed deck composition with historical player profiles as a prior.

**Cut calculator (TournamentCutPage)** — Upper bound uses a pure W/L binomial; lower bound uses a trinomial W/D/L with empirical draw rate. Estimates safe cutline range and advises on intentional draw risk.

**Tournament ID analysis (tournamentApi.js `analyzeId`)** — After an ID, player gains 1 point. Counts how many players below the cut could leapfrog them if those players all win (+3 pts). Classifies as safe (≥3 point buffer), borderline (1–2 buffer), or danger (0 or outside cut).

### [Format Coconut] Deck Builder

`CoconutDeckBuilderPage` walks through: pick one of the 18 beta Coconut cards (`coconutCards.js`) → lock in up to 3 ink types, one of which must match the Coconut card's ink → build a 60+ card singleton deck around it. Each Coconut card reuses its associated Disney Lorcana card's real stats (matched by `fullName` against the live `useCards()` data) rather than being a distinct printed card — the base card's ability is replaced on screen with the Coconut card's alternate ability text (`coconutCards.js`'s `ability` field), since we don't have separate art or a separate database entry for the Coconut variant.

`coconutFormat.js` enforces the format's deck-building rules:
- 1 copy max per card, except up to 4 copies of the card matching the chosen Coconut card's `baseFullName`, and (Nick Wilde – "Wily Fox" only) up to 4 copies of an item named Pawpsicle, via the `extraCopy` field on that Coconut card entry.
- Every card must be within the deck's locked ink colors (`isCardInkLegal`, using `resolveColors()` from `inkColors.js`).
- At least 60 total cards (`MIN_DECK_SIZE`).

Decks are saved to IndexedDB via `coconutDecks.js` (autosaved with a short debounce as the user edits, consistent with the "no server-side game data" ethos — decks never leave the browser).
