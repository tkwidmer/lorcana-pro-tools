import { useEffect, useState, useCallback, useMemo } from 'react'
import { fetchStats, fetchCurrentMmr } from '../lib/duelsApi'
import { InkIcons } from '../components/InkIcons'
import { RANK_TIERS, tierForMmr, ranksAtOrAbove, ranksBelow } from '../lib/rankTiers'
import { buildSynthesis, compareRankBands } from '../lib/metaSynthesis'

const FORMATS = [
  { id: 'core', label: 'Core' },
  { id: 'infinity', label: 'Infinity' },
]

const MODES = [
  { id: 'bo1', label: 'Best of 1' },
  { id: 'bo3', label: 'Best of 3' },
]

// Bands offered in the UI, low to high. "ALL" means no rank filter.
const BANDS = ['ALL', ...RANK_TIERS.filter(t => t.name !== 'Common').map(t => t.name)]

function bandLabel(band) {
  return band === 'ALL' ? 'All Players' : `${band}+`
}

function queueId(format, mode) {
  return `${format}-${mode}`
}

// Builds the `period` query value duels.ink expects: `all_time`, a single
// `week:<date>`, or a multi-week `weeks:<date>,<date>,...` when more than
// one week is selected (see the "Last 2/4 Weeks" presets below).
function periodFromWeeks(weekDates) {
  if (weekDates.length === 0) return 'all_time'
  if (weekDates.length === 1) return `week:${weekDates[0]}`
  return `weeks:${[...weekDates].sort().join(',')}`
}

export function MetaSynthesisPage() {
  const [format, setFormat] = useState('core')
  const [mode, setMode] = useState('bo1')
  const [bootstrapped, setBootstrapped] = useState(false) // becomes true once the latest week is known
  const [periodMode, setPeriodMode] = useState('weeks') // 'weeks' | 'all_time'
  const [selectedWeeks, setSelectedWeeks] = useState([]) // array of week startDates
  const [availableWeeks, setAvailableWeeks] = useState([])
  const [band, setBand] = useState('ALL')
  const [bandAutoSet, setBandAutoSet] = useState(true)
  const [detectedTier, setDetectedTier] = useState(null)

  const [stats, setStats] = useState(null)
  const [lowerStats, setLowerStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const queue = queueId(format, mode)
  const weekKey = [...selectedWeeks].sort().join(',')

  // Best-effort: center the default band on the signed-in user's own rank
  // in this queue. Only applies while the user hasn't picked a band by hand.
  useEffect(() => {
    let cancelled = false
    fetchCurrentMmr(queue).then(mmr => {
      if (cancelled || mmr == null) return
      const tier = tierForMmr(mmr)
      setDetectedTier(tier.name)
      if (bandAutoSet) setBand(tier.name)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue])

  const selectBand = useCallback(newBand => {
    setBandAutoSet(false)
    setBand(newBand)
  }, [])

  const selectAllTime = useCallback(() => {
    setPeriodMode('all_time')
  }, [])

  const toggleWeek = useCallback(startDate => {
    setPeriodMode('weeks')
    setSelectedWeeks(prev => {
      const next = prev.includes(startDate) ? prev.filter(d => d !== startDate) : [...prev, startDate]
      // Never let the selection empty out from under the user — fall back
      // to just that one week rather than silently becoming all-time.
      return next.length === 0 ? [startDate] : next
    })
  }, [])

  const selectLastNWeeks = useCallback((weeks, n) => {
    setPeriodMode('weeks')
    setSelectedWeeks(weeks.slice(-n).map(w => w.startDate))
  }, [])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const effectivePeriod = !bootstrapped ? 'all_time' : (periodMode === 'all_time' ? 'all_time' : periodFromWeeks(selectedWeeks))
        const ranks = band === 'ALL' ? [] : ranksAtOrAbove(band)
        const data = await fetchStats({ queue, period: effectivePeriod, ranks })
        if (cancelled) return

        // First load: pin the default period to duels.ink's own "current
        // week" rather than all-time, since the meta shifts fast. Triggers
        // a second, cheap fetch (both hit the same server cache) with the
        // real period — nothing above renders the all-time data.
        if (!bootstrapped) {
          setBootstrapped(true)
          if (data.meta?.currentWeek?.startDate) {
            setSelectedWeeks([data.meta.currentWeek.startDate])
          }
          setAvailableWeeks(data.meta?.availableWeeks ?? [])
          return
        }

        setStats(data)
        setAvailableWeeks(data.meta?.availableWeeks ?? [])

        const lowerRanks = band === 'ALL' ? [] : ranksBelow(band)
        if (lowerRanks.length > 0) {
          const lower = await fetchStats({ queue, period: effectivePeriod, ranks: lowerRanks })
          if (!cancelled) setLowerStats(lower)
        } else {
          setLowerStats(null)
        }
      } catch (err) {
        if (bootstrapped && periodMode === 'weeks') {
          // A restored/derived week selection can point at a week duels.ink
          // no longer serves — fall back rather than getting stuck.
          setPeriodMode('all_time')
        } else {
          setError(err.message || String(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, bootstrapped, periodMode, weekKey, band])

  const queueName = stats?.meta?.queue?.name ?? `${FORMATS.find(f => f.id === format)?.label} ${MODES.find(m => m.id === mode)?.label}`
  const currentWeekStart = stats?.meta?.currentWeek?.startDate ?? null

  const periodLabel = useMemo(() => {
    if (periodMode === 'all_time') return 'all-time'
    const weeks = selectedWeeks
      .map(d => availableWeeks.find(w => w.startDate === d))
      .filter(Boolean)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
    if (weeks.length === 0) return 'the selected week'
    if (weeks.length === 1) return weeks[0].label
    return `${weeks.length} weeks (${weeks[0].label.split(' - ')[0]} – ${weeks[weeks.length - 1].label.split(' - ')[1] ?? weeks[weeks.length - 1].label})`
  }, [periodMode, selectedWeeks, availableWeeks])

  const synthesis = stats ? buildSynthesis(stats, {
    queueLabel: queueName,
    periodLabel,
    bandLabel: band === 'ALL' ? 'all players' : `${band}+ players`,
  }) : null

  const comparison = (stats && lowerStats) ? compareRankBands(stats, lowerStats, {
    upperLabel: bandLabel(band),
    lowerLabel: 'lower ranks',
  }) : null

  return (
    <div className="w-full px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">Meta Synthesis</h1>
        <p className="text-sm text-gray-500">
          A plain-language read on what's actually happening in the meta right now — most-played archetypes, win rates, and how it shifts by rank.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-6">
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Format</label>
          <div className="flex gap-2">
            {FORMATS.map(f => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  format === f.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Match Format</label>
          <div className="flex gap-2">
            {MODES.map(m => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  mode === m.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Period
            <span className="ml-2 font-normal text-xs text-gray-400">(click multiple weeks to combine them)</span>
          </label>
          <div className="flex gap-2 flex-wrap max-w-2xl">
            <button
              onClick={selectAllTime}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                periodMode === 'all_time' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Time
            </button>
            {availableWeeks.length > 1 && (
              <button
                onClick={() => selectLastNWeeks(availableWeeks, 2)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Last 2 Weeks
              </button>
            )}
            {availableWeeks.length > 3 && (
              <button
                onClick={() => selectLastNWeeks(availableWeeks, 4)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Last Month
              </button>
            )}
            {availableWeeks.map(week => {
              const isSelected = periodMode === 'weeks' && selectedWeeks.includes(week.startDate)
              return (
                <button
                  key={week.startDate}
                  onClick={() => toggleWeek(week.startDate)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    isSelected ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {week.startDate === currentWeekStart ? `${week.label} (latest)` : week.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Rank Band
            {detectedTier && (
              <span className="ml-2 font-normal text-xs text-gray-400">(you're {detectedTier})</span>
            )}
          </label>
          <div className="flex gap-2 flex-wrap max-w-xl">
            {BANDS.map(b => (
              <button
                key={b}
                onClick={() => selectBand(b)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  band === b ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {bandLabel(b)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading meta data...</p>}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-900 font-medium text-sm">Error loading stats</p>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && synthesis && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="border border-gray-200 rounded-lg p-5 space-y-3">
            {synthesis.paragraphs.map((p, i) => (
              <p key={i} className="text-gray-800 leading-relaxed">{p}</p>
            ))}
            {comparison?.paragraph && (
              <p className="text-gray-800 leading-relaxed">{comparison.paragraph}</p>
            )}
          </div>

          <div className="space-y-6">
            {synthesis.topPlayed.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Most Played Archetypes
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="text-left px-4 py-2">Archetype</th>
                      <th className="text-right px-4 py-2">Play Rate</th>
                      <th className="text-right px-4 py-2">Win Rate</th>
                      <th className="text-right px-4 py-2 hidden sm:table-cell">Games</th>
                    </tr>
                  </thead>
                  <tbody>
                    {synthesis.topPlayed.map(a => (
                      <tr key={a.key} className="border-t border-gray-100">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <InkIcons colors={a.colors} size={16} />
                            <span>{a.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">{a.playRate.toFixed(1)}%</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">{a.winRate.toFixed(1)}%</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-500 hidden sm:table-cell">
                          {a.gamesPlayed.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {synthesis.topWinRate.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Highest Win Rate (min. sample size)
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="text-left px-4 py-2">Archetype</th>
                      <th className="text-right px-4 py-2">Win Rate</th>
                      <th className="text-right px-4 py-2">Play Rate</th>
                      <th className="text-right px-4 py-2 hidden sm:table-cell">Games</th>
                    </tr>
                  </thead>
                  <tbody>
                    {synthesis.topWinRate.map(a => (
                      <tr key={a.key} className="border-t border-gray-100">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <InkIcons colors={a.colors} size={16} />
                            <span>{a.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">{a.winRate.toFixed(1)}%</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">{a.playRate.toFixed(1)}%</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-500 hidden sm:table-cell">
                          {a.gamesPlayed.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
