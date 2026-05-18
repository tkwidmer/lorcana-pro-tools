import { Link, useLocation } from 'react-router-dom'

export function Nav() {
  const { pathname } = useLocation()
  const isHome = pathname === '/'

  return (
    <nav className="no-print border-b border-gray-200 bg-white">
      <div className="max-w-5xl mx-auto px-6 h-12 flex items-center gap-4">
        <Link to="/" className="font-bold text-gray-900 tracking-tight hover:text-gray-600 transition-colors">
          Lorcana Pro Tools
        </Link>
        {!isHome && (
          <>
            <span className="text-gray-300">/</span>
            <span className="text-sm text-gray-500">
              {pathname === '/proxy' ? 'Proxy Generator'
                : pathname === '/cut-calculator' ? 'Cut Calculator'
                : pathname === '/limited-guide' ? 'Limited Guide'
                : pathname === '/deck-insights' ? 'Deck Insights'
                : pathname === '/replay-analyzer' ? 'Replay Analyzer'
                : pathname === '/game-scraper' ? 'Game Scraper'
                : pathname === '/game-history' ? 'Game History'
                : pathname.startsWith('/game-history/') ? 'Game History'
                : pathname === '/players' ? 'Players'
                : pathname.startsWith('/players/') ? 'Players'
                : ''}
            </span>
          </>
        )}
      </div>
    </nav>
  )
}
