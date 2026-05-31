import { useState, useEffect, Fragment } from 'react'
import {
  fetchEventDetails,
  getTournamentStructure,
  fetchTournamentStandings,
  fetchAllRegistrations,
  fetchAllRoundMatches,
  formatTiebreakers,
  analyzeId,
  analyzeAdvancement,
} from '../lib/tournamentApi'
import { VALID_INKS } from '../lib/inkColors'
import { generateShareImage, downloadShareImage, copyShareImageToClipboard } from '../lib/tournamentShareImage'

const ANNOTATIONS_KEY = 'lorcana_tournament_match_annotations'

function getAnnotations() {
  try { return JSON.parse(localStorage.getItem(ANNOTATIONS_KEY) ?? '{}') } catch { return {} }
}

function saveAnnotation(matchId, patch) {
  const all = getAnnotations()
  all[String(matchId)] = { ...all[String(matchId)], ...patch }
  localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(all))
}

const INK_DOT_COLORS = {
  amber:    'bg-yellow-400',
  amethyst: 'bg-violet-500',
  emerald:  'bg-emerald-500',
  ruby:     'bg-red-500',
  sapphire: 'bg-blue-500',
  steel:    'bg-gray-400',
}

function ColorPicker({ selected, onChange }) {
  function toggle(color) {
    const next = selected.includes(color)
      ? selected.filter(c => c !== color)
      : selected.length >= 2 ? [selected[1], color] : [...selected, color]
    onChange(next)
  }
  return (
    <div className="flex gap-1">
      {VALID_INKS.map(color => (
        <button
          key={color}
          title={color.charAt(0).toUpperCase() + color.slice(1)}
          onClick={() => toggle(color)}
          className={`w-5 h-5 rounded-full border-2 transition-all ${INK_DOT_COLORS[color]} ${
            selected.includes(color) ? 'border-white scale-110' : 'border-transparent opacity-40 hover:opacity-70'
          }`}
        />
      ))}
    </div>
  )
}

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

function matchResultForPlayer(match, playerId) {
  if (match.match_is_bye) return { result: 'BYE', score: '', opponent: 'BYE' }
  if (match.match_is_intentional_draw || match.match_is_unintentional_draw) {
    const opp = match.player_match_relationships.find((r) => r.player.id !== playerId)
    return { result: 'DRAW', score: '—', opponent: opp?.user_event_status.best_identifier ?? '—' }
  }
  const won = match.winning_player === playerId
  const opp = match.player_match_relationships.find((r) => r.player.id !== playerId)
  const oppName = opp?.user_event_status.best_identifier ?? '—'
  const w = match.games_won_by_winner
  const l = match.games_won_by_loser
  const score = won ? `${w}-${l}` : `${l}-${w}`
  return { result: won ? 'WIN' : 'LOSS', score, opponent: oppName }
}

function MatchesTab({ allMatches, matchesLoading }) {
  if (matchesLoading && !allMatches) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
        <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Loading matches…
      </div>
    )
  }
  if (!allMatches || allMatches.length === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center">No match data available.</p>
  }

  const rounds = [...new Set(allMatches.map((m) => m.round_number))].sort((a, b) => a - b)

  return (
    <div className="space-y-6">
      {rounds.map((roundNum) => {
        const roundMatches = allMatches.filter((m) => m.round_number === roundNum)
        const phaseName = roundMatches[0]?.phase_name
        return (
          <div key={roundNum} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">Round {roundNum}</span>
              {phaseName && <span className="text-xs text-gray-400">{phaseName}</span>}
              <span className="ml-auto text-xs text-gray-400">{roundMatches.length} matches</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 w-10">Tbl</th>
                  <th className="text-left px-4 py-2">Player 1</th>
                  <th className="text-center px-4 py-2 w-20">Result</th>
                  <th className="text-right px-4 py-2">Player 2</th>
                </tr>
              </thead>
              <tbody>
                {roundMatches.map((match) => {
                  const [p1, p2] = match.player_match_relationships.sort((a, b) => a.player_order - b.player_order)
                  const p1Won = match.winning_player === p1?.player.id
                  const p2Won = match.winning_player === p2?.player.id
                  const isDraw = match.match_is_intentional_draw || match.match_is_unintentional_draw
                  const isBye = match.match_is_bye
                  const w = match.games_won_by_winner
                  const l = match.games_won_by_loser
                  return (
                    <tr key={match.id} className="border-t border-gray-100">
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{match.table_number ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-medium ${p1Won ? 'text-green-700' : isDraw ? 'text-gray-700' : 'text-gray-400'}`}>
                          {p1?.user_event_status.best_identifier ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-xs text-gray-500">
                        {isBye ? 'BYE' : isDraw ? 'DRAW' : `${w}-${l}`}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-medium ${p2Won ? 'text-green-700' : isDraw ? 'text-gray-700' : 'text-gray-400'}`}>
                          {p2?.user_event_status.best_identifier ?? '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

function PlayerMatchHistory({ player, allMatches, matchesLoading, structure }) {
  const playerId = player?.player?.id
  const [annotations, setAnnotations] = useState(getAnnotations)
  const [shareStatus, setShareStatus] = useState(null) // null | 'copying' | 'copied' | 'error'

  function updateAnnotation(matchId, patch) {
    saveAnnotation(matchId, patch)
    setAnnotations(getAnnotations())
  }

  if (matchesLoading && !allMatches) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-white">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Match History</h3>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Loading…
        </div>
      </div>
    )
  }

  const playerMatches = (allMatches ?? []).filter((m) => m.players.includes(playerId))
  if (playerMatches.length === 0) return null

  // Derive overall stats from matches
  const wins   = playerMatches.filter(m => !m.match_is_bye && m.winning_player === playerId).length
  const losses = playerMatches.filter(m => !m.match_is_bye && m.status === 'COMPLETE' && m.winning_player !== playerId && !m.match_is_intentional_draw && !m.match_is_unintentional_draw).length
  const draws  = playerMatches.filter(m => m.match_is_intentional_draw || m.match_is_unintentional_draw).length
  const played = wins + losses + draws
  const winPct = played > 0 ? ((wins / played) * 100).toFixed(1) : '0.0'

  function handleShare(action) {
    const rows = playerMatches.map(m => {
      const { result, score, opponent } = matchResultForPlayer(m, playerId)
      const ann = annotations[String(m.id)] ?? {}
      return {
        round:     m.round_number,
        result,
        score,
        opponent,
        oppColors: ann.oppColors ?? [],
        onPlay:    ann.onPlay ?? null,
      }
    })

    const canvas = generateShareImage({
      playerName:   player?.user_event_status?.best_identifier ?? '—',
      rank:         player?.rank ?? null,
      totalPlayers: null,
      record:       player?.record ?? `${wins}-${losses}-${draws}`,
      matchPoints:  player?.match_points ?? wins * 3 + draws,
      winPct,
      eventName:    structure?.eventName ?? null,
      rows,
    })

    if (action === 'download') {
      const name = (player?.user_event_status?.best_identifier ?? 'player').replace(/\s+/g, '-').toLowerCase()
      downloadShareImage(canvas, `${name}-tournament.jpg`)
    } else {
      setShareStatus('copying')
      copyShareImageToClipboard(canvas)
        .then(() => { setShareStatus('copied'); setTimeout(() => setShareStatus(null), 2500) })
        .catch(() => { setShareStatus('error'); setTimeout(() => setShareStatus(null), 2500) })
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Match History</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 mr-1">Share card:</span>
          <button
            onClick={() => handleShare('copy')}
            disabled={shareStatus === 'copying'}
            className="px-3 py-1 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {shareStatus === 'copying' ? 'Copying…' : shareStatus === 'copied' ? '✓ Copied' : shareStatus === 'error' ? 'Failed' : 'Copy Image'}
          </button>
          <button
            onClick={() => handleShare('download')}
            className="px-3 py-1 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Download JPG
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 w-16">Round</th>
              <th className="text-left px-4 py-2">Opponent</th>
              <th className="text-center px-4 py-2 w-16">Result</th>
              <th className="text-center px-4 py-2 w-14">Score</th>
              <th className="text-left px-4 py-2">Opp Colors</th>
              <th className="text-center px-4 py-2 w-24">Play/Draw</th>
            </tr>
          </thead>
          <tbody>
            {playerMatches.map((match) => {
              const { result, score, opponent } = matchResultForPlayer(match, playerId)
              const ann = annotations[String(match.id)] ?? {}
              const oppColors = ann.oppColors ?? []
              const onPlay    = ann.onPlay ?? null

              const resultStyle = result === 'WIN'
                ? 'bg-green-100 text-green-800'
                : result === 'LOSS'
                ? 'bg-red-100 text-red-800'
                : result === 'BYE'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-700'

              const pdStyle = onPlay === true
                ? 'bg-green-100 text-green-800'
                : onPlay === false
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-500'

              function cycleOnPlay() {
                const next = onPlay === null ? true : onPlay === true ? false : null
                updateAnnotation(match.id, { onPlay: next })
              }

              return (
                <tr key={match.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-500 font-medium">R{match.round_number}</td>
                  <td className="px-4 py-2.5 text-gray-900 font-medium">{opponent}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${resultStyle}`}>
                      {result}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono text-gray-500 text-xs">{score}</td>
                  <td className="px-4 py-2.5">
                    <ColorPicker
                      selected={oppColors}
                      onChange={colors => updateAnnotation(match.id, { oppColors: colors })}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={cycleOnPlay}
                      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold cursor-pointer transition-colors ${pdStyle}`}
                      title="Click to cycle: Play → Draw → Unknown"
                    >
                      {onPlay === true ? 'Play' : onPlay === false ? 'Draw' : '?'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
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
  const [allMatches, setAllMatches] = useState(null)
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('standings')

  useEffect(() => {
    if (!structure?.timerEndDatetime || !structure?.timerIsRunning) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    setAllMatches(null)
    setActiveTab('standings')

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

      // Normalize match_points to current total — the standings snapshot field is stale mid-event
      const normalized = allResults.map((entry) => ({
        ...entry,
        match_points: entry.user_event_status?.total_match_points ?? entry.match_points,
      }))
      setAllStandings(normalized)

      // Fetch registrations best-effort (non-blocking); key by user.id for reliable lookup
      fetchAllRegistrations(eventId)
        .then((regs) => setRegistrationMap(new Map(regs.map((r) => [r.user.id, r.registration_status]))))
        .catch(() => {})

      // Fetch matches per round in parallel (non-blocking — updates independently)
      setMatchesLoading(true)
      fetchAllRoundMatches(eventId, eventDetails)
        .then((matches) => setAllMatches(matches))
        .catch(() => setAllMatches([]))
        .finally(() => setMatchesLoading(false))
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

      {/* Tab switcher */}
      {allStandings && !player && (
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('standings')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'standings'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Standings
          </button>
          <button
            onClick={() => setActiveTab('matches')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
              activeTab === 'matches'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Matches
            {matchesLoading && (
              <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
            )}
            {!matchesLoading && allMatches && (
              <span className="text-xs text-gray-400 font-normal">({allMatches.length})</span>
            )}
          </button>
        </div>
      )}

      {/* Standings table */}
      {allStandings && !player && activeTab === 'standings' && (
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
                    const regStatus = registrationMap?.get(entry.player.id)
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

      {/* Matches tab */}
      {allStandings && !player && activeTab === 'matches' && (
        <MatchesTab allMatches={allMatches} matchesLoading={matchesLoading} />
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

          {/* Player match history */}
          <PlayerMatchHistory player={player} allMatches={allMatches} matchesLoading={matchesLoading} structure={structure} />
        </div>
      )}
    </div>
  )
}
