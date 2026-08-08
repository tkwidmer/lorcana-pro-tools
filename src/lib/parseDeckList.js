// Parses a pasted decklist ("4x Elsa, Snow Queen" / "4 Elsa, Snow Queen" per
// line, one card per line) into a Map of name -> total count, merging
// duplicate lines for the same card name.
export function parseDeckListToMap(text) {
  const cardMap = new Map()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^(\d+)x?\s+(.+)$/i)
    if (!m) continue
    const count = parseInt(m[1])
    const name = m[2].trim()
    if (!name || count < 1) continue
    cardMap.set(name, (cardMap.get(name) || 0) + count)
  }
  return cardMap
}

// Same parsing, returned as an array of { name, count } sorted by count
// descending then name — the shape DrawOddsPage's card-matching UI expects.
export function parseDeckList(text) {
  return Array.from(parseDeckListToMap(text).entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
