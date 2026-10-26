import { describe, it, expect } from 'vitest'
import { updatePlayer, inflate, rateEvents, INITIAL_RATING, INITIAL_RD } from '../glicko'

const win = (a: string, b: string) => ({ player1Id: a, player2Id: b, winnerId: a, isDraw: false })

describe('glicko', () => {
  it("reproduces Glickman's worked example: 1500/200 beats 1400/30, loses to 1550/100 and 1700/300", () => {
    const next = updatePlayer({ rating: 1500, rd: 200 }, [
      { opponent: { rating: 1400, rd: 30 }, score: 1 },
      { opponent: { rating: 1550, rd: 100 }, score: 0 },
      { opponent: { rating: 1700, rd: 300 }, score: 0 },
    ])
    expect(Math.round(next.rating)).toBe(1464)
    expect(next.rd.toFixed(1)).toBe('151.4')
  })

  it('inflates RD with time away, capped at 350', () => {
    expect(inflate({ rating: 1600, rd: 60 }, 0)).toEqual({ rating: 1600, rd: 60 })
    expect(inflate({ rating: 1600, rd: 60 }, 365).rd).toBeCloseTo(350, 6)
    expect(inflate({ rating: 1600, rd: 60 }, 2000).rd).toBe(350)
    expect(inflate({ rating: 1600, rd: 60 }, 30).rd).toBeGreaterThan(60)
  })

  it('updates a period from start-of-period ratings, so match order inside an event does not matter', () => {
    const matches = [win('a', 'b'), win('b', 'c'), win('a', 'c'), { player1Id: 'c', player2Id: 'b', winnerId: 'c', isDraw: false }]
    const forward = rateEvents([{ rphEventId: '1', eventDate: '2026-01-10', matches }])
    const reversed = rateEvents([{ rphEventId: '1', eventDate: '2026-01-10', matches: [...matches].reverse() }])
    expect([...reversed.entries()].sort()).toEqual([...forward.entries()].sort())
    // Two players new to the archive start level, so a single win moves both equally.
    const one = rateEvents([{ rphEventId: '1', eventDate: '2026-01-10', matches: [win('a', 'b')] }])
    expect(one.get('a')!.rating - INITIAL_RATING).toBeCloseTo(INITIAL_RATING - one.get('b')!.rating, 9)
  })

  it('processes events by date then rph event id, whatever order they arrive in', () => {
    const e1 = { rphEventId: '99', eventDate: '2026-01-10', matches: [win('a', 'b')] }
    const e2 = { rphEventId: '100', eventDate: '2026-01-10', matches: [win('b', 'a')] }
    const e3 = { rphEventId: '5', eventDate: '2026-03-01', matches: [win('a', 'c')] }
    const a = rateEvents([e3, e2, e1]).get('a')!
    expect(a.history.map((h) => h.rphEventId)).toEqual(['99', '100', '5'])
    expect(rateEvents([e1, e2, e3])).toEqual(rateEvents([e3, e2, e1]))
    expect(a).toMatchObject({ matches: 3, wins: 2, losses: 1, draws: 0, lastEventDate: '2026-03-01' })
  })

  it('skips byes and unreported matches, and scores a draw as 0.5', () => {
    const rated = rateEvents([
      {
        rphEventId: '1',
        eventDate: '2026-01-10',
        matches: [
          { player1Id: 'a', player2Id: null, winnerId: 'a', isDraw: false }, // bye
          { player1Id: 'a', player2Id: 'b', winnerId: null, isDraw: false }, // unreported
          { player1Id: 'c', player2Id: 'd', winnerId: null, isDraw: true },
        ],
      },
    ])
    expect(rated.has('a')).toBe(false)
    expect(rated.has('b')).toBe(false)
    expect(rated.get('c')).toMatchObject({ rating: INITIAL_RATING, matches: 1, draws: 1 })
    expect(rated.get('c')!.rd).toBeLessThan(INITIAL_RD)
  })

  it('throws on a winner who is neither player', () => {
    expect(() =>
      rateEvents([{ rphEventId: '1', eventDate: '2026-01-10', matches: [{ player1Id: 'a', player2Id: 'b', winnerId: 'z', isDraw: false }] }])
    ).toThrow(/neither player/)
  })
})
