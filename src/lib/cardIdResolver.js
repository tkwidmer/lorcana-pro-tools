// Resolves duels.ink card ids to LorcanaJSON cards, given the full card list
// from useCards(). duels.ink ids a regular printing as `${setCode}-${number}`
// and a promo as `${setCode}-${promoGrouping}-${number}` (e.g. `1-C1-2` is the
// C1 promo of Let It Go) — the id shape used by match history, gamelogs, and
// /api/stats/meta's cardLift. A card printed in variants carries the letter after its number
// (`3-4c` is Dalmatian Puppy - Tail Wagger, variant c).
export function cardKey(card) {
  const number = `${card.number}${card.variant ?? ''}`
  return card.promoGrouping
    ? `${card.setCode}-${card.promoGrouping}-${number}`
    : `${card.setCode}-${number}`
}

export function buildCardIdToCard(cards) {
  const map = {}
  for (const c of cards ?? []) {
    if (c.setCode == null || c.number == null) continue
    // A handful of keys repeat in LorcanaJSON (localized reprints); the first entry wins.
    map[cardKey(c)] ??= c
  }
  return map
}

// Same ids, resolved to a display name.
export function buildCardIdToName(cards) {
  const map = {}
  for (const [key, c] of Object.entries(buildCardIdToCard(cards))) map[key] = c.fullName ?? c.name
  return map
}
