export function buildWinrateMatrixFromGames(games) {
  // Group games by (myColors, oppColors) pair
  const matchupData = {}
  const colorSet = new Set()

  for (const game of games) {
    const myColors = (game.myInkCombo ?? []).sort()
    const oppColors = (game.oppInkCombo ?? []).sort()

    // Skip games without clear color info
    if (myColors.length === 0 || oppColors.length === 0) continue

    const key = `${JSON.stringify(myColors)}-${JSON.stringify(oppColors)}`

    if (!matchupData[key]) {
      matchupData[key] = {
        colorsA: myColors,
        colorsB: oppColors,
        games: 0,
        winsA: 0,
      }
    }

    matchupData[key].games += 1

    // Check if we won (myPlayerNum matches winner)
    const myPlayerNum = game.myPlayerNum
    const winner = game.winner === String(myPlayerNum) || game.winner === myPlayerNum
    if (winner) {
      matchupData[key].winsA += 1
    }

    // Track all color pairs that appear
    colorSet.add(JSON.stringify(myColors))
    colorSet.add(JSON.stringify(oppColors))
  }

  // Build matchups array with winRate calculation
  const matchups = Object.values(matchupData).map(m => ({
    ...m,
    winRate: m.games > 0 ? (m.winsA / m.games * 100) : 50,
    firstPlayerWinRate: m.games > 0 ? (m.winsA / m.games * 100) : 50,
  }))

  // Build colorPairs array from unique colors seen
  const colorPairsMap = {}
  colorSet.forEach(colorStr => {
    const colors = JSON.parse(colorStr)
    if (colors.length === 2) {
      const key = JSON.stringify(colors)
      if (!colorPairsMap[key]) {
        colorPairsMap[key] = {
          colors,
          wins: 0,
          games: 0,
        }
      }

      // Sum wins and games for this color pair (both as row and column)
      matchups.forEach(m => {
        if (JSON.stringify(m.colorsA) === colorStr) {
          colorPairsMap[key].wins += m.winsA
          colorPairsMap[key].games += m.games
        } else if (JSON.stringify(m.colorsB) === colorStr) {
          colorPairsMap[key].wins += m.games - m.winsA
          colorPairsMap[key].games += m.games
        }
      })
    }
  })

  const colorPairs = Object.values(colorPairsMap).map(cp => ({
    ...cp,
    winRate: cp.games > 0 ? (cp.wins / cp.games * 100) : 50,
  }))

  // Build a matrix structure for win-loss display
  // Rows = player deck colors, Columns = opponent deck colors
  const matrixMap = {}

  matchups.forEach(m => {
    const playerColorKey = JSON.stringify(m.colorsA)
    const oppColorKey = JSON.stringify(m.colorsB)

    if (!matrixMap[playerColorKey]) {
      matrixMap[playerColorKey] = {}
    }

    matrixMap[playerColorKey][oppColorKey] = {
      playerColors: m.colorsA,
      oppColors: m.colorsB,
      wins: m.winsA,
      losses: m.games - m.winsA,
      games: m.games,
    }
  })

  return {
    matchups,
    colorPairs,
    totalGames: games.length,
    winLossMatrix: matrixMap,
  }
}
