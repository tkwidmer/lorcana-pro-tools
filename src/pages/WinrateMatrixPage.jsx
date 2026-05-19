import { useState, useEffect } from 'react'
import { fetchStats } from '../lib/duelsApi'

const QUEUES = [
  { id: 'infinity-bo1', name: 'Infinity BO1', color: 'text-yellow-400' },
  { id: 'infinity-bo3', name: 'Infinity BO3', color: 'text-orange-400' },
  { id: 'core-bo1', name: 'Core BO1', color: 'text-blue-400' },
  { id: 'core-bo3', name: 'Core BO3', color: 'text-green-400' },
]

const INK_COLORS = ['amber', 'amethyst', 'emerald', 'ruby', 'sapphire', 'steel']
const INK_COLOR_NAMES = {
  amber: 'Amber',
  amethyst: 'Amethyst',
  emerald: 'Emerald',
  ruby: 'Ruby',
  sapphire: 'Sapphire',
  steel: 'Steel',
}

function getWinrateColor(winRate) {
  if (winRate >= 55) return 'bg-green-100 text-green-900'
  if (winRate >= 51) return 'bg-green-50 text-green-800'
  if (winRate >= 49) return 'bg-gray-100 text-gray-700'
  if (winRate >= 45) return 'bg-red-50 text-red-800'
  return 'bg-red-100 text-red-900'
}

function ColorPairLabel({ colors }) {
  return (
    <span className="text-xs font-semibold">
      {colors.map(c => INK_COLOR_NAMES[c]).join('/')}
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

  const getColorPairLabel = (colors) => colors.map(c => INK_COLOR_NAMES[c]).join('/')

  const sortedColorPairs = [...colorPairs]
    .filter(cp => cp.games >= 10)
    .sort((a, b) => b.games - a.games)

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Winrate Matrix</h1>
        <p className="text-gray-500">Head-to-head matchup winrates for {stats.meta?.queue?.name || selectedQueue}</p>
      </div>

      <div className="mb-8 flex flex-col sm:flex-row gap-6">
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

      <div className="mb-8">
        <p className="text-sm text-gray-600 mb-4">
          Total games: <span className="font-semibold">{stats.activity?.totalGames.toLocaleString() || 0}</span>
          {' '} • Unique players: <span className="font-semibold">{stats.activity?.uniquePlayers.toLocaleString() || 0}</span>
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Matchup</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">Winrate</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">Games</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">Play Rate</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">1st Player WR</th>
              </tr>
            </thead>
            <tbody>
              {matchups.slice(0, 50).map((matchup, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <span className="text-gray-900">{getColorPairLabel(matchup.colorsA)}</span>
                      <span className="text-gray-400">vs</span>
                      <span className="text-gray-900">{getColorPairLabel(matchup.colorsB)}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-center font-semibold rounded ${getWinrateColor(matchup.winRate)}`}>
                    {matchup.winRate.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{matchup.games.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {(matchup.games / (stats.activity?.totalGames || 1) * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{matchup.firstPlayerWinRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Deck Popularity</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedColorPairs.slice(0, 12).map((pair, idx) => (
            <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <span className="font-semibold text-gray-900">{getColorPairLabel(pair.colors)}</span>
                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">{pair.playRate.toFixed(1)}%</span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Winrate:</span>
                  <span className={`font-semibold ${pair.winRate >= 50 ? 'text-green-700' : 'text-red-700'}`}>
                    {pair.winRate.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Games:</span>
                  <span className="text-gray-900 font-medium">{pair.games.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">1st Player WR:</span>
                  <span className="text-gray-900">{pair.firstPlayerWinRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
