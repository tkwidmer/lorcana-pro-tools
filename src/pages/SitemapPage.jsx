import { Link } from 'react-router-dom'
import { SECTIONS } from '../lib/siteSections'

const SUBSTACK_URL = 'https://inkforge.substack.com'

export function SitemapPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Sitemap</h1>
      <p className="text-sm text-gray-500 mb-10">
        Every page on InkbornForge, in one place.
      </p>

      <div className="space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Home</h2>
          <ul className="space-y-2">
            <li>
              <Link to="/" className="text-sm text-gray-700 hover:text-gray-900 hover:underline">
                Home
              </Link>
            </li>
          </ul>
        </div>

        {SECTIONS.map(section => (
          <div key={section.title}>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              {section.title}
            </h2>
            <ul className="space-y-2">
              {section.tools.map(tool => (
                <li key={tool.path || tool.href}>
                  {tool.href ? (
                    <a
                      href={tool.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gray-700 hover:text-gray-900 hover:underline"
                    >
                      {tool.name}
                    </a>
                  ) : (
                    <Link
                      to={tool.path}
                      className="text-sm text-gray-700 hover:text-gray-900 hover:underline"
                    >
                      {tool.name}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Elsewhere</h2>
          <ul className="space-y-2">
            <li>
              <a
                href={SUBSTACK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-700 hover:text-gray-900 hover:underline"
              >
                Substack
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
