import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTransparentBackground } from '../hooks/useTransparentBackground'
import { InkIcon } from '../components/InkIcons'
import { fetchPublicTable, subscribeToTable } from '../lib/streamTables'
import {
  OVERLAY_WIDTH, OVERLAY_HEIGHT, MAX_GAME_WINS, WINNING_LORE, rowToState, timerRemainingMs, formatClock, winnerIndex, breakHeadline, DEFAULT_THEME, themeTextColor, nameSizeClass,
} from '../lib/streamOverlay'

const SIDE_WIDTH = 320
// Name size classes per slot, big → small, with the character budget each
// fits in Oswald caps at that slot's width; beyond the last it still truncates.
const COLUMN_NAME_SIZES = [['text-4xl', 13], ['text-3xl', 17], ['text-2xl', 22], ['text-xl', 27]]
const BREAK_NAME_SIZES = [['text-6xl', 16], ['text-5xl', 21], ['text-4xl', 28]]

// The event's theme as CSS variables on the frame: every fill, border, lore
// number, pip and ribbon reads these, so one pair of colors restyles both the
// live overlay and the break screen.
const themeVars = theme => ({ '--fill': theme.fill, '--accent': theme.accent, '--on-fill': theme.text })
const FALLBACK_THEME = { ...DEFAULT_THEME, text: themeTextColor(DEFAULT_THEME.fill) }
// Square cutout: tall enough for a portrait player cam, and the operator
// positions the camera source behind it in OBS.
const CAM_HEIGHT = SIDE_WIDTH

// The single OBS Browser Source for a gameplay stream: a 1920×1080 frame with
// opaque side columns (square player cam cutout, name, record, inks, game-win
// pips, lore) and a top banner (event logo, round, timer), everything else
// transparent so the gameplay cam and player cams sit behind it. Once a side
// reaches the match win count it's marked the winner; on `break` the same
// source renders an opaque full-frame screen with the next pairing. It reads
// the stream table named in the link through the public function and then
// renders every broadcast the row's trigger publishes. Unguarded (see
// App.jsx): a Browser Source has no Supabase session, and the public shape
// exposes nothing but what the panel operator typed in.
export function StreamOverlayViewPage() {
  useTransparentBackground()
  const [searchParams] = useSearchParams()
  const tableId = searchParams.get('table') ?? ''
  const [row, setRow] = useState(null)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    fetchPublicTable(tableId).then(setRow).catch(e => setError(e.message))
    return subscribeToTable(tableId, setRow)
  }, [tableId])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  const state = row && rowToState(row)
  const winner = state && winnerIndex(state.players)

  if (state?.mode === 'break') return <BreakScreen state={state} now={now} />

  return (
    <div
      className="relative overflow-hidden font-display text-(--on-fill) select-none"
      style={{ width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT, ...themeVars(state?.theme ?? FALLBACK_THEME) }}
    >
      {!state && (
        <div className="absolute inset-x-0 top-1/2 text-center text-2xl uppercase tracking-widest text-(--on-fill)/70">
          {error ?? 'Loading the stream table…'}
        </div>
      )}
      {state && (
        <>
          <SideColumn player={state.players[0]} side="left" isWinner={winner === 0} />
          <SideColumn player={state.players[1]} side="right" isWinner={winner === 1} />
          <TopBanner state={state} now={now} winner={winner} />
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

function SideColumn({ player, side, isWinner }) {
  return (
    <div
      className={`absolute top-0 bottom-0 flex flex-col ${side === 'left' ? 'left-0 border-r-4' : 'right-0 border-l-4'} border-(--accent)`}
      style={{ width: SIDE_WIDTH }}
    >
      {/* Transparent square cutout: place this player's camera behind it in OBS. The
          dark fill starts below it, so nothing paints over the cam. */}
      <div className="w-full border-b-4 border-(--accent)" style={{ height: CAM_HEIGHT }} />

      <div className="flex-1 w-full bg-(--fill) flex flex-col items-center">
      <div className="mt-6 px-4 w-full text-center">
        {/* Fixed-height line so a shrunken name doesn't move what's below it. */}
        <div className={`h-10 flex items-center justify-center uppercase tracking-wide leading-tight ${nameSizeClass(player.name, COLUMN_NAME_SIZES)}`}>
          <span className="truncate">{player.name || ' '}</span>
        </div>
        <div className="mt-1 text-2xl text-(--on-fill)/70 tracking-widest">{player.record || ' '}</div>
      </div>

      <div className="mt-5 flex gap-3">
        {player.inks.map(ink => <InkIcon key={ink} color={ink} size={56} />)}
      </div>

      <div className="mt-5 flex gap-3" aria-label={`${player.gameWins} game wins`}>
        {Array.from({ length: MAX_GAME_WINS }, (_, i) => (
          <svg key={i} viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <path
              d="M12 2l10 10-10 10L2 12z"
              className={i < player.gameWins ? 'fill-(--accent) stroke-(--accent)' : 'fill-transparent stroke-(--on-fill)/60'}
              strokeWidth="2"
            />
          </svg>
        ))}
      </div>

      {/* Fixed-height slot just above the lore, so the lore block never moves
          and both columns stay aligned whether or not there's a winner. */}
      <div className="mt-auto h-10 flex items-center justify-center">
        {isWinner && (
          <div className="px-5 py-1 bg-(--accent) text-(--fill) text-xl uppercase tracking-[0.35em]">Winner</div>
        )}
      </div>

      <div className="mt-2 text-center">
        <div className="text-base uppercase tracking-[0.3em] text-(--on-fill)/60">Lore</div>
        <div className={`text-[9rem] leading-none text-(--accent) tabular-nums ${player.lore >= WINNING_LORE ? 'animate-pulse' : ''}`}>{player.lore}</div>
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

function TopBanner({ state, now, winner }) {
  const remaining = timerRemainingMs(state, now)
  const result = winner === null ? null : `${state.players[winner].name} ${state.players[winner].gameWins}-${state.players[1 - winner].gameWins}`
  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center px-8 py-3 bg-(--fill) border-x-4 border-b-4 border-(--accent) rounded-b-lg">
      <div className="flex items-center gap-8">
        {state.eventLogoUrl
          ? <img src={state.eventLogoUrl} alt={state.eventName} className="h-16 object-contain" />
          : <div className="text-3xl uppercase tracking-wide">{state.eventName || ' '}</div>}
        {result ? <Stat label="Winner" value={result} /> : <Stat label="Round" value={state.round || '—'} />}
        <Stat label="Time" value={formatClock(remaining)} warn={state.timerEndsAt !== null && remaining < 5 * 60 * 1000} />
      </div>
      {state.note && <div className="mt-2 text-xl uppercase tracking-[0.3em] text-(--on-fill)/70 max-w-[1100px] truncate">{state.note}</div>}
    </div>
  )
}

// Between matches: opaque, the event up top, then whatever the table holds —
// the result of the match that just ended until the next pairing is published
// on RPH and sent over, then the next match (breakHeadline decides). A feature
// match often ends early, so while the round clock has time left it counts
// down here too, so viewers know roughly when the next round starts.
function BreakScreen({ state, now }) {
  const headline = breakHeadline(state.players)
  const remaining = timerRemainingMs(state, now)
  return (
    <div
      className="relative overflow-hidden bg-(--fill) font-display text-(--on-fill) select-none flex flex-col items-center justify-center gap-10"
      style={{ width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT, ...themeVars(state.theme) }}
    >
      {state.eventLogoUrl
        ? <img src={state.eventLogoUrl} alt={state.eventName} className="h-48 object-contain" />
        : <div className="text-7xl uppercase tracking-wide">{state.eventName || ' '}</div>}

      <div className="text-center">
        <div className="text-2xl uppercase tracking-[0.4em] text-(--on-fill)/60">{headline.label}</div>
        {state.round && <div className="mt-1 text-3xl uppercase tracking-wide text-(--accent)">{state.round}</div>}
        {state.note && <div className="mt-2 text-2xl uppercase tracking-[0.3em] text-(--on-fill)/70">{state.note}</div>}
      </div>

      <div className="flex items-center gap-16">
        <BreakPlayer player={state.players[0]} isWinner={headline.winner === 0} />
        <div className={`text-5xl tabular-nums ${headline.score ? 'text-(--on-fill)' : 'text-(--on-fill)/40'}`}>{headline.score ?? 'vs'}</div>
        <BreakPlayer player={state.players[1]} isWinner={headline.winner === 1} />
      </div>

      {remaining > 0 && (
        <div className="text-center">
          <div className="text-2xl uppercase tracking-[0.4em] text-(--on-fill)/60">Time left in round</div>
          <div className="text-7xl leading-tight tabular-nums">{formatClock(remaining)}</div>
        </div>
      )}

      {state.sponsorLogoUrl && (
        <img src={state.sponsorLogoUrl} alt="" className="absolute bottom-6 left-1/2 -translate-x-1/2 h-20 object-contain" />
      )}
      <div className="absolute bottom-6 right-8 flex items-center gap-2">
        <img src="/inkborn_forge_mark_64.png" alt="" className="h-8 w-8 rounded-sm" />
        <span className="text-xl uppercase tracking-[0.12em]">InkbornForge</span>
      </div>
    </div>
  )
}

function BreakPlayer({ player, isWinner }) {
  return (
    <div className="w-[560px] text-center">
      {/* Fixed-height slot above the name, so nothing moves and both sides stay
          aligned whether or not there's a winner. */}
      <div className="mb-2 h-10 flex items-center justify-center">
        {isWinner && <div className="px-5 py-1 bg-(--accent) text-(--fill) text-xl uppercase tracking-[0.35em]">Winner</div>}
      </div>
      <div className={`h-16 flex items-center justify-center uppercase tracking-wide leading-tight ${nameSizeClass(player.name, BREAK_NAME_SIZES)} ${isWinner ? 'text-(--accent)' : ''}`}>
        <span className="truncate">{player.name || ' '}</span>
      </div>
      <div className="mt-2 text-3xl text-(--on-fill)/70 tracking-widest">{player.record || ' '}</div>
      <div className="mt-5 flex justify-center gap-4">
        {player.inks.map(ink => <InkIcon key={ink} color={ink} size={72} />)}
      </div>
    </div>
  )
}

function Stat({ label, value, warn = false }) {
  return (
    <div className="text-center">
      <div className="text-sm uppercase tracking-[0.3em] text-(--on-fill)/60">{label}</div>
      <div className={`text-4xl leading-tight tabular-nums ${warn ? 'text-red-400' : ''}`}>{value}</div>
    </div>
  )
}
