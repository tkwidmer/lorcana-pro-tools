---
name: vercel-proxy-pattern
description: Load this before adding or modifying a Vercel serverless proxy route in /api/*.ts (e.g. a new duels-*.ts, tournament.ts-style, or any thin forwarding proxy to an external API). Documents the established pattern this repo's proxies follow, so new routes stay consistent with duels-match-history.ts, duels-deck.ts, duels-gamelog.ts, duels-replay.ts, duels-gamelog-bulk.ts, duels-stats.ts, and duels-leaderboard.ts instead of reinventing error handling ad hoc.
---

# Vercel Proxy Route Pattern

Most of `/api/*.ts` is thin forwarding proxies: the browser can't call
external APIs (duels.ink, LorcanaJSON, the Ravensburger API) directly due to
CORS (verified — duels.ink sends no `Access-Control-Allow-Origin` header at
all), so these Vercel functions sit in between. CLAUDE.md: "No server-side
auth on those — tokens are forwarded from the client." There's no external
doc for this pattern; it's established by precedent across the existing
routes, so a new proxy should follow the same shape rather than improvising.

## When to use

Before adding a new `/api/*.ts` route that forwards to an external API, or
before modifying an existing one (`duels-match-history.ts`, `duels-deck.ts`,
`duels-gamelog.ts`, `duels-gamelog-bulk.ts`, `duels-replay.ts`,
`duels-stats.ts`, `duels-leaderboard.ts`, `tournament.ts`, `proxy.ts`).

## The pattern, by example

**Auth-forwarding JSON proxy** (`duels-match-history.ts` is the fullest
example; `duels-deck.ts` is a lighter one):
1. Check `req.headers.authorization` starts with `Bearer ` — 401 if not
   (skip this step for endpoints the upstream treats as public, like
   `duels-leaderboard.ts`/`duels-stats.ts`)
2. Forward query params to the upstream URL via `URLSearchParams`
3. `fetch()` the upstream with the same `Authorization` header
4. Read the response as text first (not `.json()` directly) so a
   non-JSON/empty error body can be handled gracefully instead of throwing
5. If `!upstreamRes.ok`, return the upstream's status code with a
   `{ error, status, detail }` body — `detail` is the first ~200 chars of
   the upstream body, enough for debugging without dumping arbitrary-size
   payloads
6. Validate the success response is actually JSON (`content-type` header
   check, then `JSON.parse` in a try/catch) before forwarding it — protects
   the frontend from a silently-broken upstream returning an HTML error page
   with a 200 status
7. Set `Cache-Control` appropriately: `no-store` for per-user data
   (match-history), `max-age=N, stale-while-revalidate` for less volatile
   data (deck details, stats, leaderboard)
8. Wrap the whole thing in try/catch; network failures return 502 with
   `{ error: 'Failed to reach duels.ink', detail: String(e) }`

**Binary/blob proxy** (`duels-gamelog.ts`, `duels-replay.ts`): same shape,
but skip JSON validation — fetch with `redirect: 'follow'` (upstream 302s to
a CDN URL), read `.arrayBuffer()`, forward as `application/gzip` with a
private cache header.

**POST/bulk proxy** (`duels-gamelog-bulk.ts`): validate `req.method`,
validate the request body shape (array, size cap, all-strings) with 400s
before forwarding, same error-shape conventions on the way back.

## Steps for a new route

1. Decide auth requirement (Bearer-forwarded vs. public) and JSON vs. binary
   response — pick the closest existing route as a template.
2. Copy its structure: auth check → param/body validation → upstream fetch
   → response validation → status/header passthrough → try/catch 502
   fallback.
3. Keep error bodies in the `{ error, status?, detail? }` shape so
   `src/lib/duelsApi.js`-style client code can rely on a consistent contract
   (`res.status === 401` → "Invalid or expired API token", etc.).
4. Set `Cache-Control` deliberately — don't default to no caching for public,
   slow-changing data, and don't cache per-user data.
5. If the target endpoint isn't covered by the relevant docs skill
   (`duels-api-docs`, `lorcanajson-docs`, `discord-interactions-docs`), note
   that it's unofficial/reverse-engineered, same as `duels-deck.ts` and
   `duels-stats.ts` currently are.
