export function cardFrequencyByArchetype(games) {
  const archetypes = {}

  for (const game of games) {
    if (game.myPlayerNum == null) continue
    const colors = (game.oppInkCombo ?? []).sort().join('/')
    if (!colors || !game.oppDecklist?.length) continue

    if (!archetypes[colors]) {
      archetypes[colors] = {
        colors: game.oppInkCombo ?? [],
        colorString: colors,
        gamesWithDecklist: 0,
        cardStats: {},
      }
    }

    const arch = archetypes[colors]
    arch.gamesWithDecklist += 1

    for (const { cardId, count } of game.oppDecklist) {
      const normalizedId = cardId.replace(/\s/g, '')
      if (!arch.cardStats[normalizedId]) {
        arch.cardStats[normalizedId] = { gamesWithCard: 0, totalCopies: 0 }
      }
      arch.cardStats[normalizedId].gamesWithCard += 1
      arch.cardStats[normalizedId].totalCopies += count
    }
  }

  return Object.values(archetypes).map(arch => ({
    colorString: arch.colorString,
    colors: arch.colors,
    gamesWithDecklist: arch.gamesWithDecklist,
    cards: Object.entries(arch.cardStats)
      .map(([cardId, stats]) => ({
        cardId,
        gamesWithCard: stats.gamesWithCard,
        avgCopies: stats.totalCopies / arch.gamesWithDecklist,
      }))
      .sort((a, b) => b.gamesWithCard - a.gamesWithCard || b.avgCopies - a.avgCopies),
  }))
}

export function analyzeOpponentMetagame(games) {
  const deckStats = {}
  let processedGameCount = 0

  for (const game of games) {
    // Skip games without myPlayerNum - can't determine if user won/lost
    const myPlayerNum = game.myPlayerNum
    if (myPlayerNum == null) continue

    const colors = (game.oppInkCombo ?? []).sort().join('/')
    if (!colors) continue

    if (!deckStats[colors]) {
      deckStats[colors] = {
        colors: game.oppInkCombo ?? [],
        colorString: colors,
        gameCount: 0,
        wins: 0,
        losses: 0,
      }
    }

    const stats = deckStats[colors]
    stats.gameCount += 1
    processedGameCount += 1

    const userWon = game.winner === String(myPlayerNum) || game.winner === myPlayerNum
    if (userWon) {
      stats.wins += 1
    } else {
      stats.losses += 1
    }
  }

  const results = Object.values(deckStats)
    .map(stats => ({
      ...stats,
      percentage: processedGameCount > 0 ? (stats.gameCount / processedGameCount * 100).toFixed(1) : 0,
      winRate: stats.gameCount > 0 ? (stats.wins / stats.gameCount * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.gameCount - a.gameCount)

  return results
}
