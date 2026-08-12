import { Link } from 'react-router-dom'
import { isSupporterPath } from '../lib/access'
import { SECTIONS } from '../lib/siteSections'

const SUBSTACK_URL = 'https://inkbornforge.substack.com'

function ToolCard({ tool }) {
  if (tool.href) {
    return (
      <a
        href={tool.href}
        target="_blank"
        rel="noopener noreferrer"
        className="group block border border-gray-200 rounded-lg p-6 hover:border-gray-900 transition-colors"
      >
        <h3 className="text-base font-bold text-gray-900 group-hover:underline mb-2">
          {tool.name}
        </h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-4">
          {tool.description}
        </p>
        <span className="text-sm font-medium text-gray-900">
          Add to Discord →
        </span>
      </a>
    )
  }

  const supporterOnly = isSupporterPath(tool.path)
  return (
    <Link
      to={tool.path}
      className="group block border border-gray-200 rounded-lg p-6 hover:border-gray-900 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-base font-bold text-gray-900 group-hover:underline">
          {tool.name}
        </h3>
        {supporterOnly && (
          <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
            Supporters
          </span>
        )}
      </div>
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
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="mb-10">
        <img
          src="/inkborn_forge_substack_header.png"
          alt="InkbornForge — Hone Your Approach, Sharpen Your Play"
          className="w-full h-auto rounded-lg mb-4"
        />
        <p className="text-gray-500">
          A growing suite of tools for Disney Lorcana players.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
        <Link
          to="/settings"
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-6 py-5 border border-gray-200 rounded-lg hover:border-gray-900 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <img src="/patreon-icon.svg" alt="" className="h-6 w-6 shrink-0" />
            <div>
              <p className="text-sm font-bold text-gray-900">Become a Patreon supporter</p>
              <p className="text-sm text-gray-500 mt-1">
                Unlock deck insights, game scouting, analytics, and more supporter-only tools.
              </p>
            </div>
          </div>
          <span className="shrink-0 text-sm font-medium text-gray-900 group-hover:underline">
            Support us →
          </span>
        </Link>
        <a
          href={SUBSTACK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-6 py-5 border border-gray-200 rounded-lg hover:border-gray-900 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <img src="/substack-icon.svg" alt="" className="h-6 w-6 shrink-0" />
            <div>
              <p className="text-sm font-bold text-gray-900">Join us on Substack</p>
              <p className="text-sm text-gray-500 mt-1">
                Strategy articles, tool updates, and Lorcana news — straight to your inbox.
              </p>
            </div>
          </div>
          <span className="shrink-0 text-sm font-medium text-gray-900 group-hover:underline">
            Subscribe →
          </span>
        </a>
      </div>
      <div className="space-y-10">
        {SECTIONS.map(section => (
          <div key={section.title}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {section.title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.tools.map(tool => (
                <ToolCard key={tool.path || tool.href} tool={tool} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
