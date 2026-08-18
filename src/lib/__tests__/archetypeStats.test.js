import { describe, it, expect } from 'vitest'
import {
  getCuratedArchetypes,
  archetypePlayRate,
  getArchetypesForColorPair,
  getArchetypeMatchupsFor,
  buildProfilesById,
} from '../archetypeStats'

const profiles = [
  { id: 'a', colors: ['amber', 'emerald'], archetypeName: 'Princess Aggro', gamesPlayed: 100, winRate: 55 },
  { id: 'b', colors: ['amber', 'emerald'], archetypeName: null, gamesPlayed: 10, winRate: 40 },
  { id: 'c', colors: ['amethyst', 'ruby'], archetypeName: 'Peter Pan', gamesPlayed: 50, winRate: 49 },
]

describe('getCuratedArchetypes', () => {
  it('excludes uncurated (null archetypeName) profiles and sorts by games desc', () => {
    const result = getCuratedArchetypes(profiles)
    expect(result.map(p => p.id)).toEqual(['a', 'c'])
  })
})

describe('archetypePlayRate', () => {
  it('computes percentage of total games', () => {
    expect(archetypePlayRate({ gamesPlayed: 100 }, 1000)).toBe(10)
  })

  it('returns 0 when totalGames is falsy', () => {
    expect(archetypePlayRate({ gamesPlayed: 100 }, 0)).toBe(0)
  })
})

describe('getArchetypesForColorPair', () => {
  it('matches regardless of color order', () => {
    const result = getArchetypesForColorPair(profiles, ['emerald', 'amber'])
    expect(result.map(p => p.id)).toEqual(['a'])
  })
})

describe('getArchetypeMatchupsFor', () => {
  const archetypeMatchups = [
    { archetypeIdA: 'a', archetypeIdB: 'c', games: 100, winsA: 60, winRate: 60, firstPlayerGames: 50, firstPlayerWinRate: 65 },
    { archetypeIdA: 'a', archetypeIdB: 'a', games: 20, winsA: 10, winRate: 50, firstPlayerGames: 10, firstPlayerWinRate: 55 },
  ]
  const profilesById = buildProfilesById(profiles)

  it('returns forward matchups as-is', () => {
    const rows = getArchetypeMatchupsFor(archetypeMatchups, 'a', profilesById)
    const vsC = rows.find(r => r.opponentId === 'c')
    expect(vsC.winRate).toBe(60)
    expect(vsC.games).toBe(100)
  })

  it('flips winRate for reverse matchups and omits firstPlayerWinRate', () => {
    const rows = getArchetypeMatchupsFor(archetypeMatchups, 'c', profilesById)
    const vsA = rows.find(r => r.opponentId === 'a')
    expect(vsA.winRate).toBe(40)
    expect(vsA.firstPlayerWinRate).toBeNull()
  })

  it('includes mirror matchups once', () => {
    const rows = getArchetypeMatchupsFor(archetypeMatchups, 'a', profilesById)
    const mirrors = rows.filter(r => r.isMirror)
    expect(mirrors).toHaveLength(1)
    expect(mirrors[0].opponentId).toBe('a')
  })
})
