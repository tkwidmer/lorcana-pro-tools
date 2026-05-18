import { matchupKey, resolveColors } from './inkColors'

export function computeStats(records) {
  const games = records.map(r => r.game)
  const completed = games.filter(g => g.winner != null)

  const totalGames = games.length
  const completedGames = completed.length
  const avgTurns = completed.length
    ? completed.reduce((a, g) => a + (g.currentTurn ?? 0), 0) / completed.length
    : 0

  const cardPlays = {}
  for (const g of games) {
    for (const side of ['p1ObservedDeck', 'p2ObservedDeck']) {
      for (const card of (g[side] ?? [])) {
        if (!card.name) continue
        cardPlays[card.name] = (cardPlays[card.name] ?? 0) + (card.plays ?? 0)
      }
    }
  }
  const mostPlayedCards = Object.entries(cardPlays)
    .map(([name, plays]) => ({ name, plays }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 20)

  // Per-turn average ink count across games that reached that turn
  const inkByTurn = {} // turn -> { total, count }
  for (const g of games) {
    const inkedByTurn = {} // player -> turn -> cumulative
    for (const l of (g.log ?? [])) {
      if (l.type !== 'CARD_INKED') continue
      const t = l.turnNumber ?? 0
      const p = l.player
      if (!inkedByTurn[p]) inkedByTurn[p] = {}
      inkedByTurn[p][t] = (inkedByTurn[p][t] ?? 0) + 1
    }
    const maxTurn = g.currentTurn ?? 0
    for (let t = 1; t <= Math.min(maxTurn, 12); t++) {
      let totalInk = 0, players = 0
      for (const p of [1, '1', 2, '2']) {
        if (!inkedByTurn[p]) continue
        let cum = 0
        for (const [turn, n] of Object.entries(inkedByTurn[p])) {
          if (parseInt(turn) <= t) cum += n
        }
        totalInk += cum
        players++
      }
      if (players > 0) {
        if (!inkByTurn[t]) inkByTurn[t] = { total: 0, count: 0 }
        inkByTurn[t].total += totalInk / players
        inkByTurn[t].count++
      }
    }
  }
  const avgInkByTurn = Object.entries(inkByTurn)
    .map(([turn, { total, count }]) => ({ turn: parseInt(turn), avg: total / count, games: count }))
    .sort((a, b) => a.turn - b.turn)

  const matchups = {}
  for (const g of completed) {
    const p1Key = matchupKey(g.p1InkColors)
    const p2Key = matchupKey(g.p2InkColors)
    const key = [p1Key, p2Key].sort().join(' vs ')
    if (!matchups[key]) matchups[key] = { games: 0, p1Wins: 0, p2Wins: 0, leftKey: null }
    matchups[key].games++
    const winnerColors = g.winner === 1 ? p1Key : p2Key
    if (!matchups[key].leftKey) matchups[key].leftKey = winnerColors
    if (winnerColors === matchups[key].leftKey) matchups[key].p1Wins++
    else matchups[key].p2Wins++
  }
  const matchupList = Object.entries(matchups)
    .map(([key, val]) => ({ key, ...val }))
    .sort((a, b) => b.games - a.games)

  const inkColorPlay = {}
  for (const g of games) {
    for (const c of resolveColors(g.p1InkColors)) inkColorPlay[c] = (inkColorPlay[c] ?? 0) + 1
    for (const c of resolveColors(g.p2InkColors)) inkColorPlay[c] = (inkColorPlay[c] ?? 0) + 1
  }
  const inkColorWins = {}
  for (const g of completed) {
    const winnerColors = g.winner === 1 ? g.p1InkColors : g.p2InkColors
    for (const c of resolveColors(winnerColors)) inkColorWins[c] = (inkColorWins[c] ?? 0) + 1
  }
  const inkColorStats = Array.from(new Set([...Object.keys(inkColorPlay), ...Object.keys(inkColorWins)]))
    .map(color => ({
      color,
      games: inkColorPlay[color] ?? 0,
      wins: inkColorWins[color] ?? 0,
      winRate: inkColorPlay[color] ? (inkColorWins[color] ?? 0) / inkColorPlay[color] : 0,
    }))
    .sort((a, b) => b.games - a.games)

  return {
    totalGames,
    completedGames,
    avgTurns,
    mostPlayedCards,
    avgInkByTurn,
    matchupList,
    inkColorStats,
  }
}
