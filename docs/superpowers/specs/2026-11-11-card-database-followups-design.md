# Card Database follow-ups — design

Builds on `2026-11-11-card-database-design.md` (the search and card pages, shipped on the same branch). Four additions the first spec deferred: TCGplayer prices, a list view, card-name links across the site, and per-card duels.ink meta stats.

## 1. Prices (TCGplayer)

**Source.** LorcanaJSON gives every printing an `externalLinks.tcgPlayerId` (3551 of 3556 printings; the five without are brand-new cards). TCGplayer's marketplace endpoint `https://mpapi.tcgplayer.com/v2/product/{id}/pricepoints` answers unauthenticated with one entry per finish:

```json
[{"printingType":"Normal","marketPrice":4.71,"buylistMarketPrice":null,"listedMedianPrice":5.21},
 {"printingType":"Foil","marketPrice":69.94,"buylistMarketPrice":null,"listedMedianPrice":null}]
```
Verified 2026-11-11 for a base card (507512), an enchanted (510153: Normal null, Foil 947.01) and a common (494102: 0.14 / 0.69); 80 ids at concurrency 8 answered in about a second with no throttling. It is **unofficial**, like the `stats` archetype fields. Cardmarket and CardTrader have no public price endpoint; they stay as links only.

**How Dreamborn does it** (from the user's HAR of a dreamborn.ink card page): the browser never talks to TCGplayer. The site ships one precomputed SQLite snapshot of the whole catalog (`prices(cardId, variant base|foil, marketplace TP|CM, productId, price)`, 6,322 rows, `metadata.updatedAt`) and a per-card `price-history` endpoint. Its `TP` prices for 001-001 are 0.14 / 0.69, exactly the `marketPrice` values above, so it reads the same figure. We copy the shape, not the server: one static snapshot, refreshed daily.

**Snapshot.** `scripts/card-prices.mjs` (run by `.github/workflows/card-prices.yml` daily, same commit-to-main pattern as `meta-digest.yml`) reads `allCards.json`, collects the distinct `tcgPlayerId`s, fetches `pricepoints` for each at concurrency 8 (about 45 s), and writes `public/card-prices.json`:

```json
{ "updatedAt": "2026-11-11T18:00:00Z", "source": "TCGplayer market price",
  "prices": { "507512": { "normal": 4.71, "foil": 69.94 }, "510153": { "normal": null, "foil": 947.01 } } }
```
The run fails (and commits nothing) when more than 2% of ids fail or a fetch throws: a partial snapshot is worse than yesterday's. Size is about 120 KB; the site serves it like any static asset. No runtime function, no database, no CORS problem, and the whole pool has prices at once, which is what makes the list view, `usd`, and `order:usd` cheap.

**Client.** `src/lib/cardPrices.js`: `pricePoints(points)` → `{ normal, foil }` (used by the script and tested); `printingPrice(prices, card)` → that printing's entry or `null`; `usdOf(entry)` → the non-foil market price, or the foil price when only foil exists (enchanteds), else `null`; `priceLabel(entry)` → `"$4.71 · foil $69.94"`, `"foil $947.01"`, `"—"`. `src/hooks/useCardPrices.js` fetches `/card-prices.json` once per page load (module-level promise) → `{ prices, updatedAt, error }`.

**Search.** `usd` key with comparisons on `usdOf` (a printing with no price never matches), `order:usd`. `parseQuery(q, sets, prices)` / `runQuery(cards, sets, q, prices)` take the snapshot; a `usd` term or `order:usd` with no snapshot throws `QuerySyntaxError('Prices are not loaded')`. The search page waits for cards and prices before running the first query.

**Where shown.** Card page: the Buy section shows this printing's normal and foil market price with the TCGplayer button and "TCGplayer market price, <updatedAt date>"; every Printings row carries its price. List view: a TCGplayer column (`usdOf`, full label in `title`). Grid: a small price under the name.

## 2. List view

A Scryfall `display:` directive: `display:grid` (default) | `display:list` (`checklist` accepted as an alias). `runQuery` returns `{ cards, display }` instead of a bare array. The page offers Grid / List buttons that rewrite the directive inside `?q=` with a pure helper `withDirective(q, key, value)` (removes any existing `key:…` token, appends `key:value`; `value` null removes it), so the URL stays the one source of truth and the directive remains the one way to set the view.

Columns: Name (link) · Inks · Cost (the `CostBadge`) · Type line · S/W/L · Rarity · Set # · Core · Infinity · TCGplayer. Clicking a column header rewrites `order:` (and flips `dir:` when the same column is clicked again) through `withDirective`. Same "Show 120 more" paging as the grid.

## 3. Card-name links

One URL builder, `cardPath(card)`. For places that hold only a name or a duels.ink id, `cardPrintings.js` gains `cardLinkIndex(cards)` → `Map<fullName, path>` (the primary printing of each name). A tiny `CardLink` component renders a `Link` when it has a path and a plain span otherwise.

| Where | How |
|---|---|
| `DeckListCard` → `CardBar` (Stock Decks, Forge Decks, Deck Doctor, Deck Lab) | `CardBar` gets a `link` prop; with it, the bar is a `Link` to `cardPath(entry.card)`. The Decklist Inspector (bars are toggle buttons) and the OBS overlay (deliberately inert) do not pass it. |
| Analytics (`StatTables.jsx`: card, mulligan, draw-effect, impact, challenger/defender tables) | `DeckStats` / `ChallengeStats` take `cardHref(name)`; `AnalyticsPage` builds it from `cardLinkIndex(cards)`. Every `{c.fullName}` cell becomes `<CardLink>`. |
| Deck Insights legality table (`DrawOddsPage`) | The name cell links with `cardPath(cardData)` when the card was matched. |
| Deck Doctor (`BuildDiff`, `LiftChecklist`, `YourCards`) | A `hrefOf(cardId)` prop beside `nameOf`; the page builds it from its `cardById`. |

Not linked: the Coconut deck builder tiles and the Decklist Inspector bars (both are already buttons; a nested link would be invalid HTML), the OBS overlay, the Game Scraper board.

## 4. Per-card duels.ink meta stats

**Source.** The same `/api/stats/meta` feed Stock Decks and Deck Doctor read (`fetchEraStats({ queue, era })`, public, no token), one call per `STOCK_DECK_FOLDERS` entry (Core Bo1 and Infinity Bo1 for the current set). Per named archetype (`aggregateArchetypes` + `representativeProfile`): `centroidCounts[cardId]` (copies in the average build), and the profile's `cardLift` entry for the card (`presence`, `winRateWith`, `lift`). `pairCardLift[pair]` gives the same per colour pair. A card is looked up by **every** duels.ink id its printings carry (`cardKey` of each printing), because the field data names one printing per card.

**Pure lib.** `src/lib/cardMetaStats.js`: `cardMetaRows(stats, ids)` → one row per archetype whose representative build or lift list names the card, sorted by archetype games: `{ key, name, colors, gamesPlayed, winRate, metaShare, copies, presence, winRateWith, lift }` (`copies` 0 when only the lift list names it; lift fields null when only the centroid does). `cardPairLift(stats, ids)` → `[{ pair, presence, winRateWith, lift }]`.

**Card page.** A section "In the duels.ink meta" with one tab per folder (Core / Infinity). Table: Archetype (links to `/stock-decks?folder=…`) · Copies in average build · % of its decks · Win rate with · Lift · Archetype meta share · Games. Under it, the colour-pair lift rows when any exist. Empty → "No named archetype's average build runs this card in <era>." A failed fetch shows the error.

## Out of scope

`eur` prices; price history (Dreamborn keeps 30 days per card; a daily snapshot archive would need a store the repo does not have); Cardmarket prices; a card's play rate across the whole field (the feed has no field-wide per-card count); linking names inside the Coconut builder and Decklist Inspector.
