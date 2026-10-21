import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useTransparentBackground } from '../hooks/useTransparentBackground'
import { InkIcon } from '../components/InkIcons'
import {
  OVERLAY_WIDTH, OVERLAY_HEIGHT, MAX_GAME_WINS, channelName, timerRemainingMs, formatClock,
} from '../lib/streamOverlay'

const SIDE_WIDTH = 320
// Square cutout: tall enough for a portrait player cam, and the operator
// positions the camera source behind it in OBS.
const CAM_HEIGHT = SIDE_WIDTH

// The single OBS Browser Source for a gameplay stream: a 1920×1080 frame with
// opaque side columns (square player cam cutout, name, record, inks, game-win pips,
// lore) and a top banner (event logo, round, timer), everything else
// transparent so the gameplay cam and player cams sit behind it. It carries no
// state of its own — the control panel at /stream-overlay publishes the whole
// state over a Supabase Broadcast channel and this just renders the latest
// payload. Unguarded (see App.jsx): a Browser Source has no Supabase session
// and the view exposes nothing but what the panel operator typed in.
export function StreamOverlayViewPage() {
  useTransparentBackground()
  const [searchParams] = useSearchParams()
  const channelId = searchParams.get('channel') ?? ''
  const [state, setState] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const channel = supabase.channel(channelName(channelId))
    channel.on('broadcast', { event: 'state' }, ({ payload }) => setState(payload)).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [channelId])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className="relative overflow-hidden font-display text-on-ink select-none"
      style={{ width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT }}
    >
      {!state && (
        <div className="absolute inset-x-0 top-1/2 text-center text-2xl uppercase tracking-widest text-on-ink/70">
          Waiting for the Stream Overlay control panel…
        </div>
      )}
      {state && (
        <>
          <SideColumn player={state.players[0]} side="left" />
          <SideColumn player={state.players[1]} side="right" />
          <TopBanner state={state} now={now} />
          {state.sponsorLogoUrl && (
            <img
              src={state.sponsorLogoUrl}
              alt=""
              className="absolute bottom-4 left-1/2 -translate-x-1/2 h-20 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
            />
          )}
        </>
      )}
    </div>
  )
}

function SideColumn({ player, side }) {
  return (
    <div
      className={`absolute top-0 bottom-0 flex flex-col ${side === 'left' ? 'left-0 border-r-4' : 'right-0 border-l-4'} border-forge`}
      style={{ width: SIDE_WIDTH }}
    >
      {/* Transparent square cutout: place this player's camera behind it in OBS. The
          dark fill starts below it, so nothing paints over the cam. */}
      <div className="w-full border-b-4 border-forge" style={{ height: CAM_HEIGHT }} />

      <div className="flex-1 w-full bg-ink flex flex-col items-center">
      <div className="mt-6 px-4 w-full text-center">
        <div className="text-4xl uppercase tracking-wide leading-tight truncate">{player.name || ' '}</div>
        <div className="mt-1 text-2xl text-on-ink/70 tracking-widest">{player.record || ' '}</div>
      </div>

      <div className="mt-5 flex gap-3">
        {player.inks.map(ink => <InkIcon key={ink} color={ink} size={56} />)}
      </div>

      <div className="mt-5 flex gap-3" aria-label={`${player.gameWins} game wins`}>
        {Array.from({ length: MAX_GAME_WINS }, (_, i) => (
          <svg key={i} viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <path
              d="M12 2l10 10-10 10L2 12z"
              className={i < player.gameWins ? 'fill-forge stroke-forge' : 'fill-transparent stroke-on-ink/60'}
              strokeWidth="2"
            />
          </svg>
        ))}
      </div>

      <div className="mt-auto text-center">
        <div className="text-base uppercase tracking-[0.3em] text-on-ink/60">Lore</div>
        <div className="text-[9rem] leading-none text-forge tabular-nums">{player.lore}</div>
      </div>

      {/* Brand lockup, bottom-right like the reference streams; mirrors Nav's. */}
      <div className="mt-6 mb-5 h-8 flex items-center justify-center gap-2">
        {side === 'right' && (
          <>
            <img src="/inkborn_forge_mark_64.png" alt="" className="h-8 w-8 rounded-sm" />
            <span className="text-xl uppercase tracking-[0.12em]">InkbornForge</span>
          </>
        )}
      </div>
      </div>
    </div>
  )
}

function TopBanner({ state, now }) {
  const remaining = timerRemainingMs(state, now)
  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 flex items-center gap-8 px-8 py-3 bg-ink border-x-4 border-b-4 border-forge rounded-b-lg">
      {state.eventLogoUrl
        ? <img src={state.eventLogoUrl} alt={state.eventName} className="h-16 object-contain" />
        : <div className="text-3xl uppercase tracking-wide">{state.eventName || ' '}</div>}
      <Stat label="Round" value={state.round || '—'} />
      <Stat label="Time" value={formatClock(remaining)} warn={state.timerEndsAt !== null && remaining < 5 * 60 * 1000} />
    </div>
  )
}

function Stat({ label, value, warn = false }) {
  return (
    <div className="text-center">
      <div className="text-sm uppercase tracking-[0.3em] text-on-ink/60">{label}</div>
      <div className={`text-4xl leading-tight tabular-nums ${warn ? 'text-red-400' : ''}`}>{value}</div>
    </div>
  )
}
