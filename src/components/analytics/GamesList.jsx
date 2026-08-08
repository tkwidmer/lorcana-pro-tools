import { InkIcon as InkImg } from '../InkIcons'
import { createGameExportZip } from '../../lib/gameExport'

export function DecklistDisplay({ decklist, cardIdToName }) {
  const entries = [...decklist].sort((a, b) =>
    b.count - a.count || (cardIdToName[a.cardId] ?? a.cardId).localeCompare(cardIdToName[b.cardId] ?? b.cardId)
  )
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-0.5">
      {entries.map(({ cardId, count }) => (
        <div key={cardId} className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-xs text-gray-400 flex-shrink-0 w-4 text-right">{count}×</span>
          <span className="text-xs text-gray-800 truncate">{cardIdToName[cardId] ?? cardId}</span>
        </div>
      ))}
    </div>
  )
}

export function GamesList({ games, userIdToLabel = {}, onDelete, activeId, onSelect }) {
  return (
    <div className="space-y-1">
      {games.map(g => (
        <GameListItem key={g.id} game={g} playerLabel={g.userId ? userIdToLabel[g.userId] : undefined} onDelete={onDelete} isActive={g.id === activeId} onSelect={onSelect} />
      ))}
    </div>
  )
}

function GameListItem({ game, playerLabel, onDelete, isActive, onSelect }) {
  const p1Name = game.p1Name || 'Player 1'
  const p2Name = game.p2Name || 'Player 2'
  const myNum = game.myPlayerNum
  const myDisplayLabel = playerLabel ?? (myNum === 1 ? p1Name : myNum === 2 ? p2Name : p1Name)
  const oppDisplayLabel = myNum === 1 ? p2Name : myNum === 2 ? p1Name : p2Name
  const myColors = game.myInkCombo ?? []
  const oppColors = game.oppInkCombo ?? []
  const won = myNum != null && (game.winner === myNum || game.winner === String(myNum))

  return (
    <div
      onClick={() => onSelect?.(game.id)}
      className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${onSelect ? 'cursor-pointer' : ''} ${isActive ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}
    >
      {myNum != null && (
        <span className={`text-[10px] font-bold w-6 text-center flex-shrink-0 ${isActive ? (won ? 'text-emerald-400' : 'text-red-400') : (won ? 'text-emerald-600' : 'text-red-500')}`}>
          {won ? 'W' : 'L'}
        </span>
      )}
      <span className="flex items-center gap-1 font-medium text-sm flex-1 min-w-0">
        <span className="truncate">{myDisplayLabel}</span>
        {myColors.length > 0 && (
          <span className="flex items-center gap-0.5 flex-shrink-0">
            {myColors.map(c => <InkImg key={c} color={c} size="w-4 h-4" />)}
          </span>
        )}
        <span className={`text-xs flex-shrink-0 ${isActive ? 'text-gray-400' : 'text-gray-400'}`}>vs</span>
        <span className="truncate">{oppDisplayLabel}</span>
        {oppColors.length > 0 && (
          <span className="flex items-center gap-0.5 flex-shrink-0">
            {oppColors.map(c => <InkImg key={c} color={c} size="w-4 h-4" />)}
          </span>
        )}
      </span>
      <span className={`text-xs flex-shrink-0 ${isActive ? 'opacity-60' : 'text-gray-400'}`}>{game.turnCount}T</span>
      <span className={`text-xs flex-shrink-0 ${isActive ? 'opacity-60' : 'text-gray-400'}`}>{new Date(game.playedAt ?? game.savedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
      <button
        onClick={(e) => { e.stopPropagation(); createGameExportZip([game], `lorcana-${game.id}`) }}
        className="text-xs opacity-40 hover:opacity-100 transition-opacity flex-shrink-0"
        title="Export game"
      >⬇</button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(game.id) }}
        className="text-xs opacity-40 hover:opacity-100 transition-opacity flex-shrink-0"
        title="Delete game"
      >✕</button>
    </div>
  )
}
