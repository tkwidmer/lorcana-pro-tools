import { describe, it, expect } from 'vitest'
import { digestPost, renderBlocks } from '../metaDigest'
import { parsePost } from '../blogPost'

const week = { startDate: '2026-10-18', endDate: '2026-10-24', label: 'Oct 18 - 24, 2026' }
const prevWeek = { startDate: '2026-10-11', endDate: '2026-10-17', label: 'Oct 11 - 17, 2026' }

const stats = {
  meta: { archetypeMinDisplayGames: 50 },
  activity: { totalGames: 1450, uniquePlayers: 500 },
  profiles: [
    { id: 'a1', colors: ['amber', 'amethyst'], archetypeName: 'Midrange', gamesPlayed: 600, wins: 330 },
    { id: 'a2', colors: ['amber', 'amethyst'], archetypeName: 'Midrange', gamesPlayed: 400, wins: 200 },
    { id: 'b', colors: ['amber', 'emerald'], archetypeName: 'Princess Aggro', gamesPlayed: 300, wins: 180 },
    { id: 'c', colors: ['amethyst', 'ruby'], archetypeName: 'Peter Pan', gamesPlayed: 150, wins: 60 },
  ],
}

// Last week Peter Pan was far bigger and Princess Aggro absent.
const prevStats = {
  meta: { archetypeMinDisplayGames: 50 },
  activity: { totalGames: 1000, uniquePlayers: 400 },
  profiles: [
    { id: 'a1', colors: ['amber', 'amethyst'], archetypeName: 'Midrange', gamesPlayed: 700, wins: 350 },
    { id: 'c', colors: ['amethyst', 'ruby'], archetypeName: 'Peter Pan', gamesPlayed: 600, wins: 300 },
  ],
}

const post = digestPost({ stats, prevStats, week, prevWeek, date: '2026-10-26' })

describe('renderBlocks', () => {
  it('renders text blocks as paragraphs and list blocks as intro + bullets', () => {
    expect(renderBlocks([
      { type: 'text', text: 'One.' },
      { type: 'list', intro: 'Two:', items: ['a', 'b'] },
    ])).toBe('One.\n\nTwo:\n\n- a\n- b')
  })
})

describe('digestPost', () => {
  it('slugs the post by the week start', () => {
    expect(post.slug).toBe('core-meta-2026-10-18')
  })

  it('writes frontmatter parsePost accepts, as a draft', () => {
    const parsed = parsePost(`${post.slug}.md`, post.markdown)
    expect(parsed.title).toBe('Core meta, Oct 18 - 24, 2026')
    expect(parsed.date).toBe('2026-10-26')
    expect(parsed.author).toBe('InkbornForge')
    expect(parsed.draft).toBe(true)
  })

  it('covers volume, most played, winning, moving and the closing links', () => {
    const md = post.markdown
    expect(md).toContain('1,450 games played in Core Bo1 during Oct 18 - 24, 2026 among all ranks, across 500 players.')
    expect(md).toContain('- Amber/Amethyst Midrange — 34.5% of the meta, 53.0% win rate')
    expect(md).toContain('with at least 100 games:\n\n- Amber/Emerald Princess Aggro — 60.0% win rate')
    expect(md).toContain('And the lowest among archetypes with at least 1% of the meta:\n\n- Amethyst/Ruby Peter Pan — 40.0% win rate')
    expect(md).toContain('Gaining ground:\n\n- Amber/Emerald Princess Aggro')
    expect(md).toContain('Losing ground:\n\n- Amethyst/Ruby Peter Pan')
    expect(md).toContain('[Winrate Matrix](/winrate-matrix)')
    expect(md).toContain('[Meta Synthesis](/meta-synthesis)')
  })

  it('says so when nothing moved', () => {
    const still = digestPost({ stats, prevStats: stats, week, prevWeek, date: '2026-10-26' })
    expect(still.markdown).toContain('No archetype gained or lost a full point of meta share since Oct 11 - 17, 2026.')
  })

  it('throws on stats without named archetypes', () => {
    expect(() => digestPost({ stats: { ...stats, profiles: [] }, prevStats, week, prevWeek, date: '2026-10-26' })).toThrow()
  })
})
