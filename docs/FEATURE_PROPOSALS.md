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
| 3 | Deck Iteration Lab | Measure changes honestly | M | Supporter |
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

### What exists today

The app does **not** track deck versions:
- **Match History** groups games by `your_deck_id`, falling back to `deckFingerprint(your_decklist)` (`src/pages/MatchHistoryPage.jsx`, `getDeckKey`/`deckStats`). Its only version awareness is an "updated" badge from `isDeckModified()` (`src/lib/deckFingerprint.js`), which compares the newest game's list with the deck's current list on duels.ink. Every edit's games are pooled into one record.
- **Analytics** filters by deck the same way (`src/pages/AnalyticsPage.jsx`, `filteredGames`). It fetches the undocumented `personal-stats` `deckVersions` (`cardIds` + `timeframes`), but only so Card Impact (`findDeckVersion()` in `src/lib/cardImpact.js`) can tell whether a card was in the 60 for a given game.

The raw data to do better already exists. In the official duels.ink docs (`GET /api/me/match-history`), every game row carries `your_deck_id` and `your_decklist` (`{cardId, count}[]`). Imported gamelogs carry `deck_id`, `yourDecklist` and `playedAt` (`src/lib/parseGamelog.js`). Versions can be worked out in the browser, with no new API route, so the Vercel function budget is untouched.

### Step 0: verify the data before building

The docs call `your_decklist` "your aggregated decklist". That doesn't prove it's the list **as played in that game**; it could be the deck's current list stamped onto every row. The whole design rests on this, so it gets checked against real data first:
- Add a temporary dev-only `console.table` to Match History's `load()`.
- For each `your_deck_id`, it prints:
  - the number of distinct `deckFingerprint(your_decklist)` values,
  - the first and last `started_at` of each,
  - how many rows have no list,
  - the `deckVersions` count and a sample entry from `fetchPersonalStats()`. The sample also shows whether `cardIds` repeats an ID for multiple copies.
- Run it against an account with a deck that's known to have been edited.

**Decision rule:**
- If the edited deck shows more than one fingerprint, with dates that line up with the `personal-stats` timeframes, the per-game lists are the source of truth.
- If every row carries the same current list, versions come from `personal-stats` `deckVersions` instead. The adapter shape below hides that difference from everything downstream.

Remove the log afterwards.

### What the user sees

**Definitions:**
- A **version** is one distinct card-and-count list played under one deck (keyed by `your_deck_id`, falling back to a fingerprint).
- Versions are ordered by the first game played and labelled **v1…vN**.
- Switching back to an earlier list counts as the same version, and that version shows every date span it was played.
- Games with no recorded list go into a visible **Unassigned** bucket rather than being dropped.

**Version timeline:** one row per version, showing:
- the label and date spans,
- W–L and win rate with a 95% range (low-sample rows shown faded, as Card Impact already does),
- the changes from the previous version (*+2 Card X / −2 Card Y*).

**Compare:** pick any two versions to see:
- the win-rate difference with a 95% range,
- a plain verdict, for example:
  - *"Not enough games yet: about 140 more per version needed to detect a 5-point difference."*
  - *"No clear difference: the gap is within the noise."*
  - *"v3 is ahead with reasonable confidence."*
- a side-by-side win rate by opponent colors, so a version that happened to face an easier meta is easy to spot.

It appears in three places, as requested:
1. **Standalone page `/deck-lab`** (Supporter). A deck picker, then the timeline, the comparison, and each version's full list. `?deck=<key>` deep-links straight to a deck.
2. **Match History.** The expanded deck panel gets a compact timeline and an *Open in Deck Lab* link. A **version filter** after the deck filter narrows the games table to one version.
3. **Analytics.** A **version picker** next to the deck filter, so every existing view (Card Impact, mulligan tables, matchups, trends) can be read for a single version.

### How it works

**Shared logic: `src/lib/deckVersions.js`** (pure functions, unit-tested in `src/lib/__tests__/deckVersions.test.js`)
- **Adapters.** One per data source, both producing `{ id, deckKey, decklist, playedAt, won, oppColors }`:
  - `fromMatchHistoryRow(row)` uses `your_deck_id`, `your_decklist`, `started_at`, `result` and `opp_deck_colors`.
  - `fromEnrichedGame(game)` is for Analytics.
- **`buildDeckVersions(games)`** groups by `deckKey`, then by `deckFingerprint(decklist)`. Each version gets its record, a `wilsonInterval()` (reused from `src/lib/practiceSim.js`), its date spans, and the card changes from the previous version.
- **`compareVersions(a, b)`** returns:
  - the win-rate difference with a 95% interval (Newcombe's method, built from two `wilsonInterval()`s),
  - a verdict: `not-enough-games` / `no-clear-difference` / `a-ahead` / `b-ahead`,
  - `gamesNeeded`: games per version needed to detect a 5-point difference, from the two-proportion sample-size formula at 80% power,
  - both versions' win rates by opponent colors.
- **Card changes.** Move `computeDelta()` out of `src/pages/DeckComparisonPage.jsx` into `src/lib/decklistDelta.js`. The Deck Comparison page and deck versions then share one diff implementation. Card names come from `buildCardIdToName()` (`src/lib/cardIdResolver.js`).

**Shared UI: `src/components/deckVersions/`**
- `DeckVersionTimeline` and `DeckVersionCompare`, used by all three surfaces.

**Page wiring**
- **`/deck-lab`**: new `src/pages/DeckLabPage.jsx`.
  - Add it to `SUPPORTER_PATHS` (`src/lib/access.js`), the Coaching Tools section of `src/lib/siteSections.js`, and `App.jsx`.
  - It loads the full match history by following `fetchMatchHistory` cursors until `next_cursor` is null. Pages are 250 games each (the documented maximum, the same one Match History uses), within duels.ink's limit of 20 requests a minute, and the page shows progress while loading.
  - Deck names come from the existing `lorcana_deck_names` localStorage key and `fetchDecks()`.
- **Match History**: add a `filterVersion` step after the `filterDeck` step in `filteredGames`, and put the compact timeline in the expanded deck panel.
- **Analytics**: add a `filterVersion` step after `filteredGames`. Card Impact keeps using `personal-stats` versions as it does today; switching it over is out of scope.

**New storage.** None. Versions are derived from data each page already loads.

### Build order

Each step can ship as its own PR:
1. Step 0 evidence check.
2. `deckVersions.js`, `decklistDelta.js`, and their tests.
3. The `/deck-lab` page.
4. The Match History timeline and version filter.
5. The Analytics version filter.

### Risks / open questions

- **Per-game list reliability.** Step 0 settles this before any feature code is written.
- **Tiny versions.** A one-game test list makes a noisy row. Show it, faded, rather than hiding it, so the history stays complete.
- **Long histories.** A heavy player's full history takes several paged requests. Show progress, and reuse what's already loaded when coming from Match History.
- **Mixed formats.** Core and Infinity games of the same list count as one version. The existing queue filter can split them.
- **Keep the maths honest and simple.** Use intervals and sample-size estimates, not p-values, and state plainly when the data can't tell the versions apart yet.

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
2. **Deck Iteration Lab**: medium. The data and interval maths already exist. It ships as a standalone `/deck-lab` page plus version views in Match History and Analytics, after the step 0 data check.
3. **Matchup Playbook**: medium. Mostly combines existing libraries, and it's the most visible "coaching" feature for Supporters.
4. **Game Review Journal**: medium, and adds a new IndexedDB store. It gets more valuable once the Playbook exists to hold the lessons.
5. **Rules Trainer**: ship the auto-generated *What changed* mode first, and add hand-written interaction cards over time.
