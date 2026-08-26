---
name: ravensburger-tournament-api
description: Load this before touching src/lib/tournamentApi.js, api/tournament.ts, api/_lib/discordTournamentApi.ts, api/_lib/discordTournamentEmbeds.ts, TournamentLookupPage, TournamentCutPage, PracticePlanPage, or the Discord /tournament and /favorite commands. There is no published documentation for this API — the two client implementations in this repo are the only reference, and the upstream has an undocumented quirk (match data requires a second, separate host) worth knowing before assuming a straightforward REST API.
---

# Ravensburger Play Hub Tournament API

There is **no official API documentation** for the Ravensburger Play Hub
tournament API (confirmed — no `api-docs`-style endpoint, no published
reference). `src/lib/tournamentApi.js` (browser client, via the
`/api/tournament` proxy) and `api/_lib/discordTournamentApi.ts` (a
standalone port used by the Discord bot, since that serverless function
isn't behind `/api/tournament`) are both hand-written against observed
upstream behavior — they *are* the documentation. Don't assume standard
REST/pagination conventions without checking these files; the upstream has
already surprised this repo once (see below).

## When to use

Before touching:
- `src/lib/tournamentApi.js` — `fetchEventDetails`, `getTournamentStructure`,
  `fetchEventMatches`/`fetchAllRoundMatches`, `fetchAllRegistrations`,
  `fetchTournamentStandings`, `analyzeId`, `analyzeAdvancement`
- `api/tournament.ts` — the Vercel proxy this all routes through (see
  `vercel-proxy-pattern` skill for the general proxy shape; this file has
  tournament-API-specific routing on top of it)
- `api/_lib/discordTournamentApi.ts` — the Discord bot's standalone port of
  the same logic (kept in sync manually, not shared source)
- `TournamentLookupPage`, `TournamentCutPage`, `PracticePlanPage` — consumers
  of standings/structure data
- The Discord `/tournament` and `/favorite` commands and
  `api/discord-tournament-tick.ts`

## Two upstream hosts — not one

`api/tournament.ts` defines two base URLs and routes to different ones per
`type`:

- `RAVEN_BASE = https://api.ravensburgerplay.com/api/v2` — used for `event`,
  `registrations`, and `standings`
- `HYDRA_BASE = https://api.cloudflare.ravensburgerplay.com/hydraproxy/api/v2`
  — used **only** for `matches`

This split exists because **match results are not exposed on `RAVEN_BASE`
without an authenticated session** (401 "Authentication credentials were not
provided"). The public tournament results page instead reads match data
through this Cloudflare-fronted proxy host. If a future task needs a new
kind of tournament data and the "obvious" `RAVEN_BASE` endpoint 401s, this is
why — check whether the public results page uses the Hydra proxy for it
before assuming the data isn't available at all.

## Known endpoint shapes (routed by `?type=` on `/api/tournament`)

- `event` → `GET {RAVEN_BASE}/events/{eventId}` — full event details incl.
  `tournament_phases` (each with `round_type`: `SWISS` or
  `RANKED_SINGLE_ELIMINATION`, `rounds`, `rank_required_to_enter_phase`),
  `top_cut_size`, `tiebreakers`, `gameplay_format`, `store`, etc.
- `registrations` → `GET {RAVEN_BASE}/events/{eventId}/registrations/` —
  paginated (`page`/`page_size`), response has `results` + `next_page_number`
  (null when done). `fetchAllRegistrations` loops until
  `next_page_number === null`.
- `standings` → `GET {RAVEN_BASE}/tournament-rounds/{roundId}/standings/paginated/`
  — paginated, entries have `rank`, `match_points`, `record`,
  `opponent_match_win_percentage`, `game_win_percentage`,
  `opponent_game_win_percentage`.
- `matches` → `GET {HYDRA_BASE}/tournament-rounds/{roundId}/matches/paginated/?avoid_cache=false`
  — the Hydra-proxied one. Response shape is inconsistent: sometimes
  `{ results: [...], next_page_number }` (paginated), sometimes
  `{ id, matches: [...], round_number, ... }` (a round object with matches
  inline). `extractMatches()` in `tournamentApi.js` normalizes both shapes
  — don't assume one or the other when adding new match-consuming code.

## Other quirks to know

- `api/tournament.ts` validates `eventId`/`roundId` against
  `/^[A-Za-z0-9_-]{1,64}$/` before building the upstream URL — both to reject
  path/query injection and because IDs can be numeric or UUID-style
  depending on context.
- A 404 on `type=matches` is treated as "no matches yet" and normalized to
  an empty result (`{ matches: [], results: [], next_page_number: null }`)
  rather than surfaced as an error — a round with no reported matches yet is
  a normal state, not a failure.
- `getTournamentStructure()` derives "current round" by preferring an
  `IN_PROGRESS` round with `standings_status === 'GENERATED'`, falling back
  to the last `COMPLETE` round with generated standings — a round existing
  doesn't mean its standings are ready to read yet.
- `advancementRequirement` is inferred two ways: an explicit
  `rank_required_to_enter_phase` field, or — if that's absent — regex-parsing
  a point threshold out of the next phase's `phase_name` (e.g. "24+ Point
  Bracket"). This is inherently fragile; if a phase name format changes
  upstream, this regex needs updating.

## Live updates: a Pusher WebSocket exists, but is undocumented and unused

HAR captures of `tcg.ravensburgerplay.com/events/{id}` show the site opening
a Pusher WebSocket for live updates, instead of (or alongside) polling:

```
wss://ws-us2.pusher.com/app/09b48f339d5acd1ffeb6?protocol=7&client=js&version=8.4.0&flash=false
→ client sends: {"event":"pusher:subscribe","data":{"auth":"","channel":"player-event-{eventId}"}}
→ server replies: {"event":"pusher_internal:subscription_succeeded","data":"{}","channel":"player-event-{eventId}"}
```

The app key (`09b48f339d5acd1ffeb6`) is public (visible in the connection
URL) and the channel is subscribed with an **empty `auth` token**, so this
looks like a public, unauthenticated Pusher channel — no session or secret
needed to listen.

**Not yet integrated anywhere in this repo**, and the only frames captured
so far are the connection handshake — no captures exist of what event
name(s)/payload shape(s) get pushed when something actually changes
(a round completing, standings regenerating, the timer starting). Two HAR
captures against not-yet-started events (`886050`, `886069`) confirmed the
handshake but had nothing happen tournament-side during the recording, so
there was nothing to observe past `pusher_internal:subscription_succeeded`.

To capture real payloads: connect to the same URL and subscribe to
`player-event-{eventId}` for an event that's **currently live** (a round
actually in progress, players actively reporting), and log every frame.
Node 22's built-in `WebSocket` global is enough — no `ws` package needed:

```js
const ws = new WebSocket(
  'wss://ws-us2.pusher.com/app/09b48f339d5acd1ffeb6?protocol=7&client=js&version=8.4.0&flash=false'
)
ws.addEventListener('message', (ev) => {
  console.log(ev.data)
  const msg = JSON.parse(ev.data)
  if (msg.event === 'pusher:connection_established') {
    ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { auth: '', channel: `player-event-${eventId}` } }))
  }
})
```

Once real event names/payloads are captured, this section should be updated
with them, and it becomes worth evaluating whether `TournamentLookupPage`
should subscribe for live standings/round-change updates instead of relying
on the user re-clicking "Load Standings" — but don't build against this
until payloads are actually observed; don't guess event names from the
handshake alone.

## Steps

1. Check `src/lib/tournamentApi.js` and `api/tournament.ts` first — they're
   the ground truth, not an external doc.
2. If the task needs a new kind of data, check whether the public
   Ravensburger tournament results page (in a browser) exposes it, and which
   host (`RAVEN_BASE` vs `HYDRA_BASE`) the network tab shows it coming from,
   before guessing.
3. If `api/_lib/discordTournamentApi.ts` needs the same change as
   `tournamentApi.js`, update both — they're not shared source and will
   drift if only one is touched.
4. Keep response-shape normalization (like `extractMatches`) defensive —
   this API's shapes are not guaranteed consistent across endpoints.
