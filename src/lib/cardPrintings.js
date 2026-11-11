// Printings of a card name and their routes. A route is the duels.ink id
// (`cardKey`) with the set split off: /cards/1/42, /cards/1/P1-42 (promo),
// /cards/3/4c (variant).
import { cardKey } from './cardIdResolver'

export const cardPath = card => '/cards/' + cardKey(card).replace('-', '/')

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

export function groupPrintings(cards) {
  const groups = new Map()
  for (const c of cards) {
    const group = groups.get(c.fullName)
    if (group) group.push(c)
    else groups.set(c.fullName, [c])
  }
  for (const group of groups.values()) group.sort(byPrinting)
  return groups
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
