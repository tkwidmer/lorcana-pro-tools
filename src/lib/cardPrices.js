// TCGplayer market prices (USD) per printing, from duels.ink's /api/prices
// (undocumented, public, refreshed nightly by duels.ink; proxied through
// api/duels.ts?endpoint=prices because it sends no CORS header). Keyed by
// LorcanaJSON's externalLinks.tcgPlayerId.

// duels.ink's response → { updatedAt, prices: { [tcgPlayerId]: { normal, foil } } }.
export function tcgplayerSnapshot(json) {
  const tcg = json?.tcgplayer
  if (!tcg?.prices || tcg.currency !== 'USD') throw new Error('duels.ink returned no TCGplayer prices')
  const prices = {}
  for (const [id, p] of Object.entries(tcg.prices)) prices[id] = { normal: p.regular ?? null, foil: p.foil ?? null }
  return { updatedAt: tcg.lastUpdated, prices }
}

export function printingPrice(prices, card) {
  const id = card.externalLinks?.tcgPlayerId
  return (id != null && prices?.[id]) || null
}

export const usdOf = entry => entry?.normal ?? entry?.foil ?? null

const usd = n => `$${n.toFixed(2)}`

export function priceLabel(entry) {
  if (!entry) return '—'
  const parts = []
  if (entry.normal != null) parts.push(usd(entry.normal))
  if (entry.foil != null) parts.push(`foil ${usd(entry.foil)}`)
  return parts.length ? parts.join(' · ') : '—'
}
