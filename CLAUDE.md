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

Unit tests live in `src/lib/__tests__/` (Vitest), one `<lib>.test.js` per pure-logic
lib in `src/lib/` (e.g. `parseGamelog`, `cardImpact`, `practiceSim`, `metaSynthesis`,
`storeTiers`). CI runs `npm test` on every push/PR (`.github/workflows/test.yml`).
UI and integration behavior is still validated manually.

## Screenshots & Manual Verification

When asked to screenshot or visually verify a change, run it against the local
Vite dev server (`npm run dev`) first — not the Vercel preview deployment.
Preview deployments are commonly behind Vercel's SSO/deployment-protection
gate, which blocks headless/unauthenticated access (e.g. Playwright), so
attempting the preview first just wastes a round trip. Only fall back to the
preview URL if local verification isn't possible for some reason.

## Pull Requests

When creating a pull request:

1. **Include Vercel preview link** — Add the live preview URL in the PR description so reviewers can test changes without building locally. Don't construct the URL — Vercel truncates the branch and appends a hash, so any guessed pattern is wrong. Read it from the vercel[bot] comment on the PR per the `vercel-preview-url` skill (`.claude/skills/vercel-preview-url/`)
2. **Include screenshots for UI changes** — For any updates or new features affecting the user interface, capture and attach relevant screenshots in the PR body. Include before/after pairs when applicable

## Stack

React 19 + React Router 7 + Tailwind CSS 4 + Vite 8, deployed on Vercel. Serverless API routes live in `/api/*.ts` (TypeScript). Authentication via Supabase + Google OAuth. All of *your own* game data is stored client-side in IndexedDB or localStorage. Supabase stores the auth session, a small `profiles` table that records each user's supporter tier (`supporter`/`admin`), and — as of the Tournament History archive — admin-imported major-tournament standings/matches (see "Tournament History Archive" below), the first server-side store of real domain data rather than just auth/tier metadata.

## Environment Variables

Required in `.env` for local development:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Vercel also accepts `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` prefixes (both are checked in `supabaseClient.js`).

`VITE_DISCORD_CLIENT_ID` is no longer read: the "Add to Discord" invite card (a Community section in `siteSections.js`) was removed from the home page while the bot matures. The bot itself (`/api/discord-interactions`) is unaffected.

Optional: `VITE_METAFY_CLIENT_ID` — the Metafy OAuth client ID (not a secret). When set, `SettingsPage` shows a "Connect Metafy" card; when unset, `connectMetafy()` throws and the card's connect button surfaces an error instead of redirecting.

Server-side only (set in Vercel, not `.env`):
- `DISCORD_PUBLIC_KEY` — used by `/api/discord-interactions` to verify Discord's request signature.
- `DISCORD_BOT_TOKEN` — used by `/api/discord-tournament-tick` to post proactive channel messages via the Discord Bot API (different from `DISCORD_PUBLIC_KEY`; this one's a real secret).
- `SUPABASE_SERVICE_ROLE_KEY` — used by `api/_lib/discordSupabase.ts` for server-side access to the `discord_favorite_players`, `duels_api_tokens`, and `metafy_links` tables, bypassing RLS.
- `CRON_SECRET` — shared secret checked by `/api/discord-tournament-tick` and `/api/metafy?endpoint=reconcile-tick`; must match the same-named secret in the GitHub repo (Settings → Secrets and variables → Actions) used by `.github/workflows/tournament-tracker-tick.yml` and `.github/workflows/metafy-reconcile-tick.yml`.
- `DUELS_TOKEN_ENCRYPTION_KEY` — symmetric passphrase used by `/api/duels-tokens` to encrypt/decrypt saved duels.ink API tokens at rest (via Postgres `pgcrypto`, see `supabase/migrations/005_duels_api_tokens_crypto_functions.sql`). Never exposed to the client.
- `METAFY_CLIENT_ID` / `METAFY_CLIENT_SECRET` — Metafy OAuth app credentials, used by `/api/metafy?endpoint=callback` to exchange the authorization code. The client ID is not secret (also exposed client-side as `VITE_METAFY_CLIENT_ID`); the client secret is a real secret.
- `METAFY_API_KEY` — an owner-scoped Metafy API key (scope `community`), used by `/api/metafy?endpoint=reconcile-tick` to list active community subscribers. No per-user OAuth token is ever persisted for Metafy — see "Metafy Integration" below.
- `METAFY_COMMUNITY_ID` — the ID of this app owner's own Metafy community, used by `/api/metafy?endpoint=callback` to check whether the connecting user has access to it.
- `METAFY_SUPPORTER_TIER_ID` — the ID of the specific Metafy subscription tier ("The Forge") that grants Supporter access here. The community has a second tier ("Supporter", for Metafy-side guides) that does **not** grant access — see "Metafy Integration" below.

See `discord-bot/README.md` for full setup.

## Architecture

### Pages → Shared Libs → Storage

Pages are in `src/pages/`. Each page is self-contained. Shared logic lives in `src/lib/`.

Page content is full-width: outer page wrappers use `w-full px-6 py-8` (no `max-w-*`/`mx-auto`), matching `Nav`/`Footer`. New pages should follow this pattern rather than constraining width — narrow `max-w-* mx-auto` is still fine for small, deliberately-centered content (an error/gate message, a short list) but not for a page's primary content wrapper.

### Pages & Routes

Defined in `src/App.jsx`:

| Route | Page File | Purpose |
|---|---|---|
| `/` | `HomePage.jsx` | Dashboard — tool catalog organized into Resources, Deckbuilding, Coaching Tools, Tournament Tools, Content Creators. The catalog lives in `src/lib/siteSections.js` |
| `/sitemap` | `SitemapPage.jsx` | Plain link list of every tool, rendered from the same `siteSections.js` catalog as `HomePage` so the two never drift |
| `/blog` | `BlogIndexPage.jsx` | Blog post index — every post in `content/blog/`, newest first (see "Blog" below) |
| `/blog/:slug` | `BlogPostPage.jsx` | Renders one blog post |
| `/login` | `LoginPage.jsx` | Google OAuth sign-in via Supabase |
| `/auth/callback` | `AuthCallbackPage.jsx` | OAuth redirect handler; checks session and redirects |
| `/proxy` | `ProxyGeneratorPage.jsx` | B&W proxy card generator — search cards, add [Format Coconut] cards, build print sheets (9/page) |
| `/coconut-deck-builder` | `CoconutDeckBuilderPage.jsx` | [Format Coconut] deck builder — pick a Coconut card, lock in up to 3 inks, build a singleton 60+ card deck with the format's copy-count exceptions enforced |
| `/limited-guide` | `LimitedGuidePage.jsx` | Limited format reference — BREAD framework, mana curves, uninkable counts |
| `/rules` | `RulesPage.jsx` | Rules browser index — lists every document in `src/lib/rules/registry.js` with its latest version (see "Rules Browser" below) |
| `/rules/:doc`, `/rules/:doc/:chapterSlug` | `RulesDocumentPage.jsx` | One rules document, chaptered, with a `?v=` version picker and inline "changed from previous version" highlighting |
| `/rules/:doc/changes` | `RulesChangesPage.jsx` | Full word-level diff of one version (`?v=`) against the previous one |
| `/deck-insights` | `DrawOddsPage.jsx` | Comprehensive deck analytics: draw odds, mulligan/scry simulation, keyword analysis, brickability, quest pressure curves |
| `/game-scraper` | `GameScraperPage.jsx` | Live game state viewer via Chrome extension (automatic) or bookmarklet (manual) |
| `/library` | `LibraryPage.jsx` | Saved games (`?tab=history`) and a unified opponent directory (`?tab=players`) merging scouted-game and imported-gamelog opponent data |
| `/scouting/game/:uuid` | `ScoutedGamePage.jsx` | Full game state replay with action log (single scraped snapshot) |
| `/players/:name` | `PlayerProfilePage.jsx` | Unified per-opponent profile — win rates, deck archetypes, and inferred decklists merged from scouted games and imported duels.ink gamelogs (see "Unified Opponent Profiles" below) |
| `/deck-comparison` | `DeckComparisonPage.jsx` | Paste two decklists to highlight differences |
| `/decklist-inspector` | `DecklistInspectorPage.jsx` | Content-creator decklist view — browse by type/cost, pin up to 4 cards' full art beside stat charts, copy an OBS overlay link |
| `/decklist-inspector/overlay` | `DecklistOverlayPage.jsx` | Chrome-less, read-only render of a decklist for an OBS Browser Source. Deck comes entirely from the `?deck=` param (`decklistShared.js` `encodeDeckParam`/`decodeDeckParam`). **Deliberately not supporter-gated** — a Browser Source has no Supabase session, and the view exposes only what's in the link. `Nav`/`Footer` are hidden here |
| `/settings` | `SettingsPage.jsx` | Auth management and preferences — including the Appearance (dark mode) toggle |
| `/match-history` | `MatchHistoryPage.jsx` | duels.ink ranked match history with cascading filters |
| `/gamelog` | `GamelogViewerPage.jsx` | Bare single-gamelog view for `?id=<gamelog id>` (fetched via `fetchGamelogBuffer`, needs a duels.ink token) — opening hand plus per-player played/inked/discarded/destroyed, and a raw structure inspector. No in-app links point here |
| `/analytics` | `AnalyticsPage.jsx` | Merged gamelog + team analytics — import your own games (.zip/.gz) or shared team exports; per-game drilldown (draw sequence, mulligans, leaks, challenge log), personal card/win-rate stats, and team-wide matchup matrix, metagame breakdown, and MMR/win-rate trends |
| `/winrate-matrix` | `WinrateMatrixPage.jsx` | Color-pair matchup matrix — head-to-head win rates, first-player advantage |
| `/meta-synthesis` | `MetaSynthesisPage.jsx` | Plain-English meta report from duels.ink `fetchStats`, centered on the user's rank band — see "Meta Synthesis" below |
| `/practice-plan` | `PracticePlanPage.jsx` | Pre-tournament prep — select deck + meta, highlight matchups needing practice |
| `/tournament-lookup` | `TournamentLookupPage.jsx` | Ravensburger live standings — paste event URL, find yourself, check tiebreakers, ID analysis; clicking a pairing in the Matches tab opens cross-event history + head-to-head from the Tournament History archive (see below) |
| `/lore-tracker` | `LoreTrackerPage.jsx` | Mobile in-game lore counter with tap controls and audit log |
| `/store-lookup` | `StoreLookupPage.jsx` | Paste RPH store IDs/URLs → store details plus store-tier status (see "Store Lookup" below) |
| `/admin` | `AdminPage.jsx` | Admin-only — search users by email and grant/revoke supporter access; links to the tournament import page |
| `/admin/tournament-import` | `AdminTournamentImportPage.jsx` | Admin-only — paste a completed RPH event URL to import its final standings/matches into the Tournament History archive |

**Note:** `DrawOddsPage.jsx` exports `DeckInsightsPage` — the file name and component name differ.

**Supporter-gated routes:** These routes are wrapped in `<SupporterRoute>` in `App.jsx` and require an active supporter (or admin) — non-supporters see a gate: `/deck-insights`, `/game-scraper`, `/library`, `/scouting/game/:uuid`, `/players/:name`, `/match-history`, `/analytics`, `/practice-plan`, `/tournament-lookup`, `/meta-synthesis`, `/decklist-inspector`. The gated set is the single source of truth in `src/lib/access.js` (`SUPPORTER_PATHS`), reused by `HomePage` to badge tools as "Supporters". `/admin` enforces its own admin-only redirect via `useSupporter`.

All routes render inside a single `<ErrorBoundary>` (keyed on `location.pathname`) so a render-time throw in one tool shows a fallback instead of white-screening the SPA; `Nav` sits outside the boundary and stays usable.

Legacy redirects:
- `/replay-analyzer` → `/analytics`
- `/gamelog-analyzer` → `/analytics` (the two pages were merged into one — see below)
- `/team-analytics` → `/analytics` (renamed)
- `/game-library` → `/analytics`
- `/shared` → `/library`
- `/legality-checker` → `/deck-insights`
- `/cut-calculator` → `/tournament-lookup` (retired; Tournament Lookup's ID analysis covers it)
- `/opponent-directory` → `/library?tab=players` (the two pages were merged into one — see below)

### Components

In `src/components/`:

| File | Purpose |
|---|---|
| `Nav.jsx` | Ink-black top bar — one dropdown per `siteSections.js` section (tools + the newest blog post), Blog link, ⌘K tool search, settings link, username dropdown (logout, plus an Admin link for admins); below `xl` the sections collapse into a hamburger menu. Hidden on `/lore-tracker` and `/decklist-inspector/overlay` |
| `ToolSearch.jsx` | The ⌘K / Ctrl+K quick switcher over the tool catalog, opened from `Nav` |
| `ToolIcon.jsx` | Renders a catalog tool's glyph from `lib/toolIcons.js` by the tool's `icon` name |
| `ui/Button.jsx`, `ui/Card.jsx`, `ui/PageHeader.jsx`, `ui/Field.jsx` (`Input`/`Textarea`/`Select`), `ui/Tabs.jsx` (`Tabs`/`Tab`), `ui/Badge.jsx` | Shared UI building blocks — see "Design System" below |
| `Footer.jsx` | Site-wide footer, hidden on the same routes as `Nav` |
| `ErrorBoundary.jsx` | Class-based error boundary with a "Something broke" fallback (Try again / Reload / Back to tools; dev-only stack trace). Resets when its `resetKey` prop changes. Wraps the routes in `App.jsx` |
| `SupporterRoute.jsx` | Route guard — renders children for supporters/admins, otherwise a "Supporters only" gate (sign-in CTA when logged out). Reads `useSupporter` |
| `GameView.jsx` | Unified game display — player panels (lore bar, ink meter, field, hand predictor), action log, export button; reused across `GameScraperPage`, `LibraryPage`, `ScoutedGamePage` |
| `HandPredictor.jsx` | Bayesian hand inference display — shows top 12 cards with P(≥1 in hand) given observed deck + player profile |
| `SearchBar.jsx` | Fuzzy card search dropdown with quantity selector (×1–×4); used by proxy generator |
| `ProxyCard.jsx` | Printable card proxy renderer — portrait (2.5"×3.5") and landscape (location) layouts; print-optimized with Georgia serif fonts. A card carrying `imageSrc` (Coconut cards) is printed as that image filling the 2.5"×3.5" slot instead of through the text layout |
| `ShareCardModal.jsx` | Modal shell for sharing a canvas-rendered image (native share / clipboard copy / download); used by `TournamentLookupPage`'s and `PlayerMatchHistory`'s share-card buttons |
| `PlayerMatchHistory.jsx` | Round-by-round match history table for one player within a single loaded tournament event (opponent, result, score, user-annotated opp colors/play-draw, share card). Used by `TournamentLookupPage`'s player detail view and reused by `PairingHistoryPanel` for either side of a clicked pairing |
| `PostByline.jsx` | "By <author> · <date>" line for blog posts, author linked to their profile (`authorUrl`). Used by `BlogIndexPage` and `BlogPostPage` |
| `PairingHistoryPanel.jsx` | Modal opened by clicking a pairing row in `TournamentLookupPage`'s Matches tab — shows both players' cross-event history and head-to-head from the Tournament History archive, alongside each player's `PlayerMatchHistory` for the currently loaded event. See "Tournament History Archive" below |

| `InkIcons.jsx` | Shared ink icons — `InkIcon` (one ink) and `InkIcons` (a list, order-preserving and de-duplicated via `resolveInkName()`). Some pages alias it locally (`ColorPairIcons`, `InkImg`); `MatchHistoryPage` wraps it in a small local `InkIcons` with its own sizing/fallback |
| `StatCard.jsx` | Small label/value stat card (compact and large `size` variants) |
| `PlayerTags.jsx` | Favorite/team-tag toggle buttons shared by `TournamentLookupPage` tabs and `EliminationBracket` |
| `EliminationBracket.jsx` | `TournamentLookupPage`'s Bracket tab — reconstructs the top-cut bracket from RPH `round_number` + `table_number` (RPH has no explicit "advances to" link) |
| `MetaTrendChart.jsx` | Multi-line weekly sparkline of archetype play/win rate (Okabe-Ito colors); used by `MetaSynthesisPage` |
| `DecklistCardBar.jsx` | Card row with the inkwell cost emblem, shared by the Decklist Inspector and its overlay |
| `PlayerProfileDetail.jsx` | Body of `PlayerProfilePage` — the unified opponent profile |
| `analytics/*` | `AnalyticsPage` sub-views — `GamesList`, `GamelogDetail` (per-game drilldown), `StatTables` (card/mulligan tables), `MatchupViews` (matchup matrix, `CardImpactView` WAR + Kept/Sent %, `CardImpactTrendView`), `LeakReport` |

### Hooks

In `src/hooks/`:

| File | Returns | Purpose |
|---|---|---|
| `useAuth.js` | `{ user, isLoading, error }` | Supabase session — checks on mount, subscribes to auth state changes, and ensures a `profiles` row exists for the user |
| `useSupporter.js` | `{ user, isAdmin, isSupporter, tier, isLoading }` | Reads the user's `supporter_tier` from the `profiles` table; `isSupporter` is true for both `supporter` and `admin` |
| `useCards.js` | `{ cards, loading, error }` | Fetches card data from `/api/cards`, falls back to IndexedDB cache via `cardsCache.js` |
| `useTournamentLiveUpdates.js` | Pusher connection status | Subscribes to RPH live updates for an event (via `tournamentLive.js`) and calls a debounced `onMessage` so `TournamentLookupPage` silently refetches |
| `usePairingBadges.js` | badge cache + `ensureBadges`/`hasPedigree`/`hasRivalry` | Shared cache for Tournament Lookup's "pedigree" (made top cut at a Challenge-tier event) and "rivalry" (met before) badges from `/api/tournament-history`, batched to the server's 500-per-request cap |
| `useTheme.js` | `{ theme, resolvedTheme, setTheme }` | Reads the dark-mode preference from `ThemeProvider` — `theme` is the stored choice (`light`/`dark`/`system`), `resolvedTheme` is what's applied |

### Shared Libraries

In `src/lib/`:

| File | Purpose |
|---|---|
| `supabaseClient.js` | Supabase client init; exports `loginWithGoogle`, `logout`, `getSession`, `getCurrentUser` |
| `access.js` | `SUPPORTER_PATHS` set + `isSupporterPath()` — single source of truth for supporter-gated routes (used by `App.jsx` and `HomePage`) |
| `theme.js` | Dark-mode preference storage + resolution — `readStoredTheme()`/`storeTheme()`, `resolveTheme()`, `prefersDark()`, `subscribeToSystemTheme()`, `applyResolvedTheme()`. See "Dark Mode" below |
| `db.js` | IndexedDB abstraction for the `lorcana_pro_tools` DB — `openDB()`, `getTx()`, `promisify()` |
| `cardsCache.js` | IndexedDB card data caching (stored in `cards` store of `lorcana_pro_tools` DB) |
| `inkColors.js` | Ink color normalization — `resolveInkName()` (red→ruby, etc.), `resolveColors()`, `matchupKey()` |
| `scoutedGames.js` | IndexedDB CRUD for scraped game snapshots (`lorcana_pro_tools` DB, `games` store, keyed by `uuid`) — powers the Scouting Library |
| `coconutCards.js` | Static data for all 26 [Format Coconut] cards — `id` (also the art filename), `name`/`version`, `baseFullName`, `inks` (one ink, or two for the duo cards), `duelsId` (duels.ink's own id, the 18 it carries only), ability text, and the Nick Wilde → Pawpsicle extra-copy exception. Also exports `getCoconutCard()` and `coconutCardImageUrl()` |
| `coconutFormat.js` | [Format Coconut] deck rules — `getCardLimit()` (1, or 4 for the Coconut card/its extra-copy exception), ink legality, and `validateDeck()` (60+ cards, singleton, ink) |
| `coconutDecks.js` | IndexedDB CRUD for saved Coconut decks (`lorcana_pro_tools` DB, `coconutDecks` store, keyed by `id`) |
| `gamelogHistory.js` | IndexedDB CRUD for parsed gamelogs (`lorcana_gamelogs` DB, `gamelogs` store, keyed by `id`) |
| `gameStats.js` | Aggregate stats across game records — matchups, card plays, ink curves |
| `gameSnapshot.js` | Export/import game state as JSON files for sharing |
| `playerProfiles.js` | `listPlayers()`/`buildPlayerProfile()` — unified per-opponent profiles merging scouted games (`scoutedGames.js`) and imported duels.ink gamelogs (via `opponentDirectory.js`'s `buildDirectory()`); see "Unified Opponent Profiles" below |
| `opponentDirectory.js` | `buildDirectory()` — aggregates parsed gamelogs into per-opponent, per-deck card totals (played/inked/discarded/destroyed). Used directly by `playerProfiles.js` to fold gamelog data into the unified profile — no longer has its own page |
| `handInference.js` | Hypergeometric P(≥1 in hand) calculator — powers `HandPredictor` |
| `leakDetection.js` | Detect when hand information is leaked (quests, zones); used by `PracticePlanPage` and `AnalyticsPage` |
| `tournamentShareImage.js` | Renders a shareable summary image (canvas) for tournament/practice results |
| `parseGamelog.js` | Decompress gzip + parse raw gamelog entries into structured game state |
| `buildWinrateMatrix.js` | Aggregate color-pair matchup data from game records into a win/loss matrix |
| `siteSections.js` | `SECTIONS` — the tool catalog (name, path, icon, description per tool; `navLabel` per section) rendered by `HomePage`, `SitemapPage`, and `Nav`. `findTool(pathname)` resolves a route to its section/tool |
| `toolIcons.js` | Stroke-glyph path data for each catalog tool's `icon`, drawn by `components/ToolIcon.jsx` |
| `analyticsAggregation.js` | `enrichGame()` + per-card/mulligan aggregations (`aggregateMyCards`, `aggregateMulliganSentBack`, `aggregateMulliganWinRates`, `aggregateMultiCopyMulligan`) behind `AnalyticsPage` |
| `practiceSim.js` | `wilsonInterval()`, `shrinkWR()` (Bayesian shrinkage toward the public WR, 10-game prior), and the Bo1/Bo3 tournament Monte Carlo used by `PracticePlanPage` |
| `drawOddsMath.js` / `monteCarloSim.js` | Exact hypergeometric odds (log-space) and the mulligan/scry/curve/quest-pressure simulations behind Deck Insights |
| `tournamentLive.js` | `subscribeToTournamentLive()` — Pusher subscription to RPH's public `player-event-{id}` channel; wrapped by `hooks/useTournamentLiveUpdates.js` so `TournamentLookupPage` refetches on any broadcast |
| `metaSynthesis.js` / `rankTiers.js` / `archetypeStats.js` | Meta Synthesis logic (see below), MMR → rank-tier mapping, and curation of duels.ink archetype profiles |
| `storeTiers.js` | RPH store-tier rules for Store Lookup (see below) |
| `decklistShared.js` | Decklist Inspector/overlay helpers — deck URL param encoding, ink fills, type/cost bucketing |
| `rules/` | Rules browser — `registry.js` (document list), `index.js` (accessors), `diff.js` (word diff), `content/<doc>/<version>.js` (see "Rules Browser" below) |
| `cardImpact.js` | `computeCardImpact()` — per-card "wins above replacement" (WAR) for a deck's games; `computeCardImpactTrend()` — the same logic bucketed by calendar month, powering `CardImpactTrendView`'s WAR-over-time chart |
| `metagameAnalysis.js` | Opponent metagame breakdown — deck frequency and win rates by color pair |
| `duelsApi.js` | duels.ink API client — token management, match history, gamelog, deck/personal-stats, and meta stats fetches |
| `metaDrift.js` | `archetypeDrift()` / `archetypeMatchupDrift()` — week-by-week win rate, games and play rate per grouped archetype, and one archetype's win rate vs each other archetype, for `WinrateMatrixPage`'s Meta Drift view |
| `tournamentApi.js` | Ravensburger tournament API — event details, standings, matches, registrations, ID analysis |
| `tournamentHistoryApi.js` | Client for `/api/tournament-history` — `fetchPlayerTournamentHistory()`, `fetchHeadToHead()`, `searchTournamentPlayers()`, `fetchRecentTournamentImports()`, `importTournamentEvent()`. See "Tournament History Archive" below |
| `blog.js` | Client access to the compiled blog posts — `listPosts()` (newest first), `getPost(slug)`. See "Blog" below |
| `blogPost.js` | `parsePost()` — frontmatter + markdown → `{ slug, title, date, description, html }`. Build-time only (imports `marked`) |
| `blogMeta.js` | `BLOG_DESCRIPTION`, `AUTHOR_LINK_REL` + `formatPostDate()`, shared by the client and `blogPlugin.js` |
| `gameExport.js` | Serialize game records for sharing (used by `AnalyticsPage`) |
| `gameImport.js` | Deserialize imported game records |
| `exportGameIds.js` | CSV export of game IDs |

### Design System (Ink & Parchment)

The look is taken from the brand art: paper surfaces, an ink-black nav bar, condensed display type set in caps like the wordmark, and one forge-gold accent. It's defined as tokens in `src/index.css`'s `@theme` block, so it applies app-wide without per-page markup:

- **Fonts:** `font-sans` is Source Sans 3 (body), `font-display` is Oswald (loaded from Google Fonts in `index.html`). Every `<h1>` gets the display face in caps via a base rule; use `font-display uppercase tracking-wide` for other headings and labels that should match.
- **Brand colors:** `paper` (page ground), `ink` / `on-ink` (nav bar, stays dark in both themes), `forge` / `on-forge` (gold fill for the one primary action and supporter status), `forge-ink` (gold text on a light surface), `forge-soft` (tinted gold panel). The gray scale is retuned to a warm paper neutral and `white` is the card surface, so existing `gray-*`/`white` utilities already carry the brand.
- **Radii** are squared off app-wide (`rounded`, `rounded-lg`, etc. are 2–4px); `rounded-full` is unchanged.
- **Building blocks** in `src/components/ui/` — use these rather than hand-rolling class strings: `Button` (`primary` gold / `secondary` ink outline / `quiet` / `danger`; `to` for a router link, `href` for an external one), `Card` (bordered surface with optional `title`/`description`), `PageHeader` (page title + description + `actions`; the eyebrow is the route's catalog section from `findTool()`), `Input`/`Textarea`/`Select`, `Tabs`/`Tab` (underlined tab bar, forge underline on the active tab), `Badge` (`forge` for supporter status, `neutral` otherwise). Blue accents are off-brand: use `forge` for the one primary action or current selection, and ink/gray for the rest. Win/loss/draw colours and similar status colours stay semantic.
- New catalog tools need an `icon` from `lib/toolIcons.js` (a unit test enforces it).

### Dark Mode

**There are no `dark:` variants in this codebase, and new code should not add any.** Dark mode is implemented once, in `src/index.css`, by remapping Tailwind's color tokens under `html.dark`. Every color utility Tailwind v4 generates resolves through a CSS variable (`.bg-gray-50` compiles to `background-color: var(--color-gray-50)`), so redefining those variables flips the whole app at once — retrofitting ~16k lines of markup with paired `dark:` classes was never on the table, and pages added later get dark mode for free as long as they stay on the palette.

What this means when writing UI:

- Use the normal Tailwind palette plus the brand tokens above (`bg-white`, `bg-gray-50`, `border-gray-200`, `text-gray-500`, `bg-gray-900 text-white`, tinted `bg-red-50`/`text-red-700` panels) and it will theme itself. The remap is built around exactly these idioms: grays 50–300 become dark surfaces and borders, 400–950 become light text, and accent families are mirrored so tinted panels darken while their paired text lightens.
- **Don't use `bg-black` for a solid fill** — `--color-black` is deliberately *not* remapped, because it's the modal-scrim color (`bg-black/40`) and must stay dark in both themes. Use `bg-gray-900` for a solid dark-in-light fill.
- Hardcoded colors (inline `style` hex values, canvas rendering) don't participate. `ProxyCard.jsx` is fully inline-styled on purpose — a printable proxy must stay white regardless of theme.
- The remap is scoped to `@media screen`, so printed output (proxy sheets, standings) always uses the light palette.

The preference itself (`light` | `dark` | `system`, default `system`) lives in `localStorage` under `lorcana_theme`:

- `src/lib/theme.js` — storage, normalization, and resolution helpers (unit-tested in `src/lib/__tests__/theme.test.js`).
- `src/context/ThemeProvider.jsx` — wraps the app in `main.jsx`, subscribes to `prefers-color-scheme` via `useSyncExternalStore` so `system` stays live, and toggles the `dark` class on `<html>`.
- `src/hooks/useTheme.js` — the consumer hook; `SettingsPage`'s Appearance card is the only UI that writes.
- An inline script in `index.html` applies the class **before first paint** so dark-mode users don't get a flash of the light palette. It duplicates the storage key and the `system` fallback from `theme.js` — change one, change the other. It always *toggles* rather than only adding, so the class baked into prerendered HTML by `prerender.js` can't override the user's real preference.

### Access Control & Supporters

- Supabase `profiles` table (`supabase/migrations/001_profiles.sql`, `002_admin.sql`) holds `supporter_tier` (`supporter` | `admin`), `supporter_source`, `supporter_since`. RLS lets users read their own row; only admins (via the `is_admin()` security-definer function, with `tkwidmer@gmail.com` as a JWT-email bootstrap fallback) may update tiers. A trigger auto-creates a profile row on signup.
- `useSupporter` reads the tier; `SupporterRoute` gates the routes in `SUPPORTER_PATHS`; `AdminPage` is the UI for granting/revoking access. Gating is client-side UX only — the `/api/*` proxies do **not** check supporter status.
- `supporter_source = 'metafy'` rows are granted/revoked automatically by the Metafy integration (see below) rather than through `AdminPage`; manual/admin grants (`supporter_source = 'manual'`) are never overwritten by that automation.

### Substack Signup Sync

A deliberate, narrow exception to the "no game data server-side" ethos above — this is marketing email, not game data. `AuthProvider.jsx` fires once per browser session per signed-in user: it grabs the current Supabase access token and calls `POST /api/subscribe-substack`. That route verifies the token via Supabase (`auth.getUser`), takes the email from the *verified* session only (never a client-supplied value), and forwards it to `https://inkbornforge.substack.com/api/v1/free` — the same undocumented endpoint Substack's own embed signup form posts to, since Substack has no official public API. Best-effort and fire-and-forget: failures are logged server-side and never surface to the user or block sign-in.

### API Routes

Vercel serverless functions in `/api/*.ts`. Most are thin forwarding proxies with error handling and caching headers, and have no server-side auth on those — tokens are forwarded from the client. `/api/tournament-history` is the exception: it reads/writes project-owned Supabase data rather than proxying an external API, so it does verify the caller's Supabase session server-side (and, for its import endpoint, an admin tier check) — see "Tournament History Archive" below.

**Function budget — read before adding a route.** Vercel's Hobby plan caps a deployment at **12 serverless functions**, counted as files in `api/` (`api/_lib/` is excluded). The count is currently **9**. Going over fails the deploy, so the established fix is to consolidate related endpoints into one function dispatched by a query param — see `/api/duels`, `/api/tournament-history`, and `/api/metafy` (`?endpoint=`).

⚠️ **Use flat `api/<name>.ts` files only.** A nested dynamic route (`api/patreon/[action].ts`) was tried and **silently did not deploy** — the build went green, but every request to it fell through to the `/(.*)` → `/index.html` catch-all in `vercel.json` and returned the SPA shell instead of the function. That took the Patreon integration down in production (PR #175, reverted in #176). A green Vercel build is **not** evidence that a function exists; verify a new route by curling it after deploy and confirming a JSON/expected response rather than `text/html`.

| Endpoint | Upstream | Auth | Notes |
|---|---|---|---|
| `/api/duels` | Various duels.ink endpoints | Bearer token (except `stats`) | Single consolidated proxy for everything duels.ink, dispatched by `?endpoint=` — `match-history`, `gamelog`, `deck`, `stats`. Folded into one function (rather than one route per endpoint) because Vercel's Hobby plan caps a deployment at 12 serverless functions. `deck` additionally takes `?personalStats=1` to hit `/api/account/personal-stats` (undocumented — not in duels.ink's `/api-docs.md`) for per-deck-version stats, including each version's exact card list + timeframe, used by `AnalyticsPage`'s Card Impact (WAR) to confirm whether a card was actually in the deck for a given game. `stats` forwards duels.ink's documented `era` param; `fetchStats()` in `duelsApi.js` always scopes to the queue's current era, looking its key up once per queue from `meta.eras.currentEra.key`. Only the fields duels.ink documents as stable (`matchups`, `colorPairs`, `activity.totalGames`, `updatedAt`, a few `meta.*`) are a supported contract — the archetype fields (`profiles`, `archetypeMatchups`, `cardLift`) behind `MetaSynthesisPage` and the matrix's archetype view are not. In bo3 queues `matchups[].games` counts matches, not games. |
| `/api/tournament` | Ravensburger API | Public | Routes by `?type=` param: `event`, `matches`, `registrations`, `standings`, `store`, `storeEvents`; handles pagination |
| `/api/tournament-history` | Supabase (`tournament_history_*` tables) | Bearer Supabase access token — `import` requires admin tier, the read endpoints require any signed-in session | Single consolidated route for the caster history archive, dispatched by `?endpoint=` — `import` (admin-only, fetches an RPH event's final standings + matches server-side and upserts them), `player-history`, `head-to-head`, `search-players`, `recent-imports`. See "Tournament History Archive" below. |
| `/api/discord-interactions` | Discord Interactions webhook | Ed25519 signature (`DISCORD_PUBLIC_KEY`) | Not a proxy — implements the Discord bot's commands (Decode Deck QR, `/tournament`, `/favorite`, `/unfavorite`, `/favorites`) directly. See `discord-bot/README.md`. |
| `/api/subscribe-substack` | Substack's undocumented `/api/v1/free` embed-form endpoint | Bearer Supabase access token | Called by `AuthProvider.jsx` once per session on sign-in. See "Substack Signup Sync" above. |
| `/api/discord-tournament-tick` | None (internal) | Shared secret (`CRON_SECRET`) | Called every 30 min by `.github/workflows/tournament-tracker-tick.yml`; posts an update to Discord for any favorited player whose rank/record changed, and auto-deactivates favorites once an event ends. |
| `/api/metafy` | Metafy API | Varies by endpoint — see "Metafy Integration" below | Single consolidated route for the Metafy supporter integration, dispatched by `?endpoint=` — `callback`, `status`, `reconcile-tick`. See "Metafy Integration" below. |

LorcanaJSON card data (`/api/cards`) is a rewrite, not a serverless function — handled by Vite proxy in dev and by `vercel.json` in production, both pointing to `https://lorcanajson.org/files/current/en/allCards.json`.

### Discord Bot (`api/discord-interactions.ts`)

The Discord bot (message command "Decode Deck QR" + `/tournament`, `/favorite`, `/unfavorite`, `/favorites` slash commands) is implemented as a Vercel serverless function receiving Discord's HTTP Interactions webhook — not a persistent gateway process. `discord-bot/` only holds a one-time script to register the commands with Discord's API; the actual command logic lives in `api/discord-interactions.ts` and `api/_lib/discordQr.ts` / `discordTournamentApi.ts` / `discordTournamentEmbeds.ts`. Image QR decoding uses `jimp` + `jsqr` (not `sharp`, whose native binaries are a portability risk in a serverless bundle). `discordTournamentApi.ts` is a standalone port of `src/lib/tournamentApi.js` that calls the public Ravensburger API directly, since this function isn't behind `/api/tournament`. Requires a `DISCORD_PUBLIC_KEY` env var in Vercel for request signature verification. See `discord-bot/README.md` for full setup.

`/favorite url:<event> player:<name>` tracks a player in the channel it's run from; a scheduled tick (`api/discord-tournament-tick.ts`, triggered by GitHub Actions every 30 minutes — Vercel Hobby's Cron Jobs only run once/day, so that couldn't drive this) checks all active favorites, groups them by event to minimize API calls, and posts an update embed only when a tracked player's rank/record actually changed since the last check. Favorites are stored in the `discord_favorite_players` Supabase table (`supabase/migrations/003_discord_favorite_players.sql`) — RLS is enabled with zero policies, since this table is only ever touched server-side via `api/_lib/discordSupabase.ts` (a service-role client, bypassing RLS entirely; separate from the anon-key client the main web app uses). `/unfavorite` deactivates a tracked row; `/favorites` lists current ones in the channel. A favorite auto-deactivates once its event's current round can no longer be resolved (tournament finished).

### Metafy Integration (`api/metafy.ts`)

The only automated supporter integration in the app (a prior Patreon integration was removed entirely, code and data, in favor of this). Backers connect their Metafy account via OAuth from a "Connect Metafy" card on `SettingsPage.jsx`; an active subscription **to a specific tier** of this app owner's own Metafy community grants `profiles.supporter_tier = 'supporter'` with `supporter_source = 'metafy'`. Docs: [dev.metafy.gg](https://dev.metafy.gg/).

**Tier-gated, not just "any subscription":** the community has two tiers — "Supporter" (Metafy-side guides) and "The Forge" (this app) — and only "The Forge" (`METAFY_SUPPORTER_TIER_ID`) grants access. `isSupporterTier()` in `api/metafy.ts` is the single place this comparison happens, used by both `?endpoint=callback` and `?endpoint=reconcile-tick`. `metafy_links.has_access` (and the `hasAccess` field `?endpoint=status` returns to `SettingsPage`) means "has the specific tier that unlocks this app" — a subscriber on the wrong tier is stored/shown as not having access, not as a second ambiguous flag. `metafy_links.tier_id` still records whichever tier they're actually on, even when it's not the gating one, for visibility.

**No OAuth tokens are ever persisted.** The Metafy user ID ↔ Supabase user_id link (plus last-known access state) lives in the `metafy_links` table (`supabase/migrations/010_metafy_links.sql`) — RLS enabled with zero policies, same service-role-only pattern as `discord_favorite_players` and `duels_api_tokens`. `api/_lib/metafyApi.ts` is the thin client for Metafy's OAuth2 + API v1; `api/_lib/metafySupabase.ts` holds `applyMetafyStateToProfile()`, the single grant/revoke chokepoint.

`api/metafy.ts` is a single consolidated route, dispatched by `?endpoint=`:
- `?endpoint=callback` — the OAuth redirect target. `state` carries the initiating user's Supabase access token (verified server-side via `auth.getUser()`, the same pattern `api/duels-tokens.ts` uses for its Bearer auth) since this is a plain browser redirect with no other way to identify the logged-in user. Uses the user's freshly-issued access token for exactly one call — `GET /v1/me/purchases/communities/{communityId}` (`METAFY_COMMUNITY_ID`) — then gates the result through `isSupporterTier()` to grant/revoke immediately on connect, then discards the token entirely; it's never written to `metafy_links`.
- `?endpoint=status` — authenticated GET/DELETE so `SettingsPage` can read connection status and disconnect.
- `?endpoint=reconcile-tick` — a `CRON_SECRET`-gated safety net that's actually the **only** revoke path: Metafy's webhooks are Partner-only ([dev.metafy.gg/api-reference/v1/webhooks](https://dev.metafy.gg/api-reference/v1/webhooks)), so there's no real-time push at all here. It runs every 30 minutes (`.github/workflows/metafy-reconcile-tick.yml`, same cadence as `discord-tournament-tick`), and does a single owner-scoped `GET /v1/me/community/subscribers` call (`METAFY_API_KEY`) rather than re-polling each linked user's own token — that's what makes storing/refreshing per-user tokens unnecessary. Both `?endpoint=callback` and this refuse to run (redirect-with-error / 500, respectively) if `METAFY_SUPPORTER_TIER_ID` isn't set, rather than defaulting to "no tier matches" and silently revoking every linked account.

There is deliberately no PKCE code-verifier flow here, even though Metafy's docs recommend one for authorization-code integrations: PKCE protects clients that can't hold a secret, and this integration exchanges the code server-side with `METAFY_CLIENT_SECRET`.

**Invariant:** revocation (`applyMetafyStateToProfile(userId, false)`) only ever updates rows where `supporter_source = 'metafy'` — a manually- or admin-granted supporter (via `AdminPage.jsx`) is never touched by a Metafy subscription lapsing.

A prior Patreon OAuth integration (`api/patreon.ts` + friends) was fully removed, including its `patreon_links` table and `pgcrypto` functions (`supabase/migrations/011_drop_patreon_links.sql`, dropping what `006_patreon_links.sql`/`007_patreon_links_crypto_functions.sql` created) — confirmed safe first: its 2 linked rows were never actually active patrons (`patron_status` was `null` on both) and zero `profiles` rows carried `supporter_source = 'patreon'`, so nothing real was destroyed. `supporter_source`'s CHECK constraint no longer permits `'patreon'`.

### Storage

| Layer | DB / Key | Contents |
|---|---|---|
| IndexedDB `lorcana_pro_tools` v2 | `games` store (key: `uuid`) | Scraped game snapshots from `GameScraperPage` |
| IndexedDB `lorcana_pro_tools` v2 | `cards` store (key: `version`) | Cached LorcanaJSON card data |
| IndexedDB `lorcana_pro_tools` v3 | `coconutDecks` store (key: `id`) | Saved [Format Coconut] decks from `CoconutDeckBuilderPage` |
| IndexedDB `lorcana_gamelogs` v1 | `gamelogs` store (key: `id`) | Parsed gamelogs from `AnalyticsPage` |
| localStorage `lorcana_deck_names` | — | User-assigned deck names (keyed by `your_deck_id`) |
| localStorage `lorcana_theme` | — | Dark-mode preference: `light` \| `dark` \| `system` (see Dark Mode) |
| localStorage (various) | — | Form state for `DrawOddsPage`, filter state, lore tracker (`lorcana_lore_tracker`), etc. |
| `chrome.storage.local` | `lorcana_active_games` | Active game states captured by the Chrome extension (2-hour TTL) |
| Supabase `auth` | session | Google OAuth user session |
| Supabase `profiles` table | row per user | Supporter tier metadata (see Access Control) |
| Supabase `duels_api_tokens` table | row per token | Logged-in users' duels.ink API tokens, encrypted at rest (pgcrypto) — replaces the old browser-only `localStorage` tokens so they carry over across devices. Managed via `/api/duels-tokens`; see `src/lib/duelsApi.js` |
| Supabase `metafy_links` table | row per user | Metafy user ID ↔ Supabase user_id, last-known community access state. No OAuth tokens stored — see "Metafy Integration". Managed via `api/metafy.ts` (`?endpoint=callback`/`status`/`reconcile-tick`) |
| Supabase `tournament_history_events`/`_standings`/`_matches` tables | row per imported event / per-player standing / per match | Admin-imported major RPH tournament archive powering the caster history tool — the first server-side store of real tournament/game domain data (see "Tournament History Archive"). Managed via `/api/tournament-history`; see `src/lib/tournamentHistoryApi.js` |

### External APIs

**duels.ink** — Authenticated via Bearer token. Tokens are stored in the Supabase `duels_api_tokens` table (encrypted at rest), one row per account, with an `is_active` flag choosing the active one; managed on the Settings page via `/api/duels-tokens` (see `src/lib/duelsApi.js`). The active token is passed through the Vercel proxy routes. No server-side validation of the duels.ink API itself.

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

### Unified Opponent Profiles

`/library?tab=players` and `/players/:name` merge two independent opponent-tracking systems into one view — there is no route dedicated to gamelog-only opponent data anymore (`/opponent-directory` redirects to `/library?tab=players`):
- **Scouted games** (`scoutedGames.js`) — full board-state snapshots captured via the Chrome extension or an imported shared snapshot. Games may not even involve the signed-in user (spectating two strangers is possible), so stats here are tracked per named player as *that player's own* record, not "my record against them".
- **Imported duels.ink gamelogs** (`gamelogHistory.js`, aggregated per-opponent by `opponentDirectory.js`'s `buildDirectory()`) — always games the signed-in user actually played, with coarser per-card totals (played/inked/discarded/destroyed) but no turn-by-turn detail. `buildDirectory()`'s `wins`/`losses` are from *my* perspective (my record against that opponent); `playerProfiles.js` flips them (`wins`/`losses` swapped) when merging so the unified profile's `wins`/`losses` consistently mean "this opponent's own record", matching the scouted side.

`playerProfiles.js` does the merge:
- `listPlayers(records, gamelogs)` — per-opponent summary (games/W-L/deck count) for the Players tab list, keyed by name across both sources. `scoutedGameCount`/`gamelogGameCount` are broken out so the UI can show where the numbers came from.
- `buildPlayerProfile(records, gamelogs, name)` — full per-opponent detail for `PlayerProfilePage`. Decks are bucketed by ink-color key (`matchupKey()`) and merged via `mergeDeckBuckets()`: a deck seen in only one source keeps that source's fields (`hasScoutedData`/`hasGamelogData` flags tell the UI which); a deck seen in both sums games/wins/losses and combines card stats by name (scouted `plays`/`inks` — max observed in a single game, used for the inferred-decklist `estimatedCopies` — alongside gamelog `played`/`inked`/`discarded`/`destroyed`, summed across games). Play-pattern stats (quests/turn, ink rate, went-first rate) require the full per-turn log a gamelog import doesn't carry, so they're scouted-only and read as 0 for a gamelog-only deck.

The two sources can't be deduplicated against each other — there's no shared game ID between a spectated match and a duels.ink gamelog export — so if the same physical game was somehow captured by both, it's counted twice rather than merged 1:1. In practice this is rare enough not to matter (spectating your own game and also importing its gamelog).

### Match History Filters

`MatchHistoryPage` uses a cascading filter pattern where each filter layer narrows the options available to filters below it:

```
games → afterDate → afterQueue → afterMyColors → afterOppColors → filteredGames
```

Color options exclude 3+ ink entries (sealed/limited formats). Deck identity uses `your_deck_id` (stable API field) with `deckFingerprint(your_decklist)` as fallback. Deck names are stored in localStorage under `lorcana_deck_names`.

### Match History Game Object Shape

Key fields on game objects from the duels.ink API:
- `your_player` (1 or 2), `your_deck_id`, `your_deck_colors` ("ruby/sapphire"), `your_decklist` (array of `{cardId, count}`)
- `opp_display_name`, `opp_deck_colors` (the opponent's decklist is never returned)
- `started_at` (ISO string — game time), `went_first`, `result`, `queue_name`
- `gamelog_id`, `mmr_delta`, `your_lore`, `opp_lore`

### Winrate Matrix & Metagame Analysis

`AnalyticsPage` builds its matchup matrix from imported gamelogs (`gamelogHistory.js`) via `buildWinrateMatrix.js`. (`WinrateMatrixPage` is unrelated — it pulls public meta stats from the duels.ink API via `fetchStats`, not local records.) `buildWinrateMatrix.js`:
- Groups games by `(myColors, oppColors)` pair using sorted JSON string keys
- Tracks wins, games, and first/second player splits per matchup
- Returns `{ matchups, colorPairs, totalGames, winLossMatrix }` — the matrix is a nested map `[playerColorKey][oppColorKey]`

`metagameAnalysis.js` (`analyzeOpponentMetagame`) groups by opponent color pair and returns frequency + win rate sorted by game count.

`WinrateMatrixPage` (defaults to Core Bo1) has a Meta Drift section built on grouped archetypes (`aggregateArchetypes`, below). When opened, it fetches the last 5 of `meta.availableWeeks` (`period=week:<startDate>`) for the selected queue/ranks in parallel. `archetypeDrift()` (`metaDrift.js`) gives one row per archetype with each week's win rate, games and play rate, plus the change from the first to the latest complete week (the in-progress week is shown but excluded from the change, since its sample is partial). Rows sort by the latest complete week's games or win rate. Clicking an archetype drills into `archetypeMatchupDrift()`: its win rate vs each other archetype per week (mirrors omitted). Nothing is stored — it works on a first visit. Play rate is duels.ink's convention, archetype games ÷ `activity.totalGames`; since each game has two decks, those shares sum to ~200%, not 100% (`colorPairs` games sum to exactly 2× `totalGames`). (Drift used to diff daily color-pair snapshots saved in IndexedDB; `db.js` v5 drops that `metaSnapshots` store.)

The page's Archetypes table uses `aggregateArchetypes()` (`metaSynthesis.js`), same as Meta Synthesis: duels.ink's `profiles` are per-build-variant clusters, it reuses one `archetypeName` across several `archetypeSlug`s of the same colors, and one slug can carry several names — so profiles are grouped by colors + `archetypeName`, the only distinction a player can see (Core Bo1 Set 13: 89 named profiles → 30 archetypes). `archetypeMatchups` is keyed by profile `id` and is rolled up to the same groups by `archetypeMatchupSummary()`.

### Rules Browser

`/rules` renders official documents (Comprehensive Rules, Tournament Rules, Play Correction Guidelines, CORE Lore Guide, Community Code, Pack Rush, [Format Coconut] Beta Rules, CCQ Event Term Sheet, Artist Policy, Diversity & Inclusion Policy) from static content in `src/lib/rules/content/<doc>/<version>.js`. Each version is a flat `entries` array of `{ id, type: 'chapter' | 'rule', title?, text? }`, with dotted `id`s (`1.1.3`) giving the hierarchy (`ruleDepth()`).

- To add a document, register it in `registry.js` and wire its versions into `index.js`. To add a version, drop a new dated file into that document's `content/` folder.
- Version *metadata* is synchronous. Entries load lazily (`loadVersion()`/`loadVersionDiff()` via `content/versionLoader.js` + each document's `import.meta.glob`), so one document doesn't pull every version into the bundle. Pages should go through `index.js`, never import content files directly.
- `diff.js` (`changesById`, `wordDiff`) compares a version against its predecessor. That powers the inline highlighting on `RulesDocumentPage` and the full diff on `RulesChangesPage`.

### Meta Synthesis

`MetaSynthesisPage` turns duels.ink's `/api/stats/meta` response (`fetchStats`) into plain English. `metaSynthesis.js` holds pure, unit-tested functions:
- `aggregateArchetypes()` merges duels.ink's per-variant cluster profiles into one archetype per colors + archetype name.
- `buildSynthesis()` covers most-played, top and bottom win rate with a sample floor, matchup summaries, and best/worst signature cards.
- `compareRankBands()` / `compareWeeks()` produce the "higher ranks vs lower" and "this week vs last" deltas.

The page defaults to the user's own rank band (`fetchCurrentMmr` → `rankTiers.js`) and the latest week, offers Core/Infinity × Bo1/Bo3, persists filters in localStorage (`lorcana_meta_synthesis_filters`), and has a share image (`metaSynthesisShareImage.js`).

### Store Lookup

`StoreLookupPage` extracts every UUID from pasted store IDs/URLs and fetches each store via `/api/tournament?type=store`, plus its events (`storeEvents`) and unique-fan count. `storeTiers.js` models RPH's store-tier program:
- `computeTierProgress()` tracks provisional Legendary progress in the pro-rating window (`PRORATE_WINDOW`, `LEGENDARY_PRORATED_REQUIREMENTS`, plus running a Hyperia City Prerelease).
- `computeStandingTierStatus()` gives the standing tier over the trailing 4 set seasons, whose boundaries are derived from Prerelease events (`deriveSeasons()`).

The page also shows a static Welcome/Standard/Legendary reference (definitions + benefits from RPH's announcement, requirements from the `*_MAINTENANCE_REQUIREMENTS` constants).

Only `display_status === 'complete'` events count. The window dates and requirements are hardcoded from the Aug 2026 program email, so they'll need updating when RPH changes the program.

### Tournament Lookup

`TournamentLookupPage` accepts a Ravensburger tournament URL and extracts the event ID. It uses `tournamentApi.js` for all data:
- `fetchEventDetails` → raw event + phases + rounds
- `getTournamentStructure` → resolved current round, top-cut size, rounds remaining, advancement requirements
- `fetchTournamentStandings` → paginated standings for a specific round
- `fetchAllRegistrations` → all registered players (paginated loop)
- `analyzeId` → ID safety analysis: compares player's points buffer vs cut line, counts players who could pass them if everyone wins
- `analyzeAdvancement` → status (secured/possible/eliminated) toward the next phase cutoff

### Tournament History Archive

The caster-facing tool for surfacing a player's history across multiple imported RPH major events, and any prior head-to-head between two players in a pairing. This is the first feature to store real domain data in Supabase rather than only auth/tier metadata (see "Stack" above).

**Import (admin-only, one-shot, re-runnable):** `AdminTournamentImportPage.jsx` (`/admin/tournament-import`, linked from `AdminPage.jsx`) posts an event URL to `POST /api/tournament-history?endpoint=import`. That route (`requireAdmin()` in `api/_lib/requireAdmin.ts`) fetches the event's details, final-round standings, and all completed rounds' matches directly from `RAVEN_BASE`/`HYDRA_BASE` (`api/_lib/tournamentImport.ts` — a server-side port of `tournamentApi.js`'s fetch/pagination logic, since this runs in a Vercel function rather than the browser and can't go through the client-only `/api/tournament` proxy), then upserts them via `api/_lib/tournamentHistorySupabase.ts`. Re-running the import for the same event is idempotent — it always re-derives and upserts, so importing again after more rounds complete updates standings/ranks rather than duplicating rows.

**Schema** (`supabase/migrations/008_tournament_history.sql`): `tournament_history_events`, `tournament_history_standings`, `tournament_history_matches` — zero RLS policies, service-role-only access, same pattern as `discord_favorite_players`/`duels_api_tokens`/`metafy_links`. Player identity is joined by RPH's own stable `player.id` (`rph_player_id`), the same id `TournamentLookupPage.jsx`'s cross-event favorites/team-tag localStorage already keys by — never by name, which is stored only for display/search (trigram-indexed for fuzzy search). "Made top cut" is precomputed at import time (`has_elimination AND rank <= top_cut_size`) rather than needing a separate accomplishments table. Head-to-head lookups use a generated `player_pair` column on `tournament_history_matches` for an O(1) equality lookup instead of an OR'd scan.

**Caster UI:** clicking a non-bye pairing row in `TournamentLookupPage`'s Matches tab (`MatchesTab`'s `onSelectPairing`) opens `PairingHistoryPanel.jsx` — a modal showing a head-to-head banner (prior meetings across imported majors, or "first meeting") plus each player's cross-event summary (events played, top cuts made) alongside their `PlayerMatchHistory` for the currently loaded event. The panel's cross-event data and the loaded event's `PlayerMatchHistory` are two independent data sources shown side by side — this feature does not merge with `/players/:name`'s separate scouted-game/gamelog opponent-profile system (see "Unified Opponent Profiles" above); they remain unrelated.

**API** (`api/tournament-history.ts`, `?endpoint=` dispatch, folded into one function per the function budget above): `import` (admin-only), `player-history`, `head-to-head`, `search-players`, `recent-imports` (all requiring a valid Supabase session — this route reads/writes project-owned data rather than proxying an external API, so unlike most `/api/*` proxies it does check auth server-side).

### Blog

Posts are markdown files in `content/blog/<slug>.md` — the filename is the URL slug (`/blog/<slug>`, lowercase-hyphenated), and each needs a frontmatter block:

```
---
title: My post
date: 2026-09-23
description: One sentence — used on the index, as the meta description, and on social cards.
author: Jane Doe
authorUrl: https://x.com/janedoe
---
```

Posts can be guest-written, so every post names its own `author` and links `authorUrl` (their X/Twitter, Metafy, or other profile; must be `https://`). The byline (`components/PostByline.jsx` client-side, mirrored in `blogPlugin.js`'s static HTML) links it with `rel="author"`, and the post's `BlogPosting` JSON-LD carries it as a `Person`.

Adding a file is all it takes to publish; there's no registry to update. An optional `draft: true` line keeps a post out of production builds (no static page, no sitemap entry, and it compiles to `null` so its content never reaches the bundle) while still showing it in `npm run dev` with a Draft badge; delete the line to publish. The `new-blog-post` skill (`.claude/skills/new-blog-post/`) scaffolds a draft with today's date and InkbornForge as the default author. `parsePost()` (`src/lib/blogPost.js`) throws on a missing field, a non-`YYYY-MM-DD` date, a non-`https://` `authorUrl`, or a non-slug filename, which fails the build rather than shipping a broken post. Links to other pages on the site should be root-relative (`[Tournament Lookup](/tournament-lookup)`).

`blogPlugin.js` (a Vite plugin registered in `vite.config.js`) does the work:
- **Compile at build time.** It transforms each `content/blog/*.md` import into a JS module exporting the parsed post, so `src/lib/blog.js`'s `import.meta.glob` gets plain HTML strings and `marked` never ships to the browser.
- **Static HTML for SEO.** After `vite build`, it writes `dist/blog/index.html` and `dist/blog/<slug>/index.html` from the built `index.html` shell, with per-post `<title>`, description, canonical, Open Graph/Twitter tags, `BlogPosting` JSON-LD, and the post body inside `#root` — then appends the blog URLs to `dist/sitemap.xml`. The client render replaces `#root` on load, same as a prerendered page. `vercel.json` rewrites `/blog` and `/blog/:slug` to those files explicitly (ahead of the SPA catch-all), since serving a directory's `index.html` for a path without a trailing slash isn't something to rely on (vite preview, for one, doesn't).
- This is independent of `prerender.js` on purpose: that step needs Chromium, and production evidence (every route, including `/proxy/index.html`, returns the identical bare shell) shows it currently emits nothing on Vercel.

Client-side, `routeTitle()`/`routeDescription()` resolve a `/blog/<slug>` path to its post's title/description so in-app navigation updates the tab title too. Post bodies are styled by the `.blog-prose` rules in `src/index.css`, which use palette variables so dark mode works without `dark:` variants.

### Ink Color Icons

PNG files at `/public/ink/{color}.png` for: amber, amethyst, emerald, ruby, sapphire, steel. Each page that needs them renders `<img src={/ink/${inkName}.png} />` directly — there is no shared component. Use `resolveColors()` from `inkColors.js` to normalize raw color strings (e.g. "red/blue", "Ruby") before using them as icon keys.

### Key Algorithms

**Draw odds (DrawOddsPage / `deck-insights`)** — Uses log-space binomial coefficients to avoid overflow. Hypergeometric distribution for exact card draw probabilities. Monte Carlo simulation (10,000 iterations) for mulligan decisions, scry effects, multi-group joint probabilities, and 12-turn quest pressure curves.

**Hand inference (handInference.js + HandPredictor.jsx)** — Hypergeometric P(≥1 copy in hand) given remaining deck size and current hand size. Combines observed deck composition with historical player profiles as a prior.

**Tournament ID analysis (tournamentApi.js `analyzeId`)** — After an ID, player gains 1 point. Counts how many players below the cut could leapfrog them if those players all win (+3 pts). Classifies as safe (≥3 point buffer), borderline (1–2 buffer), or danger (0 or outside cut).

### [Format Coconut] Deck Builder

`CoconutDeckBuilderPage` walks through: pick one of the 26 beta Coconut cards (`coconutCards.js`) → lock in up to 3 ink types, which must include **every** one of that Coconut card's `inks` → build a 60+ card singleton deck around it. Most Coconut cards have a single ink and leave two free slots; the newer wave is built on Lorcana's dual-ink duo cards, so those lock two inks and leave one. Each Coconut card reuses its associated Disney Lorcana card's real stats (matched by `fullName` against the live `useCards()` data) rather than being a distinct printed card — the base card's ability is replaced on screen with the Coconut card's alternate ability text (`coconutCards.js`'s `ability` field), since we don't have separate art or a separate database entry for the Coconut variant.

`coconutFormat.js` enforces the format's deck-building rules:
- 1 copy max per card, except up to 4 copies of the card matching the chosen Coconut card's `baseFullName`, and (Nick Wilde – "Wily Fox" only) up to 4 copies of an item named Pawpsicle, via the `extraCopy` field on that Coconut card entry.
- Every card must be within the deck's locked ink colors (`isCardInkLegal`, using `resolveColors()` from `inkColors.js`) — a dual-ink card needs *both* its inks locked, which is why a duo Coconut card locks both of its own.
- At least 60 total cards (`MIN_DECK_SIZE`).

Decks are saved to IndexedDB via `coconutDecks.js` (autosaved with a short debounce as the user edits, consistent with the "no server-side game data" ethos — decks never leave the browser).

### Coconut Decklist Text (duels.ink interop)

`coconutDecklistText.js` generates and parses the Copy/Import List text in the
deck builder. The format is the one **duels.ink** accepts, since that's where
these decks actually get tested. Its parser (verified against duels.ink's own
client bundle) skips blank lines and anything prefixed with `#` or `//`, reads a
`Coconut: <id>` header naming its own card id, takes card lines as
`<qty> <card name>` with an optional trailing `(setCode-number)` — and treats
every **other** unrecognized line as a bad card entry that fails the import.

So our own metadata rides along as `#` comments, which duels.ink ignores and
`parseCoconutDecklist` reads back for a lossless round trip here:

```
# [Format Coconut]
# Deck: Wily Items
# Coconut Card: Nick Wilde - Wily Fox
# Inks: Sapphire/Amber
Coconut: coconut-008

4 Pawpsicle
4 Nick Wilde - Wily Fox
```

Don't add an uncommented header line — it breaks the paste into duels.ink.

The `Coconut:` header is emitted only when the card has a `duelsId`. duels.ink's
catalog stops at `coconut-018`, so the seven duo cards and Pete export without it; the
`# Coconut Card:` comment still identifies them on re-import here. The parser
also accepts a list copied straight off duels.ink (its `Coconut: <id>` header
and its `(1-145)` card-id suffixes).

### Coconut Card Faces

The full-art Coconut card faces are Nathan Trippe's work
(https://x.com/NathanTrippe). Both surfaces that show them — the deck builder
and the Proxy Generator — carry the credit via `components/CoconutArtCredit.jsx`;
keep it on any new surface that displays the art.

Coconut cards have their own printed face rather than reusing the base card's
LorcanaJSON art, so all 26 are bundled as local assets at
`public/coconut-cards/<card id>.jpg` — the filename is the card's `id`, which is
what `coconutCardImageUrl(id)` builds. Both `CoconutDeckBuilderPage` and the
Proxy Generator read them through that helper; nothing fetches them remotely.

The Proxy Generator's "+ Coconut cards" panel lists every face from
`COCONUT_CARDS` (click one to add a copy, or "Add all 26" to print one of
each). These go onto the sheet as `{ imageSrc, name, version }` rather than a
LorcanaJSON card object, which is what makes `ProxyCard` print the image
instead of the B&W text layout — so a Coconut sheet prints in full color.

Every Coconut card is an alternate-ability variant of a real printed Lorcana
card (`baseFullName`), including the newer duo-card wave — Aladdin & Genie,
Belle & Beast, Darkwing Duck & Launchpad, Peter Pan & Tinker Bell, The Madrigal
Family, The Vine and Woody & Buzz Lightyear are all real cards, so they're
selectable in the deck builder and grant the same "4 copies of your Coconut
card" exception as the rest. Their only structural difference is `inks`: the
duo cards are dual-ink, so a deck built on one locks both and has a single free
ink slot left. (`The Vine` is in that wave but is single-ink Steel.)
