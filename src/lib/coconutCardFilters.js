import { VALID_INKS, resolveColors } from './inkColors'

// Not all of these appear as a distinct `keywordAbilities` field across every
// LorcanaJSON card — falling back to matching the leading word of each named
// ability covers cards where the keyword is only present inline (e.g. "Shift 2").
const KNOWN_KEYWORDS = [
  'Bodyguard', 'Challenger', 'Evasive', 'Reckless', 'Resist', 'Rush',
  'Shift', 'Singer', 'Support', 'Ward', 'Sing Together', 'Vanish',
]

// LorcanaJSON represents Song cards as `type: "Action"` with a "Song" entry
// in `subtypes` rather than a distinct type — songs are treated as their own
// card type everywhere in this browser, so this derives the type players
// actually think in terms of.
export function getEffectiveType(card) {
  if (card.type === 'Action' && card.subtypes?.includes('Song')) return 'Song'
  return card.type
}

export function getCardKeywords(card) {
  if (Array.isArray(card.keywordAbilities) && card.keywordAbilities.length > 0) {
    return card.keywordAbilities
  }
  const found = new Set()
  for (const ability of card.abilities ?? []) {
    const name = ability?.name
    if (!name) continue
    for (const keyword of KNOWN_KEYWORDS) {
      if (name.startsWith(keyword)) found.add(keyword)
    }
  }
  return Array.from(found)
}

// Set codes are mostly numeric strings ("1".."9") but promos/quests use
// letter-prefixed codes (e.g. "Q1") — numeric sets sort first, in numeric
// order, then any non-numeric codes fall back to a plain string compare.
export function compareSetCodes(a, b) {
  const an = parseInt(a, 10)
  const bn = parseInt(b, 10)
  const aIsNum = !Number.isNaN(an)
  const bIsNum = !Number.isNaN(bn)
  if (aIsNum && bIsNum) return an - bn
  if (aIsNum !== bIsNum) return aIsNum ? -1 : 1
  return a.localeCompare(b)
}

export function sortByKnownOrder(values, order) {
  return [...values].sort((a, b) => {
    const ai = order.indexOf(a)
    const bi = order.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

// Builds `start, start+1, ..., cap-1, cap+` — the last bucket is a catch-all
// for that value and anything higher (real cost/strength/willpower top out
// around 12, so a "10+" bucket keeps the row from growing unbounded).
export function makeStatBuckets(start, cap) {
  const buckets = []
  for (let n = start; n < cap; n++) buckets.push({ value: n, label: String(n), isMax: false })
  buckets.push({ value: cap, label: `${cap}+`, isMax: true })
  return buckets
}

export const COST_BUCKETS = makeStatBuckets(1, 10)
export const STRENGTH_BUCKETS = makeStatBuckets(0, 10)
export const WILLPOWER_BUCKETS = makeStatBuckets(1, 10)
// Lore tops out at 5 across all printed cards, so every bucket is exact.
export const LORE_BUCKETS = [0, 1, 2, 3, 4, 5].map(n => ({ value: n, label: String(n), isMax: n === 5 }))

export function matchesStatBuckets(value, selected, bucketDefs) {
  if (!selected.length) return true
  if (value == null) return false
  return selected.some(v => {
    const def = bucketDefs.find(b => b.value === v)
    return def ? (def.isMax ? value >= def.value : value === def.value) : false
  })
}

// Set codes are mostly numeric strings ("1".."9") but promos/quests use
// letter-prefixed codes (e.g. "Q1") — numeric sets sort first, in order,
// then any non-numeric codes fall back to a plain string compare.
export function compareBySetNumber(a, b) {
  const an = parseInt(a.setCode, 10)
  const bn = parseInt(b.setCode, 10)
  const aIsNum = !Number.isNaN(an)
  const bIsNum = !Number.isNaN(bn)
  if (aIsNum && bIsNum && an !== bn) return an - bn
  if (aIsNum !== bIsNum) return aIsNum ? -1 : 1
  if (aIsNum && bIsNum) return (a.number ?? 0) - (b.number ?? 0)
  return String(a.setCode).localeCompare(String(b.setCode)) || (a.number ?? 0) - (b.number ?? 0)
}

// Same idea as compareBySetNumber but newest set first — used as the
// tie-break for Cost and Ink Color sorts, where "same cost" or "same ink"
// cards should surface the most recently printed version first.
export function compareBySetNumberDesc(a, b) {
  const an = parseInt(a.setCode, 10)
  const bn = parseInt(b.setCode, 10)
  const aIsNum = !Number.isNaN(an)
  const bIsNum = !Number.isNaN(bn)
  if (aIsNum && bIsNum && an !== bn) return bn - an
  if (aIsNum !== bIsNum) return aIsNum ? -1 : 1
  if (aIsNum && bIsNum) return (a.number ?? 0) - (b.number ?? 0)
  return String(b.setCode).localeCompare(String(a.setCode)) || (a.number ?? 0) - (b.number ?? 0)
}

export function compareByInk(a, b) {
  const ai = VALID_INKS.indexOf(resolveColors([a.color])[0] ?? '')
  const bi = VALID_INKS.indexOf(resolveColors([b.color])[0] ?? '')
  const aRank = ai === -1 ? VALID_INKS.length : ai
  const bRank = bi === -1 ? VALID_INKS.length : bi
  if (aRank !== bRank) return aRank - bRank
  return (a.cost - b.cost) || compareBySetNumberDesc(a, b)
}

export function compareCards(a, b, sortBy) {
  switch (sortBy) {
    case 'cost-asc': return (a.cost - b.cost) || compareBySetNumberDesc(a, b)
    case 'cost-desc': return (b.cost - a.cost) || compareBySetNumberDesc(a, b)
    case 'name-asc': return a.fullName.localeCompare(b.fullName)
    case 'name-desc': return b.fullName.localeCompare(a.fullName)
    case 'ink': return compareByInk(a, b)
    case 'set-number':
    default: return compareBySetNumber(a, b)
  }
}

export function hasActiveFilters(filters) {
  return Object.entries(filters).some(([key, value]) => {
    if (key === 'inkable') return value !== 'any'
    if (Array.isArray(value)) return value.length > 0
    return value !== ''
  })
}

export function cardMatchesFilters(card, filters) {
  const cardInks = resolveColors([card.color])
  if (filters.inks.length && !cardInks.some(ink => filters.inks.includes(ink))) return false
  if (filters.types.length && !filters.types.includes(getEffectiveType(card))) return false
  if (filters.inkable === 'yes' && !card.inkwell) return false
  if (filters.inkable === 'no' && card.inkwell) return false
  if (!matchesStatBuckets(card.cost, filters.costBuckets, COST_BUCKETS)) return false
  if (!matchesStatBuckets(card.strength, filters.strengthBuckets, STRENGTH_BUCKETS)) return false
  if (!matchesStatBuckets(card.willpower, filters.willpowerBuckets, WILLPOWER_BUCKETS)) return false
  if (!matchesStatBuckets(card.lore, filters.loreBuckets, LORE_BUCKETS)) return false
  if (filters.sets.length && !filters.sets.includes(card.setCode)) return false
  if (filters.rarities.length && !filters.rarities.includes(card.rarity)) return false
  if (filters.keywords.length) {
    const keywords = getCardKeywords(card)
    if (!filters.keywords.some(k => keywords.includes(k))) return false
  }
  if (filters.classifications.length) {
    const subtypes = card.subtypes ?? []
    if (!filters.classifications.some(c => subtypes.includes(c))) return false
  }
  if (filters.franchises.length && !filters.franchises.includes(card.story)) return false
  const q = filters.query.trim().toLowerCase()
  if (q && !(card.simpleName?.includes(q) || card.fullName?.toLowerCase().includes(q))) return false
  return true
}
