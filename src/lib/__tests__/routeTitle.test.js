import { describe, it, expect } from 'vitest'
import { routeTitle, routeDescription } from '../routeTitle'

describe('routeTitle', () => {
  it('returns the full branded title for home', () => {
    expect(routeTitle('/')).toBe('InkbornForge — Competitive tools for Disney Lorcana')
  })

  it('suffixes known pages with the site name', () => {
    expect(routeTitle('/deck-insights')).toBe('Deck Insights · InkbornForge')
    expect(routeTitle('/analytics')).toBe('Analytics · InkbornForge')
  })

  it('matches dynamic routes by prefix', () => {
    expect(routeTitle('/players/SomeName')).toBe('Player Profile · InkbornForge')
    expect(routeTitle('/scouting/game/abc-123')).toBe('Scouted Game · InkbornForge')
  })

  it('resolves blog routes, including a post by its slug', () => {
    expect(routeTitle('/blog')).toBe('Blog · InkbornForge')
    expect(routeTitle('/blog/welcome-to-the-blog')).toBe('Welcome to the InkbornForge blog · InkbornForge')
    expect(routeTitle('/blog/no-such-post')).toBe('InkbornForge')
  })

  it('falls back to the bare site name for unknown routes', () => {
    expect(routeTitle('/nope')).toBe('InkbornForge')
  })
})

describe('routeDescription', () => {
  it('returns a page-specific description for known public routes', () => {
    expect(routeDescription('/proxy')).toMatch(/proxy sheets/)
    expect(routeDescription('/lore-tracker')).toMatch(/lore counter/)
  })

  it('falls back to the home description for unknown or gated routes', () => {
    expect(routeDescription('/nope')).toBe(routeDescription('/'))
    expect(routeDescription('/deck-insights')).toBe(routeDescription('/'))
  })
})
