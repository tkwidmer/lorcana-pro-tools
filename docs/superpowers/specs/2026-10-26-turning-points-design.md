# Turning points in Analytics

**Status:** approved for implementation. Supporter (Analytics is gated).

## Player problem

Analytics shows what each card did across a deck's games and a per-game drilldown, but nothing about tempo: on which turn games are decided, how far behind the player was when a loss became a loss, and whether they ever come back. Those are the questions a coach asks first, and the imported gamelogs hold the answer turn by turn.

## Data check

A parsed gamelog (`src/lib/parseGamelog.js`, see `docs/agents/duels-data.md` and the `gamelog-pipeline` skill) carries:
- `loreEvents: [{ turn, player, total }]`, every change of a player's lore total (quests, `LORE_GAINED`, and effect-driven losses), where `turn` is duels.ink's **round** number shared by both players (the first player gets a solo opening round).
- `turns: [{ turn, owner, inked, lore, plays }]`, one segment per player-turn in order.
- `winner` (1 or 2), `myPlayerNum`, `wentFirst`, `turnCount`, `playedAt`, `deck_id`, `queue_name`, and per-card totals in `players[n].cards`.
- Imported records also keep `_rawLogs` (`gameImport.js` passes them to `saveGamelog`), so a record can be re-parsed if a new field is needed.

Per-turn **which cards were played** is not kept today (`turns[].plays` is a count). Step 1 below adds it.

## What the user sees

In Analytics, a new collapsible section **Turning points**, after the matchup matrix, over the page's filtered games (deck, opponent, queue, colours all apply):

1. **The sentences** (Meta Synthesis style, each only when its sample allows):
   - "Your losses are usually decided on round 5 to 6. At that point you trail by 6 lore on average."
   - "Your wins are usually decided on round 4 to 5."
   - "When you are 5 or more lore behind after round 5, you win 12% of the time (n=41)."
   - "You have come back from 8 lore down once."
2. **Decisive round histogram**: two series (wins, losses), rounds 1 to 12+, bar height = share of games decided on that round.
3. **Cards on the decisive turn**: the cards you played on the decisive round, in wins and in losses, with counts; a card that shows up far more in losses is worth a look. Only when step 1's data exists for the games.
4. In **GamelogDetail** (the per-game drilldown): a lore race chart, both players' lore totals per round as two lines, the decisive round marked, with the final score in the caption.

Every number uses `wilsonInterval()` from `practiceSim.js` where it is a rate and shows `n`. Under 10 games, the section shows "Import more games" rather than numbers.

## Definitions

- **Lore curve**: for each round 0..N, each player's lore total after that round, carried forward from `loreEvents` (a round with no event keeps the previous total; both start at 0).
- **Decisive round** of a game: the first round after which the eventual winner's lead is never lost or tied again. A game the winner led from the first lore has decisive round = the round of their first lore. Draws or games with no winner are excluded.
- **Deficit at the decisive round** (losses only): the loser's lore minus the winner's lore at that round, as a positive number.
- **Comeback**: a win in which the player trailed by at least `COMEBACK_LORE` (5) at any round from round 3 on; the biggest deficit overcome is "come back from N down".
- **Late-deficit win rate**: among games where the player trailed by ≥5 after round 5, the share won.

## How it works

1. **Parser**: `parseGamelog.js` adds `plays: [{ turn, player, cardName, cardId }]` in event order (from `CARD_PLAYED`), with a unit test in `parseGamelog.test.js`. `AnalyticsPage` re-parses a stored record that has `_rawLogs` and no `plays` when it loads (one-off upgrade on read, written back through `gamelogHistory.js`), so existing imports get the field without re-import. Records without `_rawLogs` simply have no card data for section 3.
2. **Pure lib** `src/lib/turningPoints.js`, unit-tested with hand-built gamelog shapes (and the parser test fixtures where they fit): `loreCurve(gamelog)`, `decisiveRound(gamelog)` → `{ round, winnerLead, loserDeficit } | null`, `aggregateTurningPoints(games, myPlayerNum per game)` → `{ games, decisive: { wins: histogram, losses: histogram, medianWinRound, medianLossRound, meanLossDeficit }, lateDeficit: { n, wins, interval }, comebacks: { count, biggest }, decisiveCards: { wins: [{ name, count }], losses: [...] } }`, and `turningPointSentences(summary)` returning the sentences above as strings.
3. **UI**: `src/components/analytics/TurningPoints.jsx` (section) and a `LoreRaceChart` inside `GamelogDetail.jsx`; inline SVG like the other analytics charts, palette colours only (no `dark:` variants, see CLAUDE.md), the two series distinguished by colour and a legend. Wire the section into `AnalyticsPage.jsx` with its own open/closed state like the others.
4. **Docs**: a "Turning points" paragraph in `docs/agents/duels-data.md` (the definitions above, the `plays` field, the re-parse on read), the component in CLAUDE.md's components line, the lib in its libs table, a `docs/TOOLS.md` line under Analytics, and screenshots of the section and the lore race per `docs/agents/ui-screenshots.md` (Analytics reads IndexedDB, so seed a few parsed games through the page's import, or inject records into `lorcana_gamelogs` with `page.evaluate` before load).

## Build order

1. Parser `plays` + test.
2. `turningPoints.js` + tests (curve, decisive round on a lead-change game and a wire-to-wire game, comeback, aggregation, sentences).
3. Lore race chart in the drilldown.
4. The section with histogram, sentences, decisive cards; the re-parse on read.
5. Docs, screenshots.

## Risks

- Round numbering: the first player's solo opening round means round 1 has one player-turn. Use rounds, as the data does, and say "round" in the UI.
- Small samples: every sentence is gated on `n`, and rates carry intervals.
- Re-parsing on read touches IndexedDB writes; keep it to records missing `plays`, and never block rendering on it.
