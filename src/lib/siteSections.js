// Shared tool catalog — the single source of truth for HomePage's tool grid,
// SitemapPage's link list, and Nav's section menus + tool search, so they
// never drift out of sync. `navLabel` is the section's short name in the nav
// bar; `icon` names a glyph in components/ToolIcon.jsx.

// Send Messages (0x800) + Read Message History (0x10000) — the only
// permissions the Discord QR-decoding bot needs.
const DISCORD_BOT_PERMISSIONS = 67584
const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID
const DISCORD_INVITE_URL = DISCORD_CLIENT_ID
  ? `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&scope=bot+applications.commands&permissions=${DISCORD_BOT_PERMISSIONS}`
  : null

export const SECTIONS = [
  {
    title: 'Resources',
    navLabel: 'Resources',
    tools: [
      {
        path: '/proxy',
        name: 'Proxy Generator',
        icon: 'printer',
        description: 'Search for any Lorcana card and generate a printable B&W proxy sheet. 9 cards per page, grayscale printer friendly.',
      },
      {
        path: '/limited-guide',
        name: 'Limited Guide',
        icon: 'book',
        description: 'Quick reference for sealed and draft: the BREAD framework, ideal mana curves, and uninkable targets for each format.',
      },
      {
        path: '/rules',
        name: 'Rules',
        icon: 'scroll',
        description: 'Browse the Comprehensive Rules, Tournament Rules, and Play Correction Guidelines. Version updates highlight exactly what changed.',
      },
    ],
  },
  {
    title: 'Deckbuilding',
    navLabel: 'Deckbuilding',
    tools: [
      {
        path: '/deck-insights',
        name: 'Deck Insights',
        icon: 'chart-pie',
        description: 'Paste a deck list to analyse your curve, consistency, lore pressure, draw odds, and check format legality for Core and Infinity formats.',
      },
      {
        path: '/deck-comparison',
        name: 'Deck Comparison',
        icon: 'columns',
        description: 'Paste your paper deck and your updated online list to see exactly which cards to swap — no more mis-registrations when transitioning between testing and paper.',
      },
      {
        path: '/coconut-deck-builder',
        name: 'Coconut Deck Builder',
        icon: 'palm',
        description: 'Build decks for the [Format Coconut] multiplayer format — pick a Coconut card, lock in your inks, and build a singleton deck around it with the copy-count exceptions enforced automatically.',
      },
    ],
  },
  {
    title: 'Coaching Tools',
    navLabel: 'Coaching',
    tools: [
      {
        path: '/match-history',
        name: 'Match History',
        icon: 'history',
        description: 'Connect your duels.ink account to import your complete match history — results, deck colors, lore scores, turns, and MMR changes for every ranked game.',
      },
      {
        path: '/analytics',
        name: 'Analytics',
        icon: 'chart-bar',
        description: 'Import your games (or shared team exports, or raw .logs.gz gamelogs) for full draw sequences, mulligan decisions, leak detection, card win rates, wins-above-replacement, and team-wide matchup/metagame trends.',
      },
      {
        path: '/practice-plan',
        name: 'Practice Plan',
        icon: 'target',
        description: 'Pre-event prep: pick your deck and the expected meta, then see which matchups to focus on based on your personal win rates vs the public matrix.',
      },
    ],
  },
  {
    title: 'Metagame',
    navLabel: 'Metagame',
    tools: [
      {
        path: '/winrate-matrix',
        name: 'Winrate Matrix',
        icon: 'grid',
        description: 'View head-to-head matchup winrates between color pairs for all queues. See meta trends, deck popularity, and first-player advantage by week or all-time.',
      },
      {
        path: '/meta-synthesis',
        name: 'Meta Synthesis',
        icon: 'sparkle',
        description: 'A plain-language read on what\'s happening in the meta right now — most-played and highest-winrate archetypes, centered on your own rank and defaulting to the latest week.',
      },
    ],
  },
  {
    title: 'Tournament Tools',
    navLabel: 'Tournaments',
    tools: [
      {
        path: '/tournament-lookup',
        name: 'Tournament Lookup',
        icon: 'trophy',
        description: 'Paste a tournament event URL to load live standings, find yourself by name, and check your rank, tiebreakers, and ID eligibility mid-event.',
      },
      {
        path: '/lore-tracker',
        name: 'Lore Tracker',
        icon: 'gem',
        description: 'Mobile-optimized lore counter for in-game tracking. Tap left to decrease, tap right to increase. Includes full audit log of all changes.',
      },
      {
        path: '/store-lookup',
        name: 'Store Lookup',
        icon: 'store',
        description: 'Paste one or more Ravensburger Play store IDs or store URLs to look up store details — address, contact info, seat count, and store types.',
      },
    ],
  },
  {
    title: 'Scouting',
    navLabel: 'Scouting',
    tools: [
      {
        path: '/game-scraper',
        name: 'Game Scraper',
        icon: 'eye',
        description: 'Paste a duels.ink spectate URL to view live game state: player lore, board, hand counts, and action log with auto-refresh.',
      },
      {
        path: '/library',
        name: 'Scouting Library',
        icon: 'library',
        description: 'Review saved games, stats dashboards, and unified opponent profiles combining scouted games and imported gamelogs — inferred decklists, win rates, and every card we\'ve seen them play, ink, or discard.',
      },
    ],
  },
  {
    title: 'Content Creators',
    navLabel: 'Creators',
    tools: [
      {
        path: '/decklist-inspector',
        name: 'Decklist Inspector',
        icon: 'video',
        description: 'Paste a decklist and browse it by type and cost, then pin up to 4 cards to show their full art alongside deck stat charts — built for making Lorcana videos.',
      },
    ],
  },
  ...(DISCORD_INVITE_URL
    ? [
        {
          title: 'Community',
          navLabel: 'Community',
          tools: [
            {
              href: DISCORD_INVITE_URL,
              name: 'Add to Discord',
              icon: 'chat',
              description: 'Invite the InkbornForge bot to your server. Right-click any deck list image and pick "Decode Deck QR" to get a clickable duels.ink link to the deck.',
            },
          ],
        },
      ]
    : []),
]

// The section and tool a pathname belongs to, or null for pages outside the
// catalog (settings, blog, admin…). Sub-routes match their tool's path
// prefix, so `/rules/:doc` belongs to Rules.
export function findTool(pathname) {
  for (const section of SECTIONS) {
    for (const tool of section.tools) {
      if (tool.path && (pathname === tool.path || pathname.startsWith(tool.path + '/'))) {
        return { section, tool }
      }
    }
  }
  return null
}
