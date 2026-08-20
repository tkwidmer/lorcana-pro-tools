import { describe, it, expect } from 'vitest'
import { analyzeOpponentMetagame } from '../metagameAnalysis'

const makeGame = (overrides = {}) => ({
  myPlayerNum: 1,
  winner: '1',
  oppInkCombo: ['amber', 'steel'],
  ...overrides,
})

describe('analyzeOpponentMetagame', () => {
  it('returns empty array for no games', () => {
    expect(analyzeOpponentMetagame([])).toEqual([])
  })

  it('skips games without myPlayerNum', () => {
    expect(analyzeOpponentMetagame([makeGame({ myPlayerNum: null })])).toEqual([])
  })

  it('skips games with no opponent colors', () => {
    expect(analyzeOpponentMetagame([makeGame({ oppInkCombo: [] })])).toEqual([])
  })

  it('groups by opponent color pair regardless of input order', () => {
    const games = [
      makeGame({ oppInkCombo: ['steel', 'amber'] }),
      makeGame({ oppInkCombo: ['amber', 'steel'] }),
    ]
    const result = analyzeOpponentMetagame(games)
    expect(result).toHaveLength(1)
    expect(result[0].gameCount).toBe(2)
  })

  it('computes win rate and percentage of games', () => {
    const games = [
      makeGame({ winner: '1' }),
      makeGame({ winner: '2' }),
      makeGame({ oppInkCombo: ['ruby', 'sapphire'], winner: '1' }),
    ]
    const result = analyzeOpponentMetagame(games)
    const amberSteel = result.find(r => r.colorString === 'amber/steel')
    expect(amberSteel.gameCount).toBe(2)
    expect(amberSteel.wins).toBe(1)
    expect(amberSteel.losses).toBe(1)
    expect(amberSteel.winRate).toBe('50.0')
    expect(amberSteel.percentage).toBe('66.7')
  })

  it('sorts results by descending game count', () => {
    const games = [
      makeGame({ oppInkCombo: ['ruby', 'sapphire'] }),
      makeGame({ oppInkCombo: ['amber', 'steel'] }),
      makeGame({ oppInkCombo: ['amber', 'steel'] }),
    ]
    const result = analyzeOpponentMetagame(games)
    expect(result[0].colorString).toBe('amber/steel')
    expect(result[0].gameCount).toBe(2)
  })

  it('handles numeric winner matching numeric myPlayerNum', () => {
    const result = analyzeOpponentMetagame([makeGame({ myPlayerNum: 2, winner: 2 })])
    expect(result[0].wins).toBe(1)
    expect(result[0].losses).toBe(0)
  })
})
