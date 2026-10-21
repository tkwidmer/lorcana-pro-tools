import { describe, it, expect } from 'vitest'
import {
  defaultState, defaultPlayer, startTimer, pauseTimer, resetTimer, timerRemainingMs, formatClock,
  clampLore, clampGameWins, channelName, newChannelId, swapSides, applyFeatureMatch,
} from '../streamOverlay'

describe('streamOverlay timer', () => {
  it('starts from the paused remainder and counts down against wall time', () => {
    const paused = resetTimer(defaultState(), 50)
    expect(timerRemainingMs(paused, 123)).toBe(50 * 60 * 1000)
    const running = startTimer(paused, 1000)
    expect(running.timerEndsAt).toBe(1000 + 50 * 60 * 1000)
    expect(timerRemainingMs(running, 1000 + 60 * 1000)).toBe(49 * 60 * 1000)
  })

  it('pauses by freezing the remainder, and never goes below zero', () => {
    const running = startTimer(resetTimer(defaultState(), 1), 0)
    const paused = pauseTimer(running, 20 * 1000)
    expect(paused.timerEndsAt).toBeNull()
    expect(paused.timerRemainingMs).toBe(40 * 1000)
    expect(timerRemainingMs(running, 5 * 60 * 1000)).toBe(0)
  })

  it('start and pause are no-ops when already in that state', () => {
    const paused = defaultState()
    expect(pauseTimer(paused)).toBe(paused)
    const running = startTimer(paused, 0)
    expect(startTimer(running, 99)).toBe(running)
  })

  it('formats the clock like a tournament stream', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(59 * 1000 + 1)).toBe('1:00')
    expect(formatClock(37 * 60 * 1000 + 48 * 1000)).toBe('37:48')
    expect(formatClock(60 * 60 * 1000)).toBe('1:00:00')
  })
})

describe('streamOverlay counters and channel', () => {
  it('clamps lore to 0–99 and game wins to 0–2', () => {
    expect(clampLore(-1)).toBe(0)
    expect(clampLore(100)).toBe(99)
    expect(clampGameWins(3)).toBe(2)
    expect(clampGameWins(-2)).toBe(0)
  })

  it('names a channel from a generated id and rejects junk ids', () => {
    const id = newChannelId()
    expect(channelName(id)).toBe(`stream-overlay:${id}`)
    expect(() => channelName('../x')).toThrow()
    expect(() => channelName('')).toThrow()
  })
})

describe('streamOverlay feature match', () => {
  it('loads names, records, event and round, resets scores, keeps inks', () => {
    const before = { ...defaultState(), players: [{ name: 'A', record: '', inks: ['ruby'], lore: 9, gameWins: 1 }, defaultPlayer('B')] }
    const after = applyFeatureMatch(before, {
      eventName: 'Open', round: 'Top 16',
      players: [{ name: 'Ryan', record: '5-2-0' }, { name: 'Dylan', record: '5-0-2' }],
    })
    expect(after.eventName).toBe('Open')
    expect(after.round).toBe('Top 16')
    expect(after.players[0]).toEqual({ name: 'Ryan', record: '5-2-0', inks: ['ruby'], lore: 0, gameWins: 0 })
    expect(after.players[1].name).toBe('Dylan')
  })

  it('swaps the two sides', () => {
    const s = swapSides({ ...defaultState(), players: [defaultPlayer('L'), defaultPlayer('R')] })
    expect(s.players.map(p => p.name)).toEqual(['R', 'L'])
  })
})
