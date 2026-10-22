import { describe, it, expect } from 'vitest'
import { isSideEvent, isParentEvent } from '../sideEvents'

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
})
