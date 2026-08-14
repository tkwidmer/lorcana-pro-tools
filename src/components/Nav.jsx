import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useSupporter } from '../hooks/useSupporter'
import { logout } from '../lib/supabaseClient'
import { useState, useRef, useEffect } from 'react'

function UserMenu({ user, isAdmin, onLogout, isLoggingOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-sm text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>{user.email?.split('@')[0]}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
        >
          {isAdmin && (
            <Link
              to="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Admin
            </Link>
          )}
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onLogout() }}
            disabled={isLoggingOut}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {isLoggingOut ? 'Logging out…' : 'Logout'}
          </button>
        </div>
      )}
    </div>
  )
}

export function Nav() {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isAdmin } = useSupporter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  if (pathname === '/lore-tracker') return null
  // Hidden for the Decklist Inspector's OBS overlay view — a chrome-less,
  // transparent-background render meant to be cropped into a stream scene.
  if (pathname === '/decklist-inspector' && searchParams.get('overlay') === '1') return null
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
      <div className="max-w-7xl mx-auto px-6 h-12 flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-gray-900 tracking-tight hover:text-gray-600 transition-colors">
          {/* The mark has an opaque white background baked into the PNG, which
              is invisible on a light page but reads as a white tile in dark
              mode — rounding it makes that tile look like a deliberate badge.
              No visual change in light mode. */}
          <img src="/inkborn_forge_mark_64.png" alt="" className="h-6 w-6 rounded-sm" />
          InkbornForge
        </Link>
        {!isHome && (
          <>
            <span className="text-gray-300">/</span>
            <span className="text-sm text-gray-500">
              {pathname === '/sitemap' ? 'Sitemap'
                : pathname === '/proxy' ? 'Proxy Generator'
                : pathname === '/cut-calculator' ? 'Cut Calculator'
                : pathname === '/limited-guide' ? 'Limited Guide'
                : pathname.startsWith('/rules') ? 'Rules'
                : pathname === '/deck-insights' ? 'Deck Insights'
                : pathname === '/game-scraper' ? 'Game Scraper'
                : pathname === '/library' ? 'Library'
                : pathname.startsWith('/scouting/game/') ? 'Library'
                : pathname.startsWith('/players/') ? 'Players'
                : pathname === '/legality-checker' ? 'Legality Checker'
                : pathname === '/settings' ? 'Settings'
                : pathname === '/match-history' ? 'Match History'
                : pathname === '/deck-comparison' ? 'Deck Comparison'
                : pathname === '/gamelog' ? 'Gamelog'
                : pathname === '/analytics' ? 'Analytics'
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
            <UserMenu
              user={user}
              isAdmin={isAdmin}
              onLogout={handleLogout}
              isLoggingOut={isLoggingOut}
            />
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
