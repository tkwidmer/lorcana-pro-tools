import { resolveColors, matchupKey } from './inkColors'

// Aggregates parsed gamelogs into a per-opponent directory: overall record,
// one bucket per ink-color combination we've seen them play, and — within
// each bucket — every card we directly observed them play/ink/discard/lose,
// summed across games. Only publicly-visible zone changes are counted; we
// never surface anything about the opponent's hand or unrevealed draws.
export function buildDirectory(games) {
  const opponents = new Map()

  for (const game of games) {
    const myPlayerNum = game.myPlayerNum
    if (myPlayerNum == null) continue
    const oppNum = myPlayerNum === 1 ? 2 : 1
    const rawName = oppNum === 1 ? game.p1Name : game.p2Name
    const name = rawName?.trim()
    if (!name || /^Player [12]$/.test(name)) continue

    const colors = resolveColors(game.oppInkCombo)
    const deckKey = matchupKey(game.oppInkCombo)
    const cardList = (oppNum === 1 ? game.p1?.cardList : game.p2?.cardList) ?? []
    const won = game.winner === String(myPlayerNum) || game.winner === myPlayerNum

    if (!opponents.has(name)) {
      opponents.set(name, { name, gameCount: 0, wins: 0, losses: 0, decks: new Map(), lastPlayed: 0 })
    }
    const opp = opponents.get(name)
    opp.gameCount += 1
    if (won) opp.wins += 1
    else opp.losses += 1
    if (game.playedAt && game.playedAt > opp.lastPlayed) opp.lastPlayed = game.playedAt

    if (!opp.decks.has(deckKey)) {
      opp.decks.set(deckKey, { key: deckKey, colors, gameCount: 0, wins: 0, losses: 0, cards: new Map() })
    }
    const deck = opp.decks.get(deckKey)
    deck.gameCount += 1
    if (won) deck.wins += 1
    else deck.losses += 1

    for (const c of cardList) {
      const played = c.played || 0
      const inked = c.inked || 0
      const discarded = c.discarded || 0
      const destroyed = c.destroyed || 0
      if (played + inked + discarded + destroyed === 0) continue

      if (!deck.cards.has(c.name)) {
        deck.cards.set(c.name, { name: c.name, played: 0, inked: 0, discarded: 0, destroyed: 0, seenIn: 0 })
      }
      const stat = deck.cards.get(c.name)
      stat.played += played
      stat.inked += inked
      stat.discarded += discarded
      stat.destroyed += destroyed
      stat.seenIn += 1
    }
  }

  return Array.from(opponents.values())
    .map(o => {
      const decks = Array.from(o.decks.values())
        .map(d => ({
          ...d,
          winRate: d.gameCount ? (d.wins / d.gameCount) * 100 : 0,
          cards: Array.from(d.cards.values()).sort(
            (a, b) => b.played + b.inked + b.discarded + b.destroyed - (a.played + a.inked + a.discarded + a.destroyed)
          ),
        }))
        .sort((a, b) => b.gameCount - a.gameCount)

      return {
        ...o,
        winRate: o.gameCount ? (o.wins / o.gameCount) * 100 : 0,
        decks,
        allColors: Array.from(new Set(decks.flatMap(d => d.colors))),
      }
    })
    .sort((a, b) => b.gameCount - a.gameCount)
}
