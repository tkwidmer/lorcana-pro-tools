---
name: lorcanajson-docs
description: Check the LorcanaJSON reference before building or modifying any feature that reads card data fields (e.g. useCards.js, cardsCache.js, ProxyCard.jsx, CoconutDeckBuilderPage, DrawOddsPage, or anything matching on card.fullName/color/cost/keywordAbilities/etc.), or before assuming the shape of /api/cards / allCards.json. Use whenever a card field's meaning, existence, or format-version behavior is unclear.
---

# LorcanaJSON Card Data Reference

LorcanaJSON (https://lorcanajson.org) is a static file host, not a REST API —
there's no auth, no rate limits, no JSON docs endpoint like duels.ink's
`api-docs.md`. The card field reference lives on the site's HTML page, and it
matters because the field set has changed across format versions (fields get
renamed or removed — e.g. `nonEnchantedId`/`baseId`, `bannedSince`/
`allowedInFormats`). Don't assume a field from memory; check the current page.

## When to use

Before implementing or debugging anything involving:
- `src/hooks/useCards.js`, `src/lib/cardsCache.js` (the `/api/cards` fetch +
  IndexedDB cache)
- Anything reading card fields directly: `ProxyCard.jsx`, `SearchBar.jsx`,
  `CoconutDeckBuilderPage`/`coconutCards.js` (matches by `fullName`),
  `DrawOddsPage`, `GamelogAnalyzerPage`, or any code keying off `color`,
  `colors`, `cost`, `inkwell`, `lore`, `strength`, `willpower`,
  `keywordAbilities`, `subtypes`, `rarity`, `type`, `simpleName`
- Anything relying on `metadata.json` (`formatVersion`, `generatedOn`) to
  detect when card data needs refreshing

## Key URLs

- `https://lorcanajson.org/` — landing page; the "Card data fields
  explanation" section (current v2.x format) is the canonical field
  reference. Fetch and read this section rather than relying on prior
  knowledge of field names.
- `https://lorcanajson.org/cardExplanations_formatV1.html` — the **deprecated
  v1** field list. Only relevant for historical/compat reasons — do not use
  it as the source of truth for current field shapes.
- `https://lorcanajson.org/files/current/en/allCards.json` — the actual data
  file this repo proxies via `/api/cards` (Vite dev proxy / `vercel.json`
  rewrite). Large; fetch only if you need to inspect real field values.
- `https://lorcanajson.org/changelog.html` (and `changelog_de.html`,
  `changelog_fr.html`, `changelog_it.html`) — per-language changelogs; check
  when a `formatVersion` bump is suspected of breaking an assumption.

## Steps

1. Fetch `https://lorcanajson.org/` and read the "Card data fields
   explanation" section for the fields in scope (or `curl` it and grep for
   the field name).
2. If behavior seems version-dependent (a field the code expects doesn't
   appear, or an unfamiliar field shows up), check `changelog.html` for the
   relevant `formatVersion` bump.
3. Cross-check against `src/hooks/useCards.js` / `src/lib/cardsCache.js` and
   the calling code — note any drift (renamed/removed fields, new fields not
   yet used) before writing code.
4. Implement using the confirmed current field shapes, not assumptions from
   prior sessions — the format has changed before (e.g. `nonEnchantedId` →
   `baseId` in v2.3.0, `bannedSince` → `allowedInFormats` in v2.2.0).
