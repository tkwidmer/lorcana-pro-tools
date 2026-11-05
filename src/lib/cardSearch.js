// Filters LorcanaJSON cards (allCards.json `cards`) for the MCP server's
// search_cards tool. No imports with bare specifiers: mcp-server/ loads this
// under plain Node ESM.
import { buildCardIdToCard } from './cardIdResolver.js'

const cardColors = card => (card.color ?? '').split('-').filter(Boolean)

// The fields a deckbuilder reads, plus every duels.ink id that prints this card.
export function cardSummary(card, ids) {
  return {
    ids,
    fullName: card.fullName,
    type: card.type,
    subtypes: card.subtypes,
    color: card.color,
    cost: card.cost,
    inkwell: card.inkwell,
    strength: card.strength,
    willpower: card.willpower,
    lore: card.lore,
    rarity: card.rarity,
    text: card.fullText,
    core: !!card.allowedInFormats?.Core?.allowed,
    infinity: !!card.allowedInFormats?.Infinity?.allowed,
  }
}

// One summary per fullName (reprints, enchanteds and promos share a name),
// carrying every id that prints it.
function byName(cards) {
  const groups = new Map()
  for (const [id, card] of Object.entries(buildCardIdToCard(cards))) {
    const group = groups.get(card.fullName)
    if (group) group.ids.push(id)
    else groups.set(card.fullName, { card, ids: [id] })
  }
  return [...groups.values()]
}

export function searchCards(cards, f = {}) {
  const deckColors = f.colors && new Set(f.colors)
  const text = f.text?.toLowerCase()
  const hits = byName(cards).filter(({ card: c }) =>
    (!deckColors || (cardColors(c).length > 0 && cardColors(c).every(col => deckColors.has(col)))) &&
    (!f.format || c.allowedInFormats?.[f.format]?.allowed) &&
    (!f.type || c.type === f.type) &&
    (!f.subtype || c.subtypes?.includes(f.subtype)) &&
    (f.costMin == null || c.cost >= f.costMin) &&
    (f.costMax == null || c.cost <= f.costMax) &&
    (f.inkwell == null || !!c.inkwell === f.inkwell) &&
    (f.minWillpower == null || (c.willpower ?? 0) >= f.minWillpower) &&
    (f.minLore == null || (c.lore ?? 0) >= f.minLore) &&
    (!text || `${c.fullName} ${c.fullText ?? ''}`.toLowerCase().includes(text)))
  hits.sort((a, b) => a.card.cost - b.card.cost || a.card.fullName.localeCompare(b.card.fullName))
  return { total: hits.length, cards: hits.slice(0, f.limit ?? 50).map(h => cardSummary(h.card, h.ids)) }
}

// Resolves duels.ink card ids; unknown ids come back in `missing`.
export function getCardsByIds(cards, ids) {
  const byId = buildCardIdToCard(cards)
  const groups = new Map(byName(cards).map(g => [g.card.fullName, g.ids]))
  return {
    cards: ids.filter(id => byId[id]).map(id => ({ id, ...cardSummary(byId[id], groups.get(byId[id].fullName)) })),
    missing: ids.filter(id => !byId[id]),
  }
}
