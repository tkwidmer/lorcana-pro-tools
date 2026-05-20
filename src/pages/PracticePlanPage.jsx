import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getToken, fetchMatchHistory, fetchStats } from '../lib/duelsApi'
import { resolveColors } from '../lib/inkColors'

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
      className="inline-block"
      style={{ width: `${size}px`, height: `${size}px` }}
    />
  )
}

function ColorPairIcons({ colors, size = 20 }) {
  return (
    <div className="inline-flex gap-1 align-middle">
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

// Binomial probability mass P(X = k | n, p)
function binomPMF(n, k, p) {
  if (k < 0 || k > n) return 0
  // log-space for stability
  let logC = 0
  for (let i = 1; i <= k; i++) logC += Math.log((n - k + i) / i)
  return Math.exp(logC + k * Math.log(p) + (n - k) * Math.log(1 - p))
}

// P(X >= k | n, p)
function binomTail(n, k, p) {
  let sum = 0
  for (let i = k; i <= n; i++) sum += binomPMF(n, i, p)
  return sum
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

  // Personal record per opponent color pair (for selected deck)
  const personalByOpp = useMemo(() => {
    const map = new Map() // key -> { wins, losses, games }
    if (!yourColors.length) return map
    const myKey = yourColorsKey
    for (const g of games) {
      const my = parseColorString(g.your_deck_colors)
      if (colorsKey(my) !== myKey) continue
      const opp = parseColorString(g.opp_deck_colors)
      if (opp.length !== 2) continue
      const k = colorsKey(opp)
      const cur = map.get(k) ?? { wins: 0, losses: 0, games: 0 }
      const r = (g.result ?? '').toLowerCase()
      if (r === 'win') cur.wins++
      else if (r === 'loss') cur.losses++
      cur.games++
      map.set(k, cur)
    }
    return map
  }, [games, yourColors, yourColorsKey])

  // Default meta % from public stats popularity (share of games played)
  const defaultMetaByKey = useMemo(() => {
    const totalGames = twoColorPairs.reduce((s, cp) => s + (cp.games ?? 0), 0)
    const out = {}
    for (const cp of twoColorPairs) {
      out[cp.key] = totalGames > 0 ? (cp.games / totalGames) * 100 : 0
    }
    return out
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
  }, [twoColorPairs, yourColors, yourColorsKey, matchupLookup, personalByOpp, planningTotalMetaPct, practiceBudget, metaOverrides, defaultMetaByKey])

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

  // Tournament outlook: expected match WR + round-by-round projection
  const [tournamentRounds, setTournamentRounds] = useState(7)

  const outlook = useMemo(() => {
    if (!planRows.length) return null
    let expectedWR = 0
    let upliftedWR = 0
    let coveredMeta = 0
    let blindMeta = 0
    const blindMatchups = []
    for (const r of planRows) {
      expectedWR += r.normalizedMeta * (r.effectiveWR / 100)
      upliftedWR += r.normalizedMeta * (r.ceilingWR / 100)
      if (r.personal && r.personal.games >= 5) coveredMeta += r.normalizedMeta
      else if (r.normalizedMeta >= 0.03) {
        blindMeta += r.normalizedMeta
        blindMatchups.push(r)
      }
    }
    const p = Math.max(0.01, Math.min(0.99, expectedWR))
    // P(record) over Swiss rounds
    const recordProbs = []
    for (let w = 0; w <= tournamentRounds; w++) {
      recordProbs.push({ w, l: tournamentRounds - w, prob: binomPMF(tournamentRounds, w, p) })
    }
    // Common top-cut thresholds
    const cut51 = binomTail(tournamentRounds, Math.max(0, tournamentRounds - 1), p) // X-1 or better
    const cut62 = binomTail(tournamentRounds, Math.max(0, tournamentRounds - 2), p) // X-2 or better
    const xMinus0 = binomPMF(tournamentRounds, tournamentRounds, p)

    return {
      expectedWR: expectedWR * 100,
      upliftedWR: upliftedWR * 100,
      maxLiftPP: (upliftedWR - expectedWR) * 100,
      coveredMeta: coveredMeta * 100,
      blindMeta: blindMeta * 100,
      blindMatchups: blindMatchups.sort((a, b) => b.normalizedMeta - a.normalizedMeta).slice(0, 5),
      recordProbs,
      cut51: cut51 * 100,
      cut62: cut62 * 100,
      xMinus0: xMinus0 * 100,
    }
  }, [planRows, tournamentRounds])

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
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Tournament outlook</h2>
            <div className="flex items-center gap-2 text-sm">
              <label className="text-gray-600">Swiss rounds:</label>
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
                  <div className="w-32 flex items-center gap-2">
                    <ColorPairIcons colors={d.colors} size={18} />
                    <span className="text-gray-700">{d.colors.join('/')}</span>
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

      <div className="mt-8 text-xs text-gray-500 space-y-1">
        <p><strong>Rogue cutoff:</strong> matchups below {ROGUE_THRESHOLD}% of the meta are excluded from planning math (reps, expected WR, top-cut odds). They're shown grayed-out for reference.</p>
        <p><strong>Effective WR (used for projections):</strong> Bayesian shrinkage — your personal record blended with the public matrix as a 10-game prior, so a 1-3 record doesn't dominate.</p>
        <p><strong>Lift if practiced:</strong> event-WR points you'd gain if this matchup reached its ceiling (max of public WR + 2pp or your current + 3pp). The reps column sorts by this — practice where the points are.</p>
        <p><strong>Round projection:</strong> binomial with p = expected WR, treats rounds as independent (Swiss has some autocorrelation, so real top-cut odds are slightly higher than shown).</p>
        <p><strong>Underperforming flag:</strong> appears when your personal WR trails the public matrix by 8+ pts — likely a knowledge gap, high ROI to practice.</p>
      </div>
    </div>
  )
}
