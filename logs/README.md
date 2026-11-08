# Team gamelogs

Every ranked duels.ink game of each team account, pulled by `node scripts/pull-team-gamelogs.mjs` (needs `DUELS_TOKEN` and `DUELS_TOKENS`, the same secrets as `mcp-server/`). Re-running fetches only new games.

```
logs/<account>/matches.jsonl      one match-history row per ranked game (every field of GET /api/me/match-history), plus `excluded`
logs/<account>/<game_id>.logs.gz  the gamelog exactly as duels.ink serves it: gzipped JSON array of events, this account's perspective
```

`<account>` is the name in `DUELS_TOKENS`; `teagan` is `DUELS_TOKEN`.

A row's `excluded` is `null` for a kept game, or the reason its log was not kept: `abandoned` (match-history result), `afk` or `timeout` (the log's `victoryReason`, the games `AnalyticsPage` drops with its AFK filter), `disconnected` (a `PLAYER_DISCONNECTED` event, the parser's `disconnected` flag), `no-gamelog` (duels.ink has no log for it). Excluded games stay in `matches.jsonl` so the record is complete; only the log file is absent.

Read a log with `src/lib/parseGamelog.js` (`your_player` from the row) or `.claude/skills/lorcana-coach/scripts/pull-games.mjs` for coach-readable narratives.
