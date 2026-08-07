const MIN_SAMPLE = 5

// Finds the duels.ink deck version (from /api/account/personal-stats) whose recorded
// timeframe(s) cover this game's playedAt timestamp, if any.
function findDeckVersion(deckVersions, playedAt) {
  if (!deckVersions?.length || !playedAt) return null
  for (const version of deckVersions) {
    for (const tf of version.timeframes ?? []) {
      const from = new Date(tf.from).getTime()
      const to = new Date(tf.to).getTime()
      if (playedAt >= from && playedAt <= to) return version
    }
  }
  return null
}

// "Wins above replacement" for cards: for each card seen in your games, compare your
// win rate in games where it was drawn/played/inked against your win rate in games
// where it wasn't. The "replacement" is the deck's own baseline (games without the
// card), so this is scoped to a single deck's games to be meaningful — mixing decks
// conflates deck strength with card strength.
//
// A game where the card wasn't seen is ambiguous: it might have been in the 60 and
// just never drawn, or the list might have been edited to cut it entirely (decks
// evolve over time even under one deck_id/fingerprint bucket). We only count a miss
// against the "without" baseline when we can confirm the card was actually in the
// deck that game — preferably from duels.ink's own deck-version history
// (`deckVersions`, matched to the game by its playedAt timestamp falling in a
// version's recorded timeframe), falling back to that game's own recorded decklist
// (`yourDecklist`, present for games imported from Match History or a team export)
// when no version data is available. Games where deck membership can't be confirmed
// either way, or where it's confirmed absent, are excluded from both buckets.
export function computeCardImpact(games, { deckVersions } = {}) {
  const eligible = games.filter(g => g.myPlayerNum != null && g.winner != null)

  const allNames = new Set()
  const cardIdByName = {}
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
        if (c.id && !cardIdByName[c.name]) cardIdByName[c.name] = c.id
      }
    }
    const version = findDeckVersion(deckVersions, g.playedAt)
    const deckIds = version
      ? new Set(version.cardIds)
      : g.yourDecklist?.length
        ? new Set(g.yourDecklist.filter(d => (d.count ?? 1) > 0).map(d => d.cardId))
        : null
    perGame.push({ won, seen, deckIds })
  }

  const cardStats = {}
  for (const name of allNames) {
    cardStats[name] = { gamesWith: 0, winsWith: 0, gamesWithout: 0, winsWithout: 0, gamesNotInDeck: 0, gamesUnknown: 0 }
  }
  for (const { won, seen, deckIds } of perGame) {
    for (const name of allNames) {
      const s = cardStats[name]
      if (seen.has(name)) {
        s.gamesWith++
        if (won) s.winsWith++
        continue
      }
      const cardId = cardIdByName[name]
      if (!deckIds || !cardId) {
        s.gamesUnknown++
      } else if (deckIds.has(cardId)) {
        s.gamesWithout++
        if (won) s.winsWithout++
      } else {
        s.gamesNotInDeck++
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
