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

`python3 scripts/train-decision-models.py` (needs `pip install lightgbm pandas scikit-learn`, about a minute) trains LightGBM mulligan classifiers and ink rankers on every game (`--since 2026-10-08` to narrow it to a set). Every decision is scored by models that never saw its game (5 folds split by game). The ink ranker weighs each inkable card in hand and "no ink", so it learns whether to ink as well as what. All models see the player's deck shape (inkable count, average cost, 5+ cost cards, items, actions, from the decklist), and the ink models see what the opponent has shown so far (items, actions and characters played or inked, and how many of them the player's own list runs).

Three models score each decision:

- `card` also knows which card it is and how often the team keeps or inks it against those opponent colors in the other games. It is the best in the current meta, but it forgets everything when the cards change.
- `mmr` is the same model with each game weighted by its MMR: the weight doubles every 100 MMR above the median, and a game with no MMR (most Bo3) takes the player's median.
- `generic` sees only what a card is (cost, type, inkable, stats) and the game state, so it carries to a new meta. Trained on the games before set 14 and tested on set 14, where 26% of the cards were new, it beat the card model (mulligan 73% vs 71%, ink 54.2% vs 53.7%).

Nov 2026, every game since February (8,667 with a mulligan, 39,214 ink decisions):

| | `card` | `mmr` | `generic` | Best simple baseline |
|---|---|---|---|---|
| Mulligan, card kept or sent | 81% (AUC 0.89) | 80% | 78% | 75%, the card's keep rate |
| Ink, picked the choice (incl. no ink) | 58% | 57% | 56% | 42%, the card's ink rate (random is 27%) |

Weighting by MMR does not predict the 1400+ MMR games any better (mulligan 80.0% vs 79.9%, ink 58.9% vs 59.2%): the team's stronger and weaker pilots mostly make the same choices. Wally's games are the largest high-MMR share, so the `mmr` model leans toward how he plays.

It also writes `decisions/flags.csv`: every mulligan or ink choice any model gave under 10% chance (`--flag` to change), with the game, turn, each model's chance and pick, `flagged_by`, and every option's chance as card/mmr/generic. The models learned from the team's own games, so a flag marks a departure from how the team usually plays that spot, not a proven mistake. Read it in the replay before calling it one. Which models agree says what kind of departure it is:

| `flagged_by` | Meaning |
|---|---|
| `card+mmr+generic` | Unusual for the team and against general principles: the strongest flag |
| `card+mmr`, `card` | Unusual for how the team plays this card, but defensible on principle: habit drift |
| `generic` | The team does it on purpose and the principles don't say why: card or matchup knowledge (holding Aladdin - Doing His Part, item removal, against Emerald/Ruby), or a team-wide habit worth questioning |
| `mmr` | Not how the stronger games, mostly Wally's, play it |
