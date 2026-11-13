import { describe, it, expect } from 'vitest'
import { pairAbbr, pairName, eventLine, cellFill } from '../inkPairShareImage'

describe('inkPairShareImage helpers', () => {
  it('names pairs for headers and rows', () => {
    expect(pairAbbr(['amber', 'emerald'])).toBe('AMB/EME')
    expect(pairName(['emerald', 'steel'])).toBe('EMERALD / STEEL')
  })

  it('builds the event line: format, players, how far the data runs', () => {
    expect(eventLine({ gameplayFormat: 'Core Constructed', startingPlayerCount: 1633, activePhaseType: 'SWISS', activeRoundNumber: 6 }))
      .toBe('Core Constructed · 1,633 players · Through Round 6')
    expect(eventLine({ gameplayFormat: null, startingPlayerCount: 64, activePhaseType: 'RANKED_SINGLE_ELIMINATION', activePhaseName: 'Top 8' }))
      .toBe('64 players · Through Top 8')
    expect(eventLine({ gameplayFormat: 'Core Constructed', startingPlayerCount: 1633, activePhaseType: 'SWISS', activeRoundNumber: 7 }, 'Standings after Round 6'))
      .toBe('Core Constructed · 1,633 players · Standings after Round 6')
  })

  it('colors cells red below even, green above, saturating at 25 points', () => {
    expect(cellFill(50)).toBe(cellFill(50.0))
    const [r30, g30] = cellFill(30).match(/\d+/g).map(Number)
    const [r70, g70] = cellFill(70).match(/\d+/g).map(Number)
    expect(r30).toBeGreaterThan(g30)
    expect(g70).toBeGreaterThan(r70)
    expect(cellFill(0)).toBe(cellFill(25))
    expect(cellFill(100)).toBe(cellFill(75))
  })
})
