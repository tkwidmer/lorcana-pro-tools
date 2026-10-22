// Pure helpers shared by the Stream Overlay control panel, the OBS view and
// the players' controller. The source of truth is a `stream_tables` row
// (supabase/migrations/012_stream_tables.sql — one column per overlay
// field); these turn a row into the render shape and panel actions into
// column patches. Data access lives in streamTables.js.

import { resolveColors } from './inkColors'

export const OVERLAY_WIDTH = 1920
export const OVERLAY_HEIGHT = 1080

export const MAX_GAME_WINS = 2

// A game of Lorcana is won at 20 lore: the view pulses the number there as a
// cue to tap the game win (never automatic — a mis-tap shouldn't flip the
// screen to Winner).
export const WINNING_LORE = 20

// The size class for a name in a fixed-width slot: the largest of `sizes`
// (ordered big → small) whose character budget the name fits, so a long RPH
// name shrinks instead of truncating. Budgets are per slot, measured for
// Oswald caps at that slot's width.
export function nameSizeClass(name, sizes) {
  return (sizes.find(([, maxChars]) => name.length <= maxChars) ?? sizes[sizes.length - 1])[0]
}

// The site's own look: ink black fill, forge gold accent (src/index.css).
export const DEFAULT_THEME = { fill: '#17171a', accent: '#b5832a' }

// Text on the fill: the site's paper white on a dark fill, ink on a light
// one, by WCAG relative luminance so an organizer's pale theme still reads.
// A deck's inks from its matched entries (matchDeckList): every ink that
// appears, most copies first, so a splash still shows and the main ink
// leads. Dual-ink cards count for both.
export function deckInks(entries) {
  const copies = new Map()
  for (const { card, count } of entries) {
    for (const ink of resolveColors(card.colors?.length ? card.colors : [card.color])) {
      copies.set(ink, (copies.get(ink) ?? 0) + count)
    }
  }
  return [...copies].sort((a, b) => b[1] - a[1]).map(([ink]) => ink)
}

export function themeTextColor(fillHex) {
  const channel = h => {
    const c = parseInt(h, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = [1, 3, 5].map(i => channel(fillHex.slice(i, i + 2)))
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.4 ? '#17171a' : '#f2f1ee'
}

// A row (from get_stream_table / the owner's select / a broadcast payload)
// → what the pages render.
export function rowToState(row) {
  return {
    mode: row.mode,
    theme: { fill: row.theme_fill, accent: row.theme_accent, text: themeTextColor(row.theme_fill) },
    eventName: row.event_name,
    eventLogoUrl: row.event_logo_url,
    sponsorLogoUrl: row.sponsor_logo_url,
    round: row.round,
    note: row.note,
    // 0 = no deck over the gameplay cam, else the side (1 or 2) being shown.
    deckShown: row.deck_shown,
    // Wall-time target while running (ms since epoch), null while paused.
    timerEndsAt: row.timer_ends_at ? Date.parse(row.timer_ends_at) : null,
    timerRemainingMs: row.timer_remaining_ms,
    rphEventId: row.rph_event_id,
    players: [1, 2].map(n => ({
      name: row[`p${n}_name`],
      record: row[`p${n}_record`],
      inks: row[`p${n}_inks`],
      lore: row[`p${n}_lore`],
      gameWins: row[`p${n}_game_wins`],
      decklist: row[`p${n}_decklist`],
    })),
  }
}

// The side (0 or 1) that has taken the match, or null while it's still on.
// Derived from game wins alone, so resetting them for the next match clears it.
export function winnerIndex(players) {
  const i = players.findIndex(p => p.gameWins >= MAX_GAME_WINS)
  return i === -1 ? null : i
}

// What the break screen is showing. The table holds the pair that just
// played until the next pairing is published on RPH and sent over, so the
// headline comes from the score: a decided match reads as the result, a fresh
// pairing as the next match, anything else as a match paused between games.
export function breakHeadline(players) {
  const winner = winnerIndex(players)
  const score = `${players[0].gameWins}-${players[1].gameWins}`
  if (winner !== null) return { label: 'Final', score, winner }
  if (players.every(p => p.gameWins === 0)) return { label: 'Next match', score: null, winner: null }
  return { label: 'Match in progress', score, winner: null }
}

export function timerRemainingMs(state, now = Date.now()) {
  if (state.timerEndsAt === null) return state.timerRemainingMs
  return Math.max(0, state.timerEndsAt - now)
}

// Timer actions return the two timer columns to write.
export function startTimer(state, now = Date.now()) {
  if (state.timerEndsAt !== null) return null
  return timerPatch({ timerEndsAt: now + state.timerRemainingMs, timerRemainingMs: state.timerRemainingMs })
}

export function pauseTimer(state, now = Date.now()) {
  if (state.timerEndsAt === null) return null
  return timerPatch({ timerEndsAt: null, timerRemainingMs: timerRemainingMs(state, now) })
}

export function resetTimer(minutes) {
  return timerPatch({ timerEndsAt: null, timerRemainingMs: Math.max(0, minutes) * 60 * 1000 })
}

export function timerPatch({ timerEndsAt, timerRemainingMs }) {
  return {
    timer_ends_at: timerEndsAt === null ? null : new Date(timerEndsAt).toISOString(),
    timer_remaining_ms: timerRemainingMs,
  }
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

// One poll of a linked RPH clock → the timer columns, or null for no change.
export function rphClockPatch(structure) {
  const timer = timerFromRph(structure)
  return timer ? timerPatch(timer) : null
}

// A feature match picked in Tournament Lookup: names, records, the round
// clock and the event link come from RPH; lore, game wins and decklists
// start fresh (the old pair's lists would be wrong) and no deck is shown;
// inks are left alone (RPH doesn't know decks).
export function featureMatchPatch({ eventName, round, players, timer, rphEventId }) {
  return {
    ...(timer ? timerPatch(timer) : {}),
    rph_event_id: rphEventId,
    event_name: eventName,
    round,
    p1_name: players[0].name, p1_record: players[0].record, p1_lore: 0, p1_game_wins: 0, p1_decklist: '',
    p2_name: players[1].name, p2_record: players[1].record, p2_lore: 0, p2_game_wins: 0, p2_decklist: '',
    deck_shown: 0,
  }
}

const SIDE_FIELDS = ['name', 'record', 'inks', 'lore', 'game_wins', 'decklist']

// Mirrors which side each player sits on; a shown deck follows its player.
export function swapSidesPatch(row) {
  const patch = { deck_shown: [0, 2, 1][row.deck_shown] }
  for (const f of SIDE_FIELDS) {
    patch[`p1_${f}`] = row[`p2_${f}`]
    patch[`p2_${f}`] = row[`p1_${f}`]
  }
  return patch
}

// Operator hotkeys on the control panel (and so a Stream Deck sending keys):
// left-hand keys for the left player, right-hand keys for the right player,
// B flips Live / Break. Letters only, so any key sender can produce them.
export const HOTKEYS = {
  q: { side: 1, field: 'lore', delta: 1 }, a: { side: 1, field: 'lore', delta: -1 },
  w: { side: 1, field: 'game_wins', delta: 1 }, s: { side: 1, field: 'game_wins', delta: -1 },
  i: { side: 2, field: 'lore', delta: 1 }, k: { side: 2, field: 'lore', delta: -1 },
  o: { side: 2, field: 'game_wins', delta: 1 }, l: { side: 2, field: 'game_wins', delta: -1 },
  b: { toggleMode: true },
  1: { toggleDeck: 1 }, 2: { toggleDeck: 2 },
}

// The action for a keydown, or null: a plain key with no modifier, and never
// while the operator is typing in a field.
export function hotkeyAction(e) {
  if (e.altKey || e.ctrlKey || e.metaKey) return null
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable) return null
  return HOTKEYS[e.key.toLowerCase()] ?? null
}
