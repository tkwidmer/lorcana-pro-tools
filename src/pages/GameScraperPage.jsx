import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

// --- Helpers ---

function extractUuid(input) {
  const trimmed = input.trim()
  // Match a UUID anywhere in the string (e.g. from a full URL)
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

// --- Game state parsers ---

function parseLiveGame(data) {
  // data may be the full WS message { type, game } or just the game object
  const game = data.game ?? data

  // Build definitionId → name lookup from log cardRefs
  const defIdToName = {}
  const logs = game.logs ?? []
  for (const log of logs) {
    for (const ref of (log.cardRefs ?? [])) {
      if (ref.id && ref.name) defIdToName[ref.id] = ref.name
    }
  }

  const p1 = game.player1 ?? {}
  const p2 = game.player2 ?? {}
  const names = game.playerNames ?? {}

  const p1Name = names.player1 ?? names['1'] ?? 'Player 1'
  const p2Name = names.player2 ?? names['2'] ?? 'Player 2'

  const enrichField = (field) => (field ?? []).map(card => ({
    ...card,
    name: defIdToName[card.definitionId] ?? card.name ?? card.definitionId,
    fullName: defIdToName[card.definitionId] ?? card.fullName ?? card.name ?? card.definitionId,
  }))

  return {
    p1Name,
    p2Name,
    p1Lore: p1.lore ?? null,
    p2Lore: p2.lore ?? null,
    currentTurn: game.turnNumber ?? null,
    activePlayer: game.currentPlayer ?? game.timerView?.activePlayer ?? null,
    phase: null,
    status: game.status ?? null,
    winner: game.winner ?? null,
    p1Field: enrichField(p1.field),
    p2Field: enrichField(p2.field),
    p1Hand: p1.handCount ?? null,
    p2Hand: p2.handCount ?? null,
    p1Deck: p1.deckCount ?? null,
    p2Deck: p2.deckCount ?? null,
    log: logs,
    raw: data,
  }
}

// --- Bookmarklet generator ---

function makeBookmarkletCode(uuid, origin) {
  return `javascript:(function(){ var done=false; var origAddListener=WebSocket.prototype.addEventListener; WebSocket.prototype.addEventListener=function(type,handler){ var self=this; if(type==='message'){ var wrapped=function(ev){ console.log('WS message event:', typeof ev.data); if(!done){ try{ var d=JSON.parse(ev.data); console.log('Parsed:', d.type); if(d.type==='spectator_update'&&d.game){ console.log('Got spectator_update!'); done=true; window.open('${origin}/game-scraper?uuid=${uuid}&data='+encodeURIComponent(JSON.stringify(d.game)),'_blank'); return; } }catch(e){ console.log('Parse error:', e.message); } } handler.call(self,ev); }; return origAddListener.call(this,type,wrapped); } return origAddListener.call(this,type,handler); }; alert('Waiting for next game update...\\nThe tool will open automatically in a new tab when the server sends the next update (usually within a few seconds).\\n\\nOpen DevTools (F12 > Console) to see debugging info.'); })();`
}

function BookmarkletPanel({ uuid }) {
  const [copied, setCopied] = useState(false)
  const origin = window.location.origin
  const code = makeBookmarkletCode(uuid, origin)

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <details className="mt-2">
      <summary className="text-xs font-medium text-red-700 cursor-pointer select-none">Bookmarklet (run on the duels.ink page)</summary>
      <div className="mt-2 space-y-2">
        <p className="text-xs text-gray-600">
          1. Copy the code below.<br />
          2. Create a new bookmark in your browser (right-click bookmarks bar → Add page).<br />
          3. Edit it and paste this as the <strong>URL / Address</strong> field.<br />
          4. Go to the duels.ink spectate page and click the bookmark.<br />
          5. An alert will appear saying "Waiting for next game update…" — dismiss it.<br />
          6. Within a few seconds the server will send the next live update and this tool will open automatically in a new tab with the game data.
        </p>
        <div className="flex items-start gap-2">
          <code className="flex-1 block text-xs bg-gray-100 border border-gray-200 rounded p-2 font-mono break-all select-all">
            {code}
          </code>
          <button
            onClick={copy}
            className="flex-shrink-0 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded font-medium transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </details>
  )
}

// --- UI Components ---

function LoreBar({ lore, label, color }) {
  const pct = Math.min(100, ((lore ?? 0) / 20) * 100)
  return (
    <div className="flex-1">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span className="font-medium text-gray-700 truncate">{label}</span>
        <span className="font-bold text-gray-900 ml-2">{lore ?? '?'} / 20</span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
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
        {isActive && (
          <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0 animate-pulse" />
        )}
        <h3 className="font-bold text-gray-900 truncate">{name}</h3>
        {isActive && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium ml-auto">Active</span>}
      </div>
      <LoreBar lore={lore} label="Lore" color={loreColor} />
      <div className="flex gap-4 text-xs text-gray-500">
        {handCount != null && <span><span className="font-semibold text-gray-700">{handCount}</span> in hand</span>}
        {deckCount != null && <span><span className="font-semibold text-gray-700">{deckCount}</span> in deck</span>}
      </div>
      {field?.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Field ({field.length})</div>
          <div className="divide-y divide-gray-100">
            {field.map((c, i) => <FieldCard key={c.id ?? i} card={c} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function LogEntry({ entry }) {
  const { type, message = '', player, turnNumber, cardRefs = [] } = entry
  const resolved = message.replace(/\{card:(\d+)\}/g, (_, i) => {
    const ref = cardRefs[parseInt(i)]
    return ref ? (ref.name ?? ref.id ?? '?') : '?'
  })
  return (
    <div className="flex gap-2 py-1 text-xs border-b border-gray-50 last:border-0">
      <span className="text-gray-400 flex-shrink-0 w-14">T{turnNumber ?? '?'} P{player ?? '?'}</span>
      <span className="text-gray-700 truncate">{resolved || type}</span>
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
  const [searchParams, setSearchParams] = useSearchParams()
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

  // Read data injected by the bookmarklet via URL params
  useEffect(() => {
    const paramUuid = searchParams.get('uuid')
    const paramData = searchParams.get('data')
    if (paramUuid && paramData) {
      try {
        const parsed = JSON.parse(decodeURIComponent(paramData))
        if (parsed.error) {
          setError(`Bookmarklet error: ${parsed.error}`)
        } else {
          setUuid(paramUuid)
          setUrlInput(`https://duels.ink/spectate/${paramUuid}`)
          setGameData(parseLiveGame(parsed))
          setEndpoint('bookmarklet')
          setLastUpdated(new Date())
        }
      } catch {
        setError('Could not parse data from bookmarklet.')
      }
      // Clear params from URL so a refresh doesn't re-apply stale data
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!id) {
      setError('Could not find a valid game UUID in that URL.')
      return
    }
    setUuid(id)
    setGameData(null)
    setError(null)
    scrape(id)
  }

  // Auto-refresh
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
        <p className="text-sm text-gray-500 mt-1">
          Paste a duels.ink spectate URL to view live game state. You must be logged into duels.ink in this browser.
        </p>
      </div>

      {/* URL Input */}
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

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="font-semibold text-red-700 text-sm mb-1">Could not fetch game data</div>
          <pre className="text-xs text-red-600 whitespace-pre-wrap font-mono">{error}</pre>
          {uuid && (
            <div className="mt-3 pt-3 border-t border-red-100">
              <p className="text-xs text-red-600 mb-2">
                This usually means CORS is blocking the request. Make sure you're logged into{' '}
                <a href={`${DUELS_ORIGIN}/spectate/${uuid}`} target="_blank" rel="noopener noreferrer" className="underline">
                  duels.ink
                </a>{' '}
                in this browser, then try again. If it still fails, use the bookmarklet below on the spectate page.
              </p>
              <BookmarkletPanel uuid={uuid} />
            </div>
          )}
        </div>
      )}

      {/* Game view */}
      {game && (
        <>
          {/* Controls bar */}
          <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
            <StatusBadge status={game.status} winner={game.winner} />
            {game.currentTurn != null && (
              <span className="text-gray-500">Turn <span className="font-semibold text-gray-800">{game.currentTurn}</span></span>
            )}
            {game.phase && (
              <span className="text-gray-400 capitalize">{game.phase}</span>
            )}
            {endpoint && (
              <span className="text-gray-300 text-xs truncate hidden sm:block ml-auto">{endpoint}</span>
            )}
            {lastUpdated && (
              <span className="text-gray-400 text-xs">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => scrape(uuid)}
              disabled={loading}
              className="text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 px-3 py-1.5 rounded font-medium transition-colors"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {/* Auto-refresh toggle */}
          <div className="flex items-center gap-3 mb-5 text-sm">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              <span className="text-gray-600">Auto-refresh every</span>
            </label>
            <select
              value={refreshInterval}
              onChange={e => setRefreshInterval(Number(e.target.value))}
              className="border border-gray-200 rounded text-xs px-2 py-1 text-gray-700"
            >
              <option value={5}>5 s</option>
              <option value={10}>10 s</option>
              <option value={30}>30 s</option>
              <option value={60}>60 s</option>
            </select>
          </div>

          {/* Player panels */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <PlayerPanel
              name={game.p1Name}
              lore={game.p1Lore}
              handCount={game.p1Hand}
              deckCount={game.p1Deck}
              field={game.p1Field}
              loreColor="bg-amber-400"
              isActive={game.activePlayer === 1 || game.activePlayer === '1'}
            />
            <PlayerPanel
              name={game.p2Name}
              lore={game.p2Lore}
              handCount={game.p2Hand}
              deckCount={game.p2Deck}
              field={game.p2Field}
              loreColor="bg-sapphire-400 bg-blue-400"
              isActive={game.activePlayer === 2 || game.activePlayer === '2'}
            />
          </div>

          {/* Winner banner */}
          {game.winner != null && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6 text-center">
              <div className="text-purple-800 font-bold">
                {game.winner === 1 ? game.p1Name : game.winner === 2 ? game.p2Name : `Player ${game.winner}`} wins!
              </div>
            </div>
          )}

          {/* Recent log */}
          {game.log?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-bold text-gray-700 mb-2">Recent Actions ({game.log.length})</h3>
              <div className="max-h-48 overflow-y-auto">
                {[...game.log].reverse().slice(0, 50).map((entry, i) => (
                  <LogEntry key={i} entry={entry} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Raw data toggle */}
          <div>
            <button
              onClick={() => setShowRaw(r => !r)}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
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

      {/* Empty state */}
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
