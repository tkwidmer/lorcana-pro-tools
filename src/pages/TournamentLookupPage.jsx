import { useEffect, useState } from 'react'
import { fetchTournamentStandings, findPlayerInStandings, calculateTiebreakers } from '../lib/tournamentApi'

export function TournamentLookupPage() {
  const [roundId, setRoundId] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [standings, setStandings] = useState(null)
  const [player, setPlayer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSearch(e) {
    e.preventDefault()
    if (!roundId || !playerName) {
      setError('Please enter both Round ID and player name')
      return
    }

    setLoading(true)
    setError(null)
    setPlayer(null)

    try {
      const data = await fetchTournamentStandings(roundId, 1, 100)
      setStandings(data)

      const found = findPlayerInStandings(data.results, playerName)
      if (found) {
        setPlayer(found)
      } else {
        setError(`Player "${playerName}" not found in standings`)
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch standings')
    } finally {
      setLoading(false)
    }
  }

  const tiebreakers = player ? calculateTiebreakers(player) : null
  const totalPlayers = standings?.total
  const playersAhead = player ? player.rank - 1 : 0

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
            Round ID
          </label>
          <input
            type="text"
            placeholder="e.g., 852772"
            value={roundId}
            onChange={e => setRoundId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Find the Round ID in the tournament URL
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
                  {player.player.best_identifier}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Rank #{player.rank} of {totalPlayers} players
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-gray-900">
                  {player.record}
                </div>
                <p className="text-xs text-gray-500 mt-1">Wins-Draws-Losses</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                <span className="text-gray-600">Match Points</span>
                <span className="font-mono font-bold text-gray-900">
                  {player.match_points}
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
              <strong className="text-gray-900">{playersAhead}</strong> player{playersAhead !== 1 ? 's' : ''} ahead
              {totalPlayers && (
                <>
                  {' '}· <strong className="text-gray-900">{totalPlayers - player.rank}</strong> player{totalPlayers - player.rank !== 1 ? 's' : ''} behind
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {!player && !error && standings && (
        <div className="text-sm text-gray-500 text-center py-8">
          Enter a player name and search to see their standing
        </div>
      )}
    </div>
  )
}
