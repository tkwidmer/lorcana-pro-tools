# API routes, server secrets and integrations

Read before touching anything in `api/`, a server-side secret, or the Discord, Metafy or Substack integrations. The `vercel-proxy-pattern` skill holds the route shape to copy.

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
- `CRON_SECRET` — shared secret checked by `/api/discord-tournament-tick`, `/api/metafy?endpoint=reconcile-tick` and `/api/tournament-history?endpoint=recompute-ratings`; must match the same-named secret in the GitHub repo (Settings → Secrets and variables → Actions) used by `.github/workflows/tournament-tracker-tick.yml`, `.github/workflows/metafy-reconcile-tick.yml` and `.github/workflows/ratings-recompute.yml`.
- `DUELS_TOKEN_ENCRYPTION_KEY` — symmetric passphrase used by `/api/duels-tokens` to encrypt/decrypt saved duels.ink API tokens at rest (via Postgres `pgcrypto`, see `supabase/migrations/005_duels_api_tokens_crypto_functions.sql`). Never exposed to the client.
- `METAFY_CLIENT_ID` / `METAFY_CLIENT_SECRET` — Metafy OAuth app credentials, used by `/api/metafy?endpoint=callback` to exchange the authorization code. The client ID is not secret (also exposed client-side as `VITE_METAFY_CLIENT_ID`); the client secret is a real secret.
- `METAFY_API_KEY` — an owner-scoped Metafy API key (scope `community`), used by `/api/metafy?endpoint=reconcile-tick` to list active community subscribers. No per-user OAuth token is ever persisted for Metafy — see "Metafy Integration" below.
- `METAFY_COMMUNITY_ID` — the ID of this app owner's own Metafy community, used by `/api/metafy?endpoint=callback` to check whether the connecting user has access to it.
- `METAFY_SUPPORTER_TIER_ID` — the ID of the specific Metafy subscription tier ("The Forge") that grants Supporter access here. The community has a second tier ("Supporter", for Metafy-side guides) that does **not** grant access — see "Metafy Integration" below.

See `discord-bot/README.md` for full setup.

### API Routes

Vercel serverless functions in `/api/*.ts`. Most are thin forwarding proxies with error handling and caching headers, and have no server-side auth on those — tokens are forwarded from the client. `/api/tournament-history` is the exception: it reads/writes project-owned Supabase data rather than proxying an external API, so it verifies the caller's Supabase session server-side on its admin endpoints (admin tier) and `pairing-badges`; its archive reads are public and edge-cached instead — see `docs/agents/tournaments.md`.

**Function budget — read before adding a route.** Vercel's Hobby plan caps a deployment at **12 serverless functions**, counted as files in `api/` (`api/_lib/` is excluded). The count is currently **9**. Going over fails the deploy, so the established fix is to consolidate related endpoints into one function dispatched by a query param — see `/api/duels`, `/api/tournament-history`, and `/api/metafy` (`?endpoint=`).

⚠️ **Use flat `api/<name>.ts` files only.** A nested dynamic route (`api/patreon/[action].ts`) was tried and **silently did not deploy** — the build went green, but every request to it fell through to the `/(.*)` → `/index.html` catch-all in `vercel.json` and returned the SPA shell instead of the function. That took the Patreon integration down in production (PR #175, reverted in #176). A green Vercel build is **not** evidence that a function exists; verify a new route by curling it after deploy and confirming a JSON/expected response rather than `text/html`.

| Endpoint | Upstream | Auth | Notes |
|---|---|---|---|
| `/api/duels` | Various duels.ink endpoints | Bearer token (except `stats`) | Single consolidated proxy for everything duels.ink, dispatched by `?endpoint=` — `match-history`, `gamelog`, `deck`, `stats`. Folded into one function (rather than one route per endpoint) because Vercel's Hobby plan caps a deployment at 12 serverless functions. `deck` additionally takes `?personalStats=1` to hit `/api/account/personal-stats` (undocumented — not in duels.ink's `/api-docs.md`) for per-deck-version stats, including each version's exact card list + timeframe, used by `AnalyticsPage`'s Card Impact (WAR) to confirm whether a card was actually in the deck for a given game. `stats` forwards duels.ink's documented `era` param; `fetchStats()` in `duelsApi.js` always scopes to the queue's current era, looking its key up once per queue from `meta.eras.currentEra.key`. Only the fields duels.ink documents as stable (`matchups`, `colorPairs`, `activity.totalGames`, `updatedAt`, a few `meta.*`) are a supported contract — the archetype fields (`profiles`, `archetypeMatchups`, `cardLift`, `pairCardLift`) behind `MetaSynthesisPage`, Deck Doctor and the matrix's archetype view are not. In bo3 queues `matchups[].games` counts matches, not games. |
| `/api/tournament` | Ravensburger API | Public | Routes by `?type=` param: `event`, `matches`, `registrations`, `standings`, `store`, `storeEvents`; handles pagination |
| `/api/tournament-history` | Supabase (`tournament_history_*` tables) | Public for the archive reads (`events`, `event`, `event-player`, `player`, `player-history`, `head-to-head`, `search-players`, `ratings`; edge-cached 5 min, search 1 min) — `import`, `recent-imports`, `suggested-imports` require admin tier; `recompute-ratings` takes admin tier or the `CRON_SECRET` bearer; `pairing-badges` requires any signed-in session | Single consolidated route for the caster history archive, dispatched by `?endpoint=` — `import` (admin-only, fetches an RPH event's final standings + matches server-side and upserts them), `player-history`, `head-to-head`, `search-players`, `recent-imports`, `suggested-imports`, `pairing-badges`, the public results reads `events`, `event`, `event-player`, `player`, and the player ratings: `ratings` (top 100 established players), `recompute-ratings` (POST, rebuilds `tournament_history_ratings`; nightly from `.github/workflows/ratings-recompute.yml`), plus a `rating` field on `player` and `player-history`. `vercel.json` gives this function `maxDuration: 60` for the recompute. See `docs/agents/tournaments.md`. |
| `/api/discord-interactions` | Discord Interactions webhook | Ed25519 signature (`DISCORD_PUBLIC_KEY`) | Not a proxy — implements the Discord bot's commands (Decode Deck QR, `/tournament`, `/favorite`, `/unfavorite`, `/favorites`) directly. See `discord-bot/README.md`. |
| `/api/subscribe-substack` | Substack's undocumented `/api/v1/free` embed-form endpoint | Bearer Supabase access token | Called by `AuthProvider.jsx` once per session on sign-in. See "Substack Signup Sync" below. |
| `/api/discord-tournament-tick` | None (internal) | Shared secret (`CRON_SECRET`) | Called every 30 min by `.github/workflows/tournament-tracker-tick.yml`; posts an update to Discord for any favorited player whose rank/record changed, and auto-deactivates favorites once an event ends. |
| `/api/metafy` | Metafy API | Varies by endpoint — see "Metafy Integration" below | Single consolidated route for the Metafy supporter integration, dispatched by `?endpoint=` — `callback`, `status`, `reconcile-tick`. See "Metafy Integration" below. |
| `/api/duels-tokens` | Supabase (`duels_api_tokens` table) | Bearer Supabase access token, verified server-side | Not a proxy — list/add/activate/delete the signed-in user's duels.ink API tokens, encrypted at rest with `DUELS_TOKEN_ENCRYPTION_KEY` through the `pgcrypto` SQL functions in migration `005`. Only ever operates on the verified user's rows. Client: `src/lib/duelsApi.js`. |
| `/api/card-image` | `api.lorcana.ravensburger.com` (allow-listed host) | Public | Binary image proxy for LorcanaJSON card art (`?url=`), so canvas renders (share cards) can read the pixels without CORS. Refuses any other host, so it can't be used as an open proxy. |

LorcanaJSON card data (`/api/cards`) is a rewrite, not a serverless function — handled by Vite proxy in dev and by `vercel.json` in production, both pointing to `https://lorcanajson.org/files/current/en/allCards.json`.

### External APIs

**duels.ink** — Authenticated via Bearer token. Tokens are stored in the Supabase `duels_api_tokens` table (encrypted at rest), one row per account, with an `is_active` flag choosing the active one; managed on the Settings page via `/api/duels-tokens` (see `src/lib/duelsApi.js`). The active token is passed through the Vercel proxy routes. No server-side validation of the duels.ink API itself.

**LorcanaJSON** — Card data from `https://lorcanajson.org/files/current/en/allCards.json`. Cached in IndexedDB after first load. In dev, `vite.config.js` proxies `/api/cards`; in production, `vercel.json` rewrites it.

**Ravensburger Tournament API** — Public API for live tournament events. Accessed via `/api/tournament` which routes by `?type=` param. Pagination is handled by `fetchAllRegistrations()` in `tournamentApi.js` which loops until `next_page_number === null`. The `getTournamentStructure()` helper resolves current round, advancement requirements, and top-cut info from the raw event response.

### Substack Signup Sync

A deliberate, narrow exception to the "no game data server-side" ethos above — this is marketing email, not game data. `AuthProvider.jsx` fires once per browser session per signed-in user: it grabs the current Supabase access token and calls `POST /api/subscribe-substack`. That route verifies the token via Supabase (`auth.getUser`), takes the email from the *verified* session only (never a client-supplied value), and forwards it to `https://inkbornforge.substack.com/api/v1/free` — the same undocumented endpoint Substack's own embed signup form posts to, since Substack has no official public API. Best-effort and fire-and-forget: failures are logged server-side and never surface to the user or block sign-in.

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

