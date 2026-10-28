# Stream Overlay

Read before touching any `/stream-overlay` route, `StreamPairingPicker.jsx`, `src/lib/streamOverlay.js`, `src/lib/streamTables.js`, or a `stream_tables` migration. Also covers the Decklist Inspector's OBS overlay, the other content-creator surface.

A tournament gameplay overlay for OBS. One `stream_tables` row is a **table** (a feature match being streamed); four surfaces read it and three roles write it. Pure logic is in `src/lib/streamOverlay.js` (unit-tested in `src/lib/__tests__/streamOverlay.test.js`); Supabase access is in `src/lib/streamTables.js`.

## The row

`supabase/migrations/012_stream_tables.sql` and the migrations after it. One column per overlay field, never a JSON blob, so score taps are atomic database increments and two writers can never lose one.

| Columns | Migration | Written by |
|---|---|---|
| `name`, `event_name`, `event_logo_url`, `sponsor_logo_url`, `round`, `timer_ends_at`, `timer_remaining_ms`, `rph_event_id`, `p1_*`/`p2_*` (`name`, `record`, `inks`, `lore`, `game_wins`), `controller_key`, `owner_id` | 012 | panel; lore and game wins also by `adjust_stream_table()` |
| `mode` (`live` / `break`) | 013 | panel (Live / Break toggle, B hotkey) |
| `theme_fill`, `theme_accent` | 014 | panel Event card |
| `note` | 015 | panel |
| `stream-logos` Storage bucket | 016 | panel's logo upload (`uploadLogo()`); 2 MB, images only, `<user id>/` folder, public read, nothing ever deleted |
| `p1_decklist`, `p2_decklist`, `deck_shown` (0/1/2) | 017 | panel |
| `player_card` (jsonb), `card_shown` | 018 | panel's pairing send (archive data travels on the row because the view has no session) |
| `reset_stream_table_lore(id, key)` | 019 | panel "Next game", N hotkey, the tablet (two taps within 4 s) |
| `standings`, `bracket` (jsonb), `break_panel` (`''` / `standings` / `bracket` / `meta`) | 020 | panel Send standings / Send bracket |
| `sponsor2_logo_url` | 021 | panel |
| `stream_tables_keep_clock()` BEFORE UPDATE trigger | 022 | database: refuses an update that moves `timer_ends_at` more than 30 min into the past (a stale panel on an old event's link used to write that event's expired clock every poll) |
| `results` (jsonb) | 023 | panel's linked-event poll |
| `meta_text`, `meta_players`, `meta_shown` | 024 | panel Metagame card |

`rowToState(row)` in `streamOverlay.js` is the one mapping from row to render shape; add a column there and in the fixture row in the test file, and extend `stream_table_public()` in the migration so the public read and broadcast carry it.

## Three roles

- **Owner** (the panel) reads and writes rows directly under an owner-only RLS policy.
- **Public readers** (view, controller, notes) have no session. They read `get_stream_table(id)`, a SECURITY DEFINER function returning the public columns only (never `controller_key` or `owner_id`), and a BEFORE INSERT OR UPDATE trigger broadcasts the same shape via `realtime.send()` on topic `stream-table:<id>`. A late joiner reads the row; there is no heartbeat.
- **Controller** taps call `adjust_stream_table(id, key, side, field, ±1)`, a clamped atomic increment gated by `controller_key`, which rides only in the controller link. The view link cannot change scores.

Verified once against the real project with an anonymous client: direct table reads return nothing, the public read hides the key, a wrong key is refused, five taps land as five broadcasts. No serverless function is involved, so the Vercel function budget is untouched.

## Four surfaces

- **Panel** `/stream-overlay` (`StreamOverlayPage.jsx`, supporter-gated). Lists the owner's tables; the first is an explicit click, never auto-created (a mount effect that created one ran twice under StrictMode and made two). Every edit is an optimistic local change plus a column `update` (`updateTable()`). From the row's broadcasts the panel adopts **only** the four score columns and `rph_event_id`; adopting the echo of a keystroke would clobber the next one. Selected table in localStorage `lorcana_stream_table`. Hotkeys (`HOTKEYS` / `hotkeyAction()`): Q/A W/S left player lore and game wins, I/K O/L right, B Live/Break, 1/2 a deck, 3 the player card, 4 the metagame, N Next game; letters only, ignored with a modifier or while typing.
- **View** `/stream-overlay/view?table=<id>` (`StreamOverlayViewPage.jsx`, unguarded, the one OBS Browser Source). Fixed 1920×1080 frame: opaque side columns with a transparent square cutout for each player cam, a top banner (logos, round, timer), everything else transparent. Winner is derived (`winnerIndex()` at `MAX_GAME_WINS`), shown in a reserved fixed-height slot so the other column never moves. `mode = 'break'` renders the opaque break screen instead: `breakHeadline()` from the score (2 wins "Final", 0-0 "Next match", else "Match in progress"), the round clock while it has time, and the `break_panel`. A player's name steps down a size class as it outgrows its slot (`nameSizeClass()`); the lore number pulses at `WINNING_LORE` (20) as a cue only, never an automatic win.
- **Controller** `/stream-overlay/control?table=<id>&key=<controller key>` (unguarded): a tablet at the table, lore and game-win taps per player, the round clock across the top.
- **Caster notes** `/stream-overlay/notes?table=<id>` (unguarded): the row as text for a second screen: `casterPoints()` per player, archive finishes, decklists, head-to-head, the round's `results` and live score, the full `standings` in columns across the bottom.

## Linked RPH event

The panel's Event card writes a Play Hub event id to `rph_event_id` (`extractEventId()`). While linked, the panel polls `fetchEventDetails` every 15 s, ticked by an inline Web Worker because a background tab's `setInterval` throttles to about once a minute. The poll writes `rphClockPatch()` (the Timer card's manual controls disappear: one source of truth) and the active round's `results` (`buildResultsSnapshot()`, only when the snapshot changed), both through `updateWhileLinked(id, rphEventId, patch)`, which lands only while the row is still linked to the event it was polled from. Unlink clears `rph_event_id` and `results`.

**Pick pairing…** (`StreamPairingPicker.jsx`) lists the **active** round (`activeRoundId`: the latest round that has started, since RPH posts pairings before that round's standings exist) with records from the current standings (`currentRoundPairings()`). Send writes `featureMatchPatch()`: names, records, event name (RPH's only when the table's is blank), round, clock (`timerFromRph()`), link; lore and game wins reset; inks untouched (RPH knows no decks); both decklists cleared. It fetches both players' archive histories and the head-to-head first and writes `player_card` (`buildPlayerCard()`, which also carries each player's archive rating and rank; see "Player ratings" in `docs/agents/tournaments.md`), sending without a card if any fetch fails. Send standings / Send bracket write `buildStandingsSnapshot()` / `buildBracketSnapshot()` snapshots (the view has no session, so the operator re-sends each round); Send bracket errors rather than sending an empty bracket.

Polling, not push: RPH's Pusher channel was never observed to broadcast (see the `ravensburger-tournament-api` skill).

## The slot over the cam

Decklist (`deck_shown`), player card (`card_shown`) and metagame (`meta_shown`) share one slot; every toggle that shows one hides the others. `swapSidesPatch()` mirrors every per-side column and carries a shown deck with its player. `clearTablePatch()` clears the pairing (players, decklists, player card, snapshots, anything shown) and keeps the event setup (name, logos, theme, timer, link, round, note, metagame text).

**Metagame** (`metaSlices()`): `meta_text` lines `<name> <decks>` or `<name> <n>%`, grouped into ink pairs by the inks the name starts with; no ink reads as Other, as do pairs under `META_OTHER_MAX_SHARE` (5%) in a room over `META_OTHER_MIN_PLAYERS` (50). `MetaPanel` draws one bar per pair painted half in each ink. Three ways to fill it, all producing `Emerald/Steel 8` lines: carde.io's decklists PDF dropped on the card (`readDecklistsPdf()` in `lib/cardePdf.js`, pdf.js legacy build because the current build needs `Math.sumPrecise` and `Promise.try`), the `scripts/carde-field-export.js` bookmarklet run on the carde.io admin page, or Field Breakdown's "Copy for Stream Overlay".

## Theme

`theme_fill` and `theme_accent` per table, defaulting to `DEFAULT_THEME` (ink black, forge gold). Text color is derived by `themeTextColor()` (WCAG luminance), never stored. The view sets `--fill`, `--accent`, `--on-fill` on the frame root and every color utility reads them (`bg-(--fill)`). Fonts, layout and the InkbornForge lockup stay fixed.

## Applying a migration

Write the file under `supabase/migrations/NNN_stream_tables_<thing>.sql`, then apply it to the live project with the Supabase MCP `apply_migration`. Statements the MCP classes as destructive (`DROP … IF EXISTS` included) stall waiting for a confirmation that never comes; on a fresh schema apply the file's statements without those guards. `DROP CONSTRAINT` followed by `ADD CONSTRAINT` has applied cleanly. Always extend `stream_table_public()` in the same migration when adding a public column.

## Verifying a change

Every surface renders from a mocked row with no Supabase: see `docs/agents/ui-screenshots.md` for the Playwright setup (the panel needs the fake session and a `stream_tables` intercept; view, controller and notes need only a `get_stream_table` RPC intercept). Screenshots live in `docs/screenshots/stream-overlay-*.png` and go in the PR body.

## Design history, so it is not retried

- The first version kept state in the panel's localStorage on a Broadcast channel with a heartbeat: one stream per browser profile, and the panel tab as a single point of failure (background tabs throttle timers). The row replaced it.
- "Send to Stream Overlay" buttons once lived on Tournament Lookup; they hid the flow on a player tool, so the linked event moved into the panel.
- The metagame chart was a pie, then per-archetype bars, before one bar per ink pair.
- Deliberately not built, cheap to add: featured-card art over the cam, any layout other than 1920×1080.

## Decklist Inspector and its overlay

`/decklist-inspector` (`DecklistInspectorPage.jsx`, supporter-gated) is the content-creator decklist view: browse by type/cost, pin up to 4 cards' full art beside stat charts, copy an OBS overlay link. `/decklist-inspector/overlay` (`DecklistOverlayPage.jsx`) is the chrome-less, read-only render for an OBS Browser Source; the deck comes entirely from the `?deck=` param (`decklistShared.js` `encodeDeckParam`/`decodeDeckParam`). It is **deliberately not supporter-gated**: a Browser Source has no Supabase session, and the view exposes only what is in the link. `Nav`/`Footer` are hidden there, as on every `/stream-overlay/*` sub-route and `/lore-tracker`. `DecklistCardBar.jsx` (the card row with the inkwell cost emblem) and `matchDeckList()`/`deckInks()` are shared with the Stream Overlay's decklist panel.
