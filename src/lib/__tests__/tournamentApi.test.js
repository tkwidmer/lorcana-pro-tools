import { describe, it, expect } from 'vitest'
import { getTournamentStructure, withPhasePoints, formatTiebreakers, analyzeAdvancement, analyzeId, projectCut, extractEventId } from '../tournamentApi'

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

describe('extractEventId', () => {
  it('reads the numeric id from a Play Hub event link', () => {
    expect(extractEventId('https://tcg.ravensburgerplay.com/events/12345/standings')).toBe('12345')
    expect(extractEventId('12345')).toBe(null)
    expect(extractEventId(null)).toBe(null)
  })
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

  it('reports the active round even before its standings are generated', () => {
    const details = makeEventDetails({
      tournament_phases: [{
        round_type: 'SWISS', phase_name: 'Swiss', number_of_rounds: 6,
        rounds: [roundComplete('r1', 1), roundComplete('r2', 2), { id: 'r3', round_number: 3, status: 'IN_PROGRESS', standings_status: 'PENDING' }, { id: 'r4', round_number: 4, status: 'UPCOMING' }],
      }],
    })
    const structure = getTournamentStructure(details)
    expect(structure.currentRoundId).toBe('r2')
    expect(structure.activeRoundId).toBe('r3')
    expect(structure.activeRoundNumber).toBe(3)
    expect(structure.activePhaseType).toBe('SWISS')
    expect(getTournamentStructure(makeEventDetails({ tournament_phases: [{ round_type: 'SWISS', phase_name: 'Swiss', number_of_rounds: 6, rounds: [{ id: 'r1', round_number: 1, status: 'UPCOMING' }] }] })).activeRoundId).toBeNull()
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

// DLC London (1254364) during Day 1's last round: its phases carry no
// points cutoff; its template group does (Phase 2 needs 18).
describe('withPhasePoints', () => {
  const london = {
    phase_template_group: 'g1',
    tournament_phases: [
      { phase_name: 'Phase 1', order_in_phases: 1, round_type: 'SWISS', number_of_rounds: 8, rounds: [1, 2, 3, 4, 5, 6, 7].map((n) => roundComplete(`r${n}`, n)).concat(roundInProgress('r8', 8)) },
      { phase_name: 'Phase 2', order_in_phases: 2, round_type: 'SWISS', number_of_rounds: 7, rounds: [] },
      { phase_name: 'Phase 3', order_in_phases: 3, round_type: 'RANKED_SINGLE_ELIMINATION', number_of_rounds: 3, rank_required_to_enter_phase: 8, rounds: [] },
    ],
  }
  const templates = [{ event_structure_policy: { allowed_phase_template_groups: [
    { id: 'g0', phase_templates: [{}, { points_required_to_enter_phase: 99 }] },
    { id: 'g1', phase_templates: [{ points_required_to_enter_phase: null }, { points_required_to_enter_phase: 18 }, { points_required_to_enter_phase: null }] },
  ] } }]

  it("copies the group's points cutoff onto the event's phases", () => {
    const phases = withPhasePoints(london, templates).tournament_phases
    expect(phases.map((p) => p.points_required_to_enter_phase)).toEqual([null, 18, null])
  })

  it('gives the cuts and the advancement requirement from the cutoff', () => {
    const s = getTournamentStructure(withPhasePoints(london, templates))
    expect(s.cuts).toEqual([
      { label: 'Day 2', cutoff: { type: 'points', value: 18 }, fromRoundId: 'r8' },
      { label: 'Top 8', cutoff: { type: 'rank', value: 8 }, fromRoundId: null },
    ])
    expect(s.advancementRequirement).toEqual({ type: 'points', value: 18, nextPhaseName: 'Phase 2' })
  })

  it('has no Day 2 cut before Day 1 reaches its last round', () => {
    const early = { ...london, tournament_phases: [{ ...london.tournament_phases[0], rounds: london.tournament_phases[0].rounds.slice(0, 7) }, ...london.tournament_phases.slice(1)] }
    expect(getTournamentStructure(withPhasePoints(early, templates)).cuts[0].fromRoundId).toBeNull()
  })

  it('leaves an event without a template group unchanged', () => {
    const custom = { ...london, phase_template_group: null }
    expect(withPhasePoints(custom, templates)).toBe(custom)
    expect(getTournamentStructure(custom).cuts.map((c) => c.label)).toEqual(['Top 8'])
  })
})

describe('formatTiebreakers', () => {
  const entry = {
    rank: 5,
    match_record: '4-2',
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
  it('leaves top-cut phases to analyzeId', () => {
    const structure = { advancementRequirement: { type: 'rank', value: 8, nextPhaseName: 'Top 8' }, swissRoundsRemaining: 0 }
    expect(analyzeAdvancement({ rank: 5 }, structure)).toBeNull()
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

// n players at p points each; ids are unique across calls
let nextId = 0
const group = (n, points) => Array.from({ length: n }, () => ({ id: `p${nextId++}`, rank: 0, match_points: points }))
const ranked = (entries) =>
  [...entries].sort((a, b) => b.match_points - a.match_points).map((e, i) => ({ ...e, rank: i + 1 }))

describe('projectCut', () => {
  it('finds the lock and bubble totals of a 48-player, 6-round, top-8 Swiss', () => {
    // 48 players after round 0: halve six times → 0.75 at 18, 4.5 at 15, 11.25 at 12 …
    const { lockPoints, bubblePoints, bubbleSpots, bubblePlayers } = projectCut(group(48, 0), 8, 6)
    expect(lockPoints).toBe(15)
    expect(bubblePoints).toBe(12)
    expect(bubbleSpots).toBe(3) // 8 − 5.25 = 2.75
    expect(bubblePlayers).toBe(11)
  })

  it('with no rounds left reads the standings as they are', () => {
    const standings = [...group(6, 15), ...group(4, 12), ...group(10, 9)]
    expect(projectCut(standings, 8, 0)).toEqual({ lockPoints: 15, bubblePoints: 12, bubbleSpots: 2, bubblePlayers: 4 })
  })

  it('ignores dropped players', () => {
    const dropped = group(5, 18).map((e) => ({ ...e, user_event_status: { registration_status: 'DROPPED' } }))
    expect(projectCut([...dropped, ...group(8, 9)], 8, 0).bubblePoints).toBeNull()
  })
})

describe('analyzeId', () => {
  it('returns null without a top cut or during the bracket', () => {
    expect(analyzeId({ id: 'a', rank: 1, match_points: 18 }, group(8, 0), {})).toBeNull()
    expect(analyzeId({ id: 'a', rank: 1, match_points: 18 }, group(8, 0), { topCutSize: 8, swissRoundsRemaining: 0, isElimination: true })).toBeNull()
  })

  it('is contending early, with wins needed for the projected bubble and lock', () => {
    const standings = ranked([...group(12, 6), ...group(24, 3), ...group(12, 0)])
    const me = standings.find((e) => e.match_points === 3)
    const r = analyzeId(me, standings, { topCutSize: 8, swissRoundsRemaining: 4 })
    expect(r.status).toBe('contending')
    expect(r.inCut).toBe(false)
    expect(r.maxPoints).toBe(15)
    expect(r.bubblePoints).toBe(12)
    expect(r.winsToBubble).toBe(3)
    expect(r.winsToLock).toBe(Math.ceil((r.lockPoints - 3) / 3))
  })

  it('locks a player nobody can catch', () => {
    const standings = ranked([...group(1, 15), ...group(6, 9), ...group(20, 6)])
    const r = analyzeId(standings[0], standings, { topCutSize: 8, swissRoundsRemaining: 1 })
    expect(r.status).toBe('locked')
  })

  it('eliminates a player who cannot reach the cut even winning out', () => {
    const standings = ranked([...group(8, 12), ...group(20, 3)])
    const r = analyzeId(standings[10], standings, { topCutSize: 8, swissRoundsRemaining: 2 })
    expect(r.status).toBe('eliminated')
  })

  describe('final round', () => {
    const structure = { topCutSize: 8, swissRoundsRemaining: 1 }

    it('is safe when everyone who could pass on a draw still leaves room', () => {
      // 12 others could still reach my 12 (not locked); after an ID only 4 above me
      // plus 3 who could pass me on a win → 7 < 8
      const standings = ranked([...group(4, 15), ...group(1, 12), ...group(3, 11), ...group(5, 9), ...group(20, 6)])
      const me = standings.find((e) => e.match_points === 12)
      expect(analyzeId(me, standings, structure).status).toBe('safe')
    })

    it('is borderline when it takes about half of the level players to lose', () => {
      // 4 above, 6 level with me at 12: all winning passes me (10 ≥ 8), half (3) does not (7 < 8)
      const standings = ranked([...group(4, 15), ...group(7, 12), ...group(20, 6)])
      const me = standings.find((e) => e.match_points === 12)
      expect(analyzeId(me, standings, structure).status).toBe('borderline')
    })

    it('is danger when too many players are level', () => {
      const standings = ranked([...group(4, 15), ...group(12, 12), ...group(20, 6)])
      const me = standings.find((e) => e.match_points === 12)
      expect(analyzeId(me, standings, structure).status).toBe('danger')
    })
  })
})
