import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

const DUELS_ORIGIN = 'https://duels.ink'

// --- Game state parsers ---

function buildObservedDeck(logs, fieldCards, playerNum) {
  // Track only actions that confirm deck composition
  const RELEVANT_ACTIONS = new Set(['PLAY', 'INK', 'DISCARD', 'DRAW'])
  const cards = {} // definitionId → { name, plays: 0, inked: 0, discarded: 0 }
  const colors = new Set()

  for (const log of logs) {
    if (log.player !== playerNum && log.player !== String(playerNum)) continue
    if (!RELEVANT_ACTIONS.has(log.type)) continue

    for (const ref of (log.cardRefs ?? [])) {
      if (!ref.id || !ref.name) continue
      if (!cards[ref.id]) {
        cards[ref.id] = { name: ref.name, plays: 0, inked: 0, discarded: 0 }
      }
      if (log.type === 'PLAY') cards[ref.id].plays++
      else if (log.type === 'INK') cards[ref.id].inked++
      else if (log.type === 'DISCARD') cards[ref.id].discarded++

      // Extract ink color (try various field names)
      if (ref.color) colors.add(ref.color)
      if (ref.colours && Array.isArray(ref.colours)) ref.colours.forEach(c => colors.add(c))
      if (ref.ink) colors.add(ref.ink)
    }
  }

  // Include field cards (may not have explicit PLAY action) and extract colors
  for (const card of fieldCards) {
    if (!card.definitionId) continue
    if (!cards[card.definitionId]) {
      cards[card.definitionId] = { name: card.name ?? card.definitionId, plays: 0, inked: 0, discarded: 0 }
    }
    if (card.color) colors.add(card.color)
    if (card.colours && Array.isArray(card.colours)) card.colours.forEach(c => colors.add(c))
    if (card.ink) colors.add(card.ink)
  }

  const cardList = Object.entries(cards)
    .map(([definitionId, { name, plays, inked, discarded }]) => ({
      definitionId,
      name,
      plays: Math.max(plays, 1), // at least 1 if observed at all
      inked,
      discarded,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { cards: cardList, colors: Array.from(colors).sort() }
}

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

  const p1Field = enrichField(p1.field)
  const p2Field = enrichField(p2.field)

  // Build observed decks and extract ink colors
  const p1Observed = buildObservedDeck(logs, p1Field, 1)
  const p2Observed = buildObservedDeck(logs, p2Field, 2)

  // Ink pool: count INK actions per player for total pool size;
  // also try server-provided available/spent values
  const countInked = (playerNum) => logs.filter(l => (l.player === playerNum || l.player === String(playerNum)) && l.type === 'INK').length
  const p1InkedCount = countInked(1)
  const p2InkedCount = countInked(2)

  const p1InkPool = p1.inkCount ?? p1.inkAvailable ?? p1.inkPool ?? p1.ink ?? (p1InkedCount > 0 ? p1InkedCount : null)
  const p2InkPool = p2.inkCount ?? p2.inkAvailable ?? p2.inkPool ?? p2.ink ?? (p2InkedCount > 0 ? p2InkedCount : null)
  const p1InkUsed = p1.inkUsed ?? p1.inkSpent ?? null
  const p2InkUsed = p2.inkUsed ?? p2.inkSpent ?? null

  // Debug: analyze logs to understand structure
  const actionCounts = {}
  const playerNumbers = new Set()
  for (const log of logs) {
    const type = log.type ?? 'unknown'
    const player = log.player ?? 'unknown'
    playerNumbers.add(player)
    actionCounts[type] = (actionCounts[type] ?? 0) + 1
  }

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
    p1Field,
    p2Field,
    p1Hand: p1.handCount ?? null,
    p2Hand: p2.handCount ?? null,
    p1Deck: p1.deckCount ?? null,
    p2Deck: p2.deckCount ?? null,
    p1InkPool,
    p2InkPool,
    p1InkUsed,
    p2InkUsed,
    p1InkedCount,
    p2InkedCount,
    p1ObservedDeck: p1Observed.cards,
    p2ObservedDeck: p2Observed.cards,
    p1InkColors: p1Observed.colors,
    p2InkColors: p2Observed.colors,
    log: logs,
    raw: data,
    _debug: {
      actionCounts,
      playerNumbers: Array.from(playerNumbers),
      totalLogs: logs.length,
      p1InkedCount,
      p2InkedCount,
    },
  }
}

// --- Bookmarklet generator ---

function makeGenericBookmarkletCode(origin, newTab = true) {
  const sendData = newTab
    ? `if(!window.__lorcanaTab||window.__lorcanaTab.closed){ window.__lorcanaTab=window.open('${origin}/game-scraper?uuid='+uuid,'_blank'); window.addEventListener('message',function onReady(e){ if(e.source===window.__lorcanaTab&&e.data&&e.data.type==='lorcana_ready'){ window.removeEventListener('message',onReady); window.__lorcanaTab.postMessage({type:'lorcana_game_data',game:d.game},'${origin}'); } }); } else { window.__lorcanaTab.postMessage({type:'lorcana_game_data',game:d.game},'${origin}'); }`
    : `window.__lorcanaGameData=d.game; window.location.href='${origin}/game-scraper?uuid='+uuid;`
  return `javascript:(function(){ if(window.__lorcanaActive){ console.log('[Lorcana] Already active'); return; } window.__lorcanaActive=true; var origDesc=Object.getOwnPropertyDescriptor(WebSocket.prototype,'onmessage'); var origAEL=WebSocket.prototype.addEventListener; function intercept(ev){ try{ var d=JSON.parse(ev.data); if(d.type==='spectator_update'&&d.game){ var match=window.location.href.match(/spectate\\/([a-f0-9-]+)/i); var uuid=match?match[1]:'unknown'; ${sendData} } }catch(e){} } Object.defineProperty(WebSocket.prototype,'onmessage',{ set:function(h){ var self=this; origDesc.set.call(this,function(ev){ intercept.call(self,ev); if(h) h.call(self,ev); }); }, get:function(){ return origDesc.get.call(this); } }); WebSocket.prototype.addEventListener=function(type,listener){ if(type==='message'){ var self=this; return origAEL.call(this,type,function(ev){ intercept.call(self,ev); listener.call(self,ev); }); } return origAEL.call(this,type,listener); }; console.log('[Lorcana] Ready! Now navigate to a spectate page and the tool will open automatically.'); })();`
}

function makeBookmarkletCode(uuid, origin) {
  return `javascript:(function(){ var done=false; var origDesc=Object.getOwnPropertyDescriptor(WebSocket.prototype,'onmessage'); Object.defineProperty(WebSocket.prototype,'onmessage',{set:function(h){ var self=this; var wrapped=function(ev){ console.log('Message!'); if(!done){ try{ var d=JSON.parse(ev.data); console.log('Type:',d.type); if(d.type==='spectator_update'&&d.game){ console.log('Found game!'); done=true; window.open('${origin}/game-scraper?uuid=${uuid}&data='+encodeURIComponent(JSON.stringify(d.game)),'_blank'); return; } }catch(e){ console.log('Error:',e.message); } } if(h) h.call(self,ev); }; if(origDesc&&origDesc.set){ origDesc.set.call(this,wrapped); } else { this.addEventListener('message',wrapped); } }, get:function(){ return origDesc&&origDesc.get ? origDesc.get.call(this) : this._onmessage; }}); alert('Waiting for next game update...\\nThe tool will open automatically in a new tab when the server sends the next update (usually within a few seconds).\\n\\nOpen DevTools (F12 > Console) to see debugging info.'); })();`
}

function BookmarkletPanel({ uuid }) {
  const [copied, setCopied] = useState(false)
  const [genericCopied, setGenericCopied] = useState(false)
  const [showSpecific, setShowSpecific] = useState(false)
  const [newTab, setNewTab] = useState(true)
  const origin = window.location.origin
  const specificCode = makeBookmarkletCode(uuid, origin)
  const genericCode = makeGenericBookmarkletCode(origin, newTab)

  const copy = (code, setType) => {
    navigator.clipboard.writeText(code).then(() => {
      setType(true)
      setTimeout(() => setType(false), 2000)
    })
  }

  return (
    <details className="mt-2">
      <summary className="text-xs font-medium text-red-700 cursor-pointer select-none">Bookmarklet (run on the duels.ink page)</summary>
      <div className="mt-2 space-y-3">
        <p className="text-xs text-gray-600">
          <strong>One-time setup:</strong> Copy the code below and save it as a bookmark (right-click bookmarks bar → Add page, then paste as the URL).<br /><br />
          <strong>Each game:</strong><br />
          1. Go to any duels.ink page (home, profile, lobby — anywhere <em>except</em> the spectate page).<br />
          2. Click the bookmark. You'll see <code>[Lorcana] Ready!</code> in the browser console.<br />
          3. Navigate to the spectate URL.<br />
          4. The tool opens automatically in a new tab as soon as the game data arrives.
        </p>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-gray-700">Generic Bookmarklet (works for any game)</div>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newTab}
                onChange={e => setNewTab(e.target.checked)}
                className="rounded"
              />
              Open in new tab
              <span className="text-gray-400">(uncheck for mobile)</span>
            </label>
          </div>
          <div className="flex items-start gap-2">
            <code className="flex-1 block text-xs bg-gray-100 border border-gray-200 rounded p-2 font-mono break-all select-all">
              {genericCode}
            </code>
            <button
              onClick={() => copy(genericCode, setGenericCopied)}
              className="flex-shrink-0 text-xs bg-green-200 hover:bg-green-300 text-green-700 px-3 py-1.5 rounded font-medium transition-colors"
            >
              {genericCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <button
          onClick={() => setShowSpecific(!showSpecific)}
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          {showSpecific ? 'Hide' : 'Show'} game-specific bookmarklet
        </button>

        {showSpecific && (
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-1">Game-Specific Bookmarklet</div>
            <p className="text-xs text-gray-500 mb-2">Pre-filled with this game's UUID. Need a new one for each game.</p>
            <div className="flex items-start gap-2">
              <code className="flex-1 block text-xs bg-gray-100 border border-gray-200 rounded p-2 font-mono break-all select-all">
                {specificCode}
              </code>
              <button
                onClick={() => copy(specificCode, setCopied)}
                className="flex-shrink-0 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded font-medium transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}
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

function InkColors({ colors }) {
  if (!colors?.length) return null

  const colorNameMap = {
    red: 'ruby',
    ruby: 'ruby',
    blue: 'sapphire',
    sapphire: 'sapphire',
    green: 'emerald',
    emerald: 'emerald',
    yellow: 'amber',
    amber: 'amber',
    purple: 'amethyst',
    amethyst: 'amethyst',
    gray: 'steel',
    steel: 'steel',
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-gray-600">Ink:</span>
      <div className="flex gap-1">
        {colors.map((color, i) => {
          const inkName = colorNameMap[color?.toLowerCase()] ?? color?.toLowerCase()
          return (
            <img
              key={i}
              src={`/ink/${inkName}.png`}
              alt={color}
              className="w-5 h-5"
              title={color}
            />
          )
        })}
      </div>
    </div>
  )
}

function InkMeter({ inkPool, inkUsed, inkedCount }) {
  if (inkPool == null && inkedCount == null) return null
  const total = inkPool ?? inkedCount
  const available = inkUsed != null ? total - inkUsed : null
  const dots = Math.min(total, 20)

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span className="font-medium text-gray-700">Ink</span>
        <span className="font-semibold text-gray-700">
          {available != null ? `${available} / ${total}` : `${total} pooled`}
        </span>
      </div>
      <div className="flex gap-0.5 flex-wrap">
        {Array.from({ length: dots }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full border ${
              available != null && i >= available
                ? 'bg-gray-100 border-gray-200'
                : 'bg-amber-300 border-amber-400'
            }`}
          />
        ))}
        {total > 20 && <span className="text-xs text-gray-400 ml-1">+{total - 20}</span>}
      </div>
    </div>
  )
}

function FieldCard({ card }) {
  const name = card.fullName ?? card.name ?? 'Unknown'
  const exerted = card.exerted ?? card.tapped ?? false
  const instanceId = card.instanceId
  return (
    <div className={`flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0 ${exerted ? 'opacity-60' : ''}`}>
      {card.imageSmallUrl && (
        <img src={card.imageSmallUrl} alt={name} className="w-8 h-11 rounded object-cover border border-gray-200 flex-shrink-0" loading="lazy" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-gray-800 truncate">{name}</div>
        {instanceId && (
          <div className="text-xs text-gray-400 font-mono truncate" title={instanceId}>
            {instanceId.substring(0, 12)}…
          </div>
        )}
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

function PlayerPanel({ name, lore, handCount, deckCount, field, observedDeck, loreColor, isActive, inkPool, inkUsed, inkedCount, inkColors }) {
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
      <InkMeter inkPool={inkPool} inkUsed={inkUsed} inkedCount={inkedCount} />
      <InkColors colors={inkColors} />
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
      <ObservedDeck cards={observedDeck} />
    </div>
  )
}

function LogEntry({ entry, playerColors }) {
  const { type, message = '', player, turnNumber, cardRefs = [] } = entry
  const resolved = message.replace(/\{card:(\d+)\}/g, (_, i) => {
    const ref = cardRefs[parseInt(i)]
    return ref ? (ref.name ?? ref.id ?? '?') : '?'
  })

  const colorNameMap = {
    red: 'ruby',
    ruby: 'ruby',
    blue: 'sapphire',
    sapphire: 'sapphire',
    green: 'emerald',
    emerald: 'emerald',
    yellow: 'amber',
    amber: 'amber',
    purple: 'amethyst',
    amethyst: 'amethyst',
    gray: 'steel',
    steel: 'steel',
  }

  const primaryColor = playerColors?.[0]
  const inkName = primaryColor ? (colorNameMap[primaryColor?.toLowerCase()] ?? primaryColor?.toLowerCase()) : null

  return (
    <div className="flex gap-2 py-1 text-xs border-b border-gray-50 last:border-0 items-center">
      {inkName && (
        <img
          src={`/ink/${inkName}.png`}
          alt={primaryColor}
          className="w-4 h-4 flex-shrink-0"
          title={primaryColor}
        />
      )}
      <span className="text-gray-400 flex-shrink-0 w-12">T{turnNumber ?? '?'} P{player ?? '?'}</span>
      <span className="text-gray-700 truncate">{resolved || type}</span>
    </div>
  )
}

function ObservedDeck({ cards }) {
  const [open, setOpen] = useState(false)
  if (!cards?.length) return null

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700 transition-colors"
      >
        Observed Cards ({cards.length} unique) {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="mt-1 max-h-48 overflow-y-auto text-xs">
          {cards.map(card => {
            const notes = []
            if (card.inked > 0) notes.push(`${card.inked} inked`)
            if (card.discarded > 0) notes.push(`${card.discarded} discarded`)
            const noteText = notes.length ? ` (${notes.join(', ')})` : ''
            return (
              <div key={card.definitionId} className="flex items-center justify-between py-0.5 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-gray-700 font-medium truncate">{card.name}</div>
                  {noteText && <div className="text-gray-500 text-xs truncate">{noteText}</div>}
                </div>
                <span className="text-gray-600 font-medium ml-2 flex-shrink-0">{card.plays}×</span>
              </div>
            )
          })}
        </div>
      )}
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
  const [uuid, setUuid] = useState(null)
  const [gameData, setGameData] = useState(null)
  const [endpoint, setEndpoint] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [showRaw, setShowRaw] = useState(false)

  // Read UUID from URL params (set by bookmarklet when opening this tab)
  useEffect(() => {
    const paramUuid = searchParams.get('uuid')
    if (paramUuid) {
      setUuid(paramUuid)
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Handshake with bookmarklet: signal ready, then receive game data
  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type === 'lorcana_game_data' && event.data?.game) {
        setGameData(parseLiveGame(event.data.game))
        setEndpoint('bookmarklet')
        setLastUpdated(new Date())
      }
    }
    window.addEventListener('message', handler)
    // Tell the opener we're ready to receive data
    if (window.opener) {
      window.opener.postMessage({ type: 'lorcana_ready' }, '*')
    }
    return () => window.removeEventListener('message', handler)
  }, [])

  // Expose game data to console for debugging
  useEffect(() => {
    window.__gameData = gameData
  }, [gameData])

  const game = gameData

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Game Scraper</h1>
        <p className="text-sm text-gray-500 mt-1">
          Paste a duels.ink spectate URL to view live game state. You must be logged into duels.ink in this browser.
        </p>
      </div>

      {/* Bookmarklet instructions — always visible */}
      <BookmarkletPanel uuid={uuid} />

      {/* Game view */}
      {game && (
        <>
          {/* Status bar */}
          <div className="flex flex-wrap items-center gap-3 mt-6 mb-4 text-sm">
            <StatusBadge status={game.status} winner={game.winner} />
            {game.currentTurn != null && (
              <span className="text-gray-500">Turn <span className="font-semibold text-gray-800">{game.currentTurn}</span></span>
            )}
            {lastUpdated && (
              <span className="text-gray-400 text-xs ml-auto">Updated {lastUpdated.toLocaleTimeString()}</span>
            )}
          </div>

          {/* Player panels */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <PlayerPanel
              name={game.p1Name}
              lore={game.p1Lore}
              handCount={game.p1Hand}
              deckCount={game.p1Deck}
              field={game.p1Field}
              observedDeck={game.p1ObservedDeck}
              loreColor="bg-amber-400"
              isActive={game.activePlayer === 1 || game.activePlayer === '1'}
              inkPool={game.p1InkPool}
              inkUsed={game.p1InkUsed}
              inkedCount={game.p1InkedCount}
              inkColors={game.p1InkColors}
            />
            <PlayerPanel
              name={game.p2Name}
              lore={game.p2Lore}
              handCount={game.p2Hand}
              deckCount={game.p2Deck}
              field={game.p2Field}
              observedDeck={game.p2ObservedDeck}
              loreColor="bg-sapphire-400 bg-blue-400"
              isActive={game.activePlayer === 2 || game.activePlayer === '2'}
              inkPool={game.p2InkPool}
              inkUsed={game.p2InkUsed}
              inkedCount={game.p2InkedCount}
              inkColors={game.p2InkColors}
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

          {/* Full game log */}
          {game.log?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-bold text-gray-700 mb-2">Game Actions ({game.log.length})</h3>
              <div className="max-h-96 overflow-y-auto">
                {game.log.map((entry, i) => {
                  const playerColors = entry.player === 1 ? game.p1InkColors : entry.player === 2 ? game.p2InkColors : []
                  return <LogEntry key={i} entry={entry} playerColors={playerColors} />
                })}
              </div>
            </div>
          )}

          {/* Debug info */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-bold text-gray-700 mb-2">Debug Info</h3>
            <div className="text-xs text-gray-600 space-y-1">
              <div>Total logs: {game._debug?.totalLogs ?? 0}</div>
              <div>Player numbers in logs: {game._debug?.playerNumbers?.join(', ') ?? 'none'}</div>
              <div>Action types: {Object.entries(game._debug?.actionCounts ?? {}).map(([type, count]) => `${type}: ${count}`).join(', ') || 'none'}</div>
              <div>P1 inked actions counted: {game._debug?.p1InkedCount ?? 0}</div>
              <div>P2 inked actions counted: {game._debug?.p2InkedCount ?? 0}</div>
            </div>
          </div>

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
      {!game && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-sm">Waiting for game data from the bookmarklet…</div>
        </div>
      )}
    </div>
  )
}
