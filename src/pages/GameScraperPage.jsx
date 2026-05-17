import { useState, useEffect, useRef, useCallback } from 'react'

// --- Helpers ---

function extractUuid(input) {
  const trimmed = input.trim()
  const match = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return match ? match[0] : null
}

const DUELS_ORIGIN = 'https://duels.ink'

const ENDPOINTS = [
  (id) => `/api/spectate/${id}`,
  (id) => `/api/game/${id}`,
  (id) => `/api/games/${id}`,
  (id) => `/api/room/${id}`,
  (id) => `/api/v1/spectate/${id}`,
  (id) => `/api/v1/game/${id}`,
]

async function tryFetch(uuid) {
  const errors = []
  for (const ep of ENDPOINTS) {
    const url = `${DUELS_ORIGIN}${ep(uuid)}`
    try {
      const res = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      if (res.ok) {
        const data = await res.json()
        return { data, endpoint: url }
      }
      errors.push(`${url} → ${res.status}`)
    } catch (e) {
      errors.push(`${url} → ${e.message}`)
    }
  }
  throw new Error(`No endpoint responded.\n${errors.join('\n')}`)
}

// --- Game state parser ---

function parseLiveGame(data) {
  const room = data.roomView ?? data.room ?? data.gameState ?? data.state ?? data
  const players = room?.players ?? room?.playerStates ?? []
  const player1 = Array.isArray(players) ? players[0] : players?.['1'] ?? players?.player1
  const player2 = Array.isArray(players) ? players[1] : players?.['2'] ?? players?.player2

  const names = data.playerNames ?? room?.playerNames ?? {}
  const p1Name = names?.['1'] ?? player1?.name ?? player1?.username ?? 'Player 1'
  const p2Name = names?.['2'] ?? player2?.name ?? player2?.username ?? 'Player 2'

  const p1Lore = player1?.lore ?? player1?.score ?? null
  const p2Lore = player2?.lore ?? player2?.score ?? null

  const currentTurn = room?.turn ?? room?.turnNumber ?? room?.currentTurn ?? data.turnNumber ?? null
  const activePlayer = room?.activePlayer ?? room?.currentPlayer ?? room?.turnPlayer ?? null
  const phase = room?.phase ?? room?.currentPhase ?? null
  const status = room?.status ?? data.status ?? data.gameStatus ?? null
  const winner = data.winner ?? room?.winner ?? null

  const p1Field = player1?.field ?? player1?.board ?? player1?.characters ?? []
  const p2Field = player2?.field ?? player2?.board ?? player2?.characters ?? []

  const p1Hand = player1?.handCount ?? player1?.hand?.length ?? null
  const p2Hand = player2?.handCount ?? player2?.hand?.length ?? null
  const p1Deck = player1?.deckCount ?? player1?.deck?.length ?? null
  const p2Deck = player2?.deckCount ?? player2?.deck?.length ?? null

  const log = data.logs ?? data.log ?? room?.log ?? []

  return { p1Name, p2Name, p1Lore, p2Lore, currentTurn, activePlayer, phase, status, winner, p1Field, p2Field, p1Hand, p2Hand, p1Deck, p2Deck, log, raw: data }
}

// --- Bookmarklet ---

function makeBookmarklet(uuid) {
  const js = `(function(){try{const state=window.__GAME_STATE__||window.gameState||null;const data=JSON.stringify(state||{error:'No state found'});window.open(location.origin+'/game-scraper?uuid=${uuid}&data='+encodeURIComponent(data),'_blank');}catch(e){alert('Error: '+e.message);}})();`
  return 'javascript:' + encodeURIComponent(js)
}

// --- UI Components ---

function LoreBar({ lore, color }) {
  const pct = Math.min(100, ((lore ?? 0) / 20) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-900 w-12 text-right">{lore ?? '?'} / 20</span>
    </div>
  )
}

function FieldCard({ card }) {
  const name = card.fullName ?? card.name ?? 'Unknown'
  const exerted = card.exerted ?? card.tapped ?? false
  return (
    <div className={`flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0 ${exerted ? 'opacity-60' : ''}`}>
      {card.imageSmallUrl && (
        <img src={card.imageSmallUrl} alt={name} className="w-8 h-11 rounded object-cover border border-gray-200 flex-shrink-0" loading="lazy" />
      )}
      <div className="min-w-0">
        <div className="text-xs font-semibold text-gray-800 truncate">{name}</div>
        <div className="flex gap-2 text-xs text-gray-500 mt-0.5 flex-wrap">
          {card.strength != null && <span>STR {card.strength}</span>}
          {card.willpower != null && <span>WP {card.willpower}</span>}
          {card.lore != null && <span>◆{card.lore}</span>}
          {exerted && <span className="text-amber-600 font-medium">Exerted</span>}
        </div>
      </div>
    </div>
  )
}

function PlayerPanel({ name, lore, handCount, deckCount, field, loreColor, isActive }) {
  return (
    <div className={`bg-white rounded-xl border-2 p-4 flex flex-col gap-3 ${isActive ? 'border-blue-400 shadow-md' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2">
        {isActive && <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0 animate-pulse" />}
        <h3 className="font-bold text-gray-900 truncate">{name}</h3>
        {isActive && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium ml-auto">Active</span>}
      </div>
      <LoreBar lore={lore} color={loreColor} />
      <div className="flex gap-4 text-xs text-gray-500">
        {handCount != null && <span><span className="font-semibold text-gray-700">{handCount}</span> in hand</span>}
        {deckCount != null && <span><span className="font-semibold text-gray-700">{deckCount}</span> in deck</span>}
      </div>
      {field?.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Field ({field.length})</div>
          <div>{field.map((c, i) => <FieldCard key={c.id ?? i} card={c} />)}</div>
        </div>
      )}
    </div>
  )
}

function LogEntry({ entry }) {
  const { type, message, player, turnNumber, cardRefs = [] } = entry
  const cardName = cardRefs[0]?.fullName ?? cardRefs[0]?.name ?? null
  const label = message || `${type ?? 'Action'}${cardName ? `: ${cardName}` : ''}`
  return (
    <div className="flex gap-2 py-1 text-xs border-b border-gray-50 last:border-0">
      <span className="text-gray-400 flex-shrink-0 w-14">T{turnNumber ?? '?'} P{player ?? '?'}</span>
      <span className="text-gray-700 truncate">{label}</span>
    </div>
  )
}

function StatusBadge({ status, winner }) {
  if (winner != null) return <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded font-medium">Game Over</span>
  if (status === 'active' || status === 'in_progress') return <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded font-medium">Live</span>
  if (status) return <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded font-medium capitalize">{status}</span>
  return null
}

// --- Main Page ---

export function GameScraperPage() {
  const [urlInput, setUrlInput] = useState('')
  const [uuid, setUuid] = useState(null)
  const [gameData, setGameData] = useState(null)
  const [endpoint, setEndpoint] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(10)
  const [showRaw, setShowRaw] = useState(false)
  const intervalRef = useRef(null)

  const scrape = useCallback(async (id) => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const { data, endpoint: ep } = await tryFetch(id)
      setGameData(parseLiveGame(data))
      setEndpoint(ep)
      setLastUpdated(new Date())
    } catch (e) {
      setError(e.message)
      setGameData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    const id = extractUuid(urlInput)
    if (!id) { setError('Could not find a valid game UUID in that URL.'); return }
    setUuid(id)
    setGameData(null)
    setError(null)
    scrape(id)
  }

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (autoRefresh && uuid) {
      intervalRef.current = setInterval(() => scrape(uuid), refreshInterval * 1000)
    }
    return () => clearInterval(intervalRef.current)
  }, [autoRefresh, refreshInterval, uuid, scrape])

  const game = gameData

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Game Scraper</h1>
        <p className="text-sm text-gray-500 mt-1">Paste a duels.ink spectate URL to view live game state. You must be logged into duels.ink in this browser.</p>
      </div>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="https://duels.ink/spectate/019e371b-8152-7ec3-bcde-8c1eb483a18e"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent font-mono"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={loading || !urlInput.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
          >
            {loading ? 'Loading…' : 'Scrape'}
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="font-semibold text-red-700 text-sm mb-1">Could not fetch game data</div>
          <pre className="text-xs text-red-600 whitespace-pre-wrap font-mono">{error}</pre>
          {uuid && (
            <div className="mt-3 pt-3 border-t border-red-100">
              <p className="text-xs text-red-600 mb-2">
                CORS may be blocking the request. Make sure you are logged into{' '}
                <a href={`${DUELS_ORIGIN}/spectate/${uuid}`} target="_blank" rel="noopener noreferrer" className="underline">duels.ink</a>{' '}
                in this browser, then try again. If it still fails, use the bookmarklet below on the spectate page.
              </p>
              <details className="mt-2">
                <summary className="text-xs font-medium text-red-700 cursor-pointer select-none">Bookmarklet (run on the duels.ink page)</summary>
                <p className="text-xs text-gray-600 mt-2 mb-1">Drag this to your bookmarks bar, then click it while on the duels.ink spectate page:</p>
                <a
                  href={makeBookmarklet(uuid)}
                  className="inline-block bg-red-100 border border-red-300 text-red-800 text-xs px-3 py-1.5 rounded font-mono"
                  onClick={e => e.preventDefault()}
                  title="Drag me to bookmarks bar"
                >
                  Extract Lorcana Game
                </a>
              </details>
            </div>
          )}
        </div>
      )}

      {game && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
            <StatusBadge status={game.status} winner={game.winner} />
            {game.currentTurn != null && <span className="text-gray-500">Turn <span className="font-semibold text-gray-800">{game.currentTurn}</span></span>}
            {game.phase && <span className="text-gray-400 capitalize">{game.phase}</span>}
            {endpoint && <span className="text-gray-300 text-xs truncate hidden sm:block ml-auto">{endpoint}</span>}
            {lastUpdated && <span className="text-gray-400 text-xs">Updated {lastUpdated.toLocaleTimeString()}</span>}
            <button onClick={() => scrape(uuid)} disabled={loading} className="text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 px-3 py-1.5 rounded font-medium transition-colors">
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <div className="flex items-center gap-3 mb-5 text-sm">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="rounded" />
              <span className="text-gray-600">Auto-refresh every</span>
            </label>
            <select value={refreshInterval} onChange={e => setRefreshInterval(Number(e.target.value))} className="border border-gray-200 rounded text-xs px-2 py-1 text-gray-700">
              <option value={5}>5 s</option>
              <option value={10}>10 s</option>
              <option value={30}>30 s</option>
              <option value={60}>60 s</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <PlayerPanel name={game.p1Name} lore={game.p1Lore} handCount={game.p1Hand} deckCount={game.p1Deck} field={game.p1Field} loreColor="bg-amber-400" isActive={game.activePlayer === 1 || game.activePlayer === '1'} />
            <PlayerPanel name={game.p2Name} lore={game.p2Lore} handCount={game.p2Hand} deckCount={game.p2Deck} field={game.p2Field} loreColor="bg-blue-400" isActive={game.activePlayer === 2 || game.activePlayer === '2'} />
          </div>

          {game.winner != null && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6 text-center">
              <div className="text-purple-800 font-bold">
                {game.winner === 1 ? game.p1Name : game.winner === 2 ? game.p2Name : `Player ${game.winner}`} wins!
              </div>
            </div>
          )}

          {game.log?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-bold text-gray-700 mb-2">Recent Actions ({game.log.length})</h3>
              <div className="max-h-48 overflow-y-auto">
                {[...game.log].reverse().slice(0, 50).map((entry, i) => <LogEntry key={i} entry={entry} />)}
              </div>
            </div>
          )}

          <div>
            <button onClick={() => setShowRaw(r => !r)} className="text-xs text-gray-400 hover:text-gray-600 underline">
              {showRaw ? 'Hide' : 'Show'} raw response
            </button>
            {showRaw && (
              <pre className="mt-2 text-xs bg-gray-50 border border-gray-200 rounded-xl p-4 overflow-auto max-h-96 font-mono text-gray-600">
                {JSON.stringify(game.raw, null, 2)}
              </pre>
            )}
          </div>
        </>
      )}

      {!game && !error && !loading && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">🎮</div>
          <div className="text-sm">Paste a spectate URL above to get started.</div>
          <div className="text-xs mt-1">Example: https://duels.ink/spectate/019e371b-…</div>
        </div>
      )}
    </div>
  )
}
