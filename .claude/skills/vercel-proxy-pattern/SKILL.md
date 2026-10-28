---
name: vercel-proxy-pattern
description: Read before adding or changing an api/*.ts route: the 12-function budget (join an ?endpoint= dispatcher, never a new file by default), the flat-file rule, and the shared proxy shape and error contract.
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

Before adding an endpoint to, or modifying, any file in `api/`: `duels.ts`
(every duels.ink call, `?endpoint=`), `tournament.ts` (Ravensburger,
`?type=`), `card-image.ts` (a host-allow-listed image proxy),
`tournament-history.ts`, `metafy.ts`, `duels-tokens.ts`,
`discord-interactions.ts`, `discord-tournament-tick.ts`,
`subscribe-substack.ts`. The last six are not proxies (they read and write
project-owned Supabase data or implement a webhook) but share the error
contract and the budget rules below.

## Two rules before the pattern

1. **Function budget.** Vercel's Hobby plan caps a deployment at 12
   serverless functions, counted as files in `api/` (`api/_lib/` excluded).
   CLAUDE.md's API Routes section keeps the current count. A new endpoint
   joins the closest existing dispatcher (`duels.ts` keys a `HANDLERS` map by
   `?endpoint=`; `tournament.ts` switches on `?type=`; `tournament-history.ts`
   and `metafy.ts` dispatch on `?endpoint=`) rather than adding a file, and
   `src/lib/*Api.js` gains a matching client function.
2. **Flat files only.** `api/<name>.ts`. A nested dynamic route
   (`api/patreon/[action].ts`) built green and silently served the SPA shell
   for every request. After a deploy, curl a new route and confirm JSON, not
   `text/html`.

## The pattern, by example

**Auth-forwarding JSON proxy** (`duels.ts`'s `handleMatchHistory` and
`handleDeck`, both through its `proxyJson()` helper):
1. `requireBearer()`: 401 unless `req.headers.authorization` starts with
   `Bearer ` (skip for endpoints the upstream treats as public, like
   `handleStats`)
2. Forward query params to the upstream URL via `URLSearchParams`, dropping
   the dispatch key (`endpoint`)
3. `fetch()` the upstream with the same `Authorization` header
4. Read the response as text first (not `.json()` directly) so a
   non-JSON/empty error body can be handled instead of throwing
5. If `!upstreamRes.ok`, return the upstream's status code with a
   `{ error, status, detail }` body; `detail` is the first ~200 chars of
   the upstream body, enough for debugging without dumping arbitrary-size
   payloads
6. Validate the success response is actually JSON (`content-type` check,
   then `JSON.parse` in a try/catch) before forwarding it, so a silently
   broken upstream returning an HTML error page with a 200 never reaches
   the frontend
7. Set `Cache-Control` deliberately: `no-store` for per-user data
   (match history), `max-age=N, stale-while-revalidate` for less volatile
   data (deck details, stats)
8. Wrap the whole thing in try/catch; network failures return 502 with
   `{ error: 'Failed to reach duels.ink', detail: String(e) }`

**Binary proxy** (`duels.ts`'s `proxyBinary()` for gamelogs;
`card-image.ts`): same shape, no JSON validation; read `.arrayBuffer()`,
forward with the right content type and a private cache header. An image
proxy allow-lists the upstream host so it cannot become an open proxy.

**Supabase-backed route** (`duels-tokens.ts`, `tournament-history.ts`,
`metafy.ts`): verify the caller's Supabase session server-side with
`auth.getUser(jwt)` through the service-role client in
`api/_lib/discordSupabase.ts`, and only ever operate on that verified user's
rows, never a client-supplied id. Admin-only endpoints go through
`api/_lib/requireAdmin.ts`.

## Steps for a new route

1. Decide auth requirement (Bearer-forwarded, Supabase session, public) and
   JSON vs. binary response; pick the closest existing handler as a template.
2. Add the handler to the dispatcher it belongs with, or, only when no
   dispatcher fits and the budget allows, a new flat file.
3. Copy its structure: auth check → param/body validation → upstream fetch
   → response validation → status/header passthrough → try/catch 502
   fallback.
4. Keep error bodies in the `{ error, status?, detail? }` shape so
   `src/lib/duelsApi.js`-style client code can rely on a consistent contract
   (`res.status === 401` → "Invalid or expired API token", etc.).
5. Set `Cache-Control` deliberately: no caching for per-user data, a real
   max-age for public slow-changing data.
6. Update the routes table in `docs/agents/api-routes.md` and, for a new
   file, the function count in CLAUDE.md. If the target endpoint isn't covered by the
   relevant docs skill (`duels-api-docs`, `lorcanajson-docs`,
   `discord-interactions-docs`, `ravensburger-tournament-api`), note that it
   is unofficial, as `duels.ts`'s `deck?personalStats=1` and `stats`
   archetype fields are.
