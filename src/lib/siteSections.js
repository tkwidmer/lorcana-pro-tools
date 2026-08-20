// Shared tool catalog — the single source of truth for both HomePage's tool
// grid and SitemapPage's link list, so the two never drift out of sync.

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
    tools: [
      {
        path: '/proxy',
        name: 'Proxy Generator',
        description: 'Search for any Lorcana card and generate a printable B&W proxy sheet. 9 cards per page, grayscale printer friendly.',
      },
      {
        path: '/limited-guide',
        name: 'Limited Guide',
        description: 'Quick reference for sealed and draft: the BREAD framework, ideal mana curves, and uninkable targets for each format.',
      },
      {
        path: '/rules',
        name: 'Rules',
        description: 'Browse the Comprehensive Rules, Tournament Rules, and Play Correction Guidelines. Version updates highlight exactly what changed.',
      },
    ],
  },
  {
    title: 'Deckbuilding',
    tools: [
      {
        path: '/deck-insights',
        name: 'Deck Insights',
        description: 'Paste a deck list to analyse your curve, consistency, lore pressure, draw odds, and check format legality for Core and Infinity formats.',
      },
      {
        path: '/deck-comparison',
        name: 'Deck Comparison',
        description: 'Paste your paper deck and your updated online list to see exactly which cards to swap — no more mis-registrations when transitioning between testing and paper.',
      },
      {
        path: '/coconut-deck-builder',
        name: 'Coconut Deck Builder',
        description: 'Build decks for the [Format Coconut] multiplayer format — pick a Coconut card, lock in your inks, and build a singleton deck around it with the copy-count exceptions enforced automatically.',
      },
    ],
  },
  {
    title: 'Coaching Tools',
    tools: [
      {
        path: '/match-history',
        name: 'Match History',
        description: 'Connect your duels.ink account to import your complete match history — results, deck colors, lore scores, turns, and MMR changes for every ranked game.',
      },
      {
        path: '/analytics',
        name: 'Analytics',
        description: 'Import your games (or shared team exports, or raw .logs.gz gamelogs) for full draw sequences, mulligan decisions, leak detection, card win rates, wins-above-replacement, and team-wide matchup/metagame trends.',
      },
      {
        path: '/practice-plan',
        name: 'Practice Plan',
        description: 'Pre-event prep: pick your deck and the expected meta, then see which matchups to focus on based on your personal win rates vs the public matrix.',
      },
    ],
  },
  {
    title: 'Metagame',
    tools: [
      {
        path: '/winrate-matrix',
        name: 'Winrate Matrix',
        description: 'View head-to-head matchup winrates between color pairs for all queues. See meta trends, deck popularity, and first-player advantage by week or all-time.',
      },
      {
        path: '/meta-synthesis',
        name: 'Meta Synthesis',
        description: 'A plain-language read on what\'s happening in the meta right now — most-played and highest-winrate archetypes, centered on your own rank and defaulting to the latest week.',
      },
      {
        path: '/leaderboard',
        name: 'Leaderboard',
        description: 'See the top 50 ranked duels.ink players for each queue, plus MMR distribution and current season info.',
      },
    ],
  },
  {
    title: 'Tournament Tools',
    tools: [
      {
        path: '/cut-calculator',
        name: 'Cut Calculator',
        description: 'Track your record during a Swiss tournament and know exactly when it\'s safe to intentional draw into top cut.',
      },
      {
        path: '/tournament-lookup',
        name: 'Tournament Lookup',
        description: 'Paste a tournament event URL to load live standings, find yourself by name, and check your rank, tiebreakers, and ID eligibility mid-event.',
      },
      {
        path: '/lore-tracker',
        name: 'Lore Tracker',
        description: 'Mobile-optimized lore counter for in-game tracking. Tap left to decrease, tap right to increase. Includes full audit log of all changes.',
      },
    ],
  },
  {
    title: 'Scouting',
    tools: [
      {
        path: '/game-scraper',
        name: 'Game Scraper',
        description: 'Paste a duels.ink spectate URL to view live game state: player lore, board, hand counts, and action log with auto-refresh.',
      },
      {
        path: '/library',
        name: 'Scouting Library',
        description: 'Review saved games, stats dashboards, and unified opponent profiles combining scouted games and imported gamelogs — inferred decklists, win rates, and every card we\'ve seen them play, ink, or discard.',
      },
    ],
  },
  {
    title: 'Content Creators',
    tools: [
      {
        path: '/decklist-inspector',
        name: 'Decklist Inspector',
        description: 'Paste a decklist and browse it by type and cost, then pin up to 4 cards to show their full art alongside deck stat charts — built for making Lorcana videos.',
      },
    ],
  },
  ...(DISCORD_INVITE_URL
    ? [
        {
          title: 'Community',
          tools: [
            {
              href: DISCORD_INVITE_URL,
              name: 'Add to Discord',
              description: 'Invite the InkbornForge bot to your server. Right-click any deck list image and pick "Decode Deck QR" to get a clickable duels.ink link to the deck.',
            },
          ],
        },
      ]
    : []),
]
