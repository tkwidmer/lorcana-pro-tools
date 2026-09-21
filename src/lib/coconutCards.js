// Beta [Format Coconut] cards — a themed alternate-ability variant of an
// existing Disney Lorcana card that a Coconut deck is built around.
//
// Each Coconut card is NOT a distinct printed card in LorcanaJSON — it reuses
// the real card's art and stats (`baseFullName` matches that card's
// `fullName` field exactly) but replaces its printed ability with the text
// below for on-screen display. `extraCopy`, when present, is an additional
// deck-building exception beyond the standard "4 copies of your Coconut
// card" rule (see Nick Wilde — Wily Fox / Pawpsicle).
//
// `inks` is the base card's own ink(s): one for most, two for the duo cards
// the newer wave is built on. A deck must lock every one of them.

export const COCONUT_CARDS = [
  {
    id: 'ariel-spectacular-singer',
    name: 'Ariel',
    version: 'Spectacular Singer',
    baseFullName: 'Ariel - Spectacular Singer',
    inks: ['amber'],
    ability: 'Whenever a Princess character of yours sings a song, gain lore equal to her ◇.',
  },
  {
    id: 'pocahontas-peacekeeper',
    name: 'Pocahontas',
    version: 'Peacekeeper',
    baseFullName: 'Pocahontas - Peacekeeper',
    inks: ['amber'],
    ability: "Once during your turn, you may choose a character. Until the start of your next turn, they get +1 ◇ and can't challenge and must quest if able.",
  },
  {
    id: 'stitch-rock-star',
    name: 'Stitch',
    version: 'Rock Star',
    baseFullName: 'Stitch - Rock Star',
    inks: ['amber'],
    ability: 'Once during your turn, you may play a character with cost 2 or less for free. If that character was named Lilo or Stitch, chosen character gets +1 ◇ this turn.',
  },
  {
    id: 'dumbo-ninth-wonder-of-the-universe',
    name: 'Dumbo',
    version: 'Ninth Wonder of the Universe',
    baseFullName: 'Dumbo - Ninth Wonder of the Universe',
    inks: ['amethyst'],
    ability: "You may use abilities that require exerting your characters the turn they're played.",
  },
  {
    id: 'snow-white-merry-as-the-morning',
    name: 'Snow White',
    version: 'Merry as the Morning',
    baseFullName: 'Snow White - Merry as the Morning',
    inks: ['amethyst'],
    ability: 'Once per game during your turn, you may reveal your hand. If you have a Snow White and 7 or more Seven Dwarfs character cards with different names among the cards in your hand, in your discard, and in play, your characters get +2 ◇ for the rest of the game.',
  },
  {
    id: 'winnie-the-pooh-hunny-wizard',
    name: 'Winnie the Pooh',
    version: 'Hunny Wizard',
    baseFullName: 'Winnie the Pooh - Hunny Wizard',
    inks: ['amethyst'],
    ability: 'Whenever you play a character without an ability, you may pay 1 ink to draw a card.',
  },
  {
    id: 'donald-duck-fred-honeywell',
    name: 'Donald Duck',
    version: 'Fred Honeywell',
    baseFullName: 'Donald Duck - Fred Honeywell',
    inks: ['emerald'],
    ability: 'You pay 1 ink less to use Boost abilities and to play characters or locations with Boost.',
  },
  {
    id: 'robin-hood-sneaky-sleuth',
    name: 'Robin Hood',
    version: 'Sneaky Sleuth',
    baseFullName: 'Robin Hood - Sneaky Sleuth',
    inks: ['emerald'],
    ability: "At the start of your first turn, you may play an item card named Robin's Bow from your collection for free. Whenever you play a character named Robin Hood, deal 1 damage to chosen opposing character or location.",
  },
  {
    id: 'ursula-deceiver-of-all',
    name: 'Ursula',
    version: 'Deceiver of All',
    baseFullName: 'Ursula - Deceiver of All',
    inks: ['emerald'],
    ability: 'Your characters count as having +1 cost for singing songs. Your characters named Ursula count as having +2 cost instead.',
  },
  {
    id: 'mickey-mouse-brave-little-tailor',
    name: 'Mickey Mouse',
    version: 'Brave Little Tailor',
    baseFullName: 'Mickey Mouse - Brave Little Tailor',
    inks: ['ruby'],
    ability: 'Mickey Mouse character cards in your hand, deck, and discard gain Shift 2.',
  },
  {
    id: 'mr-incredible-super-strong',
    name: 'Mr. Incredible',
    version: 'Super Strong',
    baseFullName: 'Mr. Incredible - Super Strong',
    inks: ['ruby'],
    ability: 'Whenever you play a Super character, they gain Rush this turn and you may exert chosen opposing character with less strength than them.',
  },
  {
    id: 'sisu-emboldened-warrior',
    name: 'Sisu',
    version: 'Emboldened Warrior',
    baseFullName: 'Sisu - Emboldened Warrior',
    inks: ['ruby'],
    ability: "All characters with more strength than each opposing character can quest the turn they're played.",
  },
  {
    id: 'moana-curious-explorer',
    name: 'Moana',
    version: 'Curious Explorer',
    baseFullName: 'Moana - Curious Explorer',
    inks: ['sapphire'],
    ability: 'During your turn, if you have a Moana, Heihei, or Pua character in play, you may ink an additional card.',
  },
  {
    id: 'mufasa-ruler-of-pride-rock',
    name: 'Mufasa',
    version: 'Ruler of Pride Rock',
    baseFullName: 'Mufasa - Ruler of Pride Rock',
    inks: ['sapphire'],
    ability: 'Once during your turn, you may pay 5 ink to put the top 2 cards of your deck into your inkwell facedown and exerted.',
  },
  {
    id: 'nick-wilde-wily-fox',
    name: 'Nick Wilde',
    version: 'Wily Fox',
    baseFullName: 'Nick Wilde - Wily Fox',
    inks: ['sapphire'],
    ability: 'Once during your turn, you may banish 4 of your items. If you do, gain 4 lore.',
    extraCopy: { name: 'Pawpsicle', maxCopies: 4 },
  },
  {
    id: 'john-silver-greedy-treasure-seeker',
    name: 'John Silver',
    version: 'Greedy Treasure Seeker',
    baseFullName: 'John Silver - Greedy Treasure Seeker',
    inks: ['steel'],
    ability: 'Each of your locations gains Resist +1 for each character there.',
  },
  {
    id: 'scar-finally-king',
    name: 'Scar',
    version: 'Finally King',
    baseFullName: 'Scar - Finally King',
    inks: ['steel'],
    ability: 'During your turn, you pay 1 ink less for the first Ally character you play.',
  },
  {
    id: 'tinker-bell-giant-fairy',
    name: 'Tinker Bell',
    version: 'Giant Fairy',
    baseFullName: 'Tinker Bell - Giant Fairy',
    inks: ['steel'],
    ability: 'Whenever one of your other abilities or actions deals damage to an opposing character, deal 1 damage to that character.',
  },

  // The newer Coconut wave is built on Lorcana's dual-ink duo cards, so these
  // lock two inks instead of one, leaving a single free slot under MAX_INKS.
  // `inks` matches the base card's own color (e.g. "Amethyst-Emerald").
  {
    id: 'aladdin-and-genie-mischievous-pals',
    name: 'Aladdin & Genie',
    version: 'Mischievous Pals',
    baseFullName: 'Aladdin & Genie - Mischievous Pals',
    inks: ['amethyst', 'emerald'],
    ability: "Whenever you draw a card during your turn, if it's the third card you drew this turn, gain 2 lore.",
  },
  {
    id: 'belle-and-beast-certain-as-the-sun',
    name: 'Belle & Beast',
    version: 'Certain as the Sun',
    baseFullName: 'Belle & Beast - Certain as the Sun',
    inks: ['ruby', 'sapphire'],
    ability: 'Whenever one of your characters with cost 5 or more readies, draw a card.',
  },
  {
    id: 'darkwing-duck-and-launchpad-st-canards-finest',
    name: 'Darkwing Duck & Launchpad',
    version: "St. Canard's Finest",
    baseFullName: "Darkwing Duck & Launchpad - St. Canard's Finest",
    inks: ['sapphire', 'steel'],
    ability: 'During your turn, whenever an opposing character is banished in a challenge, gain 1 lore. If they were a Villain character, gain 3 lore instead.',
  },
  {
    id: 'peter-pan-and-tinker-bell-fast-friends',
    name: 'Peter Pan & Tinker Bell',
    version: 'Fast Friends',
    baseFullName: 'Peter Pan & Tinker Bell - Fast Friends',
    inks: ['amethyst', 'ruby'],
    ability: 'Once during your turn, you may give chosen character Evasive until the start of your next turn. If they already had Evasive, they get +1 \u25c7 until the start of your next turn.',
  },
  {
    id: 'the-madrigal-family-every-generation',
    name: 'The Madrigal Family',
    version: 'Every Generation',
    baseFullName: 'The Madrigal Family - Every Generation',
    inks: ['amber', 'sapphire'],
    ability: "During your turn, whenever you remove 1 or more damage from one of your characters, you may ready them. They can't quest or challenge for the rest of the turn.",
  },
  {
    id: 'the-vine-towering-stalk',
    name: 'The Vine',
    version: 'Towering Stalk',
    baseFullName: 'The Vine - Towering Stalk',
    inks: ['steel'],
    ability: 'Once during your turn, for each Floodborn character you have in play, you may pay 1 ink less for the next Floodborn character you play this turn.',
  },
  {
    id: 'woody-and-buzz-lightyear-best-buddies',
    name: 'Woody & Buzz Lightyear',
    version: 'Best Buddies',
    baseFullName: 'Woody & Buzz Lightyear - Best Buddies',
    inks: ['amber', 'emerald'],
    ability: 'Once during your turn, you may pay 1 ink less for the next Toy character you play. If you do and you have a character named Woody and a character named Buzz Lightyear in play, draw a card.',
  },
]

// Real beta [Format Coconut] card art, bundled locally rather than fetched from
// LorcanaJSON \u2014 these variants have their own printed face. The Proxy
// Generator prints them at 2.5\u00d73.5in, so the file has to be a local asset.
export function coconutCardImageUrl(id) {
  return `/coconut-cards/${id}.jpg`
}

export function getCoconutCard(id) {
  return COCONUT_CARDS.find(c => c.id === id) ?? null
}
