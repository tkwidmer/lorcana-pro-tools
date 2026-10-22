import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchPublicTable, subscribeToTable, adjustTable, resetLore } from '../lib/streamTables'
import { MAX_GAME_WINS, rowToState, timerRemainingMs, formatClock } from '../lib/streamOverlay'

// The players' controller: a tablet at the table, one half per player, that
// only moves lore and game wins. Each tap calls adjust_stream_table, an
// atomic ±1 in the database gated by the controller key in the link, so two
// writers can never lose a tap; what it shows is the row, kept live by the
// same broadcast the OBS view listens to. Needs nothing else open.
// Unguarded like the OBS view: the id and key in the link are all that tie
// it to a stream, and the view link carries no key.
export function StreamOverlayControlPage() {
  const [searchParams] = useSearchParams()
  const tableId = searchParams.get('table') ?? ''
  const key = searchParams.get('key') ?? ''
  const [row, setRow] = useState(null)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  // The round clock is a wall-time target on the row, so it ticks here too.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    fetchPublicTable(tableId).then(setRow).catch(e => setError(e.message))
    return subscribeToTable(tableId, setRow)
  }, [tableId])

  function adjust(side, field, delta) {
    adjustTable(tableId, key, side, field, delta).catch(e => setError(e.message))
  }

  // "Next game" zeroes both lore counts, so it takes two taps within a few
  // seconds: a stray tap mid-game shouldn't wipe the score.
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(id)
  }, [armed])
  function nextGame() {
    if (!armed) { setArmed(true); return }
    setArmed(false)
    resetLore(tableId, key).catch(e => setError(e.message))
  }

  if (!row) {
    return (
      <div className="h-screen grid place-items-center font-display text-2xl uppercase tracking-widest text-gray-500 text-center px-6">
        {error ?? 'Loading the stream table…'}
      </div>
    )
  }

  const state = rowToState(row)
  const { players } = state
  const remaining = timerRemainingMs(state, now)

  return (
    <div className="h-screen flex flex-col select-none">
      {error && <div className="shrink-0 bg-red-50 text-red-700 text-sm text-center py-1">{error}</div>}
      <div className="shrink-0 grid grid-cols-3 items-center px-6 py-3 border-b border-gray-200">
        <div className="font-display uppercase tracking-wide text-gray-500 truncate">{state.round}</div>
        <button
          type="button"
          onClick={nextGame}
          className={`justify-self-center font-display uppercase tracking-wider text-lg px-8 py-3 rounded border ${armed ? 'bg-forge text-on-forge border-forge' : 'bg-white text-gray-900 border-gray-300 hover:bg-gray-100 active:bg-gray-200'}`}
        >
          {armed ? 'Tap again to reset lore to 0' : 'Next game'}
        </button>
        <div className="text-right">
          <span className="font-display uppercase tracking-[0.3em] text-xs text-gray-500 mr-3">Time left</span>
          <span className={`font-display text-3xl tabular-nums ${state.timerEndsAt !== null && remaining < 5 * 60 * 1000 ? 'text-red-600' : 'text-gray-900'}`}>{formatClock(remaining)}</span>
        </div>
      </div>
      <div className="flex-1 flex min-h-0">
      {players.map((player, i) => (
        <div key={i} className={`flex-1 flex flex-col items-center p-4 gap-4 ${i === 0 ? 'border-r border-gray-200' : ''}`}>
          <div className="font-display text-3xl uppercase tracking-wide text-gray-900 truncate max-w-full">{player.name}</div>

          <div className="flex items-center gap-3" aria-label={`${player.gameWins} game wins`}>
            <TapButton label="Game win minus one" onClick={() => adjust(i + 1, 'game_wins', -1)} small>−</TapButton>
            {Array.from({ length: MAX_GAME_WINS }, (_, w) => (
              <svg key={w} viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
                <path d="M12 2l10 10-10 10L2 12z" className={w < player.gameWins ? 'fill-forge stroke-forge' : 'fill-transparent stroke-gray-400'} strokeWidth="2" />
              </svg>
            ))}
            <TapButton label="Game win plus one" onClick={() => adjust(i + 1, 'game_wins', 1)} small>+</TapButton>
          </div>

          <div className="flex-1 w-full flex items-stretch gap-3 min-h-0">
            <TapButton label="Lore minus one" onClick={() => adjust(i + 1, 'lore', -1)}>−</TapButton>
            <div className="flex-1 grid place-items-center">
              <div className="text-center">
                <div className="text-sm font-display uppercase tracking-[0.3em] text-gray-500">Lore</div>
                <div className="font-display text-[10rem] leading-none text-forge-ink tabular-nums">{player.lore}</div>
              </div>
            </div>
            <TapButton label="Lore plus one" onClick={() => adjust(i + 1, 'lore', 1)}>+</TapButton>
          </div>
        </div>
      ))}
      </div>
    </div>
  )
}

function TapButton({ label, onClick, small = false, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`font-display text-gray-900 bg-white border border-gray-300 rounded hover:bg-gray-100 active:bg-gray-200 ${small ? 'w-14 h-14 text-3xl' : 'w-24 text-6xl'}`}
    >
      {children}
    </button>
  )
}
