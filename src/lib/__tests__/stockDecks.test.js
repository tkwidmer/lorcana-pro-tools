import { describe, it, expect } from 'vitest'
import { buildStockDecks } from '../stockDecks'

const profile = (id, colors, archetypeName, gamesPlayed, centroidCounts) => ({
  id, colors, archetypeName, gamesPlayed, wins: gamesPlayed / 2, centroidCounts,
})

describe('buildStockDecks', () => {
  const stats = {
    activity: { totalGames: 100 },
    profiles: [
      profile('a1', ['emerald', 'amber'], 'Circle of Life', 30, { '1-1': 4 }),
      profile('a2', ['amber', 'emerald'], 'Circle of Life', 50, { '1-2': 4, '1-3': 2 }),
      profile('b1', ['amber', 'emerald'], 'Princess Aggro', 20, { '1-4': 4 }),
      profile('c1', ['amber', 'sapphire'], 'Control', 40, { '1-5': 4 }),
      profile('d1', ['amethyst', 'amber'], 'Midrange', 10, { '1-7': 4 }),
      profile('x1', ['ruby', 'steel'], null, 999, { '1-6': 4 }),
    ],
  }

  it('groups archetypes by ink pair, pairs alphabetical, most played first within a pair, skipping unnamed profiles', () => {
    const pairs = buildStockDecks(stats)
    expect(pairs.map(p => [p.key, p.gamesPlayed])).toEqual([['amber/amethyst', 10], ['amber/emerald', 100], ['amber/sapphire', 40]])
    expect(pairs[1].decks.map(d => d.name)).toEqual(['Circle of Life', 'Princess Aggro'])
  })

  it("uses the most-played variant's centroid as the list", () => {
    const deck = buildStockDecks(stats)[1].decks[0]
    expect(deck.cards).toEqual([{ cardId: '1-2', count: 4 }, { cardId: '1-3', count: 2 }])
    expect(deck.totalCards).toBe(6)
    expect(deck.gamesPlayed).toBe(80)
    expect(deck.metaShare).toBe(40)
  })
})
