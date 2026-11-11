# Card Search and card pages

Covers `src/pages/CardSearchPage.jsx`, `src/pages/CardPage.jsx`, `src/components/CardSearchSyntax.jsx`, `src/components/CardMetaSection.jsx`, `src/components/CardLink.jsx`, `src/lib/cardQuery.js`, `src/lib/cardLegality.js`, `src/lib/cardPrintings.js`, `src/lib/cardPrices.js`, `src/lib/cardMetaStats.js`, `src/hooks/useCardPrices.js`, and the `sets` half of `useCards`.

Design: `docs/superpowers/specs/2026-11-11-card-database-design.md` (the syntax table and the verified LorcanaJSON shapes) and `docs/superpowers/specs/2026-11-11-card-database-followups-design.md` (list view, links, meta stats; its price source was replaced, see Prices).

## Data

Everything about a card is computed client-side from `/api/cards` (LorcanaJSON `allCards.json`). `useCards()` returns `{ cards, sets }`; `sets[setCode]` has `name`, `type`, `releaseDate`. Printings of one card share cost, inks, stats and inkwell, and may differ in text. `cardKey(card)` in `cardIdResolver.js` is the duels.ink id (`1-42`, `1-P1-1`, `3-4c`); `cardPath(card)` turns it into `/cards/1/42`, `/cards/1/P1-1`, `/cards/3/4c`, and `printingNumber(card)` is the number part as shown (`42`, `P1-1`, `4c`).

**Printings of a card** (`groupPrintings`): printings that share a `fullName` or are linked by `baseId` / `reprintOfId`. The link matters: five promo and enchanted printings print the name differently from their base (the C2-10 "Let it Go" of "Let It Go", the Vaiana promo of Moana). `groupPrintings` maps every printing to its card's list; the card page's Printings table and `runQuery`'s one-row-per-card dedupe both use it.

A card's rules text is `abilities` followed by `effects`: an Action's effect is only in `effects` (a song's `abilities` hold just its sing reminder). The two together equal `fullTextSections`.

## Legality (`cardLegality.js`)

Per format: `legal`, `banned` (since), `rotated` (until), `not_legal`; banned beats rotated. Coconut = Infinity status unless `FormatCoconut.bannedSinceDate` (the data carries no Coconut pool; this is the one assumption). LorcanaJSON already propagates legality by name, so a set-1 printing of a reprinted card is Core-legal.

## Prices (`cardPrices.js`, `useCardPrices`)

TCGplayer market prices in USD per printing, keyed by LorcanaJSON's `externalLinks.tcgPlayerId`. The source is duels.ink's public, undocumented `/api/prices`: its own nightly snapshot (about 02:00 UTC) of TCGplayer, Cardmarket and CardNexus prices by product id. duels.ink sends no CORS header, so `api/duels.ts?endpoint=prices` passes it through (CDN-cached 6 hours) and `fetchCardPrices()` in `duelsApi.js` reads its `tcgplayer` part with `tcgplayerSnapshot` (`regular` → `normal`, `foil`). `useCardPrices()` loads it once per page. If duels.ink changes or drops the endpoint, prices go blank and the pages show the error; nothing guesses a price.

`printingPrice(prices, card)` → `{ normal, foil }` or `null`; `usdOf` is the non-foil price, or the foil price when only foil exists (enchanted, epic, iconic); `priceLabel` → `"$2.00 · foil $81.51"`, `"foil $719.99"`, `"—"`. On LorcanaJSON 2.4.1 every enchanted, epic, iconic and variant printing has a price, and 197 of 215 promos.

## Query language (`cardQuery.js`)

Scryfall syntax on Lorcana fields; the table in `CardSearchSyntax.jsx` is the user-facing reference and must match `compileTerm`. Unknown keys or values, a comparison operator on a membership key (`k`, `s`, `f`, `banned`, `is`, `order`, `dir`, `unique`, `display`), an unclosed quote, a bad `/regex/` and a dangling `-`/`or`/`(` all throw `QuerySyntaxError`, which the page prints. `o:` searches rules text with parenthesized reminder text stripped; `fo:` searches all of `fullText`. `usd` compares `usdOf` (an unpriced printing never matches) and throws "Prices are not loaded" without a snapshot, as does `order:usd`. The default order is `set`: set, then collector number, a set's promos after its regular cards. `unique:cards` (default) shows one printing per card, chosen by `primaryPrinting` among the *matching* printings (so `s:1` shows the set-1 printing). Adding a key: one `case` in `compileTerm`, one row in `CardSearchSyntax.jsx`, one test.

`runQuery(cards, sets, q, prices)` → `{ cards, display, order, direction }`.

## List view

`display:grid` (default) or `display:list` (`checklist` is an alias). The Grid/List buttons and the sortable column headers rewrite directives inside `?q=` with `withDirective(q, key, value)`, which replaces or removes one directive (every alias of it: `dir:`/`direction:`) and leaves every other token, quoted text included, untouched. Headers read the order and direction `runQuery` actually used, so aliases (`order:cmc`) highlight the right column.

## Card-name links

One URL builder, `cardPath`. Places that know only a name use `cardLinkIndex(cards)` (every printed name, alternate ones included → the primary printing's path) and render `<CardLink name href>`. Linked: `DeckListCard` bars (`CardBar link`: Stock Decks, Forge Decks, Deck Doctor, Deck Lab), Analytics' card and challenge tables (`cardHref`), the Deck Insights legality table, Deck Doctor's build diff, lift checklists (`hrefOf(cardId)`) and Your Cards (`cardHref`). Never linked: the Decklist Inspector's bars (toggle buttons; a link inside would be invalid HTML) and the OBS overlay (inert by design); `CardBar` ignores `link` when `onToggle` is set. duels.ink gamelog card names are LorcanaJSON `fullName`s, so Analytics' names resolve.

## Meta section (`cardMetaStats.js`, `CardMetaSection`)

"In the duels.ink meta" on the card page: one tab per `STOCK_DECK_FOLDERS` entry, each one `fetchEraStats` call (the feed Stock Decks reads). `cardMetaRows(stats, ids)` lists every named archetype whose average build (`centroidCounts`) or lift list names the card; `ids` is every printing's `cardKey`, because the feed names one printing per card. duels.ink lists lift only for each archetype's and ink pair's ten highest-lift cards, so a dash in Lift means "not in the top ten", and the section says so.

## Not built

Languages, per-card `<title>`, price history, Cardmarket prices on the page (the snapshot carries them), card-name links inside the Coconut builder and the Decklist Inspector.
