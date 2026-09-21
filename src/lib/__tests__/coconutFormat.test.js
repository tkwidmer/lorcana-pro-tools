import { describe, it, expect } from 'vitest'
import { getCardLimit, isCardInkLegal, isValidInkSelection, validateDeck, MIN_DECK_SIZE, MAX_INKS } from '../coconutFormat'
import { COCONUT_CARDS } from '../coconutCards'
import { VALID_INKS } from '../inkColors'

const nickWilde = {
  inks: ['amber'],
  baseFullName: 'Nick Wilde - Wily Fox',
  extraCopy: { name: 'Pawpsicle', maxCopies: 4 },
}

const plainCoconut = {
  inks: ['ruby'],
  baseFullName: 'Some Card - Subtitle',
}

// The newer wave is built on Lorcana's dual-ink duo cards.
const belleAndBeast = {
  inks: ['ruby', 'sapphire'],
  baseFullName: 'Belle & Beast - Certain as the Sun',
}

describe('getCardLimit', () => {
  it('defaults to 1 copy for a normal card', () => {
    expect(getCardLimit({ fullName: 'Random Card - Foo', name: 'Random Card' }, nickWilde)).toBe(1)
  })

  it('returns 4 for the card matching the coconut base full name', () => {
    expect(getCardLimit({ fullName: 'Nick Wilde - Wily Fox', name: 'Nick Wilde' }, nickWilde)).toBe(4)
  })

  it('is case-insensitive when matching baseFullName', () => {
    expect(getCardLimit({ fullName: 'NICK WILDE - WILY FOX', name: 'Nick Wilde' }, nickWilde)).toBe(4)
  })

  it('returns the extraCopy limit for a matching extra-copy item', () => {
    expect(getCardLimit({ fullName: 'Pawpsicle', name: 'Pawpsicle' }, nickWilde)).toBe(4)
  })

  it('ignores extraCopy for a coconut card that does not define one', () => {
    expect(getCardLimit({ fullName: 'Pawpsicle', name: 'Pawpsicle' }, plainCoconut)).toBe(1)
  })

  it('returns 1 when no coconutCard is provided', () => {
    expect(getCardLimit({ fullName: 'Nick Wilde - Wily Fox', name: 'Nick Wilde' }, null)).toBe(1)
  })

  it('returns 1 for a falsy card', () => {
    expect(getCardLimit(null, nickWilde)).toBe(1)
  })
})

describe('isCardInkLegal', () => {
  it('returns false for a falsy card', () => {
    expect(isCardInkLegal(null, ['ruby'])).toBe(false)
  })

  it('allows a colorless card regardless of locked inks', () => {
    expect(isCardInkLegal({ color: '' }, ['ruby'])).toBe(true)
  })

  it('allows a card whose ink is locked', () => {
    expect(isCardInkLegal({ color: 'Ruby' }, ['ruby', 'sapphire'])).toBe(true)
  })

  it('rejects a card whose ink is not locked', () => {
    expect(isCardInkLegal({ color: 'Amber' }, ['ruby', 'sapphire'])).toBe(false)
  })

  it('requires every ink of a dual-ink card to be locked', () => {
    expect(isCardInkLegal({ color: 'Ruby/Sapphire' }, ['ruby'])).toBe(false)
    expect(isCardInkLegal({ color: 'Ruby/Sapphire' }, ['ruby', 'sapphire'])).toBe(true)
  })
})

describe('isValidInkSelection', () => {
  it('rejects empty or non-array selections', () => {
    expect(isValidInkSelection([], nickWilde)).toBe(false)
    expect(isValidInkSelection(null, nickWilde)).toBe(false)
  })

  it('rejects selections beyond MAX_INKS', () => {
    expect(isValidInkSelection(['amber', 'ruby', 'sapphire', 'steel'], nickWilde)).toBe(false)
  })

  it('requires the coconut card ink to be included', () => {
    expect(isValidInkSelection(['ruby', 'sapphire'], nickWilde)).toBe(false)
    expect(isValidInkSelection(['amber', 'ruby'], nickWilde)).toBe(true)
  })

  it('requires BOTH inks of a dual-ink coconut card', () => {
    expect(isValidInkSelection(['ruby'], belleAndBeast)).toBe(false)
    expect(isValidInkSelection(['sapphire'], belleAndBeast)).toBe(false)
    expect(isValidInkSelection(['ruby', 'amber'], belleAndBeast)).toBe(false)
    expect(isValidInkSelection(['ruby', 'sapphire'], belleAndBeast)).toBe(true)
  })

  it('leaves a dual-ink coconut card exactly one free ink slot', () => {
    expect(isValidInkSelection(['ruby', 'sapphire', 'amber'], belleAndBeast)).toBe(true)
    expect(isValidInkSelection(['ruby', 'sapphire', 'amber', 'steel'], belleAndBeast)).toBe(false)
  })

  it('grants 4 copies of a dual-ink coconut card\'s base card', () => {
    expect(getCardLimit({ fullName: 'Belle & Beast - Certain as the Sun', name: 'Belle & Beast' }, belleAndBeast)).toBe(4)
  })

  it('rejects an unknown ink name', () => {
    expect(isValidInkSelection(['amber', 'not-an-ink'], nickWilde)).toBe(false)
  })

  it('allows any legal inks when no coconutCard given', () => {
    expect(isValidInkSelection(['ruby'], null)).toBe(true)
  })

  it('MAX_INKS is 3', () => {
    expect(MAX_INKS).toBe(3)
  })
})

describe('validateDeck', () => {
  const lockedInks = ['amber']

  it('flags a deck under MIN_DECK_SIZE', () => {
    const entries = [{ fullName: 'Card A', name: 'Card A', qty: 5, color: 'Amber' }]
    const result = validateDeck(entries, nickWilde, lockedInks)
    expect(result.totalCount).toBe(5)
    expect(result.isValid).toBe(false)
    expect(result.issues.some(i => i.includes(`needs at least ${MIN_DECK_SIZE}`))).toBe(true)
  })

  it('flags a card exceeding its copy limit', () => {
    const entries = [
      { fullName: 'Random Card', name: 'Random Card', qty: 2, color: 'Amber' },
      { fullName: 'Filler', name: 'Filler', qty: 58, color: 'Amber' },
    ]
    const result = validateDeck(entries, nickWilde, lockedInks)
    expect(result.issues.some(i => i.includes('Random Card'))).toBe(true)
  })

  it('flags an off-color card', () => {
    const entries = [
      { fullName: 'Off Color Card', name: 'Off Color Card', qty: 1, color: 'Ruby' },
      { fullName: 'Filler', name: 'Filler', qty: 59, color: 'Amber' },
    ]
    const result = validateDeck(entries, nickWilde, lockedInks)
    expect(result.issues.some(i => i.includes("isn't in your deck's ink colors"))).toBe(true)
  })

  it('returns isValid true for a legal 60-card singleton-respecting deck', () => {
    const filler = Array.from({ length: 56 }, (_, i) => ({
      fullName: `Filler Card ${i}`,
      name: `Filler Card ${i}`,
      qty: 1,
      color: 'Amber',
    }))
    const entries = [
      { fullName: 'Nick Wilde - Wily Fox', name: 'Nick Wilde', qty: 4, color: 'Amber' },
      ...filler,
    ]
    const result = validateDeck(entries, nickWilde, lockedInks)
    expect(result.totalCount).toBe(60)
    expect(result.isValid).toBe(true)
    expect(result.issues).toEqual([])
  })
})

// Guards the data itself: every Coconut card must name a base card and carry a
// non-empty `inks` array, since the deck builder locks inks and seeds 4 copies
// of the base card from exactly those two fields.
describe('COCONUT_CARDS data', () => {
  it('gives every card a baseFullName and at least one ink', () => {
    expect(COCONUT_CARDS.length).toBe(25)
    for (const c of COCONUT_CARDS) {
      expect(c.baseFullName, `${c.id} baseFullName`).toBeTruthy()
      expect(Array.isArray(c.inks) && c.inks.length > 0, `${c.id} inks`).toBe(true)
      expect(c.inks.every(i => VALID_INKS.includes(i)), `${c.id} ink names`).toBe(true)
      expect(c.inks.length, `${c.id} ink count`).toBeLessThanOrEqual(MAX_INKS)
    }
  })

  it('uses unique ids, which the card art filenames are keyed by', () => {
    expect(new Set(COCONUT_CARDS.map(c => c.id)).size).toBe(COCONUT_CARDS.length)
  })
})
