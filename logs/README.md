# Team gamelogs

Every ranked duels.ink game of each team account, pulled by `node scripts/pull-team-gamelogs.mjs` (needs `DUELS_TOKEN` and `DUELS_TOKENS`, the same secrets as `mcp-server/`). Re-running fetches only new games.

```
logs/<account>/matches.jsonl      one match-history row per ranked game (every field of GET /api/me/match-history), plus `excluded`
logs/<account>/<game_id>.logs.gz  the gamelog exactly as duels.ink serves it: gzipped JSON array of events, this account's perspective
```

`<account>` is the name in `DUELS_TOKENS`; `teagan` is `DUELS_TOKEN`.

The `.gz` files are stored with Git LFS (`.gitattributes`). A clone needs `git lfs install` once, then `git lfs pull` fetches the logs; without it the files are small pointer stubs. `matches.jsonl` is plain git.

A row's `excluded` is `null` for a kept game, or the reason its log was not kept: `abandoned` (match-history result), `afk` or `timeout` (the log's `victoryReason`, the games `AnalyticsPage` drops with its AFK filter), `disconnected` (a `PLAYER_DISCONNECTED` event, the parser's `disconnected` flag), `no-gamelog` (the bulk manifest had no log for it), or `http-<status>` such as `http-404` (the manifest listed a download URL but duels.ink would not serve the file). Excluded games stay in `matches.jsonl` so the record is complete; only the log file is absent.

Read a log with `src/lib/parseGamelog.js` (`your_player` from the row) or `.claude/skills/lorcana-coach/scripts/pull-games.mjs` for coach-readable narratives.

## Decision rows

`node scripts/decision-rows.mjs` turns the kept games into training rows (about 6 seconds for the whole corpus) in `decisions/`, which is gitignored:

- `mulligan.csv`: one row per opening-hand card, labelled `kept`, with card features and opening-hand context.
- `ink.csv`: one row per inkable card in hand at each ink decision, labelled `inked`, grouped by `decision_id`. A turn with no ink is a decision where every row is 0 (`no_ink` = 1).

Both carry the game's account, colors, play/draw, MMR and result. The hand is rebuilt from the log by `src/lib/decisionRows.js`, and ink rows are only written while it is known. Logs before mid-June 2026 do not name the player's turn draws, so those games give mulligan rows and, on the play, a turn-1 ink row. From then on about 84% of ink decisions are kept, and the rebuilt hand matches about 95% of the prompts that show the whole hand. The script prints both numbers on every run.


## Baseline models and coaching flags

`python3 scripts/train-decision-models.py` (needs `pip install lightgbm pandas scikit-learn`) trains a LightGBM mulligan classifier and ink ranker on every game (`--since 2026-10-08` to narrow it to a set). Every decision is scored by a model that never saw its game (5 folds split by game). The ink ranker weighs each inkable card in hand and "no ink", so it learns whether to ink as well as what. Both models see the player's deck shape (inkable count, average cost, 5+ cost cards, items, actions, from the decklist) and how often the team keeps or inks that card against those opponent colors in the other games. The ink model also sees what the opponent has shown so far (items, actions and characters played or inked, and how many of them the player's own list runs). The script prints each model next to simple baselines. Nov 2026, every game since February (8,667 with a mulligan, 39,214 ink decisions):

| | Model | Best simple baseline |
|---|---|---|
| Mulligan, card kept or sent | 81% (AUC 0.89) | 75%, the card's keep rate |
| Ink, picked the choice (incl. no ink) | 58% (56% on inks, 72% on no-ink turns) | 42%, the card's ink rate (random is 27%) |

A matchup habit backed by a handful of games is only partly learned. The team inks Aladdin - Doing His Part (item removal) 41% of the time, but 7% against Emerald/Ruby, over 9 games. The model only partly learns that, so holding it still draws flags in that matchup.

It also writes `decisions/flags.csv`: every mulligan or ink choice the model gave under 10% chance (`--flag` to change), with the game, turn, the model's pick and the chance of every option. About 1 mulligan and 5 ink flags per 10 games. The model learned from the team's own games, so a flag marks a departure from how the team usually plays that spot, not a proven mistake. Read it in the replay before calling it one.
