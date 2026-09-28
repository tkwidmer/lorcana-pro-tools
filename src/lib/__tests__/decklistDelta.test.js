import { describe, it, expect } from 'vitest'
import { computeDelta } from '../decklistDelta'

describe('computeDelta', () => {
  it('lists adds and removes, largest change first', () => {
    const current = new Map([['A', 4], ['B', 2], ['C', 1]])
    const next = new Map([['A', 4], ['B', 4], ['D', 1], ['E', 3]])
    expect(computeDelta(current, next)).toEqual({
      toAdd: [{ name: 'E', count: 3 }, { name: 'B', count: 2 }, { name: 'D', count: 1 }],
      toRemove: [{ name: 'C', count: 1 }],
    })
  })

  it('returns empty lists for identical decks', () => {
    const deck = new Map([['A', 4]])
    expect(computeDelta(deck, new Map(deck))).toEqual({ toAdd: [], toRemove: [] })
  })
})
