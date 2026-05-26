// Leak / mistake detection from parsed gamelogs.
//
// "Leaks" are recurring, costly tendencies — not certain mistakes. They're
// inferred from log data without full hand/board knowledge, so each finding is
// framed as something to review, not a definitive error. Detectors are kept
// conservative to avoid eroding trust with false positives.

const normP = (p) => (p === 1 || p === '1' ? 1 : p === 2 || p === '2' ? 2 : null)

// How many of your opening turns we expect an ink drop on. Inking every turn
// early is almost always correct; we cap the window so late-game intentional
// non-inks (full board, low hand) aren't penalized.
const EARLY_INK_WINDOW = 6
// A lore drought of this many consecutive active turns with zero lore is flagged.
const DROUGHT_MIN = 3

export const LEAK_TYPES = {
  bad_challenge: {
    label: 'Unfavorable challenges',
    blurb: 'You challenged into a trade where your character was banished but the defender survived — lost a card and a tempo for nothing.',
    tip: 'Before challenging, check the defender\'s willpower vs your strength and your willpower vs theirs. Avoid challenges where you die and they live unless it removes a key threat.',
  },
  missed_ink: {
    label: 'Missed early ink drops',
    blurb: 'You skipped inking on one or more of your first turns. Falling behind on ink slows everything you do for the rest of the game.',
    tip: 'Ink almost every turn through turn 6 unless your hand is dangerously thin. A missed ink drop is one less card you can play later.',
  },
  lore_drought: {
    label: 'Lore droughts',
    blurb: 'You went several consecutive turns gaining no lore. Even in a control plan, long stretches with zero lore often mean missed quest windows.',
    tip: 'Look for turns where a character could have quested safely. Passive turns hand the lore race to your opponent.',
  },
}

// Detect leaks for a single parsed gamelog from "your" perspective.
// Accepts the stored gamelog record (with `turns` and `challenges`) plus your seat.
export function detectLeaks(game, myPlayerNum) {
  const me = normP(myPlayerNum)
  const leaks = []
  if (!me) return { myPlayerNum: null, won: false, leaks }

  const won = game.winner === me || game.winner === String(me)

  // --- Unfavorable challenges ---
  const myChallenges = (game.challenges ?? []).filter(c => normP(c.player) === me && c.attackerName)
  const badChallenges = myChallenges.filter(c => c.attackerBanished && !c.defenderBanished)
  if (badChallenges.length > 0) {
    leaks.push({
      type: 'bad_challenge',
      count: badChallenges.length,
      severity: badChallenges.length >= 2 ? 'high' : 'medium',
      instances: badChallenges.map(c => ({
        turn: c.turn,
        text: `${c.attackerName} → ${c.defenderName ?? '?'} (yours banished, theirs survived)`,
      })),
    })
  }

  // --- Tempo-based leaks (need per-turn data) ---
  const myTurns = (game.turns ?? []).filter(t => t.owner === me).sort((a, b) => a.turn - b.turn)

  if (myTurns.length > 0) {
    // Missed early ink drops
    const earlyTurns = myTurns.slice(0, EARLY_INK_WINDOW)
    const missed = earlyTurns.filter(t => t.inked === 0)
    if (missed.length > 0) {
      leaks.push({
        type: 'missed_ink',
        count: missed.length,
        severity: missed.length >= 3 ? 'high' : missed.length >= 2 ? 'medium' : 'low',
        instances: missed.map(t => ({ turn: t.turn, text: `No ink drop on turn ${t.turn}` })),
      })
    }

    // Lore droughts — longest run of active turns (after your first) with no lore
    let longest = 0, longestStart = null, longestEnd = null, cur = 0, curStart = null
    for (let i = 1; i < myTurns.length; i++) {
      const t = myTurns[i]
      if (t.lore === 0) {
        if (cur === 0) curStart = t.turn
        cur++
        if (cur > longest) { longest = cur; longestStart = curStart; longestEnd = t.turn }
      } else {
        cur = 0
      }
    }
    if (longest >= DROUGHT_MIN) {
      leaks.push({
        type: 'lore_drought',
        count: longest,
        severity: longest >= 5 ? 'high' : longest >= 4 ? 'medium' : 'low',
        instances: [{ turn: longestStart, text: `${longest} turns with no lore (turns ${longestStart}–${longestEnd})` }],
      })
    }
  }

  return { myPlayerNum: me, won, leaks }
}

// Aggregate leaks across many games into a ranked report.
export function summarizeLeaks(games) {
  // games: array of { game, myPlayerNum } or enriched games carrying myPlayerNum
  const perType = {}
  let analyzed = 0

  const results = []
  for (const g of games) {
    const myNum = g.myPlayerNum
    if (!myNum) continue
    analyzed++
    const res = detectLeaks(g, myNum)
    results.push({ game: g, res })

    const seen = new Set()
    for (const leak of res.leaks) {
      if (!perType[leak.type]) {
        perType[leak.type] = { type: leak.type, gamesAffected: 0, totalCount: 0, lossesWhenPresent: 0, winsWhenPresent: 0 }
      }
      const agg = perType[leak.type]
      agg.totalCount += leak.count
      if (!seen.has(leak.type)) {
        seen.add(leak.type)
        agg.gamesAffected++
        if (res.won) agg.winsWhenPresent++
        else agg.lossesWhenPresent++
      }
    }
  }

  const overallWinRate = analyzed > 0
    ? results.filter(r => r.res.won).length / analyzed
    : 0

  const ranked = Object.values(perType).map(agg => {
    const gamesWith = agg.winsWhenPresent + agg.lossesWhenPresent
    const winRateWhenPresent = gamesWith > 0 ? agg.winsWhenPresent / gamesWith : null
    // Impact heuristic: how often it shows up × how much worse you do when it does.
    const winRateDelta = winRateWhenPresent != null ? overallWinRate - winRateWhenPresent : 0
    const frequency = analyzed > 0 ? agg.gamesAffected / analyzed : 0
    const impact = frequency * (1 + Math.max(0, winRateDelta) * 3)
    return { ...agg, winRateWhenPresent, winRateDelta, frequency, impact }
  }).sort((a, b) => b.impact - a.impact)

  return { analyzed, overallWinRate, ranked, results }
}
