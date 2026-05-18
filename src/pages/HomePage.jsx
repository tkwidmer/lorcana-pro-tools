import { Link } from 'react-router-dom'

const SECTIONS = [
  {
    title: 'Deckbuilding',
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
        path: '/deck-insights',
        name: 'Deck Insights',
        description: 'Paste a deck list to analyse your curve, consistency, lore pressure, and draw odds for every card.',
      },
      {
        path: '/deck-comparison',
        name: 'Deck Comparison',
        description: 'Paste your paper deck and your updated online list to see exactly which cards to swap — no more mis-registrations when transitioning between testing and paper.',
      },
      {
        path: '/legality-checker',
        name: 'Legality Checker',
        description: 'Paste a decklist to instantly see which cards are legal in Core (rotating) or Infinity (eternal) format.',
      },
    ],
  },
  {
    title: 'Coaching Tools',
    tools: [
      {
        path: '/replay-analyzer',
        name: 'Replay Analyzer',
        description: 'Upload Lorcana Duels replay files to review your gameplay, track lore progression, and reconstruct your opponent\'s decklist.',
      },
      {
        path: '/gamelog-analyzer',
        name: 'Gamelog Analyzer',
        description: 'Import complete server-side game logs to see both players\' full draw sequences, opening hands, mulligan decisions, and every card interaction — richer than replays.',
      },
      {
        path: '/match-history',
        name: 'Match History',
        description: 'Connect your duels.ink account to import your complete match history — results, deck colors, lore scores, turns, and MMR changes for every ranked game.',
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
    ],
  },
]

function ToolCard({ tool }) {
  return (
    <Link
      to={tool.path}
      className="group block border border-gray-200 rounded-lg p-6 hover:border-gray-900 transition-colors"
    >
      <h3 className="text-base font-bold text-gray-900 mb-2 group-hover:underline">
        {tool.name}
      </h3>
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
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">
          Lorcana Pro Tools
        </h1>
        <p className="text-gray-500">
          A growing suite of tools for Disney Lorcana players.
        </p>
      </div>
      <div className="space-y-10">
        {SECTIONS.map(section => (
          <div key={section.title}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {section.title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.tools.map(tool => (
                <ToolCard key={tool.path} tool={tool} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
