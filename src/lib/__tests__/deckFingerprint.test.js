import { describe, it, expect } from 'vitest'
import { deckFingerprint, isDeckModified } from '../deckFingerprint'

describe('deckFingerprint', () => {
  it('returns null for empty/falsy input', () => {
    expect(deckFingerprint(null)).toBeNull()
    expect(deckFingerprint([])).toBeNull()
  })

  it('is stable regardless of card order', () => {
    const a = [{ cardId: '1', count: 4 }, { cardId: '2', count: 2 }]
    const b = [{ cardId: '2', count: 2 }, { cardId: '1', count: 4 }]
    expect(deckFingerprint(a)).toBe(deckFingerprint(b))
  })

  it('differs when card counts differ', () => {
    const a = [{ cardId: '1', count: 4 }]
    const b = [{ cardId: '1', count: 3 }]
    expect(deckFingerprint(a)).not.toBe(deckFingerprint(b))
  })
})

describe('isDeckModified', () => {
  it('returns false when either input is empty', () => {
    expect(isDeckModified([], ['a', 'b'])).toBe(false)
    expect(isDeckModified([{ cardId: 'a', count: 1 }], [])).toBe(false)
  })

  it('returns false when the composition matches', () => {
    const latestDecklist = [{ cardId: 'a', count: 2 }, { cardId: 'b', count: 1 }]
    const apiCardIds = ['a', 'a', 'b']
    expect(isDeckModified(latestDecklist, apiCardIds)).toBe(false)
  })

  it('returns true when a card count differs', () => {
    const latestDecklist = [{ cardId: 'a', count: 2 }]
    const apiCardIds = ['a', 'a', 'a']
    expect(isDeckModified(latestDecklist, apiCardIds)).toBe(true)
  })

  it('returns true when the card set differs', () => {
    const latestDecklist = [{ cardId: 'a', count: 1 }]
    const apiCardIds = ['b']
    expect(isDeckModified(latestDecklist, apiCardIds)).toBe(true)
  })
})
