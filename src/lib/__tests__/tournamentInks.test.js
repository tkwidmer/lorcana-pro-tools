import { describe, it, expect } from 'vitest'
import { inksOfRelationship, playerInks, inkPairMeta, inkPairMatrix, inkPairCountLines, dayTwoQualifiers, bestOfLeaders, bestRankByPair, INK_PAIRS } from '../tournamentInks'
import { metaSlices } from '../streamOverlay'

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

  it('writes the field as Metagame card lines the overlay parses back', () => {
    expect(inkPairCountLines(matches)).toEqual(['Amber/Emerald 2', 'Emerald/Steel 1'])
    expect(metaSlices(inkPairCountLines(matches).join('\n'), null).slices.map((s) => [s.inks, s.count]))
      .toEqual([[['amber', 'emerald'], 2], [['emerald', 'steel'], 1]])
  })

  it('builds the pair-vs-pair matrix from both sides, mirrors on the diagonal', () => {
    const cells = inkPairMatrix(matches)
    expect(cells.get('amber/emerald|emerald/steel')).toEqual({ wins: 1, losses: 1, draws: 1 })
    expect(cells.get('emerald/steel|amber/emerald')).toEqual({ wins: 1, losses: 1, draws: 1 })
    expect(cells.get('amber/emerald|amber/emerald')).toEqual({ wins: 0, losses: 1, draws: 0 })
  })

  it('picks the best-ranked player on each of the 15 pairs', () => {
    const standing = (id, rank) => ({ rank, player: { id } })
    // ranks out of order on purpose; 4 has no pair
    const rows = bestOfLeaders([standing(3, 1), standing(2, 4), standing(1, 2), standing(4, 3)], playerInks(matches))
    expect(INK_PAIRS).toHaveLength(15)
    expect(rows).toHaveLength(15)
    expect(rows[0]).toMatchObject({ key: 'amber/emerald', entry: { rank: 1 } })
    expect(rows[1]).toMatchObject({ key: 'emerald/steel', entry: { rank: 4 } })
    expect(rows.slice(2).every((r) => r.entry === null)).toBe(true)
  })

  it('lists the pair\'s other players on the leader\'s points as tied, in standings order', () => {
    const inksById = new Map([['1', ['amber', 'emerald']], ['3', ['amber', 'emerald']], ['5', ['amber', 'emerald']], ['2', ['emerald', 'steel']]])
    const standing = (id, rank, match_points) => ({ rank, match_points, player: { id } })
    const rows = bestOfLeaders([standing(5, 9, 12), standing(3, 4, 15), standing(1, 2, 15), standing(2, 1, 15)], inksById)
    const ae = rows.find((r) => r.key === 'amber/emerald')
    expect(ae.entry.rank).toBe(2)
    expect(ae.tied.map((e) => e.rank)).toEqual([4])
    expect(rows.find((r) => r.key === 'emerald/steel').tied).toEqual([])
    expect(rows.find((r) => r.entry === null).tied).toEqual([])
    expect(bestRankByPair([standing(5, 9, 12), standing(3, 4, 15), standing(1, 2, 15), standing(2, 1, 15)], inksById))
      .toEqual(new Map([['emerald/steel', 1], ['amber/emerald', 2]]))
    expect(bestRankByPair(null, inksById).size).toBe(0)
  })
  it('converts each pair to Day 2 against the field', () => {
    // 18 points makes Day 2: players 1 and 2 do, 3 (amber/emerald) does not.
    const standings = [{ player: { id: 1 }, match_points: 18 }, { player: { id: 2 }, match_points: 21 }, { player: { id: 3 }, match_points: 15 }]
    const dayTwo = dayTwoQualifiers(standings, { dayTwoPoints: 18, dayOneOver: true })
    const [ae, es] = inkPairMeta(matches, dayTwo)
    expect(ae).toMatchObject({ dayTwo: 1, conversion: 50 })
    expect(es).toMatchObject({ dayTwo: 1, conversion: 100 })
    // field: 2 of 3 converted
    expect(ae.lift).toBeCloseTo(0.75)
    expect(es.lift).toBeCloseTo(1.5)
  })

  it('has no Day 2 field before Day 1 ends or without a cutoff', () => {
    const standings = [{ player: { id: 1 }, match_points: 18 }]
    expect(dayTwoQualifiers(standings, { dayTwoPoints: 18, dayOneOver: false })).toBeNull()
    expect(dayTwoQualifiers(standings, { dayTwoPoints: null, dayOneOver: true })).toBeNull()
    expect(inkPairMeta(matches)[0]).toMatchObject({ conversion: null, lift: null })
  })
})
