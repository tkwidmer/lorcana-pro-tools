import { Link, useLocation } from 'react-router-dom'

const SUBSTACK_URL = 'https://inkbornforge.substack.com'

// Site-wide footer — mirrors Nav's border/spacing/link conventions. Hidden on
// /lore-tracker for the same reason Nav is (a mobile print/embed view).
export function Footer() {
  const { pathname } = useLocation()
  if (pathname === '/lore-tracker') return null

  return (
    <footer className="no-print border-t border-gray-200 bg-white mt-16">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="text-sm text-gray-500">
          &copy; {new Date().getFullYear()} InkbornForge
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
        </div>
      </div>
    </footer>
  )
}
