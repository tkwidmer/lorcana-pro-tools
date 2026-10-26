# [Format Coconut]

Read before touching `coconutCards.js`, `coconutFormat.js`, `coconutDecklistText.js`, `CoconutDeckBuilderPage.jsx` or the Proxy Generator's Coconut panel. The `add-coconut-card` skill is the procedure for a new card.

## [Format Coconut] Deck Builder

`CoconutDeckBuilderPage` walks through: pick one of the 29 beta Coconut cards (`coconutCards.js`) → lock in up to 3 ink types, which must include **every** one of that Coconut card's `inks` → build a 60+ card singleton deck around it. Most Coconut cards have a single ink and leave two free slots; the newer wave is built on Lorcana's dual-ink duo cards, so those lock two inks and leave one. Each Coconut card reuses its associated Disney Lorcana card's real stats (matched by `fullName` against the live `useCards()` data) rather than being a distinct printed card — the base card's ability is replaced on screen with the Coconut card's alternate ability text (`coconutCards.js`'s `ability` field), since we don't have separate art or a separate database entry for the Coconut variant.

`coconutFormat.js` enforces the format's deck-building rules:
- 1 copy max per card, except up to 4 copies of the card matching the chosen Coconut card's `baseFullName`, and (Nick Wilde – "Wily Fox" only) up to 4 copies of an item named Pawpsicle, via the `extraCopy` field on that Coconut card entry.
- Every card must be within the deck's locked ink colors (`isCardInkLegal`, using `resolveColors()` from `inkColors.js`) — a dual-ink card needs *both* its inks locked, which is why a duo Coconut card locks both of its own.
- At least 60 total cards (`MIN_DECK_SIZE`).

Decks are saved to IndexedDB via `coconutDecks.js` (autosaved with a short debounce as the user edits, consistent with the "no server-side game data" ethos — decks never leave the browser).

## Coconut Decklist Text (duels.ink interop)

`coconutDecklistText.js` generates and parses the Copy/Import List text in the
deck builder. The format is the one **duels.ink** accepts, since that's where
these decks actually get tested. Its parser (verified against duels.ink's own
client bundle) skips blank lines and anything prefixed with `#` or `//`, reads a
`Coconut: <id>` header naming its own card id, takes card lines as
`<qty> <card name>` with an optional trailing `(setCode-number)` — and treats
every **other** unrecognized line as a bad card entry that fails the import.

So our own metadata rides along as `#` comments, which duels.ink ignores and
`parseCoconutDecklist` reads back for a lossless round trip here:

```
# [Format Coconut]
# Deck: Wily Items
# Coconut Card: Nick Wilde - Wily Fox
# Inks: Sapphire/Amber
Coconut: coconut-008

4 Pawpsicle
4 Nick Wilde - Wily Fox
```

Don't add an uncommented header line — it breaks the paste into duels.ink.

The `Coconut:` header is emitted only when the card has a `duelsId`. All 29 cards
currently have one (duels.ink's catalog runs to `coconut-029`); a card duels.ink
hasn't added yet exports without it, and the `# Coconut Card:` comment still
identifies it on re-import here. The parser
also accepts a list copied straight off duels.ink (its `Coconut: <id>` header
and its `(1-145)` card-id suffixes).

## Coconut Card Faces

The full-art Coconut card faces are Nathan Trippe's work
(https://x.com/NathanTrippe). Both surfaces that show them — the deck builder
and the Proxy Generator — carry the credit via `components/CoconutArtCredit.jsx`;
keep it on any new surface that displays the art.

Coconut cards have their own printed face rather than reusing the base card's
LorcanaJSON art, so all 29 are bundled as local assets at
`public/coconut-cards/<card id>.jpg` — the filename is the card's `id`, which is
what `coconutCardImageUrl(id)` builds. Both `CoconutDeckBuilderPage` and the
Proxy Generator read them through that helper; nothing fetches them remotely.

The Proxy Generator's "+ Coconut cards" panel lists every face from
`COCONUT_CARDS` (click one to add a copy, or "Add all 29" to print one of
each). These go onto the sheet as `{ imageSrc, name, version }` rather than a
LorcanaJSON card object, which is what makes `ProxyCard` print the image
instead of the B&W text layout — so a Coconut sheet prints in full color.

Every Coconut card is an alternate-ability variant of a real printed Lorcana
card (`baseFullName`), including the newer duo-card wave — Aladdin & Genie,
Belle & Beast, Darkwing Duck & Launchpad, Peter Pan & Tinker Bell, The Madrigal
Family, The Vine and Woody & Buzz Lightyear are all real cards, so they're
selectable in the deck builder and grant the same "4 copies of your Coconut
card" exception as the rest. Their only structural difference is `inks`: the
duo cards are dual-ink, so a deck built on one locks both and has a single free
ink slot left. (`The Vine` is in that wave but is single-ink Steel.)

