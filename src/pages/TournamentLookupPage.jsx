import { useState, useEffect, Fragment } from 'react'
import {
  fetchEventDetails,
  getTournamentStructure,
  fetchTournamentStandings,
  fetchAllRegistrations,
  formatTiebreakers,
  analyzeId,
  analyzeAdvancement,
} from '../lib/tournamentApi'

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const RECOMMENDATION_STYLES = {
  safe: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-800',
    label: 'Safe to ID',
    detail: 'You have a comfortable points cushion above the cut line.',
  },
  borderline: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    label: 'Borderline — check tiebreakers',
    detail: 'You are in the cut but your cushion is thin. An ID is risky if the cut line player wins.',
  },
  danger: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    label: 'Do not ID — you need the win',
    detail: 'You are outside or right at the cut line. An ID likely drops you out.',
  },
}

export function TournamentLookupPage() {
  const [eventUrl, setEventUrl] = useState('')
  const [allStandings, setAllStandings] = useState(null)
  const [structure, setStructure] = useState(null)
  const [player, setPlayer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [registrationMap, setRegistrationMap] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(null)

  useEffect(() => {
    if (!structure?.timerEndDatetime || !structure?.timerIsRunning) {
      setTimeRemaining(null)
      return
    }
    function tick() {
      setTimeRemaining(Math.max(0, Math.floor((new Date(structure.timerEndDatetime) - Date.now()) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [structure?.timerEndDatetime, structure?.timerIsRunning])

  function extractEventId(url) {
    const match = url.match(/\/events\/(\d+)/)
    return match ? match[1] : null
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
    setAllStandings(null)
    setSearchTerm('')
    setRegistrationMap(null)

    try {
      const eventDetails = await fetchEventDetails(eventId)
      const tournamentStructure = getTournamentStructure(eventDetails)

      if (!tournamentStructure?.currentRoundId) {
        setError('Could not find active tournament round')
        return
      }

      setStructure(tournamentStructure)

      // Fetch all pages of standings
      const allResults = []
      let page = 1
      let hasMore = true

      while (hasMore) {
        const data = await fetchTournamentStandings(tournamentStructure.currentRoundId, page, 50)
        allResults.push(...data.results)
        hasMore = data.next_page_number !== null
        page = data.next_page_number || page + 1
      }

      setAllStandings(allResults)

      // Fetch registrations for player status badges (best-effort)
      try {
        const regs = await fetchAllRegistrations(eventId)
        setRegistrationMap(new Map(regs.map((r) => [r.best_identifier, r.registration_status])))
      } catch {
        // Registration status is supplementary; don't surface the error
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch tournament data')
    } finally {
      setLoading(false)
    }
  }

  const filteredStandings = allStandings?.filter((entry) => {
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    return (
      entry.player.best_identifier.toLowerCase().includes(q) ||
      entry.user_event_status.best_identifier.toLowerCase().includes(q)
    )
  })

  const tiebreakers = player ? formatTiebreakers(player, structure?.tiebreakers) : null
  const idAnalysis = player && structure ? analyzeId(player, allStandings, structure) : null
  const advancementAnalysis = player && structure ? analyzeAdvancement(player, structure) : null

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">
          Tournament Lookup
        </h1>
        <p className="text-sm text-gray-500">
          Load standings and select yourself to see your rank, tiebreakers, and ID eligibility.
        </p>
      </div>

      <form onSubmit={handleLoadStandings} className="mb-6 flex gap-3">
        <input
          type="url"
          placeholder="https://tcg.ravensburgerplay.com/events/528227"
          value={eventUrl}
          onChange={(e) => { setEventUrl(e.target.value); setError(null) }}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {loading ? 'Loading…' : 'Load Standings'}
        </button>
      </form>

      {error && (
        <div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-4 mb-6">
          {error}
        </div>
      )}

      {/* Tournament info strip */}
      {structure && (
        <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-6 p-3 bg-gray-50 rounded-lg border border-gray-200">
          {structure.isElimination ? (
            <span>
              <strong className="text-gray-900">{structure.currentPhaseName || 'Elimination'}</strong>{' '}
              · Round {structure.currentRoundNumber}
            </span>
          ) : (
            <span>
              <strong className="text-gray-900">Round</strong>{' '}
              {structure.currentRoundNumber}
              {structure.totalSwissRounds > 0 && ` of ${structure.totalSwissRounds}`}
            </span>
          )}
          {!structure.isElimination && structure.swissRoundsRemaining > 0 && (
            <span>
              <strong className="text-gray-900">{structure.swissRoundsRemaining}</strong> round{structure.swissRoundsRemaining !== 1 ? 's' : ''} remaining
            </span>
          )}
          {structure.topCutSize && (
            <span>
              Top <strong className="text-gray-900">{structure.topCutSize}</strong> cut
            </span>
          )}
          {allStandings && (
            <span>
              <strong className="text-gray-900">{allStandings.length}</strong>
              {structure.startingPlayerCount && structure.startingPlayerCount !== allStandings.length && (
                <span className="text-gray-400"> / {structure.startingPlayerCount}</span>
              )}
              {' '}players
            </span>
          )}
          {timeRemaining !== null && (
            <span className={`font-mono font-medium ${timeRemaining === 0 ? 'text-red-600' : timeRemaining < 300 ? 'text-red-600' : timeRemaining < 900 ? 'text-amber-600' : 'text-gray-700'}`}>
              {timeRemaining === 0 ? 'Time expired' : `${formatTime(timeRemaining)} left`}
            </span>
          )}
          {structure.advancementRequirement && (
            <span className="text-amber-700">
              {structure.advancementRequirement.type === 'points' ? (
                <>Need <strong className="text-amber-900">{structure.advancementRequirement.value} pts</strong> → {structure.advancementRequirement.nextPhaseName}</>
              ) : (
                <>Need top <strong className="text-amber-900">{structure.advancementRequirement.value}</strong> → {structure.advancementRequirement.nextPhaseName}</>
              )}
            </span>
          )}
        </div>
      )}

      {/* Event details card */}
      {structure && (
        <div className="border border-gray-200 rounded-lg p-4 mb-6 bg-white">
          <p className="text-sm font-semibold text-gray-900 mb-3 leading-snug">{structure.eventName}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            {structure.eventStore && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Organizer</p>
                <p className="text-gray-900 font-medium">{structure.eventStore.name}</p>
              </div>
            )}
            {structure.eventStore?.address && (
              <div className="col-span-2 sm:col-span-1">
                <p className="text-xs text-gray-400 mb-0.5">Venue</p>
                <p className="text-gray-700 text-xs leading-relaxed">{structure.eventStore.address}</p>
              </div>
            )}
            {structure.gameplayFormat && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Format</p>
                <p className="text-gray-900">{structure.gameplayFormat}</p>
              </div>
            )}
            {structure.rulesEnforcementLevel && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">REL</p>
                <p className="text-gray-900">
                  {structure.rulesEnforcementLevel.charAt(0).toUpperCase() +
                    structure.rulesEnforcementLevel.slice(1).toLowerCase()}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Standings table */}
      {allStandings && !player && (
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Search by name…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="max-h-[32rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 w-12">Rank</th>
                    <th className="text-left px-4 py-2">Player</th>
                    <th className="text-right px-4 py-2">Record</th>
                    <th className="text-right px-4 py-2">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStandings?.map((entry) => {
                    const atCutLine = structure?.topCutSize && entry.rank === structure.topCutSize
                    const regStatus = registrationMap?.get(entry.user_event_status.best_identifier)
                    const dropped = regStatus === 'ELIMINATED'
                    return (
                      <Fragment key={entry.id}>
                        {atCutLine && (
                          <tr className="bg-blue-50">
                            <td colSpan={4} className="px-4 py-1 text-xs text-blue-600 font-semibold">
                              — Top {structure.topCutSize} cut line —
                            </td>
                          </tr>
                        )}
                        <tr
                          onClick={() => setPlayer(entry)}
                          className={`border-t border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors${dropped ? ' opacity-50' : ''}`}
                        >
                          <td className="px-4 py-2.5 text-gray-500 font-medium">{entry.rank}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {entry.user_event_status.best_identifier}
                              </span>
                              {dropped && (
                                <span className="text-xs text-gray-400 font-normal">dropped</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400">{entry.player.best_identifier}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-900">{entry.record}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">{entry.match_points}</td>
                        </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Player detail view */}
      {player && tiebreakers && (
        <div className="space-y-4">
          <button
            onClick={() => setPlayer(null)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← Back to standings
          </button>

          {/* Advancement status */}
          {advancementAnalysis && (() => {
            const { status, nextPhaseName, value, type, winsNeeded, pointsNeeded } = advancementAnalysis
            const styles = {
              secured:      { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' },
              possible:     { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800' },
              eliminated:   { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800' },
              in_cut:       { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' },
              outside_cut:  { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800' },
            }
            const s = styles[status]
            const label = {
              secured:     `Secured advancement to ${nextPhaseName}`,
              possible:    type === 'points'
                ? `Need ${winsNeeded} more win${winsNeeded !== 1 ? 's' : ''} (${pointsNeeded} pts) for ${nextPhaseName}`
                : `Currently outside top ${value} for ${nextPhaseName}`,
              eliminated:  `Eliminated from ${nextPhaseName} contention`,
              in_cut:      `Currently in top ${value} → ${nextPhaseName}`,
              outside_cut: `Currently outside top ${value} → ${nextPhaseName}`,
            }[status]
            return (
              <div className={`rounded-lg border px-4 py-2.5 text-sm font-medium ${s.bg} ${s.border} ${s.text}`}>
                {label}
              </div>
            )
          })()}

          {/* ID Analysis */}
          {idAnalysis && (
            <div className={`rounded-lg border p-5 ${RECOMMENDATION_STYLES[idAnalysis.recommendation].bg} ${RECOMMENDATION_STYLES[idAnalysis.recommendation].border}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className={`font-bold text-base ${RECOMMENDATION_STYLES[idAnalysis.recommendation].text}`}>
                    {RECOMMENDATION_STYLES[idAnalysis.recommendation].label}
                  </p>
                  <p className={`text-sm mt-0.5 ${RECOMMENDATION_STYLES[idAnalysis.recommendation].text} opacity-80`}>
                    {RECOMMENDATION_STYLES[idAnalysis.recommendation].detail}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded ${idAnalysis.inCut ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {idAnalysis.inCut ? `In cut (rank #${idAnalysis.myRank})` : `Outside cut (rank #${idAnalysis.myRank})`}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
                <div className="bg-white bg-opacity-60 rounded p-2 text-center">
                  <div className="font-bold text-gray-900">{player.match_points}</div>
                  <div className="text-xs text-gray-500">Your pts</div>
                </div>
                <div className="bg-white bg-opacity-60 rounded p-2 text-center">
                  <div className="font-bold text-gray-900">
                    {idAnalysis.cutLinePoints ?? '—'}
                  </div>
                  <div className="text-xs text-gray-500">Cut line pts</div>
                </div>
                <div className="bg-white bg-opacity-60 rounded p-2 text-center">
                  <div className="font-bold text-gray-900">+{idAnalysis.afterIdPoints - player.match_points} → {idAnalysis.afterIdPoints}</div>
                  <div className="text-xs text-gray-500">After ID</div>
                </div>
                <div className="bg-white bg-opacity-60 rounded p-2 text-center">
                  <div className="font-bold text-gray-900">+3 → {idAnalysis.afterWinPoints}</div>
                  <div className="text-xs text-gray-500">After win</div>
                </div>
              </div>

              {idAnalysis.pointsAboveCut !== null && (
                <p className="text-xs text-gray-600 mt-3">
                  {idAnalysis.swissRoundsRemaining > 0 && `${idAnalysis.swissRoundsRemaining} swiss round${idAnalysis.swissRoundsRemaining !== 1 ? 's' : ''} remaining · `}
                  {idAnalysis.pointsAboveCut > 0 ? `${idAnalysis.pointsAboveCut} pts above cut line` : `${Math.abs(idAnalysis.pointsAboveCut)} pts below cut line`}
                </p>
              )}
            </div>
          )}

          {/* Standing details */}
          <div className="border border-gray-200 rounded-lg p-6 bg-white">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {player.user_event_status.best_identifier}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Rank #{tiebreakers.rank} of {allStandings?.length}
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-gray-900">{tiebreakers.record}</div>
                <p className="text-xs text-gray-500 mt-1">W-D-L</p>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex justify-between items-center pb-2.5 border-b border-gray-100">
                <span className="text-gray-600 text-sm">Match Points</span>
                <span className="font-mono font-bold text-gray-900">{tiebreakers.matchPoints}</span>
              </div>
              {tiebreakers.ordered.map(({ key, label, value }, i) => (
                <div
                  key={key}
                  className={`flex justify-between items-center${i < tiebreakers.ordered.length - 1 ? ' pb-2.5 border-b border-gray-100' : ''}`}
                >
                  <span className="text-gray-600 text-sm">
                    <span className="text-gray-400 text-xs mr-1.5">{i + 1}.</span>{label}
                  </span>
                  <span className="font-mono text-gray-900">{value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
