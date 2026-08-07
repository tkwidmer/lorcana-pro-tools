const MIN_SAMPLE = 5

// "Wins above replacement" for cards: for each card seen in your games, compare your
// win rate in games where it was drawn/played/inked against your win rate in games
// where it wasn't. The "replacement" is the deck's own baseline (games without the
// card), so this is scoped to a single deck's games to be meaningful — mixing decks
// conflates deck strength with card strength.
export function computeCardImpact(games) {
  const eligible = games.filter(g => g.myPlayerNum != null && g.winner != null)

  const allNames = new Set()
  const perGame = []
  for (const g of eligible) {
    const mySide = g.myPlayerNum === 1 ? g.p1 : g.p2
    if (!mySide?.cardList) continue
    const won = g.winner === g.myPlayerNum || g.winner === String(g.myPlayerNum)
    const seen = new Set()
    for (const c of mySide.cardList) {
      if ((c.drawn ?? 0) > 0 || (c.played ?? 0) > 0 || (c.inked ?? 0) > 0) {
        seen.add(c.name)
        allNames.add(c.name)
      }
    }
    perGame.push({ won, seen })
  }

  const cardStats = {}
  for (const name of allNames) {
    cardStats[name] = { gamesWith: 0, winsWith: 0, gamesWithout: 0, winsWithout: 0 }
  }
  for (const { won, seen } of perGame) {
    for (const name of allNames) {
      const s = cardStats[name]
      if (seen.has(name)) {
        s.gamesWith++
        if (won) s.winsWith++
      } else {
        s.gamesWithout++
        if (won) s.winsWithout++
      }
    }
  }

  const results = Object.entries(cardStats).map(([name, s]) => {
    const winRateWith = s.gamesWith > 0 ? s.winsWith / s.gamesWith : null
    const winRateWithout = s.gamesWithout > 0 ? s.winsWithout / s.gamesWithout : null
    const war = (winRateWith != null && winRateWithout != null)
      ? s.winsWith - winRateWithout * s.gamesWith
      : null
    const delta = (winRateWith != null && winRateWithout != null) ? winRateWith - winRateWithout : null
    return {
      name, ...s, winRateWith, winRateWithout, delta, war,
      lowSample: s.gamesWith < MIN_SAMPLE || s.gamesWithout < MIN_SAMPLE,
    }
  }).sort((a, b) => (b.war ?? -Infinity) - (a.war ?? -Infinity))

  return { results, totalGames: eligible.length }
}
