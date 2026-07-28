// Per-route document titles for the browser tab and SEO. Note: this only
// updates the title client-side after navigation — crawlers that don't run JS
// still see the static index.html title. Keep the wording in sync with the
// tool names on HomePage.

const SITE = 'Lorcana Pro Tools'
const HOME_TITLE = `${SITE} — Competitive tools for Disney Lorcana`

// Exact-path titles (the page name shown before "· Lorcana Pro Tools").
const TITLES = {
  '/login': 'Sign in',
  '/proxy': 'Proxy Generator',
  '/coconut-deck-builder': 'Coconut Deck Builder',
  '/cut-calculator': 'Cut Calculator',
  '/limited-guide': 'Limited Guide',
  '/rules': 'Rules',
  '/deck-insights': 'Deck Insights',
  '/game-scraper': 'Game Scraper',
  '/library': 'Scouting Library',
  '/deck-comparison': 'Deck Comparison',
  '/settings': 'Settings',
  '/match-history': 'Match History',
  '/gamelog': 'Gamelog Viewer',
  '/gamelog-analyzer': 'Gamelog Analyzer',
  '/team-analytics': 'Team Analytics',
  '/winrate-matrix': 'Winrate Matrix',
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
