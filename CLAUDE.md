# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server (port 5173 or $PORT)
npm run build      # Build app + package Chrome extension
npm run lint       # ESLint (React hooks + refresh rules)
npm run preview    # Preview production build locally
```

There is no test suite — validation is manual.

## Stack

React 19 + React Router 7 + Tailwind CSS 4 + Vite 8, deployed on Vercel. Serverless API routes live in `/api/*.ts` (TypeScript). No backend database — all user data is stored client-side in IndexedDB or localStorage.

## Architecture

### Pages → Shared Libs → Storage

Pages are in `src/pages/`. Each page is self-contained. Shared logic lives in `src/lib/`:

| File | Purpose |
|---|---|
| `duelsApi.js` | duels.ink API client (match history, gamelog, replay fetches) |
| `parseGamelog.js` | Decompress + parse gzip gamelogs into rich game state |
| `gamelogHistory.js` | IndexedDB store for parsed gamelogs (`lorcana_gamelogs` db) |
| `gameHistory.js` | IndexedDB store for manually-entered game snapshots (`lorcana_pro_tools` db) |
| `gameStats.js` | Aggregate stats across game records (matchups, card plays, ink curves) |
| `gameSnapshot.js` | Export/import game records as JSON files |
| `playerProfiles.js` | Build player deck profiles and win rates from game history |
| `handInference.js` | Hypergeometric hand probability calculator |
| `inkColors.js` | Ink color constants and normalization utilities |

### Routing

Defined in `src/App.jsx`. Several legacy routes redirect to current ones:
- `/replay-analyzer` → `/gamelog-analyzer`
- `/game-history` → `/library?tab=history`
- `/players` → `/library?tab=players`
- `/legality-checker` → `/deck-insights`

### External APIs

**duels.ink** — Authenticated via Bearer token stored in localStorage (`duels_api_token`). The Vercel serverless routes in `/api/` are thin forwarding proxies — they pass the token through and add caching headers. No server-side auth of their own.

**LorcanaJSON** — Card data fetched from `https://lorcanajson.org/files/current/en/allCards.json`. In dev, `vite.config.js` proxies `/api/cards` to this URL. In production, `vercel.json` handles the same rewrite.

### Gamelog Pipeline

This is the most complex data flow in the app:

1. `fetchGamelogBuffer(gameId)` in `duelsApi.js` hits `/api/duels-gamelog`, which fetches a gzip binary from `https://duels.ink/g/{id}`
2. `decompressGzip(arrayBuffer)` in `parseGamelog.js` decompresses via native `DecompressionStream('gzip')`
3. `parseGamelog(id, logs, meta)` processes an array of log entries with `{type, player, turnNumber, data, visibility}` shape into a structured object with per-player draw sequences, challenges, lore events, and card effects
4. The result is saved to IndexedDB via `gamelogHistory.js` and displayed in `GamelogAnalyzerPage` or `GameView`

Key parsing details in `parseGamelog.js`:
- `ON_PLAY_DRAWS` map tracks cards that draw on play (e.g. Junior Woodchuck Guidebook → 2 draws); uses `pendingDrawSource`/`pendingDrawCount` to attribute subsequent `CARD_DRAWN` events to the source card
- `CARD_PUT_INTO_INKWELL` with `fromZone === 'field'` means the *other* player caused the removal (e.g. Let It Go, Hades) — attribute as effectRemovals on the other player's last played card
- `lastPlayedByPlayer` tracks the most recently played card per player for effect attribution

### Match History Filters

`MatchHistoryPage` uses a cascading filter pattern where each filter layer narrows the options available to filters below it:

```
games → afterDate → afterQueue → afterMyColors → afterOppColors → filteredGames
```

Color options exclude 3+ ink entries (sealed/limited formats). Deck identity uses `your_deck_id` (stable API field) with `deckFingerprint(your_decklist)` as fallback. Deck names are stored in localStorage under `lorcana_deck_names`.

### Match history game object shape

Key fields on game objects from the duels.ink API:
- `your_player` (1 or 2), `your_deck_id`, `your_deck_colors` ("ruby/sapphire"), `your_decklist` (array of `{cardId, count}`)
- `opp_display_name`, `opp_deck_colors`, `opp_decklist`
- `started_at` (ISO string — game time), `went_first`, `result`, `queue_name`
- `gamelog_id`, `mmr_delta`, `your_lore`, `opp_lore`

### Ink color icons

PNG files at `/public/ink/{color}.png` for: amber, amethyst, emerald, ruby, sapphire, steel. Use the `InkIcons` component in `MatchHistoryPage` or the `InkImg` component in `GamelogAnalyzerPage` to render them.

### Chrome Extension

`/chrome-extension` is a separate artifact. `npm run build` calls `build-extension.js` which packages it into a zip under `/public`. It does not share source with the main React app.
