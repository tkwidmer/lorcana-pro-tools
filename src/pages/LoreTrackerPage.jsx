import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const STORAGE_KEY = 'lorcana_lore_tracker'

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const state = JSON.parse(raw)
    return {
      ...state,
      auditLog: state.auditLog.map(e => ({ ...e, timestamp: new Date(e.timestamp) }))
    }
  } catch {
    return null
  }
}

function saveState(player1, player2, auditLog) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ player1, player2, auditLog }))
  } catch {
    // ignore quota errors
  }
}

function PlayerCard({ player, onLore, onNameChange, flipped }) {
  return (
    <div className={`flex-1 flex flex-col border border-gray-200 rounded-lg overflow-hidden min-h-0${flipped ? ' rotate-180' : ''}`}>
      <input
        type="text"
        value={player.name}
        onChange={(e) => onNameChange(e.target.value)}
        className="shrink-0 border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 text-center focus:outline-none focus:bg-gray-50 bg-white"
        placeholder="Player name"
      />
      <div className="flex-1 relative select-none min-h-0">
        <div className="absolute inset-0 flex">
          <div
            onClick={() => onLore(-1)}
            className="w-1/2 bg-red-50 hover:bg-red-100 active:bg-red-200 cursor-pointer transition-colors"
          />
          <div
            onClick={() => onLore(1)}
            className="w-1/2 bg-green-50 hover:bg-green-100 active:bg-green-200 cursor-pointer transition-colors"
          />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-8xl font-black text-gray-900 tabular-nums">{player.lore}</span>
        </div>
        <div className="absolute bottom-2 left-0 right-0 flex justify-between px-4 pointer-events-none">
          <span className="text-red-300 text-sm font-medium">− less</span>
          <span className="text-green-300 text-sm font-medium">more +</span>
        </div>
      </div>
    </div>
  )
}

function AuditModal({ auditLog, onClose }) {
  const formatTime = (date) =>
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-gray-200 max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">
            Audit Log {auditLog.length > 0 && <span className="text-gray-400 font-normal">({auditLog.length})</span>}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none px-1"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {auditLog.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 italic text-center">No changes yet</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {[...auditLog].reverse().map((entry, idx) => (
                <div key={idx} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                  <span className="text-gray-400 font-mono text-xs tabular-nums shrink-0">
                    {formatTime(entry.timestamp)}
                  </span>
                  {entry.player === 'SYSTEM' ? (
                    <span className="text-gray-500">Game reset</span>
                  ) : (
                    <>
                      <span className="font-medium text-gray-900 truncate">{entry.player}</span>
                      <span className="text-gray-400 tabular-nums shrink-0 ml-auto">
                        {entry.from} → {entry.to}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function LoreTrackerPage() {
  const navigate = useNavigate()
  const saved = loadState()
  const [player1, setPlayer1] = useState(saved?.player1 ?? { name: 'Player 1', lore: 0 })
  const [player2, setPlayer2] = useState(saved?.player2 ?? { name: 'Player 2', lore: 0 })
  const [auditLog, setAuditLog] = useState(saved?.auditLog ?? [])
  const [auditOpen, setAuditOpen] = useState(false)

  useEffect(() => {
    saveState(player1, player2, auditLog)
  }, [player1, player2, auditLog])

  const updateLore = (playerNum, delta) => {
    const isP1 = playerNum === 1
    const player = isP1 ? player1 : player2
    const newLore = Math.max(0, Math.min(20, player.lore + delta))

    if (newLore === player.lore) return

    setAuditLog(prev => [...prev, {
      timestamp: new Date(),
      player: player.name,
      from: player.lore,
      to: newLore
    }])

    if (isP1) setPlayer1({ ...player1, lore: newLore })
    else setPlayer2({ ...player2, lore: newLore })
  }

  const handleReset = () => {
    if (!confirm('Reset both lore totals to 0?')) return
    setPlayer1({ ...player1, lore: 0 })
    setPlayer2({ ...player2, lore: 0 })
    setAuditLog(prev => [...prev, {
      timestamp: new Date(),
      player: 'SYSTEM',
      from: null,
      to: null
    }])
  }

  const updateName = (playerNum, name) => {
    if (playerNum === 1) setPlayer1({ ...player1, name })
    else setPlayer2({ ...player2, name })
  }

  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-white">
      {/* Compact header */}
      <header className="shrink-0 border-b border-gray-200 px-4 py-2.5 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1"
        >
          ← Back
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setAuditOpen(true)}
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors border border-gray-200 rounded px-3 py-1.5 hover:border-gray-400"
        >
          Audit{auditLog.length > 0 && ` (${auditLog.length})`}
        </button>
        <button
          onClick={handleReset}
          className="text-sm text-red-600 hover:text-red-800 transition-colors border border-gray-200 rounded px-3 py-1.5 hover:border-red-200 hover:bg-red-50"
        >
          Reset
        </button>
      </header>

      {/* Player cards fill remaining height */}
      <div className="flex-1 flex flex-col gap-2 p-3 min-h-0">
        <PlayerCard
          player={player1}
          onLore={(d) => updateLore(1, d)}
          onNameChange={(n) => updateName(1, n)}
          flipped
        />
        <PlayerCard
          player={player2}
          onLore={(d) => updateLore(2, d)}
          onNameChange={(n) => updateName(2, n)}
        />
      </div>

      {auditOpen && (
        <AuditModal auditLog={auditLog} onClose={() => setAuditOpen(false)} />
      )}
    </div>
  )
}
