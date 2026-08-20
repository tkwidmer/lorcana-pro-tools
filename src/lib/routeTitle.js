// Per-route document titles for the browser tab and SEO. Note: this only
// updates the title client-side after navigation — crawlers that don't run JS
// still see the static index.html title. Keep the wording in sync with the
// tool names on HomePage.

const SITE = 'InkbornForge'
const HOME_TITLE = `${SITE} — Competitive tools for Disney Lorcana`

// Exact-path titles (the page name shown before "· InkbornForge").
const TITLES = {
  '/login': 'Sign in',
  '/sitemap': 'Sitemap',
  '/proxy': 'Proxy Generator',
  '/coconut-deck-builder': 'Coconut Deck Builder',
  '/cut-calculator': 'Cut Calculator',
  '/limited-guide': 'Limited Guide',
  '/rules': 'Rules',
  '/deck-insights': 'Deck Insights',
  '/game-scraper': 'Game Scraper',
  '/library': 'Scouting Library',
  '/deck-comparison': 'Deck Comparison',
  '/decklist-inspector': 'Decklist Inspector',
  '/settings': 'Settings',
  '/match-history': 'Match History',
  '/gamelog': 'Gamelog Viewer',
  '/analytics': 'Analytics',
  '/winrate-matrix': 'Winrate Matrix',
  '/meta-synthesis': 'Meta Synthesis',
  '/practice-plan': 'Practice Plan',
  '/leaderboard': 'Leaderboard',
  '/tournament-lookup': 'Tournament Lookup',
  '/lore-tracker': 'Lore Tracker',
  '/admin': 'Admin',
}

// Dynamic routes matched by prefix.
const PREFIXES = [
  ['/players/', 'Player Profile'],
  ['/scouting/game/', 'Scouted Game'],
  ['/rules/', 'Rules'],
]

export function routeTitle(pathname) {
  if (pathname === '/') return HOME_TITLE

  let page = TITLES[pathname]
  if (!page) {
    const prefix = PREFIXES.find(([p]) => pathname.startsWith(p))
    if (prefix) page = prefix[1]
  }

  return page ? `${page} · ${SITE}` : SITE
}

const HOME_DESCRIPTION =
  'A free suite of tools for competitive Disney Lorcana players: deck insights and draw odds, gamelog analysis, tournament cut and lookup tools, opponent scouting, and more.'

// Descriptions for the public (non-supporter-gated) routes worth indexing.
// Other routes fall back to HOME_DESCRIPTION.
const DESCRIPTIONS = {
  '/sitemap': 'Every page on InkbornForge, in one place.',
  '/proxy': 'Search Disney Lorcana cards and build printable black & white proxy sheets, 9 cards per page.',
  '/coconut-deck-builder': 'Build a singleton [Format Coconut] deck around one of the 18 beta Coconut cards, with ink and copy-count rules enforced automatically.',
  '/cut-calculator': 'Calculate your odds of making the top cut at a Disney Lorcana Swiss tournament using binomial and trinomial win/loss/draw models.',
  '/limited-guide': 'A Disney Lorcana limited format reference covering the BREAD framework, mana curves, and uninkable card counts.',
  '/rules': 'Browse the official Disney Lorcana comprehensive rules and recent rules changes.',
  '/deck-comparison': 'Paste two Disney Lorcana decklists side by side to highlight the differences between them.',
  '/winrate-matrix': 'A color-pair matchup matrix showing head-to-head Disney Lorcana win rates and first-player advantage.',
  '/meta-synthesis': 'A plain-language summary of the current Disney Lorcana meta — most-played and highest-winrate archetypes, centered on your own rank.',
  '/leaderboard': "See duels.ink's top 50 ranked Disney Lorcana players by queue, with MMR distribution.",
  '/lore-tracker': 'A mobile-friendly lore counter for tracking Disney Lorcana games in person, with tap controls and an audit log.',
}

export function routeDescription(pathname) {
  if (pathname === '/') return HOME_DESCRIPTION
  return DESCRIPTIONS[pathname] || HOME_DESCRIPTION
}
