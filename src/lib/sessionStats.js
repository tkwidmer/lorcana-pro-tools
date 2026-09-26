// Session & tilt analysis over duels.ink match-history rows (the shape
// MatchHistoryPage loads: started_at / ended_at ISO strings, result
// 'win' | 'loss' | 'draw' | 'abandoned' | null, mmr_delta, opp_is_bot).
// Pure functions only, so the maths stays unit-testable apart from the UI.
//
// Unit of analysis is the individual game — each game of a Bo3 counts on its
// own, matching the per-game rows Match History already shows.

import { wilsonInterval, diffInterval } from './practiceSim'

// A gap longer than this between one game ending and the next starting
// begins a new session.
export const SESSION_GAP_MINUTES = 30

// Streak buckets need at least this many games before a stop-loss is suggested.
export const STOP_LOSS_MIN_GAMES = 15

const POSITION_BUCKETS = ['1', '2', '3', '4', '5', '6+']
const STREAK_BUCKETS = ['0', '1', '2', '3+']
const TIME_BUCKETS = [
  { key: 'night', label: 'Night (0–6)', from: 0, to: 6 },
  { key: 'morning', label: 'Morning (6–12)', from: 6, to: 12 },
  { key: 'afternoon', label: 'Afternoon (12–18)', from: 12, to: 18 },
  { key: 'evening', label: 'Evening (18–24)', from: 18, to: 24 },
]
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function isDecisive(game) {
  return game.result === 'win' || game.result === 'loss'
}

function emptyBucket(key, label = key) {
  return { key, label, wins: 0, losses: 0, mmrTotal: 0, mmrGames: 0 }
}

function addGame(bucket, game) {
  if (game.result === 'win') bucket.wins++
  else if (game.result === 'loss') bucket.losses++
  if (game.mmr_delta != null) {
    bucket.mmrTotal += game.mmr_delta
    bucket.mmrGames++
  }
}

function finalize(bucket) {
  const games = bucket.wins + bucket.losses
  return {
    key: bucket.key,
    label: bucket.label,
    wins: bucket.wins,
    losses: bucket.losses,
    games,
    winRate: games > 0 ? bucket.wins / games : null,
    interval: games > 0 ? wilsonInterval(bucket.wins, games) : null,
    avgMmrDelta: bucket.mmrGames > 0 ? bucket.mmrTotal / bucket.mmrGames : null,
  }
}

// Groups games into play sessions. Bot games are excluded. Each returned game
// is a shallow copy tagged with its 1-based `positionInSession`.
export function buildSessions(games, gapMinutes = SESSION_GAP_MINUTES) {
  const gapMs = gapMinutes * 60 * 1000
  const timed = games
    .filter(g => !g.opp_is_bot)
    .map(g => {
      if (!g.started_at || !g.ended_at) {
        throw new Error(`Match history row ${g.game_id ?? '(no id)'} is missing started_at/ended_at`)
      }
      return { game: g, start: new Date(g.started_at).getTime(), end: new Date(g.ended_at).getTime() }
    })
    .sort((a, b) => a.start - b.start)

  const sessions = []
  let current = null
  for (const t of timed) {
    if (!current || t.start - current.end > gapMs) {
      current = { games: [], start: t.start, end: t.end }
      sessions.push(current)
    }
    current.games.push({ ...t.game, positionInSession: current.games.length + 1 })
    current.end = Math.max(current.end, t.end)
  }
  return sessions
}

export function winRateByPosition(sessions) {
  const buckets = Object.fromEntries(POSITION_BUCKETS.map(k => [k, emptyBucket(k, k === '6+' ? 'Game 6+' : `Game ${k}`)]))
  for (const s of sessions) {
    for (const g of s.games) {
      addGame(buckets[g.positionInSession >= 6 ? '6+' : String(g.positionInSession)], g)
    }
  }
  return POSITION_BUCKETS.map(k => finalize(buckets[k]))
}

// Record in the next game, split by how many losses in a row came right before
// it in the same session. '0' means the previous decisive game was a win.
// Draws/abandoned games neither extend nor reset a streak. A game with no
// decisive game before it in its session isn't counted.
export function winRateAfterLossStreak(sessions) {
  const labels = { 0: 'After a win', 1: 'After 1 loss', 2: 'After 2 losses', '3+': 'After 3+ losses' }
  const buckets = Object.fromEntries(STREAK_BUCKETS.map(k => [k, emptyBucket(k, labels[k])]))
  for (const s of sessions) {
    let streak = null // null until the session has a decisive game
    for (const g of s.games) {
      if (streak !== null && isDecisive(g)) {
        addGame(buckets[streak >= 3 ? '3+' : String(streak)], g)
      }
      if (g.result === 'win') streak = 0
      else if (g.result === 'loss') streak = (streak ?? 0) + 1
    }
  }
  return STREAK_BUCKETS.map(k => finalize(buckets[k]))
}

// Local-time buckets (the viewer's browser timezone).
export function winRateByTimeOfDay(sessions) {
  const buckets = TIME_BUCKETS.map(b => emptyBucket(b.key, b.label))
  for (const s of sessions) {
    for (const g of s.games) {
      const hour = new Date(g.started_at).getHours()
      addGame(buckets[TIME_BUCKETS.findIndex(b => hour >= b.from && hour < b.to)], g)
    }
  }
  return buckets.map(finalize)
}

export function winRateByDayOfWeek(sessions) {
  const buckets = DAY_LABELS.map(d => emptyBucket(d))
  for (const s of sessions) {
    for (const g of s.games) {
      // getDay(): 0 = Sunday. Shift so Monday is first.
      addGame(buckets[(new Date(g.started_at).getDay() + 6) % 7], g)
    }
  }
  return buckets.map(finalize)
}

// Suggests a "take a break after N straight losses" rule only when the data
// supports it: the smallest N in {2, 3} whose after-N+-losses bucket has at
// least STOP_LOSS_MIN_GAMES games and whose win-rate gap to "after a win" has
// a 95% interval entirely below zero. Returns null otherwise.
export function stopLossSuggestion(streakBuckets) {
  const byKey = Object.fromEntries(streakBuckets.map(b => [b.key, b]))
  const baseline = byKey['0']
  if (!baseline || baseline.games === 0) return null
  const candidates = [
    { afterLosses: 2, keys: ['2', '3+'] },
    { afterLosses: 3, keys: ['3+'] },
  ]
  for (const { afterLosses, keys } of candidates) {
    const wins = keys.reduce((sum, k) => sum + byKey[k].wins, 0)
    const games = keys.reduce((sum, k) => sum + byKey[k].games, 0)
    if (games < STOP_LOSS_MIN_GAMES) continue
    const [, upper] = diffInterval(wins, games, baseline.wins, baseline.games)
    if (upper < 0) {
      return { afterLosses, streakWinRate: wins / games, baselineWinRate: baseline.winRate, games }
    }
  }
  return null
}

export function summarizeSessions(sessions, totalGames) {
  const lengths = sessions.map(s => s.games.length)
  const played = lengths.reduce((a, b) => a + b, 0)
  return {
    sessions: sessions.length,
    games: played,
    botGamesExcluded: totalGames - played,
    avgLength: sessions.length > 0 ? played / sessions.length : 0,
    longest: lengths.length > 0 ? Math.max(...lengths) : 0,
  }
}
