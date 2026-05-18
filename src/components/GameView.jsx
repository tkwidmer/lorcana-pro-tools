import { useState } from 'react'
import { resolveColors } from '../lib/inkColors'
import { HandPredictor } from './HandPredictor'

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
  const resolved = resolveColors(colors)
  if (!resolved.length) return null
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-gray-600">Ink:</span>
      <div className="flex gap-1">
        {resolved.map((inkName) => (
          <img key={inkName} src={`/ink/${inkName}.png`} alt={inkName} className="w-5 h-5" title={inkName} />
        ))}
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

function PlayerPanel({ name, lore, handCount, deckCount, field, observedDeck, loreColor, isActive, inkPool, inkUsed, inkedCount, inkColors }) {
  return (
    <div className={`bg-white rounded-xl border-2 p-4 flex flex-col gap-3 ${isActive ? 'border-blue-400 shadow-md' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2">
        {isActive && <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0 animate-pulse" />}
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
      <HandPredictor
        playerName={name}
        inkColors={inkColors}
        observedDeck={observedDeck}
        handCount={handCount}
        deckCount={deckCount}
      />
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
  const resolvedColors = resolveColors(playerColors)

  return (
    <div className="flex gap-2 py-1 text-xs border-b border-gray-50 last:border-0 items-center">
      {resolvedColors.length > 0 && (
        <div className="flex gap-0.5">
          {resolvedColors.map((inkName) => (
            <img key={inkName} src={`/ink/${inkName}.png`} alt={inkName} className="w-4 h-4 flex-shrink-0" title={inkName} />
          ))}
        </div>
      )}
      <span className="text-gray-400 flex-shrink-0 w-12">T{turnNumber ?? '?'} P{player ?? '?'}</span>
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

function GameLog({ game }) {
  if (!game.log?.length) return null

  const grouped = {}
  game.log.forEach(entry => {
    const turn = entry.turnNumber ?? 0
    if (!grouped[turn]) grouped[turn] = {}
    const player = entry.player ?? 'unknown'
    if (!grouped[turn][player]) grouped[turn][player] = []
    grouped[turn][player].push(entry)
  })

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
      <h3 className="text-sm font-bold text-gray-700 mb-2">Game Actions ({game.log.length})</h3>
      <div className="max-h-96 overflow-y-auto">
        {Object.entries(grouped)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .map(([turn, playerActions], turnIdx) => (
            <div key={turn}>
              {turnIdx > 0 && <div className="border-t-2 border-gray-300 my-2" />}
              <div className="text-xs font-bold text-gray-500 uppercase bg-gray-50 px-2 py-1 mb-1 rounded">
                Turn {turn}
              </div>
              {Object.entries(playerActions).map(([player, entries], playerIdx) => (
                <div key={`${turn}-${player}`}>
                  {playerIdx > 0 && <div className="border-t border-gray-200 my-1" />}
                  {entries.map((entry, i) => {
                    const playerColors = entry.player === 1 || entry.player === '1'
                      ? game.p1InkColors
                      : entry.player === 2 || entry.player === '2'
                      ? game.p2InkColors
                      : []
                    return <LogEntry key={i} entry={entry} playerColors={playerColors} />
                  })}
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  )
}

export function GameView({ game, lastUpdated, headerExtra }) {
  const [showRaw, setShowRaw] = useState(false)
  if (!game) return null

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mt-6 mb-4 text-sm">
        <StatusBadge status={game.status} winner={game.winner} />
        {game.currentTurn != null && (
          <span className="text-gray-500">Turn <span className="font-semibold text-gray-800">{game.currentTurn}</span></span>
        )}
        {headerExtra}
        {lastUpdated && (
          <span className="text-gray-400 text-xs ml-auto">Updated {lastUpdated.toLocaleTimeString()}</span>
        )}
      </div>

      {game.winner != null && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6 text-center">
          <div className="text-purple-800 font-bold">
            {game.winner === 1 ? game.p1Name : game.winner === 2 ? game.p2Name : `Player ${game.winner}`} wins!
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 items-start">
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
          loreColor="bg-blue-400"
          isActive={game.activePlayer === 2 || game.activePlayer === '2'}
          inkPool={game.p2InkPool}
          inkUsed={game.p2InkUsed}
          inkedCount={game.p2InkedCount}
          inkColors={game.p2InkColors}
        />
      </div>

      <GameLog game={game} />

      <div>
        <button
          onClick={() => setShowRaw(r => !r)}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          {showRaw ? 'Hide' : 'Show'} raw response
        </button>
        {showRaw && (
          <pre className="mt-2 text-xs bg-gray-50 border border-gray-200 rounded-xl p-4 overflow-auto max-h-96 font-mono text-gray-600">
            {JSON.stringify(game.raw ?? game, null, 2)}
          </pre>
        )}
      </div>
    </>
  )
}
