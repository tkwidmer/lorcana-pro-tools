# Deck Doctor — design

## Why

The app knows three things about a player's deck and never puts them side by side: the exact list they played in every ranked game (Match History), the field's average build and the cards that correlate with winning in that archetype (duels.ink meta feed, surfaced only as Stock Deck Lists and Meta Synthesis's signature cards), and which of their own cards win games (Analytics' wins-above-replacement). A player tuning for a weekend opens three tabs and does the join in their head. Deck Doctor does the join on one page and ends with a short verdict: what you run that the field doesn't, what the field runs that you don't and whether it wins, which of your cards underperform, and where your results lag the field's for the same archetype.

Supporter-gated, under Coaching Tools. It is the clearest "worth paying for" screen the data supports.

## Data facts that shaped the design (verified 2026-10-22 against production)

- **Match history rows carry the full list.** Every game has `your_decklist` (`[{cardId, count}]`, the duels.ink `set-number` id), `your_deck_id`, `your_deck_colors`, `result`, `opp_deck_colors`, `went_first`, `queue_name`, `started_at`. So "versions of this deck" is just grouping a deck's games by `deckFingerprint(your_decklist)`. No personal-stats call is needed for versions.
- **The meta feed's archetype data is per build-variant profile.** Each `profiles[]` entry has `colors`, `archetypeName`, `centroidCounts` (cardId → copies, totals 60), `cardLift` (exactly 10 entries: `{cardId, lift, presence, gamesWith, winsWith, winRateWith, pairWinRate}`; `lift` is `winRateWith − pairWinRate` in percentage points, `presence` the share of the archetype's decks running the card), `gamesPlayed`, `wins`. `archetypeMatchups[]` is keyed by **profile** `id` (`archetypeIdA`/`archetypeIdB`, `games`, `winsA`). `aggregateArchetypes()` already groups variants into player-visible archetypes and `representativeProfile()` picks the largest variant.
- **There is also `pairCardLift`**, keyed by color pair (`'amber/ruby'`), 10 entries per pair in the same lift shape. Not mentioned anywhere in the codebase today.
- **Archetype data depends on the `era` param.** (Corrected during implementation.) An unscoped `period=all_time` call returns no profiles and `pairCardLift: null` for Set 14 (`meta.eraResolution: 'legacy'`), which is what the first probe for this spec saw. The era-scoped call `fetchStats` actually makes (`era=set-14-core`) returns 78 profiles, 1,914 `archetypeMatchups` and a `pairCardLift` object two weeks into the set. An unknown era key silently falls back to the current era rather than erroring (Set 13's real key is `set-13`, not `set-13-core`). The no-profiles degraded state below is still designed in, for the first days of a set and for any feed outage, but it is not today's state.
- **Card-level personal performance needs gamelogs.** `computeCardImpact()` works on imported gamelogs (`gamelogHistory.js`), which record `deck_id` and per-card drawn/played/inked, and optionally `deckVersions` from `fetchPersonalStats(deckId)` to confirm deck membership. Players without imports get no WAR section; that is a prompt, not a failure.
- `cardLift`, `profiles` and `archetypeMatchups` are **not** a documented duels.ink contract (CLAUDE.md). Every read of them is null-safe and the page degrades a section at a time.

## Route and placement

`/deck-doctor` → `DeckDoctorPage.jsx`. Catalog entry in **Coaching Tools** (next to Practice Plan), icon `stethoscope` (new glyph in `toolIcons.js`). Added to `SUPPORTER_PATHS`. Title/description in `routeTitle.js`. Not prerendered, not in the public sitemap (gated).

## Inputs

1. **Queue** — `Select`, Core Bo1 (default) / Core Bo3 / Infinity Bo1 / Infinity Bo3, same keys as `WinrateMatrixPage`. Persisted in localStorage `lorcana_deck_doctor` (`{ queue, deckKey }`).
2. **Deck** — `Select` over the player's constructed decks, built from match history exactly as `MatchHistoryPage`'s `deckStats` does (key = `your_deck_id ?? deckFingerprint(your_decklist)`, label from `lorcana_deck_names` or colors, with the deck's `queue_name`, games and record). Default: most games. Sealed and draft queues excluded. Match-history rows carry duels.ink's matchmaking `queue_id` (e.g. `standard-ranked`), which is not the stats feed's queue key (`core-bo1`), so decks are not filtered by the stats queue; instead choosing a deck defaults the stats queue from its `queue_name` ("Infinity" → infinity, "BO3" → bo3, else core-bo1), and the user can override.
3. **Or paste a list** — a `Textarea` accepting `4 Card Name` lines (`parseDeckList`, matched to cards with `matchDeckList`). Paste mode shows only the field sections (no personal results exist for it). Colors are derived from the matched cards (`deckInks()` in `streamOverlay.js`, the same helper the Stream Overlay panel uses on a pasted list).

Match history is loaded once per page visit with the same 20-page loop `PracticePlanPage` uses. That loop exists in two pages already; it moves into `duelsApi.js` as `fetchAllMatchHistory({ maxPages = 20 })` and both pages call it (targeted cleanup, no behaviour change).

## What the page shows, top to bottom

### 1. Verdict

Three to five plain sentences from `deckDoctorVerdict()` (pure, below), rendered like Meta Synthesis's summary blocks:

- "Your list is **Amber/Emerald Circle of Life** — 47 of 60 cards match the field's average build." (or "doesn't match any Set 14 archetype closely; comparing against the Amber/Emerald field instead", or "duels.ink hasn't published Set 14 archetype builds yet.")
- "You're missing N of the archetype's 10 win-rate-lift cards: A (+0.8 pp, in 19% of lists), B (…)." Omitted when none missing.
- "You run N cards that correlate with losing in this archetype: C (−1.1 pp)." Omitted when none.
- "Over your last G games, D is your weakest card by wins above replacement (−2.3 WAR, 14 games with)." Omitted without gamelogs.
- "Your worst matchup relative to the field: vs Ruby/Sapphire, 31% over 23 games where the archetype wins 48%." Only when `diffInterval()` excludes zero; otherwise "No matchup where your results differ from the field's beyond sample noise."

### 2. Your list vs the field's build

Two `DeckListCard`s side by side (your latest list; the archetype's representative `centroidCounts` as the Stock Deck Lists page already renders it), then a three-column diff beneath, built by `diffBuild()`:

| Only in your list | Count differs | Only in the field's build |
|---|---|---|
| card ×n, with lift badge if it appears in `cardLift` | card: you 2 · field 4 | card ×n, lift badge, "in 32% of lists" from `presence` when known |

An **archetype picker** sits above this block: the auto-assigned archetype is pre-selected, with every archetype in the deck's colors as alternatives ("Compare against…"), because the overlap heuristic can pick the wrong sibling when two archetypes share a core. Overlap shown next to each option.

The field's build is labelled honestly: "duels.ink's average build for the most-played variant (N decks, M games)". Centroids are rounded averages, so a 1-copy centroid card can mean a 4-of in a quarter of lists; the `presence` figure is shown wherever `cardLift` provides it.

### 3. Lift checklist

Two short tables from `liftChecklist()`: the archetype's 10 `cardLift` entries and the color pair's 10 `pairCardLift` entries. Columns: card, lift (pp, coloured by sign via `statColors.js`), in X% of lists, **in your list** (✓ copies / ✗). Rows sorted by lift. Missing positive-lift cards and present negative-lift cards are highlighted; the others are plain. This is the "what the field knows that you don't" view and needs no personal data.

### 4. Your cards

`computeCardImpact(gamelogsForDeck, { deckVersions })` over imported gamelogs whose `deck_id` matches the selected deck (versions from `fetchPersonalStats(deckId)`, the same fetch Analytics does, cached per deck). Table of the bottom 8 and top 5 by WAR with games-with, win rate with/without, and the `lowSample` flag greyed as Analytics does. Each row also shows the field's lift for that card when it is in either lift list, so "your worst card is also a field-negative" reads in one line. Without gamelogs: a one-line prompt linking to `/analytics` to import them.

### 5. Matchups vs the field

Table from `personalMatchups()` joined to `archetypeVsColorPairs()`: one row per opponent color pair you've faced with the selected deck. Columns: opponent inks (`InkIcons`), your games, your record, your win rate shrunk toward the field's (`shrinkWR`), the field's win rate for **your archetype** against that color pair (rolled up from `archetypeMatchups` through profile → colors; mirrored rows contribute `games − winsA`), and the gap with a marker when `diffInterval()` excludes zero. Falls back to the color-pair `matchups` rows (what Practice Plan uses) when no archetype is assigned, and says so in the column header. Rows sorted by your games.

### Degraded states

| State | What shows |
|---|---|
| No duels.ink token | Gate card: connect in Settings. Paste mode still works for sections 2–3. |
| Token, no games in the queue | "No ranked games with a deck in this queue yet." Paste mode offered. |
| Profiles empty for the current era (today's Set 14 state) | Banner: "duels.ink hasn't published archetype builds for Set 14 yet." Sections 2 and 3 hidden; 4 and 5 show, with 5 on color-pair field data. Verdict says so. |
| Profiles exist but no archetype in the deck's colors, or best overlap < 50% | Section 2 shows only your list; picker still offers same-colour archetypes; section 3 shows `pairCardLift` only. |
| `cardLift` / `pairCardLift` missing | Lift badges and section 3 disappear; nothing else changes. |
| No gamelogs for the deck | Section 4 is the import prompt. |

## Pure library: `src/lib/deckDoctor.js` (unit-tested in `__tests__/deckDoctor.test.js`)

- `countsFromDecklist(yourDecklist)` → `Map<cardId, count>`; `countsFromPasted(entries, cardIdOf)` for paste mode (needs the LorcanaJSON card → `${setCode}-${number}` id, which `buildCardIdToCard()` already inverts).
- `assignArchetype(stats, colors, myCounts)` → `{ key, name, overlap, shared, total, profile } | null`. Candidates: `aggregateArchetypes(stats.profiles)` with the same sorted colors. Score per candidate: `shared = Σ min(my[c], centroid[c])` over the representative profile's centroid; `overlap = shared / max(Σmy, Σcentroid)`. Best wins; returns null below `MIN_ARCHETYPE_OVERLAP = 0.5`. Also exported: `archetypeCandidates(stats, colors, myCounts)` sorted by overlap, for the picker.
- `diffBuild(myCounts, centroidCounts)` → `{ onlyMine: [{cardId, mine}], onlyField: [{cardId, field}], countDiffs: [{cardId, mine, field}] }`, each sorted by the larger count then id.
- `liftChecklist(liftEntries, myCounts)` → `[{ cardId, lift, presence, mine, flag: 'missing-positive' | 'present-negative' | null }]` sorted by lift desc; `[]` for a null list.
- `archetypeVsColorPairs(stats, archetypeKey)` → `Map<oppPairKey, { games, wins, winRate }>`, rolling `archetypeMatchups` up through profile id → colors for every profile id in the archetype's `ids`, both directions. `oppPairKey` uses `matchupKey()` from `inkColors.js` so it joins to match-history colors.
- `personalMatchups(games)` → `Map<oppPairKey, { games, wins, losses }>` (draws and 3+-ink opponents excluded, as Practice Plan does).
- `deckVersions(games)` → `[{ fingerprint, counts, games, wins, losses, firstAt, lastAt, diffFromLatest }]`, newest first. Shown as a compact "Versions" strip under section 2 so a player sees that the 4-2 run was on the version before they cut a card.
- `deckDoctorVerdict({ archetype, diff, lifts, impact, matchups, eraName })` → `[{ type: 'text', text }]` blocks, the sentences in §1, every number formatted here so the page only renders.

Everything above is deterministic over plain data; no fetches in the lib.

## Fetches and caching

`fetchStats({ queue, period: 'all_time' })` (current era, already era-scoped by `duelsApi.js`); `fetchAllMatchHistory()` once; `getAllGamelogs()` once; `fetchPersonalStats({ deckId })` per selected deck with a real id, cached in component state; `useCards()` for names via `buildCardIdToCard()`. No server changes, no new functions, no new tables. Nothing is written except the two localStorage preferences.

## Out of scope (deliberately)

- Inferring the **opponent's** archetype from gamelog card sightings (proposal 2). When that lands, section 5 upgrades to archetype-vs-archetype without changing this page's shape.
- Suggesting concrete swaps ("cut X for Y"). The page lays the evidence out in one order; the player decides.
- Comparing against a past era. Tempting at set launch, misleading in practice.
- Saving verdicts or notes.

## Testing

Unit tests cover: `assignArchetype` picking the higher-overlap sibling and returning null under the floor; `diffBuild` on identical lists, a one-card swap and a count change; `liftChecklist` flags in all four quadrants and a null list; `archetypeVsColorPairs` summing a mirrored pair correctly (`games − winsA` when the archetype is side B); `personalMatchups` excluding draws and 3-ink opponents; `deckVersions` ordering and `diffFromLatest`; `deckDoctorVerdict` omitting each optional sentence when its input is empty. Lint, test and build green; manual check on the Vercel preview with the owner's duels.ink token against a Set 13 era (profiles exist) and the live Set 14 state (none), since both paths must render.

## Risks

- **Undocumented fields.** `profiles`, `cardLift`, `pairCardLift`, `archetypeMatchups` can change shape without notice. Every reader is null-safe and each section hides independently.
- **Centroid rounding** makes "only in the field's build" fuzzier than it looks; the label and `presence` figures are the mitigation.
- **Archetype misassignment** when two archetypes share a core; the picker is the mitigation, with overlap shown so a wrong pick is visible.
- **Empty at set launch.** Verified today. The degraded state is designed, not accidental, and the banner says when the comparison will appear.
