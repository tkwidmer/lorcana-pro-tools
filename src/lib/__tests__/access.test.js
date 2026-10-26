import { existsSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { SUPPORTER_PATHS, isSupporterPath } from '../access'
import { findTool } from '../siteSections'

describe('access', () => {
  it('flags known supporter-gated paths', () => {
    expect(isSupporterPath('/deck-insights')).toBe(true)
    expect(isSupporterPath('/library')).toBe(true)
    expect(isSupporterPath('/game-scraper')).toBe(true)
    expect(isSupporterPath('/deck-doctor')).toBe(true)
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

  // SupporterRoute's gate shows public/previews/<path>.jpg for the locked tool.
  it('every gated path is a catalog tool with a preview screenshot', () => {
    for (const path of SUPPORTER_PATHS) {
      expect(findTool(path)?.tool.path, path).toBe(path)
      expect(existsSync(`public/previews${path}.jpg`), `public/previews${path}.jpg`).toBe(true)
    }
  })

  it('SUPPORTER_PATHS is a Set instance usable by both App.jsx and HomePage', () => {
    expect(SUPPORTER_PATHS).toBeInstanceOf(Set)
    expect(SUPPORTER_PATHS.size).toBeGreaterThan(0)
  })
})
