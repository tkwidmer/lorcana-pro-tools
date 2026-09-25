import { useLocation } from 'react-router-dom'
import { findTool } from '../../lib/siteSections'

// Page title block. The eyebrow is the page's catalog section, looked up
// from the route, so it always matches the nav. `actions` sits to the right.
export function PageHeader({ title, description, actions }) {
  const { pathname } = useLocation()
  const match = findTool(pathname)

  return (
    <header className="flex flex-wrap items-end gap-4 mb-8">
      <div className="min-w-0">
        {match && (
          <p className="text-xs font-semibold uppercase tracking-widest text-forge-ink mb-1">
            {match.section.title}
          </p>
        )}
        <h1 className="text-3xl sm:text-4xl font-medium leading-tight text-gray-900">{title}</h1>
        {description && <div className="text-gray-500 mt-1">{description}</div>}
      </div>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </header>
  )
}
