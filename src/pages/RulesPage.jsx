import { Link } from 'react-router-dom'
import { getDocuments, getLatestVersionMeta } from '../lib/rules'

export function RulesPage() {
  const documents = getDocuments()

  return (
    <div className="w-full px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">
          Rules
        </h1>
        <p className="text-gray-500">
          Browse the current Disney Lorcana rules documents. When a document
          updates, the new version highlights exactly what changed.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.map(doc => {
          const latest = getLatestVersionMeta(doc.slug)
          return (
            <Link
              key={doc.slug}
              to={`/rules/${doc.slug}`}
              className="group block border border-gray-200 rounded-lg p-6 hover:border-gray-900 transition-colors"
            >
              <h3 className="text-base font-bold text-gray-900 group-hover:underline mb-2">
                {doc.name}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">
                {doc.tagline}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">
                  Open →
                </span>
                {latest && (
                  <span className="text-xs text-gray-400">
                    {latest.label}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
