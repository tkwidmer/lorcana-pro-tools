import { describe, it, expect } from 'vitest'
import { inksOfRelationship, playerInks, inkPairMeta, inkPairMatrix } from '../tournamentInks'

const rel = (id, inks, order = 1) => ({
  player_order: order,
  player: { id },
  user_event_status: { deck_descriptor_label: inks ? { parts: [{ kind: 'descriptor', value: inks }] } : null },
})
const match = (a, b, extra = {}) => ({ player_match_relationships: [a, b].filter(Boolean), status: 'COMPLETE', ...extra })

// 1 amber/emerald, 2 emerald/steel, 3 amber/emerald, 4 unknown
const matches = [
  match(rel(1, 'emerald,amber'), rel(2, 'emerald,steel', 2), { winning_player: 1 }),
  match(rel(3, 'amber,emerald'), rel(2, 'emerald,steel', 2), { winning_player: 2 }),
  match(rel(1, 'amber,emerald'), rel(3, 'amber,emerald', 2), { winning_player: 3 }),
  match(rel(2, 'emerald,steel'), rel(4, null, 2), { winning_player: 2 }),
  match(rel(1, 'amber,emerald'), rel(2, 'emerald,steel', 2), { match_is_intentional_draw: true }),
  match(rel(3, 'amber,emerald'), rel(2, 'emerald,steel', 2), { status: 'IN_PROGRESS', winning_player: null }),
  match(rel(3, 'amber,emerald'), null, { match_is_bye: true }),
]

describe('tournamentInks', () => {
  it('reads and sorts the deck descriptor', () => {
    expect(inksOfRelationship(rel(1, 'steel,amber'))).toEqual(['amber', 'steel'])
    expect(inksOfRelationship(rel(1, null))).toBeNull()
  })

  it('maps each player to their pair, skipping players without one', () => {
    const map = playerInks(matches)
    expect(map.get('1')).toEqual(['amber', 'emerald'])
    expect(map.has('4')).toBe(false)
    expect(map.size).toBe(3)
  })

  it('builds the field: players, share and the non-mirror record', () => {
    const [ae, es] = inkPairMeta(matches)
    expect(ae).toMatchObject({ key: 'amber/emerald', players: 2, wins: 1, losses: 1, draws: 1 })
    expect(ae.share).toBeCloseTo(66.67, 1)
    expect(ae.winRate).toBe(50)
    expect(es).toMatchObject({ key: 'emerald/steel', players: 1, wins: 1, losses: 1, draws: 1 })
  })

  it('builds the pair-vs-pair matrix from both sides, mirrors on the diagonal', () => {
    const cells = inkPairMatrix(matches)
    expect(cells.get('amber/emerald|emerald/steel')).toEqual({ wins: 1, losses: 1, draws: 1 })
    expect(cells.get('emerald/steel|amber/emerald')).toEqual({ wins: 1, losses: 1, draws: 1 })
    expect(cells.get('amber/emerald|amber/emerald')).toEqual({ wins: 0, losses: 1, draws: 0 })
  })
})
