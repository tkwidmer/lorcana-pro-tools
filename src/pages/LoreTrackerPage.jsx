import { useState } from 'react'

export function LoreTrackerPage() {
  const [player1, setPlayer1] = useState({ name: 'Player 1', lore: 0 })
  const [player2, setPlayer2] = useState({ name: 'Player 2', lore: 0 })
  const [auditLog, setAuditLog] = useState([])

  const updateLore = (playerNum, delta) => {
    const isPlayer1 = playerNum === 1
    const player = isPlayer1 ? player1 : player2
    const newLore = Math.max(0, Math.min(20, player.lore + delta))

    if (newLore !== player.lore) {
      setAuditLog(prev => [...prev, {
        timestamp: new Date(),
        player: player.name,
        from: player.lore,
        to: newLore
      }])

      if (isPlayer1) {
        setPlayer1({ ...player1, lore: newLore })
      } else {
        setPlayer2({ ...player2, lore: newLore })
      }
    }
  }

  const handleReset = () => {
    if (confirm('Reset lore totals to 0?')) {
      setPlayer1({ ...player1, lore: 0 })
      setPlayer2({ ...player2, lore: 0 })
      setAuditLog(prev => [...prev, {
        timestamp: new Date(),
        player: 'SYSTEM',
        from: '-',
        to: 'RESET'
      }])
    }
  }

  const updateName = (playerNum, newName) => {
    if (playerNum === 1) {
      setPlayer1({ ...player1, name: newName })
    } else {
      setPlayer2({ ...player2, name: newName })
    }
  }

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-3xl font-bold">Lore Tracker</h1>
        <button
          onClick={handleReset}
          className="px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 rounded font-semibold text-sm sm:text-base transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Players Container */}
      <div className="flex-1 grid grid-cols-2 gap-2 sm:gap-6 mb-4 sm:mb-6">
        {/* Player 1 */}
        <div className="flex flex-col">
          <input
            type="text"
            value={player1.name}
            onChange={(e) => updateName(1, e.target.value)}
            className="bg-slate-700 hover:bg-slate-600 text-white text-center mb-2 sm:mb-4 p-2 rounded font-semibold text-sm sm:text-base transition-colors"
            placeholder="Player 1"
          />
          <div className="flex-1 relative rounded-lg overflow-hidden shadow-lg" style={{ minHeight: '280px' }}>
            <div className="absolute inset-0 flex">
              <div
                onClick={() => updateLore(1, -1)}
                className="w-1/2 bg-red-700 hover:bg-red-600 active:bg-red-800 cursor-pointer transition-colors"
              />
              <div
                onClick={() => updateLore(1, 1)}
                className="w-1/2 bg-green-700 hover:bg-green-600 active:bg-green-800 cursor-pointer transition-colors"
              />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-6xl sm:text-8xl font-black drop-shadow-lg">{player1.lore}</div>
            </div>
          </div>
        </div>

        {/* Player 2 */}
        <div className="flex flex-col">
          <input
            type="text"
            value={player2.name}
            onChange={(e) => updateName(2, e.target.value)}
            className="bg-slate-700 hover:bg-slate-600 text-white text-center mb-2 sm:mb-4 p-2 rounded font-semibold text-sm sm:text-base transition-colors"
            placeholder="Player 2"
          />
          <div className="flex-1 relative rounded-lg overflow-hidden shadow-lg" style={{ minHeight: '280px' }}>
            <div className="absolute inset-0 flex">
              <div
                onClick={() => updateLore(2, -1)}
                className="w-1/2 bg-red-700 hover:bg-red-600 active:bg-red-800 cursor-pointer transition-colors"
              />
              <div
                onClick={() => updateLore(2, 1)}
                className="w-1/2 bg-green-700 hover:bg-green-600 active:bg-green-800 cursor-pointer transition-colors"
              />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-6xl sm:text-8xl font-black drop-shadow-lg">{player2.lore}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Log */}
      <div className="bg-slate-800 rounded-lg p-3 sm:p-4 max-h-48 sm:max-h-64 overflow-y-auto border border-slate-700">
        <h2 className="text-base sm:text-lg font-bold mb-2 sm:mb-3 sticky top-0 bg-slate-800">Audit Log</h2>
        <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
          {auditLog.length === 0 ? (
            <p className="text-slate-400">No changes yet</p>
          ) : (
            [...auditLog].reverse().map((entry, idx) => (
              <div key={idx} className="text-slate-300 font-mono">
                <span className="text-slate-500">{formatTime(entry.timestamp)}</span>
                {entry.player === 'SYSTEM' ? (
                  <span className="ml-2">— <strong className="text-yellow-400">RESET</strong></span>
                ) : (
                  <span className="ml-2">— <strong>{entry.player}</strong>: <span className="text-red-400">{entry.from}</span> → <span className="text-green-400">{entry.to}</span></span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
