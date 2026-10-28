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

  it('keys a promo by its promo grouping, so it never shadows the regular printing', () => {
    const cards = [
      { setCode: '1', number: 2, fullName: 'Let It Go', promoGrouping: 'C1' },
      { setCode: '1', number: 2, fullName: 'Regular Card' },
    ]
    expect(buildCardIdToName(cards)).toEqual({ '1-C1-2': 'Let It Go', '1-2': 'Regular Card' })
  })

  it('returns {} for empty/missing input', () => {
    expect(buildCardIdToName([])).toEqual({})
    expect(buildCardIdToName(undefined)).toEqual({})
  })
})
