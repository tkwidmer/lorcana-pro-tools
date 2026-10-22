import { describe, it, expect } from 'vitest'
import {
  rowToState, startTimer, pauseTimer, resetTimer, timerRemainingMs, timerPatch, formatClock,
  timerFromRph, rphClockPatch, featureMatchPatch, swapSidesPatch, winnerIndex, breakHeadline, themeTextColor, DEFAULT_THEME, nameSizeClass,
} from '../streamOverlay'

const row = (overrides = {}) => ({
  id: 't1', name: 'Table 1', mode: 'live', theme_fill: '#17171a', theme_accent: '#b5832a', event_name: 'Open', event_logo_url: '', sponsor_logo_url: '', round: 'Top 16', note: 'Top 8 at 5pm',
  timer_ends_at: null, timer_remaining_ms: 50 * 60 * 1000, rph_event_id: null,
  p1_name: 'Ryan', p1_record: '5-0-2', p1_inks: ['amethyst', 'emerald'], p1_lore: 12, p1_game_wins: 0,
  p2_name: 'Dylan', p2_record: '5-2-0', p2_inks: ['amber'], p2_lore: 7, p2_game_wins: 1,
  ...overrides,
})

describe('streamOverlay row mapping', () => {
  it('turns a row into the render shape, parsing the clock target', () => {
    const s = rowToState(row({ timer_ends_at: '2026-05-24T23:38:39+00:00' }))
    expect(s.timerEndsAt).toBe(Date.parse('2026-05-24T23:38:39+00:00'))
    expect(s.players[0]).toEqual({ name: 'Ryan', record: '5-0-2', inks: ['amethyst', 'emerald'], lore: 12, gameWins: 0 })
    expect(s.players[1].gameWins).toBe(1)
    expect(s.note).toBe('Top 8 at 5pm')
    expect(rowToState(row()).timerEndsAt).toBeNull()
  })

  it('steps a name down a size class as it outgrows the slot', () => {
    const sizes = [['text-4xl', 13], ['text-3xl', 17], ['text-2xl', 22]]
    expect(nameSizeClass('Ryan', sizes)).toBe('text-4xl')
    expect(nameSizeClass('Jonathan Reyes', sizes)).toBe('text-3xl')
    expect(nameSizeClass('Christopher Lee', sizes)).toBe('text-3xl')
    expect(nameSizeClass('Christopher Montgomery', sizes)).toBe('text-2xl')
    expect(nameSizeClass('Maximilian Featherstonehaugh', sizes)).toBe('text-2xl')
  })

  it('names the winner only once a side reaches the match win count', () => {
    expect(winnerIndex(rowToState(row()).players)).toBeNull()
    expect(winnerIndex(rowToState(row({ p2_game_wins: 2 })).players)).toBe(1)
    expect(winnerIndex(rowToState(row({ p1_game_wins: 2, p2_game_wins: 1 })).players)).toBe(0)
    expect(rowToState(row({ mode: 'break' })).mode).toBe('break')
  })

  it('headlines the break screen from the score alone', () => {
    const fresh = rowToState(row({ p1_game_wins: 0, p2_game_wins: 0 })).players
    expect(breakHeadline(fresh)).toEqual({ label: 'Next match', score: null, winner: null })
    const decided = rowToState(row({ p1_game_wins: 1, p2_game_wins: 2 })).players
    expect(breakHeadline(decided)).toEqual({ label: 'Final', score: '1-2', winner: 1 })
    const midway = rowToState(row({ p1_game_wins: 1, p2_game_wins: 0 })).players
    expect(breakHeadline(midway)).toEqual({ label: 'Match in progress', score: '1-0', winner: null })
  })

  it('derives the text color from the fill, and carries the theme on the state', () => {
    expect(themeTextColor(DEFAULT_THEME.fill)).toBe('#f2f1ee')
    expect(themeTextColor('#b00020')).toBe('#f2f1ee')
    expect(themeTextColor('#ffffff')).toBe('#17171a')
    expect(themeTextColor('#f5e6b3')).toBe('#17171a')
    expect(rowToState(row({ theme_fill: '#ffffff', theme_accent: '#b00020' })).theme)
      .toEqual({ fill: '#ffffff', accent: '#b00020', text: '#17171a' })
  })

  it('swaps every per-side column', () => {
    const p = swapSidesPatch(row())
    expect(p.p1_name).toBe('Dylan')
    expect(p.p2_name).toBe('Ryan')
    expect(p.p1_inks).toEqual(['amber'])
    expect(p.p2_lore).toBe(12)
    expect(p.p1_game_wins).toBe(1)
  })
})

describe('streamOverlay timer', () => {
  it('starts from the paused remainder and counts down against wall time', () => {
    const paused = rowToState(row())
    expect(timerRemainingMs(paused, 123)).toBe(50 * 60 * 1000)
    const patch = startTimer(paused, 1000)
    expect(patch.timer_ends_at).toBe(new Date(1000 + 50 * 60 * 1000).toISOString())
    const running = rowToState(row(patch))
    expect(timerRemainingMs(running, 1000 + 60 * 1000)).toBe(49 * 60 * 1000)
  })

  it('pauses by freezing the remainder, and never goes below zero', () => {
    const running = rowToState(row(startTimer(rowToState(row(resetTimer(1))), 0)))
    const paused = pauseTimer(running, 20 * 1000)
    expect(paused).toEqual({ timer_ends_at: null, timer_remaining_ms: 40 * 1000 })
    expect(timerRemainingMs(running, 5 * 60 * 1000)).toBe(0)
  })

  it('start and pause are no-ops when already in that state', () => {
    const paused = rowToState(row())
    expect(pauseTimer(paused)).toBeNull()
    const running = rowToState(row(startTimer(paused, 0)))
    expect(startTimer(running, 99)).toBeNull()
  })

  it('formats the clock like a tournament stream', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(59 * 1000 + 1)).toBe('1:00')
    expect(formatClock(37 * 60 * 1000 + 48 * 1000)).toBe('37:48')
    expect(formatClock(60 * 60 * 1000)).toBe('1:00:00')
  })
})

describe('streamOverlay RPH', () => {
  it('maps a running RPH clock to a wall-time target', () => {
    const t = timerFromRph({ timerEndDatetime: '2026-05-24T23:38:39+00:00', timerIsRunning: true, timerPausedAtDatetime: null })
    expect(t).toEqual({ timerEndsAt: Date.parse('2026-05-24T23:38:39+00:00'), timerRemainingMs: 0 })
    expect(timerPatch(t).timer_ends_at).toBe('2026-05-24T23:38:39.000Z')
  })

  it('maps a paused RPH clock to its remainder, and no clock to no patch', () => {
    expect(rphClockPatch({
      timerEndDatetime: '2026-05-24T23:38:39+00:00', timerIsRunning: false, timerPausedAtDatetime: '2026-05-24T22:28:39+00:00',
    })).toEqual({ timer_ends_at: null, timer_remaining_ms: 70 * 60 * 1000 })
    expect(rphClockPatch({ timerEndDatetime: null, timerIsRunning: false, timerPausedAtDatetime: null })).toBeNull()
  })

  it('builds the feature-match patch: names, records, event, round, clock, link; scores reset; inks untouched', () => {
    const p = featureMatchPatch({
      eventName: 'Open', round: 'Top 16', rphEventId: 528227,
      players: [{ name: 'Ryan', record: '5-2-0' }, { name: 'Dylan', record: '5-0-2' }],
      timer: { timerEndsAt: null, timerRemainingMs: 70 * 60 * 1000 },
    })
    expect(p).toEqual({
      timer_ends_at: null, timer_remaining_ms: 70 * 60 * 1000, rph_event_id: 528227, event_name: 'Open', round: 'Top 16',
      p1_name: 'Ryan', p1_record: '5-2-0', p1_lore: 0, p1_game_wins: 0,
      p2_name: 'Dylan', p2_record: '5-0-2', p2_lore: 0, p2_game_wins: 0,
    })
    expect(featureMatchPatch({ eventName: '', round: '', rphEventId: 1, players: [{ name: 'A', record: '' }, { name: 'B', record: '' }], timer: null }))
      .not.toHaveProperty('timer_ends_at')
  })
})
