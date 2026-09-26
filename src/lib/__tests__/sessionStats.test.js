import { describe, it, expect } from 'vitest'
import {
  buildSessions,
  winRateByPosition,
  winRateAfterLossStreak,
  winRateByTimeOfDay,
  winRateByDayOfWeek,
  stopLossSuggestion,
  summarizeSessions,
  STOP_LOSS_MIN_GAMES,
} from '../sessionStats'
import { diffInterval } from '../practiceSim'

const MIN = 60 * 1000
let nextId = 0

// A game starting at `start` (ms or ISO) lasting `durationMin` minutes.
function game(start, result, { durationMin = 10, bot = false, mmr = null } = {}) {
  const s = typeof start === 'number' ? start : new Date(start).getTime()
  return {
    game_id: `g${nextId++}`,
    started_at: new Date(s).toISOString(),
    ended_at: new Date(s + durationMin * MIN).toISOString(),
    result,
    mmr_delta: mmr,
    opp_is_bot: bot,
  }
}

// Back-to-back games (no gap) starting at `start`, one per result.
function run(start, results) {
  const s0 = new Date(start).getTime()
  return results.map((r, i) => game(s0 + i * 10 * MIN, r))
}

describe('diffInterval', () => {
  it("matches Newcombe's published example (56/70 vs 48/80)", () => {
    const [lo, hi] = diffInterval(56, 70, 48, 80)
    expect(lo).toBeCloseTo(0.0524, 3)
    expect(hi).toBeCloseTo(0.3339, 3)
  })

  it('throws on an empty sample', () => {
    expect(() => diffInterval(0, 0, 5, 10)).toThrow()
  })
})

describe('buildSessions', () => {
  const t0 = new Date('2026-09-01T12:00:00Z').getTime()

  it('keeps a game in the same session at exactly the gap, and splits one second past it', () => {
    const a = game(t0, 'win') // ends t0 + 10m
    const b = game(t0 + 10 * MIN + 30 * MIN, 'win') // gap exactly 30m
    const c = game(new Date(b.ended_at).getTime() + 30 * MIN + 1000, 'win') // gap 30m + 1s
    const sessions = buildSessions([c, a, b])
    expect(sessions.map(s => s.games.length)).toEqual([2, 1])
    expect(sessions[0].games.map(g => g.positionInSession)).toEqual([1, 2])
  })

  it('excludes bot games', () => {
    const sessions = buildSessions([game(t0, 'win'), game(t0 + 10 * MIN, 'win', { bot: true })])
    expect(sessions[0].games).toHaveLength(1)
    expect(summarizeSessions(sessions, 2).botGamesExcluded).toBe(1)
  })

  it('throws when a row is missing its timestamps', () => {
    expect(() => buildSessions([{ game_id: 'x', started_at: '2026-09-01T00:00:00Z', result: 'win' }])).toThrow(/x/)
  })
})

describe('winRateByPosition', () => {
  it('buckets game number within the session, with 6+ pooled', () => {
    const sessions = buildSessions(run('2026-09-01T12:00:00Z', ['win', 'loss', 'win', 'win', 'loss', 'loss', 'loss']))
    const byKey = Object.fromEntries(winRateByPosition(sessions).map(b => [b.key, b]))
    expect(byKey['1']).toMatchObject({ wins: 1, losses: 0, winRate: 1 })
    expect(byKey['6+']).toMatchObject({ wins: 0, losses: 2, games: 2 })
  })

  it('counts draws/abandoned toward session position but not win rate', () => {
    const sessions = buildSessions(run('2026-09-01T12:00:00Z', ['draw', 'win']))
    const byKey = Object.fromEntries(winRateByPosition(sessions).map(b => [b.key, b]))
    expect(byKey['1'].games).toBe(0)
    expect(byKey['2']).toMatchObject({ wins: 1, games: 1 })
  })
})

describe('winRateAfterLossStreak', () => {
  it('buckets by losses in a row before each game, ignoring non-decisive games', () => {
    // L L (draw) W → the win comes after 2 losses; the 2nd L after 1 loss
    const sessions = buildSessions(run('2026-09-01T12:00:00Z', ['loss', 'loss', 'draw', 'win', 'win']))
    const byKey = Object.fromEntries(winRateAfterLossStreak(sessions).map(b => [b.key, b]))
    expect(byKey['1']).toMatchObject({ wins: 0, losses: 1 })
    expect(byKey['2']).toMatchObject({ wins: 1, losses: 0 })
    expect(byKey['0']).toMatchObject({ wins: 1, losses: 0 })
  })

  it('resets the streak at a session boundary', () => {
    const first = run('2026-09-01T12:00:00Z', ['loss', 'loss'])
    const second = run('2026-09-01T20:00:00Z', ['win'])
    const byKey = Object.fromEntries(winRateAfterLossStreak(buildSessions([...first, ...second])).map(b => [b.key, b]))
    // The later session's first game has no in-session history, so it isn't counted anywhere.
    expect(byKey['2'].games).toBe(0)
    expect(byKey['0'].games).toBe(0)
  })
})

describe('time bucketing', () => {
  it('buckets by local hour and by weekday (Monday first)', () => {
    // Local-time constructors, so this holds in any timezone. 2026-09-07 is a Monday.
    const sessions = buildSessions([
      game(new Date(2026, 8, 7, 3).getTime(), 'win'),
      game(new Date(2026, 8, 13, 19).getTime(), 'loss'),
    ])
    const tod = Object.fromEntries(winRateByTimeOfDay(sessions).map(b => [b.key, b]))
    expect(tod.night.wins).toBe(1)
    expect(tod.evening.losses).toBe(1)
    const dow = winRateByDayOfWeek(sessions)
    expect(dow[0]).toMatchObject({ key: 'Mon', wins: 1 })
    expect(dow[6]).toMatchObject({ key: 'Sun', losses: 1 })
  })
})

describe('stopLossSuggestion', () => {
  const bucket = (key, wins, losses) => ({ key, wins, losses, games: wins + losses, winRate: (wins + losses) ? wins / (wins + losses) : null })

  it('returns null when the after-streak sample is too small', () => {
    const buckets = [bucket('0', 60, 40), bucket('1', 20, 20), bucket('2', 1, STOP_LOSS_MIN_GAMES - 3), bucket('3+', 0, 1)]
    expect(stopLossSuggestion(buckets)).toBeNull()
  })

  it('returns null when the drop is within the noise', () => {
    const buckets = [bucket('0', 55, 45), bucket('1', 25, 25), bucket('2', 10, 10), bucket('3+', 5, 5)]
    expect(stopLossSuggestion(buckets)).toBeNull()
  })

  it('suggests a break after 2 losses on a clear drop', () => {
    const buckets = [bucket('0', 120, 80), bucket('1', 40, 40), bucket('2', 8, 30), bucket('3+', 3, 15)]
    const s = stopLossSuggestion(buckets)
    expect(s).toMatchObject({ afterLosses: 2, games: 56 })
    expect(s.streakWinRate).toBeCloseTo(11 / 56)
    expect(s.baselineWinRate).toBeCloseTo(0.6)
  })
})
