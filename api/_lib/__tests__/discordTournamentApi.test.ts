import { describe, it, expect } from 'vitest'
import { withPhasePoints, getTournamentStructure, analyzeAdvancement } from '../discordTournamentApi'

// DLC London (1254364) during Day 1's last round: its phases carry no points
// cutoff; its template group does (Phase 2 needs 18).
const round = (id: string, n: number, status = 'COMPLETE') => ({ id, round_number: n, status, standings_status: 'GENERATED' })
const london = {
  name: 'DLC London: Main Event 1',
  phase_template_group: 'g1',
  tournament_phases: [
    { phase_name: 'Phase 1', order_in_phases: 1, round_type: 'SWISS', number_of_rounds: 8, rounds: [1, 2, 3, 4, 5, 6, 7].map((n) => round(`r${n}`, n)).concat(round('r8', 8, 'IN_PROGRESS')) },
    { phase_name: 'Phase 2', order_in_phases: 2, round_type: 'SWISS', number_of_rounds: 7, rounds: [] },
    { phase_name: 'Phase 3', order_in_phases: 3, round_type: 'RANKED_SINGLE_ELIMINATION', number_of_rounds: 3, rank_required_to_enter_phase: 8, rounds: [] },
  ],
}
const templates = [{ event_structure_policy: { allowed_phase_template_groups: [
  { id: 'g0', phase_templates: [{}, { points_required_to_enter_phase: 99 }] },
  { id: 'g1', phase_templates: [{ points_required_to_enter_phase: null }, { points_required_to_enter_phase: 18 }, { points_required_to_enter_phase: null }] },
] } }]

describe('discordTournamentApi withPhasePoints', () => {
  it("gives the bot Day 2's 18-point requirement from the template", () => {
    const structure = getTournamentStructure(withPhasePoints(london, templates))!
    expect(structure.advancementRequirement).toEqual({ type: 'points', value: 18, nextPhaseName: 'Phase 2' })
    expect(analyzeAdvancement({ match_points: 18 }, structure)?.status).toBe('secured')
  })

  it("counts only Day 1's rounds toward Day 2", () => {
    // After round 8 of 8 a 12-point player can't reach 18: Day 2's 7 rounds come after the cut.
    const structure = getTournamentStructure(withPhasePoints(london, templates))!
    expect(analyzeAdvancement({ match_points: 12 }, structure)?.status).toBe('eliminated')
  })

  it('has no requirement without a template group, as before', () => {
    const custom = { ...london, phase_template_group: null }
    expect(withPhasePoints(custom, templates)).toBe(custom)
    expect(getTournamentStructure(custom)!.advancementRequirement).toBeNull()
  })
})
