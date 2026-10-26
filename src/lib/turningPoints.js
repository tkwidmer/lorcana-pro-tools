// Turning points: on which round a game was decided, how far behind the loser
// was, and comebacks. Rounds are duels.ink's shared round numbers (`turn` on
// loreEvents and plays): the first player's opening round is solo.
import { wilsonInterval } from './practiceSim'

export const MIN_GAMES = 10
export const COMEBACK_LORE = 5
const COMEBACK_FROM_ROUND = 3
export const LATE_DEFICIT_LORE = 5
export const LATE_DEFICIT_ROUND = 5
// Histogram buckets are rounds 1..12, the last one holding 12 and later.
export const HISTOGRAM_ROUNDS = 12
// A sentence needs at least this many games behind it.
const MIN_SENTENCE_N = 5

function winnerOf(gamelog) {
  const w = Number(gamelog.winner)
  return w === 1 || w === 2 ? w : null
}

// Each player's lore total after each round 0..N (index = round), carried
// forward from loreEvents; both start at 0.
export function loreCurve(gamelog) {
  const events = gamelog.loreEvents ?? []
  const last = Math.max(gamelog.turnCount ?? 0, ...events.map(e => e.turn))
  const curve = { 1: new Array(last + 1).fill(null), 2: new Array(last + 1).fill(null) }
  for (const e of events) curve[e.player][e.turn] = e.total
  for (const p of [1, 2]) {
    let total = 0
    curve[p] = curve[p].map(v => (total = v ?? total))
  }
  return curve
}

// The first round after which the winner's lead is never lost or tied again.
// Null for a game without a winner, or one the winner did not finish ahead on
// lore (a concession or timeout while behind or level).
export function decisiveRound(gamelog) {
  const winner = winnerOf(gamelog)
  if (!winner) return null
  const curve = loreCurve(gamelog)
  const lead = curve[winner].map((v, r) => v - curve[3 - winner][r])
  if (lead[lead.length - 1] <= 0) return null
  let round = 1
  for (let r = 1; r < lead.length; r++) if (lead[r] <= 0) round = r + 1
  return { round, winnerLead: lead[round] }
}

// The middle half of the decisive rounds: "usually decided on round q1 to q3".
function quartiles(values) {
  const s = [...values].sort((a, b) => a - b)
  return { q1: s[Math.floor((s.length - 1) / 4)], q3: s[Math.ceil((s.length - 1) * 3 / 4)] }
}

function decisiveSeries(rounds) {
  const histogram = new Array(HISTOGRAM_ROUNDS).fill(0)
  for (const r of rounds) histogram[Math.min(r, HISTOGRAM_ROUNDS) - 1]++
  return { n: rounds.length, histogram, ...(rounds.length ? quartiles(rounds) : {}) }
}

function cardCounts(playLists) {
  const counts = new Map()
  for (const names of playLists) for (const name of new Set(names)) counts.set(name, (counts.get(name) ?? 0) + 1)
  return {
    n: playLists.length,
    cards: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  }
}

// games: parsed gamelogs, each with its own myPlayerNum resolved. Games without
// a winner are left out entirely.
export function aggregateTurningPoints(games) {
  const decided = games.filter(g => winnerOf(g))
  const winRounds = [], lossRounds = [], lossDeficits = []
  const winCards = [], lossCards = []
  let lateN = 0, lateWins = 0, comebackCount = 0, biggest = 0

  for (const g of decided) {
    const me = g.myPlayerNum
    if (me !== 1 && me !== 2) throw new Error(`Game ${g.id} has no myPlayerNum`)
    const won = winnerOf(g) === me
    const curve = loreCurve(g)
    const deficit = r => curve[3 - me][r] - curve[me][r]

    const decisive = decisiveRound(g)
    if (decisive) {
      ;(won ? winRounds : lossRounds).push(decisive.round)
      if (!won) lossDeficits.push(decisive.winnerLead)
      if (g.plays) {
        const mine = g.plays.filter(p => p.player === me && p.turn === decisive.round).map(p => p.cardName)
        ;(won ? winCards : lossCards).push(mine)
      }
    }

    if (curve[me].length > LATE_DEFICIT_ROUND && deficit(LATE_DEFICIT_ROUND) >= LATE_DEFICIT_LORE) {
      lateN++
      if (won) lateWins++
    }

    if (won) {
      let worst = 0
      for (let r = COMEBACK_FROM_ROUND; r < curve[me].length; r++) worst = Math.max(worst, deficit(r))
      if (worst >= COMEBACK_LORE) { comebackCount++; biggest = Math.max(biggest, worst) }
    }
  }

  const losses = decisiveSeries(lossRounds)
  losses.meanDeficit = lossDeficits.length ? lossDeficits.reduce((a, b) => a + b, 0) / lossDeficits.length : null
  return {
    games: decided.length,
    wins: decided.filter(g => winnerOf(g) === g.myPlayerNum).length,
    decisive: { wins: decisiveSeries(winRounds), losses },
    lateDeficit: { n: lateN, wins: lateWins, interval: wilsonInterval(lateWins, lateN) },
    comebacks: { count: comebackCount, biggest: comebackCount ? biggest : null },
    decisiveCards: { wins: cardCounts(winCards), losses: cardCounts(lossCards) },
  }
}

const pct = x => `${Math.round(x * 100)}%`
const roundSpan = ({ q1, q3 }) => (q1 === q3 ? `round ${q1}` : `round ${q1} to ${q3}`)

export function turningPointSentences(summary) {
  if (summary.games < MIN_GAMES) throw new Error(`Turning points need ${MIN_GAMES} games, got ${summary.games}`)
  const { decisive, lateDeficit, comebacks } = summary
  const out = []
  if (decisive.losses.n >= MIN_SENTENCE_N) {
    out.push(`Your losses are usually decided on ${roundSpan(decisive.losses)}. At that point you trail by ${Math.round(decisive.losses.meanDeficit)} lore on average (n=${decisive.losses.n}).`)
  }
  if (decisive.wins.n >= MIN_SENTENCE_N) {
    out.push(`Your wins are usually decided on ${roundSpan(decisive.wins)} (n=${decisive.wins.n}).`)
  }
  if (lateDeficit.n >= MIN_SENTENCE_N) {
    const [lo, hi] = lateDeficit.interval
    out.push(`When you are ${LATE_DEFICIT_LORE} or more lore behind after round ${LATE_DEFICIT_ROUND}, you win ${pct(lateDeficit.wins / lateDeficit.n)} of the time (95% CI ${pct(lo)}–${pct(hi)}, n=${lateDeficit.n}).`)
  }
  if (summary.wins >= MIN_SENTENCE_N) {
    const { count, biggest } = comebacks
    out.push(count === 0 ? `None of your ${summary.wins} wins was a comeback from ${COMEBACK_LORE} or more lore down.`
      : count === 1 ? `You have come back from ${biggest} lore down once (n=${summary.wins} wins).`
        : `You have come back from ${COMEBACK_LORE} or more lore down in ${count} of ${summary.wins} wins, the biggest from ${biggest} down.`)
  }
  return out
}
