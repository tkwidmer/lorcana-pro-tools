import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSupporter } from '../hooks/useSupporter'
import { importTournamentEvent, fetchRecentTournamentImports } from '../lib/tournamentHistoryApi'

export function AdminTournamentImportPage() {
  const { isAdmin, isLoading } = useSupporter()
  const navigate = useNavigate()

  const [eventUrl, setEventUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [recent, setRecent] = useState([])
  const [recentLoading, setRecentLoading] = useState(true)

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

  useEffect(() => {
    if (!isAdmin) return
    fetchRecentTournamentImports()
      .then((data) => setRecent(data.events ?? []))
      .catch(() => {})
      .finally(() => setRecentLoading(false))
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

  if (isLoading) return null

  return (
    <div className="w-full px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Import Tournament History</h1>
        <p className="text-gray-500 text-sm">
          Import a completed Ravensburger Play Hub event's final standings and match results into the
          caster history archive. Safe to re-run for the same event once more rounds have completed —
          it updates the stored data rather than duplicating it.
        </p>
      </div>

      <div className="space-y-8 max-w-2xl">
        <div className="border border-gray-200 rounded-lg p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">Import an event</h2>
          <form onSubmit={handleImport} className="flex gap-2">
            <input
              type="url"
              value={eventUrl}
              onChange={(e) => { setEventUrl(e.target.value); setError(null) }}
              placeholder="https://tcg.ravensburgerplay.com/events/528227"
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
            />
            <button
              type="submit"
              disabled={importing}
              className="border border-gray-900 text-sm font-medium px-4 py-2 hover:bg-gray-900 hover:text-white transition-colors rounded disabled:opacity-40 whitespace-nowrap"
            >
              {importing ? 'Importing…' : 'Import'}
            </button>
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
        </div>

        <div className="border border-gray-200 rounded-lg p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">Recently imported events</h2>
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
        </div>
      </div>
    </div>
  )
}
