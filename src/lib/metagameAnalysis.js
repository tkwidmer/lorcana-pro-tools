export function analyzeOpponentMetagame(games) {
  const deckStats = {}

  for (const game of games) {
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

    const gameWinner = game.winner === String(game.myPlayerNum) || game.winner === game.myPlayerNum
    if (gameWinner) {
      stats.wins += 1
    } else {
      stats.losses += 1
    }
  }

  const totalGames = games.length
  const results = Object.values(deckStats)
    .map(stats => ({
      ...stats,
      percentage: totalGames > 0 ? (stats.gameCount / totalGames * 100).toFixed(1) : 0,
      winRate: stats.gameCount > 0 ? (stats.wins / stats.gameCount * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.gameCount - a.gameCount)

  return results
}
