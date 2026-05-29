import { describe, it, expect } from 'vitest'
import { inferHand } from '../handInference'

const card = (name, copies) => ({ name, estimatedCopies: copies })

describe('inferHand', () => {
  it('returns empty result when no deck provided', () => {
    const result = inferHand([], [], 7, 53)
    expect(result.entries).toEqual([])
    expect(result.totalKnownOut).toBe(0)
  })

  it('returns empty result when totalUnseen is 0', () => {
    const result = inferHand([card('Elsa', 4)], [], 0, 0)
    expect(result.entries).toEqual([])
  })

  it('computes basic probability for a 4-of in a fresh game state', () => {
    // 4-of card, 7 cards in hand, 53 in deck = 60 total unseen
    const result = inferHand([card('Elsa', 4)], [], 7, 53)
    expect(result.entries).toHaveLength(1)
    const entry = result.entries[0]
    expect(entry.name).toBe('Elsa')
    expect(entry.unseen).toBe(4)
    expect(entry.probAtLeastOne).toBeGreaterThan(0)
    expect(entry.probAtLeastOne).toBeLessThan(1)
    // P(zero 4-of in hand) uses the formula: product of (N-h-i)/(N-i) for i in 0..K-1
    // N=60, h=7, K=4 → (53/60)*(52/59)*(51/58)*(50/57)
    expect(entry.probAtLeastOne).toBeCloseTo(1 - (53 / 60) * (52 / 59) * (51 / 58) * (50 / 57), 5)
  })

  it('reduces unseen count when cards have been observed', () => {
    // 4-of, 2 already played
    const observed = [{ name: 'Elsa', plays: 2, inked: 0, discarded: 0 }]
    const result = inferHand([card('Elsa', 4)], observed, 7, 51)
    expect(result.entries[0].unseen).toBe(2)
    expect(result.entries[0].seen).toBe(2)
  })

  it('skips card entirely when all copies are seen', () => {
    const observed = [{ name: 'Elsa', plays: 4, inked: 0, discarded: 0 }]
    const result = inferHand([card('Elsa', 4)], observed, 7, 49)
    expect(result.entries).toHaveLength(0)
    expect(result.totalKnownOut).toBe(4)
  })

  it('uses max(plays+inked, discarded) to avoid double-counting', () => {
    // 3 played + 1 inked = 4 seen; discarded = 5 (includes banishment after play)
    const observed = [{ name: 'Elsa', plays: 3, inked: 1, discarded: 5 }]
    const result = inferHand([card('Elsa', 4)], observed, 7, 53)
    // max(4, 5) = 5, capped to 4 → unseen = 0
    expect(result.entries).toHaveLength(0)
  })

  it('sorts entries by probAtLeastOne descending', () => {
    const deck = [card('Elsa', 4), card('Mickey', 1)]
    const result = inferHand(deck, [], 7, 53)
    expect(result.entries[0].probAtLeastOne).toBeGreaterThanOrEqual(result.entries[1].probAtLeastOne)
  })

  it('reports consistency diff when unseen copies differ from totalUnseen', () => {
    // Deck of 4 cards, hand=3, deck=5 → totalUnseen=8; inferredUnseen=4 → diff=-4
    const result = inferHand([card('Elsa', 4)], [], 3, 5)
    expect(result.consistency.actualUnseen).toBe(8)
    expect(result.consistency.inferredUnseen).toBe(4)
    expect(result.consistency.diff).toBe(-4)
  })

  it('handles hand being full pool (certainty)', () => {
    // 4-of, hand=4, deck=0 → totalUnseen=4 = handSize → P=1
    const result = inferHand([card('Elsa', 4)], [], 4, 0)
    expect(result.entries[0].probAtLeastOne).toBe(1)
  })
})
