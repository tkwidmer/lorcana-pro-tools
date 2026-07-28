import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { resolveInkName } from '../lib/inkColors'
import { saveGame } from '../lib/scoutedGames'
import { GameView } from '../components/GameView'

// Cache for card data: { byId: {setCode-number -> {color, name, fullName}}, byName: {name/fullName -> {...}} }
let cardDataCache = null
async function loadCardData() {
  if (cardDataCache) return cardDataCache
  try {
    const res = await fetch('/api/cards')
    if (!res.ok) return { byId: {}, byName: {} }
    const data = await res.json()
    const cards = data.cards ?? []

    // When LorcanaJSON has multiple entries with the same setCode-number (e.g. promo reprints),
    // prefer non-promo cards, then Core > Infinity > other format cards, then higher set number on ties.
    const score = c => {
      const promoBonus = (c.promoGrouping == null && c.promoSourceCategory == null) ? 10 : 0
      if (c.allowedInFormats?.Core?.allowed) return promoBonus + 2
      if (c.allowedInFormats?.Infinity?.allowed) return promoBonus + 1
      return promoBonus
    }
    const cardById = {}
    for (const c of cards) {
      if (c.setCode == null || c.number == null) continue
      const key = `${c.setCode}-${c.number}`
      const existing = cardById[key]
      if (!existing) { cardById[key] = c; continue }
      const ts = score(c), es = score(existing)
      if (ts > es) { cardById[key] = c; continue }
      if (ts === es && (parseInt(c.setCode) || 0) > (parseInt(existing.setCode) || 0)) cardById[key] = c
    }

    const byId = {}
    for (const [key, c] of Object.entries(cardById)) {
      byId[key] = { color: c.color, name: c.name, fullName: c.fullName }
    }

    const byName = {}
    for (const card of cards) {
      if (card.fullName) byName[card.fullName] = { color: card.color, name: card.name, fullName: card.fullName }
      if (card.name) byName[card.name] = { color: card.color, name: card.name, fullName: card.fullName }
    }

    cardDataCache = { byId, byName }
    return cardDataCache
  } catch (e) {
    console.error('Failed to load card data:', e)
    return { byId: {}, byName: {} }
  }
}

// spectator_update payloads only include a recent window of log entries, not the
// full game history. Merge by finding where the new window overlaps the tail of
// what we've already accumulated, so the observed-cards list grows across turns
// instead of resetting each update.
function mergeLogs(prevLogs, newLogs) {
  if (!prevLogs.length) return newLogs
  if (!newLogs.length) return prevLogs
  const maxOverlap = Math.min(prevLogs.length, newLogs.length)
  for (let k = maxOverlap; k > 0; k--) {
    if (JSON.stringify(prevLogs.slice(-k)) === JSON.stringify(newLogs.slice(0, k))) {
      return [...prevLogs, ...newLogs.slice(k)]
    }
  }
  return [...prevLogs, ...newLogs]
}

function buildObservedDeck(logs, fieldCards, playerNum, cardLookup = {}) {
  const byName = cardLookup.byName ?? {}
  const byId = cardLookup.byId ?? {}
  const RELEVANT_ACTIONS = new Set(['CARD_PLAYED', 'CARD_INKED', 'CARD_DISCARDED', 'CARD_DRAWN'])
  const cards = {}
  const colors = new Set()

  for (const log of logs) {
    if (log.player !== playerNum && log.player !== String(playerNum)) continue
    if (!RELEVANT_ACTIONS.has(log.type)) continue

    for (const ref of (log.cardRefs ?? [])) {
      if (!ref.id || !ref.name) continue
      if (!cards[ref.id]) {
        cards[ref.id] = { name: ref.fullName ?? byId[ref.id]?.fullName ?? ref.name, plays: 0, inked: 0, discarded: 0 }
      }
      if (log.type === 'CARD_PLAYED') cards[ref.id].plays++
      else if (log.type === 'CARD_INKED') cards[ref.id].inked++
      else if (log.type === 'CARD_DISCARDED') cards[ref.id].discarded++

      const cardDef = byName[ref.name]
      if (cardDef?.color) {
        const name = resolveInkName(cardDef.color)
        if (name) colors.add(name)
      }
    }
  }

  for (const card of fieldCards) {
    if (!card.definitionId) continue
    if (!cards[card.definitionId]) {
      cards[card.definitionId] = { name: card.fullName ?? card.name ?? card.definitionId, plays: 0, inked: 0, discarded: 0 }
    }
    const cardDef = byName[card.fullName] || byName[card.name]
    if (cardDef?.color) {
      const name = resolveInkName(cardDef.color)
      if (name) colors.add(name)
    }
  }

  const cardList = Object.entries(cards)
    .map(([definitionId, { name, plays, inked, discarded }]) => ({
      definitionId,
      name,
      plays: Math.max(plays, 1),
      inked,
      discarded,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { cards: cardList, colors: Array.from(colors).sort() }
}

function parseLiveGame(data, cardLookup = { byId: {}, byName: {} }) {
  const game = data.game ?? data

  const defIdToName = {}
  const defIdToFullName = {}
  const logs = game.logs ?? []
  for (const log of logs) {
    for (const ref of (log.cardRefs ?? [])) {
      if (ref.id && ref.name) {
        defIdToName[ref.id] = ref.name
        defIdToFullName[ref.id] = ref.fullName ?? ref.name
      }
    }
  }
  for (const [id, card] of Object.entries(cardLookup.byId ?? {})) {
    if (card.name && !defIdToName[id]) defIdToName[id] = card.name
    if (!defIdToFullName[id]) defIdToFullName[id] = card.fullName ?? card.name
  }

  const p1 = game.player1 ?? {}
  const p2 = game.player2 ?? {}
  const names = game.playerNames ?? {}

  const p1Name = names.player1 ?? names['1'] ?? 'Player 1'
  const p2Name = names.player2 ?? names['2'] ?? 'Player 2'

  const enrichField = (field) => (field ?? []).map(card => ({
    ...card,
    name: defIdToName[card.definitionId] ?? card.name ?? card.definitionId,
    fullName: defIdToFullName[card.definitionId] ?? card.fullName ?? card.name ?? card.definitionId,
  }))

  const p1Field = enrichField(p1.field)
  const p2Field = enrichField(p2.field)

  const p1Observed = buildObservedDeck(logs, p1Field, 1, cardLookup)
  const p2Observed = buildObservedDeck(logs, p2Field, 2, cardLookup)

  const countInked = (n) => logs.filter(l => (l.player === n || l.player === String(n)) && l.type === 'CARD_INKED').length
  const p1InkedCount = countInked(1)
  const p2InkedCount = countInked(2)

  const p1InkPool = p1.inkCount ?? p1.inkAvailable ?? p1.inkPool ?? p1.ink ?? (p1InkedCount > 0 ? p1InkedCount : null)
  const p2InkPool = p2.inkCount ?? p2.inkAvailable ?? p2.inkPool ?? p2.ink ?? (p2InkedCount > 0 ? p2InkedCount : null)
  const p1InkUsed = p1.inkUsed ?? p1.inkSpent ?? null
  const p2InkUsed = p2.inkUsed ?? p2.inkSpent ?? null

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
  return `javascript:(function(){ var done=false; var origDesc=Object.getOwnPropertyDescriptor(WebSocket.prototype,'onmessage'); Object.defineProperty(WebSocket.prototype,'onmessage',{set:function(h){ var self=this; var wrapped=function(ev){ if(!done){ try{ var d=JSON.parse(ev.data); if(d.type==='spectator_update'&&d.game){ done=true; window.open('${origin}/game-scraper?uuid=${uuid}&data='+encodeURIComponent(JSON.stringify(d.game)),'_blank'); return; } }catch(e){} } if(h) h.call(self,ev); }; if(origDesc&&origDesc.set){ origDesc.set.call(this,wrapped); } else { this.addEventListener('message',wrapped); } }, get:function(){ return origDesc&&origDesc.get ? origDesc.get.call(this) : this._onmessage; }}); alert('Waiting for next game update...'); })();`
}

function ExtensionPanel({ active }) {
  const downloadUrl = `${window.location.origin}/lorcana-extension.zip`

  return (
    <details className="mt-2" open>
      <summary className="text-xs font-medium text-green-700 cursor-pointer select-none flex items-center gap-2">
        Chrome Extension {active && <span className="inline-block bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded-full">● Connected</span>}
      </summary>
      <div className="mt-2 space-y-3">
        <p className="text-xs text-gray-600">
          Install the Lorcana Game Scraper extension for automatic game capture. No setup per game — just visit a spectate link and the data loads automatically.
        </p>

        <div className="bg-green-50 border border-green-200 rounded p-3 space-y-2">
          <div className="text-xs font-semibold text-green-900">Installation:</div>
          <ol className="text-xs text-green-800 space-y-1 ml-4 list-decimal">
            <li><a href={downloadUrl} download className="text-green-700 hover:text-green-900 underline font-medium">Download the extension</a></li>
            <li>Extract the zip file</li>
            <li>Open <code className="bg-white px-1 rounded text-xs">chrome://extensions</code></li>
            <li>Turn on <strong>Developer mode</strong> (top-right toggle)</li>
            <li>Click <strong>Load unpacked</strong></li>
            <li>Select the extracted <code className="bg-white px-1 rounded text-xs">chrome-extension</code> folder</li>
          </ol>
        </div>

        <p className="text-xs text-gray-500 italic">
          Once installed, visiting any duels.ink spectate page automatically captures the game.
        </p>
      </div>
    </details>
  )
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

        {showSpecific && uuid && (
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

// --- Raw Payload Inspector (debug) ---

function RawPayloadInspector({ entry }) {
  const { game, meta, uuid, rawMessages } = entry
  const topLevelKeys = meta ? Object.keys(meta) : []
  const gameKeys = game ? Object.keys(game) : []

  return (
    <details className="mt-6 border border-dashed border-gray-300 rounded-lg p-4 text-xs text-gray-600">
      <summary className="cursor-pointer font-medium text-gray-700 select-none">
        Raw payload inspector — click to expand
        {topLevelKeys.length > 0 && (
          <span className="ml-2 text-amber-600">
            ({topLevelKeys.length} extra top-level field{topLevelKeys.length > 1 ? 's' : ''} outside game: {topLevelKeys.join(', ')})
          </span>
        )}
      </summary>
      <div className="mt-3 space-y-3">
        <div>
          <div className="font-semibold text-gray-700 mb-1">UUID</div>
          <code className="font-mono">{uuid}</code>
        </div>
        <div>
          <div className="font-semibold text-gray-700 mb-1">
            Top-level payload fields (outside <code>game</code>)
          </div>
          {topLevelKeys.length === 0
            ? <span className="text-gray-400 italic">none — only game field present</span>
            : <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(meta, null, 2)}
              </pre>
          }
        </div>
        <div>
          <div className="font-semibold text-gray-700 mb-1">
            Keys inside <code>game</code> ({gameKeys.length})
          </div>
          <div className="font-mono flex flex-wrap gap-1">
            {gameKeys.map(k => (
              <span key={k} className="bg-gray-100 rounded px-1">{k}</span>
            ))}
          </div>
        </div>
        {rawMessages?.length > 0 && (
          <div>
            <div className="font-semibold text-gray-700 mb-1">
              Incoming spectator_update messages (last {rawMessages.length})
            </div>
            <div className="overflow-auto max-h-64">
              <table className="font-mono text-xs border-collapse w-full">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="pr-3 py-0.5">Time</th>
                    <th className="pr-3 py-0.5">Prev logs</th>
                    <th className="pr-3 py-0.5">Incoming logs</th>
                    <th className="pr-3 py-0.5">Merged logs</th>
                    <th className="pr-3 py-0.5">First incoming</th>
                    <th className="pr-3 py-0.5">Last incoming</th>
                    <th className="pr-3 py-0.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rawMessages.map((m, i) => (
                    <tr key={i} className="border-t border-gray-100 align-top">
                      <td className="pr-3 py-0.5 whitespace-nowrap">{new Date(m.timestamp).toLocaleTimeString()}</td>
                      <td className="pr-3 py-0.5">{m.prevCount}</td>
                      <td className="pr-3 py-0.5">{m.incomingCount}</td>
                      <td className="pr-3 py-0.5">{m.mergedCount}</td>
                      <td className="pr-3 py-0.5 whitespace-nowrap">{m.firstIncoming ? `${m.firstIncoming.type} (turn ${m.firstIncoming.turn}, p${m.firstIncoming.player})` : '—'}</td>
                      <td className="pr-3 py-0.5 whitespace-nowrap">{m.lastIncoming ? `${m.lastIncoming.type} (turn ${m.lastIncoming.turn}, p${m.lastIncoming.player})` : '—'}</td>
                      <td className="pr-3 py-0.5">
                        {m.incomingLogs?.length > 0 && (
                          <details>
                            <summary className="cursor-pointer text-blue-600">logs</summary>
                            <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap break-all">
                              {JSON.stringify(m.incomingLogs, null, 2)}
                            </pre>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {game?.logs?.length > 0 && (
          <div>
            <details>
              <summary className="cursor-pointer font-semibold text-gray-700">
                Full accumulated log ({game.logs.length} entries)
              </summary>
              <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-96 font-mono whitespace-pre-wrap break-all mt-1">
                {JSON.stringify(game.logs, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </details>
  )
}

// --- Main Page ---

export function GameScraperPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeUuid, setActiveUuid] = useState(null)
  const [activeGames, setActiveGames] = useState({}) // uuid → { game, uuid, timestamp }
  const [rawGame, setRawGame] = useState(null)
  const [gameData, setGameData] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [cardLookup, setCardLookup] = useState({ byId: {}, byName: {} })
  const [extensionActive, setExtensionActive] = useState(false)
  const bookmarkletLogsRef = useRef({}) // uuid → accumulated logs (legacy bookmarklet protocol)

  useEffect(() => {
    const paramUuid = searchParams.get('uuid')
    if (paramUuid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveUuid(paramUuid)
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadCardData().then(lookup => setCardLookup(lookup))
  }, [])

  // Re-parse when cardLookup populates or selected game changes
  useEffect(() => {
    if (!rawGame) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGameData(parseLiveGame(rawGame.game, cardLookup))
  }, [rawGame, cardLookup])

  useEffect(() => {
    const handler = (event) => {
      // Extension: full active-games map (new protocol)
      if (event.data?.type === 'lorcana_active_games' && event.data?.games) {
        const games = event.data.games
        setExtensionActive(true)
        setActiveGames(games)

        // Auto-select: keep current selection if still live, else pick most recent
        setActiveUuid(prev => {
          const pick = prev && games[prev] ? prev
            : Object.values(games).sort((a, b) => b.timestamp - a.timestamp)[0]?.uuid ?? null
          return pick
        })
      }
      // Bookmarklet: single-game legacy protocol
      if (event.data?.type === 'lorcana_game_data' && event.data?.game) {
        const incomingUuid = event.data.uuid ?? `bookmarklet-${Date.now()}`
        setExtensionActive(true)
        const prevLogs = bookmarkletLogsRef.current[incomingUuid] ?? []
        const mergedLogs = mergeLogs(prevLogs, event.data.game.logs ?? [])
        bookmarkletLogsRef.current[incomingUuid] = mergedLogs
        const mergedGame = { ...event.data.game, logs: mergedLogs }
        setActiveGames(prev => ({
          ...prev,
          [incomingUuid]: { game: mergedGame, uuid: incomingUuid, timestamp: Date.now() },
        }))
        setActiveUuid(incomingUuid)
        setLastUpdated(new Date())
        const parsed = parseLiveGame(mergedGame, cardLookup)
        saveGame(incomingUuid, parsed).catch(e => console.error('Failed to save game:', e))
      }
    }
    window.addEventListener('message', handler)
    if (window.opener) window.opener.postMessage({ type: 'lorcana_ready' }, '*')
    return () => window.removeEventListener('message', handler)
  }, [cardLookup])

  // When the selected UUID or games map changes, update displayed game
  useEffect(() => {
    if (!activeUuid || !activeGames[activeUuid]) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRawGame({ game: activeGames[activeUuid].game, uuid: activeUuid })
    setLastUpdated(new Date(activeGames[activeUuid].timestamp))
  }, [activeUuid, activeGames])

  useEffect(() => {
    window.__gameData = gameData
  }, [gameData])

  const gameList = Object.values(activeGames).sort((a, b) => b.timestamp - a.timestamp)

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Game Scraper</h1>
        <p className="text-sm text-gray-500 mt-1">
          Open a duels.ink spectate tab to view live game state.
        </p>
      </div>

      <ExtensionPanel active={extensionActive} />
      <BookmarkletPanel uuid={activeUuid} />

      {gameList.length > 1 && (
        <div className="flex gap-2 my-4 flex-wrap">
          {gameList.map(({ uuid, game }) => {
            const g = parseLiveGame(game, cardLookup)
            const label = g.p1Name && g.p2Name ? `${g.p1Name} vs ${g.p2Name}` : uuid.slice(0, 8)
            const isActive = uuid === activeUuid
            return (
              <button
                key={uuid}
                onClick={() => setActiveUuid(uuid)}
                className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                  isActive
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-900'
                }`}
              >
                {label}
                {g.winner == null && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-400 align-middle" title="Live" />}
              </button>
            )
          })}
        </div>
      )}

      {gameData && <GameView game={gameData} lastUpdated={lastUpdated} uuid={activeUuid} />}

      {activeUuid && activeGames[activeUuid] && (
        <RawPayloadInspector entry={activeGames[activeUuid]} />
      )}

      {!gameData && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-sm">
            {extensionActive
              ? 'Extension connected — open a duels.ink spectate page to load a game.'
              : 'Waiting for game data… open a duels.ink spectate page with the extension installed.'}
          </div>
        </div>
      )}
    </div>
  )
}
