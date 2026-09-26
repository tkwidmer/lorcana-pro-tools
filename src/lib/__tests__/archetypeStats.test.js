import { describe, it, expect } from 'vitest'
import { getCuratedArchetypes } from '../archetypeStats'

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
