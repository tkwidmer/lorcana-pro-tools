---
name: indexeddb-schema-map
description: Load this before adding a new IndexedDB store, changing a keyPath, or reading/writing src/lib/db.js, cardsCache.js, scoutedGames.js, coconutDecks.js, or gamelogHistory.js. There are two separate IndexedDB databases in this repo with different version-bump mechanics, and getting the version number wrong silently breaks the store for existing users instead of throwing.
---

# IndexedDB Schema Map

All game data in this app is client-side only (per CLAUDE.md: "no game data
is stored server-side"), split across **two separate IndexedDB databases**
with different schema-management code. There's no external doc for this —
it's entirely this repo's own convention, and the failure mode for getting
it wrong (a missing `db.createObjectStore` call, or a version number that
doesn't get bumped) is silent: `indexedDB.open()` still succeeds, the store
just doesn't exist yet for a returning user, and reads/writes against it
throw at call time instead of at startup.

## When to use

Before touching:
- `src/lib/db.js` — the shared `lorcana_pro_tools` DB abstraction
  (`openDB()`, `getTx()`, `promisify()`)
- `src/lib/cardsCache.js`, `src/lib/scoutedGames.js`,
  `src/lib/coconutDecks.js` — stores living inside `lorcana_pro_tools`
- `src/lib/gamelogHistory.js` — the separate `lorcana_gamelogs` DB
- Anything adding a brand-new persisted store, or changing an existing
  store's `keyPath`

## The two databases

### `lorcana_pro_tools` (current version: **3**) — `src/lib/db.js`

Single shared DB. Schema lives in one place: `STORE_KEY_PATHS`, a map of
store name → `keyPath`, iterated inside `onupgradeneeded`:

```js
const STORE_KEY_PATHS = {
  games: 'uuid',          // scraped game snapshots (scoutedGames.js)
  cards: 'version',        // cached LorcanaJSON data (cardsCache.js) — literal key 'current'
  coconutDecks: 'id',      // saved Coconut decks (coconutDecks.js)
}
```

`openDB()`'s `onupgradeneeded` loops over `STORE_KEY_PATHS` and creates any
store that doesn't already exist (`if (!db.objectStoreNames.contains(store))`).
**To add a new store here: add an entry to `STORE_KEY_PATHS` AND bump
`DB_VERSION`.** `onupgradeneeded` only fires when the requested version is
higher than what's already on disk for that browser — if you add a map entry
without bumping `DB_VERSION`, a returning user's browser never re-runs the
upgrade callback and the new store silently never gets created for them
(new users get it fine, since they start at the current version — this bug
only shows up for existing users, which makes it easy to miss in dev with a
cleared DB).

### `lorcana_gamelogs` (current version: **1**) — `src/lib/gamelogHistory.js`

Separate DB, separate file, own copy of the open/upgrade logic (not
shared with `db.js`). Single store `gamelogs`, `keyPath: 'id'`. Same
version-bump rule applies if a second store is ever added here — this file
doesn't have `db.js`'s loop-over-a-map convenience, so a new store means
writing its own `db.createObjectStore(...)` call inside `onupgradeneeded`.

## Steps

1. Decide which DB the new data belongs in — is it game-session data
   alongside `games`/`coconutDecks` (→ `lorcana_pro_tools`), or is it
   specifically gamelog-related (→ `lorcana_gamelogs`)? Match the existing
   grouping rather than starting a third DB unless there's a real reason to.
2. For `lorcana_pro_tools`: add the store to `STORE_KEY_PATHS` in `db.js`
   **and** increment `DB_VERSION`. For `lorcana_gamelogs`: add the
   `createObjectStore` call in `gamelogHistory.js`'s `onupgradeneeded` **and**
   increment its `DB_VERSION`.
3. Write the CRUD module for the new store following the existing pattern
   (`getTx(storeName, mode)` + `promisify(request)`), mirroring
   `scoutedGames.js`/`coconutDecks.js`.
4. Test against a browser profile that already has the *old* schema on disk
   (don't just test against a freshly cleared IndexedDB) — that's the only
   way to actually exercise the `onupgradeneeded` path and catch a missed
   version bump.
5. Update the Storage table in CLAUDE.md's Architecture section to document
   the new store.
