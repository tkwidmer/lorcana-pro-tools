import { useEffect, useState } from 'react'
import { fetchEventRegistrations, findPlayerInRegistrations, formatRecord } from '../lib/tournamentApi'

export function TournamentLookupPage() {
  const [eventUrl, setEventUrl] = useState('')
  const [eventId, setEventId] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [registrations, setRegistrations] = useState(null)
  const [player, setPlayer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function extractEventId(url) {
    const match = url.match(/\/events\/(\d+)/)
    return match ? match[1] : null
  }

  function handleUrlChange(e) {
    const url = e.target.value
    setEventUrl(url)

    if (!url.trim()) {
      setEventId('')
      return
    }

    const extracted = extractEventId(url)
    if (!extracted) {
      setError('Invalid event URL. Format: https://tcg.ravensburgerplay.com/events/12345')
      return
    }

    setError(null)
    setEventId(extracted)
  }

  async function handleSearch(e) {
    e.preventDefault()
    if (!eventId || !playerName) {
      setError('Please enter both event URL and player name')
      return
    }

    setLoading(true)
    setError(null)
    setPlayer(null)

    try {
      const data = await fetchEventRegistrations(eventId, 1, 100)
      setRegistrations(data)

      const found = findPlayerInRegistrations(data.results, playerName)
      if (found) {
        setPlayer(found)
      } else {
        setError(`Player "${playerName}" not found in event registrations`)
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch event data')
    } finally {
      setLoading(false)
    }
  }

  const totalPlayers = registrations?.total
  const playerRecord = player ? formatRecord(player) : null
  const playerStatus = player?.registration_status

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">
          Tournament Lookup
        </h1>
        <p className="text-sm text-gray-500">
          Search for a player's standing and tiebreakers to determine ID eligibility.
        </p>
      </div>

      <form onSubmit={handleSearch} className="mb-8 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tournament Event URL
          </label>
          <input
            type="url"
            placeholder="e.g., https://tcg.ravensburgerplay.com/events/528227"
            value={eventUrl}
            onChange={handleUrlChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            {eventId ? `✓ Event ${eventId}` : 'Paste the tournament event URL'}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Player Name
          </label>
          <input
            type="text"
            placeholder="e.g., Adam F or ajfletcher"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-4 mb-6">
          {error}
        </div>
      )}

      {player && (
        <div className="space-y-6">
          <div className="border border-gray-200 rounded-lg p-6 bg-white">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {player.best_identifier || player.user.best_identifier}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${
                    playerStatus === 'COMPLETE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {playerStatus === 'COMPLETE' ? 'Active' : 'Eliminated'}
                  </span>
                  {totalPlayers && (
                    <p className="text-sm text-gray-500">
                      {totalPlayers} players total
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-gray-900">
                  {playerRecord}
                </div>
                <p className="text-xs text-gray-500 mt-1">W-D-L</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                <span className="text-gray-600">Match Points</span>
                <span className="font-mono font-bold text-gray-900">
                  {player.total_match_points}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600">Matches Won</span>
                <span className="font-mono text-gray-900">{player.matches_won}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600">Matches Drawn</span>
                <span className="font-mono text-gray-900">{player.matches_drawn}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600">Matches Lost</span>
                <span className="font-mono text-gray-900">{player.matches_lost}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!player && !error && registrations && (
        <div className="text-sm text-gray-500 text-center py-8">
          Enter a player name and search to see their registration
        </div>
      )}
    </div>
  )
}
