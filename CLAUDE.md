# CLAUDE.md

Guidance for Claude Code in this repository. This file is the map; the reference for each area lives in `docs/agents/` and the procedures in `.claude/skills/`. Read the area's doc before changing its code.

## Commands

```bash
npm run dev        # Vite dev server (port 5173 or $PORT)
npm run build      # Build app + package Chrome extension (rewrites public/lorcana-extension.zip; restore it before committing)
npm run lint       # ESLint
npm test           # Vitest, once (npm run test:watch to watch)
```

Unit tests: `src/lib/__tests__/<lib>.test.js`, one per pure-logic lib in `src/lib/`, plus `api/_lib/__tests__/` for server-side pure helpers; `npm test` runs both and CI runs it on every push. UI behavior is verified in a browser: `docs/agents/ui-screenshots.md` is the recipe (local Vite server, never the Vercel preview, which sits behind a deployment-protection gate; mocks for gated pages; where screenshots go).

## Pull requests

1. Include the Vercel preview link, read from the vercel[bot] comment per the `vercel-preview-url` skill (the URL cannot be derived from the branch name).
2. Include screenshots for UI changes, before/after when a layout changed, saved under `docs/screenshots/` and referenced by raw GitHub URL.

## Stack

React 19 + React Router 7 + Tailwind CSS 4 + Vite 8 on Vercel; serverless routes in `api/*.ts`; Supabase + Google OAuth. A user's own game data stays client-side (IndexedDB, localStorage). Supabase holds the session, a `profiles` table of supporter tiers, the admin-imported Tournament History archive, and each supporter's Stream Overlay tables. Local `.env` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; every server-side secret is listed in `docs/agents/api-routes.md`.

## Deeper reference

| Read before touching | Doc |
|---|---|
| `api/*`, server secrets, Discord bot, Metafy, Substack | `docs/agents/api-routes.md` |
| `/stream-overlay/*`, `streamOverlay.js`, `streamTables.js`, `stream_tables` migrations, Decklist Inspector overlay | `docs/agents/stream-overlay.md` |
| Tournament Lookup, Store Lookup, Field Breakdown, `/results/*`, the Tournament History archive | `docs/agents/tournaments.md` |
| Match History, Analytics, Library, player profiles, Winrate Matrix, Meta Synthesis, Deck Doctor, Stock Decks, Deck Insights, Game Scraper | `docs/agents/duels-data.md` |
| Blog, rules browser | `docs/agents/content.md` |
| [Format Coconut] | `docs/agents/coconut.md` |
| Any UI change that needs a screenshot or a browser check | `docs/agents/ui-screenshots.md` |

Skills (`.claude/skills/`) hold procedures and upstream API notes: `add-coconut-card`, `new-blog-post`, `tournament-history-sync`, `vercel-preview-url`, `vercel-proxy-pattern`, `ravensburger-tournament-api`, `duels-api-docs`, `lorcanajson-docs`, `discord-interactions-docs`, `gamelog-pipeline`, `chrome-extension-mv3`, `indexeddb-schema-map`.

## Architecture

Pages in `src/pages/` are self-contained; shared logic lives in `src/lib/` as pure functions (tested) beside thin I/O modules. Page wrappers are full-width (`w-full px-6 py-8`), matching `Nav`/`Footer`; `max-w-* mx-auto` only for a small centered message or list.

### Routes (`src/App.jsx`)

| Route | Page | Purpose |
|---|---|---|
| `/` | `HomePage` | Tool catalog from `src/lib/siteSections.js` (Resources, Deckbuilding, Coaching, Tournament, Content Creators) |
| `/sitemap` | `SitemapPage` | The same catalog as plain links |
| `/blog`, `/blog/:slug` | `BlogIndexPage`, `BlogPostPage` | Posts from `content/blog/` |
| `/login`, `/auth/callback` | `LoginPage`, `AuthCallbackPage` | Google OAuth via Supabase |
| `/proxy` | `ProxyGeneratorPage` | B&W proxy print sheets, plus Coconut card faces |
| `/coconut-deck-builder` | `CoconutDeckBuilderPage` | [Format Coconut] singleton deck builder |
| `/limited-guide` | `LimitedGuidePage` | Static limited-format reference |
| `/rules`, `/rules/:doc`, `/rules/:doc/changes` | `RulesPage`, `RulesDocumentPage`, `RulesChangesPage` | Versioned official documents with diffs |
| `/deck-insights` | `DrawOddsPage` (exports `DeckInsightsPage`) | Draw odds, mulligan/scry simulation, curves |
| `/game-scraper` | `GameScraperPage` | Live duels.ink game state via the Chrome extension |
| `/library` | `LibraryPage` | Saved games (`?tab=history`) and opponent directory (`?tab=players`) |
| `/scouting/game/:uuid` | `ScoutedGamePage` | One scraped game replay |
| `/players/:name` | `PlayerProfilePage` | Unified opponent profile (scouted games + imported gamelogs) |
| `/deck-comparison` | `DeckComparisonPage` | Diff two pasted decklists |
| `/decklist-inspector`, `/decklist-inspector/overlay` | `DecklistInspectorPage`, `DecklistOverlayPage` | Creator decklist view and its OBS overlay (overlay unguarded by design) |
| `/stream-overlay`, `/view`, `/control`, `/notes` | `StreamOverlay*Page` | Tournament stream overlay: panel (gated), OBS view, tablet controller, caster notes (the last three unguarded) |
| `/settings` | `SettingsPage` | duels.ink tokens, the Metafy card (`MetafyAccessSteps`, Connect / Disconnect, upgrade link), dark mode |
| `/match-history` | `MatchHistoryPage` | duels.ink ranked history with cascading filters and Sessions & Tilt |
| `/gamelog` | `GamelogViewerPage` | Bare single-gamelog inspector (`?id=`); nothing links here |
| `/analytics` | `AnalyticsPage` | Imported gamelogs: drilldown, card stats (WAR), matchup matrix |
| `/winrate-matrix` | `WinrateMatrixPage` | Public duels.ink matchup matrix and meta drift |
| `/meta-synthesis` | `MetaSynthesisPage` | Plain-English meta report by rank band |
| `/stock-decks`, `/forge-decks` | `StockDecksPage`, `ForgeDecksPage` | duels.ink average builds per archetype; the site's own lists from `content/forge-decks/` |
| `/practice-plan` | `PracticePlanPage` | Matchup practice allocation and tournament Monte Carlo |
| `/deck-doctor` | `DeckDoctorPage` | Your list vs the field's build, lift, WAR and matchups |
| `/field-breakdown` | `FieldBreakdownPage` | A room's decklists (pasted or carde.io PDF) → ink pairs for the Stream Overlay |
| `/tournament-lookup` | `TournamentLookupPage` | Ravensburger live standings, ID analysis, pairing history |
| `/results`, `/results/events/:id`, `/results/players/:id` | `Results*Page` | Public Tournament History archive |
| `/lore-tracker` | `LoreTrackerPage` | Mobile lore counter |
| `/store-lookup` | `StoreLookupPage` | RPH store details and store-tier status |
| `/admin`, `/admin/tournament-import` | `AdminPage`, `AdminTournamentImportPage` | Supporter grants; archive import |

Supporter-gated routes are the `SUPPORTER_PATHS` set in `src/lib/access.js` (`SupporterRoute` wraps them; `HomePage` badges them). `/admin` enforces admin itself. Legacy redirects live at the bottom of `App.jsx`. All routes render inside one `ErrorBoundary` keyed on the pathname; `Nav` sits outside it.

### Components (`src/components/`)

`Nav` (ink-black bar, one dropdown per catalog section, ⌘K `ToolSearch`; hidden on `/lore-tracker`, the decklist overlay and every `/stream-overlay/*` route, as is `Footer`) · `ui/` building blocks (`Button`, `Card`, `PageHeader`, `Input`/`Textarea`/`Select`, `Tabs`, `Badge`) · `ErrorBoundary` · `SupporterRoute` (the gate: tool name, description, a preview screenshot and a Metafy call to action) + `MetafyAccessSteps` · `GameView` + `HandPredictor` (scraped-game display) · `SearchBar` + `ProxyCard` (proxy generator) · `ShareCardModal` (canvas share images) · `PlayerMatchHistory`, `PairingHistoryPanel`, `EliminationBracket`, `PlayerTags` (Tournament Lookup) · `StreamPairingPicker` (Stream Overlay) · `SessionInsights` (Match History) · `InkIcons`, `ToolIcon`, `StatCard`, `MetaTrendChart`, `DeckListCard`, `DecklistCardBar`, `PostByline`, `PlayerProfileDetail`, `ResultsArchive` · `deckDoctor/*` and `analytics/*` sub-views.

### Hooks (`src/hooks/`)

`useAuth` (session, ensures a `profiles` row) · `useSupporter` (`isSupporter` is true for `supporter` and `admin`) · `useCards` (card data from `/api/cards`, IndexedDB-cached) · `useTournamentLiveUpdates` (RPH Pusher) · `usePairingBadges` · `useTransparentBackground` (OBS views) · `useTheme`.

### Shared libraries (`src/lib/`)

| Area | Files |
|---|---|
| Auth, access, theme | `supabaseClient.js`, `access.js` (`SUPPORTER_PATHS`; `METAFY_URL`/`METAFY_JOIN_URL`/`METAFY_PRICE`, the one home of the Metafy link and The Forge tier's price), `theme.js` |
| Storage | `db.js` (IndexedDB `lorcana_pro_tools`), `cardsCache.js`, `scoutedGames.js`, `coconutDecks.js`, `gamelogHistory.js` (IndexedDB `lorcana_gamelogs`); see the `indexeddb-schema-map` skill before adding a store |
| Cards and inks | `inkColors.js` (`resolveInkName`, `resolveColors`, `matchupKey`), `cardAnalysis.js` (`buildCardIndex`), `parseDeckList.js`, `decklistShared.js` (`matchDeckList`, `inkFill`, deck URL params) |
| duels.ink | `duelsApi.js` (tokens, match history, gamelogs, stats), `parseGamelog.js`, `gameStats.js`, `analyticsAggregation.js`, `cardImpact.js` (WAR), `buildWinrateMatrix.js`, `metagameAnalysis.js`, `sessionStats.js`, `opponentDirectory.js`, `playerProfiles.js`, `leakDetection.js`, `handInference.js`, `gameSnapshot.js`, `gameExport.js`/`gameImport.js`, `exportGameIds.js` |
| Meta stats | `metaSynthesis.js`, `metaDrift.js`, `rankTiers.js`, `archetypeStats.js`, `deckDoctor.js`, `stockDecks.js`, `forgeDecks.js`, `practiceSim.js`, `drawOddsMath.js`, `monteCarloSim.js` |
| Tournaments | `tournamentApi.js`, `tournamentLive.js`, `tournamentHistoryApi.js`, `resultsArchive.js`, `bracket.js`, `storeTiers.js`, `trackedStores.js`, `fieldBreakdown.js`, `cardePdf.js` |
| Stream Overlay | `streamOverlay.js` (pure, tested), `streamTables.js` (Supabase) |
| Content | `siteSections.js` (the catalog; new tools need an `icon` in `toolIcons.js`, a test enforces it), `blog.js`, `blogPost.js`, `blogMeta.js`, `frontmatter.js`, `rules/` |
| Coconut | `coconutCards.js`, `coconutFormat.js`, `coconutDecklistText.js` |
| Share images (canvas) | `tournamentShareImage.js`, `metaSynthesisShareImage.js`, `coconutShareImage.js` |

### Design system

Paper surfaces, an ink-black nav bar, condensed caps display type, one forge-gold accent, defined as tokens in `src/index.css`'s `@theme` block. `font-sans` is Source Sans 3, `font-display` is Oswald (every `<h1>` gets it via a base rule; use `font-display uppercase tracking-wide` for matching headings). Brand colors: `paper`, `ink`/`on-ink`, `forge`/`on-forge`/`forge-ink`/`forge-soft`; the gray scale is a warm paper neutral and `white` is the card surface. Radii are squared off (`rounded`, `rounded-lg` are 2–4px). Use the `ui/` building blocks rather than hand-rolled class strings; `forge` is for the one primary action or current selection, ink and gray for the rest; blue is off-brand; win/loss and similar status colors stay semantic.

### Dark mode

**No `dark:` variants anywhere, and none in new code.** `src/index.css` remaps Tailwind's color variables under `html.dark`, so every palette utility themes itself: grays 50–300 become dark surfaces and borders, 400–950 light text, accent families mirror so tinted panels darken while their text lightens. Stay on the palette and it works. `bg-black` is not remapped (it is the modal scrim) so use `bg-gray-900` for a solid dark fill. Inline hex and canvas colors do not participate (`ProxyCard.jsx` is inline-styled on purpose: a proxy prints white). The remap is `@media screen` only, so print stays light. The preference (`light`/`dark`/`system`, localStorage `lorcana_theme`) is read by `theme.js`, applied by `context/ThemeProvider.jsx`, written only by `SettingsPage`; an inline script in `index.html` applies the class before first paint and duplicates the storage key, so change both together.

### Access control

`profiles.supporter_tier` (`supporter` | `admin`) with `supporter_source` (`manual` from `AdminPage`, `metafy` from the Metafy integration, which never overwrites a manual grant). RLS lets users read their own row; only admins (`is_admin()`) update tiers. Gating is client-side UX only: the `/api/*` proxies do not check supporter status. The gate (`SupporterRoute`) shows the tool's catalog entry, a screenshot from `public/previews/<tool path>.jpg` (a unit test in `access.test.js` requires one per `SUPPORTER_PATHS` entry; capture it against the local dev server as a supporter at 1440×900; a gated sub-route names its tool with `previewPath`) and the Metafy call to action with `MetafyAccessSteps`.

### API routes

Vercel functions in `api/*.ts`, flat files only (a nested route once deployed green and silently served the SPA shell). **Vercel Hobby caps a deployment at 12 functions; the count is 9.** A new endpoint joins an existing `?endpoint=` dispatcher (`duels.ts`, `tournament-history.ts`, `metafy.ts`) or `tournament.ts`'s `?type=` switch rather than adding a file; the `vercel-proxy-pattern` skill has the shape. Routes: `duels` (every duels.ink call), `tournament` (Ravensburger), `tournament-history` (the archive, Supabase), `duels-tokens` (encrypted token store), `card-image` (allow-listed image proxy), `metafy`, `discord-interactions`, `discord-tournament-tick`, `subscribe-substack`. `/api/cards` is a rewrite to LorcanaJSON, not a function. Details, secrets and the integrations: `docs/agents/api-routes.md`.

### Storage

| Where | What |
|---|---|
| IndexedDB `lorcana_pro_tools` | `games` (scraped snapshots), `cards` (LorcanaJSON cache), `coconutDecks` |
| IndexedDB `lorcana_gamelogs` | `gamelogs` (parsed imports) |
| localStorage | `lorcana_theme`, `lorcana_deck_names`, `lorcana_stream_table`, `lorcana_field_breakdown`, `lorcana_lore_tracker`, per-page form state |
| `chrome.storage.local` | `lorcana_active_games` (extension, 2-hour TTL) |
| Supabase | `auth`, `profiles`, `duels_api_tokens` (encrypted), `metafy_links`, `discord_favorite_players`, `stream_tables` (owner RLS + public read function), `tournament_history_events`/`_standings`/`_matches` (service-role only) |

### Ink icons

`public/ink/{amber,amethyst,emerald,ruby,sapphire,steel}.png`, rendered through `components/InkIcons.jsx` or a direct `<img>`; normalize raw color strings with `resolveColors()` first.
