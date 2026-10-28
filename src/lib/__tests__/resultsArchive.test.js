import { describe, it, expect } from 'vitest'
import {
  MAJOR_MIN_PLAYERS, isMajor, matchOutcome, toBracketMatch, playerSummary, formatEventDate, ordinal, formatRating, ratingDelta,
} from '../resultsArchive'

const m = (over = {}) => ({
  eventId: 'e1', roundNumber: 1, phaseName: 'Phase 1', tableNumber: 4,
  player1: { id: 'A', name: 'Alice' }, player2: { id: 'B', name: 'Bob' },
  winnerId: 'A', isBye: false, isDraw: false, gamesWonByWinner: 2, gamesWonByLoser: 1,
  ...over,
})

describe('isMajor', () => {
  it('uses the 32-player floor inclusively', () => {
    expect(MAJOR_MIN_PLAYERS).toBe(32)
    expect(isMajor({ startingPlayerCount: 32 })).toBe(true)
    expect(isMajor({ startingPlayerCount: 31 })).toBe(false)
    expect(isMajor({ startingPlayerCount: null })).toBe(false)
  })
})

describe('matchOutcome', () => {
  it('reports a win from the winner side with the score as played', () => {
    expect(matchOutcome(m(), 'A')).toEqual({ result: 'win', opponent: { id: 'B', name: 'Bob' }, score: '2-1' })
  })
  it('flips the score for the loser', () => {
    expect(matchOutcome(m(), 'B')).toEqual({ result: 'loss', opponent: { id: 'A', name: 'Alice' }, score: '1-2' })
  })
  it('handles draws, byes and unreported results', () => {
    expect(matchOutcome(m({ isDraw: true, winnerId: null }), 'A').result).toBe('draw')
    expect(matchOutcome(m({ winnerId: null }), 'A').result).toBe('draw')
    expect(matchOutcome(m({ isBye: true, player2: null, winnerId: null }), 'A')).toEqual({ result: 'bye', opponent: null, score: null })
  })
  it('returns a null score when game counts are missing', () => {
    expect(matchOutcome(m({ gamesWonByWinner: null }), 'A').score).toBeNull()
  })
})

describe('toBracketMatch', () => {
  it('produces the RPH match shape EliminationBracket renders', () => {
    const out = toBracketMatch(m({ phaseName: 'Top 32', roundNumber: 2 }))
    expect(out).toMatchObject({
      round_number: 2, table_number: 4, phase_name: 'Top 32', status: 'COMPLETE',
      match_is_bye: false, match_is_intentional_draw: false, match_is_unintentional_draw: false, winning_player: 'A',
    })
    expect(out.player_match_relationships).toEqual([
      { player_order: 1, player: { id: 'A' }, user_event_status: { best_identifier: 'Alice' } },
      { player_order: 2, player: { id: 'B' }, user_event_status: { best_identifier: 'Bob' } },
    ])
  })
  it('emits one relationship for a bye', () => {
    const out = toBracketMatch(m({ isBye: true, player2: null, winnerId: null }))
    expect(out.match_is_bye).toBe(true)
    expect(out.player_match_relationships).toHaveLength(1)
  })
})

describe('playerSummary', () => {
  const events = [
    { eventId: 'e1', eventName: 'DLC Richmond', rank: 12, madeTopCut: true, startingPlayerCount: 2052 },
    { eventId: 'e2', eventName: 'DLC Ghent', rank: 12, madeTopCut: true, startingPlayerCount: 2030 },
    { eventId: 'e3', eventName: 'CCQ Trial', rank: 40, madeTopCut: false, startingPlayerCount: 60 },
  ]
  const matches = [
    m({ eventId: 'e1', winnerId: 'A' }),
    m({ eventId: 'e1', winnerId: 'B', roundNumber: 2 }),
    m({ eventId: 'e2', player2: { id: 'C', name: 'Cara' }, winnerId: 'A' }),
    m({ eventId: 'e2', isDraw: true, winnerId: null, roundNumber: 2 }),
    m({ eventId: 'e3', isBye: true, player2: null, winnerId: null }),
  ]
  it('counts events, cuts, record (excluding byes) and best finish (ties → larger event)', () => {
    const s = playerSummary({ events, matches, playerId: 'A' })
    expect(s.eventsPlayed).toBe(3)
    expect(s.topCuts).toBe(2)
    expect(s.record).toEqual({ wins: 2, losses: 1, draws: 1 })
    expect(s.bestFinish).toEqual({ rank: 12, eventId: 'e1', eventName: 'DLC Richmond', startingPlayerCount: 2052 })
  })
  it('ranks rivals by meetings then wins, capped at 10, byes excluded', () => {
    const s = playerSummary({ events, matches, playerId: 'A' })
    expect(s.rivals.map((r) => r.playerId)).toEqual(['B', 'C'])
    expect(s.rivals[0]).toEqual({ playerId: 'B', playerName: 'Bob', meetings: 3, wins: 1, losses: 1, draws: 1 })
    const many = Array.from({ length: 12 }, (_, i) => m({ player2: { id: `P${i}`, name: `P${i}` } }))
    expect(playerSummary({ events: [], matches: many, playerId: 'A' }).rivals).toHaveLength(10)
  })
  it('is safe on empty inputs', () => {
    expect(playerSummary({ events: [], matches: [], playerId: 'A' })).toEqual({
      eventsPlayed: 0, topCuts: 0, bestFinish: null, record: { wins: 0, losses: 0, draws: 0 }, rivals: [],
    })
  })
})

describe('formatEventDate', () => {
  it('renders a date-only string as that calendar day in any timezone', () => {
    const expected = new Date(2026, 0, 10).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    expect(formatEventDate('2026-01-10')).toBe(expected)
  })
  it('renders a dash for null', () => {
    expect(formatEventDate(null)).toBe('—')
  })
})

describe('ordinal', () => {
  it('handles the teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 112].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '112th'])
  })
})

describe('ratings', () => {
  it('formats a rating with its deviation, both rounded', () => {
    expect(formatRating({ rating: 1712.4, rd: 59.6 })).toBe('1,712 ± 60')
    expect(formatRating({ rating: 987.5, rd: 120 })).toBe('988 ± 120')
  })

  it('signs the change since the previous event', () => {
    expect(ratingDelta(12.3)).toBe('+12')
    expect(ratingDelta(-7.6)).toBe('−8')
    expect(ratingDelta(0.2)).toBe('0')
    expect(ratingDelta(null)).toBe('—')
  })
})
