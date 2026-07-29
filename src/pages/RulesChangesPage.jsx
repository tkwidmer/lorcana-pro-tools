import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getDocument, getVersionMeta, getPreviousVersionMeta, loadVersionDiff } from '../lib/rules'
import { wordDiff } from '../lib/rules/diff'

function WordDiff({ oldText, newText }) {
  const parts = wordDiff(oldText, newText)
  return parts.map((part, i) => (
    <span
      key={i}
      className={
        part.added
          ? 'bg-green-100 text-green-800'
          : part.removed
            ? 'bg-red-100 text-red-800 line-through'
            : ''
      }
    >
      {part.value}
    </span>
  ))
}

function RuleText({ text, className = '' }) {
  if (!text) return null
  return text.split('\n\n').map((paragraph, i) => (
    <p
      key={i}
      className={`${className} ${i > 0 ? 'mt-2' : ''} ${/^Example[^a-z]/.test(paragraph) ? 'italic text-gray-500' : ''}`}
    >
      {paragraph}
    </p>
  ))
}

const TABS = [
  { key: 'changed', label: 'Changed' },
  { key: 'added', label: 'Added' },
  { key: 'removed', label: 'Removed' },
  { key: 'renumbered', label: 'Renumbered' },
]

// Loads the diff for one version, then renders it. Keyed by
// `${docSlug}:${versionId}` from the parent so switching versions remounts
// this component fresh instead of needing to reset state imperatively
// inside an effect.
function ChangesVersionView({ doc, docSlug, versionId, version, previousVersion }) {
  const [diffResult, setDiffResult] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadVersionDiff(docSlug, versionId).then(d => {
      if (!cancelled) {
        setDiffResult(d)
        setLoaded(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [docSlug, versionId])

  const [tab, setTab] = useState('changed')

  if (!loaded) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  if (!previousVersion || !diffResult) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Link to={`/rules/${doc.slug}?v=${version.version}`} className="text-sm text-gray-500 hover:text-gray-900">
          ← {doc.name}
        </Link>
        <p className="text-gray-500 mt-4">
          There's no earlier version of {doc.name} to compare {version.label} against.
        </p>
      </div>
    )
  }

  const counts = {
    changed: diffResult.changed.length,
    added: diffResult.added.length,
    removed: diffResult.removed.length,
    renumbered: diffResult.renumbered.length,
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link to={`/rules/${doc.slug}?v=${version.version}`} className="text-sm text-gray-500 hover:text-gray-900">
          ← {doc.name}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mt-2 mb-1">
          Changes in {version.label}
        </h1>
        <p className="text-gray-500">Compared against {previousVersion.label}.</p>
      </div>

      <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label} <span className="text-xs opacity-70">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {counts[tab] === 0 && (
        <p className="text-sm text-gray-400">No {tab} rules in this version.</p>
      )}

      {tab === 'changed' && (
        <div className="space-y-4">
          {diffResult.changed.map(c => (
            <div key={c.id} className="border border-gray-200 rounded-lg p-4">
              <div className="font-mono text-sm text-gray-400 mb-2">{c.id}</div>
              <p className="text-sm leading-relaxed">
                <WordDiff oldText={c.oldText} newText={c.newText} />
              </p>
            </div>
          ))}
        </div>
      )}

      {tab === 'added' && (
        <div className="space-y-4">
          {diffResult.added.map(a => (
            <div key={a.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-sm text-gray-400">{a.id}</span>
                {a.title && <span className="font-semibold text-gray-900">{a.title}</span>}
              </div>
              <RuleText text={a.text} className="text-sm text-gray-700 leading-relaxed" />
            </div>
          ))}
        </div>
      )}

      {tab === 'removed' && (
        <div className="space-y-4">
          {diffResult.removed.map(r => (
            <div key={r.id} className="border border-gray-200 rounded-lg p-4 opacity-70">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-sm text-gray-400">{r.id}</span>
                {r.title && <span className="font-semibold text-gray-900">{r.title}</span>}
              </div>
              <RuleText text={r.text} className="text-sm text-gray-700 leading-relaxed line-through decoration-red-300" />
            </div>
          ))}
        </div>
      )}

      {tab === 'renumbered' && (
        <div className="space-y-4">
          {diffResult.renumbered.map(r => (
            <div key={r.newId} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-sm text-gray-400">{r.oldId} → {r.newId}</span>
                {r.title && <span className="font-semibold text-gray-900">{r.title}</span>}
              </div>
              <RuleText text={r.text} className="text-sm text-gray-700 leading-relaxed" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function RulesChangesPage() {
  const { doc: docSlug } = useParams()
  const [searchParams] = useSearchParams()
  const doc = getDocument(docSlug)
  const version = getVersionMeta(docSlug, searchParams.get('v'))
  const previousVersion = version ? getPreviousVersionMeta(docSlug, version.version) : null

  if (!doc || !version) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <p className="text-gray-500">Document not found.</p>
        <Link to="/rules" className="text-sm font-medium text-gray-900">← Back to Rules</Link>
      </div>
    )
  }

  return (
    <ChangesVersionView
      key={`${docSlug}:${version.version}`}
      doc={doc}
      docSlug={docSlug}
      versionId={version.version}
      version={version}
      previousVersion={previousVersion}
    />
  )
}
