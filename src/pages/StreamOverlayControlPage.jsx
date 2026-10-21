import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { MAX_GAME_WINS, channelName } from '../lib/streamOverlay'

// The players' controller: a tablet at the table, one half per player, that
// only moves lore and game wins. It never publishes state — each tap sends an
// `adjust` delta that the control panel applies and re-broadcasts, so taps
// can't be lost to a stale echo and the panel stays the one source of truth.
// What it shows is the panel's state (the heartbeat brings it up to date
// within seconds of opening), so it needs the panel open. Unguarded like the
// OBS view: the random channel id in the link is all that ties it to a stream.
export function StreamOverlayControlPage() {
  const [searchParams] = useSearchParams()
  const channelId = searchParams.get('channel') ?? ''
  const [channel, setChannel] = useState(null)
  const [state, setState] = useState(null)

  useEffect(() => {
    const ch = supabase.channel(channelName(channelId))
    ch.on('broadcast', { event: 'state' }, ({ payload }) => setState(payload))
      .subscribe(status => setChannel(status === 'SUBSCRIBED' ? ch : null))
    return () => { supabase.removeChannel(ch) }
  }, [channelId])

  function adjust(player, field, delta) {
    channel.send({ type: 'broadcast', event: 'adjust', payload: { player, field, delta } })
  }

  if (!state || !channel) {
    return (
      <div className="h-screen grid place-items-center font-display text-2xl uppercase tracking-widest text-gray-500 text-center px-6">
        Waiting for the Stream Overlay control panel…
      </div>
    )
  }

  return (
    <div className="h-screen flex select-none">
      {state.players.map((player, i) => (
        <div key={i} className={`flex-1 flex flex-col items-center p-4 gap-4 ${i === 0 ? 'border-r border-gray-200' : ''}`}>
          <div className="font-display text-3xl uppercase tracking-wide text-gray-900 truncate max-w-full">{player.name}</div>

          <div className="flex items-center gap-3" aria-label={`${player.gameWins} game wins`}>
            <TapButton label="Game win minus one" onClick={() => adjust(i, 'gameWins', -1)} small>−</TapButton>
            {Array.from({ length: MAX_GAME_WINS }, (_, w) => (
              <svg key={w} viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
                <path d="M12 2l10 10-10 10L2 12z" className={w < player.gameWins ? 'fill-forge stroke-forge' : 'fill-transparent stroke-gray-400'} strokeWidth="2" />
              </svg>
            ))}
            <TapButton label="Game win plus one" onClick={() => adjust(i, 'gameWins', 1)} small>+</TapButton>
          </div>

          <div className="flex-1 w-full flex items-stretch gap-3 min-h-0">
            <TapButton label="Lore minus one" onClick={() => adjust(i, 'lore', -1)}>−</TapButton>
            <div className="flex-1 grid place-items-center">
              <div className="text-center">
                <div className="text-sm font-display uppercase tracking-[0.3em] text-gray-500">Lore</div>
                <div className="font-display text-[10rem] leading-none text-forge-ink tabular-nums">{player.lore}</div>
              </div>
            </div>
            <TapButton label="Lore plus one" onClick={() => adjust(i, 'lore', 1)}>+</TapButton>
          </div>
        </div>
      ))}
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
