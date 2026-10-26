import { matchDeckList } from './decklistShared'
import { deckInks } from './streamOverlay'
import { parseDeckList } from './parseDeckList'

// Many pasted lists → one list per block. A block ends at a blank line or a
// line of dashes; duels.ink's "(set-number)" suffixes are dropped as on Deck
// Doctor.
export function splitDeckLists(text) {
  return (text ?? '')
    .replace(/\s*\([^)]*\)\s*$/gm, '')
    .split(/\n\s*(?:-{3,}\s*)?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const cap = (w) => w[0].toUpperCase() + w.slice(1)

// Each list by its two most-played inks, and the room by ink pair, largest
// first: { decks: [{ index, colors, cards, unmatched }], field: [{ pair:
// 'Amber/Steel', colors: ['amber', 'steel'], count }] }.
export function inkPairField(lists, cardIndex) {
  const decks = lists.map((text, i) => {
    const entries = matchDeckList(text, cardIndex)
    const unmatched = parseDeckList(text).map((p) => p.name).filter((n) => !entries.some((e) => e.name === n))
    const colors = deckInks(entries).slice(0, 2).sort()
    return { index: i + 1, colors, cards: entries.reduce((s, e) => s + e.count, 0), unmatched }
  })
  const rows = new Map()
  for (const d of decks) {
    const key = d.colors.join('/')
    const row = rows.get(key) ?? { pair: d.colors.map(cap).join('/') || 'Unknown', colors: d.colors, count: 0 }
    row.count += 1
    rows.set(key, row)
  }
  const field = [...rows.values()].sort((a, b) => b.count - a.count || a.pair.localeCompare(b.pair))
  return { decks, field }
}

// The room as "Amber/Steel 5" lines, the Stream Overlay Metagame card's input
// (the lines the carde.io bookmarklet copies).
export function inkPairLines(lists, cardIndex) {
  return inkPairField(lists, cardIndex).field.map((r) => `${r.pair} ${r.count}`)
}
