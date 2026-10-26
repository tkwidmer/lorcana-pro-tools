// The weekly Core Bo1 meta digest: turns two weeks of duels.ink
// /api/stats/meta responses into a draft blog post (content/blog/<slug>.md).
// scripts/meta-digest.mjs fetches the weeks and writes the file; everything
// that decides what the post says lives here so it stays unit-testable.

import { buildSynthesis, compareWeeks, listReliableArchetypes, winRateSampleFloor } from './metaSynthesis'

const QUEUE_LABEL = 'Core Bo1'
// The lowest-win-rate list ignores fringe decks: a 100-game archetype at 0.1%
// of the meta is noise in a weekly post.
const LOWEST_MIN_META_SHARE = 1

function pct(n) {
  return `${n.toFixed(1)}%`
}

function list(intro, items) {
  return { type: 'list', intro, items }
}

// metaSynthesis.js blocks to Markdown: a text block is a paragraph, a list
// block is its intro paragraph over bullets.
export function renderBlocks(blocks) {
  return blocks
    .map(b => b.type === 'list' ? `${b.intro}\n\n${b.items.map(item => `- ${item}`).join('\n')}` : b.text)
    .join('\n\n')
}

// `week` is a duels.ink meta.availableWeeks entry; `date` is the day the
// draft is written (YYYY-MM-DD). Values are plain strings, as the
// frontmatter parser reads them.
export function digestFrontmatter(week, date) {
  return {
    title: `Core meta, ${week.label}`,
    date,
    description: `What ${QUEUE_LABEL} players on duels.ink played and won with from ${week.label}, and what moved since the week before.`,
    author: 'InkbornForge',
    authorUrl: 'https://inkbornforge.substack.com',
    draft: 'true',
  }
}

export function digestPost({ stats, prevStats, week, prevWeek, date }) {
  const synthesis = buildSynthesis(stats, { queueLabel: QUEUE_LABEL, periodLabel: week.label, bandLabel: 'all ranks' })
  if (synthesis.topPlayed.length === 0) throw new Error(`No named archetypes in the stats for ${week.label}`)
  const moving = compareWeeks(stats, prevStats, { thisLabel: week.label, lastLabel: prevWeek.label })
  const floor = winRateSampleFloor(stats)
  const lowest = listReliableArchetypes(stats, { minGames: floor })
    .filter(a => a.metaShare >= LOWEST_MIN_META_SHARE)
    .sort((a, b) => a.winRate - b.winRate)
    .slice(0, 3)

  const body = [
    renderBlocks([synthesis.blocks[0]]),
    '## Most played',
    renderBlocks([list(
      'The five most-played archetypes, by share of all decks played:',
      synthesis.topPlayed.map(a => `${a.name} — ${pct(a.metaShare)} of the meta, ${pct(a.winRate)} win rate`),
    )]),
    '## Winning',
    renderBlocks([
      list(
        `The best win rates among archetypes with at least ${floor.toLocaleString()} games:`,
        synthesis.topWinRate.map(a => `${a.name} — ${pct(a.winRate)} win rate on ${pct(a.metaShare)} of the meta`),
      ),
      list(
        `And the lowest among archetypes with at least ${LOWEST_MIN_META_SHARE}% of the meta:`,
        lowest.map(a => `${a.name} — ${pct(a.winRate)} win rate on ${pct(a.metaShare)} of the meta`),
      ),
    ]),
    '## Moving',
    moving.blocks.length > 0
      ? renderBlocks(moving.blocks)
      : `No archetype gained or lost a full point of meta share since ${prevWeek.label}.`,
    '---',
    'Every archetype and matchup is on the [Winrate Matrix](/winrate-matrix); supporters can slice the same numbers by rank band in [Meta Synthesis](/meta-synthesis). All data comes from ranked games on [duels.ink](https://duels.ink).',
  ].join('\n\n')

  const frontmatter = digestFrontmatter(week, date)
  const fields = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`).join('\n')
  return {
    slug: `core-meta-${week.startDate}`,
    frontmatter,
    markdown: `---\n${fields}\n---\n\n${body}\n`,
  }
}
