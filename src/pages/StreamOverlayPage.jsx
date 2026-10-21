import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { VALID_INKS } from '../lib/inkColors'
import { InkIcon } from '../components/InkIcons'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import {
  MAX_GAME_WINS, defaultState, newChannelId, channelName,
  startTimer, pauseTimer, resetTimer, timerRemainingMs, formatClock, clampLore, clampGameWins,
} from '../lib/streamOverlay'

const STORAGE_KEY = 'lorcana_stream_overlay'
const HEARTBEAT_MS = 5000

// Saved so a reload mid-tournament keeps the scores and, more importantly, the
// channel id — the OBS link embeds it, so it must survive the panel closing.
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved?.channelId && saved?.state) return saved
  } catch { /* fall through to a fresh setup */ }
  return { channelId: newChannelId(), state: defaultState() }
}

// Control panel for the gameplay stream overlay. Every change (and a periodic
// heartbeat, so a Browser Source that loads late or reconnects catches up)
// publishes the full state on a Supabase Realtime Broadcast channel keyed by
// a random id in the OBS link. Nothing is stored server-side.
export function StreamOverlayPage() {
  const [{ channelId, state }, setSaved] = useState(load)
  const [connected, setConnected] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const channelRef = useRef(null)

  const setState = updater => setSaved(prev => ({ ...prev, state: updater(prev.state) }))

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ channelId, state })) } catch { /* noop */ }
  }, [channelId, state])

  useEffect(() => {
    const channel = supabase.channel(channelName(channelId))
    channel.subscribe(status => setConnected(status === 'SUBSCRIBED'))
    channelRef.current = channel
    return () => { channelRef.current = null; supabase.removeChannel(channel) }
  }, [channelId])

  // Publish on every change, then keep re-sending as a heartbeat so a Browser
  // Source that loads late or reconnects catches up without a request/reply.
  useEffect(() => {
    if (!connected) return
    const send = () => channelRef.current.send({ type: 'broadcast', event: 'state', payload: state })
    send()
    const id = setInterval(send, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [connected, state])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  const overlayUrl = `${window.location.origin}/stream-overlay/view?channel=${channelId}`
  async function copyOverlayLink() {
    try {
      await navigator.clipboard.writeText(overlayUrl)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch { /* clipboard unavailable — noop */ }
  }

  const setField = (key, value) => setState(s => ({ ...s, [key]: value }))
  const setPlayer = (i, patch) => setState(s => ({
    ...s,
    players: s.players.map((p, j) => (j === i ? { ...p, ...patch } : p)),
  }))

  const running = state.timerEndsAt !== null
  const [minutes, setMinutes] = useState(50)

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Stream Overlay"
        description="Run a gameplay stream overlay from here. Add the overlay link as one OBS Browser Source (1920×1080) with the gameplay cam and player cams behind it — the cam areas are transparent."
        actions={
          <>
            <span className={`text-xs font-semibold uppercase tracking-widest ${connected ? 'text-emerald-600' : 'text-gray-400'}`}>
              {connected ? 'Live' : 'Connecting…'}
            </span>
            <Button variant="primary" onClick={copyOverlayLink}>{linkCopied ? 'Link copied!' : 'Copy OBS overlay link'}</Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Event" className="p-5 space-y-3">
          <Labeled label="Event name (shown when there's no logo)">
            <Input value={state.eventName} onChange={e => setField('eventName', e.target.value)} className="w-full" />
          </Labeled>
          <Labeled label="Event logo URL">
            <Input value={state.eventLogoUrl} onChange={e => setField('eventLogoUrl', e.target.value)} className="w-full" placeholder="https://…/logo.png" />
          </Labeled>
          <Labeled label="Sponsor logo URL">
            <Input value={state.sponsorLogoUrl} onChange={e => setField('sponsorLogoUrl', e.target.value)} className="w-full" placeholder="https://…/sponsor.png" />
          </Labeled>
          <Labeled label="Round">
            <Input value={state.round} onChange={e => setField('round', e.target.value)} className="w-full" placeholder="Round 3, Top 16, Finals…" />
          </Labeled>
        </Card>

        <Card title="Round timer" className="p-5">
          <div className="font-display text-6xl tabular-nums text-gray-900 mb-4">{formatClock(timerRemainingMs(state, now))}</div>
          <div className="flex flex-wrap items-center gap-2">
            {running
              ? <Button variant="primary" onClick={() => setState(s => pauseTimer(s))}>Pause</Button>
              : <Button variant="primary" onClick={() => setState(s => startTimer(s))}>Start</Button>}
            <Input
              type="number" min="0" value={minutes} onChange={e => setMinutes(Number(e.target.value))}
              className="w-20" aria-label="Timer minutes"
            />
            <Button onClick={() => setState(s => resetTimer(s, minutes))}>Reset to {minutes} min</Button>
          </div>
        </Card>

        {state.players.map((player, i) => (
          <Card key={i} title={`Player ${i + 1} (${i === 0 ? 'left' : 'right'})`} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Name">
                <Input value={player.name} onChange={e => setPlayer(i, { name: e.target.value })} className="w-full" />
              </Labeled>
              <Labeled label="Record">
                <Input value={player.record} onChange={e => setPlayer(i, { record: e.target.value })} className="w-full" placeholder="5-0-2" />
              </Labeled>
            </div>

            <Labeled label="Deck inks">
              <div className="flex gap-2">
                {VALID_INKS.map(ink => {
                  const on = player.inks.includes(ink)
                  return (
                    <button
                      key={ink} type="button" title={ink} aria-pressed={on}
                      onClick={() => setPlayer(i, { inks: on ? player.inks.filter(x => x !== ink) : [...player.inks, ink] })}
                      className={`rounded border-2 p-1 transition-opacity ${on ? 'border-forge opacity-100' : 'border-transparent opacity-35 hover:opacity-70'}`}
                    >
                      <InkIcon color={ink} size={32} />
                    </button>
                  )
                })}
              </div>
            </Labeled>

            <div className="grid grid-cols-2 gap-3">
              <Counter
                label="Lore" value={player.lore}
                onChange={d => setPlayer(i, { lore: clampLore(player.lore + d) })}
              />
              <Counter
                label={`Game wins (of ${MAX_GAME_WINS})`} value={player.gameWins}
                onChange={d => setPlayer(i, { gameWins: clampGameWins(player.gameWins + d) })}
              />
            </div>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-sm text-gray-500">
        Overlay link: <code className="text-xs break-all">{overlayUrl}</code>
      </p>
    </div>
  )
}

function Labeled({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

function Counter({ label, value, onChange }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      <div className="flex items-stretch border border-gray-300 rounded overflow-hidden">
        <button type="button" onClick={() => onChange(-1)} className="w-14 py-3 text-2xl font-display hover:bg-gray-100" aria-label={`${label} minus one`}>−</button>
        <div className="flex-1 grid place-items-center font-display text-4xl tabular-nums text-gray-900">{value}</div>
        <button type="button" onClick={() => onChange(1)} className="w-14 py-3 text-2xl font-display hover:bg-gray-100" aria-label={`${label} plus one`}>+</button>
      </div>
    </div>
  )
}
