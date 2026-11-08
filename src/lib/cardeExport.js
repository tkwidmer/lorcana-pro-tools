import { resolveColors } from './inkColors'

// carde.io's decklists export (the admin's "Download decklists", JSON or CSV)
// read into Field Breakdown's input: one `4 Card Name - Version` list per deck,
// a blank line between. The export names a card without its version ("Tod"),
// and the JSON carries no set code, so each card is resolved to a printing
// whose ink fits the deck's ink pair: the pair that covers the most copies,
// then the one that fits the larger share of each name's printings. The CSV's
// set code narrows a name to that set's printings first.
const INKS = ['amber', 'amethyst', 'emerald', 'ruby', 'sapphire', 'steel']
const PAIRS = INKS.flatMap((a, i) => INKS.slice(i + 1).map((b) => [a, b]))

// RFC 4180: quoted fields may hold commas, quotes ("") and newlines.
export function parseCsv(text) {
  const rows = [[]]
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { rows.at(-1).push(field); field = '' }
    else if (ch === '\n') { rows.at(-1).push(field.replace(/\r$/, '')); field = ''; rows.push([]) }
    else field += ch
  }
  rows.at(-1).push(field)
  const [header, ...body] = rows.filter((r) => r.some(Boolean))
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])))
}

// Either file → [[{ name, count, setCode? }]], main deck only, one per player.
export function decksFromExport(text) {
  if (text.trimStart().startsWith('{')) {
    return JSON.parse(text).decklists.map((d) =>
      d.sections.filter((s) => s.section_key === 'main').flatMap((s) => s.cards.map((c) => ({ name: c.name, count: c.quantity }))))
  }
  const decks = new Map()
  for (const r of parseCsv(text)) {
    if (r.section__key !== 'main') continue
    if (!decks.has(r.user__id)) decks.set(r.user__id, [])
    decks.get(r.user__id).push({ name: r.card__name, count: Number(r.card__quantity), setCode: r.card__set_code.replace(/^set/, '') })
  }
  return [...decks.values()]
}

const inksOf = (card) => resolveColors(card.colors?.length ? card.colors : [card.color])
const fits = (card, pair) => inksOf(card).every((ink) => pair.includes(ink))

function resolveDeck(deck, byName) {
  const entries = deck.map(({ name, count, setCode }) => {
    const printings = byName.get(name) ?? []
    const inSet = printings.filter((c) => c.setCode === setCode)
    return { name, count, printings: inSet.length ? inSet : printings }
  })
  const score = (pair) => {
    let cover = 0
    let share = 0
    for (const { count, printings } of entries) {
      const n = printings.filter((c) => fits(c, pair)).length
      if (n) cover += count
      if (printings.length) share += (count * n) / printings.length
    }
    return [cover, share]
  }
  const scored = PAIRS.map((pair) => ({ pair, s: score(pair) }))
  const { pair } = scored.reduce((best, x) => (x.s[0] > best.s[0] || (x.s[0] === best.s[0] && x.s[1] > best.s[1]) ? x : best))
  return entries.map(({ name, count, printings }) => `${count} ${printings.find((c) => fits(c, pair))?.fullName ?? name}`).join('\n')
}

export function decklistsFromExport(text, cards) {
  const byName = new Map()
  for (const c of cards) byName.set(c.name, [...(byName.get(c.name) ?? []), c])
  const decks = decksFromExport(text).filter((d) => d.length)
  if (!decks.length) throw new Error('No decklists found in this file')
  return decks.map((d) => resolveDeck(d, byName)).join('\n\n')
}
