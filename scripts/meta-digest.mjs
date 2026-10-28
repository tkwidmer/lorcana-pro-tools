// Drafts the weekly Core Bo1 meta digest: content/blog/core-meta-<week start>.md
// for the latest complete duels.ink week against the one before, always with
// `draft: true`. Run by .github/workflows/meta-digest.yml every Monday, or
// locally: `node scripts/meta-digest.mjs`.
//
// Exits 0 without writing when the week's post already exists (a week is
// never overwritten), when the era has fewer than two complete weeks, when
// the latest week has under 1,000 games, or when duels.ink's undocumented
// archetype fields are missing.
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createServer } from 'vite'

const QUEUE = 'core-bo1'
const MIN_GAMES = 1000
const root = fileURLToPath(new URL('..', import.meta.url))

async function getStats(params) {
  const url = `https://duels.ink/api/stats/meta?${new URLSearchParams({ queue: QUEUE, ...params })}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`duels.ink returned ${res.status} for ${url}`)
  return res.json()
}

function skip(reason) {
  console.log(`meta-digest: nothing written, ${reason}`)
  process.exit(0)
}

// Same era scoping as fetchStats() in src/lib/duelsApi.js.
const era = (await getStats({ period: 'all_time' })).meta.eras.currentEra.key
const { meta } = await getStats({ period: 'all_time', era })
const complete = meta.availableWeeks
  .filter(w => w.startDate !== meta.currentWeek.startDate)
  .sort((a, b) => a.startDate.localeCompare(b.startDate))
if (complete.length < 2) skip(`era ${era} has ${complete.length} complete week(s)`)
const [prevWeek, week] = complete.slice(-2)

const file = `${root}content/blog/core-meta-${week.startDate}.md`
if (fs.existsSync(file)) skip(`core-meta-${week.startDate} already exists`)

const [stats, prevStats] = await Promise.all([
  getStats({ period: `week:${week.startDate}`, era }),
  getStats({ period: `week:${prevWeek.startDate}`, era }),
])
if (stats.activity.totalGames < MIN_GAMES) skip(`${week.label} has ${stats.activity.totalGames} games`)
if (![stats, prevStats].every(s => s.profiles?.some(p => p.archetypeName))) {
  skip('duels.ink returned no named archetypes (profiles[].archetypeName)')
}

// src/lib imports are extensionless, so load them through Vite.
const vite = await createServer({ root, configFile: false, logLevel: 'warn', server: { middlewareMode: true }, appType: 'custom' })
const { digestPost } = await vite.ssrLoadModule('/src/lib/metaDigest.js')
await vite.close()

const date = new Date().toISOString().slice(0, 10)
const { slug, markdown } = digestPost({ stats, prevStats, week, prevWeek, date })
fs.writeFileSync(file, markdown)
console.log(`meta-digest: wrote ${slug} (${week.label} vs ${prevWeek.label})`)
