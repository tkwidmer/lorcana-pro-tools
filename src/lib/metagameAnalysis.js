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
