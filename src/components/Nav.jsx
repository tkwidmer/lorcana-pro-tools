import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useSupporter } from '../hooks/useSupporter'
import { logout } from '../lib/supabaseClient'
import { SECTIONS, findTool } from '../lib/siteSections'
import { isSupporterPath } from '../lib/access'
import { listPosts } from '../lib/blog'
import { ToolIcon } from './ToolIcon'
import { ToolSearch } from './ToolSearch'
import { Badge } from './ui/Badge'
import { useState, useRef, useEffect, useCallback } from 'react'

// Sections with at least one in-app tool get a nav menu (Community is only
// an external Discord invite, so it stays on the home page).
const NAV_SECTIONS = SECTIONS.filter(section => section.tools.some(tool => tool.path))

function Chevron({ open }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

// Closes `onClose` on a mousedown outside `ref` while `active`.
function useOutsideClick(ref, active, onClose) {
  useEffect(() => {
    if (!active) return
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [ref, active, onClose])
}

function ToolLink({ tool, onNavigate, compact = false }) {
  return (
    <Link
      to={tool.path}
      onClick={onNavigate}
      className="flex gap-3 p-2.5 rounded hover:bg-gray-50 transition-colors group/tool"
    >
      <span className="h-8 w-8 shrink-0 grid place-items-center rounded bg-gray-900 text-white">
        <ToolIcon name={tool.icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 group-hover/tool:underline">
          {tool.name}
          {isSupporterPath(tool.path) && <Badge>Supporters</Badge>}
        </span>
        {!compact && (
          <span className="block text-xs text-gray-500 leading-relaxed mt-0.5">
            {tool.description.split(/(?<=\.)\s/)[0]}
          </span>
        )}
      </span>
    </Link>
  )
}

// Desktop dropdown for one catalog section, with the newest blog post beside
// the tools.
function SectionMenu({ section, onNavigate }) {
  const latest = listPosts()[0]
  return (
    <div className="absolute left-6 right-6 top-full mt-1 z-50 bg-white text-gray-900 border border-gray-200 rounded-lg shadow-xl p-4 grid grid-cols-3 gap-4">
      <div className="col-span-2 grid grid-cols-2 gap-1 content-start">
        {section.tools.filter(tool => tool.path).map(tool => (
          <ToolLink key={tool.path} tool={tool} onNavigate={onNavigate} />
        ))}
      </div>
      {latest && (
        <Link
          to={`/blog/${latest.slug}`}
          onClick={onNavigate}
          className="bg-gray-50 rounded p-4 flex flex-col gap-2 hover:bg-gray-100 transition-colors"
        >
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">From the blog</span>
          <span className="font-display text-base uppercase tracking-wide leading-snug text-gray-900">{latest.title}</span>
          <span className="text-xs text-gray-500 leading-relaxed">{latest.description}</span>
          <span className="mt-auto text-sm font-semibold text-forge-ink">Read the post →</span>
        </Link>
      )}
    </div>
  )
}

function MobileMenu({ onNavigate }) {
  return (
    <div className="xl:hidden absolute left-0 right-0 top-full z-50 bg-white text-gray-900 border-b border-gray-200 shadow-xl max-h-[calc(100vh-3.5rem)] overflow-y-auto">
      {NAV_SECTIONS.map(section => (
        <details key={section.title} className="border-b border-gray-200 group">
          <summary className="flex items-center justify-between px-6 py-3 cursor-pointer list-none font-display uppercase tracking-wider text-sm">
            {section.navLabel}
            <span className="group-open:rotate-180 transition-transform"><Chevron /></span>
          </summary>
          <div className="px-4 pb-3">
            {section.tools.filter(tool => tool.path).map(tool => (
              <ToolLink key={tool.path} tool={tool} onNavigate={onNavigate} compact />
            ))}
          </div>
        </details>
      ))}
      <Link to="/blog" onClick={onNavigate} className="block px-6 py-3 font-display uppercase tracking-wider text-sm">
        Blog
      </Link>
    </div>
  )
}

function UserMenu({ user, isAdmin, onLogout, isLoggingOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  useOutsideClick(ref, open, close)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-sm text-on-ink/70 hover:text-on-ink transition-colors flex items-center gap-1"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="hidden sm:inline">{user.email?.split('@')[0]}</span>
        <span className="sm:hidden h-7 w-7 rounded-full bg-forge text-on-forge grid place-items-center text-xs font-bold uppercase">
          {user.email?.[0]}
        </span>
        <Chevron open={open} />
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
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isAdmin, isSupporter } = useSupporter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  // One open menu at a time: a section title, 'mobile', or null.
  const [openMenu, setOpenMenu] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const barRef = useRef(null)
  const closeMenu = useCallback(() => setOpenMenu(null), [])
  useOutsideClick(barRef, openMenu !== null, closeMenu)

  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpenMenu(null)
        setSearchOpen(open => !open)
      } else if (e.key === 'Escape') {
        setOpenMenu(null)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  if (pathname === '/lore-tracker') return null
  // Hidden for the Decklist Inspector's OBS overlay view — a chrome-less,
  // transparent-background render meant to be cropped into a stream scene.
  if (pathname === '/decklist-inspector/overlay') return null

  const currentSection = findTool(pathname)?.section.title
  const openSection = NAV_SECTIONS.find(section => section.title === openMenu)

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
    <nav className="no-print relative z-40 bg-ink text-on-ink" ref={barRef}>
      <div className="w-full px-6 h-14 flex items-center gap-6">
        <Link to="/" onClick={closeMenu} className="flex items-center gap-2.5 shrink-0">
          {/* The mark has an opaque white background baked into the PNG; on
              the ink bar the rounding makes it read as a deliberate tile. */}
          <img src="/inkborn_forge_mark_64.png" alt="" className="h-7 w-7 rounded-sm" />
          <span className="font-display text-base font-medium uppercase tracking-[0.12em]">InkbornForge</span>
        </Link>

        <div className="hidden xl:flex items-stretch self-stretch">
          {NAV_SECTIONS.map(section => {
            const open = openMenu === section.title
            const current = currentSection === section.title
            return (
              <button
                key={section.title}
                onClick={() => setOpenMenu(open ? null : section.title)}
                aria-expanded={open}
                className={`flex items-center gap-1 px-3 font-display text-[13px] uppercase tracking-wider border-b-2 transition-colors ${
                  current ? 'border-forge text-on-ink' : 'border-transparent text-on-ink/65 hover:text-on-ink'
                } ${open ? 'text-on-ink bg-on-ink/10' : ''}`}
              >
                {section.navLabel}
                <Chevron open={open} />
              </button>
            )
          })}
          <Link
            to="/blog"
            onClick={closeMenu}
            className={`flex items-center px-3 font-display text-[13px] uppercase tracking-wider border-b-2 transition-colors ${
              pathname.startsWith('/blog') ? 'border-forge text-on-ink' : 'border-transparent text-on-ink/65 hover:text-on-ink'
            }`}
          >
            Blog
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <button
            onClick={() => { setOpenMenu(null); setSearchOpen(true) }}
            className="flex items-center gap-2 text-sm text-on-ink/65 hover:text-on-ink transition-colors sm:border sm:border-on-ink/25 sm:rounded sm:pl-2.5 sm:pr-1.5 sm:py-1"
            aria-label="Search tools"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden sm:inline text-[10px] font-mono border border-on-ink/25 rounded px-1">⌘K</kbd>
          </button>
          {isSupporter && (
            <span className="hidden sm:inline-flex" title={isAdmin ? 'Admin' : 'Supporter'}>
              <Badge>{isAdmin ? 'Admin' : 'Supporter'}</Badge>
            </span>
          )}
          <Link
            to="/settings"
            onClick={closeMenu}
            className="text-on-ink/65 hover:text-on-ink transition-colors"
            aria-label="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
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
              onClick={closeMenu}
              className="font-display text-[13px] uppercase tracking-wider text-on-ink/65 hover:text-on-ink transition-colors"
            >
              Login
            </Link>
          )}
          <button
            onClick={() => setOpenMenu(openMenu === 'mobile' ? null : 'mobile')}
            className="xl:hidden text-on-ink/80 hover:text-on-ink"
            aria-label="Menu"
            aria-expanded={openMenu === 'mobile'}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {openMenu === 'mobile' ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {openSection && <SectionMenu section={openSection} onNavigate={closeMenu} />}
      {openMenu === 'mobile' && <MobileMenu onNavigate={closeMenu} />}
      {searchOpen && <ToolSearch onClose={() => setSearchOpen(false)} />}
    </nav>
  )
}
