import { Link } from 'react-router-dom'
import { isSupporterPath } from '../lib/access'

// Send Messages (0x800) + Read Message History (0x10000) — the only
// permissions the Discord QR-decoding bot needs.
const DISCORD_BOT_PERMISSIONS = 67584
const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID
const DISCORD_INVITE_URL = DISCORD_CLIENT_ID
  ? `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&scope=bot+applications.commands&permissions=${DISCORD_BOT_PERMISSIONS}`
  : null

const SUBSTACK_URL = 'https://inkforge.substack.com'

const SECTIONS = [
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
        description: 'Review saved games, stats dashboards, and player profiles with inferred decklists. Import shared game snapshots to view or save them.',
      },
      {
        path: '/opponent-directory',
        name: 'Opponent Directory',
        description: 'Look up any opponent from your imported games, filter by their ink colors, and see every card we\'ve seen them play, ink, or discard.',
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

function ToolCard({ tool }) {
  if (tool.href) {
    return (
      <a
        href={tool.href}
        target="_blank"
        rel="noopener noreferrer"
        className="group block border border-gray-200 rounded-lg p-6 hover:border-gray-900 transition-colors"
      >
        <h3 className="text-base font-bold text-gray-900 group-hover:underline mb-2">
          {tool.name}
        </h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-4">
          {tool.description}
        </p>
        <span className="text-sm font-medium text-gray-900">
          Add to Discord →
        </span>
      </a>
    )
  }

  const supporterOnly = isSupporterPath(tool.path)
  return (
    <Link
      to={tool.path}
      className="group block border border-gray-200 rounded-lg p-6 hover:border-gray-900 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-base font-bold text-gray-900 group-hover:underline">
          {tool.name}
        </h3>
        {supporterOnly && (
          <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
            Supporters
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 leading-relaxed mb-4">
        {tool.description}
      </p>
      <span className="text-sm font-medium text-gray-900">
        Open Tool →
      </span>
    </Link>
  )
}

export function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="mb-10">
        <img
          src="/inkborn_forge_substack_header.png"
          alt="InkbornForge — Hone Your Approach, Sharpen Your Play"
          className="w-full h-auto rounded-lg mb-4"
        />
        <p className="text-gray-500">
          A growing suite of tools for Disney Lorcana players.
        </p>
      </div>
      <a
        href={SUBSTACK_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10 px-6 py-5 border border-gray-200 rounded-lg hover:border-gray-900 transition-colors group"
      >
        <div>
          <p className="text-sm font-bold text-gray-900">Join us on Substack</p>
          <p className="text-sm text-gray-500 mt-1">
            Strategy articles, tool updates, and Lorcana news — straight to your inbox.
          </p>
        </div>
        <span className="shrink-0 text-sm font-medium text-gray-900 group-hover:underline">
          Subscribe →
        </span>
      </a>
      <div className="space-y-10">
        {SECTIONS.map(section => (
          <div key={section.title}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {section.title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.tools.map(tool => (
                <ToolCard key={tool.path || tool.href} tool={tool} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
