import { useState, useEffect, useCallback } from 'react'
import { fetchStats } from '../lib/duelsApi'
import { InkIcons as ColorPairIcons } from '../components/InkIcons'
import { winrateCellColor as getWinrateColor } from '../lib/statColors'
import { saveSnapshotIfNew, getSnapshotsForConfig } from '../lib/metaSnapshots'
import { computeMetaDrift } from '../lib/metaDrift'
import {
  getCuratedArchetypes,
  archetypePlayRate,
  getArchetypeMatchupsFor,
  buildProfilesById,
} from '../lib/archetypeStats'

const QUEUES = [
  { id: 'infinity-bo1', name: 'Infinity BO1' },
  { id: 'infinity-bo3', name: 'Infinity BO3' },
  { id: 'core-bo1', name: 'Core BO1' },
  { id: 'core-bo3', name: 'Core BO3' },
]

const RANKS = [
  { id: 'Iconic', label: 'Iconic' },
  { id: 'Enchanted', label: 'Enchanted' },
  { id: 'Legendary', label: 'Legendary' },
  { id: 'Epic', label: 'Epic' },
  { id: 'Super Rare', label: 'Super Rare' },
  { id: 'Rare', label: 'Rare' },
  { id: 'Uncommon', label: 'Uncommon' },
  { id: 'Common', label: 'Common' },
]

const FILTERS_KEY = 'lorcana_winrate_matrix_filters'

function loadStoredFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return {
      queue: typeof parsed.queue === 'string' ? parsed.queue : 'infinity-bo1',
      period: typeof parsed.period === 'string' ? parsed.period : 'all_time',
      ranks: Array.isArray(parsed.ranks) ? parsed.ranks.filter(r => typeof r === 'string') : [],
    }
  } catch {
    return null
  }
}

export function WinrateMatrixPage() {
  const stored = loadStoredFilters()
  const [selectedQueue, setSelectedQueue] = useState(stored?.queue ?? 'infinity-bo1')
  const [selectedPeriod, setSelectedPeriod] = useState(stored?.period ?? 'all_time')
  const [selectedRanks, setSelectedRanks] = useState(stored?.ranks ?? [])
  const [availableWeeks, setAvailableWeeks] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [compareOpen, setCompareOpen] = useState(false)
  const [snapshots, setSnapshots] = useState([])
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [archetypesOpen, setArchetypesOpen] = useState(false)
  const [focusedArchetypeId, setFocusedArchetypeId] = useState(null)

  useEffect(() => {
    localStorage.setItem(FILTERS_KEY, JSON.stringify({
      queue: selectedQueue,
      period: selectedPeriod,
      ranks: selectedRanks,
    }))
  }, [selectedQueue, selectedPeriod, selectedRanks])

  const refreshSnapshots = useCallback(async () => {
    const saved = await getSnapshotsForConfig(selectedQueue, selectedPeriod, selectedRanks)
    setSnapshots(saved)
    return saved
  }, [selectedQueue, selectedPeriod, selectedRanks])

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchStats({
          queue: selectedQueue,
          period: selectedPeriod,
          ranks: selectedRanks
        })
        setStats(data)
        if (data.meta?.availableWeeks) {
          setAvailableWeeks(data.meta.availableWeeks)
        }
        await saveSnapshotIfNew(selectedQueue, selectedPeriod, selectedRanks, data)
        const saved = await refreshSnapshots()
        if (saved.length >= 2) {
          setFromDate(prev => prev && saved.some(s => s.dateStr === prev) ? prev : saved[0].dateStr)
          setToDate(prev => prev && saved.some(s => s.dateStr === prev) ? prev : saved[saved.length - 1].dateStr)
        }
      } catch (err) {
        // A restored "week:<date>" filter can point at a week duels.ink no longer
        // serves (weeks roll off over time) — fall back to All Time rather than
        // leaving a returning user stuck on a permanent error.
        if (selectedPeriod !== 'all_time') {
          setSelectedPeriod('all_time')
        } else {
          setError(err.message)
        }
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [selectedQueue, selectedPeriod, selectedRanks, refreshSnapshots])

  const fromSnapshot = snapshots.find(s => s.dateStr === fromDate) ?? null
  const toSnapshot = snapshots.find(s => s.dateStr === toDate) ?? null
  const driftRows = (compareOpen && fromSnapshot && toSnapshot && fromDate !== toDate)
    ? computeMetaDrift(fromSnapshot, toSnapshot)
    : []

  if (loading) {
    return (
      <div className="w-full px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Winrate Matrix</h1>
        <p className="text-gray-500">Loading stats...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Winrate Matrix</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-900 font-medium">Error loading stats:</p>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="w-full px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Winrate Matrix</h1>
        <p className="text-gray-500">No data available</p>
      </div>
    )
  }

  const matchups = stats.matchups || []
  const colorPairs = stats.colorPairs || []

  // Filter to only 2-color pairs (exclude single-color edge cases)
  const twoColorPairs = colorPairs.filter(cp => cp.colors.length === 2)

  // Create a map for quick matchup lookup (both directions)
  const matchupMap = new Map()
  matchups.forEach(m => {
    const keyForward = `${JSON.stringify(m.colorsA)}-${JSON.stringify(m.colorsB)}`
    const keyReverse = `${JSON.stringify(m.colorsB)}-${JSON.stringify(m.colorsA)}`
    matchupMap.set(keyForward, { ...m, isReverse: false })
    // For reverse, we flip the winrate (if A won 1208/2609, then B won 1401/2609)
    matchupMap.set(keyReverse, {
      ...m,
      colorsA: m.colorsB,
      colorsB: m.colorsA,
      winsA: m.games - m.winsA,
      winRate: 100 - m.winRate,
      isReverse: true,
    })
  })

  const getMatchup = (colorsA, colorsB) => {
    const key = `${JSON.stringify(colorsA)}-${JSON.stringify(colorsB)}`
    return matchupMap.get(key)
  }

  // Get all unique 2-color pairs that appear in matchups
  const colorPairSet = new Set()
  matchups.forEach(m => {
    if (Array.isArray(m.colorsA) && m.colorsA.length === 2) {
      colorPairSet.add(JSON.stringify(m.colorsA))
    }
    if (Array.isArray(m.colorsB) && m.colorsB.length === 2) {
      colorPairSet.add(JSON.stringify(m.colorsB))
    }
  })

  // Build final sorted list of 2-color pairs that have matchup data
  const matrixColorPairs = [...twoColorPairs]
    .filter(cp => colorPairSet.has(JSON.stringify(cp.colors)))
    .sort((a, b) => b.winRate - a.winRate)

  // duels.ink also breaks each color pair down into named archetypes
  // (e.g. amber/emerald -> "Princess Aggro" vs "Elinor Circle") with their
  // own win rates and head-to-head records against other archetypes.
  const curatedArchetypes = getCuratedArchetypes(stats.profiles)
  const profilesById = buildProfilesById(stats.profiles)
  const totalGames = stats.activity?.totalGames ?? 0
  const focusedArchetype = focusedArchetypeId ? profilesById.get(focusedArchetypeId) ?? null : null
  const focusedMatchups = focusedArchetypeId
    ? getArchetypeMatchupsFor(stats.archetypeMatchups, focusedArchetypeId, profilesById)
    : []

  return (
    <div className="w-full px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Winrate Matrix</h1>
        <p className="text-gray-500">Head-to-head matchup winrates for {stats.meta?.queue?.name || selectedQueue}</p>
      </div>

      <div className="mb-8">
        <div className="flex flex-col sm:flex-row gap-6 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">Queue</label>
            <div className="flex gap-2 flex-wrap">
              {QUEUES.map(q => (
                <button
                  key={q.id}
                  onClick={() => setSelectedQueue(q.id)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedQueue === q.id
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {q.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">Period</label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedPeriod('all_time')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedPeriod === 'all_time'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All Time
              </button>
              {availableWeeks.map(week => {
                const periodKey = `week:${week.startDate}`
                return (
                  <button
                    key={periodKey}
                    onClick={() => setSelectedPeriod(periodKey)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      selectedPeriod === periodKey
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {week.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-3">Rank</label>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedRanks([])}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedRanks.length === 0
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Ranks
            </button>
            {RANKS.map(rank => (
              <button
                key={rank.id}
                onClick={() => {
                  setSelectedRanks(prev =>
                    prev.includes(rank.id)
                      ? prev.filter(r => r !== rank.id)
                      : [...prev, rank.id]
                  )
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedRanks.includes(rank.id)
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {rank.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-8">
        <p className="text-sm text-gray-600">
          Total games: <span className="font-semibold text-gray-900">{stats.activity?.totalGames.toLocaleString() || 0}</span>
          {' '} • Unique players: <span className="font-semibold text-gray-900">{stats.activity?.uniquePlayers.toLocaleString() || 0}</span>
        </p>
      </div>

      {/* Meta drift — compares two locally-saved snapshots of this exact queue/period/rank
          config. A snapshot is saved automatically the first time this page loads on a new
          day for a given config, so this fills in as you keep visiting. */}
      <div className="mb-8">
        <button
          onClick={() => setCompareOpen(o => !o)}
          className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
        >
          <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Meta Drift</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${compareOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {compareOpen && (
          <div className="mt-6">
            {snapshots.length < 2 ? (
              <p className="text-sm text-gray-500">
                Only {snapshots.length} saved snapshot{snapshots.length === 1 ? '' : 's'} for this queue/period/rank combo so far — a new one is captured automatically each day you visit this page. Check back after a couple of days to see drift.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <label className="text-sm font-semibold text-gray-900">From</label>
                  <select
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    className="px-2 py-1.5 rounded-lg text-sm border border-gray-300 bg-white text-gray-900"
                  >
                    {snapshots.map(s => (
                      <option key={s.id} value={s.dateStr}>{s.dateStr}</option>
                    ))}
                  </select>
                  <span className="text-gray-400">→</span>
                  <label className="text-sm font-semibold text-gray-900">To</label>
                  <select
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    className="px-2 py-1.5 rounded-lg text-sm border border-gray-300 bg-white text-gray-900"
                  >
                    {snapshots.map(s => (
                      <option key={s.id} value={s.dateStr}>{s.dateStr}</option>
                    ))}
                  </select>
                </div>
                {fromDate === toDate ? (
                  <p className="text-sm text-gray-500">Pick two different dates to see the delta.</p>
                ) : driftRows.length === 0 ? (
                  <p className="text-sm text-gray-500">No overlapping matchup data between these two snapshots.</p>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-200 bg-gray-50">
                          <th className="py-2 px-3">Matchup</th>
                          <th className="py-2 px-3 text-right">{fromDate}</th>
                          <th className="py-2 px-3 text-right">{toDate}</th>
                          <th className="py-2 px-3 text-right">Δ Winrate</th>
                          <th className="py-2 px-3 text-right">Δ Games</th>
                        </tr>
                      </thead>
                      <tbody>
                        {driftRows.map((row, idx) => (
                          <tr key={idx} className="border-b border-gray-100">
                            <td className="py-1.5 px-3">
                              <span className="inline-flex items-center gap-1">
                                <ColorPairIcons colors={row.colorsA} size={16} />
                                <span className="text-gray-400 text-xs">vs</span>
                                <ColorPairIcons colors={row.colorsB} size={16} />
                              </span>
                            </td>
                            <td className="py-1.5 px-3 text-right text-gray-600">
                              {row.prevWinRate != null ? `${row.prevWinRate.toFixed(0)}%` : '—'}
                            </td>
                            <td className="py-1.5 px-3 text-right text-gray-600">
                              {row.currWinRate != null ? `${row.currWinRate.toFixed(0)}%` : '—'}
                            </td>
                            <td className={`py-1.5 px-3 text-right font-semibold ${
                              row.winRateDelta == null ? 'text-gray-400'
                                : row.winRateDelta > 0 ? 'text-emerald-600'
                                : row.winRateDelta < 0 ? 'text-red-500' : 'text-gray-500'
                            }`}>
                              {row.isNew ? 'new' : row.isGone ? 'gone' : `${row.winRateDelta > 0 ? '+' : ''}${row.winRateDelta.toFixed(1)}%`}
                            </td>
                            <td className="py-1.5 px-3 text-right text-gray-400">
                              {row.gamesDelta != null ? `${row.gamesDelta > 0 ? '+' : ''}${row.gamesDelta.toLocaleString()}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Archetypes — duels.ink's named-archetype breakdown layered on top of
          the raw color-pair matchups below. */}
      {curatedArchetypes.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setArchetypesOpen(o => !o)}
            className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
          >
            <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Archetypes</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${archetypesOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {archetypesOpen && (
            <div className="mt-6">
              <div className="overflow-x-auto border border-gray-200 rounded-lg mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-200 bg-gray-50">
                      <th className="py-2 px-3">Archetype</th>
                      <th className="py-2 px-3">Colors</th>
                      <th className="py-2 px-3 text-right">Win Rate</th>
                      <th className="py-2 px-3 text-right">Play Rate</th>
                      <th className="py-2 px-3 text-right">Games</th>
                    </tr>
                  </thead>
                  <tbody>
                    {curatedArchetypes.map(p => (
                      <tr
                        key={p.id}
                        onClick={() => setFocusedArchetypeId(prev => (prev === p.id ? null : p.id))}
                        className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${focusedArchetypeId === p.id ? 'bg-gray-100' : ''}`}
                      >
                        <td className="py-1.5 px-3 font-medium text-gray-900">{p.archetypeName}</td>
                        <td className="py-1.5 px-3">
                          <ColorPairIcons colors={p.colors} size={16} />
                        </td>
                        <td className={`py-1.5 px-3 text-right font-semibold ${p.winRate >= 51 ? 'text-emerald-600' : p.winRate <= 49 ? 'text-red-500' : 'text-gray-600'}`}>
                          {p.winRate.toFixed(1)}%
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-600">
                          {archetypePlayRate(p, totalGames).toFixed(1)}%
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-400">
                          {p.gamesPlayed.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {focusedArchetype ? (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    {focusedArchetype.archetypeName} — matchups
                  </h3>
                  {focusedMatchups.length === 0 ? (
                    <p className="text-sm text-gray-500">No head-to-head data available for this archetype.</p>
                  ) : (
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-200 bg-gray-50">
                            <th className="py-2 px-3">Opponent</th>
                            <th className="py-2 px-3 text-right">Win Rate</th>
                            <th className="py-2 px-3 text-right">Games</th>
                          </tr>
                        </thead>
                        <tbody>
                          {focusedMatchups.map(row => (
                            <tr key={row.opponentId} className="border-b border-gray-100">
                              <td className="py-1.5 px-3">
                                <span className="inline-flex items-center gap-2">
                                  {row.opponent && <ColorPairIcons colors={row.opponent.colors} size={16} />}
                                  <span className="text-gray-900">
                                    {row.opponent?.archetypeName || row.opponent?.name || 'Unknown'}
                                    {row.isMirror ? ' (mirror)' : ''}
                                  </span>
                                </span>
                              </td>
                              <td className={`py-1.5 px-3 text-right font-semibold ${row.winRate >= 51 ? 'text-emerald-600' : row.winRate <= 49 ? 'text-red-500' : 'text-gray-600'}`}>
                                {row.winRate.toFixed(1)}%
                              </td>
                              <td className="py-1.5 px-3 text-right text-gray-400">
                                {row.games.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Click an archetype above to see its head-to-head matchups.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Matrix */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <div className="inline-flex flex-col gap-1 p-4 bg-white">
          {/* Header row */}
          <div className="inline-flex gap-1">
            <div className="w-16 h-16 flex-shrink-0" />
            {matrixColorPairs.map((pair, idx) => (
              <div key={idx} className="w-16 h-16 flex-shrink-0 flex justify-center items-center">
                <ColorPairIcons colors={pair.colors} size={20} />
              </div>
            ))}
          </div>

          {/* Rows */}
          {matrixColorPairs.map((rowPair, rowIdx) => (
            <div key={rowIdx} className="inline-flex gap-1">
              <div className="w-16 h-16 flex-shrink-0 flex items-center justify-center border border-gray-100">
                <ColorPairIcons colors={rowPair.colors} size={20} />
              </div>
              {matrixColorPairs.map((colPair, colIdx) => {
                const matchup = getMatchup(rowPair.colors, colPair.colors)
                if (!matchup) {
                  return (
                    <div key={colIdx} className="w-16 h-16 flex-shrink-0 bg-gray-50 border border-gray-100" />
                  )
                }
                const isMirror = JSON.stringify(rowPair.colors) === JSON.stringify(colPair.colors)
                const displayWinRate = isMirror ? matchup.firstPlayerWinRate : matchup.winRate
                return (
                  <div
                    key={colIdx}
                    className="w-16 h-16 flex-shrink-0 relative group"
                  >
                    <div
                      className={`w-16 h-16 rounded p-1 text-center flex flex-col items-center justify-center text-xs font-semibold text-gray-900 ${getWinrateColor(displayWinRate, isMirror)}`}
                    >
                      <div>{displayWinRate.toFixed(0)}%</div>
                      <div className="text-xs text-gray-600">{(matchup.games / 1000).toFixed(1)}k</div>
                    </div>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      {matchup.games.toLocaleString()} games{isMirror ? ' (1st player)' : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
