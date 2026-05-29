import { describe, it, expect } from 'vitest'
import { computeStats } from '../gameStats'

const makeGame = (overrides = {}) => ({
  winner: 1,
  currentTurn: 10,
  p1InkColors: ['ruby'],
  p2InkColors: ['sapphire'],
  p1ObservedDeck: [],
  p2ObservedDeck: [],
  log: [],
  ...overrides,
})

const makeRecord = (gameOverrides = {}) => ({ game: makeGame(gameOverrides) })

describe('computeStats - totals', () => {
  it('returns zero stats for empty input', () => {
    const stats = computeStats([])
    expect(stats.totalGames).toBe(0)
    expect(stats.completedGames).toBe(0)
    expect(stats.avgTurns).toBe(0)
  })

  it('counts total vs completed games', () => {
    const records = [
      makeRecord({ winner: 1 }),
      makeRecord({ winner: 2 }),
      makeRecord({ winner: null }),
    ]
    const stats = computeStats(records)
    expect(stats.totalGames).toBe(3)
    expect(stats.completedGames).toBe(2)
  })

  it('computes average turns from completed games only', () => {
    const records = [
      makeRecord({ winner: 1, currentTurn: 10 }),
      makeRecord({ winner: 2, currentTurn: 20 }),
      makeRecord({ winner: null, currentTurn: 5 }), // should not count
    ]
    const stats = computeStats(records)
    expect(stats.avgTurns).toBe(15)
  })
})

describe('computeStats - card plays', () => {
  it('aggregates card plays across both decks', () => {
    const records = [
      makeRecord({
        p1ObservedDeck: [{ name: 'Elsa', plays: 3 }],
        p2ObservedDeck: [{ name: 'Elsa', plays: 1 }, { name: 'Mickey', plays: 2 }],
      }),
    ]
    const stats = computeStats(records)
    const elsa = stats.mostPlayedCards.find(c => c.name === 'Elsa')
    const mickey = stats.mostPlayedCards.find(c => c.name === 'Mickey')
    expect(elsa?.plays).toBe(4)
    expect(mickey?.plays).toBe(2)
  })

  it('returns at most 20 entries in mostPlayedCards', () => {
    const deck = Array.from({ length: 25 }, (_, i) => ({ name: `Card${i}`, plays: i + 1 }))
    const records = [makeRecord({ p1ObservedDeck: deck })]
    const stats = computeStats(records)
    expect(stats.mostPlayedCards).toHaveLength(20)
  })

  it('sorts most played cards descending', () => {
    const records = [
      makeRecord({
        p1ObservedDeck: [{ name: 'A', plays: 1 }, { name: 'B', plays: 5 }],
      }),
    ]
    const stats = computeStats(records)
    expect(stats.mostPlayedCards[0].plays).toBeGreaterThanOrEqual(stats.mostPlayedCards[1].plays)
  })
})

describe('computeStats - matchups', () => {
  it('builds matchup list with win counts', () => {
    const records = [
      makeRecord({ winner: 1, p1InkColors: ['ruby'], p2InkColors: ['sapphire'] }),
      makeRecord({ winner: 1, p1InkColors: ['ruby'], p2InkColors: ['sapphire'] }),
      makeRecord({ winner: 2, p1InkColors: ['ruby'], p2InkColors: ['sapphire'] }),
    ]
    const stats = computeStats(records)
    expect(stats.matchupList).toHaveLength(1)
    const mu = stats.matchupList[0]
    expect(mu.games).toBe(3)
    expect(mu.p1Wins + mu.p2Wins).toBe(3)
  })

  it('deduplicates matchup keys symmetrically', () => {
    const records = [
      makeRecord({ winner: 1, p1InkColors: ['amber'], p2InkColors: ['emerald'] }),
      makeRecord({ winner: 2, p1InkColors: ['emerald'], p2InkColors: ['amber'] }),
    ]
    const stats = computeStats(records)
    // Both games are "amber vs emerald" (sorted)
    expect(stats.matchupList).toHaveLength(1)
    expect(stats.matchupList[0].games).toBe(2)
  })
})

describe('computeStats - ink color stats', () => {
  it('computes win rates per ink color', () => {
    const records = [
      makeRecord({ winner: 1, p1InkColors: ['ruby'], p2InkColors: ['sapphire'] }),
      makeRecord({ winner: 2, p1InkColors: ['ruby'], p2InkColors: ['sapphire'] }),
    ]
    const stats = computeStats(records)
    const ruby = stats.inkColorStats.find(c => c.color === 'ruby')
    const sapphire = stats.inkColorStats.find(c => c.color === 'sapphire')
    // Ruby appears in 2 games, wins 1 → 50%
    expect(ruby?.games).toBe(2)
    expect(ruby?.wins).toBe(1)
    expect(ruby?.winRate).toBeCloseTo(0.5)
    // Sapphire appears in 2 games, wins 1 → 50%
    expect(sapphire?.winRate).toBeCloseTo(0.5)
  })
})

describe('computeStats - ink by turn', () => {
  it('computes avg ink across games with inking logs', () => {
    const log1 = [
      { type: 'CARD_INKED', player: 1, turnNumber: 1 },
      { type: 'CARD_INKED', player: 1, turnNumber: 2 },
    ]
    const records = [makeRecord({ log: log1, currentTurn: 3 })]
    const stats = computeStats(records)
    // Turn 1 for player 1: cumulative ink = 1
    // Turn 2 for player 1: cumulative ink = 2
    expect(stats.avgInkByTurn.some(t => t.turn === 1)).toBe(true)
    expect(stats.avgInkByTurn.some(t => t.turn === 2)).toBe(true)
  })
})
