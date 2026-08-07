---
name: duels-api-docs
description: Fetch the latest duels.ink API documentation before building or modifying any feature that talks to duels.ink (match history, gamelogs, replays, leaderboard, decks, stats, or the /api/duels-* proxy routes). Use this whenever a task touches duelsApi.js, leaderboardApi.js, parseGamelog.js, or any /api/duels-*.ts route, or when the shape/behavior of a duels.ink endpoint is unclear.
---

# duels.ink API Docs

duels.ink publishes machine-readable API documentation. Fetch it fresh
instead of relying on memory or the summary in CLAUDE.md, since the upstream
API can change.

## When to use

Before implementing or debugging anything involving:
- `src/lib/duelsApi.js`, `src/lib/leaderboardApi.js`, `src/lib/parseGamelog.js`
- Any `/api/duels-*.ts` serverless proxy route (`duels-match-history`,
  `duels-stats`, `duels-leaderboard`, `duels-replay`, `duels-deck`,
  `duels-gamelog`, `duels-gamelog-bulk`, `duels-proxy`)
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
   or the relevant `/api/duels-*.ts` file — note any drift (new fields,
   changed auth, new endpoints) before writing code.
4. Implement/fix using the confirmed current behavior from the docs, not
   assumptions from prior sessions.
