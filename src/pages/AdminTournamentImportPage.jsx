import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSupporter } from '../hooks/useSupporter'
import {
  importTournamentEvent,
  fetchRecentTournamentImports,
  fetchSuggestedTournamentImports,
} from '../lib/tournamentHistoryApi'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'

export function AdminTournamentImportPage() {
  const { isAdmin, isLoading } = useSupporter()
  const navigate = useNavigate()

  const [eventUrl, setEventUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [recent, setRecent] = useState([])
  const [recentLoading, setRecentLoading] = useState(true)

  const [suggestions, setSuggestions] = useState([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(true)
  const [suggestionsError, setSuggestionsError] = useState(null)
  // eventId -> 'importing' | 'done' | 'error'
  const [suggestionStatus, setSuggestionStatus] = useState({})

  useEffect(() => {
    if (!isLoading && !isAdmin) navigate('/', { replace: true })
  }, [isAdmin, isLoading, navigate])

  const loadRecent = useCallback(() => {
    if (!isAdmin) return
    setRecentLoading(true)
    fetchRecentTournamentImports()
      .then((data) => setRecent(data.events ?? []))
      .catch(() => {})
      .finally(() => setRecentLoading(false))
  }, [isAdmin])

  const loadSuggestions = useCallback(() => {
    if (!isAdmin) return
    setSuggestionsLoading(true)
    setSuggestionsError(null)
    fetchSuggestedTournamentImports()
      .then((data) => setSuggestions(data.suggestions ?? []))
      .catch((err) => setSuggestionsError(err.message || 'Failed to load suggested events'))
      .finally(() => setSuggestionsLoading(false))
  }, [isAdmin])

  useEffect(() => {
    loadRecent()
    loadSuggestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  async function handleImport(e) {
    e.preventDefault()
    if (!eventUrl.trim()) return
    setImporting(true)
    setError(null)
    setResult(null)
    try {
      const data = await importTournamentEvent(eventUrl.trim())
      setResult(data)
      loadRecent()
    } catch (err) {
      setError(err.message || 'Failed to import tournament')
    } finally {
      setImporting(false)
    }
  }

  async function handleImportSuggestion(suggestion) {
    setSuggestionStatus((prev) => ({ ...prev, [suggestion.eventId]: 'importing' }))
    try {
      await importTournamentEvent(suggestion.eventUrl)
      setSuggestionStatus((prev) => ({ ...prev, [suggestion.eventId]: 'done' }))
      setSuggestions((prev) => prev.filter((s) => s.eventId !== suggestion.eventId))
      loadRecent()
    } catch (err) {
      setSuggestionStatus((prev) => ({ ...prev, [suggestion.eventId]: err.message || 'Failed' }))
    }
  }

  if (isLoading) return null

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Import Tournament History"
        description="Import a completed Ravensburger Play Hub event's final standings and match results into the caster history archive. Safe to re-run for the same event once more rounds have completed — it updates the stored data rather than duplicating it."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="space-y-8">
          <Card className="p-6" title="Import an event">
            <form onSubmit={handleImport} className="flex gap-2">
              <Input
                type="url"
                value={eventUrl}
                onChange={(e) => { setEventUrl(e.target.value); setError(null) }}
                placeholder="https://tcg.ravensburgerplay.com/events/528227"
                className="flex-1"
              />
              <Button variant="primary" type="submit" disabled={importing}>
                {importing ? 'Importing…' : 'Import'}
              </Button>
            </form>

            {error && (
              <div className="mt-4 text-sm text-red-600 border border-red-200 bg-red-50 rounded p-3">
                {error}
              </div>
            )}

            {result && (
              <div className="mt-4 text-sm text-green-800 border border-green-200 bg-green-50 rounded p-3">
                <p className="font-semibold">{result.eventName}</p>
                <p className="text-xs mt-1 text-green-700">
                  {result.roundsImported} rounds · {result.standingsImported} standings ·{' '}
                  {result.matchesImported} matches imported
                </p>
              </div>
            )}
          </Card>

          <Card className="p-6" title="Recently imported events">
            {recentLoading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : recent.length === 0 ? (
              <p className="text-sm text-gray-500">No events imported yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="pb-2 font-medium">Event</th>
                    <th className="pb-2 font-medium">Store</th>
                    <th className="pb-2 font-medium">Imported</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recent.map((e) => (
                    <tr key={e.eventId}>
                      <td className="py-2 pr-4 text-gray-900">{e.eventName}</td>
                      <td className="py-2 pr-4 text-gray-500">{e.storeName ?? '—'}</td>
                      <td className="py-2 text-gray-500">
                        {e.importedAt ? new Date(e.importedAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h2 className="font-display text-base font-medium uppercase tracking-wide text-gray-900">Suggested events</h2>
            <button
              type="button"
              onClick={loadSuggestions}
              disabled={suggestionsLoading}
              className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-40 whitespace-nowrap"
            >
              Refresh
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            DLCs, CCQs, ACQs, and independently-run big-money events discovered on the Play Hub that
            aren't in the archive yet. Name-based discovery — a floor, not a ceiling; a real event with
            an unrelated name won't show up here.
          </p>

          {suggestionsLoading ? (
            <p className="text-sm text-gray-500">Searching the Play Hub…</p>
          ) : suggestionsError ? (
            <p className="text-sm text-red-600">{suggestionsError}</p>
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-gray-500">No new events found — everything discoverable is already imported.</p>
          ) : (
            <ul className="space-y-2 max-h-[70vh] overflow-y-auto">
              {suggestions.map((s) => {
                const status = suggestionStatus[s.eventId]
                const isImporting = status === 'importing'
                const isDone = status === 'done'
                const isError = status && status !== 'importing' && status !== 'done'
                return (
                  <li key={s.eventId} className="border border-gray-100 rounded p-3">
                    <p className="text-sm font-medium text-gray-900 leading-snug">{s.eventName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {s.storeName ?? 'Unknown store'}
                      {s.startDatetime ? ` · ${new Date(s.startDatetime).toLocaleDateString()}` : ''}
                      {s.startingPlayerCount ? ` · ${s.startingPlayerCount} players` : ''}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Button size="sm" onClick={() => handleImportSuggestion(s)} disabled={isImporting || isDone}>
                        {isImporting ? 'Importing…' : isDone ? 'Imported' : 'Import'}
                      </Button>
                      <a
                        href={s.eventUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-gray-400 hover:text-gray-700"
                      >
                        View on Play Hub
                      </a>
                    </div>
                    {isError && <p className="text-xs text-red-600 mt-1">{status}</p>}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
