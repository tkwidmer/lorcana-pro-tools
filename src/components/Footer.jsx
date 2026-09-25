import { Link, useLocation } from 'react-router-dom'

const SUBSTACK_URL = 'https://inkbornforge.substack.com'
const METAFY_URL = 'https://metafy.gg/@inkbornforge'

// Site-wide footer — mirrors Nav's border/spacing/link conventions. Hidden on
// /lore-tracker and the Decklist Inspector's OBS overlay view for the same
// reason Nav is (a chrome-less embed).
export function Footer() {
  const { pathname } = useLocation()
  if (pathname === '/lore-tracker') return null
  if (pathname === '/decklist-inspector/overlay') return null

  return (
    <footer className="no-print border-t-2 border-gray-900 mt-16">
      <div className="w-full px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="font-display text-sm uppercase tracking-wider text-gray-500">
          &copy; {new Date().getFullYear()} InkbornForge · Hone your approach · Sharpen your play
        </p>
        <div className="flex items-center gap-6">
          <Link
            to="/sitemap"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Sitemap
          </Link>
          <a
            href={SUBSTACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <img src="/substack-icon.svg" alt="" className="h-4 w-4" />
            Substack
          </a>
          <a
            href={METAFY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <span className="h-4 w-4 grid place-items-center rounded-sm bg-ink">
              <img src="/metafy-icon.svg" alt="" className="h-2.5 w-auto" />
            </span>
            Metafy
          </a>
        </div>
      </div>
    </footer>
  )
}
