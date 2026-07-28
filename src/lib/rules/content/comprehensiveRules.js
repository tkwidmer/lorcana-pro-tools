// PLACEHOLDER CONTENT — not the official Disney Lorcana Comprehensive Rules.
// Sample data used to build and test the Rules feature (browsing, chapter
// navigation, and version-diff highlighting) until the real rules PDFs are
// supplied. Replace the `entries` arrays below with the actual rules text,
// keeping the id/type/title/text shape.
//
// Versions are ordered newest first. Rule ids follow the chapter numbering
// scheme (e.g. "104.1.a") — depth for indentation is derived from the
// number of dot-separated segments in the id.

export const comprehensiveRulesVersions = [
  {
    version: '2026-02-01',
    label: 'February 2026',
    releaseDate: '2026-02-01',
    entries: [
      { id: '100', type: 'chapter', title: 'Game Concepts', slug: 'game-concepts' },
      { id: '101', type: 'rule', title: 'General', text: "These rules apply to every game of Lorcana, from a casual kitchen-table match to the finals of a World Championship." },
      { id: '101.1', type: 'rule', text: "If a card's text directly contradicts these rules, the card's text takes precedence, except for rules and effects that use the word \"can't.\"" },
      { id: '102', type: 'rule', title: 'Parts of a Card', text: "Each card has a name, a cost, an ink color, a card type, and rules text that describes what the card does." },
      { id: '103', type: 'rule', title: 'Card States', text: "A card can be exerted or ready, and, if it's a character, dry or wet with ink, and affected by summoning sickness or not." },
      { id: '104', type: 'rule', title: 'Zones', text: "A zone is a place where cards can be during a game, such as a player's hand, deck, discard, or play area." },
      { id: '104.1', type: 'rule', text: "Cards move between zones as a result of players' actions and card effects." },

      { id: '200', type: 'chapter', title: 'Playing the Game', slug: 'playing-the-game' },
      { id: '201', type: 'rule', title: 'Turn Structure', text: "Each turn consists of the following phases in order: Ready, Set, Draw, and Main." },
      { id: '201.1', type: 'rule', text: "During the Ready phase, the active player readies all of their cards that are exerted." },
      { id: '201.2', type: 'rule', text: "During the Set phase, any \"at the start of your turn\" abilities trigger, in an order chosen by the active player." },
      { id: '202', type: 'rule', title: 'Questing', text: "A character can quest to generate lore for their player, as long as the character isn't exerted and doesn't have summoning sickness." },
      { id: '202.1', type: 'rule', text: "Questing exerts the character and adds lore equal to the character's lore value, plus any bonuses from static abilities, to their player's total." },
    ],
  },
  {
    version: '2025-11-01',
    label: 'November 2025',
    releaseDate: '2025-11-01',
    entries: [
      { id: '100', type: 'chapter', title: 'Game Concepts', slug: 'game-concepts' },
      { id: '101', type: 'rule', title: 'General', text: "These rules apply to every game of Lorcana, from a casual kitchen-table match to the finals of a World Championship." },
      { id: '101.1', type: 'rule', text: "If a card's text directly contradicts these rules, the card takes precedence." },
      { id: '102', type: 'rule', title: 'Parts of a Card', text: "Each card has a name, a cost, an ink color, a card type, and rules text that describes what the card does." },
      { id: '102.1', type: 'rule', text: "A card's cost is the amount of ink required to play it. Cost is shown in the top-left corner of the card." },
      { id: '103', type: 'rule', title: 'Zones', text: "A zone is a place where cards can be during a game, such as a player's hand, deck, discard, or play area." },
      { id: '103.1', type: 'rule', text: "Cards move between zones as a result of players' actions and card effects." },

      { id: '200', type: 'chapter', title: 'Playing the Game', slug: 'playing-the-game' },
      { id: '201', type: 'rule', title: 'Turn Structure', text: "Each turn consists of the following phases in order: Ready, Set, Draw, and Main." },
      { id: '201.1', type: 'rule', text: "During the Ready phase, the active player readies all of their cards that are exerted." },
      { id: '202', type: 'rule', title: 'Questing', text: "A character can quest to generate lore for their player, as long as the character isn't exerted and doesn't have summoning sickness." },
      { id: '202.1', type: 'rule', text: "Questing exerts the character and adds lore equal to the character's lore value to their player's total." },
    ],
  },
]
