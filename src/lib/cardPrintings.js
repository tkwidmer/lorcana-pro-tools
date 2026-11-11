// Printings of a card name and their routes. A route is the duels.ink id
// (`cardKey`) with the set split off: /cards/1/42, /cards/1/P1-42 (promo),
// /cards/3/4c (variant).
import { cardKey } from './cardIdResolver'

export const cardPath = card => '/cards/' + cardKey(card).replace('-', '/')

// The collector number as the route shows it: 42, P1-42 (promo), 4c (variant).
export const printingNumber = card => cardKey(card).slice(card.setCode.length + 1)

export function findPrinting(cards, setCode, number) {
  const key = `${setCode}-${number}`
  return cards.find(c => cardKey(c) === key) ?? null
}

// Numbered sets in order; quest sets (Q1, Q2…) after them.
export function setOrder(card) {
  const n = parseInt(card.setCode, 10)
  return Number.isNaN(n) ? 100 + parseInt(card.setCode.replace(/\D/g, ''), 10) : n
}

const byPrinting = (a, b) =>
  setOrder(a) - setOrder(b) ||
  (a.promoGrouping ? 1 : 0) - (b.promoGrouping ? 1 : 0) ||
  a.number - b.number ||
  (a.variant ?? '').localeCompare(b.variant ?? '')

// Every printing → the printings of its card, in printing order. Printings
// belong together when they share a fullName or LorcanaJSON links them with
// baseId / reprintOfId: a promo or enchanted can print the name differently
// (the C210 "Let it Go" of "Let It Go", the Vaiana promo of Moana).
export function groupPrintings(cards) {
  const parent = new Map(cards.map(c => [c, c]))
  const root = c => {
    while (parent.get(c) !== c) c = parent.get(c)
    return c
  }
  const join = (a, b) => parent.set(root(b), root(a))
  const byId = new Map(cards.filter(c => c.id != null).map(c => [c.id, c]))
  const byName = new Map()
  for (const c of cards) {
    const same = byName.get(c.fullName)
    if (same) join(same, c)
    else byName.set(c.fullName, c)
    for (const linked of [byId.get(c.baseId), byId.get(c.reprintOfId)]) if (linked) join(linked, c)
  }
  const lists = new Map()
  for (const c of cards) {
    const r = root(c)
    if (!lists.has(r)) lists.set(r, [])
    lists.get(r).push(c)
  }
  for (const list of lists.values()) list.sort(byPrinting)
  return new Map(cards.map(c => [c, lists.get(root(c))]))
}

const isBase = c => !c.baseId && !c.promoGrouping && !c.variant

// The printing to show for a name: the latest base printing (the current
// reprint), else whatever came first in printing order.
export function primaryPrinting(printings) {
  const base = printings.filter(isBase)
  const pool = base.length ? base : [...printings].sort(byPrinting)
  if (!base.length) return pool[0]
  return base.reduce((best, c) => (setOrder(c) > setOrder(best) ? c : best))
}
