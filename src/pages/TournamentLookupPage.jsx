import { useState } from 'react'
import { fetchEventDetails, getCurrentRoundId, fetchTournamentStandings, findPlayerInStandings, formatTiebreakers } from '../lib/tournamentApi'

export function TournamentLookupPage() {
  const [eventUrl, setEventUrl] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [standings, setStandings] = useState(null)
  const [player, setPlayer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function extractEventId(url) {
    const match = url.match(/\/events\/(\d+)/)
    return match ? match[1] : null
  }

  function handleUrlChange(e) {
    setEventUrl(e.target.value)
    setError(null)
  }

  async function handleSearch(e) {
    e.preventDefault()
    if (!eventUrl || !playerName) {
      setError('Please enter both event URL and player name')
      return
    }

    const eventId = extractEventId(eventUrl)
    if (!eventId) {
      setError('Invalid event URL. Format: https://tcg.ravensburgerplay.com/events/12345')
      return
    }

    setLoading(true)
    setError(null)
    setPlayer(null)

    try {
      // Fetch event details to get current round
      const eventDetails = await fetchEventDetails(eventId)
      const roundId = getCurrentRoundId(eventDetails)

      if (!roundId) {
        setError('Could not find active tournament round')
        return
      }

      // Fetch standings for current round
      const data = await fetchTournamentStandings(roundId, 1, 100)
      setStandings(data)

      // Find player in standings
      const found = findPlayerInStandings(data.results, playerName)
      if (found) {
        setPlayer(found)
      } else {
        setError(`Player "${playerName}" not found in current standings`)
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch tournament data')
    } finally {
      setLoading(false)
    }
  }

  const totalPlayers = standings?.total
  const tiebreakers = player ? formatTiebreakers(player) : null

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">
          Tournament Lookup
        </h1>
        <p className="text-sm text-gray-500">
          Find your standing and tiebreakers to determine ID eligibility.
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
            Paste the tournament event URL
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

      {player && tiebreakers && (
        <div className="space-y-6">
          <div className="border border-gray-200 rounded-lg p-6 bg-white">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {player.player.best_identifier}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Rank #{tiebreakers.rank} of {totalPlayers}
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-gray-900">
                  {tiebreakers.record}
                </div>
                <p className="text-xs text-gray-500 mt-1">Record (W-D-L)</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                <span className="text-gray-600">Match Points</span>
                <span className="font-mono font-bold text-gray-900">
                  {tiebreakers.matchPoints}
                </span>
              </div>

              <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                <span className="text-gray-600">Game Win %</span>
                <span className="font-mono text-gray-900">
                  {tiebreakers.gameWinPercentage}%
                </span>
              </div>

              <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                <span className="text-gray-600">Opponent Match Win %</span>
                <span className="font-mono text-gray-900">
                  {tiebreakers.opponentMatchWinPercentage}%
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600">Opponent Game Win %</span>
                <span className="font-mono text-gray-900">
                  {tiebreakers.opponentGameWinPercentage}%
                </span>
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <p className="text-sm text-gray-700">
              <strong className="text-gray-900">{tiebreakers.rank - 1}</strong> player{tiebreakers.rank - 1 !== 1 ? 's' : ''} ahead
              {totalPlayers && (
                <>
                  {' '}· <strong className="text-gray-900">{totalPlayers - tiebreakers.rank}</strong> player{totalPlayers - tiebreakers.rank !== 1 ? 's' : ''} behind
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {!player && !error && standings && (
        <div className="text-sm text-gray-500 text-center py-8">
          Enter a player name to search standings
        </div>
      )}
    </div>
  )
}
