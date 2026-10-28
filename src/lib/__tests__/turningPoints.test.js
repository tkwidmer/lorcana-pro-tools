import { describe, it, expect } from 'vitest'
import { loreCurve, decisiveRound, aggregateTurningPoints, turningPointSentences } from '../turningPoints'
import { parseGamelog } from '../parseGamelog'
import { wilsonInterval } from '../practiceSim'

// A game from lore totals per round: rounds = [[p1, p2], ...] starting at round 1.
// Only changes become loreEvents, as the parser emits them.
function game(rounds, { winner, me = 1, plays, id = 'g' } = {}) {
  const loreEvents = []
  let prev = [0, 0]
  rounds.forEach((totals, i) => {
    for (const p of [1, 2]) if (totals[p - 1] !== prev[p - 1]) loreEvents.push({ turn: i + 1, player: p, total: totals[p - 1] })
    prev = totals
  })
  return { id, winner, myPlayerNum: me, turnCount: rounds.length, loreEvents, plays }
}

// p2 leads early, p1 takes the lead on round 4 and keeps it.
const leadChange = game([[0, 0], [1, 2], [3, 5], [7, 5], [10, 8], [14, 9], [20, 12]], { winner: 1 })
// p1 quests first on round 2 and is never caught.
const wireToWire = game([[0, 0], [2, 0], [4, 1], [9, 3], [14, 6], [20, 8]], { winner: 1 })

describe('loreCurve', () => {
  it('carries totals forward from round 0', () => {
    const curve = loreCurve({ turnCount: 4, loreEvents: [{ turn: 2, player: 1, total: 3 }, { turn: 2, player: 1, total: 5 }, { turn: 3, player: 2, total: 2 }] })
    expect(curve[1]).toEqual([0, 0, 5, 5, 5])
    expect(curve[2]).toEqual([0, 0, 0, 2, 2])
  })

  it('follows a lore loss down to zero', () => {
    const curve = loreCurve({ turnCount: 3, loreEvents: [{ turn: 1, player: 2, total: 2 }, { turn: 2, player: 2, total: 0 }] })
    expect(curve[2]).toEqual([0, 2, 0, 0])
  })

  it('works on a parsed gamelog', () => {
    const e = (type, player, turnNumber, data) => ({ type, player, turnNumber, data })
    const parsed = parseGamelog('x', [
      e('CARD_QUEST', 1, 1, { cardName: 'Elsa', loreGained: 2, newLoreTotal: 2 }),
      e('CARD_QUEST', 2, 2, { cardName: 'Hades', loreGained: 3, newLoreTotal: 3 }),
      e('TURN_START', 1, 3, {}),
    ])
    expect(loreCurve(parsed)).toEqual({ 1: [0, 2, 2, 2], 2: [0, 0, 3, 3] })
  })
})

describe('decisiveRound', () => {
  it('is the round the winner takes the lead for good after a lead change', () => {
    expect(decisiveRound(leadChange)).toEqual({ round: 4, winnerLead: 2 })
  })

  it('is the round of the first lore in a wire-to-wire game', () => {
    expect(decisiveRound(wireToWire)).toEqual({ round: 2, winnerLead: 2 })
  })

  it('treats a tie as losing the lead', () => {
    const g = game([[2, 0], [2, 2], [5, 2]], { winner: 1 })
    expect(decisiveRound(g).round).toBe(3)
  })

  it('is null without a winner or when the winner did not finish ahead', () => {
    expect(decisiveRound(game([[2, 0]], { winner: null }))).toBeNull()
    expect(decisiveRound(game([[2, 5]], { winner: 1 }))).toBeNull()
  })

  it('reads a string winner', () => {
    expect(decisiveRound({ ...wireToWire, winner: '1' }).round).toBe(2)
  })
})

describe('aggregateTurningPoints', () => {
  // Me = p1. p2 takes the lead for good on round 3, up 6-2.
  const loss = game([[0, 0], [2, 1], [2, 6], [3, 10], [5, 20]], { winner: 2, plays: [
    { turn: 3, player: 1, cardName: 'Elsa' }, { turn: 3, player: 1, cardName: 'Elsa' }, { turn: 3, player: 2, cardName: 'Hades' }, { turn: 2, player: 1, cardName: 'Mickey' },
  ] })
  // A win from 6 down on round 5.
  const comeback = game([[0, 0], [0, 2], [1, 4], [2, 7], [3, 9], [12, 11], [20, 13]], { winner: 1, plays: [{ turn: 6, player: 1, cardName: 'Mickey' }] })

  it('splits decisive rounds by result and averages the loss deficit', () => {
    const s = aggregateTurningPoints([leadChange, wireToWire, loss, loss, comeback])
    expect(s.games).toBe(5)
    expect(s.wins).toBe(3)
    expect(s.decisive.wins).toMatchObject({ n: 3, q1: 2, q3: 6 })
    expect(s.decisive.wins.histogram.slice(0, 6)).toEqual([0, 1, 0, 1, 0, 1])
    expect(s.decisive.losses).toMatchObject({ n: 2, q1: 3, q3: 3, meanDeficit: 4 })
  })

  it('buckets round 12 and later together', () => {
    const rounds = Array.from({ length: 14 }, (_, i) => [0, i < 13 ? 0 : 1])
    const s = aggregateTurningPoints([game(rounds, { winner: 2 })])
    expect(s.decisive.losses.histogram[11]).toBe(1)
  })

  it('counts comebacks from round 3 on and the biggest deficit overcome', () => {
    const s = aggregateTurningPoints([leadChange, wireToWire, comeback])
    expect(s.comebacks).toEqual({ count: 1, biggest: 6 })
    // leadChange trailed by only 2, and a 5-lore deficit on round 2 does not count.
    const early = game([[0, 5], [0, 5], [6, 5], [20, 5]], { winner: 1 })
    expect(aggregateTurningPoints([early]).comebacks).toEqual({ count: 0, biggest: null })
  })

  it('computes the late-deficit win rate with its interval', () => {
    const s = aggregateTurningPoints([loss, comeback, leadChange])
    // After round 5: loss trails 5 v 20, comeback trails 3 v 9 and wins, leadChange leads.
    expect(s.lateDeficit.n).toBe(2)
    expect(s.lateDeficit.wins).toBe(1)
    expect(s.lateDeficit.interval).toEqual(wilsonInterval(1, 2))
  })

  it('counts my cards on the decisive round once per game', () => {
    const s = aggregateTurningPoints([loss, comeback, wireToWire])
    expect(s.decisiveCards.losses).toEqual({ n: 1, cards: [{ name: 'Elsa', count: 1 }] })
    expect(s.decisiveCards.wins).toEqual({ n: 1, cards: [{ name: 'Mickey', count: 1 }] })
  })

  it('leaves out games without a winner', () => {
    expect(aggregateTurningPoints([game([[1, 1]], { winner: null })]).games).toBe(0)
  })

  it('throws on a game with no side resolved', () => {
    expect(() => aggregateTurningPoints([{ ...wireToWire, myPlayerNum: null }])).toThrow()
  })
})

describe('turningPointSentences', () => {
  const games = [
    ...Array.from({ length: 6 }, (_, i) => ({ ...leadChange, id: `w${i}` })),
    ...Array.from({ length: 6 }, (_, i) => game([[0, 0], [2, 1], [2, 6], [3, 10], [5, 14], [6, 20]], { winner: 2, id: `l${i}` })),
  ]

  it('writes the four sentences', () => {
    expect(turningPointSentences(aggregateTurningPoints(games))).toEqual([
      'Your losses are usually decided on round 3. At that point you trail by 4 lore on average (n=6).',
      'Your wins are usually decided on round 4 (n=6).',
      'When you are 5 or more lore behind after round 5, you win 0% of the time (95% CI 0%–39%, n=6).',
      'None of your 6 wins was a comeback from 5 or more lore down.',
    ])
  })

  it('throws under the minimum sample', () => {
    expect(() => turningPointSentences(aggregateTurningPoints(games.slice(0, 9)))).toThrow()
  })
})
