---
name: gamelog-pipeline
description: Load this before reading, modifying, or debugging src/lib/parseGamelog.js, src/lib/duelsApi.js's gamelog fetch, src/lib/leakDetection.js, src/lib/handInference.js, or anything interpreting raw gamelog log entries (draw/play/ink/challenge/lore events). The parsing logic has several non-obvious invariants that are easy to get wrong when adding new event handling or debugging an attribution bug.
---

# Gamelog Parsing Pipeline

`parseGamelog.js` turns a raw array of duels.ink log entries into structured
per-player stats (draws, plays, effects, challenges, lore, tempo segments).
It has no external docs — this repo's own code and CLAUDE.md's "Gamelog
Pipeline" section are the only reference, and the parsing logic contains
several non-obvious invariants that are easy to break silently (wrong
attribution, not a crash) when adding new event handling.

## When to use

Before touching:
- `src/lib/parseGamelog.js` — the core parser
- `src/lib/duelsApi.js`'s `fetchGamelogBuffer`/`fetchGamelogManifest` (the
  gzip fetch feeding into the parser)
- `src/lib/leakDetection.js`, `src/lib/handInference.js` — consumers that
  depend on the parser's output shape
- `GamelogAnalyzerPage`, `GameView`, or any other UI reading parsed gamelog
  output
- Anything debugging why a stat (draws, effect attribution, lore, tempo) is
  wrong for a specific game

## The pipeline (CLAUDE.md's summary, condensed)

1. `fetchGamelogBuffer(gameId)` in `duelsApi.js` → `/api/duels-gamelog` →
   gzip binary from `https://duels.ink/g/{id}`
2. `decompressGzip(arrayBuffer)` in `parseGamelog.js` → native
   `DecompressionStream('gzip')`
3. `parseGamelog(id, logs, meta)` processes the array of
   `{type, player, turnNumber, data, visibility}` entries into the
   structured game object
4. Saved to IndexedDB via `gamelogHistory.js`, displayed in
   `GamelogAnalyzerPage`/`GameView`

## Non-obvious invariants — read before editing the parser

- **`ON_PLAY_DRAWS` map** (top of the file): cards that draw on play (e.g.
  Junior Woodchuck Guidebook, `'10-66': 2`) don't always fire a distinct
  `ABILITY_TRIGGERED` event. `pendingDrawSource`/`pendingDrawCount` are set
  when such a card is played, then the *next* `CARD_DRAWN` event(s) get
  attributed back to that source card instead of counted as a plain draw.
  Adding a new on-play-draw card means adding it to this map, not writing a
  one-off special case.
- **`CARD_PUT_INTO_INKWELL` with `fromZone === 'field'` means the *other*
  player* caused it** (effects like Let It Go, Hades pulling a card back to
  hand/inkwell) — this gets attributed as an `effectRemovals` increment on
  the *other* player's `lastPlayedByPlayer` entry, not the owning player's
  own stats. Getting the player index backwards here silently misattributes
  removal credit.
- **`lastPlayedByPlayer`** tracks the most recently played card per player
  specifically so effect-attribution events (the inkwell case above, and
  others) know which card to credit. It's updated on `CARD_PLAYED`-type
  events — if a new event type represents "playing" a card in a way that
  doesn't update this map, later effect attribution for it will silently
  point at a stale card.
- **`turnNumber` is a shared *round* number, not per-player.** The first
  player gets a solo opening round, then each round contains both players'
  turns. Per-player-turn tempo aggregation (`turnSegments`/`curSeg`)
  therefore segments on `TURN_START` boundaries, not by comparing
  `turnNumber` values directly — don't key new per-turn logic off raw
  `turnNumber` without accounting for this.
- **Visibility/hidden information**: a player's own gamelog only contains
  their own perspective — the opponent's hand contents are never present.
  `handInference.js`/`HandPredictor.jsx` exist specifically to *infer*
  probable opponent hand contents from what's observable (deck composition,
  known removed cards) — don't assume any field exposes actual opponent hand
  state.

## Steps

1. Read the relevant section of `parseGamelog.js` in full before editing —
   the event-handling loop is a single function with significant local
   state threaded through (`pendingDrawSource`, `lastPlayedByPlayer`,
   `curSeg`, etc.), so a change in one branch can affect attribution in
   another.
2. If adding a new event type or a new stat, check whether it interacts with
   any of the invariants above (on-play draws, opponent-caused removals,
   turn-segment boundaries).
3. Validate against a real gamelog when possible — `GamelogAnalyzerPage` or
   `GameView` renders the parsed output, which is the fastest way to spot a
   misattribution.
