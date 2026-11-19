# Team gamelogs

Every ranked duels.ink game of each team account, pulled by `node scripts/pull-team-gamelogs.mjs` (needs `DUELS_TOKEN` and `DUELS_TOKENS`, the same secrets as `mcp-server/`). Re-running fetches only new games.

```
logs/<account>/matches.jsonl      one match-history row per ranked game (every field of GET /api/me/match-history), plus `excluded`
logs/<account>/<game_id>.logs.gz  the gamelog exactly as duels.ink serves it: gzipped JSON array of events, this account's perspective
```

`<account>` is the name in `DUELS_TOKENS`; `teagan` is `DUELS_TOKEN`. A player with two duels.ink accounts lists the name twice (`max=…,max=…`) and both pull into one folder; rows still carry each game's own `your_player` and decklist.

The `.gz` files are stored with Git LFS (`.gitattributes`). A clone needs `git lfs install` once, then `git lfs pull` fetches the logs; without it the files are small pointer stubs. `matches.jsonl` is plain git.

A row's `excluded` is `null` for a kept game, or the reason its log was not kept: `abandoned` (match-history result), `afk` or `timeout` (the log's `victoryReason`, the games `AnalyticsPage` drops with its AFK filter), `disconnected` (a `PLAYER_DISCONNECTED` event, the parser's `disconnected` flag), `no-gamelog` (the bulk manifest had no log for it), or `http-<status>` such as `http-404` (the manifest listed a download URL but duels.ink would not serve the file). Excluded games stay in `matches.jsonl` so the record is complete; only the log file is absent.

Read a log with `src/lib/parseGamelog.js` (`your_player` from the row) or `.claude/skills/lorcana-coach/scripts/pull-games.mjs` for coach-readable narratives.

## Decision rows

`node scripts/decision-rows.mjs` turns the kept games into training rows (about 30 seconds for the whole corpus) in `decisions/`, which is gitignored:

- `mulligan.csv`: one row per opening-hand card, labelled `kept`, with card features and opening-hand context.
- `ink.csv`: one row per inkable card in hand at each ink decision, labelled `inked`, grouped by `decision_id`. A turn with no ink is a decision where every row is 0 (`no_ink` = 1).
- `choices.csv`: one row per legal option at each quest, challenge and end of turn, for both players, labelled `chosen`, grouped by `decision_id`. Options are quest with a ready character, challenge a legal target with it, or end the turn, with each side's printed stats, damage, and whether the challenge would banish the target (`kills`) and survive (`survives`).

The mulligan and ink rows carry the game's account, colors, play/draw, MMR and result. The hand is rebuilt from the log by `src/lib/decisionRows.js`, and ink rows are only written while it is known. Logs before mid-June 2026 do not name the player's turn draws, so those games give mulligan rows and, on the play, a turn-1 ink row. From then on about 84% of ink decisions are kept, and the rebuilt hand matches about 95% of the prompts that show the whole hand. The script prints both numbers on every run.

The choice rows come from `src/lib/boardState.js`, which rebuilds both boards (characters and locations, exerted, drying, damage, undo) and checks them against every quest and challenge the log records. The log often says an effect exerted or returned a character without naming it, so a turn becomes rows only when every check passes and nothing had to be inferred. Nov 2026: the board agrees with 99.8% of quests, 97.1% of challengers and 96.0% of challenge targets; 99.2% of logged challenges are in the legal option set; 89% of turns are trusted. Kill and survive use printed stats; temporary buffs are not logged, so they are right about 87% and 94% of the time.


## Baseline models and coaching flags

`python3 scripts/train-decision-models.py` (needs `pip install lightgbm pandas scikit-learn`, about two minutes) trains LightGBM mulligan classifiers and ink rankers on every game (`--since 2026-10-08` to narrow it to a set). Every decision is scored by models that never saw its game (5 folds split by game). The ink ranker weighs each inkable card in hand and "no ink", so it learns whether to ink as well as what. All models see the player's deck shape (inkable count, average cost, 5+ cost cards, items, actions, from the decklist), and the ink models see what the opponent has shown so far (items, actions and characters played or inked, and how many of them the player's own list runs).

All models also see what a card does, read off its rules text by `src/lib/decisionRows.js`: removes items, locations or characters, board wipe, bounce, draws, ramp, makes the opponent discard, Song, and its keywords. Only effects on the opponent's side count: "banish chosen character of yours" (Retro Evolution Device) is a cost, not removal. Alongside sits `opp_items_recent`, the items opponents on these colors showed per game in the other games within 45 days, and `item_answer`, a card's item removal times that. Decks change with each set: Emerald/Ruby opponents showed 0.5 items a game before set 14 and 3.9 in it.

Three models score each decision:

- `card` also knows which card it is and how often the team keeps or inks it against those opponent colors in the other games. It is the best in the current meta, but it forgets everything when the cards change.
- `mmr` is the same model with each game weighted by its MMR: the weight doubles every 100 MMR above the median, and a Bo3 game takes its match's MMR (duels.ink gives it only on the deciding game), and a game with none takes the player's median.
- `generic` sees only what a card is (cost, type, inkable, stats, rules-text tags) and the game state, so it carries to a new meta. Trained on the games before set 14 and tested on set 14, where 26% of the cards were new, it beats the card model (mulligan 73.2% vs 71.4%, ink 54.9% vs 53.3%), and the tags are part of why (without them: 72.8%, 54.2%).

Nov 2026, every game since February (14,401 with a mulligan, 66,897 ink decisions, 264,051 board decisions):

| | `card` | `mmr` | `generic` | Best simple baseline |
|---|---|---|---|---|
| Mulligan, card kept or sent | 79.7% (AUC 0.88) | 77.9% | 77.4% | 74.0%, the card's keep rate |
| Ink, picked the choice (incl. no ink) | 57.5% | 55.2% | 55.5% | 40.8%, the card's ink rate (random is 27%) |
| Board, picked the exact quest / challenge / end turn | 55.9% | | 53.2% | random 31.3% |
| Board, picked the right kind (quest, challenge or end) | 72.5% | | 70.9% | 56.4%, quest the most lore, else end |

The rules-text tags and recent opponent items took `generic` from 76.6% and 54.9% to these numbers and left the other two where they were. They also taught it the Aladdin - Doing His Part case: against Emerald/Ruby in set 14 the team inked it 7% of the time, and `generic` now makes it its top ink pick 18% of the time (`card` 8%, `mmr` 5%). Trained only on games before set 14, it still does so 43% of the time, against 73% without the tags.

Weighting by MMR does not predict the 1400+ MMR games any better (`card` vs `mmr`: mulligan 80.1% vs 79.2%, ink 58.4% vs 57.0%). Josh's games (median MMR 1644, nearly half of all 1400+ games) carry 82% of the `mmr` model's weight, so it is close to a model of how Josh plays: on the other accounts it trails the `card` model by 2 to 4 points.

The board models rank every legal quest, challenge and end-turn option (`decisions/choices.csv`). Both players' trusted turns train them, since the opponents are an MMR-matched population, and only the team's choices are flagged. There is no `mmr` board model. 82% of games end by concession, mostly from round 4 on, often with the winner far from 20 lore, so the board decides more games than the lore race; the board models are the ones to grow from here.

It also writes `decisions/flags.csv`: every mulligan, ink or board choice any model gave under 10% chance (`--flag` to change), with the game, turn (the log's round), each model's chance and pick, `flagged_by`, and every option's chance as card/mmr/generic (card/generic for board). A board choice is not flagged when the models' pick was also taken that turn, since the order of actions within a turn is often arbitrary. `flagged_by` is `clean kill left` when the turn ended while a challenge that banishes its target and survives (by printed stats) was legal: 10% of the team's turn ends. Ending with the character ready keeps it from being challenged, so it can be deliberate; it is the first board spot to review. The models learned from the team's own games, so a flag marks a departure from how the team usually plays that spot, not a proven mistake. Read it in the replay before calling it one. Which models agree says what kind of departure it is:

| `flagged_by` | Meaning |
|---|---|
| `card+mmr+generic` | Unusual for the team and against general principles: the strongest flag |
| `card+mmr`, `card` | Unusual for how the team plays this card, but defensible on principle: habit drift |
| `generic` | The team does it on purpose and the principles don't say why: card or matchup knowledge (holding Aladdin - Doing His Part, item removal, against Emerald/Ruby), or a team-wide habit worth questioning |
| `mmr` | Not how the stronger games, mostly Josh's, play it |

## Does the choice change who wins?

The models above learn what the team does. `python3 scripts/outcome-test.py` (about a minute) asks whether it changes who wins. A win model that sees the spot (turn, ink, lore, the whole hand's costs, deck shape, colors, what the opponent has shown, both MMRs) is compared out of fold with the same model plus the chosen option, and with the same model plus a random option from the same decision. The random option is the placebo: it measures what adding the columns does by itself, averaged over five draws. Only a gain of choice over random whose 95% interval, resampled by game, stays above zero says the choice matters. Even then it would be a correlation, since the state leaves out the board.

Nov 2026, every game since February (log-loss gain per decision, × 10⁻⁴):

| | Choice over random | 95% interval |
|---|---|---|
| Ink (66,897 decisions) | −0.6 | −5.1 to +4.2 |
| Mulligan (14,406 opening hands) | +3.9 | −4.0 to +12.4 |

Neither choice predicts winning beyond the spot it was made in, so the results can't yet tell a good ink or mulligan from a bad one, and nothing here is flagged from them. Two traps on the way to that answer:

- An ink model without the hand's costs found a significant signal and advised inking the cheaper card. That was the hand: inking an expensive card goes with a hand full of them, which loses anyway. The whole hand's costs, uninkable cards included, took the signal away.
- A single placebo draw made the mulligan look significant in 2 of 6 seeds. Averaging five draws settled it.

The mulligan interval is about ±8.2 × 10⁻⁴ on 14,400 games. It narrows with the square root of the number of games, so a gain the size of today's estimate (+3.9) would need about 65,000 hands; the ink estimate is below zero. The estimates move by a point or two between runs (the placebo draws are random), so treat these as orders of magnitude. The bought Nationals and Worlds logs, plus the rebuilt board (`src/lib/boardState.js`) as state, are what would let this test say more.

## What decides a game?

`python3 scripts/win-probability.py` (about a minute) fits a win model to the board, turn by turn. Each trusted turn of either player is one snapshot: the state at the mover's first quest, challenge or end-turn choice, so that turn's plays are already on the board. Models that see more and more of it are scored out of fold by game: before the game (colors, play/draw, both MMRs), then lore, then the board (characters, their total ink cost and lore, ready and exerted). It writes every snapshot's win chance to `decisions/winprob.csv`, the base for scoring the decisions between snapshots.

Nov 2026, 212,462 snapshots in 14,726 games (AUC: 0.5 is a coin flip, 1.0 is certain):

| Mover's turn | Before the game | + lore | + board, no lore | Everything | Snapshots at 80%+ either way | ...and right |
|---|---|---|---|---|---|---|
| 1 | 0.597 | 0.606 | 0.605 | 0.606 | 0% | |
| 3 | 0.601 | 0.615 | 0.645 | 0.646 | 1% | 83% |
| 5 | 0.595 | 0.625 | 0.702 | 0.714 | 12% | 85% |
| 7 | 0.580 | 0.636 | 0.745 | 0.775 | 25% | 88% |
| 9 | 0.570 | 0.652 | 0.772 | 0.809 | 31% | 90% |
| 12+ | 0.553 | 0.682 | 0.751 | 0.812 | 33% | 89% |

- **The board decides games, not the lore race.** From turn 3 on, the board alone predicts the result better than the lore count, and the gap is widest at turns 7 to 9. The difference in the ink cost of each side's characters is the single strongest input (38% of the full model's gain; lore lead 4%).
- **A board lead is worth more than a lore lead.** At turn 5, ahead on board but behind on lore wins 59%; ahead on lore but behind on board wins 36%. The win rate climbs with the board-cost lead at every turn: 22% at 8 or more behind, 46% level, 74% at 8 or more ahead (turn 5).
- **Games are mostly decided by turns 6 to 9.** The model is sure (80%+ either way) of a fifth of turn-6 snapshots and right on 87% of them; past turn 9 it gains little.
- **Before the game, about 0.6.** Play/draw is the largest part: in ranked Bo1 the team wins 62% on the play and 46% on the draw. In Bo3 games 2 and 3, going first mostly means having lost the previous game (the loser chooses, and takes the play 99% of the time), so play/draw there also carries who is ahead in the match.

Two traps found on the way:

- duels.ink gives MMR only on the game that decides a Bo3 match (3,818 of 3,822 deciding games, 1 of 5,691 others), so the presence of an MMR told the model which game ended the match. With who went first, that gave away the result: in game 2 the player on the play won 99% of the games without an MMR and 2% of those with one. `scripts/decision-rows.mjs` now gives every game of a match its deciding game's MMR (MMR moves only when a match ends: 99.9% of rated games start at the previous one's `mmr_after`). It took the before-the-game AUC from 0.665 to 0.597.
- The snapshot comes after the mover's plays, so a side's board is a little larger on its own turn than on the opponent's. Both players are snapshotted on their own turns, so the comparison is even, but it is the board after playing, not before.

Not in the model yet: cards in hand and ink (known for the team's turns only, from `ink.csv`), items, temporary buffs (not logged), and the 11% of turns where the rebuilt board disagrees with the log. Next: score each quest, challenge and end-turn by the win chance before and after it.

## Which board choices cost win chance?

`python3 scripts/decision-value.py` (about three minutes) values every option of every quest, challenge and end-turn decision. A win model is fitted to the state at every decision of both players, out of fold by game. Each option's state after it is built from printed stats: a quest adds the character's lore and exerts it, a challenge exerts the attacker and removes whatever it banishes, ending the turn changes nothing. An option's value is that state's win chance, and a decision's regret is the best option's value minus the chosen one's. The team's decisions go to `decisions/decision-value.csv`.

Nov 2026, 409,586 decisions in 14,726 games:

- **The built state is mostly right.** It matches the next logged decision of the same turn on every field 80% of the time. Most misses are a card played or an effect between two choices (character counts differ 16% of the time); lore matches 96%, ready characters 98%.
- **But the values don't yet predict winning.** As in the outcome test, a win model on the state is compared with the same plus the chosen option's value and gap to the best, and with the same plus a random option's (the placebo). Choice over random: +4.1 × 10⁻⁴ (95% −0.4 to +8.0). That is close, but the interval crosses zero, so the regret is the model's opinion of a choice, not a measured cost, and nothing is flagged from it.

Where the model disagrees with the team (205,674 of the team's decisions; the model's pick was taken 62% of the time, mean regret 0.012):

| Chosen | Model's pick | Decisions | Mean regret | Share of all regret |
|---|---|---|---|---|
| quest | end | 33,140 | 0.019 | 25% |
| quest | challenge | 7,099 | 0.073 | 21% |
| challenge | another challenge | 14,613 | 0.022 | 13% |
| challenge | end | 6,412 | 0.041 | 11% |
| end | challenge | 4,073 | 0.061 | 10% |
| end | quest | 11,194 | 0.016 | 7% |

The largest single gaps are a quest or end of turn where the model would challenge, and they sit on the clean kills: at the 3,445 turn ends that left one (`clean kill left` in the coaching flags) the model would challenge 82% of the time, mean regret 0.063 against 0.002 at other turn ends; at the 7,850 quests made while one was open, 68% and 0.060 against 0.013. The most common one is a quest where the model would keep the character ready, which is where it is least trustworthy: the state counts ready characters but not what the opponent can do to an exerted one.

One trap: a game's summed regret looked significant against losing (log-odds −0.17 per 0.1 regret), but regret grows with the number of options, so it tracks the game's length and board size. Short games where the team was run over have the least regret and the most losses. The per-decision placebo test above is the one to trust.

What would make the values trustworthy: the opponent's ready characters that could challenge an exerted quester, damage on the board (a challenge that does not banish changes nothing in the state today), cards in hand, and a sharper test on one spot at a time (for example, quest versus a clean kill with the same lore and board).

## Does leaving a clean kill cost games?

`python3 scripts/clean-kills.py` (about a minute, after `win-probability.py`) answers one spot directly. A clean kill is a challenge that banishes its target and survives, by printed stats. Turns of either player with one open at their first quest, challenge or end-turn choice are split into **took** (a clean kill was challenged that turn) and **left** (none was, and the turn ended with one still open). Turns where it went away some other way are set aside. Turns are matched on the state at that first choice, before anything was done: round, lore lead, board-cost lead, play/draw and the biggest clean kill's cost. The effect is the win-rate difference within matched groups, weighted to the "left" turns, with a 95% interval resampled by game.

Nov 2026, 24,053 turns (the team: 11,830):

| | Took | Left | Taking it |
|---|---|---|---|
| Both players | 17,935 | 6,118 | **+13.7%** (+12.0 to +15.3) |
| The team | 8,612 | 3,218 | **+11.9%** (+9.6 to +14.3) |

**Yes, by about 12 to 14 points of win rate.** The team leaves an open clean kill on 22% to 33% of these turns, depending on the player. Each check below either matches on another explanation or cuts it away, and none moves the effect much:

| Explanation | Check | Taking it |
|---|---|---|
| Weaker players leave kills | Match on MMR gap | +13.1% |
| | Each team account against itself | +11.5% |
| Players leave kills in lost games | Win-probability model's chance at the turn's start: 45.6% took, 43.9% left; it expects only +1.2% | |
| | Also match on that chance's decile | +12.8% |
| Players leave a kill, then concede | Drop each side's last two turns | +13.2% |
| Matchup | Also match on colors | +12.8% |
| The "clean kills" are not real (buffs are not logged) | After a chosen one, the opponent has one character fewer by the next choice 90% of the time (other challenges: 62%) | |

The effect grows with what is left alive, which is what a real cost looks like: +12% when the biggest clean kill costs 1-2, +15% at 3-4, +18% at 5+; +9% in rounds 1-5, +16% in 6-7, +17% from round 8.

It is still observational: what is in hand is not seen, so a player holding a sweeper or planning to quest with the challenger next turn is in "left" with everyone else. The step-3 placebo test did not catch this because these turns are under 1% of all board decisions. Per account, every player with 100 or more such turns shows a positive effect except megan (−2.8% on 103 turns, too few to read). This is the first board spot with evidence behind it: `clean kill left` in `decisions/flags.csv` is now a flag worth coaching, not just a departure from habit.
