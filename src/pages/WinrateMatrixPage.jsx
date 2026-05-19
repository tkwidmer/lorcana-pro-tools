import { useState, useEffect } from 'react'
import { fetchStats } from '../lib/duelsApi'

const QUEUES = [
  { id: 'infinity-bo1', name: 'Infinity BO1', color: 'text-yellow-400' },
  { id: 'infinity-bo3', name: 'Infinity BO3', color: 'text-orange-400' },
  { id: 'core-bo1', name: 'Core BO1', color: 'text-blue-400' },
  { id: 'core-bo3', name: 'Core BO3', color: 'text-green-400' },
]

const INK_COLOR_ICON = {
  amber: '🟨',
  amethyst: '🟪',
  emerald: '🟩',
  ruby: '🟥',
  sapphire: '🟦',
  steel: '⬜',
}

function getWinrateColor(winRate) {
  if (winRate >= 55) return 'bg-green-900'
  if (winRate >= 51) return 'bg-green-700'
  if (winRate >= 49) return 'bg-gray-700'
  if (winRate >= 45) return 'bg-red-700'
  return 'bg-red-900'
}

function ColorPairIcon({ colors }) {
  return (
    <span className="inline-flex gap-1">
      {colors.map(c => (
        <span key={c} className="text-lg">
          {INK_COLOR_ICON[c]}
        </span>
      ))}
    </span>
  )
}

export function WinrateMatrixPage() {
  const [selectedQueue, setSelectedQueue] = useState('infinity-bo1')
  const [selectedPeriod, setSelectedPeriod] = useState('all_time')
  const [availableWeeks, setAvailableWeeks] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchStats({ queue: selectedQueue, period: selectedPeriod })
        setStats(data)
        if (data.meta?.availableWeeks) {
          setAvailableWeeks(data.meta.availableWeeks)
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [selectedQueue, selectedPeriod])

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Winrate Matrix</h1>
        <p className="text-gray-500">Loading stats...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
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
      <div className="max-w-7xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Winrate Matrix</h1>
        <p className="text-gray-500">No data available</p>
      </div>
    )
  }

  const matchups = stats.matchups || []
  const colorPairs = stats.colorPairs || []

  // Build a sorted list of unique color pairs by play rate
  const sortedColorPairs = [...colorPairs]
    .filter(cp => cp.games >= 10)
    .sort((a, b) => b.games - a.games)
    .slice(0, 20) // Limit to top 20 for matrix size

  // Create a map for quick matchup lookup
  const matchupMap = new Map()
  matchups.forEach(m => {
    const key = `${JSON.stringify(m.colorsA)}-${JSON.stringify(m.colorsB)}`
    matchupMap.set(key, m)
  })

  const getMatchup = (colorsA, colorsB) => {
    const key = `${JSON.stringify(colorsA)}-${JSON.stringify(colorsB)}`
    return matchupMap.get(key)
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-12">
      <div className="max-w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Winrate Matrix</h1>
          <p className="text-gray-400">Head-to-head matchup winrates for {stats.meta?.queue?.name || selectedQueue}</p>
        </div>

        <div className="mb-8 flex flex-col sm:flex-row gap-6">
          <div>
            <label className="block text-sm font-semibold text-white mb-3">Queue</label>
            <div className="flex gap-2 flex-wrap">
              {QUEUES.map(q => (
                <button
                  key={q.id}
                  onClick={() => setSelectedQueue(q.id)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedQueue === q.id
                      ? 'bg-white text-gray-900'
                      : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                  }`}
                >
                  {q.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-3">Period</label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedPeriod('all_time')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedPeriod === 'all_time'
                    ? 'bg-white text-gray-900'
                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
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
                        ? 'bg-white text-gray-900'
                        : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                    }`}
                  >
                    {week.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mb-8">
          <p className="text-sm text-gray-400">
            Total games: <span className="font-semibold text-white">{stats.activity?.totalGames.toLocaleString() || 0}</span>
            {' '} • Unique players: <span className="font-semibold text-white">{stats.activity?.uniquePlayers.toLocaleString() || 0}</span>
          </p>
        </div>

        {/* Matrix */}
        <div className="overflow-x-auto bg-gray-900 rounded-lg p-4">
          <div className="inline-block min-w-full">
            {/* Header row */}
            <div className="flex gap-1 mb-1">
              <div className="w-24 flex-shrink-0" />
              {sortedColorPairs.map((pair, idx) => (
                <div key={idx} className="w-20 flex-shrink-0 flex justify-center py-2">
                  <ColorPairIcon colors={pair.colors} />
                </div>
              ))}
            </div>

            {/* Rows */}
            {sortedColorPairs.map((rowPair, rowIdx) => (
              <div key={rowIdx} className="flex gap-1 mb-1">
                <div className="w-24 flex-shrink-0 flex items-center justify-center">
                  <ColorPairIcon colors={rowPair.colors} />
                </div>
                {sortedColorPairs.map((colPair, colIdx) => {
                  const matchup = getMatchup(rowPair.colors, colPair.colors)
                  if (!matchup) {
                    return (
                      <div key={colIdx} className="w-20 flex-shrink-0 bg-gray-800 rounded" />
                    )
                  }
                  return (
                    <div
                      key={colIdx}
                      className={`w-20 flex-shrink-0 rounded p-2 text-white text-center cursor-help hover:opacity-80 transition-opacity ${getWinrateColor(matchup.winRate)}`}
                      title={`${matchup.games.toLocaleString()} games`}
                    >
                      <div className="text-sm font-bold">{matchup.winRate.toFixed(0)}%</div>
                      <div className="text-xs text-gray-200">{matchup.games.toLocaleString()}g</div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
