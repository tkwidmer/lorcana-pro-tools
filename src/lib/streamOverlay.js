// State shared between the Stream Overlay control panel (/stream-overlay) and
// the OBS Browser Source view (/stream-overlay/view). The panel publishes the
// whole state on a Supabase Realtime Broadcast channel (no table, nothing
// stored server-side) and the view just renders the last payload it received.

export const OVERLAY_WIDTH = 1920
export const OVERLAY_HEIGHT = 1080

export const MAX_GAME_WINS = 2

export function defaultPlayer(name) {
  return { name, record: '', inks: [], lore: 0, gameWins: 0 }
}

export function defaultState() {
  return {
    eventName: '',
    eventLogoUrl: '',
    sponsorLogoUrl: '',
    round: '',
    // The clock is a wall-time target so the view ticks on its own and the
    // panel can close without the timer stopping. Paused: `timerEndsAt` is
    // null and `timerRemainingMs` holds what's left.
    timerEndsAt: null,
    timerRemainingMs: 50 * 60 * 1000,
    players: [defaultPlayer('Player 1'), defaultPlayer('Player 2')],
  }
}

export function timerRemainingMs(state, now = Date.now()) {
  if (state.timerEndsAt === null) return state.timerRemainingMs
  return Math.max(0, state.timerEndsAt - now)
}

export function startTimer(state, now = Date.now()) {
  if (state.timerEndsAt !== null) return state
  return { ...state, timerEndsAt: now + state.timerRemainingMs }
}

export function pauseTimer(state, now = Date.now()) {
  if (state.timerEndsAt === null) return state
  return { ...state, timerEndsAt: null, timerRemainingMs: timerRemainingMs(state, now) }
}

export function resetTimer(state, minutes) {
  return { ...state, timerEndsAt: null, timerRemainingMs: Math.max(0, minutes) * 60 * 1000 }
}

// m:ss under an hour, h:mm:ss at or over it — matches the clocks on tournament streams.
export function formatClock(ms) {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

export function clampLore(lore) {
  return Math.min(99, Math.max(0, lore))
}

export function clampGameWins(wins) {
  return Math.min(MAX_GAME_WINS, Math.max(0, wins))
}

export function channelName(id) {
  if (!/^[a-z0-9]{8,}$/.test(id)) throw new Error(`Invalid overlay channel id: ${id}`)
  return `stream-overlay:${id}`
}

export function newChannelId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

export function swapSides(state) {
  return { ...state, players: [state.players[1], state.players[0]] }
}

// RPH's round clock as the event exposes it: `timer_end_datetime` with
// `timer_is_running`, and when paused, `timer_paused_at_datetime` (end minus
// paused-at is what's left). Returns the overlay's timer fields, or null when
// the event has no clock set.
export function timerFromRph({ timerEndDatetime, timerIsRunning, timerPausedAtDatetime }) {
  if (!timerEndDatetime) return null
  const endsAt = Date.parse(timerEndDatetime)
  if (timerIsRunning) return { timerEndsAt: endsAt, timerRemainingMs: 0 }
  if (!timerPausedAtDatetime) return null
  return { timerEndsAt: null, timerRemainingMs: Math.max(0, endsAt - Date.parse(timerPausedAtDatetime)) }
}

// Loads a feature match picked in Tournament Lookup: names, records and the
// round clock come from RPH, lore and game wins start fresh, inks stay
// whatever was set (RPH doesn't know decks).
export function applyFeatureMatch(state, { eventName, round, players, timer }) {
  return {
    ...state,
    ...timer,
    eventName,
    round,
    players: state.players.map((p, i) => ({ ...p, name: players[i].name, record: players[i].record, lore: 0, gameWins: 0 })),
  }
}

// The control panel's saved state plus its channel id — the OBS link embeds
// the id, so it has to survive a reload and a hand-off from Tournament Lookup.
export const STORAGE_KEY = 'lorcana_stream_overlay'

export function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved?.channelId && saved?.state) return saved
  } catch { /* fall through to a fresh setup */ }
  return { channelId: newChannelId(), state: defaultState() }
}

export function storeSaved(saved) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)) } catch { /* noop */ }
}

export function saveFeatureMatch(match) {
  const saved = loadSaved()
  storeSaved({ ...saved, state: applyFeatureMatch(saved.state, match) })
}
