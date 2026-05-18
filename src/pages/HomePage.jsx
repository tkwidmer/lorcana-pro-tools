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
    path: '/library',
    name: 'Library',
    description: 'Review saved games, stats dashboards, and player profiles with inferred decklists. Import shared game snapshots to view or save them.',
    label: 'Open Tool',
  },
  {
    path: '/legality-checker',
    name: 'Legality Checker',
    description: 'Paste a decklist to instantly see which cards are legal in Core (rotating) or Infinity (eternal) format.',
    label: 'Open Tool',
  },
  {
    path: '/deck-comparison',
    name: 'Deck Comparison',
    description: 'Paste your paper deck and your updated online list to see exactly which cards to swap — no more mis-registrations when transitioning between testing and paper.',
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
