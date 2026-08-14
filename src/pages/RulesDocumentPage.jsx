import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  getDocument,
  getVersions,
  getVersionMeta,
  getPreviousVersionMeta,
  loadVersion,
  getChapters,
  getChapterBySlug,
  getChapterEntries,
  ruleDepth,
  loadVersionDiff,
  getChapterDiff,
} from '../lib/rules'
import { changesById, wordDiff } from '../lib/rules/diff'

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

function ChangeBadge({ change }) {
  if (!change) return null
  if (change.kind === 'changed') {
    return (
      <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-100 rounded px-1.5 py-0.5">
        Changed
      </span>
    )
  }
  if (change.kind === 'added') {
    return (
      <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-green-700 bg-green-100 rounded px-1.5 py-0.5">
        New
      </span>
    )
  }
  if (change.kind === 'renumbered') {
    return (
      <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">
        Renumbered · was {change.oldId}
      </span>
    )
  }
  return null
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

function RuleEntry({ entry, change, showInline }) {
  const depth = ruleDepth(entry.id)
  return (
    <div id={`rule-${entry.id}`} className="scroll-mt-20 py-2" style={{ marginLeft: depth * 20 }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-mono text-sm text-gray-400">{entry.id}</span>
        {entry.title && <span className="font-semibold text-gray-900">{entry.title}</span>}
        <ChangeBadge change={change} />
      </div>
      <RuleText text={entry.text} className="text-sm text-gray-700 leading-relaxed mt-1" />
      {showInline && change?.kind === 'changed' && (
        <div className="mt-2 border-l-2 border-blue-200 bg-blue-50/50 pl-3 py-2 text-sm leading-relaxed rounded-r">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 mb-1">
            Changed from previous version
          </div>
          <WordDiff oldText={change.oldText} newText={change.newText} />
        </div>
      )}
    </div>
  )
}

function VersionSelect({ versions, current, onChange }) {
  if (versions.length <= 1) return null
  return (
    <select
      value={current.version}
      onChange={e => onChange(e.target.value)}
      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white"
    >
      {versions.map(v => (
        <option key={v.version} value={v.version}>
          {v.label}
        </option>
      ))}
    </select>
  )
}

function ChangeSummary({ doc, version, diffResult }) {
  if (!diffResult) return null
  const { changed, added, removed, renumbered } = diffResult
  const total = changed.length + added.length + removed.length + renumbered.length
  if (total === 0) return null

  return (
    <Link
      to={`/rules/${doc.slug}/changes?v=${version.version}`}
      className="block border border-gray-200 rounded-lg p-4 mb-6 hover:border-gray-900 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-700">
          <span className="font-semibold text-gray-900">What changed in {version.label}: </span>
          {changed.length > 0 && <span>{changed.length} changed · </span>}
          {added.length > 0 && <span>{added.length} added · </span>}
          {removed.length > 0 && <span>{removed.length} removed · </span>}
          {renumbered.length > 0 && <span>{renumbered.length} renumbered</span>}
        </div>
        <span className="text-sm font-medium text-gray-900 flex-shrink-0">View changes →</span>
      </div>
    </Link>
  )
}

function ChapterSidebar({ doc, version, chapters, activeChapter }) {
  return (
    <nav className="space-y-4">
      {chapters.map(chapter => {
        const isActive = chapter.id === activeChapter?.id
        // Sections (e.g. "4.1 General") are one level below the chapter
        // itself, so depth 1 — only worth computing for the active chapter,
        // since that's the only one whose sub-items are shown.
        const entries = isActive
          ? getChapterEntries(version, chapter.id).filter(e => e.type === 'rule' && ruleDepth(e.id) === 1)
          : []
        return (
          <div key={chapter.id}>
            <Link
              to={`/rules/${doc.slug}/${chapter.slug}?v=${version.version}`}
              className={`block text-sm font-semibold mb-1 ${isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
            >
              {chapter.id} {chapter.title}
            </Link>
            {isActive && (
              <ul className="space-y-1 ml-2 border-l border-gray-200 pl-3">
                {entries.map(entry => (
                  <li key={entry.id}>
                    <a
                      href={`#rule-${entry.id}`}
                      className="block text-sm text-gray-500 hover:text-gray-900"
                    >
                      {entry.id} {entry.title || ''}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )
}

// Loads one version's entries + diff, then renders the document. Keyed by
// `${docSlug}:${versionId}` from the parent so switching versions remounts
// this component fresh (useState(null) is already the right "loading"
// state on mount) instead of needing to reset state imperatively inside an
// effect. Switching chapters within the same version does NOT remount it,
// so already-loaded content stays put.
function DocumentVersionView({ doc, docSlug, versionId, versions, chapterSlug, searchParams, setSearchParams }) {
  const previousVersionMeta = getPreviousVersionMeta(docSlug, versionId)

  const [version, setVersion] = useState(null)
  const [diffResult, setDiffResult] = useState(null)

  useEffect(() => {
    let cancelled = false
    loadVersion(docSlug, versionId).then(v => {
      if (!cancelled) setVersion(v)
    })
    loadVersionDiff(docSlug, versionId).then(d => {
      if (!cancelled) setDiffResult(d)
    })
    return () => {
      cancelled = true
    }
  }, [docSlug, versionId])

  if (!version) {
    return (
      <div className="w-full px-6 py-8">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  const chapters = getChapters(version)
  const activeChapter = chapterSlug ? getChapterBySlug(version, chapterSlug) : chapters[0]

  const handleVersionChange = newVersion => {
    const next = new URLSearchParams(searchParams)
    next.set('v', newVersion)
    setSearchParams(next)
  }

  const toggleInline = () => {
    const next = new URLSearchParams(searchParams)
    if (next.get('inline') === '1') next.delete('inline')
    else next.set('inline', '1')
    setSearchParams(next)
  }
  const showInline = searchParams.get('inline') === '1'

  return (
    <div className="w-full px-6 py-8">
      <div className="mb-6">
        <Link to="/rules" className="text-sm text-gray-500 hover:text-gray-900">← Rules</Link>
        <div className="flex items-start justify-between gap-4 mt-2 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">
              {doc.name}
            </h1>
            <p className="text-gray-500">{doc.tagline}</p>
          </div>
          <div className="flex items-center gap-3">
            <VersionSelect versions={versions} current={version} onChange={handleVersionChange} />
            {previousVersionMeta && (
              <button
                onClick={toggleInline}
                className={`text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  showInline
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Inline changes
              </button>
            )}
          </div>
        </div>
      </div>

      <ChangeSummary doc={doc} version={version} diffResult={diffResult} />

      {activeChapter && (
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8">
          <div className="hidden md:block">
            <ChapterSidebar doc={doc} version={version} chapters={chapters} activeChapter={activeChapter} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {activeChapter.id} {activeChapter.title}
            </h2>
            <div className="divide-y divide-gray-100">
              {(() => {
                const chapterDiff = diffResult ? getChapterDiff(diffResult, activeChapter.id) : null
                const changes = chapterDiff ? changesById(chapterDiff) : new Map()
                return getChapterEntries(version, activeChapter.id)
                  .filter(e => e.type === 'rule')
                  .map(entry => (
                    <RuleEntry
                      key={entry.id}
                      entry={entry}
                      change={changes.get(entry.id)}
                      showInline={showInline}
                    />
                  ))
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function RulesDocumentPage() {
  const { doc: docSlug, chapterSlug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()

  const doc = getDocument(docSlug)
  const versions = getVersions(docSlug)
  const versionMeta = getVersionMeta(docSlug, searchParams.get('v'))

  if (!doc || !versionMeta) {
    return (
      <div className="w-full px-6 py-8">
        <p className="text-gray-500">Document not found.</p>
        <Link to="/rules" className="text-sm font-medium text-gray-900">← Back to Rules</Link>
      </div>
    )
  }

  return (
    <DocumentVersionView
      key={`${docSlug}:${versionMeta.version}`}
      doc={doc}
      docSlug={docSlug}
      versionId={versionMeta.version}
      versions={versions}
      chapterSlug={chapterSlug}
      searchParams={searchParams}
      setSearchParams={setSearchParams}
    />
  )
}
