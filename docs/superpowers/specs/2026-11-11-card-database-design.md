# Card Database ("Scryfall for Lorcana") — design

A public card search with Scryfall-style query syntax, and a page per printing with abilities, rulings, format legality and every other printing of the card. Everything is computed client-side from the LorcanaJSON `allCards.json` the site already loads through `/api/cards` (`useCards`, IndexedDB-cached). No new API route, no database, no new dependency.

## Routes

| Route | Page | Notes |
|---|---|---|
| `/cards` | `CardSearchPage` | `?q=` holds the query. Empty query shows the syntax reference and example searches. |
| `/cards/:setCode/:number` | `CardPage` | One printing. `:number` is the duels.ink id with the set prefix removed: `/cards/1/42`, `/cards/1/P1-1` (promo), `/cards/3/4c` (variant). Built by `cardPath(card)` from `cardKey(card)` in `cardIdResolver.js`. |

Both public (not in `SUPPORTER_PATHS`). `/cards` joins the Resources section of the catalog and the prerender route list.

## Data facts (LorcanaJSON formatVersion 2.4.1, verified 2026-11-11)

- 3556 printings, 2789 distinct `fullName`s. A `fullName` is the card identity; printings of one name never differ in cost, inks, stats or inkwell (checked), 117 names differ in text across printings (errata / reminder-text changes).
- Printing relationships: `baseId` (enchanted / epic / iconic / promo → its base printing), `reprintOfId` (a later set's base reprint), `promoGrouping` + `promoSource` + `promoSourceCategory`, `variant` letters (`a`–`e`, `A`/`B`) with `variantIds`, `enchantedId`, `epicId`, `iconicId`, `promoIds`.
- Legality: `allowedInFormats.{Core,Infinity}` on every printing, already propagated by name (the set-1 Stitch - Rock Star is Core-legal because set 9 reprinted it). Shapes: `{allowed:true}`, `{allowed:false, allowedUntilDate}` (rotated), `{allowed:false, bannedSinceDate}` (banned), `{allowed:false, allowedUntilDate, bannedSinceDate}` (banned before rotation: Hiram Flaversham), `{allowed:false}` (never legal: quest sets, unreleased sets). `FormatCoconut` appears only as a ban (Bend to My Will). `maxCopiesInDeck` on 2 names (Dalmatian Puppy 99, The Glass Slipper 2).
- `sets` (in the same JSON) carries `name`, `type` (`expansion`/`quest`), `releaseDate`, `allowedInFormats`. The client currently drops it; this feature keeps it.
- Text: `fullText` (with reminder text, `\n` wrapped), `fullTextSections`, `abilities[]` (`type` keyword/triggered/static/activated; keyword ones have `keyword`, `keywordValueNumber`, `reminderText`; named ones have `name` + `effect`), `keywordAbilities` (bare keyword names), `flavorText`, `clarifications[]` (Q/A rulings), `errata[]`, `historicData[]` (previous text with `usedUntil`).
- Other: `color` (`Amber`, `Amber-Steel`, `""` for quest cards), `colors[]` on duals, `type`, `subtypes`/`subtypesText`, `rarity` (Common, Uncommon, Rare, Super Rare, Legendary, Enchanted, Special, Epic, Iconic), `cost`, `inkwell`, `strength`, `willpower`, `lore`, `moveCost`, `story`, `artistsText`, `images.{thumbnail,full}`, `externalLinks.{tcgPlayerUrl,cardmarketUrl,cardTraderUrl}`, `fullIdentifier` ("42/204 • EN • 1").

## Legality rules (per printing, shown per name)

Status vocabulary: `legal`, `banned` (with `since`), `rotated` (with `until`), `not_legal`. Banned wins over rotated. **Coconut** has no pool of its own in the data: a card is Coconut-legal if it is Infinity-legal and has no `FormatCoconut.bannedSinceDate`. (Assumption: Coconut plays the Infinity pool. If wrong, only `cardLegality.js` changes.)

## Query language (Scryfall syntax, Lorcana fields)

Implicit AND, `or`/`OR`, `-` negation, parentheses, `"quoted values"`, `!"Exact Name"`, `/regex/` on text fields, operators `:` `=` `!=` `<` `<=` `>` `>=`. Bare words search the name. Unknown keys and values throw `QuerySyntaxError`, which the page shows; nothing is guessed.

| Key(s) | Matches | Examples |
|---|---|---|
| bare word, `n:`, `name:` | `fullName`, substring, accent/case-insensitive | `elsa`, `n:"spirit of winter"`, `!"Elsa - Spirit of Winter"` |
| `o:`, `text:`, `oracle:` | rules text without reminder text (parentheses stripped from `fullText`); `~` stands for the card's own name | `o:"draw a card"`, `o:/banish.*item/` |
| `fo:`, `fulloracle:` | `fullText` including reminder text | `fo:"sing this song"` |
| `ft:`, `flavor:` | `flavorText` | `ft:ice` |
| `a:`, `artist:` | `artistsText` | `a:"matthew robert davies"` |
| `story:` | `story` | `story:frozen` |
| `v:`, `version:` | `version` (the subtitle) | `v:"spirit of winter"` |
| `t:`, `type:` | `type` + `subtypesText` substring; `=` is exact type; `/regex/` allowed | `t:song`, `t:floodborn`, `t=location`, `t:/^(prince|princess)$/` |
| `k:`, `kw:`, `keyword:` | one of `keywordAbilities`, exact | `k:shift`, `kw:evasive` |
| `c:`, `color:`, `ink:` | inks the card has; `:`/`>=` at least these, `=` exactly, `<=` within, `<`/`>` strict, `!=`; a number compares the ink count; `c:m`/`c:multi` dual-ink; `c:colorless` | `c:amethyst`, `c=amber,steel`, `c=2`, `c:m` |
| `ci:`, `id:`, `identity:` | deck identity: card inks ⊆ query inks (`:` means `<=`) | `ci:amber,steel` |
| `cost:`, `mv:`, `manavalue:`, `cmc:` | `cost` | `cost<=3`, `cost=7` |
| `str:`, `strength:`, `pow:`, `power:` | `strength` | `str>=4` |
| `will:`, `willpower:`, `tou:`, `toughness:` | `willpower` | `will>str` (stat vs stat) |
| `lore:`, `l:` | `lore` | `lore>=3` |
| `move:`, `movecost:` | `moveCost` (locations) | `move:1` |
| `r:`, `rarity:` | rarity, ordered Common<Uncommon<Rare<Super Rare<Legendary<Enchanted<Special<Epic<Iconic; aliases `c u r sr l e s` | `r:legendary`, `r>=rare` |
| `s:`, `set:`, `e:`, `edition:` | set code exactly, or set name substring | `s:9`, `s:q1`, `set:fabled` |
| `cn:`, `number:` | collector number with variant letter; comparisons numeric | `cn:4c`, `cn<10` |
| `year:` | set release year | `year>=2026` |
| `date:` | set release date, `yyyy-mm-dd` or a set code standing for its release date | `date>=2025-09-05`, `date>9` |
| `f:`, `format:`, `legal:` | status `legal` in `core`, `infinity`, `coconut` | `f:core` |
| `banned:` | status `banned` in a format | `banned:infinity` |
| `is:`, `not:` | `inkable`, `uninkable`, `dual`, `promo`, `enchanted`, `reprint`, `variant`, `quest`, `banned` (any format), `errata` | `is:inkable`, `-is:promo` |
| `order:` | `set` (default: set, then collector number, a set's promos after its regular cards), `name`, `cost` (`cmc`), `rarity`, `strength` (`power`), `willpower` (`toughness`), `lore`, `color`, `artist`, `released`, `number` | `order:cost` |
| `dir:`, `direction:` | `asc` (default), `desc` | `dir:desc` |
| `unique:` | `cards` (default: one row per name, showing the best matching printing) or `prints` (every printing) | `unique:prints s:1` |

Checked against the live Scryfall syntax page on 2026-11-11. Not built, on purpose: prices (no data), `lang:` (English only), `in:`, `prefer:`, `has:`, `cube:`, `art:`/`function:` tags, `new:`, `is:unique`/`prints=`/`sets=` (need a per-name count; add when asked), `display:`, `include:extras` (quest cards are shown; `-is:quest` hides them).

## Card page content (Scryfall card page order, Lorcana fields)

Image (`images.full`) · name and version · ink icons, cost emblem (`CostBadge`), inkable · type line (type • subtypes) · abilities (keyword in bold with reminder text in italic; named abilities with the name in bold) · strength / willpower / lore (locations: willpower, lore, move cost) · flavor text · artist, story · set, collector number, rarity (`fullIdentifier`), promo source · **Legality**: Core, Infinity, Coconut with status and date, plus `maxCopiesInDeck` when present · **Printings**: every printing of the name with set, number, rarity, promo source, foil types; the current one highlighted; each a link · **Rulings**: `clarifications` (Q/A), `errata`, `historicData` ("text until <date>") · **Links**: TCGplayer, Cardmarket, CardTrader · quick searches: `t:<subtype>`, `k:<keyword>`, `a:"<artist>"`, `story:"<story>"`.

## Not in scope

Linking card names elsewhere on the site to card pages; per-card meta stats from duels.ink; a list/table results view; card-specific `<title>`; collection tracking. Each is a follow-up once the search is used.
