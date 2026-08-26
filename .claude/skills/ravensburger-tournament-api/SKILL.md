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

## Live updates: a real Pusher-backed cache-invalidation channel (mechanism confirmed from source; a live payload capture is still open)

The site opens a Pusher WebSocket and subscribes to a per-event channel:

```
wss://ws-us2.pusher.com/app/09b48f339d5acd1ffeb6?protocol=7&client=js&version=8.4.0&flash=false
→ client sends: {"event":"pusher:subscribe","data":{"auth":"","channel":"player-event-{eventId}"}}
→ server replies: {"event":"pusher_internal:subscription_succeeded","data":"{}","channel":"player-event-{eventId}"}
```

The app key (`09b48f339d5acd1ffeb6`, cluster `us2`) is public and the channel
subscribes with an **empty `auth` token** — a public, unauthenticated
channel, no session/secret needed to listen.

**This is a real, deliberate live-update mechanism** — confirmed by reading
the site's own JS bundle (fetched directly, e.g.
`https://tcg.ravensburgerplay.com/_next/static/chunks/{hash}.js`; the
relevant one exports `usePusherSubscription`/`EventClientProvider` — hashes
are per-deploy so grep the current bundle set for `player-event` rather than
trusting a specific filename). `player-event-{id}` is the **only** Pusher
subscription anywhere in the app (confirmed — no other `channelName:` call
site exists). It's wired into React Query as a cache-invalidation/patch
channel:

- The client binds a custom Pusher event named **`"message"`** on the
  channel (not the Pusher-protocol-level `pusher:*` events).
- Payload shape: `{ type: "INVALIDATE" | "UPDATE" | "EVENT", entity: [...queryKey], id?, payload? }`.
  - `"INVALIDATE"` → calls `queryClient.invalidateQueries({queryKey: entity})`,
    forcing a refetch via the normal REST endpoints — no data in the push
    itself.
  - `"UPDATE"` → **patches the query cache directly with `payload`**
    (`setQueriesData`, matching by `payload.id`) — genuine pushed data, no
    refetch needed. Falls back to invalidating everything if `id` is
    missing/null.
  - `"EVENT"` → dispatched to a named handler in an `eventHandlers` map
    passed to the hook; the one call site in this app passes `{}` (no
    named-event handlers registered), so `"EVENT"` messages are inert here
    even if the server sends them.
  - The `entity` (query key) values observed in the `Set` gating which
    `INVALIDATE`s are acted on: `tournamentRoundsMyMatchRetrieve`,
    `tournamentRoundsMatchesPaginatedList`, `eventsRegistrationsList`,
    `userEventStatusesEventRetrieve`, `tournamentRoundsStandingsRetrieve` —
    i.e. exactly matches, registrations, user status, and standings.
  - There's self-write debouncing: a client that just performed a mutation
    ignores the broadcast echo of its own change for a short window, so a
    reporting client doesn't double-process its own update.

**Still unresolved — a real payload has not actually been captured.** Live
test against event `734895` (round 2 `IN_PROGRESS`): stayed connected and
subscribed for ~5 minutes while a real match on that round completed and
was scored (`updated_at` moved `18:21:51` → `19:11:10`, `status` flipped to
`COMPLETE`, `winning_player` populated) — **zero frames arrived** beyond the
subscription confirmation, despite that match completion being exactly the
kind of event the `entity` set above should cover
(`tournamentRoundsMatchesPaginatedList`). Two plausible explanations, not
yet distinguished: (a) broadcasts are gated to specific higher-level actions
(e.g. a round being finalized/standings regenerated, which never happened
in this window — round 2's `standings_status` stayed `NOT_GENERATED`
throughout) rather than every individual match score entry, or (b)
something else suppressed the broadcast for this specific event/deploy.
**Before building anything on this channel, re-test against a moment likely
to produce a broadcast** — ideally a full round transitioning to
`COMPLETE`/`standings_status: GENERATED`, or a new registration — and
capture the actual frame. Don't guess the payload beyond what's confirmed
above from source.

To capture a live payload: connect to the same URL, subscribe to
`player-event-{eventId}` for a currently-live event, and log every frame.
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

**Now integrated:** `src/lib/tournamentLive.js` (`subscribeToTournamentLive`)
+ `src/hooks/useTournamentLiveUpdates.js` wire `TournamentLookupPage` up to
this channel via the `pusher-js` package (same client library the upstream
site itself uses). Given the payload shape is still only partially
confirmed (see above), the integration deliberately does **not** try to
parse `type`/`entity`/`payload` or apply anything from the message
directly — it treats every `"message"` event as a generic "something
changed, go refetch" signal (debounced ~1.5s) and re-runs the same REST
calls (`fetchEventDetails`/`fetchTournamentStandings`/`fetchAllRegistrations`/
`fetchAllRoundMatches`) the manual "Load Standings" button already uses,
silently, without resetting the open UI state (selected player, active tab,
search term). This sidesteps the unconfirmed-payload risk entirely — if a
message arrives with a shape we didn't anticipate, the generic refetch
still does the right thing. A small pulsing "Live" badge shows in the info
strip while `pusher.connection.state === 'connected'`, with a ticking
"Updated Xs ago" label; if the connection never reaches `'connected'`
(blocked network, Pusher outage, etc.) the badge simply never appears and
the page behaves exactly as before — this is a pure enhancement, never a
required dependency for the page to work.

**Sandbox note:** this channel could not be verified end-to-end from
Playwright inside the agent sandbox — a raw `new WebSocket('wss://ws-us2.pusher.com/...')`
call from a sandboxed headless Chromium never received a single event
(`open`/`message`/`error`/`close`) even after 6s, both with and without
explicitly routing Chromium through the sandbox's `$HTTPS_PROXY`. The
sandbox's outbound proxy is evidently HTTP(S)-request-shaped and doesn't
tunnel arbitrary `wss://` WebSocket upgrades for a real Chromium network
stack, even though the same URL connects fine from a plain Node script in
the same sandbox (Node's own `WebSocket`/undici networking apparently
routes differently). This is a sandbox limitation, not a code defect —
confirmed working from real end-user browsers via two independent HAR
captures earlier in this investigation. If a future sandboxed session needs
to browser-verify Pusher connectivity again, expect this same silent
failure and don't chase it as a bug; verify via the deployed Vercel preview
in a real browser instead.

Once a real `"message"`-event payload is captured (still an open item —
see above), come back and either tighten the integration to act on specific
`entity` keys instead of refetching everything, or confirm the generic
approach is sufficient and drop this note.

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
