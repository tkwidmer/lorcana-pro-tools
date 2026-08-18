import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { computeStats } from '../lib/gameStats'
import { listPlayers } from '../lib/playerProfiles'
import { parseSnapshot } from '../lib/gameSnapshot'
import { getAllGames, deleteGame, clearAllGames, summarizeGame, saveGame as saveHistoryGame } from '../lib/scoutedGames'
import { getAllGamelogs } from '../lib/gamelogHistory'
import { resolveColors } from '../lib/inkColors'
import { downloadGameIds } from '../lib/exportGameIds'
import { GameView } from '../components/GameView'
import { InkIcons } from '../components/InkIcons'
import { StatCard } from '../components/StatCard'

// --- Ignored players (stored in localStorage) ---

const IGNORED_KEY = 'lorcana_ignored_players'

function getIgnored() {
  try { return JSON.parse(localStorage.getItem(IGNORED_KEY) ?? '[]') } catch { return [] }
}
function setIgnored(list) {
  localStorage.setItem(IGNORED_KEY, JSON.stringify(list))
}
function ignorePlayer(name) { setIgnored([...new Set([...getIgnored(), name])]) }
function unignorePlayer(name) { setIgnored(getIgnored().filter(n => n !== name)) }

// --- Shared helpers ---

function InkBadge({ colors }) {
  return (
    <InkIcons
      colors={colors}
      size="w-4 h-4"
      className="gap-0.5"
      emptyFallback={<span className="text-xs text-gray-400">—</span>}
    />
  )
}

function formatRelativeTime(ts) {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

// --- Import panel ---

function ImportPanel() {
  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const fileRef = useRef(null)

  const loadText = (text) => {
    setError(null)
    setSaved(false)
    try { setSnapshot(parseSnapshot(text)) }
    catch (e) { setSnapshot(null); setError(e.message) }
  }

  const handleFile = (file) => {
    if (!file) return
    file.text().then(loadText).catch(e => setError(e.message))
  }

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text')
    if (text) { e.preventDefault(); loadText(text) }
  }

  const handleSave = () => {
    if (!snapshot) return
    const uuid = snapshot.uuid ?? `imported-${Date.now()}`
    saveHistoryGame(uuid, snapshot.game).then(() => setSaved(true))
  }

  return (
    <details className="mb-6 border border-gray-200 rounded-lg">
      <summary className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer select-none hover:bg-gray-50 rounded-lg">
        Import a shared game snapshot
      </summary>
      <div className="px-4 pb-4 pt-2 border-t border-gray-100">
        {!snapshot ? (
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-500 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
          >
            <div className="text-sm text-gray-600 mb-3">
              Drop a <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">.json</code> snapshot here or paste JSON below.
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className="text-sm bg-gray-900 text-white px-4 py-2 rounded hover:bg-gray-700"
            >
              Choose file
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json"
              onChange={(e) => handleFile(e.target.files[0])} className="hidden" />
            <textarea
              placeholder="Or paste JSON here…"
              onPaste={handlePaste}
              onChange={(e) => e.target.value && loadText(e.target.value)}
              className="mt-4 w-full h-24 text-xs font-mono border border-gray-200 rounded p-2 focus:outline-none focus:border-gray-500"
            />
            {error && (
              <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4 text-sm">
              <span className="text-gray-500">Imported snapshot</span>
              {snapshot.exportedAt && (
                <span className="text-gray-400 text-xs">exported {new Date(snapshot.exportedAt).toLocaleString()}</span>
              )}
              <button onClick={() => { setSnapshot(null); setSaved(false) }}
                className="text-xs text-gray-500 hover:text-gray-900 underline ml-auto">
                Load different file
              </button>
              <button onClick={handleSave} disabled={saved}
                className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700 disabled:bg-gray-400">
                {saved ? 'Saved' : 'Save to history'}
              </button>
              {saved && snapshot.uuid && (
                <Link to={`/scouting/game/${snapshot.uuid}`} className="text-xs text-blue-600 hover:underline">
                  View →
                </Link>
              )}
            </div>
            <GameView game={snapshot.game}
              lastUpdated={snapshot.exportedAt ? new Date(snapshot.exportedAt) : null}
              uuid={snapshot.uuid} />
          </>
        )}
      </div>
    </details>
  )
}

// --- History tab ---

function StatsDashboard({ stats }) {
  if (stats.totalGames === 0) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
      <h2 className="text-base font-bold text-gray-900 mb-4">
        Stats across {stats.totalGames} game{stats.totalGames !== 1 ? 's' : ''}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard size="lg" label="Total" value={stats.totalGames} />
        <StatCard size="lg" label="Completed" value={stats.completedGames} />
        <StatCard size="lg" label="Avg Turns" value={stats.avgTurns ? stats.avgTurns.toFixed(1) : '—'} />
        <StatCard size="lg" label="Unique Cards" value={stats.mostPlayedCards.length} />
      </div>

      {stats.inkColorStats.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Win rates by ink</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {stats.inkColorStats.map(s => (
              <div key={s.color} className="flex items-center gap-2 bg-gray-50 rounded p-2">
                <img src={`/ink/${s.color}.png`} alt={s.color} className="w-5 h-5" />
                <div>
                  <div className="text-xs font-semibold text-gray-800 capitalize">{s.color}</div>
                  <div className="text-xs text-gray-500">{s.wins}/{s.games} ({Math.round(s.winRate * 100)}%)</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.mostPlayedCards.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Most played cards</h3>
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded">
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

      {stats.avgInkByTurn.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Avg ink by turn</h3>
          <div className="flex items-end gap-1 h-16">
            {stats.avgInkByTurn.map(({ turn, avg }) => {
              const max = Math.max(...stats.avgInkByTurn.map(d => d.avg), 1)
              return (
                <div key={turn} className="flex-1 flex flex-col items-center gap-1">
                  <div className="flex-1 w-full flex items-end">
                    <div className="w-full bg-amber-300 rounded-t" style={{ height: `${(avg / max) * 100}%` }}
                      title={`Turn ${turn}: ${avg.toFixed(1)} ink`} />
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


function HistoryTab({ records, onDelete, onClearAll }) {
  const summaries = records.map(summarizeGame)
  const stats = computeStats(records)

  if (records.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-lg text-gray-500">
        <div className="text-sm mb-2">No games saved yet.</div>
        <Link to="/game-scraper" className="text-sm text-blue-600 hover:underline">Scrape a game →</Link>
      </div>
    )
  }

  return (
    <>
      <StatsDashboard stats={stats} />
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Saved games</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => downloadGameIds(records.map(r => r.uuid), [])}
            className="text-xs text-gray-400 hover:text-blue-600 underline"
          >
            Export IDs
          </button>
          <button onClick={onClearAll} className="text-xs text-gray-400 hover:text-red-600 underline">Clear all</button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {summaries.map(s => (
          <Link key={s.uuid} to={`/scouting/game/${s.uuid}`}
            className="group flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-900 transition-colors">
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
            <button onClick={(e) => onDelete(s.uuid, e)}
              className="text-xs text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete">✕</button>
          </Link>
        ))}
      </div>
    </>
  )
}

// --- Players tab ---

function PlayersTab({ records, gamelogs }) {
  const [ignored, setIgnoredState] = useState(getIgnored)
  const [showIgnored, setShowIgnored] = useState(false)
  const allPlayers = listPlayers(records, gamelogs)
  const visible = allPlayers.filter(p => !ignored.includes(p.name))
  const hiddenPlayers = allPlayers.filter(p => ignored.includes(p.name))

  const handleIgnore = (name) => {
    ignorePlayer(name)
    setIgnoredState(getIgnored())
  }

  const handleUnignore = (name) => {
    unignorePlayer(name)
    setIgnoredState(getIgnored())
  }

  if (allPlayers.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-lg text-gray-500">
        <div className="text-sm mb-2">No players yet.</div>
        <Link to="/game-scraper" className="text-sm text-blue-600 hover:underline">Scrape a game →</Link>
        {' · '}
        <Link to="/analytics" className="text-sm text-blue-600 hover:underline">Import gamelogs →</Link>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-2 mb-4">
        {visible.map(p => (
          <div key={p.name} className="group flex items-center gap-4 bg-white border border-gray-200 rounded-lg px-4 py-3">
            <Link to={`/players/${encodeURIComponent(p.name)}`} className="flex-1 min-w-0 hover:opacity-75">
              <div className="text-sm font-semibold text-gray-900 truncate">{p.name}</div>
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                <span
                  title={p.scoutedGameCount && p.gamelogGameCount
                    ? `${p.scoutedGameCount} scouted, ${p.gamelogGameCount} from gamelogs`
                    : undefined}
                >
                  {p.games} game{p.games !== 1 ? 's' : ''}
                </span>
                {p.winRate != null && <span>{p.wins}–{p.losses} ({Math.round(p.winRate * 100)}%)</span>}
                <span>{p.deckCount} deck{p.deckCount !== 1 ? 's' : ''}</span>
              </div>
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex gap-1 flex-wrap justify-end max-w-[120px]">
                {p.deckKeys.slice(0, 4).map(k => (
                  <div key={k} className="flex gap-0.5">
                    {resolveColors(k.split('+')).map(c => (
                      <img key={c} src={`/ink/${c}.png`} alt={c} className="w-3 h-3" />
                    ))}
                  </div>
                ))}
              </div>
              <button
                onClick={() => handleIgnore(p.name)}
                className="text-xs text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                title="Hide this player"
              >
                Hide
              </button>
            </div>
          </div>
        ))}
      </div>

      {hiddenPlayers.length > 0 && (
        <div>
          <button
            onClick={() => setShowIgnored(v => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 underline mb-3"
          >
            {showIgnored ? 'Hide' : 'Show'} {hiddenPlayers.length} hidden player{hiddenPlayers.length !== 1 ? 's' : ''}
          </button>
          {showIgnored && (
            <div className="grid grid-cols-1 gap-2">
              {hiddenPlayers.map(p => (
                <div key={p.name} className="flex items-center gap-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 opacity-60">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-500 truncate">{p.name}</div>
                    <div className="text-xs text-gray-400 mt-1">{p.games} game{p.games !== 1 ? 's' : ''} · hidden</div>
                  </div>
                  <button
                    onClick={() => handleUnignore(p.name)}
                    className="text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
                  >
                    Unhide
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// --- Main page ---

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [records, setRecords] = useState([])
  const [gamelogs, setGamelogs] = useState([])
  const [loading, setLoading] = useState(true)
  const activeTab = searchParams.get('tab') ?? 'history'

  const setTab = (tab) => setSearchParams({ tab }, { replace: true })

  const reload = () => {
    setLoading(true)
    Promise.all([getAllGames(), getAllGamelogs()]).then(([rs, logs]) => {
      setRecords(rs)
      setGamelogs(logs)
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

  return (
    <div className="w-full px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Scouting Library</h1>
        <p className="text-sm text-gray-500 mt-1">Your saved games, player stats, and imported snapshots.</p>
      </div>

      <ImportPanel />

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {['history', 'players'].map(tab => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'history' ? `History${records.length ? ` (${records.length})` : ''}` : 'Players'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : activeTab === 'history' ? (
        <HistoryTab records={records} onDelete={handleDelete} onClearAll={handleClearAll} />
      ) : (
        <PlayersTab records={records} gamelogs={gamelogs} />
      )}
    </div>
  )
}
