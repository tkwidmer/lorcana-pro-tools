// Resolves duels.ink card ids to a display name, given the full LorcanaJSON
// card list from useCards(). duels.ink ids a regular printing as
// `${setCode}-${number}` and a promo as `${setCode}-${promoGrouping}-${number}`
// (e.g. `1-C1-2` is the C1 promo of Let It Go) — the id shape used by match
// history, gamelogs, and /api/stats/meta's cardLift.
function cardKey(card) {
  return card.promoGrouping
    ? `${card.setCode}-${card.promoGrouping}-${card.number}`
    : `${card.setCode}-${card.number}`
}

export function buildCardIdToName(cards) {
  const map = {}
  for (const c of cards ?? []) {
    if (c.setCode == null || c.number == null) continue
    // A handful of keys repeat in LorcanaJSON (localized reprints); the first entry wins.
    map[cardKey(c)] ??= c.fullName ?? c.name
  }
  return map
}
