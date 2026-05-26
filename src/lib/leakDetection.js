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
// Finishing a game holding this many cards is flagged as stranded resources.
const STRANDED_HAND_MIN = 4

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
  idle_turn: {
    label: 'Passive turns',
    blurb: 'You ended a turn without inking, playing, questing, or challenging — while still holding cards. A wasted turn is a wasted tempo cycle.',
    tip: 'Every turn should do something: ink, develop the board, quest, or challenge. If you held cards and did nothing, look for the play you skipped.',
  },
  stranded_cards: {
    label: 'Stranded cards',
    blurb: 'You finished the game holding a large hand. Cards stuck in hand are resources you paid to draw but never converted into board, lore, or removal.',
    tip: 'If you keep ending games with a full hand, you may be inking too aggressively, over-drawing, or missing windows to deploy threats. Spend your cards.',
  },
}

// Reconstruct each player's hand size over the course of the game from the raw
// event stream. Only used when raw logs were stored. Returns hand size at the
// start of each turn and the final hand size, per player.
function reconstructHands(logs) {
  const hand = { 1: 0, 2: 0 }
  const handAtTurnStart = {} // turnNumber -> { 1, 2 }
  const normHand = (p) => { if (hand[p] < 0) hand[p] = 0 }

  for (const e of logs) {
    const p = normP(e.player)
    const d = e.data ?? {}
    const t = e.turnNumber ?? 0

    // Capture each player's hand size at the start of their own turn. turnNumber
    // is shared across both players in a round, so set per-player slots without
    // clobbering the other player's earlier snapshot for the same round.
    if (e.type === 'TURN_START' && t > 0 && p) {
      if (!handAtTurnStart[t]) handAtTurnStart[t] = {}
      handAtTurnStart[t][p] = hand[p]
    }
    if (!p) continue

    switch (e.type) {
      case 'INITIAL_HAND':
        hand[p] = (d.initialHandCards ?? []).filter(c => c?.name).length || hand[p]
        break
      case 'MULLIGAN': {
        const sent = (d.mulliganedCards ?? []).length
        const drawn = (d.drawnCards ?? []).length
        hand[p] = hand[p] - sent + drawn
        break
      }
      case 'CARD_DRAWN':
        hand[p]++
        break
      case 'CARD_RETURNED': // bounced from field back to hand
        hand[p]++
        break
      case 'CARD_LOOKED_AT': // tutor/dig that puts the card into hand
        if (d.revealDestination === 'hand') hand[p]++
        break
      case 'CARD_PLAYED':
      case 'CARD_INKED':
      case 'CARD_DISCARDED':
        hand[p]--
        break
      case 'CARD_PUT_INTO_INKWELL':
        if (d.fromZone === 'hand') hand[p]-- // effect-based ink from hand
        break
      default:
        break
    }
    normHand(p)
  }

  return { handAtTurnStart, finalHand: { ...hand } }
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

  // Hand reconstruction (only when raw logs were stored) sharpens detection by
  // telling us whether you actually held cards on a passive/no-ink turn.
  const hasRawLogs = Array.isArray(game._rawLogs) && game._rawLogs.length > 0
  const hands = hasRawLogs ? reconstructHands(game._rawLogs) : null
  const handAtStart = (t) => hands?.handAtTurnStart?.[t]?.[me]

  // Turns on which you challenged at least once (for passive-turn detection)
  const attackedOnTurn = new Set(myChallenges.map(c => c.turn))

  if (myTurns.length > 0) {
    const lastTurn = Math.max(...myTurns.map(t => t.turn))

    // Missed early ink drops. With hand data we only count turns where you
    // demonstrably held cards (>=2), which removes most false positives.
    const earlyTurns = myTurns.slice(0, EARLY_INK_WINDOW)
    const missed = earlyTurns.filter(t => {
      if (t.inked !== 0) return false
      if (hands) { const h = handAtStart(t.turn); return h == null || h >= 2 }
      return true
    })
    if (missed.length > 0) {
      leaks.push({
        type: 'missed_ink',
        count: missed.length,
        severity: missed.length >= 3 ? 'high' : missed.length >= 2 ? 'medium' : 'low',
        instances: missed.map(t => {
          const h = handAtStart(t.turn)
          return { turn: t.turn, text: `No ink drop on turn ${t.turn}${h != null ? ` (held ${h} card${h !== 1 ? 's' : ''})` : ''}` }
        }),
      })
    }

    // Passive turns — did nothing while holding cards (requires hand data)
    if (hands) {
      const idle = myTurns.filter(t => {
        if (t.turn === lastTurn) return false // game often ends/concedes here
        if (t.inked > 0 || t.plays > 0 || t.lore > 0 || attackedOnTurn.has(t.turn)) return false
        const h = handAtStart(t.turn)
        return h != null && h > 0
      })
      if (idle.length > 0) {
        leaks.push({
          type: 'idle_turn',
          count: idle.length,
          severity: idle.length >= 3 ? 'high' : idle.length >= 2 ? 'medium' : 'low',
          instances: idle.map(t => {
            const h = handAtStart(t.turn)
            return { turn: t.turn, text: `Turn ${t.turn}: no ink, play, quest, or challenge (held ${h} card${h !== 1 ? 's' : ''})` }
          }),
        })
      }
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

  // Stranded cards — finished the game holding a big hand (requires hand data)
  if (hands) {
    const finalHand = hands.finalHand[me] ?? 0
    if (finalHand >= STRANDED_HAND_MIN) {
      leaks.push({
        type: 'stranded_cards',
        count: finalHand,
        severity: finalHand >= 7 ? 'high' : finalHand >= 5 ? 'medium' : 'low',
        instances: [{ turn: null, text: `Ended the game holding ${finalHand} cards` }],
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
