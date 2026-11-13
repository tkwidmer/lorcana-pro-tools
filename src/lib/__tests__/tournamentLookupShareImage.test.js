import { describe, it, expect } from 'vitest'
import { pairAbbr, pairName, eventLine, cellFill, shareFilename, layout } from '../tournamentLookupShareImage'

describe('tournamentLookupShareImage helpers', () => {
  it('names pairs for headers and rows', () => {
    expect(pairAbbr(['amber', 'emerald'])).toBe('AMB/EME')
    expect(pairName(['emerald', 'steel'])).toBe('EMERALD / STEEL')
  })

  it('names the file after the event', () => {
    expect(shareFilename({ eventName: 'DLC London: Main Event 1' }, 'teams')).toBe('dlc-london-main-event-1-teams.png')
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

describe('layout', () => {
  it('grows with its rows for social images', () => {
    expect(layout({ video: false, w: 1200, top: 236, bottom: 110, n: 15, row: 58 })).toEqual({ W: 1200, H: 236 + 15 * 58 + 110, ROW: 58, dpr: 2 })
  })
  it('makes a 3840x2160 video frame whose rows stop above the webcam band', () => {
    for (const n of [1, 5, 15]) {
      const { W, H, ROW, dpr, cam } = layout({ video: true, w: 1200, top: 236, bottom: 110, n, row: 58, gap: 6 })
      expect(W * dpr).toBeCloseTo(3840)
      expect(H * dpr).toBeCloseTo(2160)
      expect(cam).toEqual({ w: W / 4, h: H / 4 })
      expect(ROW).toBeGreaterThanOrEqual(58 * 0.8 - 1e-9)
      expect(ROW).toBeLessThanOrEqual(58 * 1.3)
      expect(236 + n * (ROW + 6)).toBeLessThanOrEqual(H - cam.h - 24 + 1e-9)
    }
  })
})
