// Per-game enrichment and cross-game aggregation for AnalyticsPage's personal
// analysis views (win rate breakdowns, card stats, mulligan stats, leak
// detection, single-game drilldown). These need "my side" of the game
// resolved even for older gamelogs imported before myPlayerNum was reliably
// stored.

const REPLAY_ID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

export function replayViewerUrl(replayUrl) {
  if (!replayUrl) return null
  const match = replayUrl.match(REPLAY_ID_RE)
  return match ? `https://duels.ink/replay/${match[1]}` : replayUrl
}

export function getMyPlayerNum(gamelog, myName) {
  if (!myName?.trim()) return null
  const n = myName.trim().toLowerCase()
  if (gamelog.p1Name?.toLowerCase() === n) return 1
  if (gamelog.p2Name?.toLowerCase() === n) return 2
  if (gamelog.p1Name?.toLowerCase().includes(n)) return 1
  if (gamelog.p2Name?.toLowerCase().includes(n)) return 2
  return null
}

export function enrichGame(gamelog, myName) {
  const myPlayerNum = gamelog.myPlayerNum ?? getMyPlayerNum(gamelog, myName)
  if (!myPlayerNum) return null

  const myP = myPlayerNum === 1 ? gamelog.p1 : gamelog.p2
  const opponentName = myPlayerNum === 1 ? gamelog.p2Name : gamelog.p1Name
  const won = gamelog.winner === myPlayerNum || gamelog.winner === String(myPlayerNum)

  const myCards = {}
  for (const [name, card] of Object.entries(myP.cards ?? {})) {
    myCards[name] = {
      fullName: name,
      name,
      id: card.id,
      playedCount: card.played ?? 0,
      inkedCount: card.inked ?? 0,
      loreGained: card.loreGained ?? 0,
      effectDraws: card.effectDraws ?? 0,
      oppForcedDiscards: card.oppForcedDiscards ?? 0,
      extraInks: card.extraInks ?? 0,
      effectRemovals: card.effectRemovals ?? 0,
      exerts: card.exerts ?? 0,
      cardsRecovered: card.cardsRecovered ?? 0,
      sings: card.sings ?? 0,
      oppRestrictions: card.oppRestrictions ?? 0,
      statModifiers: card.statModifiers ?? 0,
      oppLoreLoss: card.oppLoreLoss ?? 0,
      damageHealed: card.damageHealed ?? 0,
      infoGained: card.infoGained ?? 0,
    }
  }

  const challenges = (gamelog.challenges ?? []).map(c => ({
    ...c,
    isMe: c.player === myPlayerNum,
  }))

  const iWentFirst = gamelog.wentFirst === myPlayerNum

  return {
    ...gamelog,
    myPlayerNum,
    opponentName,
    won,
    wentFirst: iWentFirst,
    victoryReason: gamelog.victoryReason ?? null,
    disconnected: gamelog.disconnected ?? false,
    loreEvents: gamelog.loreEvents ?? [],
    myCards,
    challenges,
    myInkCombo: gamelog.myInkCombo ?? [],
    oppInkCombo: gamelog.oppInkCombo ?? [],
    mulligan: {
      openingHand: (myP.initialHand ?? []).map(c => ({ ...c, fullName: c.name })),
      sentBack: (myP.mulliganSent ?? []).map(c => ({ ...c, fullName: c.name })),
      kept: (myP.mulliganKept ?? []).map(c => ({ ...c, fullName: c.name })),
      replacements: (myP.mulliganDrawn ?? []).map(c => ({ ...c, fullName: c.name })),
      tookMulligan: (myP.mulliganSent?.length ?? 0) > 0,
      wentFirst: iWentFirst,
    },
  }
}

export function aggregateMyCards(games) {
  const map = {}
  for (const game of games) {
    for (const card of Object.values(game.myCards ?? {})) {
      const key = card.fullName
      if (!map[key]) {
        map[key] = {
          fullName: key, name: key,
          playedCount: 0, inkedCount: 0, loreGained: 0,
          effectDraws: 0, oppForcedDiscards: 0, extraInks: 0, effectRemovals: 0, exerts: 0, cardsRecovered: 0, sings: 0, oppRestrictions: 0, statModifiers: 0,
          oppLoreLoss: 0, damageHealed: 0, infoGained: 0,
        }
      }
      const m = map[key]
      m.playedCount += card.playedCount
      m.inkedCount += card.inkedCount
      m.loreGained += card.loreGained
      m.effectDraws += card.effectDraws
      m.oppForcedDiscards += card.oppForcedDiscards
      m.extraInks += card.extraInks
      m.effectRemovals += card.effectRemovals
      m.exerts += card.exerts ?? 0
      m.cardsRecovered += card.cardsRecovered ?? 0
      m.sings += card.sings ?? 0
      m.oppRestrictions += card.oppRestrictions ?? 0
      m.statModifiers += card.statModifiers ?? 0
      m.oppLoreLoss += card.oppLoreLoss ?? 0
      m.damageHealed += card.damageHealed ?? 0
      m.infoGained += card.infoGained ?? 0
    }
  }
  return Object.values(map)
}

export function aggregateMulliganSentBack(games) {
  const map = {}
  for (const game of games) {
    const openingHand = game.mulligan?.openingHand ?? []
    const sentBack = game.mulligan?.sentBack ?? []
    const handCounts = {}
    for (const card of openingHand) {
      const key = card.fullName || card.name
      handCounts[key] = { key, count: (handCounts[key]?.count ?? 0) + 1 }
    }
    const sentBackCounts = {}
    for (const card of sentBack) {
      const key = card.fullName || card.name
      sentBackCounts[key] = (sentBackCounts[key] ?? 0) + 1
    }
    for (const [key, { count: inHand }] of Object.entries(handCounts)) {
      if (!map[key]) map[key] = { fullName: key, sentBackCount: 0, keptCount: 0, openingHandCount: 0 }
      map[key].openingHandCount++
      if ((sentBackCounts[key] ?? 0) >= inHand) map[key].sentBackCount++
      else map[key].keptCount++
    }
  }
  return Object.values(map)
}

// Cross-tabs each card's mulligan-keep status (kept in opening hand vs sent to bottom)
// against the game outcome, so we can compare win rate when a card is kept vs mulliganed.
// Counts games, not copies: a game where 2 copies of a card were kept counts once
// toward "kept" (not twice), and a game where one copy was kept while another copy
// of the same card was sent back counts once toward each side — genuinely mixed
// evidence, not double-counted evidence.
export function aggregateMulliganWinRates(games) {
  const map = {}
  const bump = (key, status, won) => {
    if (!map[key]) map[key] = { fullName: key, keptWins: 0, keptLosses: 0, sentWins: 0, sentLosses: 0 }
    if (status === 'kept') won ? map[key].keptWins++ : map[key].keptLosses++
    else won ? map[key].sentWins++ : map[key].sentLosses++
  }
  for (const game of games) {
    const kept = game.mulligan?.kept ?? []
    const sentBack = game.mulligan?.sentBack ?? []
    const keptNames = new Set(kept.map(c => c.fullName || c.name))
    const sentNames = new Set(sentBack.map(c => c.fullName || c.name))
    for (const name of keptNames) bump(name, 'kept', game.won)
    for (const name of sentNames) bump(name, 'sent', game.won)
  }
  return Object.values(map)
}

// For games where 2+ copies of a card were in the opening hand, breaks down what
// happened to them: kept all, split (kept some/sent some), or sent all back — each
// with its own win count, so multi-copy mulligan decisions can be compared by outcome.
export function aggregateMultiCopyMulligan(games) {
  const map = {}
  for (const game of games) {
    const openingHand = game.mulligan?.openingHand ?? []
    const sentBack = game.mulligan?.sentBack ?? []
    const handCounts = {}
    for (const card of openingHand) {
      const key = card.fullName || card.name
      handCounts[key] = (handCounts[key] ?? 0) + 1
    }
    const sentCounts = {}
    for (const card of sentBack) {
      const key = card.fullName || card.name
      sentCounts[key] = (sentCounts[key] ?? 0) + 1
    }
    for (const [key, inHand] of Object.entries(handCounts)) {
      if (inHand < 2) continue
      if (!map[key]) {
        map[key] = {
          fullName: key, games: 0,
          keptAll: 0, keptAllWins: 0,
          split: 0, splitWins: 0,
          sentAll: 0, sentAllWins: 0,
        }
      }
      const sent = sentCounts[key] ?? 0
      const bucket = sent === 0 ? 'keptAll' : sent === inHand ? 'sentAll' : 'split'
      map[key].games++
      map[key][bucket]++
      if (game.won) map[key][`${bucket}Wins`]++
    }
  }
  return Object.values(map)
}

