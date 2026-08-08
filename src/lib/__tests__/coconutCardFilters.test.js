import { describe, it, expect } from 'vitest'
import {
  getEffectiveType,
  getCardKeywords,
  compareSetCodes,
  sortByKnownOrder,
  makeStatBuckets,
  matchesStatBuckets,
  compareBySetNumber,
  compareBySetNumberDesc,
  compareByInk,
  compareCards,
  hasActiveFilters,
  cardMatchesFilters,
} from '../coconutCardFilters'

describe('getEffectiveType', () => {
  it('treats an Action with the Song subtype as type Song', () => {
    expect(getEffectiveType({ type: 'Action', subtypes: ['Song'] })).toBe('Song')
  })

  it('returns the raw type otherwise', () => {
    expect(getEffectiveType({ type: 'Character' })).toBe('Character')
  })
})

describe('getCardKeywords', () => {
  it('prefers the keywordAbilities field when present', () => {
    expect(getCardKeywords({ keywordAbilities: ['Rush'] })).toEqual(['Rush'])
  })

  it('falls back to scanning ability names for known keywords', () => {
    const card = { abilities: [{ name: 'Shift 4' }, { name: 'Some Other Ability' }] }
    expect(getCardKeywords(card)).toEqual(['Shift'])
  })

  it('returns an empty array when neither source has data', () => {
    expect(getCardKeywords({})).toEqual([])
  })
})

describe('compareSetCodes', () => {
  it('sorts numeric set codes numerically', () => {
    expect(['10', '2', '1'].sort(compareSetCodes)).toEqual(['1', '2', '10'])
  })

  it('sorts numeric codes before non-numeric codes', () => {
    expect(['Q1', '1'].sort(compareSetCodes)).toEqual(['1', 'Q1'])
  })
})

describe('sortByKnownOrder', () => {
  it('sorts by the given order, unknowns last alphabetically', () => {
    const order = ['Character', 'Action', 'Item']
    expect(sortByKnownOrder(['Item', 'Zzz', 'Action', 'Character'], order))
      .toEqual(['Character', 'Action', 'Item', 'Zzz'])
  })
})

describe('makeStatBuckets / matchesStatBuckets', () => {
  const buckets = makeStatBuckets(1, 3)

  it('builds a catch-all bucket at the cap', () => {
    expect(buckets).toEqual([
      { value: 1, label: '1', isMax: false },
      { value: 2, label: '2', isMax: false },
      { value: 3, label: '3+', isMax: true },
    ])
  })

  it('matches everything when nothing is selected', () => {
    expect(matchesStatBuckets(5, [], buckets)).toBe(true)
  })

  it('does not match a null value when buckets are selected', () => {
    expect(matchesStatBuckets(null, [1], buckets)).toBe(false)
  })

  it('matches an exact non-max bucket', () => {
    expect(matchesStatBuckets(2, [2], buckets)).toBe(true)
    expect(matchesStatBuckets(1, [2], buckets)).toBe(false)
  })

  it('matches anything at or above the max bucket value', () => {
    expect(matchesStatBuckets(3, [3], buckets)).toBe(true)
    expect(matchesStatBuckets(9, [3], buckets)).toBe(true)
    expect(matchesStatBuckets(2, [3], buckets)).toBe(false)
  })
})

describe('compareBySetNumber / compareBySetNumberDesc', () => {
  it('sorts ascending by numeric set code, then card number', () => {
    const cards = [{ setCode: '2', number: 1 }, { setCode: '1', number: 5 }, { setCode: '1', number: 1 }]
    const sorted = [...cards].sort(compareBySetNumber)
    expect(sorted).toEqual([{ setCode: '1', number: 1 }, { setCode: '1', number: 5 }, { setCode: '2', number: 1 }])
  })

  it('sorts descending by set code for the "desc" variant', () => {
    const cards = [{ setCode: '1', number: 1 }, { setCode: '2', number: 1 }]
    const sorted = [...cards].sort(compareBySetNumberDesc)
    expect(sorted[0].setCode).toBe('2')
  })
})

describe('compareByInk', () => {
  it('orders by VALID_INKS rank, then cost', () => {
    const amber = { color: 'amber', cost: 1, setCode: '1', number: 1 }
    const ruby = { color: 'ruby', cost: 1, setCode: '1', number: 1 }
    // VALID_INKS = ['amber','amethyst','emerald','ruby','sapphire','steel']
    expect(compareByInk(amber, ruby)).toBeLessThan(0)
  })
})

describe('compareCards', () => {
  const a = { cost: 2, fullName: 'Alpha', color: 'amber', setCode: '1', number: 1 }
  const b = { cost: 5, fullName: 'Beta', color: 'ruby', setCode: '1', number: 2 }

  it('sorts by cost ascending/descending', () => {
    expect(compareCards(a, b, 'cost-asc')).toBeLessThan(0)
    expect(compareCards(a, b, 'cost-desc')).toBeGreaterThan(0)
  })

  it('sorts by name ascending/descending', () => {
    expect(compareCards(a, b, 'name-asc')).toBeLessThan(0)
    expect(compareCards(a, b, 'name-desc')).toBeGreaterThan(0)
  })

  it('falls back to set-number order for an unknown sortBy', () => {
    expect(compareCards(a, b, 'set-number')).toBe(compareBySetNumber(a, b))
  })
})

describe('hasActiveFilters', () => {
  const EMPTY_FILTERS = {
    query: '', inks: [], types: [], inkable: 'any',
    costBuckets: [], strengthBuckets: [], willpowerBuckets: [], loreBuckets: [],
    sets: [], rarities: [], keywords: [], classifications: [], franchises: [],
  }

  it('is false for the default filter state', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
  })

  it('is true when any array filter has a selection', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, inks: ['ruby'] })).toBe(true)
  })

  it('is true when inkable is set away from "any"', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, inkable: 'yes' })).toBe(true)
  })
})

describe('cardMatchesFilters', () => {
  const EMPTY_FILTERS = {
    query: '', inks: [], types: [], inkable: 'any',
    costBuckets: [], strengthBuckets: [], willpowerBuckets: [], loreBuckets: [],
    sets: [], rarities: [], keywords: [], classifications: [], franchises: [],
  }
  const card = {
    fullName: 'Elsa - Snow Queen', simpleName: 'elsa snow queen', color: 'sapphire',
    type: 'Character', cost: 3, strength: 2, willpower: 4, lore: 1,
    inkwell: true, setCode: '1', rarity: 'Legendary', subtypes: ['Hero', 'Queen'],
    story: 'Frozen', abilities: [], keywordAbilities: ['Evasive'],
  }

  it('matches everything against the empty filter set', () => {
    expect(cardMatchesFilters(card, EMPTY_FILTERS)).toBe(true)
  })

  it('filters out a card whose ink is not selected', () => {
    expect(cardMatchesFilters(card, { ...EMPTY_FILTERS, inks: ['ruby'] })).toBe(false)
    expect(cardMatchesFilters(card, { ...EMPTY_FILTERS, inks: ['sapphire'] })).toBe(true)
  })

  it('filters by inkable yes/no', () => {
    expect(cardMatchesFilters(card, { ...EMPTY_FILTERS, inkable: 'no' })).toBe(false)
    expect(cardMatchesFilters(card, { ...EMPTY_FILTERS, inkable: 'yes' })).toBe(true)
  })

  it('filters by keyword', () => {
    expect(cardMatchesFilters(card, { ...EMPTY_FILTERS, keywords: ['Rush'] })).toBe(false)
    expect(cardMatchesFilters(card, { ...EMPTY_FILTERS, keywords: ['Evasive'] })).toBe(true)
  })

  it('filters by free-text query against simpleName/fullName', () => {
    expect(cardMatchesFilters(card, { ...EMPTY_FILTERS, query: 'elsa' })).toBe(true)
    expect(cardMatchesFilters(card, { ...EMPTY_FILTERS, query: 'moana' })).toBe(false)
  })
})
