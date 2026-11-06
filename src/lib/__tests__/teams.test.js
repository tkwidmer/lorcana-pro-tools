import { describe, it, expect } from 'vitest'
import { splitRoster, rosterMap, teamLiveSummary, formatMembership, teamInitials, parseRecord } from '../teams'

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

describe('rosterMap', () => {
  it('maps only current members by player id to the { name } shape Tournament Lookup threads', () => {
    expect(rosterMap(members)).toEqual({ 1: { name: 'Later Joiner' }, 2: { name: 'Founder' } })
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
})

describe('teamInitials', () => {
  it('takes the first letter of up to two words', () => {
    expect(teamInitials('Inkborn Forge')).toBe('IF')
    expect(teamInitials('Gloomstone')).toBe('G')
    expect(teamInitials('les encreurs de paris')).toBe('LE')
  })
})
