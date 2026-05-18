import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { resolveInkName } from '../lib/inkColors'
import { saveGame } from '../lib/gameHistory'
import { GameView } from '../components/GameView'

// Cache for card data (name -> { color, etc })
let cardDataCache = null
async function loadCardData() {
  if (cardDataCache) return cardDataCache
  try {
    const res = await fetch('/api/cards')
    if (!res.ok) return {}
    const data = await res.json()
    const cards = data.cards ?? []
    const lookup = {}
    for (const card of cards) {
      if (card.fullName) lookup[card.fullName] = { color: card.color, name: card.name, fullName: card.fullName }
      if (card.name) lookup[card.name] = { color: card.color, name: card.name, fullName: card.fullName }
    }
    cardDataCache = lookup
    return lookup
  } catch (e) {
    console.error('Failed to load card data:', e)
    return {}
  }
}

function buildObservedDeck(logs, fieldCards, playerNum, cardLookup) {
  const RELEVANT_ACTIONS = new Set(['CARD_PLAYED', 'CARD_INKED', 'CARD_DISCARDED', 'CARD_DRAWN'])
  const cards = {}
  const colors = new Set()

  for (const log of logs) {
    if (log.player !== playerNum && log.player !== String(playerNum)) continue
    if (!RELEVANT_ACTIONS.has(log.type)) continue

    for (const ref of (log.cardRefs ?? [])) {
      if (!ref.id || !ref.name) continue
      if (!cards[ref.id]) {
        cards[ref.id] = { name: ref.name, plays: 0, inked: 0, discarded: 0 }
      }
      if (log.type === 'CARD_PLAYED') cards[ref.id].plays++
      else if (log.type === 'CARD_INKED') cards[ref.id].inked++
      else if (log.type === 'CARD_DISCARDED') cards[ref.id].discarded++

      const cardDef = cardLookup[ref.name]
      if (cardDef?.color) {
        const name = resolveInkName(cardDef.color)
        if (name) colors.add(name)
      }
    }
  }

  for (const card of fieldCards) {
    if (!card.definitionId) continue
    if (!cards[card.definitionId]) {
      cards[card.definitionId] = { name: card.name ?? card.definitionId, plays: 0, inked: 0, discarded: 0 }
    }
    const cardDef = cardLookup[card.fullName] || cardLookup[card.name]
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

function parseLiveGame(data, cardLookup = {}) {
  const game = data.game ?? data

  const defIdToName = {}
  const logs = game.logs ?? []
  for (const log of logs) {
    for (const ref of (log.cardRefs ?? [])) {
      if (ref.id && ref.name) defIdToName[ref.id] = ref.name
    }
  }
  for (const [id, card] of Object.entries(cardLookup)) {
    if (card.name && !defIdToName[id]) defIdToName[id] = card.name
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

// --- Main Page ---

export function GameScraperPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [uuid, setUuid] = useState(null)
  const [gameData, setGameData] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [cardLookup, setCardLookup] = useState({})
  const [extensionActive, setExtensionActive] = useState(false)

  useEffect(() => {
    const paramUuid = searchParams.get('uuid')
    if (paramUuid) {
      setUuid(paramUuid)
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadCardData().then(lookup => setCardLookup(lookup))
  }, [])

  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type === 'lorcana_game_data' && event.data?.game) {
        setExtensionActive(true)
        // Extension sends the UUID from the spectate URL — use it if we don't have one
        const incomingUuid = event.data.uuid ?? null
        if (incomingUuid && !uuid) setUuid(incomingUuid)
        const activeUuid = uuid || incomingUuid
        const parsed = parseLiveGame(event.data.game, cardLookup)
        setGameData(parsed)
        setLastUpdated(new Date())
        if (activeUuid) saveGame(activeUuid, parsed).catch(e => console.error('Failed to save game:', e))
      }
    }
    window.addEventListener('message', handler)
    if (window.opener) {
      window.opener.postMessage({ type: 'lorcana_ready' }, '*')
    }
    return () => window.removeEventListener('message', handler)
  }, [cardLookup, uuid])

  useEffect(() => {
    window.__gameData = gameData
  }, [gameData])

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Game Scraper</h1>
        <p className="text-sm text-gray-500 mt-1">
          Paste a duels.ink spectate URL to view live game state. You must be logged into duels.ink in this browser.
        </p>
      </div>

      <ExtensionPanel active={extensionActive} />
      <BookmarkletPanel uuid={uuid} />

      {gameData && <GameView game={gameData} lastUpdated={lastUpdated} uuid={uuid} />}

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
