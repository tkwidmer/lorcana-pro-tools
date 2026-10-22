// Shared between DecklistInspectorPage (the editable tool) and
// DecklistOverlayPage (the read-only OBS Browser Source view) so the two
// stay visually identical without duplicating the grouping/encoding logic.
import { INK_HEX, INK_TEXT_ON } from './inkColors'
import { parseDeckList } from './parseDeckList'
import { toSimpleName } from './cardAnalysis'

export const BUCKET_ORDER = ['Character', 'Action', 'Item', 'Location']
export const BUCKET_LABEL = {
  Character: 'Characters',
  Action: 'Actions / Songs',
  Item: 'Items',
  Location: 'Locations',
}

// Round-trips a decklist through a URL param so an OBS Browser Source (which
// has its own isolated storage, separate from the tab you edit in) can load
// it directly via the overlay link.
export function encodeDeckParam(text) {
  try { return btoa(encodeURIComponent(text)) } catch { return '' }
}

export function decodeDeckParam(param) {
  try { return decodeURIComponent(atob(param)) } catch { return null }
}

export function inkFill(colors) {
  const hexes = colors.map(c => INK_HEX[c]).filter(Boolean)
  if (hexes.length === 0) return { background: '#9ca3af' }
  if (hexes.length === 1) return { background: hexes[0] }
  return { background: `linear-gradient(90deg, ${hexes[0]} 0%, ${hexes[0]} 48%, ${hexes[1]} 52%, ${hexes[1]} 100%)` }
}

export function textColorFor(colors) {
  const first = colors[0]
  return INK_TEXT_ON[first] || '#ffffff'
}

// Pasted decklist text → the entries the Inspector, its overlay and the Stream
// Overlay render: each line matched to a card by simplified name, unmatched
// lines dropped. `cardIndex` is buildCardIndex(cards).
export function matchDeckList(text, cardIndex) {
  return parseDeckList(text)
    .map(({ name, count }) => ({ key: name, name, count, card: cardIndex.get(toSimpleName(name)) }))
    .filter(e => e.card)
}

// Groups matched decklist entries into the 4 card-type buckets, sorted by
// cost then name within each.
export function buildBuckets(matchedEntries) {
  const map = { Character: [], Action: [], Item: [], Location: [] }
  for (const entry of matchedEntries) {
    const type = entry.card.type
    if (map[type]) map[type].push(entry)
  }
  for (const type of Object.keys(map)) {
    map[type].sort((a, b) => (a.card.cost ?? 0) - (b.card.cost ?? 0) || a.name.localeCompare(b.name))
  }
  return map
}
