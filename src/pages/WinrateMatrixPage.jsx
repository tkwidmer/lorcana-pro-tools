import { useState, useEffect } from 'react'
import { fetchStats } from '../lib/duelsApi'

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

function getWinrateColor(winRate, isMirror = false) {
  if (isMirror) {
    if (winRate >= 60) return 'bg-blue-300 border border-blue-500'
    if (winRate >= 55) return 'bg-blue-200 border border-blue-400'
    if (winRate >= 51) return 'bg-blue-100 border border-blue-300'
    return 'bg-gray-50 border border-gray-200'
  }
  if (winRate >= 60) return 'bg-green-300 border border-green-500'
  if (winRate >= 55) return 'bg-green-200 border border-green-400'
  if (winRate >= 51) return 'bg-green-100 border border-green-300'
  if (winRate >= 49) return 'bg-gray-50 border border-gray-200'
  if (winRate >= 45) return 'bg-red-100 border border-red-300'
  if (winRate >= 40) return 'bg-red-200 border border-red-400'
  return 'bg-red-300 border border-red-500'
}

function InkIcon({ color, size = 32 }) {
  return (
    <img
      src={`/ink/${color}.png`}
      alt={color}
      className="inline-block"
      style={{ width: `${size}px`, height: `${size}px` }}
    />
  )
}

function ColorPairIcons({ colors, size = 24 }) {
  return (
    <div className="inline-flex gap-1">
      {colors.map(c => (
        <InkIcon key={c} color={c} size={size} />
      ))}
    </div>
  )
}

export function WinrateMatrixPage() {
  const [selectedQueue, setSelectedQueue] = useState('infinity-bo1')
  const [selectedPeriod, setSelectedPeriod] = useState('all_time')
  const [selectedRanks, setSelectedRanks] = useState([])
  const [availableWeeks, setAvailableWeeks] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [selectedQueue, selectedPeriod, selectedRanks])

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

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
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
