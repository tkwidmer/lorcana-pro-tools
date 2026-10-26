import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchArchiveEvents, searchTournamentPlayers } from '../lib/tournamentHistoryApi'
import { isMajor, formatEventDate, MAJOR_MIN_PLAYERS } from '../lib/resultsArchive'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { ArchiveFootnote, ArchiveLoading } from '../components/ResultsArchive'

const SEARCH_MIN = 3
const SEARCH_DEBOUNCE_MS = 300

function PlayerSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  // The last completed search; "searching" is derived from it lagging the input.
  const [found, setFound] = useState({ q: '', players: [] })
  const q = query.trim()
  const searching = q !== found.q
  const results = found.players

  useEffect(() => {
    if (q.length < SEARCH_MIN) return
    let cancelled = false
    const t = setTimeout(() => {
      searchTournamentPlayers(q)
        .then((data) => { if (!cancelled) setFound({ q, players: data.players ?? [] }) })
        .catch(() => { if (!cancelled) setFound({ q, players: [] }) })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q])

  return (
    <div className="relative max-w-md">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a player…"
        aria-label="Find a player"
      />
      {q.length >= SEARCH_MIN && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-sm max-h-80 overflow-y-auto">
          {searching && results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">No players match.</p>
          ) : (
            results.map((p) => (
              <button
                key={p.playerId}
                type="button"
                onClick={() => navigate(`/results/players/${p.playerId}`)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50"
              >
                <span className="text-sm font-medium text-gray-900">{p.playerName}</span>
                {p.lastSeenEventName && <span className="block text-xs text-gray-500">{p.lastSeenEventName}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function ResultsPage() {
  const [events, setEvents] = useState(null)
  const [error, setError] = useState(null)
  const [showSmall, setShowSmall] = useState(false)

  useEffect(() => {
    fetchArchiveEvents()
      .then((d) => setEvents(d.events ?? []))
      .catch((e) => setError(e.message))
  }, [])

  const visible = useMemo(() => (events ?? []).filter((e) => showSmall || isMajor(e)), [events, showSmall])

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Tournament Results"
        description="Final standings, brackets and player records from every major event in the archive."
        actions={<Button to="/results/ratings">Player ratings</Button>}
      />
      <div className="mb-6">
        <PlayerSearch />
      </div>

      <Card className="p-4">
        <label className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <input type="checkbox" checked={showSmall} onChange={(e) => setShowSmall(e.target.checked)} />
          Show events under {MAJOR_MIN_PLAYERS} players
        </label>
        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : events === null ? (
          <ArchiveLoading />
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-500">No events imported yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Event</th>
                  <th className="py-2 pr-4">Store</th>
                  <th className="py-2 pr-4">Format</th>
                  <th className="py-2 pr-4 text-right">Players</th>
                  <th className="py-2">Winner</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.eventId} className="border-b border-gray-100">
                    <td className="py-2 pr-4 whitespace-nowrap text-gray-500">{formatEventDate(e.eventDate)}</td>
                    <td className="py-2 pr-4">
                      <Link to={`/results/events/${e.eventId}`} className="font-medium text-gray-900 hover:underline">
                        {e.eventName}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-gray-500">{e.storeName ?? '—'}</td>
                    <td className="py-2 pr-4 text-gray-500">{e.gameplayFormat ?? '—'}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{e.startingPlayerCount ?? '—'}</td>
                    <td className="py-2">
                      {e.winner ? (
                        <Link to={`/results/players/${e.winner.playerId}`} className="hover:underline">
                          {e.winner.playerName}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ArchiveFootnote />
    </div>
  )
}
