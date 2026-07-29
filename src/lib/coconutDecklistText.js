import { COCONUT_CARDS } from './coconutCards'
import { MAX_INKS } from './coconutFormat'
import { resolveInkName, resolveColors } from './inkColors'

// There's no established community standard for a Format Coconut decklist
// yet, so this is deliberately simple and easy to revise: the card lines are
// the exact "<qty> <full card name>" format Lorcana decklists already use
// everywhere, plus a small header identifying the two things that format
// alone can't always recover — which card is the Coconut card, and which
// inks are locked. (A card list can't always answer either on its own: e.g.
// a Nick Wilde deck has *two* cards at 4 copies — Nick Wilde and Pawpsicle —
// so "whichever card is at 4x" is ambiguous, and locked inks can include one
// with zero cards currently in the list.)
const FORMAT_MARKER = '[Format Coconut]'

function formatInkLabel(ink) {
  return ink.charAt(0).toUpperCase() + ink.slice(1)
}

export function generateCoconutDecklistText(deck, coconutCard) {
  const sorted = [...deck.cards].sort((a, b) => (a.cost - b.cost) || a.fullName.localeCompare(b.fullName))
  const lines = [
    FORMAT_MARKER,
    `Deck: ${deck.name}`,
    `Coconut Card: ${coconutCard.baseFullName}`,
    `Inks: ${deck.inks.map(formatInkLabel).join('/')}`,
    '',
    ...sorted.map(e => `${e.qty} ${e.fullName}`),
  ]
  return lines.join('\n')
}

// cardsByFullName: Map<lowercase fullName, card> — used to resolve each line
// against real card data (cost/color/type) so the result matches the shape
// every other deck entry already uses.
export function parseCoconutDecklist(text, cardsByFullName, getEffectiveType) {
  let deckName = null
  let coconutBaseFullName = null
  let inksLine = null
  const cardLines = []

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line === FORMAT_MARKER) continue

    const deckMatch = line.match(/^deck:\s*(.+)$/i)
    if (deckMatch) { deckName = deckMatch[1].trim(); continue }

    const coconutMatch = line.match(/^coconut card:\s*(.+)$/i)
    if (coconutMatch) { coconutBaseFullName = coconutMatch[1].trim(); continue }

    const inksMatch = line.match(/^inks:\s*(.+)$/i)
    if (inksMatch) { inksLine = inksMatch[1].trim(); continue }

    // Accepts both "4 Card Name" (the standard) and "4x Card Name".
    const cardMatch = line.match(/^(\d+)x?\s+(.+)$/i)
    if (cardMatch) {
      cardLines.push({ qty: parseInt(cardMatch[1], 10), name: cardMatch[2].trim() })
    }
  }

  const entriesByFullName = new Map()
  const unmatchedNames = []
  for (const { qty, name } of cardLines) {
    const real = cardsByFullName.get(name.toLowerCase())
    if (!real) { unmatchedNames.push(name); continue }
    const key = real.fullName.toLowerCase()
    const existing = entriesByFullName.get(key)
    if (existing) {
      existing.qty += qty
    } else {
      entriesByFullName.set(key, {
        fullName: real.fullName,
        name: real.name,
        version: real.version,
        cost: real.cost,
        color: real.color,
        type: getEffectiveType(real),
        qty,
      })
    }
  }
  const entries = Array.from(entriesByFullName.values())

  let coconutCard = coconutBaseFullName
    ? COCONUT_CARDS.find(c => c.baseFullName.toLowerCase() === coconutBaseFullName.toLowerCase()) ?? null
    : null

  // No "Coconut Card:" header (e.g. a plain list from another tool) — fall
  // back to the same heuristic other Coconut-aware tools use: the card at 4
  // copies that matches one of the 18 known Coconut base cards. Ambiguous
  // for a Nick Wilde/Pawpsicle list, but there's nothing better to go on.
  if (!coconutCard) {
    const candidate = entries.find(e => e.qty >= 4 && COCONUT_CARDS.some(c => c.baseFullName.toLowerCase() === e.fullName.toLowerCase()))
    if (candidate) {
      coconutCard = COCONUT_CARDS.find(c => c.baseFullName.toLowerCase() === candidate.fullName.toLowerCase())
    }
  }

  let inks = []
  if (inksLine) {
    inks = inksLine.split(/[/,]/).map(s => resolveInkName(s.trim())).filter(Boolean)
  }
  if (!inks.length) {
    const fromCards = new Set()
    for (const e of entries) {
      for (const ink of resolveColors([e.color])) fromCards.add(ink)
    }
    inks = Array.from(fromCards)
  }
  if (coconutCard) inks = [coconutCard.ink, ...inks.filter(i => i !== coconutCard.ink)]
  inks = inks.slice(0, MAX_INKS)

  return { deckName, coconutCard, inks, entries, unmatchedNames }
}
