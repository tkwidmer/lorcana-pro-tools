import { describe, it, expect } from 'vitest'
import { splitRoster, teamLiveSummary, formatMembership, teamInitials, parseRecord, teamsAtEvent, topTeamsByBestPlacement } from '../teams'

const members = [
  { id: 'a', playerId: '1', playerName: 'Later Joiner', joinedOn: '2026-02-01', leftOn: null },
  { id: 'b', playerId: '2', playerName: 'Founder', joinedOn: '2025-01-10', leftOn: null },
  { id: 'c', playerId: '3', playerName: 'Left Early', joinedOn: '2025-01-10', leftOn: '2026-02-01' },
  { id: 'd', playerId: '4', playerName: 'Left Late', joinedOn: '2025-03-01', leftOn: '2026-10-30' },
]

describe('splitRoster', () => {
  it('current by join date, former by most recent departure', () => {
    const { current, former } = splitRoster(members)
    expect(current.map((m) => m.playerName)).toEqual(['Founder', 'Later Joiner'])
    expect(former.map((m) => m.playerName)).toEqual(['Left Late', 'Left Early'])
  })
})

describe('parseRecord', () => {
  it('reads W-L-D and tolerates a missing record', () => {
    expect(parseRecord('3-1-2')).toEqual({ w: 3, l: 1, d: 2 })
    expect(parseRecord(null)).toEqual({ w: 0, l: 0, d: 0 })
  })
})

describe('teamLiveSummary', () => {
  it('combines records and ranks and counts members inside the cut', () => {
    const entries = [
      { rank: 3, record: '3-0-1' },
      { rank: 40, record: '2-2-0' },
    ]
    expect(teamLiveSummary(entries, 32)).toEqual({ wins: 5, draws: 1, losses: 2, bestRank: 3, worstRank: 40, inCut: 1 })
  })
  it('is null with no entries and ignores unranked entries for the spread', () => {
    expect(teamLiveSummary([], 32)).toBeNull()
    const s = teamLiveSummary([{ rank: null, record: '0-0-0' }], null)
    expect(s.bestRank).toBeNull()
    expect(s.worstRank).toBeNull()
    expect(s.inCut).toBe(0)
  })
})

describe('formatMembership', () => {
  it('shows a span for a former member and "Since" for a current one', () => {
    expect(formatMembership({ joinedOn: '2025-01-10', leftOn: '2026-10-30' })).toBe('Jan 2025 – Oct 2026')
    expect(formatMembership({ joinedOn: '2025-01-10', leftOn: null })).toBe('Since Jan 2025')
  })
  it('words an unknown start as before the archive', () => {
    expect(formatMembership({ joinedOn: null, leftOn: null })).toBe('Since before the archive')
    expect(formatMembership({ joinedOn: null, leftOn: '2026-10-30' })).toBe('Before the archive – Oct 2026')
  })
})

describe('splitRoster with unknown starts', () => {
  it('puts members with no start date first among current members', () => {
    const { current } = splitRoster([
      { id: 'a', playerId: '1', playerName: 'Dated', joinedOn: '2025-01-10', leftOn: null },
      { id: 'b', playerId: '2', playerName: 'Unknown', joinedOn: null, leftOn: null },
    ])
    expect(current.map((m) => m.playerName)).toEqual(['Unknown', 'Dated'])
  })
})

describe('teamInitials', () => {
  it('takes the first letter of up to two words', () => {
    expect(teamInitials('Inkborn Forge')).toBe('IF')
    expect(teamInitials('Gloomstone')).toBe('G')
    expect(teamInitials('les encreurs de paris')).toBe('LE')
  })
})

describe('teamsAtEvent', () => {
  const teams = [
    { slug: 'a', name: 'Alpha', logoUrl: null, members: [{ playerId: '1', playerName: 'One' }, { playerId: '2', playerName: 'Two' }, { playerId: '9', playerName: 'Absent' }] },
    { slug: 'b', name: 'Beta', logoUrl: null, members: [{ playerId: '3', playerName: 'Three' }] },
    { slug: 'c', name: 'Gamma', logoUrl: null, members: [{ playerId: '7', playerName: 'Nobody here' }] },
  ]
  const entries = [
    { player: { id: 1 }, rank: 3, record: '3-0-0', match_points: 9 },
    { player: { id: 2 }, rank: 40, record: '1-2-0', match_points: 3 },
    { player: { id: 3 }, rank: 5, record: '3-0-0', match_points: 9 },
    { player: { id: 4 }, rank: 1, record: '3-0-0', match_points: 9 },
  ]
  it('ranks teams with a member in the event by combined points, and omits teams with none', () => {
    const rows = teamsAtEvent(teams, entries, 32)
    expect(rows.map((r) => r.slug)).toEqual(['a', 'b'])
    expect(rows[0]).toMatchObject({ points: 12, inEvent: 2, rosterSize: 3, summary: { wins: 4, losses: 2, draws: 0, bestRank: 3, inCut: 1 } })
    expect(rows[1]).toMatchObject({ points: 9, inEvent: 1, rosterSize: 1 })
    expect(rows[0].entries.map((e) => e.player.id)).toEqual([1, 2])
  })
  it('breaks a points tie by more wins, then by name', () => {
    const tied = [
      { slug: 'x', name: 'Xi', logoUrl: null, members: [{ playerId: '1', playerName: 'One' }] },
      { slug: 'y', name: 'Yankee', logoUrl: null, members: [{ playerId: '5', playerName: 'Five' }] },
    ]
    const rows = teamsAtEvent(tied, [
      { player: { id: 1 }, rank: 10, record: '2-0-3', match_points: 9 },
      { player: { id: 5 }, rank: 11, record: '3-0-0', match_points: 9 },
    ], null)
    expect(rows.map((r) => r.slug)).toEqual(['y', 'x'])
  })
})

describe('topTeamsByBestPlacement', () => {
  const row = (name, bestRank, points, entries = []) => ({ name, points, entries, summary: { bestRank } })
  const e = (rank, name) => ({ rank, record: '5-1-0', player: { best_identifier: `${name} X` }, user_event_status: { best_identifier: name } })
  it('ranks by best individual placement, names the player holding it, and keeps the top n', () => {
    const rows = [
      row('Points Leader', 9, 40, [e(9, 'Pat'), e(30, 'Sam')]),
      row('Has #2', 2, 12, [e(14, 'Lee'), e(2, 'Kim')]),
      row('Unranked', null, 0),
      row('Tie Low Points', 4, 6, [e(4, 'Ann')]),
      row('Tie High Points', 4, 18, [e(4, 'Bo')]),
    ]
    const top = topTeamsByBestPlacement(rows, 3)
    expect(top.map((r) => r.name)).toEqual(['Has #2', 'Tie High Points', 'Tie Low Points'])
    expect(top[0].topPlayer).toEqual({ name: 'Kim', rank: 2, record: '5-1-0' })
  })
})
