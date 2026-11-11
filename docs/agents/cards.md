# Card Search and card pages

Covers `src/pages/CardSearchPage.jsx`, `src/pages/CardPage.jsx`, `src/components/CardSearchSyntax.jsx`, `src/lib/cardQuery.js`, `src/lib/cardLegality.js`, `src/lib/cardPrintings.js`, and the `sets` half of `useCards`.

Design: `docs/superpowers/specs/2026-11-11-card-database-design.md` (the syntax table and the verified LorcanaJSON shapes).

## Data

Everything is computed client-side from `/api/cards` (LorcanaJSON `allCards.json`). `useCards()` returns `{ cards, sets }`; `sets[setCode]` has `name`, `type`, `releaseDate`. A card's identity is its `fullName`; printings of one name share cost, inks, stats and inkwell, and may differ in text. `cardKey(card)` in `cardIdResolver.js` is the duels.ink id (`1-42`, `1-P1-1`, `3-4c`) and `cardPath(card)` turns it into `/cards/1/42`, `/cards/1/P1-1`, `/cards/3/4c`.

A card's rules text is `abilities` followed by `effects`: an Action's effect is only in `effects` (a song's `abilities` hold just its sing reminder). The two together equal `fullTextSections`.

## Legality (`cardLegality.js`)

Per format: `legal`, `banned` (since), `rotated` (until), `not_legal`; banned beats rotated. Coconut = Infinity status unless `FormatCoconut.bannedSinceDate` (the data carries no Coconut pool; this is the one assumption). LorcanaJSON already propagates legality by name, so a set-1 printing of a reprinted card is Core-legal.

## Query language (`cardQuery.js`)

Scryfall syntax on Lorcana fields; the table in `CardSearchSyntax.jsx` is the user-facing reference and must match `compileTerm`. Unknown keys or values, a comparison operator on a membership key (`k`, `s`, `f`, `banned`, `is`, `order`, `dir`, `unique`), an unclosed quote, a bad `/regex/` and a dangling `-`/`or`/`(` all throw `QuerySyntaxError`, which the page prints. `o:` searches rules text with parenthesized reminder text stripped; `fo:` searches all of `fullText`. `unique:cards` (default) shows one printing per name, chosen by `primaryPrinting` among the *matching* printings (so `s:1` shows the set-1 printing). Adding a key: one `case` in `compileTerm`, one row in `CardSearchSyntax.jsx`, one test.

## Not built

Prices, languages, card-name links from deck lists, per-card duels.ink stats, a list view, per-card `<title>`.
