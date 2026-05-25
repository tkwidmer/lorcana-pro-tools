import { useState } from 'react'

function PlayerCard({ player, onLore, onNameChange }) {
  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={player.name}
        onChange={(e) => onNameChange(e.target.value)}
        className="border border-gray-200 rounded px-3 py-2 text-sm font-semibold text-gray-900 focus:outline-none focus:border-gray-500 text-center"
        placeholder="Player name"
      />
      <div
        className="relative border border-gray-200 rounded-lg overflow-hidden select-none"
        style={{ minHeight: '260px' }}
      >
        <div className="absolute inset-0 flex">
          <div
            onClick={() => onLore(-1)}
            className="w-1/2 bg-red-50 hover:bg-red-100 active:bg-red-200 cursor-pointer flex items-center justify-start pl-3 text-red-300 text-3xl leading-none transition-colors"
          >
            −
          </div>
          <div
            onClick={() => onLore(1)}
            className="w-1/2 bg-green-50 hover:bg-green-100 active:bg-green-200 cursor-pointer flex items-center justify-end pr-3 text-green-300 text-3xl leading-none transition-colors"
          >
            +
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-7xl sm:text-8xl font-black text-gray-900 tabular-nums">
            {player.lore}
          </span>
        </div>
      </div>
    </div>
  )
}

export function LoreTrackerPage() {
  const [player1, setPlayer1] = useState({ name: 'Player 1', lore: 0 })
  const [player2, setPlayer2] = useState({ name: 'Player 2', lore: 0 })
  const [auditLog, setAuditLog] = useState([])

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

  const formatTime = (date) =>
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lore Tracker</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tap left to decrease, tap right to increase
          </p>
        </div>
        <button
          onClick={handleReset}
          className="border border-gray-200 rounded px-3 py-2 text-sm text-red-600 hover:border-red-200 hover:bg-red-50 active:bg-red-100 transition-colors"
        >
          Reset
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-6 mb-6">
        <PlayerCard
          player={player1}
          onLore={(d) => updateLore(1, d)}
          onNameChange={(n) => updateName(1, n)}
        />
        <PlayerCard
          player={player2}
          onLore={(d) => updateLore(2, d)}
          onNameChange={(n) => updateName(2, n)}
        />
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Audit Log
          </h2>
        </div>
        <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
          {auditLog.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400 italic">No changes yet</p>
          ) : (
            [...auditLog].reverse().map((entry, idx) => (
              <div key={idx} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className="text-gray-400 font-mono text-xs tabular-nums shrink-0">
                  {formatTime(entry.timestamp)}
                </span>
                {entry.player === 'SYSTEM' ? (
                  <span className="text-gray-500">Game reset</span>
                ) : (
                  <>
                    <span className="font-medium text-gray-900 truncate">{entry.player}</span>
                    <span className="text-gray-400 tabular-nums shrink-0">
                      {entry.from} → {entry.to}
                    </span>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
