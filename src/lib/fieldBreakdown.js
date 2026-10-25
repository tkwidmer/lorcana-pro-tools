import { matchDeckList } from './decklistShared'
import { deckInks } from './streamOverlay'
import { countsFromPasted, fieldCardIds, archetypeCandidates, MIN_ARCHETYPE_OVERLAP } from './deckDoctor'
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

// Each list assigned to the field's archetype it overlaps most (Deck Doctor's
// rule: same inks, ≥ MIN_ARCHETYPE_OVERLAP of the larger of the two builds),
// and the field as counts per archetype.
export function classifyField(lists, cards, cardIndex, stats) {
  const known = fieldCardIds(stats)
  const decks = lists.map((text, i) => {
    const entries = matchDeckList(text, cardIndex)
    const unmatched = parseDeckList(text).map((p) => p.name).filter((n) => !entries.some((e) => e.name === n))
    const colors = deckInks(entries).slice(0, 2)
    const cands = archetypeCandidates(stats, colors, countsFromPasted(entries, cards, known))
    const best = cands[0] && cands[0].overlap >= MIN_ARCHETYPE_OVERLAP ? cands[0] : null
    return {
      index: i + 1, colors, cards: entries.reduce((s, e) => s + e.count, 0), unmatched,
      archetype: best ? best.name : null, overlap: cands[0]?.overlap ?? null,
      runnerUp: cands[1] ? { name: cands[1].name, overlap: cands[1].overlap } : null,
    }
  })
  const byName = new Map()
  for (const d of decks) {
    const key = d.archetype ?? 'Unassigned'
    const row = byName.get(key) ?? { archetype: key, colors: d.colors, count: 0 }
    row.count += 1
    byName.set(key, row)
  }
  const field = [...byName.values()].sort((a, b) => b.count - a.count || a.archetype.localeCompare(b.archetype))
  return { decks, field }
}
