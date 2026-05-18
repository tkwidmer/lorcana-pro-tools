import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getAllGames, deleteGame, clearAllGames, summarizeGame } from '../lib/gameHistory'
import { computeStats } from '../lib/gameStats'
import { resolveColors } from '../lib/inkColors'

function InkBadge({ colors }) {
  const resolved = resolveColors(colors)
  if (!resolved.length) return <span className="text-xs text-gray-400">—</span>
  return (
    <div className="flex gap-0.5">
      {resolved.map(c => (
        <img key={c} src={`/ink/${c}.png`} alt={c} className="w-4 h-4" title={c} />
      ))}
    </div>
  )
}

function formatRelativeTime(ts) {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

function StatsDashboard({ stats }) {
  if (stats.totalGames === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Stats Across {stats.totalGames} Game{stats.totalGames !== 1 ? 's' : ''}</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Stat label="Total Games" value={stats.totalGames} />
        <Stat label="Completed" value={stats.completedGames} />
        <Stat label="Avg Turns" value={stats.avgTurns ? stats.avgTurns.toFixed(1) : '—'} />
        <Stat label="Unique Cards Seen" value={stats.mostPlayedCards.length} />
      </div>

      {stats.inkColorStats.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-gray-700 mb-2">Ink Color Win Rates</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {stats.inkColorStats.map(s => (
              <div key={s.color} className="flex items-center gap-2 bg-gray-50 rounded p-2">
                <img src={`/ink/${s.color}.png`} alt={s.color} className="w-5 h-5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-800 capitalize">{s.color}</div>
                  <div className="text-xs text-gray-500">
                    {s.wins}/{s.games} ({Math.round(s.winRate * 100)}%)
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.mostPlayedCards.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-gray-700 mb-2">Most Played Cards</h3>
          <div className="max-h-64 overflow-y-auto border border-gray-200 rounded">
            {stats.mostPlayedCards.map((c, i) => (
              <div key={c.name} className="flex justify-between items-center px-3 py-1.5 text-xs border-b border-gray-100 last:border-0">
                <span className="text-gray-400 w-5">{i + 1}</span>
                <span className="text-gray-800 flex-1 truncate">{c.name}</span>
                <span className="text-gray-600 font-semibold">{c.plays}×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.matchupList.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-gray-700 mb-2">Matchups</h3>
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded">
            {stats.matchupList.map(m => (
              <div key={m.key} className="flex justify-between items-center px-3 py-1.5 text-xs border-b border-gray-100 last:border-0">
                <span className="text-gray-700">{m.key}</span>
                <span className="text-gray-500">{m.games} game{m.games !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.avgInkByTurn.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-2">Average Ink in Play by Turn</h3>
          <div className="flex items-end gap-1 h-24">
            {stats.avgInkByTurn.map(({ turn, avg }) => {
              const max = Math.max(...stats.avgInkByTurn.map(d => d.avg), 1)
              const h = (avg / max) * 100
              return (
                <div key={turn} className="flex-1 flex flex-col items-center gap-1">
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className="w-full bg-amber-300 rounded-t"
                      style={{ height: `${h}%` }}
                      title={`Turn ${turn}: ${avg.toFixed(1)} ink`}
                    />
                  </div>
                  <span className="text-xs text-gray-400">{turn}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

export function GameHistoryPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = () => {
    setLoading(true)
    getAllGames().then(rs => {
      setRecords(rs)
      setLoading(false)
    })
  }

  useEffect(() => { reload() }, []) // eslint-disable-line react-hooks/set-state-in-effect

  const handleDelete = (uuid, e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this game from history?')) return
    deleteGame(uuid).then(reload)
  }

  const handleClearAll = () => {
    if (!confirm(`Delete all ${records.length} saved games? This cannot be undone.`)) return
    clearAllGames().then(reload)
  }

  const summaries = records.map(summarizeGame)
  const stats = computeStats(records)

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Game History</h1>
          <p className="text-sm text-gray-500 mt-1">
            Past games scraped on this browser. Saved automatically as you spectate.
          </p>
        </div>
        {records.length > 0 && (
          <button
            onClick={handleClearAll}
            className="text-xs text-gray-500 hover:text-red-600 underline whitespace-nowrap"
          >
            Clear all
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-lg text-gray-500">
          <div className="text-sm mb-2">No games saved yet.</div>
          <Link to="/game-scraper" className="text-sm text-blue-600 hover:underline">
            Scrape a game →
          </Link>
        </div>
      ) : (
        <>
          <StatsDashboard stats={stats} />

          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Saved Games</h2>
          <div className="grid grid-cols-1 gap-2">
            {summaries.map(s => (
              <Link
                key={s.uuid}
                to={`/game-history/${s.uuid}`}
                className="group flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-900 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-sm font-semibold text-gray-900 truncate">{s.p1Name}</span>
                      <InkBadge colors={s.p1InkColors} />
                    </div>
                    <span className="text-xs text-gray-400">vs</span>
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
                      <InkBadge colors={s.p2InkColors} />
                      <span className="text-sm font-semibold text-gray-900 truncate">{s.p2Name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {s.winner != null && (
                      <span className="text-purple-700 font-medium">
                        {s.winner === 1 ? s.p1Name : s.p2Name} won
                      </span>
                    )}
                    {s.currentTurn != null && <span>{s.currentTurn} turns</span>}
                    <span>{s.logCount} actions</span>
                    <span className="ml-auto">{formatRelativeTime(s.lastUpdated)}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(s.uuid, e)}
                  className="text-xs text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete"
                >
                  ✕
                </button>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
