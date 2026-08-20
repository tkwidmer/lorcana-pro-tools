import { describe, it, expect } from 'vitest'
import { buildCardIdToName } from '../cardIdResolver'

describe('buildCardIdToName', () => {
  it('maps setCode-number to fullName', () => {
    const cards = [{ setCode: '1', number: '5', fullName: 'Mickey Mouse - Brave Little Tailor' }]
    expect(buildCardIdToName(cards)).toEqual({ '1-5': 'Mickey Mouse - Brave Little Tailor' })
  })

  it('falls back to name when fullName is missing', () => {
    const cards = [{ setCode: '1', number: '5', name: 'Mickey Mouse' }]
    expect(buildCardIdToName(cards)['1-5']).toBe('Mickey Mouse')
  })

  it('skips cards missing setCode or number', () => {
    expect(buildCardIdToName([{ name: 'No Id' }])).toEqual({})
  })

  it('prefers a non-promo Core-legal card over a promo on setCode-number collisions', () => {
    const cards = [
      { setCode: '1', number: '5', fullName: 'Promo Reprint', promoGrouping: 'p1' },
      { setCode: '1', number: '5', fullName: 'Core Original', allowedInFormats: { Core: { allowed: true } } },
    ]
    expect(buildCardIdToName(cards)['1-5']).toBe('Core Original')
  })

  it('returns {} for empty/missing input', () => {
    expect(buildCardIdToName([])).toEqual({})
    expect(buildCardIdToName(undefined)).toEqual({})
  })
})
