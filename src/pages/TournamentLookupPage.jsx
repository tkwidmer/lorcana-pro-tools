import { useState } from 'react'
import { fetchEventDetails, getCurrentRoundId, fetchTournamentStandings, formatTiebreakers } from '../lib/tournamentApi'

export function TournamentLookupPage() {
  const [eventUrl, setEventUrl] = useState('')
  const [allStandings, setAllStandings] = useState(null)
  const [player, setPlayer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  function extractEventId(url) {
    const match = url.match(/\/events\/(\d+)/)
    return match ? match[1] : null
  }

  function handleUrlChange(e) {
    setEventUrl(e.target.value)
    setError(null)
  }

  async function handleLoadStandings(e) {
    e.preventDefault()
    if (!eventUrl) {
      setError('Please enter event URL')
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
    setSearchTerm('')

    try {
      // Fetch event details to get current round
      const eventDetails = await fetchEventDetails(eventId)
      const roundId = getCurrentRoundId(eventDetails)

      if (!roundId) {
        setError('Could not find active tournament round')
        return
      }

      // Fetch all standings for current round
      const allResults = []
      let page = 1
      let hasMore = true

      while (hasMore) {
        const data = await fetchTournamentStandings(roundId, page, 50)
        allResults.push(...data.results)
        hasMore = data.next_page_number !== null
        page = data.next_page_number || page + 1
      }

      setAllStandings(allResults)
    } catch (err) {
      setError(err.message || 'Failed to fetch tournament data')
    } finally {
      setLoading(false)
    }
  }

  const filteredStandings = allStandings?.filter((entry) => {
    const searchLower = searchTerm.toLowerCase()
    return (
      entry.player.best_identifier.toLowerCase().includes(searchLower) ||
      entry.user_event_status.best_identifier.toLowerCase().includes(searchLower)
    )
  })

  const tiebreakers = player ? formatTiebreakers(player) : null

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">
          Tournament Lookup
        </h1>
        <p className="text-sm text-gray-500">
          Load standings and select yourself to see your rank and tiebreakers.
        </p>
      </div>

      <form onSubmit={handleLoadStandings} className="mb-8 space-y-4">
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

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading standings…' : 'Load Standings'}
        </button>
      </form>

      {error && (
        <div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-4 mb-6">
          {error}
        </div>
      )}

      {allStandings && !player && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Find Yourself ({allStandings.length} players)
            </label>
            <input
              type="text"
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 w-12">Rank</th>
                    <th className="text-left px-4 py-2">Player Name</th>
                    <th className="text-right px-4 py-2">Record</th>
                    <th className="text-right px-4 py-2">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStandings?.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() => setPlayer(entry)}
                      className="border-t border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-500 font-medium">{entry.rank}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {entry.user_event_status.best_identifier}
                        </div>
                        <div className="text-xs text-gray-500">
                          {entry.player.best_identifier}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900">
                        {entry.record}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                        {entry.match_points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {player && tiebreakers && (
        <div className="space-y-6">
          <button
            onClick={() => setPlayer(null)}
            className="text-sm text-blue-600 hover:text-blue-800 mb-4"
          >
            ← Back to standings
          </button>

          <div className="border border-gray-200 rounded-lg p-6 bg-white">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {player.user_event_status.best_identifier}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Rank #{tiebreakers.rank} of {allStandings?.length}
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
              {allStandings && (
                <>
                  {' '}· <strong className="text-gray-900">{allStandings.length - tiebreakers.rank}</strong> player{allStandings.length - tiebreakers.rank !== 1 ? 's' : ''} behind
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
