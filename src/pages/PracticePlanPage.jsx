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

  const totalMetaPct = useMemo(() => {
    return twoColorPairs.reduce((s, cp) => s + (metaOverrides[cp.key] ?? defaultMetaByKey[cp.key] ?? 0), 0)
  }, [twoColorPairs, metaOverrides, defaultMetaByKey])

  // Build plan rows
  const planRows = useMemo(() => {
    if (!yourColors.length || !twoColorPairs.length) return []
    const rows = twoColorPairs.map(cp => {
      const metaPct = metaOverrides[cp.key] ?? defaultMetaByKey[cp.key] ?? 0
      const normalizedMeta = totalMetaPct > 0 ? metaPct / totalMetaPct : 0
      const lookup = matchupLookup.get(`${yourColorsKey}|${cp.key}`)
      const publicWR = lookup?.winRate ?? null
      const personal = personalByOpp.get(cp.key)
      const personalWR = personal && personal.games > 0
        ? (personal.wins / personal.games) * 100
        : null
      const delta = (personalWR != null && publicWR != null)
        ? personalWR - publicWR
        : null
      // Use personal WR if reasonable sample; else fall back to public WR
      const effectiveWR = (personal && personal.games >= 5 && personalWR != null)
        ? personalWR
        : (publicWR ?? 50)
      // Impact = meta share × (1 - winrate) → reps where you can move the needle
      const impact = normalizedMeta * (1 - effectiveWR / 100)
      return {
        key: cp.key,
        colors: cp.colors,
        metaPct,
        normalizedMeta,
        publicWR,
        publicGames: lookup?.games ?? 0,
        personal,
        personalWR,
        delta,
        impact,
      }
    })
    // Distribute practice budget by impact
    const totalImpact = rows.reduce((s, r) => s + r.impact, 0) || 1
    rows.forEach(r => {
      const raw = (r.impact / totalImpact) * practiceBudget
      r.recommendedReps = Math.round(raw)
    })
    rows.sort((a, b) => b.impact - a.impact)
    return rows
  }, [twoColorPairs, yourColors, yourColorsKey, matchupLookup, personalByOpp, totalMetaPct, practiceBudget, metaOverrides, defaultMetaByKey])

  const visibleRows = showAllMeta ? planRows : planRows.filter(r => r.metaPct >= 1)

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

      {/* Plan table */}
      {planRows.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left px-3 py-2">Opponent</th>
                <th className="text-right px-3 py-2">Expected meta %</th>
                <th className="text-right px-3 py-2">Your WR</th>
                <th className="text-right px-3 py-2">Public WR</th>
                <th className="text-right px-3 py-2">Δ</th>
                <th className="text-right px-3 py-2">Practice reps</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(row => {
                const lowSample = !row.personal || row.personal.games < 5
                const underperforming = row.delta != null && row.delta <= -8
                return (
                  <tr key={row.key} className="border-t border-gray-100">
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
        <p><strong>How reps are allocated:</strong> impact = meta share × (1 − win rate). The {practiceBudget} games are split proportionally to impact.</p>
        <p><strong>Win rate source:</strong> uses your personal win rate when you have 5+ games on the matchup; otherwise falls back to the public matrix.</p>
        <p><strong>Underperforming flag:</strong> appears when your personal win rate trails the public matrix by 8+ points — likely a gap in matchup knowledge worth practicing.</p>
      </div>
    </div>
  )
}
