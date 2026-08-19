import { describe, it, expect } from 'vitest'
import { SUPPORTER_PATHS, isSupporterPath } from '../access'

describe('access', () => {
  it('flags known supporter-gated paths', () => {
    expect(isSupporterPath('/deck-insights')).toBe(true)
    expect(isSupporterPath('/library')).toBe(true)
    expect(isSupporterPath('/game-scraper')).toBe(true)
  })

  it('does not flag public paths', () => {
    expect(isSupporterPath('/')).toBe(false)
    expect(isSupporterPath('/proxy')).toBe(false)
    expect(isSupporterPath('/settings')).toBe(false)
  })

  it('is exact-match only, not a prefix match', () => {
    expect(isSupporterPath('/library/extra')).toBe(false)
    expect(isSupporterPath('/librar')).toBe(false)
  })

  it('SUPPORTER_PATHS is a Set instance usable by both App.jsx and HomePage', () => {
    expect(SUPPORTER_PATHS).toBeInstanceOf(Set)
    expect(SUPPORTER_PATHS.size).toBeGreaterThan(0)
  })
})
