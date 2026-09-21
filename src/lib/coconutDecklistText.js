import { COCONUT_CARDS } from './coconutCards'
import { MAX_INKS } from './coconutFormat'
import { resolveInkName, resolveColors } from './inkColors'

// Matches the decklist format duels.ink accepts, so a list pasted there
// imports as a real Coconut deck. Its parser reads a `Coconut: <id>` header
// naming duels.ink's own card id, takes card lines as "<qty> <card name>",
// and skips blank lines and anything prefixed with `#` or `//` — but treats
// every *other* unrecognized line as a bad card entry. So our own metadata
// (deck name, locked inks, and the Coconut card by base card name) rides
// along as `#` comments: duels.ink ignores them, and parseCoconutDecklist
// below reads them back for a lossless round trip here.
//
// The base-card comment is what identifies the Coconut card on re-import,
// since a card list alone can't always answer it (a Nick Wilde deck has *two*
// cards at 4 copies — Nick Wilde and Pawpsicle). Locked inks need recording
// for the same reason: one can have zero cards in the list so far.
const FORMAT_MARKER = '[Format Coconut]'
const COMMENT = '#'

function formatInkLabel(ink) {
  return ink.charAt(0).toUpperCase() + ink.slice(1)
}

export function generateCoconutDecklistText(deck, coconutCard) {
  const sorted = [...deck.cards].sort((a, b) => (a.cost - b.cost) || a.fullName.localeCompare(b.fullName))
  const lines = [
    `${COMMENT} ${FORMAT_MARKER}`,
    `${COMMENT} Deck: ${deck.name}`,
    `${COMMENT} Coconut Card: ${coconutCard.baseFullName}`,
    `${COMMENT} Inks: ${deck.inks.map(formatInkLabel).join('/')}`,
  ]
  // The machine-readable header duels.ink actually reads. Absent for the duo
  // cards, which its catalog doesn't carry yet.
  if (coconutCard.duelsId) lines.push(`Coconut: ${coconutCard.duelsId}`)
  lines.push('', ...sorted.map(e => `${e.qty} ${e.fullName}`))
  return lines.join('\n')
}

// cardsByFullName: Map<lowercase fullName, card> — used to resolve each line
// against real card data (cost/color/type) so the result matches the shape
// every other deck entry already uses.
export function parseCoconutDecklist(text, cardsByFullName, getEffectiveType) {
  let deckName = null
  let coconutBaseFullName = null
  let coconutDuelsId = null
  let inksLine = null
  const cardLines = []

  for (const rawLine of text.split('\n')) {
    // Our own metadata rides as `#` comments so duels.ink skips it; strip the
    // marker back off (it accepts `//` too) before reading the line.
    const line = rawLine.trim().replace(/^(?:#|\/\/)\s*/, '').trim()
    if (!line || line === FORMAT_MARKER) continue

    const deckMatch = line.match(/^deck:\s*(.+)$/i)
    if (deckMatch) { deckName = deckMatch[1].trim(); continue }

    const coconutMatch = line.match(/^coconut card:\s*(.+)$/i)
    if (coconutMatch) { coconutBaseFullName = coconutMatch[1].trim(); continue }

    // duels.ink's own header, so a list copied straight off that site imports.
    const duelsMatch = line.match(/^coconut:\s*(\S+)$/i)
    if (duelsMatch) { coconutDuelsId = duelsMatch[1].trim().toLowerCase(); continue }

    const inksMatch = line.match(/^inks:\s*(.+)$/i)
    if (inksMatch) { inksLine = inksMatch[1].trim(); continue }

    // Accepts both "4 Card Name" (the standard) and "4x Card Name".
    const cardMatch = line.match(/^(\d+)x?\s+(.+)$/i)
    if (cardMatch) {
      // duels.ink suffixes each line with its own card id, e.g.
      // "4 Scar - Finally King (1-145)" — drop it and match on the name.
      const name = cardMatch[2].trim().replace(/\s*\([^)]*\)\s*$/, '').trim()
      cardLines.push({ qty: parseInt(cardMatch[1], 10), name })
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

  if (!coconutCard && coconutDuelsId) {
    coconutCard = COCONUT_CARDS.find(c => c.duelsId === coconutDuelsId) ?? null
  }

  // No "Coconut Card:" header (e.g. a plain list from another tool) — fall
  // back to the same heuristic other Coconut-aware tools use: the card at 4
  // copies that matches one of the known Coconut base cards. Ambiguous
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
  // The Coconut card's own inks go first so the MAX_INKS cap below can never
  // drop one of them — a duo card contributes two.
  if (coconutCard) inks = [...coconutCard.inks, ...inks.filter(i => !coconutCard.inks.includes(i))]
  inks = inks.slice(0, MAX_INKS)

  return { deckName, coconutCard, inks, entries, unmatchedNames }
}
