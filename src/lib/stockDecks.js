// Stock deck lists: a starting list for each archetype people actually play,
// built from duels.ink's /api/stats/meta (see archetypeStats.js for the shape).

import { aggregateArchetypes, metaShare, representativeProfile } from './metaSynthesis'

// Each folder pins one duels.ink queue + card-set era, so a folder keeps
// showing that set's lists after the next set ships. Add a folder per set
// or meta.
export const STOCK_DECK_FOLDERS = [
  { id: 'set-14-core', title: 'Set 14 Hyperia City · Core Constructed', queue: 'core-bo1', era: 'set-14-core' },
  { id: 'set-14-infinity', title: 'Set 14 Hyperia City · Infinity Constructed', queue: 'infinity-bo1', era: 'set-14-infinity' },
]

// One list per named archetype: the card centroid duels.ink computed for
// its most-played build variant (`centroidCounts`, cardId → copies). Grouped
// by ink pair; pairs and the archetypes within them sorted by games played.
export function buildStockDecks(stats) {
  const totalGames = stats.activity.totalGames
  const pairs = new Map()
  for (const archetype of aggregateArchetypes(stats.profiles)) {
    const build = representativeProfile(stats, archetype.key)
    const cards = Object.entries(build.centroidCounts).map(([cardId, count]) => ({ cardId, count }))
    const deck = {
      key: archetype.key,
      name: archetype.archetypeName,
      gamesPlayed: archetype.gamesPlayed,
      winRate: archetype.winRate,
      metaShare: metaShare(archetype.gamesPlayed, totalGames),
      cards,
      totalCards: cards.reduce((sum, c) => sum + c.count, 0),
    }
    const colors = [...archetype.colors].sort()
    const pairKey = colors.join('/')
    const pair = pairs.get(pairKey) ?? { key: pairKey, colors, gamesPlayed: 0, decks: [] }
    pair.gamesPlayed += deck.gamesPlayed
    pair.decks.push(deck)
    pairs.set(pairKey, pair)
  }
  const byGames = (a, b) => b.gamesPlayed - a.gamesPlayed
  return [...pairs.values()]
    .map(pair => ({ ...pair, decks: pair.decks.sort(byGames) }))
    .sort(byGames)
}
