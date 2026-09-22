# Feature Proposals: Helping Players Improve

Five new features for Lorcana Pro Tools, aimed at players trying to get better at the game. Each one was checked against the current code first so it doesn't duplicate a shipped tool, and each builds on data and libraries the app already has.

## Where the platform stands

InkbornForge already covers a lot of ground (see [TOOLS.md](TOOLS.md)):
- **Deck maths**: Deck Insights
- **Personal outcomes**: Match History, Analytics, Card Impact (WAR), and the Kept/Sent mulligan win rates
- **Meta**: Winrate Matrix, Meta Synthesis, Leaderboard
- **Event prep**: Practice Plan's Bayesian matchup estimates, tournament Monte Carlo, and rep allocation
- **Live events**: Tournament Lookup, Cut Calculator
- **Scouting**: Game Scraper, Scouting Library

What's missing is the **deliberate practice loop** that stronger players rely on:

1. **Reflect** on specific decisions, not just results.
2. **Turn reflection into a plan** they carry into the next game.
3. **Measure whether changes worked** without being fooled by small samples.
4. **Manage the mental game.**
5. **Know the rules cold.**

The proposals below each cover one of those gaps.

| # | Feature | Gap it closes | Effort | Tier |
|---|---|---|---|---|
| 1 | Matchup Playbook | Turn data into a game plan | M | Supporter |
| 2 | Game Review Journal | Reflect on decisions | M | Supporter |
| 3 | Deck Iteration Lab | Measure changes honestly | S–M | Supporter |
| 4 | Session & Tilt Insights | Mental game | S | Supporter |
| 5 | Rules Trainer | Rules knowledge | M | Free |

---

## 1. Matchup Playbook

**Player problem.** The app already knows a lot about each of a player's matchups, but it's spread across four pages:
- the public win rate (Winrate Matrix),
- the player's own win rate and play/draw split (Practice Plan),
- the opponent's key cards (Meta Synthesis signature cards),
- which cards over- or under-perform and which to keep or ship (Analytics Card Impact filtered by opponent colors).

Nobody opens four tabs between rounds. Players need one short sheet per matchup that they can read in the two minutes before a match.

**What the user sees.** Pick your deck, and you get one card per common opposing archetype. Each card shows:
- **Numbers**: public win rate, your shrunk win rate with its 95% range, and your play vs. draw record.
- **Their threats**: the opponent archetype's top signature cards.
- **Your key cards**: your best and worst cards by WAR in this matchup, with Kept % / Sent %, which works as a mulligan guide.
- **Your game plan**: a free-text box ("race, don't fight Amber early; hold removal for X") that you write once and refine after games.

It has a phone-friendly *Round view* and a print option, like the Lore Tracker.

**How it works.**
- A new page, `/playbook`, that reads existing data only.
- Public win rates and archetype matchups: `fetchStats`, plus `archetypeMatchupSummary()` and `topSignatureCards()` from `src/lib/metaSynthesis.js`.
- Personal estimate: `shrinkWR()` and `wilsonInterval()` from `src/lib/practiceSim.js`, on games filtered by opponent colors, the same way Practice Plan does it.
- Card and mulligan guidance: `computeCardImpact()` (`src/lib/cardImpact.js`) and `aggregateMulliganWinRates()` (`src/lib/analyticsAggregation.js`) on the games for one deck against one set of opponent colors.

**New storage.** Game-plan notes go in a new `playbookNotes` store in the `lorcana_pro_tools` IndexedDB, keyed by `deckKey|oppColorKey`. That needs a version bump; follow the `indexeddb-schema-map` skill.

**Risks / open questions.**
- Archetype (duels.ink clusters) and colors (your gamelogs) are different keys. The sheet should key on **colors** and list the archetypes within each.
- Sample sizes in a single matchup are small, so every personal number needs the shrinkage and interval treatment, and low-sample cells should be shown faded, as Card Impact already does.

---

## 2. Game Review Journal

**Player problem.** Improving means reviewing *decisions*, not just results. Analytics can already find mechanical leaks automatically (`leakDetection.js`), but it can't see a bad attack, a missed lethal, or the wrong card inked. Players who keep a mistake log improve faster, and right now they have nowhere to keep one.

**What the user sees.**
- In Analytics' **Game Detail** and in a scouted game's action log, each turn gets an *Add note* button. You pick a tag (Misplay, Sequencing, Ink choice, Mulligan, Missed lethal, Misread opponent, Good play) and optionally write a sentence.
- A **Journal** tab lists every note, filterable by tag, deck, and matchup.
- A **Patterns** summary shows things like "Your most common tag in the last 30 days is *Ink choice*, mostly vs Amethyst/Steel", with a trend line per tag.
- The auto-detected leaks from `summarizeLeaks()` appear next to your manual tags, so there's one list of what to fix. Practice Plan's *Skills to drill* reads from the combined list.

**How it works.**
- Notes are `{ gameId, source: 'gamelog' | 'scouted', turn, tag, text, createdAt }`.
- They hook into `src/components/analytics/GamelogDetail.jsx` (which already renders per-turn draws and plays) and `src/components/GameView.jsx`'s action log.
- The journal view reuses the date/deck/opponent-colors filters from `AnalyticsPage`.

**New storage.** A `reviewNotes` store in the `lorcana_gamelogs` IndexedDB, next to the games it annotates. Notes stay in the browser, consistent with the "your game data stays local" design. The existing `gameExport.js` export can include them so a coach can see a student's journal.

**Risks / open questions.**
- Tag vocabulary: should the tags be fixed so they can be counted over time, or user-defined? Recommend a fixed set plus free text.
- A coach-sharing flow (a coach comments on a student's notes) would need server storage. Leave that out of v1.

---

## 3. Deck Iteration Lab

**Player problem.** Players change 2–3 cards, play 12 games, see 8–4, and decide the change worked. At that sample size the result is mostly noise. Analytics has per-card WAR, but nothing answers the question players actually ask: *"Is version B of my deck better than version A?"*

**What the user sees.** Pick a deck, and it lists every **version** of that deck:
- the date range it was played,
- the card diff from the previous version (+2 X, −2 Y),
- its record and win rate with a 95% interval,
- matchup splits.

Pick two versions for a head-to-head. It shows the win-rate difference with an interval and a plain verdict:
- *"Not distinguishable yet: you'd need about 140 more games to detect a 5-point difference."*
- *"B is ahead, but the gap is within the noise."*
- *"B is better with reasonable confidence."*

It also flags when two versions faced a different meta mix, because a matchup-weighted comparison is fairer than raw win rate.

**How it works.**
- Version history already exists. `fetchPersonalStats({ deckId })` (`src/lib/duelsApi.js`) returns `deckVersions`, each with its exact card list and `timeframes`.
- `findDeckVersion()` in `src/lib/cardImpact.js` already maps a game to its version by timestamp. Export it and group games by version.
- `wilsonInterval()` in `src/lib/practiceSim.js` gives per-version intervals. Add a two-proportion difference interval and a simple sample-size estimate as pure, unit-tested functions.
- Card diffs: reuse the list-diff logic behind `DeckComparisonPage`.
- If there's no token or version history, fall back to `deckFingerprint()` buckets, the same fallback Card Impact uses.

**New storage.** None.

**Risks / open questions.**
- Games with no matching version timeframe need a clear "unassigned" bucket rather than being silently dropped.
- Keep the maths honest and simple: a frequentist difference interval plus a sample-size estimate, not p-values.

---

## 4. Session & Tilt Insights

**Player problem.** Many ladder players lose MMR not because of their deck but because of *when* and *how long* they play: late-night sessions, the fifth game after two losses, or queueing again straight after a painful game. Match History has every game's timestamp and result, but nothing turns that into advice about the mental game.

**What the user sees.** A new *Sessions* tab in Match History:
- **Games are grouped into sessions**: a new session starts after a gap of more than 30 minutes.
- **Win rate by game number within a session**: game 1, 2, 3… A drop-off at game 6+ shows fatigue.
- **Win rate after N consecutive losses vs. after a win.** This measures tilt directly.
- **Win rate and MMR change by time of day and day of week.**
- **Suggested stop-loss**, for example: *"After 2 straight losses your next-game win rate drops from 54% to 41% (n=63). Consider a break after 2 losses."* It only appears when the interval says the drop is real.

**How it works.**
- Pure functions in a new `src/lib/sessionStats.js`, with unit tests, over the match objects Match History already loads (`started_at`, `result`, `mmr_delta`, `queue_name`).
- It respects the page's existing cascading filters (`games → afterDate → afterQueue → …`).
- Uses `wilsonInterval()` to decide when a difference is worth showing.

**New storage.** None, apart from a localStorage preference for the session-gap threshold.

**Risks / open questions.**
- Times need to be in the player's local timezone.
- Confounders: players often queue into harder opponents as MMR rises during a good session. The page should say that plainly rather than over-claim.

---

## 5. Rules Trainer

**Player problem.** Rules mistakes cost games and create judge calls, and every rules update changes some interactions. The Rules browser already stores every version of the official documents and computes exactly what changed. Right now players can only *read* it; they can't *practise* it.

**What the user sees.** A `/rules/trainer` page with two modes:
- **What changed drill**: after a rules update, short cards built from the changed rules. It shows the old wording and the new wording side by side, then asks "Which is current?" or "What's different?". This helps players unlearn stale rules.
- **Interaction flashcards**: a curated set of question-and-answer cards on common tricky interactions (timing, triggered abilities, Shift, challenge and banish ordering). Each answer cites the rule number and links to `/rules/comprehensive-rules/<chapter>`.

Progress is saved with simple spaced repetition: cards you miss come back sooner.

**How it works.**
- *What changed* cards are generated automatically from `loadVersionDiff()` and `changesById`/`wordDiff` (`src/lib/rules/index.js`, `src/lib/rules/diff.js`). No hand-written content is needed.
- Interaction flashcards are static content in `src/lib/rules/trainer/`, each citing rule `id`s so a later rules version can flag a card as possibly stale when its cited rule changed.
- Free tier, in the same bucket as the Rules browser, which grows the free funnel.

**New storage.** Card scores in localStorage (small, per-browser).

**Risks / open questions.**
- The interaction deck needs hand-written, accurate content. Every card must cite a rule, and ideally a judge reviews it before launch.
- Start with *What changed*, which costs nothing to author, and add interaction cards over time.

---

## Considered and not proposed

- **Matchup mulligan coach.** Already covered: Analytics' Card Impact shows *Kept % / Sent %* win rates per card, and it can be filtered by opponent colors and deck. Proposal 1 brings that onto the playbook sheet instead of rebuilding it.
- **"Find the best play" puzzles from real games.** Appealing, but the data doesn't support it yet. Scouted snapshots keep only the latest board, with hand *counts* rather than hand contents. Gamelogs record events but have no board-state rebuilder. A puzzle trainer would first need a full game-state reconstruction engine (large effort), so it's deferred until one exists.

## Recommended build order

1. **Session & Tilt Insights**: smallest effort (pure functions over data already loaded) and immediately useful to every ladder player.
2. **Deck Iteration Lab**: small to medium. The data, version matching, and interval maths already exist.
3. **Matchup Playbook**: medium. Mostly combines existing libraries, and it's the most visible "coaching" feature for Supporters.
4. **Game Review Journal**: medium, and adds a new IndexedDB store. It gets more valuable once the Playbook exists to hold the lessons.
5. **Rules Trainer**: ship the auto-generated *What changed* mode first, and add hand-written interaction cards over time.
