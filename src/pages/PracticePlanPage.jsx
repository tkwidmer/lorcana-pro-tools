import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getToken, fetchMatchHistory, fetchStats } from '../lib/duelsApi'
import { resolveColors } from '../lib/inkColors'
import { getAllGamelogs } from '../lib/gamelogHistory'
import { parseGamelog } from '../lib/parseGamelog'
import { summarizeLeaks, LEAK_TYPES } from '../lib/leakDetection'

const QUEUES = [
  { id: 'infinity-bo1', name: 'Infinity BO1' },
  { id: 'infinity-bo3', name: 'Infinity BO3' },
  { id: 'core-bo1', name: 'Core BO1' },
  { id: 'core-bo3', name: 'Core BO3' },
]

function InkIcon({ color, size = 20 }) {
  return (
    <img
      src={`/ink/${color}.png`}
      alt={color}
      className="inline-block flex-shrink-0"
      style={{ width: `${size}px`, height: `${size}px`, minWidth: `${size}px` }}
    />
  )
}

function ColorPairIcons({ colors, size = 20 }) {
  return (
    <div className="inline-flex gap-1 align-middle flex-shrink-0">
      {colors.map(c => <InkIcon key={c} color={c} size={size} />)}
    </div>
  )
}

function colorsKey(colors) {
  return [...colors].sort().join('+')
}

function parseColorString(str) {
  // accepts "ruby/sapphire" style → ["ruby","sapphire"]
  return resolveColors([str])
}

const ROGUE_THRESHOLD = 5 // meta % below this is treated as a rogue deck and zeroed for planning

// Wilson 95% confidence interval for a binomial proportion (0..1)
function wilsonInterval(wins, n) {
  if (!n) return [0, 1]
  const z = 1.96
  const p = wins / n
  const denom = 1 + (z * z) / n
  const center = (p + (z * z) / (2 * n)) / denom
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom
  return [Math.max(0, center - margin), Math.min(1, center + margin)]
}

// Bayesian shrinkage of personal WR toward public WR.
// Treats public_wr as a prior of weight `priorN` pseudo-games.
function shrinkWR(wins, n, publicWR, priorN = 10) {
  if (publicWR == null) return n > 0 ? wins / n : 0.5
  const priorMean = publicWR / 100
  return (wins + priorMean * priorN) / (n + priorN)
}

// Simulate a single best-of-1 game with given play/draw win rates.
// Returns true if hero won. `heroPlay` decides who's on the play.
function simGame(wrPlay, wrDraw, heroPlay) {
  const p = heroPlay ? wrPlay : wrDraw
  return Math.random() < p
}

// Simulate a BO3 match. Lorcana rule: loser of previous game picks play/draw.
// A rational loser picks play if wrPlay > wrDraw for them; for the hero this
// means picking play (since wrPlay > wrDraw on hero's side typically) and
// when opp lost, opp picks play → hero goes draw.
function simBO3(wrPlay, wrDraw) {
  // G1: coin flip
  let heroPlay = Math.random() < 0.5
  const heroPrefersPlay = wrPlay >= wrDraw
  let heroWins = 0
  let oppWins = 0
  for (let i = 0; i < 3; i++) {
    const heroWon = simGame(wrPlay, wrDraw, heroPlay)
    if (heroWon) heroWins++; else oppWins++
    if (heroWins === 2 || oppWins === 2) break
    // Loser of this game picks for next.
    if (heroWon) {
      // hero won → opp lost → opp picks. Opp prefers play if (1 - wrDraw) > (1 - wrPlay)
      // i.e. opp prefers play when wrDraw < wrPlay (hero is weaker on the draw).
      // From hero's perspective: opp on the play means hero on the draw.
      heroPlay = wrDraw >= wrPlay // opp picks draw when wrPlay < wrDraw for hero
    } else {
      // hero lost → hero picks
      heroPlay = heroPrefersPlay
    }
  }
  return heroWins === 2
}

function simBO1(wrPlay, wrDraw) {
  return simGame(wrPlay, wrDraw, Math.random() < 0.5)
}

// Run Monte Carlo: rows = [{normalizedMeta, wrPlay, wrDraw}], returns record distribution.
function runMonteCarlo({ rows, rounds, format, sims }) {
  // Build CDF for opponent sampling
  const cdf = []
  let acc = 0
  for (const r of rows) {
    if (r.normalizedMeta <= 0) continue
    acc += r.normalizedMeta
    cdf.push({ acc, row: r })
  }
  if (cdf.length === 0) return null
  const total = cdf[cdf.length - 1].acc
  const recordCounts = new Array(rounds + 1).fill(0)
  let totalMatchWins = 0
  for (let s = 0; s < sims; s++) {
    let wins = 0
    for (let r = 0; r < rounds; r++) {
      const x = Math.random() * total
      let idx = 0
      while (idx < cdf.length - 1 && cdf[idx].acc < x) idx++
      const row = cdf[idx].row
      const won = format === 'bo3'
        ? simBO3(row.wrPlay, row.wrDraw)
        : simBO1(row.wrPlay, row.wrDraw)
      if (won) wins++
    }
    recordCounts[wins]++
    totalMatchWins += wins
  }
  return {
    recordCounts,
    sims,
    expectedMatchWR: (totalMatchWins / (sims * rounds)) * 100,
  }
}

function getWinrateColor(wr) {
  if (wr == null || Number.isNaN(wr)) return 'text-gray-400'
  if (wr >= 60) return 'text-green-700 font-semibold'
  if (wr >= 52) return 'text-green-600'
  if (wr >= 48) return 'text-gray-700'
  if (wr >= 40) return 'text-red-600'
  return 'text-red-700 font-semibold'
}

function deltaColor(delta) {
  if (delta == null) return 'text-gray-400'
  if (delta >= 5) return 'text-green-700'
  if (delta <= -5) return 'text-red-700'
  return 'text-gray-500'
}

export function PracticePlanPage() {
  const hasToken = !!getToken()
  const [queue, setQueue] = useState('infinity-bo1')
  const [stats, setStats] = useState(null)
  const [games, setGames] = useState([])
  const [loadingStats, setLoadingStats] = useState(false)
  const [loadingGames, setLoadingGames] = useState(false)
  const [statsError, setStatsError] = useState(null)
  const [gamesError, setGamesError] = useState(null)
  const [yourColorsKeyOverride, setYourColorsKey] = useState(null)
  const [metaOverrides, setMetaOverrides] = useState({}) // key -> percent number
  const [practiceBudget, setPracticeBudget] = useState(50)
  const [showAllMeta, setShowAllMeta] = useState(false)
  const [sortBy, setSortBy] = useState('meta') // 'meta' | 'impact' | 'personal' | 'public' | 'lift'
  const [savedGamelogs, setSavedGamelogs] = useState([])

  // Load saved gamelogs (IndexedDB) for leak-based skill drills
  useEffect(() => {
    getAllGamelogs()
      .then(all => setSavedGamelogs(all.filter(g => g.myPlayerNum != null && (Array.isArray(g.turns) || Array.isArray(g.challenges)))))
      .catch(() => {})
  }, [])

  // Load public stats
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoadingStats(true)
      setStatsError(null)
      try {
        const data = await fetchStats({ queue, period: 'all_time', ranks: [] })
        if (!cancelled) setStats(data)
      } catch (err) {
        if (!cancelled) setStatsError(err.message)
      } finally {
        if (!cancelled) setLoadingStats(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [queue])

  // Load personal match history (paginated, capped to avoid runaway)
  useEffect(() => {
    if (!hasToken) return
    let cancelled = false
    const run = async () => {
      setLoadingGames(true)
      setGamesError(null)
      try {
        let cursor
        let all = []
        for (let i = 0; i < 20; i++) { // cap at 20 pages (~2000 games)
          const data = await fetchMatchHistory({ cursor, limit: 100 })
          if (cancelled) return
          all = all.concat(data.games ?? [])
          cursor = data.next_cursor
          if (!cursor) break
        }
        if (!cancelled) setGames(all)
      } catch (err) {
        if (!cancelled) setGamesError(err.message)
      } finally {
        if (!cancelled) setLoadingGames(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [hasToken])

  // Two-color pairs from public stats
  const twoColorPairs = useMemo(() => {
    if (!stats?.colorPairs) return []
    return stats.colorPairs
      .filter(cp => cp.colors.length === 2)
      .map(cp => ({ ...cp, key: colorsKey(cp.colors) }))
  }, [stats])

  // Auto-pick most-played ink combo from user's games (used until user picks one)
  const mostPlayedKey = useMemo(() => {
    if (!games.length) return ''
    const counts = new Map()
    for (const g of games) {
      const cols = parseColorString(g.your_deck_colors)
      if (cols.length !== 2) continue
      const k = colorsKey(cols)
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    let best = ''
    let bestN = 0
    for (const [k, n] of counts) {
      if (n > bestN) { bestN = n; best = k }
    }
    return best
  }, [games])

  const yourColorsKey = yourColorsKeyOverride ?? mostPlayedKey
  const yourColors = useMemo(() => yourColorsKey ? yourColorsKey.split('+') : [], [yourColorsKey])

  // Lookup matchup row from public stats (in either direction)
  const matchupLookup = useMemo(() => {
    const map = new Map()
    for (const m of (stats?.matchups ?? [])) {
      const a = colorsKey(m.colorsA)
      const b = colorsKey(m.colorsB)
      // forward: A's perspective
      map.set(`${a}|${b}`, { ...m, _flipped: false })
      // reverse: B's perspective — flip winrate
      map.set(`${b}|${a}`, {
        ...m,
        _flipped: true,
        winRate: 100 - m.winRate,
        winsA: m.games - m.winsA,
        colorsA: m.colorsB,
        colorsB: m.colorsA,
      })
    }
    return map
  }, [stats])

  // Personal record per opponent color pair (for selected deck), split by play/draw
  const personalByOpp = useMemo(() => {
    const map = new Map() // key -> { wins, losses, games, playWins, playGames, drawWins, drawGames }
    if (!yourColors.length) return map
    const myKey = yourColorsKey
    for (const g of games) {
      const my = parseColorString(g.your_deck_colors)
      if (colorsKey(my) !== myKey) continue
      const opp = parseColorString(g.opp_deck_colors)
      if (opp.length !== 2) continue
      const k = colorsKey(opp)
      const cur = map.get(k) ?? { wins: 0, losses: 0, games: 0, playWins: 0, playGames: 0, drawWins: 0, drawGames: 0 }
      const r = (g.result ?? '').toLowerCase()
      const isWin = r === 'win'
      const isLoss = r === 'loss'
      if (isWin) cur.wins++
      else if (isLoss) cur.losses++
      if (isWin || isLoss) {
        cur.games++
        if (g.went_first === true) {
          cur.playGames++; if (isWin) cur.playWins++
        } else if (g.went_first === false) {
          cur.drawGames++; if (isWin) cur.drawWins++
        }
      }
      map.set(k, cur)
    }
    return map
  }, [games, yourColors, yourColorsKey])

  // Global personal play/draw delta (fallback when per-matchup data is thin)
  const globalPlayDelta = useMemo(() => {
    let pw = 0, pg = 0, dw = 0, dg = 0
    for (const g of games) {
      const r = (g.result ?? '').toLowerCase()
      const isWin = r === 'win'
      const isLoss = r === 'loss'
      if (!isWin && !isLoss) continue
      if (g.went_first === true) { pg++; if (isWin) pw++ }
      else if (g.went_first === false) { dg++; if (isWin) dw++ }
    }
    if (pg < 30 || dg < 30) return null // need a decent sample
    return (pw / pg) - (dw / dg) // positive = play favored
  }, [games])

  // Default meta % from public stats popularity (share of games played).
  // Pairs below the rogue threshold default to 0; the rest are renormalized to sum to 100.
  const defaultMetaByKey = useMemo(() => {
    const totalGames = twoColorPairs.reduce((s, cp) => s + (cp.games ?? 0), 0)
    if (totalGames <= 0) return {}
    const raw = {}
    let keptSum = 0
    for (const cp of twoColorPairs) {
      const share = (cp.games / totalGames) * 100
      if (share >= ROGUE_THRESHOLD) {
        raw[cp.key] = share
        keptSum += share
      } else {
        raw[cp.key] = 0
      }
    }
    if (keptSum <= 0) return raw
    const scale = 100 / keptSum
    for (const k of Object.keys(raw)) {
      if (raw[k] > 0) raw[k] = raw[k] * scale
    }
    return raw
  }, [twoColorPairs])

  const effectiveMetaPct = (key) => metaOverrides[key] ?? defaultMetaByKey[key] ?? 0

  // Raw sum (for the "your % sums to N" message) and planning sum (rogue decks zeroed)
  const totalMetaPct = useMemo(() => {
    return twoColorPairs.reduce((s, cp) => s + (metaOverrides[cp.key] ?? defaultMetaByKey[cp.key] ?? 0), 0)
  }, [twoColorPairs, metaOverrides, defaultMetaByKey])

  const planningTotalMetaPct = useMemo(() => {
    return twoColorPairs.reduce((s, cp) => {
      const v = metaOverrides[cp.key] ?? defaultMetaByKey[cp.key] ?? 0
      return s + (v >= ROGUE_THRESHOLD ? v : 0)
    }, 0)
  }, [twoColorPairs, metaOverrides, defaultMetaByKey])

  // Build plan rows
  const planRows = useMemo(() => {
    if (!yourColors.length || !twoColorPairs.length) return []
    const rows = twoColorPairs.map(cp => {
      const metaPct = metaOverrides[cp.key] ?? defaultMetaByKey[cp.key] ?? 0
      const isRogue = metaPct < ROGUE_THRESHOLD
      const planningMetaPct = isRogue ? 0 : metaPct
      const normalizedMeta = planningTotalMetaPct > 0 ? planningMetaPct / planningTotalMetaPct : 0
      const lookup = matchupLookup.get(`${yourColorsKey}|${cp.key}`)
      const publicWR = lookup?.winRate ?? null
      const personal = personalByOpp.get(cp.key)
      const wins = personal?.wins ?? 0
      const n = personal?.games ?? 0
      const personalWR = n > 0 ? (wins / n) * 100 : null
      const delta = (personalWR != null && publicWR != null) ? personalWR - publicWR : null

      // Bayesian-shrunk estimate: blend personal data with public matrix prior
      const shrunkWR = shrinkWR(wins, n, publicWR) * 100
      // Effective WR: shrunk when we have any personal data, else public, else 50
      const effectiveWR = n > 0 ? shrunkWR : (publicWR ?? 50)
      const [ciLo, ciHi] = n > 0 ? wilsonInterval(wins, n).map(x => x * 100) : [null, null]

      // Play/draw split (0..100). Priority:
      //  1. Personal split if ≥5 games on each side (shrunk to overall effective)
      //  2. Public matrix firstPlayerWinRate if present
      //  3. Apply global personal play-delta to effective WR
      //  4. Default: no split (both equal to effectiveWR)
      let wrPlay = effectiveWR
      let wrDraw = effectiveWR
      let splitSource = 'flat'
      const pubFirstWR = lookup?.firstPlayerWinRate ?? null
      if (personal && personal.playGames >= 5 && personal.drawGames >= 5) {
        // Shrink each side toward effective WR
        const priorN = 8
        wrPlay = ((personal.playWins + (effectiveWR / 100) * priorN) / (personal.playGames + priorN)) * 100
        wrDraw = ((personal.drawWins + (effectiveWR / 100) * priorN) / (personal.drawGames + priorN)) * 100
        splitSource = 'personal'
      } else if (pubFirstWR != null && publicWR != null) {
        // Public: firstPlayerWinRate is hero-on-play WR. wrDraw = 2*mean - play
        const delta = pubFirstWR - publicWR
        wrPlay = effectiveWR + delta
        wrDraw = effectiveWR - delta
        splitSource = 'public'
      } else if (globalPlayDelta != null) {
        const half = (globalPlayDelta * 100) / 2
        wrPlay = effectiveWR + half
        wrDraw = effectiveWR - half
        splitSource = 'global'
      }
      // Clamp
      wrPlay = Math.max(1, Math.min(99, wrPlay)) / 100
      wrDraw = Math.max(1, Math.min(99, wrDraw)) / 100

      // Practice lift assumption: if you're below public, you can realistically
      // close the gap to public; if you're at/above, you can squeeze ~3pp more.
      const ceilingWR = publicWR != null
        ? Math.max(effectiveWR + 3, publicWR + 2)
        : effectiveWR + 5
      // Event-WR lift if you brought this matchup to its ceiling
      const liftPP = normalizedMeta * ((ceilingWR - effectiveWR) / 100) * 100

      // Impact = meta share × gap to ceiling (instead of just 1-WR).
      // This pushes reps toward matchups where practice actually moves the number.
      const impact = Math.max(0, normalizedMeta * (ceilingWR - effectiveWR) / 100)

      return {
        key: cp.key,
        colors: cp.colors,
        metaPct,
        isRogue,
        normalizedMeta,
        wrPlay,
        wrDraw,
        splitSource,
        publicWR,
        publicGames: lookup?.games ?? 0,
        personal,
        personalWR,
        ciLo,
        ciHi,
        shrunkWR,
        effectiveWR,
        ceilingWR,
        liftPP,
        delta,
        impact,
      }
    })
    // Distribute practice budget by impact (with a floor for meaningful-meta matchups)
    const totalImpact = rows.reduce((s, r) => s + r.impact, 0) || 1
    rows.forEach(r => {
      const raw = (r.impact / totalImpact) * practiceBudget
      r.recommendedReps = Math.round(raw)
    })
    return rows
  }, [twoColorPairs, yourColors, yourColorsKey, matchupLookup, personalByOpp, planningTotalMetaPct, practiceBudget, metaOverrides, defaultMetaByKey, globalPlayDelta])

  const sortedPlanRows = useMemo(() => {
    const rows = planRows.slice()
    const cmp = {
      meta: (a, b) => b.metaPct - a.metaPct,
      impact: (a, b) => b.impact - a.impact,
      personal: (a, b) => (a.personalWR ?? -1) - (b.personalWR ?? -1),
      public: (a, b) => (a.publicWR ?? -1) - (b.publicWR ?? -1),
      lift: (a, b) => b.liftPP - a.liftPP,
    }
    rows.sort(cmp[sortBy] ?? cmp.meta)
    return rows
  }, [planRows, sortBy])

  // Tournament outlook: Monte Carlo over BO1 or BO3 matches against meta distribution
  const [tournamentRounds, setTournamentRounds] = useState(7)
  const [matchFormat, setMatchFormat] = useState('bo3') // 'bo1' | 'bo3'
  const MC_SIMS = 20000

  const outlook = useMemo(() => {
    if (!planRows.length) return null
    let coveredMeta = 0
    let blindMeta = 0
    const blindMatchups = []
    for (const r of planRows) {
      if (r.personal && r.personal.games >= 5) coveredMeta += r.normalizedMeta
      else if (r.normalizedMeta >= 0.03) {
        blindMeta += r.normalizedMeta
        blindMatchups.push(r)
      }
    }

    const activeRows = planRows.filter(r => r.normalizedMeta > 0)
    const mc = runMonteCarlo({ rows: activeRows, rounds: tournamentRounds, format: matchFormat, sims: MC_SIMS })
    if (!mc) return null

    // Ceiling sim: every matchup brought to its ceiling, preserving play/draw spread
    const ceilingRows = activeRows.map(r => {
      const lift = (r.ceilingWR - r.effectiveWR) / 100
      return { ...r, wrPlay: Math.min(0.99, r.wrPlay + lift), wrDraw: Math.min(0.99, r.wrDraw + lift) }
    })
    const mcCeiling = runMonteCarlo({ rows: ceilingRows, rounds: tournamentRounds, format: matchFormat, sims: MC_SIMS })

    const recordProbs = mc.recordCounts.map((count, w) => ({
      w,
      l: tournamentRounds - w,
      prob: count / mc.sims,
    }))
    // Top-cut tail probs
    let cut51 = 0, cut62 = 0
    for (let w = tournamentRounds - 1; w <= tournamentRounds; w++) cut51 += recordProbs[w].prob
    for (let w = tournamentRounds - 2; w <= tournamentRounds; w++) cut62 += recordProbs[w]?.prob ?? 0
    const xMinus0 = recordProbs[tournamentRounds].prob

    return {
      expectedWR: mc.expectedMatchWR,
      upliftedWR: mcCeiling?.expectedMatchWR ?? mc.expectedMatchWR,
      maxLiftPP: (mcCeiling?.expectedMatchWR ?? mc.expectedMatchWR) - mc.expectedMatchWR,
      coveredMeta: coveredMeta * 100,
      blindMeta: blindMeta * 100,
      blindMatchups: blindMatchups.sort((a, b) => b.normalizedMeta - a.normalizedMeta).slice(0, 5),
      recordProbs,
      cut51: cut51 * 100,
      cut62: cut62 * 100,
      xMinus0: xMinus0 * 100,
      sims: mc.sims,
    }
  }, [planRows, tournamentRounds, matchFormat])

  // Alternative decks: what's your expected WR with your other 2-color decks?
  const deckAlternatives = useMemo(() => {
    if (!games.length || !twoColorPairs.length) return []
    // Count games per personal deck
    const myDeckGames = new Map()
    for (const g of games) {
      const my = parseColorString(g.your_deck_colors)
      if (my.length !== 2) continue
      const k = colorsKey(my)
      myDeckGames.set(k, (myDeckGames.get(k) ?? 0) + 1)
    }
    const candidates = [...myDeckGames.entries()]
      .filter(([, n]) => n >= 20)
      .map(([k]) => k)
    if (!candidates.length) return []

    // For each candidate deck, compute expected event WR against the current meta
    return candidates.map(deckKey => {
      const colors = deckKey.split('+')
      // Personal opp record on THIS deck
      const oppRecord = new Map()
      for (const g of games) {
        const my = parseColorString(g.your_deck_colors)
        if (colorsKey(my) !== deckKey) continue
        const opp = parseColorString(g.opp_deck_colors)
        if (opp.length !== 2) continue
        const k = colorsKey(opp)
        const cur = oppRecord.get(k) ?? { wins: 0, games: 0 }
        if ((g.result ?? '').toLowerCase() === 'win') cur.wins++
        if ((g.result ?? '').toLowerCase() === 'win' || (g.result ?? '').toLowerCase() === 'loss') cur.games++
        oppRecord.set(k, cur)
      }
      let expWR = 0
      let totalGames = 0
      for (const cp of twoColorPairs) {
        const metaPct = metaOverrides[cp.key] ?? defaultMetaByKey[cp.key] ?? 0
        if (metaPct < ROGUE_THRESHOLD) continue
        const normalizedMeta = planningTotalMetaPct > 0 ? metaPct / planningTotalMetaPct : 0
        if (!normalizedMeta) continue
        const lookup = matchupLookup.get(`${deckKey}|${cp.key}`)
        const publicWR = lookup?.winRate ?? null
        const personal = oppRecord.get(cp.key)
        const wr = shrinkWR(personal?.wins ?? 0, personal?.games ?? 0, publicWR) * 100
        expWR += normalizedMeta * (wr / 100)
        totalGames += personal?.games ?? 0
      }
      return { key: deckKey, colors, expectedWR: expWR * 100, totalGames, sampleN: myDeckGames.get(deckKey) }
    }).sort((a, b) => b.expectedWR - a.expectedWR)
  }, [games, twoColorPairs, matchupLookup, metaOverrides, defaultMetaByKey, planningTotalMetaPct])

  // Gamelog records for the selected deck, with turns/challenges refreshed from
  // raw logs (older records were parsed before the turn-segmentation fix).
  const deckRecords = useMemo(() => {
    if (!yourColorsKey) return []
    const out = []
    for (const g of savedGamelogs) {
      const my = g.myInkCombo ?? []
      if (my.length !== 2 || colorsKey(my) !== yourColorsKey) continue
      let rec = g
      if (Array.isArray(g._rawLogs) && g._rawLogs.length) {
        const reparsed = parseGamelog(g.id, g._rawLogs, { yourPlayerNum: g.myPlayerNum })
        rec = { ...g, turns: reparsed.turns, challenges: reparsed.challenges }
      }
      out.push(rec)
    }
    return out
  }, [savedGamelogs, yourColorsKey])

  const overallSkills = useMemo(() => (deckRecords.length ? summarizeLeaks(deckRecords) : null), [deckRecords])

  // Leak summary per opponent color pair (for matchup cross-reference)
  const leaksByMatchup = useMemo(() => {
    const groups = new Map()
    for (const r of deckRecords) {
      const opp = r.oppInkCombo ?? []
      if (opp.length !== 2) continue
      const k = colorsKey(opp)
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(r)
    }
    const out = new Map()
    for (const [k, recs] of groups) out.set(k, { summary: summarizeLeaks(recs), games: recs.length })
    return out
  }, [deckRecords])

  // Weak matchups (you underperform or sit below ~50%) that you also have
  // gamelog coverage for — the highest-ROI places to fix specific leaks.
  const weakMatchupDrills = useMemo(() => {
    const rows = []
    for (const r of planRows) {
      const entry = leaksByMatchup.get(r.key)
      if (!entry || !entry.summary.ranked.length) continue
      const weak = (r.effectiveWR != null && r.effectiveWR < 52) || (r.delta != null && r.delta <= -8)
      if (!weak) continue
      rows.push({ ...r, leakSummary: entry.summary, gameCount: entry.games })
    }
    return rows
      .sort((a, b) => (b.normalizedMeta - a.normalizedMeta) || (a.effectiveWR - b.effectiveWR))
      .slice(0, 6)
  }, [planRows, leaksByMatchup])

  const visibleRows = showAllMeta ? sortedPlanRows : sortedPlanRows.filter(r => r.metaPct >= 1)

  if (!hasToken) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Practice Plan</h1>
        <p className="text-gray-500 mb-6">Build a focused practice schedule based on your weakest matchups and the expected meta.</p>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
          Connect your duels.ink account to pull your personal win rates per matchup.
          <div className="mt-3">
            <Link to="/settings" className="font-semibold underline">Add your API token →</Link>
          </div>
        </div>
      </div>
    )
  }

  const yourPairOptions = twoColorPairs.slice().sort((a, b) => (b.games ?? 0) - (a.games ?? 0))

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Practice Plan</h1>
        <p className="text-gray-500">
          Pick the deck you're planning to play and the meta you expect. We'll cross-reference your personal win rates
          with the public matrix to highlight where practice time will most affect your event result.
        </p>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Queue (public stats)</label>
          <select
            value={queue}
            onChange={e => setQueue(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {QUEUES.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Your deck</label>
          <select
            value={yourColorsKey}
            onChange={e => setYourColorsKey(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">— select ink pair —</option>
            {yourPairOptions.map(cp => (
              <option key={cp.key} value={cp.key}>
                {cp.colors.join(' / ')} ({cp.winRate?.toFixed?.(1) ?? '?'}% pub WR)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Total practice games: <span className="text-gray-700 font-bold">{practiceBudget}</span>
          </label>
          <input
            type="range" min="10" max="200" step="5"
            value={practiceBudget}
            onChange={e => setPracticeBudget(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      {(loadingStats || loadingGames) && (
        <p className="text-gray-500 text-sm mb-4">
          {loadingStats ? 'Loading public stats… ' : ''}{loadingGames ? 'Loading your match history…' : ''}
        </p>
      )}
      {statsError && <p className="text-red-700 text-sm mb-4">Stats error: {statsError}</p>}
      {gamesError && <p className="text-red-700 text-sm mb-4">Match history error: {gamesError}</p>}

      {yourColors.length > 0 && (
        <div className="mb-6 p-4 border border-gray-200 rounded-lg flex items-center gap-3">
          <span className="text-sm text-gray-600">Planning for:</span>
          <ColorPairIcons colors={yourColors} size={24} />
          <span className="font-semibold text-gray-900">{yourColors.join(' / ')}</span>
          <span className="ml-auto text-sm text-gray-500">
            Personal games on this deck:{' '}
            <span className="font-semibold text-gray-900">
              {[...personalByOpp.values()].reduce((s, p) => s + p.games, 0)}
            </span>
          </span>
        </div>
      )}

      {totalMetaPct > 0 && Math.abs(totalMetaPct - 100) > 1 && (
        <p className="text-xs text-amber-700 mb-3">
          Your meta percentages sum to {totalMetaPct.toFixed(1)}%. Values are normalized for practice allocation.
        </p>
      )}

      {/* Tournament Outlook */}
      {outlook && (
        <div className="mb-6 border border-gray-200 rounded-lg p-5 bg-white">
          <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Tournament outlook</h2>
              <p className="text-xs text-gray-500">Monte Carlo: {outlook.sims.toLocaleString()} simulated tournaments, BO{matchFormat === 'bo3' ? '3' : '1'} with play/draw modeled per matchup</p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="inline-flex rounded border border-gray-200 overflow-hidden">
                {['bo1', 'bo3'].map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setMatchFormat(fmt)}
                    className={`px-3 py-1 text-xs ${matchFormat === fmt ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
              <label className="text-gray-600">Rounds:</label>
              <input
                type="number" min="3" max="12"
                value={tournamentRounds}
                onChange={e => setTournamentRounds(Math.max(3, Math.min(12, Number(e.target.value) || 7)))}
                className="w-14 border border-gray-200 rounded px-2 py-1 text-sm text-right"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Expected match WR</div>
              <div className={`text-2xl font-bold ${getWinrateColor(outlook.expectedWR)}`}>
                {outlook.expectedWR.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500 mt-0.5">vs ceiling {outlook.upliftedWR.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">P(X-1 or better)</div>
              <div className="text-2xl font-bold text-gray-900">{outlook.cut51.toFixed(0)}%</div>
              <div className="text-xs text-gray-500 mt-0.5">{tournamentRounds - 1}-1 record</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">P(X-2 or better)</div>
              <div className="text-2xl font-bold text-gray-900">{outlook.cut62.toFixed(0)}%</div>
              <div className="text-xs text-gray-500 mt-0.5">typical top-cut line</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">P(undefeated)</div>
              <div className="text-2xl font-bold text-gray-900">{outlook.xMinus0.toFixed(1)}%</div>
              <div className="text-xs text-gray-500 mt-0.5">{tournamentRounds}-0</div>
            </div>
          </div>

          {/* Round distribution mini-chart */}
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Record probability distribution</div>
            <div className="flex items-end gap-1 h-20">
              {outlook.recordProbs.map(rp => {
                const maxP = Math.max(...outlook.recordProbs.map(x => x.prob))
                const h = maxP > 0 ? (rp.prob / maxP) * 100 : 0
                const isCut = rp.w >= tournamentRounds - 2
                return (
                  <div key={rp.w} className="flex-1 flex flex-col items-center" title={`${rp.w}-${rp.l}: ${(rp.prob * 100).toFixed(1)}%`}>
                    <div className="text-[10px] text-gray-500">{(rp.prob * 100).toFixed(0)}%</div>
                    <div
                      className={`w-full ${isCut ? 'bg-green-400' : 'bg-gray-300'} rounded-t`}
                      style={{ height: `${h}%`, minHeight: '2px' }}
                    />
                    <div className="text-[10px] text-gray-600 mt-1">{rp.w}-{rp.l}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Coverage */}
          <div className="mt-5 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Data coverage</div>
              <div className="text-gray-800">
                You have ≥5 games against <span className="font-semibold">{outlook.coveredMeta.toFixed(0)}%</span> of the expected meta.
              </div>
              {outlook.blindMeta > 0 && (
                <div className="text-xs text-amber-700 mt-2">
                  Blind spots ({outlook.blindMeta.toFixed(0)}% of meta):{' '}
                  {outlook.blindMatchups.map(r => r.colors.join('/')).join(', ')}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Practice ceiling</div>
              <div className="text-gray-800">
                Closing every matchup to its public-WR ceiling would lift your event WR by{' '}
                <span className="font-semibold">+{outlook.maxLiftPP.toFixed(1)} pp</span>.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Skills to drill (leak-based) */}
      {yourColors.length > 0 && (
        <div className="mb-6 border border-gray-200 rounded-lg p-5 bg-white">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Skills to drill</h2>
          <p className="text-xs text-gray-500 mb-4">
            Recurring leaks detected in your saved gamelogs on this deck. The matchup table tells you <em>where</em> to practice — this tells you <em>what</em> to fix.{' '}
            <Link to="/gamelog-analyzer" className="text-blue-600 hover:underline">Import more games</Link> for sharper signal.
          </p>

          {!overallSkills || overallSkills.analyzed === 0 ? (
            <p className="text-sm text-gray-400">
              No gamelogs imported for {yourColors.join('/')} yet. Import games in the{' '}
              <Link to="/gamelog-analyzer" className="text-blue-600 hover:underline">Gamelog Analyzer</Link> to unlock skill drills.
            </p>
          ) : (
            <>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                Top leaks across {overallSkills.analyzed} game{overallSkills.analyzed !== 1 ? 's' : ''} · {Math.round(overallSkills.overallWinRate * 100)}% WR
              </div>
              <div className="space-y-2.5 mb-5">
                {overallSkills.ranked.slice(0, 4).map(leak => {
                  const meta = LEAK_TYPES[leak.type] ?? { label: leak.type }
                  const wr = leak.winRateWhenPresent
                  const drag = wr != null && wr < overallSkills.overallWinRate
                  return (
                    <div key={leak.type} className="text-sm">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-800">{meta.label}</span>
                        <span className="text-xs text-gray-400">{leak.gamesAffected}/{overallSkills.analyzed} games</span>
                        {wr != null && (
                          <span className={`text-xs ${drag ? 'text-red-600' : 'text-gray-500'}`}>
                            {Math.round(wr * 100)}% WR when present{drag ? ` (−${Math.round((overallSkills.overallWinRate - wr) * 100)}pp)` : ''}
                          </span>
                        )}
                      </div>
                      {meta.tip && <p className="text-xs text-gray-500 mt-0.5">{meta.tip}</p>}
                    </div>
                  )
                })}
              </div>

              {weakMatchupDrills.length > 0 && (
                <div className="pt-4 border-t border-gray-100">
                  <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Weak matchups — what's going wrong</div>
                  <div className="space-y-2">
                    {weakMatchupDrills.map(row => {
                      const topLeaks = row.leakSummary.ranked.slice(0, 3)
                      return (
                        <div key={row.key} className="flex items-start gap-3 text-sm">
                          <div className="w-40 flex items-center gap-2 flex-shrink-0 pt-0.5">
                            <ColorPairIcons colors={row.colors} size={18} />
                            <span className="text-gray-700 truncate">{row.colors.join('/')}</span>
                          </div>
                          <div className="flex-shrink-0 w-24 pt-0.5">
                            <span className={getWinrateColor(row.effectiveWR)}>{row.effectiveWR.toFixed(0)}%</span>
                            <span className="text-xs text-gray-400 ml-1">{row.gameCount}g</span>
                          </div>
                          <div className="flex-1 text-xs text-gray-600">
                            {topLeaks.length
                              ? topLeaks.map(l => `${(LEAK_TYPES[l.type] ?? {}).label ?? l.type} (×${l.totalCount})`).join(' · ')
                              : 'no leaks flagged'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-3">Leaks are inferred from log data — patterns to review, not certain mistakes.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Alternative decks */}
      {deckAlternatives.length > 1 && (
        <div className="mb-6 border border-gray-200 rounded-lg p-5 bg-white">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Better deck for this meta?</h2>
          <p className="text-xs text-gray-500 mb-3">
            Expected match WR for each ink pair you've played ≥20 games on, vs the meta above (shrunk to public-WR prior where personal data is thin).
          </p>
          <div className="space-y-1.5">
            {deckAlternatives.slice(0, 6).map((d, i) => {
              const isCurrent = d.key === yourColorsKey
              const best = deckAlternatives[0]
              const barW = best.expectedWR > 0 ? (d.expectedWR / best.expectedWR) * 100 : 0
              return (
                <div key={d.key} className={`flex items-center gap-3 text-sm ${isCurrent ? 'font-semibold' : ''}`}>
                  <div className="w-44 flex items-center gap-2 flex-shrink-0">
                    <div className="flex-shrink-0">
                      <ColorPairIcons colors={d.colors} size={18} />
                    </div>
                    <span className="text-gray-700 truncate">{d.colors.join('/')}</span>
                  </div>
                  <div className="flex-1 bg-gray-100 rounded h-5 relative overflow-hidden">
                    <div
                      className={`h-full ${i === 0 ? 'bg-green-300' : 'bg-gray-300'}`}
                      style={{ width: `${barW}%` }}
                    />
                    <div className="absolute inset-0 flex items-center px-2 text-xs text-gray-800">
                      {d.expectedWR.toFixed(1)}% · {d.sampleN} games on deck
                    </div>
                  </div>
                  {isCurrent && <span className="text-xs text-gray-500 w-16">(current)</span>}
                  {!isCurrent && <span className="w-16" />}
                </div>
              )
            })}
          </div>
          {deckAlternatives[0].key !== yourColorsKey && (
            <p className="text-xs text-amber-700 mt-3">
              <strong>{deckAlternatives[0].colors.join('/')}</strong> projects{' '}
              {(deckAlternatives[0].expectedWR - (deckAlternatives.find(d => d.key === yourColorsKey)?.expectedWR ?? 0)).toFixed(1)} pp higher
              against this meta. Worth a few test sets before locking in.
            </p>
          )}
        </div>
      )}

      {/* Plan table */}
      {planRows.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left px-3 py-2">Opponent</th>
                <th
                  className={`text-right px-3 py-2 cursor-pointer hover:text-gray-900 ${sortBy === 'meta' ? 'text-gray-900' : ''}`}
                  onClick={() => setSortBy('meta')}
                >
                  Expected meta % {sortBy === 'meta' && '↓'}
                </th>
                <th
                  className={`text-right px-3 py-2 cursor-pointer hover:text-gray-900 ${sortBy === 'personal' ? 'text-gray-900' : ''}`}
                  onClick={() => setSortBy('personal')}
                >
                  Your WR {sortBy === 'personal' && '↑'}
                </th>
                <th
                  className={`text-right px-3 py-2 cursor-pointer hover:text-gray-900 ${sortBy === 'public' ? 'text-gray-900' : ''}`}
                  onClick={() => setSortBy('public')}
                >
                  Public WR {sortBy === 'public' && '↑'}
                </th>
                <th className="text-right px-3 py-2" title="Game-1 win rate on the play / on the draw">Play / Draw</th>
                <th className="text-right px-3 py-2">Δ</th>
                <th
                  className={`text-right px-3 py-2 cursor-pointer hover:text-gray-900 ${sortBy === 'lift' ? 'text-gray-900' : ''}`}
                  onClick={() => setSortBy('lift')}
                  title="Event WR lift if you bring this matchup to its ceiling"
                >
                  Lift if practiced {sortBy === 'lift' && '↓'}
                </th>
                <th
                  className={`text-right px-3 py-2 cursor-pointer hover:text-gray-900 ${sortBy === 'impact' ? 'text-gray-900' : ''}`}
                  onClick={() => setSortBy('impact')}
                >
                  Practice reps {sortBy === 'impact' && '↓'}
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(row => {
                const lowSample = !row.personal || row.personal.games < 5
                const underperforming = row.delta != null && row.delta <= -8
                return (
                  <tr key={row.key} className={`border-t border-gray-100 ${row.isRogue ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <ColorPairIcons colors={row.colors} size={20} />
                        <span className="text-gray-800">{row.colors.join(' / ')}</span>
                        {underperforming && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                            underperforming
                          </span>
                        )}
                        {lowSample && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-200">
                            low sample
                          </span>
                        )}
                        {row.isRogue && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-200">
                            rogue (&lt;{ROGUE_THRESHOLD}%)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={Number(effectiveMetaPct(row.key).toFixed(1))}
                        onChange={e => setMetaOverrides(prev => ({ ...prev, [row.key]: Number(e.target.value) }))}
                        className="w-16 text-right border border-gray-200 rounded px-2 py-1 text-sm"
                      />
                      <span className="text-gray-400 ml-1">%</span>
                    </td>
                    <td className={`px-3 py-2 text-right ${getWinrateColor(row.personalWR)}`}>
                      {row.personalWR != null ? `${row.personalWR.toFixed(0)}%` : '—'}
                      <span className="text-xs text-gray-400 ml-1">
                        {row.personal ? `(${row.personal.wins}-${row.personal.losses})` : '(0-0)'}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right ${getWinrateColor(row.publicWR)}`}>
                      {row.publicWR != null ? `${row.publicWR.toFixed(0)}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-600" title={`source: ${row.splitSource}`}>
                      {(row.wrPlay * 100).toFixed(0)} / {(row.wrDraw * 100).toFixed(0)}
                    </td>
                    <td className={`px-3 py-2 text-right ${deltaColor(row.delta)}`}>
                      {row.delta != null ? `${row.delta > 0 ? '+' : ''}${row.delta.toFixed(0)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {row.liftPP > 0.05 ? `+${row.liftPP.toFixed(2)} pp` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">
                      {row.recommendedReps}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {planRows.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setShowAllMeta(s => !s)}
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            {showAllMeta ? 'Hide matchups below 1% meta' : 'Show all matchups'}
          </button>
          <button
            onClick={() => setMetaOverrides({})}
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Reset meta to public popularity
          </button>
        </div>
      )}

      <details className="mt-8 border-t border-gray-200 pt-6">
        <summary className="text-sm font-semibold text-gray-700 cursor-pointer hover:text-gray-900">
          Methodology
        </summary>
        <div className="mt-4 text-xs text-gray-600 space-y-4 max-w-3xl">

          <section>
            <h3 className="font-semibold text-gray-800 mb-1">Data sources</h3>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Public matrix:</strong> aggregate matchup win rates from duels.ink for the selected queue, all-time, all ranks. Each cell carries games played, overall WR, and first-player WR.</li>
              <li><strong>Personal history:</strong> your full match history pulled from duels.ink (up to 2,000 most recent games), filtered to the selected ink pair. Each row has result, opponent colors, and whether you went first.</li>
              <li><strong>Meta distribution:</strong> defaults to public popularity of each ink pair on the selected queue, with any pair below the {ROGUE_THRESHOLD}% rogue threshold set to 0 and the remaining pairs renormalized so the visible meta sums to 100%. You can override any cell — including bringing a rogue deck back in if you expect it to spike.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-800 mb-1">Win-rate estimation (Bayesian shrinkage)</h3>
            <p>Per matchup, the effective WR used for the sim is a weighted blend of your personal record and the public matrix:</p>
            <pre className="bg-gray-50 border border-gray-200 rounded px-2 py-1 my-1 text-[11px] overflow-x-auto">effective_wr = (personal_wins + public_wr × N₀) / (personal_games + N₀),  N₀ = 10</pre>
            <p>This treats the public matrix as a 10-game prior. A 1-3 record (25% raw) gets pulled most of the way back to the public WR; a 30-15 record (67% raw) barely moves. Without this, small samples dominate and recommendations whiplash from week to week.</p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-800 mb-1">Play/Draw modeling</h3>
            <p>Going first has a meaningful edge in Lorcana, and the matrix reports first-player WR explicitly. For each matchup we split <code>effective_wr</code> into <code>wr_play</code> and <code>wr_draw</code> using the first available source:</p>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li><strong>Personal split</strong> if you have ≥5 games each going first and going second (shrunk to the effective WR with N₀=8)</li>
              <li><strong>Public matrix</strong> first-player WR delta applied symmetrically (<code>wr_play = effective + δ</code>, <code>wr_draw = effective − δ</code>)</li>
              <li><strong>Global personal delta</strong> — your aggregate first-play advantage across all your games (needs ≥30 of each side)</li>
              <li><strong>Flat</strong> — fall back to a 50/50 game-1 split when no signal exists</li>
            </ol>
          </section>

          <section>
            <h3 className="font-semibold text-gray-800 mb-1">Monte Carlo tournament simulation</h3>
            <p>{MC_SIMS.toLocaleString()} simulated tournaments per render. Each tournament:</p>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>Plays {tournamentRounds} rounds. Each round draws a random opponent from the renormalized meta distribution (rogue decks &lt;{ROGUE_THRESHOLD}% excluded).</li>
              <li>Plays a {matchFormat.toUpperCase()} match against that opponent using the matchup's <code>wr_play</code> / <code>wr_draw</code>.</li>
              {matchFormat === 'bo3' && (
                <li><strong>BO3 protocol:</strong> game 1 is a coin flip for who goes first. After each game, the loser picks play/draw for the next. A rational loser picks the side that's better for them (play if play-WR &gt; draw-WR on their side), which is exactly what the sim does. Match ends at 2 wins.</li>
              )}
              <li>Records the win count. The distribution across {MC_SIMS.toLocaleString()} tournaments produces the record probabilities and top-cut tail probabilities shown above.</li>
            </ol>
            <p className="mt-2"><strong>Known limitations:</strong> Swiss pairings cluster you with similar-record opponents (so your effective opponent strength rises as you win) and avoid rematches. The sim treats rounds as IID against the meta — close, but real top-cut odds skew slightly higher than shown.</p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-800 mb-1">Practice rep allocation</h3>
            <p>For each matchup we estimate a realistic ceiling: <code>ceiling = max(public_wr + 2pp, effective_wr + 3pp)</code>. The <em>lift if practiced</em> column reports the event-WR points you'd gain if that matchup hit its ceiling:</p>
            <pre className="bg-gray-50 border border-gray-200 rounded px-2 py-1 my-1 text-[11px] overflow-x-auto">lift_pp = normalized_meta_share × (ceiling_wr − effective_wr)</pre>
            <p>Your {practiceBudget}-game budget is allocated proportionally to lift, so reps flow to matchups where practice actually moves the scoreboard — not just matchups where you're losing. A 70% win rate matchup with 30% meta share gets more reps than a 35% win rate matchup with 5% meta share.</p>
            <p className="mt-2">The <strong>Practice ceiling</strong> headline runs a second Monte Carlo with every matchup lifted to its ceiling, giving you the true match-WR delta available from preparation.</p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-800 mb-1">Filters & flags</h3>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Rogue cutoff ({ROGUE_THRESHOLD}%):</strong> pairs whose public popularity is below this threshold default to 0% meta share (the remaining pairs are renormalized to sum to 100%) and are rendered grayed-out for reference. You can manually override a rogue deck back to a non-zero share if you expect it to show up at your event.</li>
              <li><strong>Low sample:</strong> &lt;5 personal games on the matchup. The estimate is dominated by the public prior.</li>
              <li><strong>Underperforming:</strong> personal WR trails public WR by ≥8 pp. Likely a knowledge gap — high ROI to practice.</li>
              <li><strong>Blind spot:</strong> ≥3% meta share with &lt;5 personal games. These matchups inject the most uncertainty into your projection.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-800 mb-1">Alternative deck comparison</h3>
            <p>For each ink pair you've played ≥20 games on, we compute the expected match WR against the input meta by running the same per-matchup WR estimation (with that deck's personal data) against the active meta. The deck on top is the highest-projection option from your playable pool — not just the best matchup matrix, but the best one you actually have reps with.</p>
          </section>

        </div>
      </details>
    </div>
  )
}
