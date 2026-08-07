---
name: duels-api-docs
description: Fetch the latest duels.ink API documentation before building or modifying any feature that talks to duels.ink (match history, gamelogs, replays, leaderboard, decks, stats, or the consolidated /api/duels proxy route). Use this whenever a task touches duelsApi.js, leaderboardApi.js, parseGamelog.js, or api/duels.ts, or when the shape/behavior of a duels.ink endpoint is unclear.
---

# duels.ink API Docs

duels.ink publishes machine-readable API documentation. Fetch it fresh
instead of relying on memory or the summary in CLAUDE.md, since the upstream
API can change.

## When to use

Before implementing or debugging anything involving:
- `src/lib/duelsApi.js`, `src/lib/leaderboardApi.js`, `src/lib/parseGamelog.js`
- `api/duels.ts` — the single consolidated serverless proxy for every
  duels.ink endpoint, dispatched by `?endpoint=` (`match-history`, `gamelog`,
  `gamelog-bulk`, `replay`, `deck`, `stats`, `leaderboard`). Folded into one
  function because Vercel's Hobby plan caps a deployment at 12 serverless
  functions — don't split it back into per-endpoint files without checking
  the total function count in `api/*.ts` first.
- Anything referencing duels.ink request/response shapes, auth, or new
  endpoints not already documented in this repo

## Steps

1. Fetch the docs:
   ```
   curl https://duels.ink/api-docs.md
   ```
   (Use the WebFetch tool if `curl` isn't appropriate for the context.)
2. Read the relevant section(s) for the endpoint(s) in scope.
3. Cross-check against the existing implementation in `src/lib/duelsApi.js`
   or the relevant handler in `api/duels.ts` — note any drift (new fields,
   changed auth, new endpoints) before writing code.
4. Implement/fix using the confirmed current behavior from the docs, not
   assumptions from prior sessions.
