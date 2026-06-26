import { describe, it, expect } from 'vitest'
import { routeTitle } from '../routeTitle'

describe('routeTitle', () => {
  it('returns the full branded title for home', () => {
    expect(routeTitle('/')).toBe('Lorcana Pro Tools — Competitive tools for Disney Lorcana')
  })

  it('suffixes known pages with the site name', () => {
    expect(routeTitle('/deck-insights')).toBe('Deck Insights · Lorcana Pro Tools')
    expect(routeTitle('/team-analytics')).toBe('Team Analytics · Lorcana Pro Tools')
  })

  it('matches dynamic routes by prefix', () => {
    expect(routeTitle('/players/SomeName')).toBe('Player Profile · Lorcana Pro Tools')
    expect(routeTitle('/scouting/game/abc-123')).toBe('Scouted Game · Lorcana Pro Tools')
  })

  it('falls back to the bare site name for unknown routes', () => {
    expect(routeTitle('/nope')).toBe('Lorcana Pro Tools')
  })
})
