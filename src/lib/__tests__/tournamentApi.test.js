import { describe, it, expect } from 'vitest'
import { getTournamentStructure, formatTiebreakers, analyzeAdvancement, analyzeId } from '../tournamentApi'

const roundComplete = (id, n) => ({ id, round_number: n, status: 'COMPLETE', standings_status: 'GENERATED' })
const roundInProgress = (id, n) => ({ id, round_number: n, status: 'IN_PROGRESS', standings_status: 'GENERATED' })

const makeEventDetails = (overrides = {}) => ({
  name: 'Test Event',
  tournament_phases: [
    {
      round_type: 'SWISS',
      phase_name: 'Swiss',
      number_of_rounds: 6,
      rounds: [roundComplete('r1', 1), roundComplete('r2', 2), roundComplete('r3', 3)],
    },
  ],
  top_cut_size: 8,
  tiebreakers: [],
  ...overrides,
})

describe('getTournamentStructure', () => {
  it('returns null for missing or empty eventDetails', () => {
    expect(getTournamentStructure(null)).toBeNull()
    expect(getTournamentStructure({})).toBeNull()
  })

  it('reports total swiss rounds', () => {
    const structure = getTournamentStructure(makeEventDetails())
    expect(structure.totalSwissRounds).toBe(6)
  })

  it('picks topCutSize from eventDetails.top_cut_size', () => {
    const structure = getTournamentStructure(makeEventDetails({ top_cut_size: 16 }))
    expect(structure.topCutSize).toBe(16)
  })

  it('selects last completed round as current when none is in-progress', () => {
    const structure = getTournamentStructure(makeEventDetails())
    expect(structure.currentRoundNumber).toBe(3)
    expect(structure.currentRoundId).toBe('r3')
  })

  it('prefers in-progress round over completed', () => {
    const details = makeEventDetails({
      tournament_phases: [{
        round_type: 'SWISS',
        phase_name: 'Swiss',
        number_of_rounds: 6,
        rounds: [roundComplete('r1', 1), roundInProgress('r2', 2)],
      }],
    })
    const structure = getTournamentStructure(details)
    expect(structure.currentRoundId).toBe('r2')
    expect(structure.currentRoundNumber).toBe(2)
  })

  it('reports swiss rounds remaining', () => {
    const structure = getTournamentStructure(makeEventDetails())
    // 6 total, current = 3 → 3 remaining
    expect(structure.swissRoundsRemaining).toBe(3)
  })

  it('isElimination is false in swiss phase', () => {
    const structure = getTournamentStructure(makeEventDetails())
    expect(structure.isElimination).toBe(false)
  })

  it('isElimination is true in elimination phase', () => {
    const details = makeEventDetails({
      tournament_phases: [
        {
          round_type: 'RANKED_SINGLE_ELIMINATION',
          phase_name: 'Top 8',
          number_of_rounds: 3,
          rounds: [roundInProgress('e1', 1)],
        },
      ],
    })
    const structure = getTournamentStructure(details)
    expect(structure.isElimination).toBe(true)
  })

  it('parses advancementRequirement from next phase name with points', () => {
    const details = makeEventDetails({
      tournament_phases: [
        {
          round_type: 'SWISS',
          phase_name: 'Day 1',
          number_of_rounds: 6,
          rounds: [roundComplete('r1', 1)],
        },
        {
          round_type: 'SWISS',
          phase_name: 'Day 2 — 18 Points Required',
          number_of_rounds: 6,
          rounds: [],
        },
      ],
    })
    const structure = getTournamentStructure(details)
    expect(structure.advancementRequirement?.type).toBe('points')
    expect(structure.advancementRequirement?.value).toBe(18)
  })
})

describe('formatTiebreakers', () => {
  const entry = {
    rank: 5,
    record: '4-2',
    match_points: 12,
    opponent_match_win_percentage: 0.6,
    game_win_percentage: 0.55,
    opponent_game_win_percentage: 0.58,
  }

  it('formats tiebreaker values as percentage strings with 2 decimals', () => {
    const result = formatTiebreakers(entry)
    const omw = result.ordered.find(o => o.key === 'opponent_match_win_percentage')
    expect(omw?.value).toBe('60.00')
  })

  it('includes rank, record, and matchPoints', () => {
    const result = formatTiebreakers(entry)
    expect(result.rank).toBe(5)
    expect(result.record).toBe('4-2')
    expect(result.matchPoints).toBe(12)
  })

  it('respects custom tiebreaker order', () => {
    const order = ['game_win_percentage', 'opponent_match_win_percentage']
    const result = formatTiebreakers(entry, order)
    expect(result.ordered[0].key).toBe('game_win_percentage')
    expect(result.ordered[1].key).toBe('opponent_match_win_percentage')
  })
})

describe('analyzeAdvancement - points-based', () => {
  const structure = {
    advancementRequirement: { type: 'points', value: 18, nextPhaseName: 'Day 2' },
    swissRoundsRemaining: 2,
  }

  it('returns secured when already at threshold', () => {
    const result = analyzeAdvancement({ match_points: 18 }, structure)
    expect(result.status).toBe('secured')
  })

  it('returns eliminated when max possible < threshold', () => {
    // 10 points + 2 rounds * 3 = 16 < 18
    const result = analyzeAdvancement({ match_points: 10 }, structure)
    expect(result.status).toBe('eliminated')
  })

  it('returns possible with wins needed when still achievable', () => {
    // 13 points + 2 * 3 = 19 ≥ 18
    const result = analyzeAdvancement({ match_points: 13 }, structure)
    expect(result.status).toBe('possible')
    expect(result.winsNeeded).toBe(Math.ceil((18 - 13) / 3))
    expect(result.pointsNeeded).toBe(5)
  })
})

describe('analyzeAdvancement - rank-based', () => {
  const structure = {
    advancementRequirement: { type: 'rank', value: 8, nextPhaseName: 'Top 8' },
    swissRoundsRemaining: 0,
  }

  it('returns in_cut when rank ≤ topCut', () => {
    const result = analyzeAdvancement({ rank: 5 }, structure)
    expect(result.status).toBe('in_cut')
  })

  it('returns outside_cut when rank > topCut', () => {
    const result = analyzeAdvancement({ rank: 12 }, structure)
    expect(result.status).toBe('outside_cut')
  })
})

describe('analyzeAdvancement - edge cases', () => {
  it('returns null for missing playerEntry', () => {
    expect(analyzeAdvancement(null, {})).toBeNull()
  })

  it('returns null when no advancementRequirement', () => {
    expect(analyzeAdvancement({ match_points: 10 }, {})).toBeNull()
  })
})

describe('analyzeId', () => {
  const structure = { topCutSize: 8, swissRoundsRemaining: 1 }
  const standings = [
    { id: 'a', rank: 1, match_points: 18 },
    { id: 'b', rank: 8, match_points: 12 },
    { id: 'c', rank: 9, match_points: 12 },
  ]

  it('marks safe when 3+ points above cut line', () => {
    // rank 1, 18 pts, cut at 12 → buffer = 6 ≥ 3 → safe
    const result = analyzeId({ id: 'a', rank: 1, match_points: 18 }, standings, structure)
    expect(result?.recommendation).toBe('safe')
    expect(result?.inCut).toBe(true)
  })

  it('marks danger when outside cut', () => {
    const result = analyzeId({ id: 'c', rank: 9, match_points: 12 }, standings, structure)
    expect(result?.recommendation).toBe('danger')
    expect(result?.inCut).toBe(false)
  })

  it('returns null when topCutSize is absent', () => {
    expect(analyzeId({ rank: 1, match_points: 18 }, standings, {})).toBeNull()
  })
})
