import { describe, it, expect } from 'vitest'
import { detectLeaks, summarizeLeaks } from '../leakDetection'

// Build a minimal game object with turns and challenges
const makeGame = ({ winner = 1, turns = [], challenges = [], rawLogs = null } = {}) => ({
  winner,
  turns,
  challenges,
  _rawLogs: rawLogs,
})

const turn = (owner, n, { inked = 0, plays = 0, lore = 0 } = {}) => ({ owner, turn: n, inked, plays, lore })

describe('detectLeaks - bad_challenge', () => {
  it('flags challenges where attacker banished but defender survived', () => {
    const game = makeGame({
      challenges: [
        { player: 1, turn: 3, attackerName: 'Elsa', defenderName: 'Mickey', attackerBanished: true, defenderBanished: false },
      ],
    })
    const { leaks } = detectLeaks(game, 1)
    expect(leaks.some(l => l.type === 'bad_challenge')).toBe(true)
  })

  it('does not flag challenges where both are banished', () => {
    const game = makeGame({
      challenges: [
        { player: 1, turn: 3, attackerName: 'Elsa', defenderName: 'Mickey', attackerBanished: true, defenderBanished: true },
      ],
    })
    const { leaks } = detectLeaks(game, 1)
    expect(leaks.some(l => l.type === 'bad_challenge')).toBe(false)
  })

  it('does not flag opponent bad challenges as mine', () => {
    const game = makeGame({
      challenges: [
        { player: 2, turn: 3, attackerName: 'Elsa', defenderName: 'Mickey', attackerBanished: true, defenderBanished: false },
      ],
    })
    const { leaks } = detectLeaks(game, 1)
    expect(leaks.some(l => l.type === 'bad_challenge')).toBe(false)
  })

  it('sets severity high for 2+ bad challenges', () => {
    const game = makeGame({
      challenges: [
        { player: 1, turn: 2, attackerName: 'A', defenderName: 'B', attackerBanished: true, defenderBanished: false },
        { player: 1, turn: 3, attackerName: 'C', defenderName: 'D', attackerBanished: true, defenderBanished: false },
      ],
    })
    const { leaks } = detectLeaks(game, 1)
    const leak = leaks.find(l => l.type === 'bad_challenge')
    expect(leak?.severity).toBe('high')
  })
})

describe('detectLeaks - missed_ink', () => {
  it('flags early turns with no inking', () => {
    const game = makeGame({
      turns: [
        turn(1, 1, { inked: 1 }), // ok
        turn(1, 2, { inked: 0 }), // missed
        turn(1, 3, { inked: 1 }),
      ],
    })
    const { leaks } = detectLeaks(game, 1)
    const leak = leaks.find(l => l.type === 'missed_ink')
    expect(leak).toBeDefined()
    expect(leak.count).toBe(1)
  })

  it('does not flag missed ink outside the EARLY_INK_WINDOW (> 6 turns)', () => {
    const turns = Array.from({ length: 8 }, (_, i) =>
      turn(1, i + 1, { inked: i < 6 ? 1 : 0 }) // turns 7-8 no ink
    )
    const game = makeGame({ turns })
    const { leaks } = detectLeaks(game, 1)
    const leak = leaks.find(l => l.type === 'missed_ink')
    expect(leak).toBeUndefined()
  })

  it('only considers the specified player\'s turns', () => {
    const game = makeGame({
      turns: [
        turn(2, 1, { inked: 0 }), // opponent missed ink, not mine
        turn(1, 2, { inked: 1 }),
      ],
    })
    const { leaks } = detectLeaks(game, 1)
    expect(leaks.some(l => l.type === 'missed_ink')).toBe(false)
  })
})

describe('detectLeaks - lore_drought', () => {
  it('flags 3+ consecutive turns with no lore (starting from turn index 1)', () => {
    const turns = [
      turn(1, 1, { lore: 3 }),
      turn(1, 2, { lore: 0 }),
      turn(1, 3, { lore: 0 }),
      turn(1, 4, { lore: 0 }),
    ]
    const game = makeGame({ turns })
    const { leaks } = detectLeaks(game, 1)
    const leak = leaks.find(l => l.type === 'lore_drought')
    expect(leak).toBeDefined()
    expect(leak.count).toBe(3)
  })

  it('does not flag drought shorter than 3', () => {
    const turns = [
      turn(1, 1, { lore: 3 }),
      turn(1, 2, { lore: 0 }),
      turn(1, 3, { lore: 0 }),
      turn(1, 4, { lore: 3 }),
    ]
    const game = makeGame({ turns })
    const { leaks } = detectLeaks(game, 1)
    expect(leaks.some(l => l.type === 'lore_drought')).toBe(false)
  })

  it('ignores first turn for drought calculation', () => {
    // Turn 1 has no lore but we skip index 0
    const turns = [
      turn(1, 1, { lore: 0 }),
      turn(1, 2, { lore: 3 }),
    ]
    const game = makeGame({ turns })
    const { leaks } = detectLeaks(game, 1)
    expect(leaks.some(l => l.type === 'lore_drought')).toBe(false)
  })
})

describe('detectLeaks - returns correct metadata', () => {
  it('returns myPlayerNum and won', () => {
    const game = makeGame({ winner: 1 })
    const result = detectLeaks(game, 1)
    expect(result.myPlayerNum).toBe(1)
    expect(result.won).toBe(true)
  })

  it('returns won=false for a loss', () => {
    const game = makeGame({ winner: 2 })
    const result = detectLeaks(game, 1)
    expect(result.won).toBe(false)
  })

  it('returns empty leaks for null myPlayerNum', () => {
    const game = makeGame()
    const result = detectLeaks(game, null)
    expect(result.leaks).toEqual([])
  })
})

describe('summarizeLeaks', () => {
  it('aggregates leaks across games', () => {
    const games = [
      {
        myPlayerNum: 1,
        winner: 2,
        turns: [
          turn(1, 1), turn(1, 2), turn(1, 3), // 3 no-lore turns after turn 1
        ],
        challenges: [
          { player: 1, turn: 2, attackerName: 'A', defenderName: 'B', attackerBanished: true, defenderBanished: false },
        ],
        _rawLogs: null,
      },
      {
        myPlayerNum: 1,
        winner: 1,
        turns: [],
        challenges: [],
        _rawLogs: null,
      },
    ]
    const { analyzed, overallWinRate, ranked } = summarizeLeaks(games)
    expect(analyzed).toBe(2)
    expect(overallWinRate).toBe(0.5)
    expect(ranked.length).toBeGreaterThan(0)
  })

  it('skips games without myPlayerNum', () => {
    const games = [{ myPlayerNum: null, winner: 1, turns: [], challenges: [] }]
    const { analyzed } = summarizeLeaks(games)
    expect(analyzed).toBe(0)
  })

  it('returns 0 overallWinRate for empty input', () => {
    const { analyzed, overallWinRate } = summarizeLeaks([])
    expect(analyzed).toBe(0)
    expect(overallWinRate).toBe(0)
  })
})
