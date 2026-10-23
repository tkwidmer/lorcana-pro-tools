import { describe, it, expect } from 'vitest'
import { isSideEvent, isParentEvent, isMajor, MIN_MAJOR_PLAYERS } from '../sideEvents'

const dlc = { store_name: 'Fanfinity', event_date: '2026-03-07', event_tier: 'challenge' }
const nacc = { store_name: 'Fanfinity', event_date: '2026-08-29', event_tier: 'challenge_championship' }
const parents = [dlc, nacc]

describe('sideEvents', () => {
  it('a generic-template event at a DLC store within three days is a side event', () => {
    expect(isSideEvent({ store_name: 'Fanfinity', event_date: '2026-03-08', event_tier: 'weekly_constructed' }, parents)).toBe(true)
    expect(isSideEvent({ store_name: 'Fanfinity', event_date: '2026-03-04', event_tier: null }, parents)).toBe(true)
  })
  it('outside the window, at another store, or on a major template it is not', () => {
    expect(isSideEvent({ store_name: 'Fanfinity', event_date: '2026-03-11', event_tier: 'weekly_constructed' }, parents)).toBe(false)
    expect(isSideEvent({ store_name: 'Pastimes Events', event_date: '2026-03-07', event_tier: 'weekly_constructed' }, parents)).toBe(false)
    expect(isSideEvent({ store_name: 'Fanfinity', event_date: '2026-08-28', event_tier: 'lcq' }, parents)).toBe(false)
    expect(isSideEvent(dlc, parents)).toBe(false)
  })
  it('only DLC and Championship tiers are parents', () => {
    expect(parents.every(isParentEvent)).toBe(true)
    expect(isParentEvent({ store_name: 'Fanfinity', event_date: '2026-08-28', event_tier: 'lcq' })).toBe(false)
  })

  it('a major is an official tier, or a generic-tier event of 100+ players that is not a side event', () => {
    expect(MIN_MAJOR_PLAYERS).toBe(100)
    expect(isMajor({ store_name: 'Copag', event_date: '2026-05-02', event_tier: 'challenge', starting_player_count: 34 }, parents)).toBe(true)
    expect(isMajor({ store_name: 'Madverse', event_date: '2025-11-15', event_tier: 'weekly_constructed', starting_player_count: 365 }, parents)).toBe(true)
    expect(isMajor({ store_name: 'Angry Goose Games', event_date: '2026-05-16', event_tier: 'weekly_constructed', starting_player_count: 42 }, parents)).toBe(false)
    expect(isMajor({ store_name: 'Fanfinity', event_date: '2026-03-08', event_tier: null, starting_player_count: 494 }, parents)).toBe(false)
    expect(isMajor({ store_name: 'Some Shop', event_date: '2026-01-01', event_tier: 'weekly_constructed' }, parents)).toBe(false)
  })
})
