// Resolves LorcanaJSON `${setCode}-${number}` card ids (the id shape used by
// duels.ink match history, gamelogs, and /api/stats/meta's cardLift) to a
// display name, given the full card list from useCards().
export function buildCardIdToName(cards) {
  // When LorcanaJSON has multiple entries with the same setCode-number (e.g. promo reprints),
  // prefer non-promo cards, then Core > Infinity > other format cards, then higher set number on ties.
  const cardByKey = {}
  const score = c => {
    const promoBonus = (c.promoGrouping == null && c.promoSourceCategory == null) ? 10 : 0
    if (c.allowedInFormats?.Core?.allowed) return promoBonus + 2
    if (c.allowedInFormats?.Infinity?.allowed) return promoBonus + 1
    return promoBonus
  }
  for (const c of cards ?? []) {
    if (c.setCode == null || c.number == null) continue
    const key = `${c.setCode}-${c.number}`
    const existing = cardByKey[key]
    if (!existing) { cardByKey[key] = c; continue }
    const ts = score(c), es = score(existing)
    if (ts > es) { cardByKey[key] = c; continue }
    if (ts === es && (parseInt(c.setCode) || 0) > (parseInt(existing.setCode) || 0)) cardByKey[key] = c
  }
  const map = {}
  for (const [key, c] of Object.entries(cardByKey)) map[key] = c.fullName ?? c.name
  return map
}
