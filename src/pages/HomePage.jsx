import { Link } from 'react-router-dom'

const TOOLS = [
  {
    path: '/proxy',
    name: 'Proxy Generator',
    description: 'Search for any Lorcana card and generate a printable B&W proxy sheet. 9 cards per page, grayscale printer friendly.',
    label: 'Open Tool',
  },
  {
    path: '/cut-calculator',
    name: 'Cut Calculator',
    description: 'Track your record during a Swiss tournament and know exactly when it\'s safe to intentional draw into top cut.',
    label: 'Open Tool',
  },
  {
    path: '/limited-guide',
    name: 'Limited Guide',
    description: 'Quick reference for sealed and draft: the BREAD framework, ideal mana curves, and uninkable targets for each format.',
    label: 'Open Tool',
  },
  {
    path: '/deck-insights',
    name: 'Deck Insights',
    description: 'Paste a deck list to analyse your curve, consistency, lore pressure, and draw odds for every card.',
    label: 'Open Tool',
  },
  {
    path: '/replay-analyzer',
    name: 'Replay Analyzer',
    description: 'Upload Lorcana Duels replay files to review your gameplay, track lore progression, and reconstruct your opponent\'s decklist.',
    label: 'Open Tool',
  },
  {
    path: '/game-scraper',
    name: 'Game Scraper',
    description: 'Paste a duels.ink spectate URL to view live game state: player lore, board, hand counts, and action log with auto-refresh.',
    label: 'Open Tool',
  },
  {
    path: '/game-history',
    name: 'Game History',
    description: 'Review past games scraped on this browser. Stats dashboard tracks most-played cards, ink color win rates, average game length, and matchups.',
    label: 'Open Tool',
  },
  {
    path: '/players',
    name: 'Players',
    description: 'Per-player profiles with inferred decklists across multiple games, play patterns (quest/challenge rate, ink rate), and head-to-head records.',
    label: 'Open Tool',
  },
]

function ToolCard({ tool }) {
  return (
    <Link
      to={tool.path}
      className="group block border border-gray-200 rounded-lg p-6 hover:border-gray-900 transition-colors"
    >
      <h2 className="text-base font-bold text-gray-900 mb-2 group-hover:underline">
        {tool.name}
      </h2>
      <p className="text-sm text-gray-500 leading-relaxed mb-4">
        {tool.description}
      </p>
      <span className="text-sm font-medium text-gray-900">
        {tool.label} →
      </span>
    </Link>
  )
}

export function HomePage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">
          Lorcana Pro Tools
        </h1>
        <p className="text-gray-500">
          A growing suite of tools for Disney Lorcana players.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TOOLS.map(tool => (
          <ToolCard key={tool.path} tool={tool} />
        ))}
      </div>
    </div>
  )
}
