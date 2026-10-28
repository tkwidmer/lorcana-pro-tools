// Glicko-1 player ratings over the Tournament History archive (Glickman,
// "The Glicko system"). Pure: no I/O. One event is one rating period;
// recomputeRatings() in tournamentHistorySupabase.ts feeds it every match.
// See docs/agents/tournaments.md "Player ratings".

export const INITIAL_RATING = 1500
export const INITIAL_RD = 350
// A player is ranked once their deviation is at or under this.
export const ESTABLISHED_RD = 100

const Q = Math.LN10 / 400
// Per-day RD growth: a well-known player (RD 60) is back to 350 after a year away.
const C = Math.sqrt((INITIAL_RD ** 2 - 60 ** 2) / 365)
const DAY_MS = 86_400_000

export interface Rating {
  rating: number
  rd: number
}

export interface GameResult {
  opponent: Rating
  score: number // 1 win, 0.5 draw, 0 loss
}

export interface RatedMatch {
  player1Id: string
  player2Id: string | null // null: a bye
  winnerId: string | null
  isDraw: boolean
}

export interface RatedEvent {
  rphEventId: string
  eventDate: string // YYYY-MM-DD
  matches: RatedMatch[]
}

export interface PlayerRating extends Rating {
  matches: number
  wins: number
  losses: number
  draws: number
  lastEventDate: string
  history: Array<{ rphEventId: string; eventDate: string; rating: number; rd: number }>
}

export function g(rd: number): number {
  return 1 / Math.sqrt(1 + (3 * Q ** 2 * rd ** 2) / Math.PI ** 2)
}

export function expectedScore(player: Rating, opponent: Rating): number {
  return 1 / (1 + 10 ** ((-g(opponent.rd) * (player.rating - opponent.rating)) / 400))
}

// One rating period. Opponents' ratings are as they stood at its start.
export function updatePlayer(player: Rating, results: GameResult[]): Rating {
  let dInv = 0 // 1 / d²
  let sum = 0
  for (const { opponent, score } of results) {
    const gj = g(opponent.rd)
    const e = expectedScore(player, opponent)
    dInv += Q ** 2 * gj ** 2 * e * (1 - e)
    sum += gj * (score - e)
  }
  const precision = 1 / player.rd ** 2 + dInv
  return { rating: player.rating + (Q / precision) * sum, rd: Math.sqrt(1 / precision) }
}

export function inflate(player: Rating, days: number): Rating {
  return { rating: player.rating, rd: Math.min(Math.sqrt(player.rd ** 2 + C ** 2 * days), INITIAL_RD) }
}

function scoreFor(match: RatedMatch, playerId: string): number {
  if (match.isDraw) return 0.5
  if (match.winnerId !== match.player1Id && match.winnerId !== match.player2Id) {
    throw new Error(`Match winner ${match.winnerId} is neither player (${match.player1Id}, ${match.player2Id})`)
  }
  return match.winnerId === playerId ? 1 : 0
}

// Every event in date order (ties by rph event id), each a rating period.
// Byes and matches with no winner that aren't draws are skipped.
export function rateEvents(events: RatedEvent[]): Map<string, PlayerRating> {
  const players = new Map<string, PlayerRating>()
  const ordered = [...events].sort(
    (a, b) => a.eventDate.localeCompare(b.eventDate) || a.rphEventId.localeCompare(b.rphEventId, 'en', { numeric: true })
  )

  for (const event of ordered) {
    if (!event.eventDate) throw new Error(`Event ${event.rphEventId} has no event date`)

    const games = new Map<string, Array<{ opponentId: string; score: number }>>()
    const add = (id: string, opponentId: string, score: number) => {
      if (!games.has(id)) games.set(id, [])
      games.get(id)!.push({ opponentId, score })
    }
    for (const m of event.matches) {
      if (!m.player2Id || (!m.isDraw && !m.winnerId)) continue
      add(m.player1Id, m.player2Id, scoreFor(m, m.player1Id))
      add(m.player2Id, m.player1Id, scoreFor(m, m.player2Id))
    }

    const start = new Map<string, Rating>()
    for (const id of games.keys()) {
      const p = players.get(id)
      const days = p ? (Date.parse(event.eventDate) - Date.parse(p.lastEventDate)) / DAY_MS : 0
      start.set(id, p ? inflate(p, days) : { rating: INITIAL_RATING, rd: INITIAL_RD })
    }

    for (const [id, played] of games) {
      const next = updatePlayer(
        start.get(id)!,
        played.map(({ opponentId, score }) => ({ opponent: start.get(opponentId)!, score }))
      )
      const p = players.get(id) ?? { matches: 0, wins: 0, losses: 0, draws: 0, history: [] as PlayerRating['history'] }
      players.set(id, {
        ...next,
        matches: p.matches + played.length,
        wins: p.wins + played.filter((x) => x.score === 1).length,
        losses: p.losses + played.filter((x) => x.score === 0).length,
        draws: p.draws + played.filter((x) => x.score === 0.5).length,
        lastEventDate: event.eventDate,
        history: [...p.history, { rphEventId: event.rphEventId, eventDate: event.eventDate, ...next }],
      })
    }
  }
  return players
}
