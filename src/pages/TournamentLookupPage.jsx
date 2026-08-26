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
import { PlayerMatchHistory } from '../components/PlayerMatchHistory'
import { PairingHistoryPanel } from '../components/PairingHistoryPanel'

const FAVORITES_KEY = 'lorcana_tournament_favorites'
const TEAM_KEY = 'lorcana_tournament_team'
const RECENTS_KEY = 'lorcana_tournament_recents'
const MAX_RECENTS = 8

// Keyed by the Ravensburger player id (stable across events), so a caster's
// favorites list carries over between tournaments rather than resetting per-event.
function getFavorites() {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '{}') } catch { return {} }
}

function toggleFavoriteStorage(playerId, name) {
  const all = getFavorites()
  const key = String(playerId)
  if (all[key]) {
    delete all[key]
  } else {
    all[key] = { name, addedAt: Date.now() }
  }
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(all))
  return all
}

function FavoriteStar({ active, onToggle, className = '' }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      title={active ? 'Unfavorite' : 'Favorite'}
      className={`text-lg leading-none transition-colors ${active ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-300 hover:text-gray-400'} ${className}`}
    >
      {active ? '★' : '☆'}
    </button>
  )
}

// Single "my team" tag, keyed the same way as favorites — global across events.
function getTeam() {
  try { return JSON.parse(localStorage.getItem(TEAM_KEY) ?? '{}') } catch { return {} }
}

function toggleTeamStorage(playerId, name) {
  const all = getTeam()
  const key = String(playerId)
  if (all[key]) {
    delete all[key]
  } else {
    all[key] = { name, addedAt: Date.now() }
  }
  localStorage.setItem(TEAM_KEY, JSON.stringify(all))
  return all
}

// Minimal per-tournament bookmarks — enough to reload standings and show a
// label, without persisting the (large, ever-changing) standings/roster data
// itself. Most-recently-viewed first, capped at MAX_RECENTS.
function getRecents() {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') } catch { return [] }
}

function saveRecent(entry) {
  const next = [entry, ...getRecents().filter((t) => t.eventId !== entry.eventId)].slice(0, MAX_RECENTS)
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  return next
}

function removeRecent(eventId) {
  const next = getRecents().filter((t) => t.eventId !== eventId)
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  return next
}

// Normalizes /registrations/ entries (available pre-tournament, before any
// round has generated standings) into the same entry shape standings rows
// use, so RosterTable/FavoriteStar/TeamBadge can be reused as-is.
function registrationsToRosterEntries(regs) {
  return regs
    .map((r) => ({
      id: r.id,
      player: { id: r.user.id, best_identifier: r.user.best_identifier },
      user_event_status: { best_identifier: r.best_identifier },
      rank: null,
      record: `${r.matches_won ?? 0}-${r.matches_drawn ?? 0}-${r.matches_lost ?? 0}`,
      match_points: r.total_match_points ?? 0,
    }))
    .sort((a, b) => a.user_event_status.best_identifier.localeCompare(b.user_event_status.best_identifier))
}

function TeamBadge({ active, onToggle, className = '' }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      title={active ? 'Remove from my team' : 'Add to my team'}
      className={`w-5 h-5 rounded-full text-[10px] font-bold leading-none flex items-center justify-center transition-colors ${
        active ? 'bg-purple-500 text-white hover:bg-purple-600' : 'bg-gray-100 text-gray-400 hover:bg-gray-300'
      } ${className}`}
    >
      T
    </button>
  )
}

// Parses a "W-D-L" record string into integer parts, defaulting missing/malformed segments to 0.
function parseRecord(record) {
  const [w, d, l] = String(record ?? '').split('-').map((n) => parseInt(n, 10))
  return { w: w || 0, d: d || 0, l: l || 0 }
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

// Shared by the Favorites and Team tabs — a flat roster of standings entries
// with the same favorite/team toggles and click-through as the main Standings table.
function RosterTable({ entries, favorites, team, toggleFavorite, toggleTeam, registrationMap, onSelectPlayer, emptyMessage, disableSelect = false }) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center px-4">{emptyMessage}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="text-center px-2 py-2 w-16"></th>
            <th className="text-left px-4 py-2 w-12">Rank</th>
            <th className="text-left px-4 py-2">Player</th>
            <th className="text-right px-4 py-2">Record</th>
            <th className="text-right px-4 py-2">Pts</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const regStatus = registrationMap?.get(entry.player.id)
            const dropped = regStatus === 'ELIMINATED'
            const isFavorite = Boolean(favorites[String(entry.player.id)])
            const onTeam = Boolean(team[String(entry.player.id)])
            return (
              <tr
                key={entry.id}
                onClick={disableSelect ? undefined : () => onSelectPlayer(entry)}
                className={`border-t border-gray-100 transition-colors${disableSelect ? '' : ' hover:bg-blue-50 cursor-pointer'}${dropped ? ' opacity-50' : ''}${isFavorite || onTeam ? ' bg-yellow-50' : ''}`}
              >
                <td className="px-2 py-2.5">
                  <div className="flex items-center justify-center gap-1">
                    <FavoriteStar
                      active={isFavorite}
                      onToggle={() => toggleFavorite(entry.player.id, entry.user_event_status.best_identifier)}
                    />
                    <TeamBadge
                      active={onTeam}
                      onToggle={() => toggleTeam(entry.player.id, entry.user_event_status.best_identifier)}
                    />
                  </div>
                </td>
                <td className="px-4 py-2.5 text-gray-500 font-medium">{entry.rank ?? '—'}</td>
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
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// A pairing "involves" a search query if either player's name matches, and
// "involves" a favorites/team filter if either player's id is in that map —
// used to prune huge rounds (a 2000-player DLC is ~1000 matches/round) down
// to what a caster is actually looking for.
function matchInvolvesQuery(match, query) {
  if (!query) return true
  const q = query.toLowerCase()
  return match.player_match_relationships.some((r) =>
    r.user_event_status?.best_identifier?.toLowerCase().includes(q)
  )
}

function matchInvolvesFilter(match, filterMode, favorites, team) {
  if (filterMode === 'all') return true
  const map = filterMode === 'favorites' ? favorites : team
  return match.player_match_relationships.some((r) => map[String(r.player.id)])
}

const MATCH_FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'favorites', label: '★ Favorites' },
  { key: 'team', label: 'My Team' },
]

function MatchesTab({ allMatches, matchesLoading, onSelectPairing, favorites, team }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMode, setFilterMode] = useState('all') // 'all' | 'favorites' | 'team'
  // Rounds toggled away from their default expand/collapse state (default:
  // only the latest round expanded — large events can have 1000+ matches
  // in a single round, so earlier rounds start collapsed).
  const [toggledRounds, setToggledRounds] = useState(() => new Set())

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
  const latestRound = rounds[rounds.length - 1]
  const searchActive = searchTerm.trim() !== '' || filterMode !== 'all'

  function toggleRound(roundNum) {
    setToggledRounds((prev) => {
      const next = new Set(prev)
      if (next.has(roundNum)) next.delete(roundNum)
      else next.add(roundNum)
      return next
    })
  }

  function isRoundExpanded(roundNum) {
    if (searchActive) return true
    const defaultExpanded = roundNum === latestRound
    return toggledRounds.has(roundNum) ? !defaultExpanded : defaultExpanded
  }

  const roundsWithMatches = rounds.map((roundNum) => {
    const roundMatches = allMatches.filter((m) => m.round_number === roundNum)
    const filteredMatches = roundMatches.filter(
      (m) => matchInvolvesQuery(m, searchTerm) && matchInvolvesFilter(m, filterMode, favorites, team)
    )
    return { roundNum, roundMatches, filteredMatches }
  })
  const totalFiltered = roundsWithMatches.reduce((sum, r) => sum + r.filteredMatches.length, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="Search by player name…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <div className="flex gap-1">
          {MATCH_FILTER_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterMode(key)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                filterMode === key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {searchActive && totalFiltered === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No matches found.</p>
      ) : (
        <div className="space-y-6">
          {roundsWithMatches.map(({ roundNum, roundMatches, filteredMatches }) => {
            if (searchActive && filteredMatches.length === 0) return null
            const phaseName = roundMatches[0]?.phase_name
            const expanded = isRoundExpanded(roundNum)
            const displayMatches = searchActive ? filteredMatches : roundMatches
            return (
              <div key={roundNum} className="border border-gray-200 rounded-lg overflow-hidden">
                <div
                  onClick={() => toggleRound(roundNum)}
                  className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center gap-2 cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <span className="text-gray-400 text-xs w-3">{expanded ? '▾' : '▸'}</span>
                  <span className="text-sm font-semibold text-gray-800">Round {roundNum}</span>
                  {phaseName && <span className="text-xs text-gray-400">{phaseName}</span>}
                  <span className="ml-auto text-xs text-gray-400">
                    {searchActive && filteredMatches.length !== roundMatches.length
                      ? `${filteredMatches.length} / ${roundMatches.length} matches`
                      : `${roundMatches.length} matches`}
                  </span>
                </div>
                {expanded && (
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
                      {displayMatches.map((match) => {
                        const [p1, p2] = match.player_match_relationships.sort((a, b) => a.player_order - b.player_order)
                        const p1Won = match.winning_player === p1?.player.id
                        const p2Won = match.winning_player === p2?.player.id
                        const isDraw = match.match_is_intentional_draw || match.match_is_unintentional_draw
                        const isBye = match.match_is_bye
                        const inProgress = !isBye && !isDraw && (match.status !== 'COMPLETE' || match.winning_player == null)
                        const w = match.games_won_by_winner
                        const l = match.games_won_by_loser
                        const clickable = !isBye && p1 && p2 && Boolean(onSelectPairing)
                        return (
                          <tr
                            key={match.id}
                            onClick={
                              clickable
                                ? () =>
                                    onSelectPairing({
                                      p1: { id: p1.player.id, name: p1.user_event_status.best_identifier },
                                      p2: { id: p2.player.id, name: p2.user_event_status.best_identifier },
                                    })
                                : undefined
                            }
                            className={`border-t border-gray-100${clickable ? ' hover:bg-blue-50 cursor-pointer' : ''}`}
                          >
                            <td className="px-4 py-2.5 text-gray-400 text-xs">{match.table_number ?? '—'}</td>
                            <td className="px-4 py-2.5">
                              <span className={`font-medium ${p1Won ? 'text-green-700' : isDraw ? 'text-gray-700' : 'text-gray-400'}`}>
                                {p1?.user_event_status.best_identifier ?? '—'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-center font-mono text-xs text-gray-500">
                              {isBye ? 'BYE' : isDraw ? 'DRAW' : inProgress ? 'In Progress' : `${w}-${l}`}
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
                )}
              </div>
            )
          })}
        </div>
      )}
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
  const [favorites, setFavorites] = useState(getFavorites)
  const [team, setTeam] = useState(getTeam)
  const [roster, setRoster] = useState(null)
  const [rosterMode, setRosterMode] = useState(false)
  const [recents, setRecents] = useState(getRecents)
  const [currentEventId, setCurrentEventId] = useState(null)
  const [selectedPairing, setSelectedPairing] = useState(null) // { p1: {id, name}, p2: {id, name} } | null

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

  // Restore the most recently viewed tournament on refresh so it doesn't need repasting.
  useEffect(() => {
    if (recents.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEventUrl(recents[0].url)
      loadStandings(recents[0].url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function extractEventId(url) {
    const match = url.match(/\/events\/(\d+)/)
    return match ? match[1] : null
  }

  function toggleFavorite(playerId, name) {
    setFavorites(toggleFavoriteStorage(playerId, name))
  }

  function toggleTeam(playerId, name) {
    setTeam(toggleTeamStorage(playerId, name))
  }

  function selectRecent(recent) {
    setEventUrl(recent.url)
    loadStandings(recent.url)
  }

  function removeRecentTournament(eventId) {
    setRecents(removeRecent(eventId))
  }

  async function loadStandings(url) {
    if (!url) {
      setError('Please enter event URL')
      return
    }

    const eventId = extractEventId(url)
    if (!eventId) {
      setError('Invalid event URL. Format: https://tcg.ravensburgerplay.com/events/12345')
      return
    }

    setLoading(true)
    setError(null)
    setPlayer(null)
    setAllStandings(null)
    setRoster(null)
    setRosterMode(false)
    setSearchTerm('')
    setRegistrationMap(null)
    setAllMatches(null)
    setCurrentEventId(null)

    try {
      const eventDetails = await fetchEventDetails(eventId)
      const tournamentStructure = getTournamentStructure(eventDetails)

      setStructure(tournamentStructure)
      setCurrentEventId(eventId)
      setRecents(saveRecent({
        eventId,
        url,
        eventName: tournamentStructure?.eventName ?? null,
        lastViewedAt: Date.now(),
      }))

      if (!tournamentStructure?.currentRoundId) {
        // No round has generated standings yet (tournament hasn't started, or
        // pairings for round 1 aren't posted) — fall back to the registered
        // roster so users can start favoriting/team-tagging players early.
        const regs = await fetchAllRegistrations(eventId)
        setRoster(registrationsToRosterEntries(regs))
        setRosterMode(true)
        setActiveTab('roster')
        return
      }

      setRosterMode(false)
      setActiveTab('standings')

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

  const filteredRoster = roster?.filter((entry) => {
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    return (
      entry.player.best_identifier.toLowerCase().includes(q) ||
      entry.user_event_status.best_identifier.toLowerCase().includes(q)
    )
  })

  const rosterOrStandings = allStandings ?? roster ?? []

  const favoritedEntries = rosterOrStandings
    .filter((entry) => favorites[String(entry.player.id)])
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))

  const teamEntries = rosterOrStandings
    .filter((entry) => team[String(entry.player.id)])
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))

  const teamSummary = teamEntries.length > 0 ? teamEntries.reduce((acc, entry) => {
    const { w, d, l } = parseRecord(entry.record)
    acc.wins += w
    acc.draws += d
    acc.losses += l
    if (entry.rank != null) {
      acc.bestRank = Math.min(acc.bestRank, entry.rank)
      acc.worstRank = Math.max(acc.worstRank, entry.rank)
      if (structure?.topCutSize && entry.rank <= structure.topCutSize) acc.inCut += 1
    }
    return acc
  }, { wins: 0, draws: 0, losses: 0, bestRank: Infinity, worstRank: -Infinity, inCut: 0 }) : null

  const tiebreakers = player ? formatTiebreakers(player, structure?.tiebreakers) : null
  const idAnalysis = player && structure ? analyzeId(player, allStandings, structure) : null
  const advancementAnalysis = player && structure ? analyzeAdvancement(player, structure) : null

  return (
    <div className="w-full px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">
          Tournament Lookup
        </h1>
        <p className="text-sm text-gray-500">
          Load standings and select yourself to see your rank, tiebreakers, and ID eligibility.
        </p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); loadStandings(eventUrl) }} className="mb-6 flex gap-3">
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

      {recents.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Recent</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {recents.map((t) => (
              <div
                key={t.eventId}
                className={`flex items-start justify-between gap-2 pl-3 pr-2 py-2 rounded-lg border text-sm transition-colors ${
                  t.eventId === currentEventId
                    ? 'border-blue-300 bg-blue-50 text-blue-800'
                    : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectRecent(t)}
                  className="font-medium text-left leading-snug"
                >
                  {t.eventName || `Event ${t.eventId}`}
                </button>
                <button
                  type="button"
                  onClick={() => removeRecentTournament(t.eventId)}
                  title="Remove from recents"
                  className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-100 leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-4 mb-6">
          {error}
        </div>
      )}

      {/* Tournament info strip */}
      {structure && (
        <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-6 p-3 bg-gray-50 rounded-lg border border-gray-200">
          {!structure.currentRoundId && (
            <span className="text-amber-700 font-medium">Not started yet</span>
          )}
          {structure.currentRoundId && (structure.isElimination ? (
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
          ))}
          {structure.currentRoundId && !structure.isElimination && structure.swissRoundsRemaining > 0 && (
            <span>
              <strong className="text-gray-900">{structure.swissRoundsRemaining}</strong> round{structure.swissRoundsRemaining !== 1 ? 's' : ''} remaining
            </span>
          )}
          {structure.topCutSize && (
            <span>
              Top <strong className="text-gray-900">{structure.topCutSize}</strong> cut
            </span>
          )}
          {(allStandings || roster) && (
            <span>
              <strong className="text-gray-900">{(allStandings ?? roster).length}</strong>
              {structure.startingPlayerCount && structure.startingPlayerCount !== (allStandings ?? roster).length && (
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
      {(allStandings || roster) && !player && (
        <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
          {rosterMode ? (
            <button
              onClick={() => setActiveTab('roster')}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeTab === 'roster'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Roster
            </button>
          ) : (
            <>
              <button
                onClick={() => setActiveTab('standings')}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  activeTab === 'standings'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Standings
              </button>
              <button
                onClick={() => setActiveTab('matches')}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap ${
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
            </>
          )}
          <button
            onClick={() => setActiveTab('favorites')}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'favorites'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            ★ Favorites
            {favoritedEntries.length > 0 && (
              <span className="text-xs text-gray-400 font-normal">({favoritedEntries.length})</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'team'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            My Team
            {teamEntries.length > 0 && (
              <span className="text-xs text-gray-400 font-normal">({teamEntries.length})</span>
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
            <div className="max-h-[32rem] overflow-y-auto overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 sticky top-0">
                  <tr>
                    <th className="text-center px-2 py-2 w-16"></th>
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
                    const isFavorite = Boolean(favorites[String(entry.player.id)])
                    const onTeam = Boolean(team[String(entry.player.id)])
                    return (
                      <Fragment key={entry.id}>
                        {atCutLine && (
                          <tr className="bg-blue-50">
                            <td colSpan={5} className="px-4 py-1 text-xs text-blue-600 font-semibold">
                              — Top {structure.topCutSize} cut line —
                            </td>
                          </tr>
                        )}
                        <tr
                          onClick={() => setPlayer(entry)}
                          className={`border-t border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors${dropped ? ' opacity-50' : ''}${isFavorite || onTeam ? ' bg-yellow-50' : ''}`}
                        >
                          <td className="px-2 py-2.5">
                            <div className="flex items-center justify-center gap-1">
                              <FavoriteStar
                                active={isFavorite}
                                onToggle={() => toggleFavorite(entry.player.id, entry.user_event_status.best_identifier)}
                              />
                              <TeamBadge
                                active={onTeam}
                                onToggle={() => toggleTeam(entry.player.id, entry.user_event_status.best_identifier)}
                              />
                            </div>
                          </td>
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
        <MatchesTab
          allMatches={allMatches}
          matchesLoading={matchesLoading}
          onSelectPairing={setSelectedPairing}
          favorites={favorites}
          team={team}
        />
      )}

      {/* Roster tab (pre-tournament — no standings yet) */}
      {rosterMode && roster && !player && activeTab === 'roster' && (
        <div className="space-y-3">
          <div className="text-sm text-blue-800 border border-blue-200 bg-blue-50 rounded-lg p-4">
            No active round yet — standings aren't published for this event. Here's the registered
            roster so you can favorite or team-tag players ahead of round 1.
          </div>
          <input
            type="text"
            placeholder="Search by name…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="max-h-[32rem] overflow-y-auto">
              <RosterTable
                entries={filteredRoster ?? []}
                favorites={favorites}
                team={team}
                toggleFavorite={toggleFavorite}
                toggleTeam={toggleTeam}
                registrationMap={registrationMap}
                onSelectPlayer={() => {}}
                disableSelect
                emptyMessage="No registered players found."
              />
            </div>
          </div>
        </div>
      )}

      {/* Favorites tab */}
      {(allStandings || roster) && !player && activeTab === 'favorites' && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <RosterTable
            entries={favoritedEntries}
            favorites={favorites}
            team={team}
            toggleFavorite={toggleFavorite}
            toggleTeam={toggleTeam}
            registrationMap={registrationMap}
            onSelectPlayer={rosterMode ? () => {} : setPlayer}
            disableSelect={rosterMode}
            emptyMessage="No favorited players yet. Tap the star next to a player in the Standings/Roster tab to track them here."
          />
        </div>
      )}

      {/* Team tab */}
      {(allStandings || roster) && !player && activeTab === 'team' && (
        <div className="space-y-3">
          {teamSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                <div className="font-bold text-gray-900">{teamSummary.wins}-{teamSummary.draws}-{teamSummary.losses}</div>
                <div className="text-xs text-gray-500">Combined W-D-L</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                <div className="font-bold text-gray-900">
                  {teamSummary.bestRank === Infinity ? '—' : `#${teamSummary.bestRank}–#${teamSummary.worstRank}`}
                </div>
                <div className="text-xs text-gray-500">Rank spread</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                <div className="font-bold text-gray-900">{teamEntries.length}</div>
                <div className="text-xs text-gray-500">Team members</div>
              </div>
              {structure?.topCutSize && (
                <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                  <div className="font-bold text-gray-900">{teamSummary.inCut} / {teamEntries.length}</div>
                  <div className="text-xs text-gray-500">In top {structure.topCutSize}</div>
                </div>
              )}
            </div>
          )}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <RosterTable
              entries={teamEntries}
              favorites={favorites}
              team={team}
              toggleFavorite={toggleFavorite}
              toggleTeam={toggleTeam}
              registrationMap={registrationMap}
              onSelectPlayer={rosterMode ? () => {} : setPlayer}
              disableSelect={rosterMode}
              emptyMessage="No team members yet. Tap the T badge next to a player in the Standings/Roster tab to add them to your team."
            />
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
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  {player.user_event_status.best_identifier}
                  <FavoriteStar
                    active={Boolean(favorites[String(player.player.id)])}
                    onToggle={() => toggleFavorite(player.player.id, player.user_event_status.best_identifier)}
                  />
                  <TeamBadge
                    active={Boolean(team[String(player.player.id)])}
                    onToggle={() => toggleTeam(player.player.id, player.user_event_status.best_identifier)}
                  />
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

      {selectedPairing && (
        <PairingHistoryPanel
          pairing={selectedPairing}
          onClose={() => setSelectedPairing(null)}
          allMatches={allMatches}
          structure={structure}
        />
      )}
    </div>
  )
}
