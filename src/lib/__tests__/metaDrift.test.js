import { describe, it, expect } from 'vitest'
import { archetypeDrift, archetypeMatchupDrift } from '../metaDrift'

const princess = (id, gamesPlayed, wins) => ({ id, colors: ['amber', 'steel'], archetypeName: 'Princesses', gamesPlayed, wins })
const dogs = (id, gamesPlayed, wins) => ({ id, colors: ['amber', 'emerald'], archetypeName: 'Dogs', gamesPlayed, wins })

const week = (totalGames, profiles, archetypeMatchups = []) => ({ activity: { totalGames }, profiles, archetypeMatchups })

// Week 1: Princesses only. Week 2: Princesses (two variants) and Dogs, which
// meet in two variant-level matchup rows that should roll up into one.
const weeks = [
  week(1000, [princess('p1', 200, 100)]),
  week(1000, [princess('p1', 300, 180), princess('p2', 100, 60), dogs('d1', 100, 40)], [
    { archetypeIdA: 'p1', archetypeIdB: 'd1', games: 40, winsA: 30 },
    { archetypeIdA: 'd1', archetypeIdB: 'p2', games: 10, winsA: 5 },
    { archetypeIdA: 'p1', archetypeIdB: 'p2', games: 20, winsA: 10 },
  ]),
]

describe('archetypeDrift', () => {
  it('groups variants per week and reports games, share and win rate', () => {
    const [p] = archetypeDrift(weeks, { fromIndex: 0, toIndex: 1, sortBy: 'games', minGames: 0 })
    expect(p.name).toBe('Amber/Steel Princesses')
    expect(p.cells[0]).toEqual({ games: 200, share: 20, winRate: 50 })
    expect(p.cells[1]).toEqual({ games: 400, share: 40, winRate: 60 })
    expect(p.winRateDelta).toBe(10)
    expect(p.shareDelta).toBe(20)
    expect(p.totalGames).toBe(600)
  })

  it('reports the one-week change into the latest week separately from the overall change', () => {
    const three = [...weeks, week(1000, [princess('p1', 500, 350)])]
    const [p] = archetypeDrift(three, { fromIndex: 0, toIndex: 2, sortBy: 'games', minGames: 0 })
    expect(p.winRateDelta).toBe(20)       // 50% → 70%
    expect(p.weekWinRateDelta).toBe(10)   // 60% → 70%
    expect(p.shareDelta).toBe(30)         // 20% → 50%
    expect(p.weekShareDelta).toBe(10)     // 40% → 50%
  })

  it('leaves a week empty when the archetype did not appear, with no delta', () => {
    const d = archetypeDrift(weeks, { fromIndex: 0, toIndex: 1, sortBy: 'games', minGames: 0 }).find(r => r.archetypeName === 'Dogs')
    expect(d.cells[0]).toBeNull()
    expect(d.winRateDelta).toBeNull()
  })

  it('orders by the latest week, by games or by win rate', () => {
    const byGames = archetypeDrift(weeks, { fromIndex: 0, toIndex: 1, sortBy: 'games', minGames: 0 })
    expect(byGames.map(r => r.archetypeName)).toEqual(['Princesses', 'Dogs'])
    const three = [...weeks.slice(0, 1), week(1000, [princess('p1', 100, 40), dogs('d1', 50, 40)])]
    const byWinRate = archetypeDrift(three, { fromIndex: 0, toIndex: 1, sortBy: 'winRate', minGames: 0 })
    expect(byWinRate.map(r => r.archetypeName)).toEqual(['Dogs', 'Princesses'])
  })

  it('drops archetypes under the minimum total games', () => {
    const rows = archetypeDrift(weeks, { fromIndex: 0, toIndex: 1, sortBy: 'games', minGames: 150 })
    expect(rows.map(r => r.archetypeName)).toEqual(['Princesses'])
  })
})

describe('archetypeMatchupDrift', () => {
  it('rolls variant matchups up per opposing archetype, from the focused side', () => {
    const rows = archetypeMatchupDrift(weeks, 'amber/steel|Princesses', { fromIndex: 0, toIndex: 1, sortBy: 'games', minGames: 0 })
    expect(rows).toHaveLength(1)
    const [d] = rows
    expect(d.archetypeName).toBe('Dogs')
    expect(d.cells[0]).toBeNull()
    // 30 wins as side A of 40, plus 5 wins as side B of 10 → 35/50.
    expect(d.cells[1]).toEqual({ games: 50, winRate: 70 })
  })

  it('leaves out the mirror', () => {
    const rows = archetypeMatchupDrift(weeks, 'amber/steel|Princesses', { fromIndex: 0, toIndex: 1, sortBy: 'games', minGames: 0 })
    expect(rows.some(r => r.key === 'amber/steel|Princesses')).toBe(false)
  })
})
