import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useSupporter } from '../hooks/useSupporter'
import { logout } from '../lib/supabaseClient'
import { useState } from 'react'

export function Nav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isAdmin } = useSupporter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  if (pathname === '/lore-tracker') return null
  const isHome = pathname === '/'

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true)
      await logout()
      navigate('/')
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      setIsLoggingOut(false)
    }
  }

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
                : pathname === '/game-scraper' ? 'Game Scraper'
                : pathname === '/library' ? 'Library'
                : pathname.startsWith('/game-history/') ? 'Library'
                : pathname.startsWith('/players/') ? 'Players'
                : pathname === '/legality-checker' ? 'Legality Checker'
                : pathname === '/settings' ? 'Settings'
                : pathname === '/match-history' ? 'Match History'
                : pathname === '/deck-comparison' ? 'Deck Comparison'
                : pathname === '/gamelog' ? 'Gamelog'
                : pathname === '/gamelog-analyzer' ? 'Gamelog Analyzer'
                : pathname === '/hand-trainer' ? 'Hand-Reading Trainer'
                : pathname === '/game-library' ? 'Game Library'
                : pathname === '/practice-plan' ? 'Practice Plan'
                : pathname === '/leaderboard' ? 'Leaderboard'
                : pathname === '/tournament-lookup' ? 'Tournament Lookup'
                : pathname === '/lore-tracker' ? 'Lore Tracker'
                : pathname === '/admin' && isAdmin ? 'Admin'
                : ''}
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-4">
          <Link
            to="/settings"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1"
            aria-label="Settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            <span className="hidden sm:inline">Settings</span>
          </Link>

          {user ? (
            <>
              <span className="text-sm text-gray-500">
                {user.email?.split('@')[0]}
              </span>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-50"
              >
                {isLoggingOut ? 'Logging out...' : 'Logout'}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
