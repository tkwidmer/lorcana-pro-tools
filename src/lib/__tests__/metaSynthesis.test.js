import { describe, it, expect } from 'vitest'
import {
  aggregateArchetypes,
  topPlayedArchetypes,
  topWinRateArchetypes,
  bottomWinRateArchetypes,
  listReliableArchetypes,
  archetypeMatchupSummary,
  topSignatureCards,
  buildSynthesis,
  compareRankBands,
  compareWeeks,
} from '../metaSynthesis'

const profiles = [
  // Two build variants of the same archetype — should aggregate together.
  { id: 'a1', colors: ['amber', 'amethyst'], archetypeName: 'Midrange', gamesPlayed: 600, wins: 330 },
  { id: 'a2', colors: ['amber', 'amethyst'], archetypeName: 'Midrange', gamesPlayed: 400, wins: 200 },
  { id: 'b', colors: ['amber', 'emerald'], archetypeName: 'Princess Aggro', gamesPlayed: 300, wins: 180 },
  { id: 'c', colors: ['amethyst', 'ruby'], archetypeName: 'Peter Pan', gamesPlayed: 150, wins: 60 },
  // Uncurated (null archetypeName) — should be excluded entirely.
  { id: 'd', colors: ['steel', 'ruby'], archetypeName: null, gamesPlayed: 1000, wins: 500 },
]

const stats = {
  meta: { archetypeMinDisplayGames: 50 },
  activity: { totalGames: 1450, uniquePlayers: 500 },
  profiles,
  colorPairs: [
    { colors: ['amber', 'amethyst'], winRate: 52, firstPlayerWinRate: 58 },
    { colors: ['amber', 'emerald'], winRate: 51, firstPlayerWinRate: 55 },
  ],
}

describe('aggregateArchetypes', () => {
  it('merges variants sharing colors + archetypeName', () => {
    const result = aggregateArchetypes(profiles)
    const midrange = result.find(a => a.archetypeName === 'Midrange')
    expect(midrange.gamesPlayed).toBe(1000)
    expect(midrange.wins).toBe(530)
    expect(midrange.winRate).toBeCloseTo(53)
    expect(midrange.variantCount).toBe(2)
    expect(midrange.name).toBe('Amber/Amethyst Midrange')
  })

  it('excludes uncurated profiles', () => {
    const result = aggregateArchetypes(profiles)
    expect(result.some(a => a.archetypeName == null)).toBe(false)
    expect(result).toHaveLength(3)
  })
})

describe('topPlayedArchetypes', () => {
  it('sorts by games played desc and computes play rate', () => {
    const result = topPlayedArchetypes(stats, { limit: 2 })
    expect(result.map(a => a.archetypeName)).toEqual(['Midrange', 'Princess Aggro'])
    expect(result[0].playRate).toBeCloseTo((1000 / 1450) * 100)
  })
})

describe('topWinRateArchetypes / bottomWinRateArchetypes', () => {
  it('filters out archetypes below the sample-size floor', () => {
    // floor = max(50*2, 100) = 100; Peter Pan (150 games) clears it, so all 3 qualify.
    const result = topWinRateArchetypes(stats, { limit: 5 })
    expect(result.map(a => a.archetypeName).sort()).toEqual(['Midrange', 'Peter Pan', 'Princess Aggro'])
  })

  it('excludes archetypes under a raised min-games floor', () => {
    const result = topWinRateArchetypes(stats, { minGames: 200 })
    expect(result.some(a => a.archetypeName === 'Peter Pan')).toBe(false)
  })

  it('bottom win rate sorts ascending', () => {
    const result = bottomWinRateArchetypes(stats, { limit: 1 })
    expect(result[0].archetypeName).toBe('Peter Pan')
  })
})

describe('buildSynthesis', () => {
  it('produces paragraphs referencing the most-played and best-win-rate archetypes', () => {
    const { paragraphs, topPlayed, topWinRate } = buildSynthesis(stats, {
      queueLabel: 'Core BO1',
      periodLabel: 'the latest week',
      bandLabel: 'all players',
    })
    expect(paragraphs.length).toBeGreaterThan(0)
    expect(paragraphs[0]).toContain('1,450 games')
    expect(topPlayed[0].archetypeName).toBe('Midrange')
    expect(topWinRate[0].archetypeName).toBe('Princess Aggro')
    expect(paragraphs.some(p => p.includes('Midrange'))).toBe(true)
  })

  it('handles zero games gracefully', () => {
    const result = buildSynthesis({ activity: { totalGames: 0 }, profiles: [] }, {})
    expect(result.paragraphs).toHaveLength(1)
    expect(result.topPlayed).toEqual([])
  })
})

describe('listReliableArchetypes', () => {
  it('filters by games floor and sorts by games played desc', () => {
    const result = listReliableArchetypes(stats, { minGames: 200 })
    expect(result.map(a => a.archetypeName)).toEqual(['Midrange', 'Princess Aggro'])
  })
})

const archetypeMatchups = [
  { archetypeIdA: 'a1', archetypeIdB: 'b', games: 100, winsA: 60, winRate: 60 },
  { archetypeIdA: 'a2', archetypeIdB: 'b', games: 50, winsA: 20, winRate: 40 },
  { archetypeIdA: 'a1', archetypeIdB: 'c', games: 40, winsA: 10, winRate: 25 },
  { archetypeIdA: 'a1', archetypeIdB: 'a2', games: 30, winsA: 15, winRate: 50 },
]

describe('archetypeMatchupSummary', () => {
  const statsWithMatchups = { ...stats, archetypeMatchups }
  const midrangeKey = aggregateArchetypes(profiles).find(a => a.archetypeName === 'Midrange').key

  it('rolls up matchups across build variants and finds best/worst/mirror', () => {
    const summary = archetypeMatchupSummary(statsWithMatchups, midrangeKey, { minGames: 30 })
    expect(summary.best.name).toBe('Amber/Emerald Princess Aggro')
    expect(summary.best.winRate).toBeCloseTo((80 / 150) * 100)
    expect(summary.worst.name).toBe('Amethyst/Ruby Peter Pan')
    expect(summary.mirror.winRate).toBeCloseTo(50)
  })

  it('returns null for an unknown archetype key', () => {
    expect(archetypeMatchupSummary(statsWithMatchups, 'nonexistent')).toBeNull()
  })
})

const profilesWithLift = profiles.map(p => p.id === 'a1'
  ? {
    ...p,
    cardLift: [
      { cardId: '10-1', lift: 2.5, winRateWith: 58, presence: 0.2 },
      { cardId: '10-2', lift: -1, winRateWith: 40, presence: 0.1 },
      { cardId: '10-3', lift: 1.2, winRateWith: 55, presence: 0.15 },
    ],
  }
  : p)

describe('topSignatureCards', () => {
  const statsWithLift = { ...stats, profiles: profilesWithLift }
  const midrangeKey = aggregateArchetypes(profilesWithLift).find(a => a.archetypeName === 'Midrange').key

  it('returns the top positive-lift cards from the largest-sample variant, resolved by name', () => {
    const cards = topSignatureCards(statsWithLift, midrangeKey, { limit: 2, resolveName: id => `Card ${id}` })
    expect(cards.map(c => c.cardId)).toEqual(['10-1', '10-3'])
    expect(cards[0].name).toBe('Card 10-1')
  })

  it('returns [] for an unknown archetype', () => {
    expect(topSignatureCards(statsWithLift, 'nope')).toEqual([])
  })
})

describe('buildSynthesis with a focus archetype', () => {
  const combined = { ...stats, profiles: profilesWithLift, archetypeMatchups }
  const midrangeKey = aggregateArchetypes(profilesWithLift).find(a => a.archetypeName === 'Midrange').key

  it('adds matchup and signature-card paragraphs when a focus archetype is given', () => {
    const { focusMatchups, focusCards, paragraphs } = buildSynthesis(combined, {
      focusArchetypeKey: midrangeKey,
      resolveCardName: id => `Card ${id}`,
    })
    expect(focusMatchups.best).toBeTruthy()
    expect(focusCards.length).toBeGreaterThan(0)
    expect(paragraphs.some(p => p.startsWith('Playing Amber/Amethyst Midrange?'))).toBe(true)
    expect(paragraphs.some(p => p.includes('signature cards'))).toBe(true)
  })

  it('omits focus paragraphs when no focus archetype is given', () => {
    const { focusMatchups, focusCards } = buildSynthesis(combined, {})
    expect(focusMatchups).toBeNull()
    expect(focusCards).toEqual([])
  })
})

describe('compareWeeks', () => {
  const thisWeek = {
    activity: { totalGames: 1000 },
    profiles: [
      { id: 'x1', colors: ['amber', 'amethyst'], archetypeName: 'Midrange', gamesPlayed: 400, wins: 200 },
      { id: 'x2', colors: ['amber', 'emerald'], archetypeName: 'Princess Aggro', gamesPlayed: 100, wins: 50 },
    ],
  }
  const lastWeek = {
    activity: { totalGames: 1000 },
    profiles: [
      { id: 'y1', colors: ['amber', 'amethyst'], archetypeName: 'Midrange', gamesPlayed: 100, wins: 50 },
      { id: 'y2', colors: ['amber', 'emerald'], archetypeName: 'Princess Aggro', gamesPlayed: 400, wins: 200 },
    ],
  }

  it('flags archetypes gaining or losing ground week over week', () => {
    const { risers, fallers, paragraph } = compareWeeks(thisWeek, lastWeek, {})
    expect(risers.map(r => r.name)).toContain('Amber/Amethyst Midrange')
    expect(fallers.map(f => f.name)).toContain('Amber/Emerald Princess Aggro')
    expect(paragraph).toContain('meta is moving')
  })

  it('returns no paragraph when either week has no games', () => {
    const result = compareWeeks({ activity: { totalGames: 0 }, profiles: [] }, lastWeek, {})
    expect(result.paragraph).toBeNull()
  })
})

describe('compareRankBands', () => {
  const upper = {
    activity: { totalGames: 1000 },
    profiles: [
      { id: 'x1', colors: ['amber', 'amethyst'], archetypeName: 'Midrange', gamesPlayed: 400, wins: 200 },
      { id: 'x2', colors: ['amber', 'emerald'], archetypeName: 'Princess Aggro', gamesPlayed: 100, wins: 50 },
    ],
  }
  const lower = {
    activity: { totalGames: 1000 },
    profiles: [
      { id: 'y1', colors: ['amber', 'amethyst'], archetypeName: 'Midrange', gamesPlayed: 100, wins: 50 },
      { id: 'y2', colors: ['amber', 'emerald'], archetypeName: 'Princess Aggro', gamesPlayed: 400, wins: 200 },
    ],
  }

  it('flags archetypes that shift meaningfully between bands', () => {
    const { risers, fallers, paragraph } = compareRankBands(upper, lower, {
      upperLabel: 'Epic+', lowerLabel: 'lower ranks',
    })
    expect(risers.map(r => r.name)).toContain('Amber/Amethyst Midrange')
    expect(fallers.map(f => f.name)).toContain('Amber/Emerald Princess Aggro')
    expect(paragraph).toContain('shifts with rank')
  })

  it('returns no paragraph when either band has no games', () => {
    const result = compareRankBands({ activity: { totalGames: 0 }, profiles: [] }, lower, {})
    expect(result.paragraph).toBeNull()
  })
})
