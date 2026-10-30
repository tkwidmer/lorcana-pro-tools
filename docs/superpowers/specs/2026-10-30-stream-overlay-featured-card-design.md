# Featured card on the Stream Overlay

**Status:** draft for review. Supporter (the panel is gated; the view stays unguarded).

## Problem

When a caster talks about a card ("he's holding up Be Prepared", "this is the Belle that wins the game"), viewers can't read it off the gameplay cam. The operator needs to put one card's full art on stream quickly, picked from the decklists already on the table, then take it off again. `docs/agents/stream-overlay.md` lists this under "deliberately not built, cheap to add".

## What exists today

- Each side's decklist is already on the row (`p1_decklist`, `p2_decklist`, migration 017), and the view already resolves it to card objects: `matchDeckList(text, cardIndex)` → `{ key, name, count, card }`, ordered by `buildBuckets()` (characters, actions/songs, items, locations, each by cost). `DeckPanel` in `StreamOverlayViewPage.jsx` does exactly this.
- LorcanaJSON's `card.images` carries `thumbnail` (367×512, what the deck panel uses) and `full` (1468×2048, same aspect, so `CARD_ASPECT` holds for both).
- The slot over the gameplay cam is exclusive: deck, player card or metagame, never two at once.
- Per-side columns are mirrored by `swapSidesPatch()` through `SIDE_FIELDS`, cleared by `clearTablePatch()` and by `featureMatchPatch()` on a new pairing.

## What the operator sees (panel)

In each **Player** card, under the decklist field, a **Featured card** row: the matched deck as small thumbnails (about 56 px wide, wrapping), in `buildBuckets()` order, so a 60-card list is 15 to 25 tiles.

- Click a tile: that card goes on stream on that player's side. The tile gets the forge border.
- Click the featured tile again: it comes off.
- Clicking another tile replaces it (one featured card per side).
- No decklist matched: the row says "Paste a decklist to feature its cards".

Hotkey **X** takes both featured cards off (letters only, as the other hotkeys). There is no hotkey per card: a Stream Deck can't name a card.

## What viewers see (view)

The card's `full` image, 600 px tall (about 430 wide), rounded corners and a 4 px accent border, standing in the gameplay area against its player's column: bottom 40 px, inner edge at `edge` (the same offset the panels use, so it moves in with the lore track). Both sides can show a card at once; two cards fit side by side in the 1280 px gameplay area.

- It fades in once the image has loaded (`onLoad`), so a 1468×2048 JPG never paints half-loaded on stream. It disappears without a fade when cleared.
- It is hidden while the slot shows a deck, the player card or the metagame (render-time only, nothing written), and on the break screen. It comes back when the panel closes.
- If the decklist is edited and the card no longer matches, nothing shows. The panel doesn't write a cleanup.

## Data

Migration `027_stream_tables_featured_card.sql`:

```sql
ALTER TABLE public.stream_tables
  ADD COLUMN IF NOT EXISTS p1_featured text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS p2_featured text NOT NULL DEFAULT '';
```

plus `stream_table_public()` extended with both columns (the 026 function, two keys added).

The value is the card's name as written in that side's decklist (the entry's `name`), `''` for none. The view resolves it with the same `cardIndex.get(toSimpleName(name))` lookup `matchDeckList()` uses. No image URL is stored: one source of truth, and the row stays a list of what the operator chose.

## Code changes

| File | Change |
|---|---|
| `src/lib/streamOverlay.js` | `featured` joins `SIDE_FIELDS` (swap mirrors it); `rowToState()` adds `players[].featured`; `clearTablePatch()` and `featureMatchPatch()` set both to `''`; `HOTKEYS.x = { clearFeatured: true }` |
| `src/pages/StreamOverlayPage.jsx` | `FeaturedPicker` under `DecklistField` in each Player card; the X hotkey writes `{ p1_featured: '', p2_featured: '' }` |
| `src/pages/StreamOverlayViewPage.jsx` | `FeaturedCard({ player, cardIndex, side, edge })`, rendered per side when `featured` is set and no slot panel is shown |
| `src/index.css` | one `--animate-feature-in` keyframe (opacity 0 → 1, 250 ms) in the `@theme` block |
| `src/lib/__tests__/streamOverlay.test.js` | fixture row gets both columns; swap mirrors, clear and new pairing reset, `rowToState` maps, X maps |
| `docs/agents/stream-overlay.md` | migration table row, hotkey list, remove it from "deliberately not built" |

Screenshots for the PR: the view with a card featured on the left and the lore track on, and the panel's picker row with one tile selected.

## The reference tool's settings, and why most aren't here

The screenshot's Room settings has per-slot Animation, Speed, Rounded corners, Card back and Auto-clear. This overlay has no settings modal: everything is a column the panel writes, and fonts and layout are fixed (see Theme in the agent doc). So:

| Setting | Here |
|---|---|
| Animation, Speed | One fixed fade-in. Add a column when an organizer asks for another. |
| Rounded corners | Always on: a printed card is rounded. |
| Card back | Not built. A flip from the back is a reveal effect; the cards here are already public in the decklists. |
| Auto-clear after N seconds | Not in v1 (see open questions). |
| Caster slot | Not in v1 (see open questions). |

## Open questions

1. **Caster slot.** The reference has a third card a caster picks from any card, not only the two decks (a card the opponent might hold, a sideboard tech). It costs one more column (`caster_featured`), a search box over `cardIndex` in the panel, and a centered position. Recommend leaving it out until a caster asks; it's additive.
2. **Auto-clear.** Operators forget to take a card off. The view can't write, so it would need a `pN_featured_at` timestamp plus one `featured_seconds` setting, with the view hiding the card once the time has passed. Recommend trying v1 with the X hotkey first.
3. **Size.** 600 px tall is legible at 1080p and leaves most of the board visible. If casters want it bigger, it becomes a constant to change, not a setting.

## Effort

Small: one migration, about 60 lines across the panel and the view, and tests in the existing file.
