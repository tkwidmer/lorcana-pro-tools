import { describe, it, expect } from 'vitest'
import {
  buildKeywordAnalysis,
  buildDrawEffects,
  classifyCardRole,
  buildMulliganAdvice,
  setLabel,
  toSimpleName,
  buildCardIndex,
  getLegality,
} from '../cardAnalysis'

describe('classifyCardRole', () => {
  it('returns an empty object for a falsy card', () => {
    expect(classifyCardRole(null)).toEqual({})
  })

  it('identifies a questing character', () => {
    const role = classifyCardRole({ type: 'Character' })
    expect(role.isCharacter).toBe(true)
    expect(role.develops).toBe(true)
  })

  it('identifies draw and removal text', () => {
    const draw = classifyCardRole({ type: 'Action', fullText: 'Draw a card.' })
    expect(draw.isDraw).toBe(true)

    const removal = classifyCardRole({ type: 'Action', fullText: 'Banish chosen character.' })
    expect(removal.isRemoval).toBe(true)
  })

  it('identifies a song', () => {
    const role = classifyCardRole({ type: 'Action - Song' })
    expect(role.isSong).toBe(true)
  })
})

describe('buildKeywordAnalysis', () => {
  it('returns null for an empty deck', () => {
    expect(buildKeywordAnalysis([], [])).toBeNull()
  })

  it('counts keyword density from keywordAbilities', () => {
    const cards = [{ name: 'Mulan - Elite Archer', count: 2 }]
    const allApiCards = [{
      fullName: 'Mulan - Elite Archer', cost: 3, type: 'Character',
      keywordAbilities: ['Evasive'],
    }]
    const result = buildKeywordAnalysis(cards, allApiCards)
    expect(result.density).toEqual([{ keyword: 'Evasive', count: 2 }])
  })

  it('flags a Shift card as covered when its cheaper base is also in the deck', () => {
    const cards = [
      { name: 'Elsa - Snow Queen', count: 2 },
      { name: 'Elsa - Ice Surfer', count: 2 },
    ]
    const allApiCards = [
      { fullName: 'Elsa - Snow Queen', cost: 3, type: 'Character' },
      {
        fullName: 'Elsa - Ice Surfer', cost: 6, type: 'Character',
        abilities: [{ keyword: 'Shift', keywordValueNumber: 4 }],
      },
    ]
    const result = buildKeywordAnalysis(cards, allApiCards)
    const shift = result.shifts.find(s => s.name === 'Elsa - Ice Surfer')
    expect(shift.covered).toBe(true)
    expect(shift.baseCopies).toBe(2)
  })
})

describe('buildDrawEffects', () => {
  it('returns null when the deck has no draw/ramp/scry/recovery cards', () => {
    const cards = [{ name: 'Vanilla Guy', count: 4 }]
    const allApiCards = [{ fullName: 'Vanilla Guy', type: 'Character', fullText: '' }]
    expect(buildDrawEffects(cards, allApiCards)).toBeNull()
  })

  it('parses a fixed draw count', () => {
    const cards = [{ name: 'Friends on the Other Side', count: 2 }]
    const allApiCards = [{ fullName: 'Friends on the Other Side', type: 'Action', fullText: 'Draw 2 cards.' }]
    const result = buildDrawEffects(cards, allApiCards)
    expect(result.drawCards).toEqual([{ name: 'Friends on the Other Side', copies: 2, drawCount: 2, variable: false }])
    expect(result.totalDrawCopies).toBe(2)
  })

  it('marks an open-ended draw as variable with no fixed count', () => {
    const cards = [{ name: 'Endless Draw', count: 1 }]
    const allApiCards = [{ fullName: 'Endless Draw', type: 'Action', fullText: 'Draw cards until you have 7 cards in your hand.' }]
    const result = buildDrawEffects(cards, allApiCards)
    expect(result.drawCards[0].variable).toBe(true)
    expect(result.drawCards[0].drawCount).toBeNull()
  })
})

describe('buildMulliganAdvice', () => {
  const roleMap = new Map([
    ['cheap character', { develops: true, isCharacter: true }],
    ['slow action', {}],
  ])
  const costMap = new Map([['cheap character', 1], ['slow action', 6]])
  const inkwellMap = new Map([['cheap character', true], ['slow action', true]])
  const cards = [
    { name: 'Cheap Character', count: 4 },
    { name: 'Slow Action', count: 4 },
  ]

  it('keeps cheap developing cards and tosses slow non-developing ones', () => {
    const result = buildMulliganAdvice(cards, costMap, inkwellMap, roleMap, 3, 60, new Set())
    expect(result.keep.map(c => c.name)).toContain('Cheap Character')
    expect(result.toss.map(c => c.name)).toContain('Slow Action')
  })

  it('puts cards missing from the card database into flexible', () => {
    const unknownCards = [{ name: 'Mystery Card', count: 1 }]
    const result = buildMulliganAdvice(unknownCards, new Map(), new Map(), new Map(), 3, 60, new Set())
    expect(result.flexible).toHaveLength(1)
    expect(result.flexible[0].reason).toMatch(/Not in database/)
  })

  it('holds a would-be-tossed Shift card as flexible when its base is in the deck', () => {
    const shiftRoleMap = new Map([['pricey shift', {}]])
    const shiftCostMap = new Map([['pricey shift', 6]])
    const shiftInkwellMap = new Map([['pricey shift', true]])
    const shiftCards = [{ name: 'Pricey Shift', count: 2 }]
    const result = buildMulliganAdvice(
      shiftCards, shiftCostMap, shiftInkwellMap, shiftRoleMap, 3, 60,
      new Set(['pricey shift'])
    )
    expect(result.toss).toHaveLength(0)
    expect(result.flexible[0].reason).toMatch(/Shift line/)
  })
})

describe('setLabel', () => {
  it('returns a labeled set name for a known set code', () => {
    expect(setLabel('1')).toBe('The First Chapter (Set 1)')
  })

  it('falls back to a generic label for an unknown set code', () => {
    expect(setLabel('99')).toBe('Set 99')
  })
})

describe('toSimpleName', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(toSimpleName('Elsa - Snow Queen!')).toBe('elsa snow queen')
  })
})

describe('buildCardIndex', () => {
  it('indexes cards by simple name', () => {
    const cards = [{ fullName: 'Elsa - Snow Queen', setCode: '1' }]
    const index = buildCardIndex(cards)
    expect(index.get('elsa snow queen').fullName).toBe('Elsa - Snow Queen')
  })

  it('prefers the Core-legal printing when the same simple name appears twice', () => {
    const cards = [
      { fullName: 'Elsa - Snow Queen', setCode: '1', allowedInFormats: {} },
      { fullName: 'Elsa Snow Queen', setCode: '1', allowedInFormats: { Core: { allowed: true } } },
    ]
    const index = buildCardIndex(cards)
    expect(index.get('elsa snow queen').fullName).toBe('Elsa Snow Queen')
  })

  it('prefers the higher set number when scores tie', () => {
    const cards = [
      { fullName: 'Elsa - Snow Queen', setCode: '1' },
      { fullName: 'Elsa Snow Queen', setCode: '3' },
    ]
    const index = buildCardIndex(cards)
    expect(index.get('elsa snow queen').setCode).toBe('3')
  })
})

describe('getLegality', () => {
  it('returns nulls for a falsy card', () => {
    expect(getLegality(null)).toEqual({ core: null, infinity: null, rotationRisk: false })
  })

  it('reads Core/Infinity legality from allowedInFormats', () => {
    const card = { allowedInFormats: { Core: { allowed: true }, Infinity: { allowed: true } } }
    const legality = getLegality(card)
    expect(legality.core).toBe(true)
    expect(legality.infinity).toBe(true)
    expect(legality.banned).toBe(false)
  })

  it('flags a card as banned when Infinity-illegal with a ban date', () => {
    const card = { allowedInFormats: { Infinity: { allowed: false, bannedSinceDate: '2024-01-01' } } }
    expect(getLegality(card).banned).toBe(true)
  })
})
