import { useEffect, useMemo, useRef, useState } from 'react'
import { InkIcon as InkImg } from '../InkIcons'
import { buildWinrateMatrixFromGames } from '../../lib/buildWinrateMatrix'
import { computeCardImpact, computeCardImpactTrend } from '../../lib/cardImpact'
import { analyzeOpponentMetagame } from '../../lib/metagameAnalysis'
import { aggregateMulliganWinRates } from '../../lib/analyticsAggregation'

export function MatchupMatrixView({ games }) {
  const { matchups } = buildWinrateMatrixFromGames(games)

  if (matchups.length === 0) {
    return <div className="text-sm text-gray-500">No matchup data available</div>
  }

  // Color helper for winrate cells
  const getWinrateColor = (winRate) => {
    if (winRate >= 60) return 'bg-green-300'
    if (winRate >= 55) return 'bg-green-200'
    if (winRate >= 51) return 'bg-green-100'
    if (winRate >= 49) return 'bg-gray-50'
    if (winRate >= 45) return 'bg-red-100'
    if (winRate >= 40) return 'bg-red-200'
    return 'bg-red-300'
  }

  // Extract unique user decks (rows) and opponent decks (columns) from matchups
  const userDeckMap = new Map()
  const oppDeckMap = new Map()

  matchups.forEach(m => {
    const userKey = JSON.stringify(m.colorsA)
    const oppKey = JSON.stringify(m.colorsB)

    if (!userDeckMap.has(userKey)) {
      userDeckMap.set(userKey, { colors: m.colorsA, wins: 0, games: 0 })
    }
    if (!oppDeckMap.has(oppKey)) {
      oppDeckMap.set(oppKey, { colors: m.colorsB, wins: 0, games: 0 })
    }

    // Aggregate stats for user decks (rows)
    userDeckMap.get(userKey).wins += m.winsA
    userDeckMap.get(userKey).games += m.games

    // Aggregate stats for opponent decks (columns) - from opponent perspective
    oppDeckMap.get(oppKey).wins += (m.games - m.winsA)
    oppDeckMap.get(oppKey).games += m.games
  })

  const userDecks = Array.from(userDeckMap.values()).sort((a, b) => b.games - a.games)
  const oppDecks = Array.from(oppDeckMap.values()).sort((a, b) => b.games - a.games)

  // Build lookup map for quick access
  const matchupMap = new Map()
  matchups.forEach(m => {
    const key = `${JSON.stringify(m.colorsA)}-${JSON.stringify(m.colorsB)}`
    matchupMap.set(key, m)
  })

  // Get matchup (with reverse lookup, flipping first/second perspective)
  const getMatchup = (playerColors, oppColors) => {
    const key = `${JSON.stringify(playerColors)}-${JSON.stringify(oppColors)}`
    let matchup = matchupMap.get(key)

    if (!matchup) {
      const reverseKey = `${JSON.stringify(oppColors)}-${JSON.stringify(playerColors)}`
      const reverseMatchup = matchupMap.get(reverseKey)
      if (reverseMatchup) {
        // Flip win counts and first/second perspective:
        // original "first" = opponent went first = user went second (and vice versa)
        const rf = reverseMatchup
        matchup = {
          ...rf,
          colorsA: rf.colorsB,
          colorsB: rf.colorsA,
          winsA: rf.games - rf.winsA,
          gamesFirst: rf.gamesSecond,
          winsFirst: rf.gamesSecond - rf.winsSecond,
          gamesSecond: rf.gamesFirst,
          winsSecond: rf.gamesFirst - rf.winsFirst,
          winRateFirst: rf.gamesSecond > 0 ? ((rf.gamesSecond - rf.winsSecond) / rf.gamesSecond * 100) : null,
          winRateSecond: rf.gamesFirst > 0 ? ((rf.gamesFirst - rf.winsFirst) / rf.gamesFirst * 100) : null,
        }
      }
    }

    return matchup
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Header row */}
        <div className="flex mb-2">
          <div className="w-24 h-16 flex-shrink-0" />
          {oppDecks.map((colPair, colIdx) => (
            <div
              key={colIdx}
              className="w-24 h-16 flex-shrink-0 flex items-center justify-center text-xs font-semibold"
            >
              <div className="flex flex-col items-center gap-0.5 text-center">
                <span className="text-[10px] font-medium text-gray-600">OPP</span>
                <div className="flex items-center gap-0.5">
                  {colPair.colors.map(c => <InkImg key={c} color={c} size="w-4 h-4" />)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Data rows */}
        {userDecks.map((rowPair, rowIdx) => (
          <div key={rowIdx} className="flex mb-2">
            {/* Row header */}
            <div className="w-24 h-28 flex-shrink-0 flex items-center justify-center text-xs font-semibold border-r border-gray-100">
              <div className="flex flex-col items-center gap-0.5 text-center">
                <span className="text-[10px] font-medium text-gray-600">YOU</span>
                <div className="flex items-center gap-0.5">
                  {rowPair.colors.map(c => <InkImg key={c} color={c} size="w-4 h-4" />)}
                </div>
              </div>
            </div>

            {/* Data cells */}
            {oppDecks.map((colPair, colIdx) => {
              const matchup = getMatchup(rowPair.colors, colPair.colors)
              if (!matchup) {
                return (
                  <div key={colIdx} className="w-24 h-20 flex-shrink-0 bg-gray-50 border border-gray-100" />
                )
              }

              const winRate = (matchup.winsA / matchup.games * 100).toFixed(0)
              const firstStr = matchup.gamesFirst > 0
                ? `${Math.round(matchup.winsFirst / matchup.gamesFirst * 100)}%`
                : null
              const secondStr = matchup.gamesSecond > 0
                ? `${Math.round(matchup.winsSecond / matchup.gamesSecond * 100)}%`
                : null

              return (
                <div
                  key={colIdx}
                  className={`w-24 h-28 flex-shrink-0 border border-gray-200 flex flex-col items-center justify-center text-center group relative cursor-help px-1 ${getWinrateColor(winRate)}`}
                >
                  <div className="text-sm font-bold text-gray-900">{winRate}%</div>
                  <div className="text-xs text-gray-600">{matchup.winsA}W-{matchup.games - matchup.winsA}L</div>
                  {(firstStr || secondStr) && (
                    <div className="mt-1 text-[10px] text-gray-500 leading-tight">
                      {firstStr && <div>1st: {firstStr}</div>}
                      {secondStr && <div>2nd: {secondStr}</div>}
                    </div>
                  )}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {matchup.games} games
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function TurnDistributionView({ games }) {
  const eligible = games.filter(g => g.myPlayerNum != null && g.turnCount > 0)
  if (eligible.length === 0) return <div className="text-sm text-gray-500">No turn data available.</div>

  // Group by turn count
  const byTurn = {}
  for (const g of eligible) {
    const t = g.turnCount
    if (!byTurn[t]) byTurn[t] = { wins: 0, losses: 0 }
    const won = g.winner === g.myPlayerNum || g.winner === String(g.myPlayerNum)
    if (won) byTurn[t].wins++
    else byTurn[t].losses++
  }

  const turns = Object.keys(byTurn).map(Number).sort((a, b) => a - b)
  const maxGames = Math.max(...turns.map(t => byTurn[t].wins + byTurn[t].losses))
  const CHART_H = 120

  return (
    <div>
      <div className="text-xs text-gray-400 mb-4">Green = wins, red = losses</div>
      <div className="flex items-end gap-1.5">
        {turns.map(t => {
          const { wins, losses } = byTurn[t]
          const total = wins + losses
          const winPx = Math.round((wins / maxGames) * CHART_H)
          const lossPx = Math.round((losses / maxGames) * CHART_H)
          return (
            <div key={t} className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <div className="text-[10px] text-gray-500 font-medium">{total}</div>
              <div className="w-full flex flex-col justify-end rounded-sm overflow-hidden" style={{ height: `${CHART_H}px` }}>
                <div className="w-full bg-emerald-400" style={{ height: `${winPx}px` }} />
                <div className="w-full bg-red-300" style={{ height: `${lossPx}px` }} />
              </div>
              <div className="text-[10px] text-gray-500">{t}</div>
            </div>
          )
        })}
      </div>
      <div className="text-xs text-gray-400 mt-1 text-center">Turn count</div>
    </div>
  )
}

// Measures the rendered pixel width of the chart's own SVG element so the viewBox can be set
// to match it exactly (1 SVG unit = 1 px) — keeps the chart genuinely full-width without the
// non-uniform stretching (or letterboxing) that comes from scaling a fixed-aspect-ratio viewBox
// to fit a container of a different aspect ratio.
function useChartWidth(defaultWidth) {
  const ref = useRef(null)
  const [width, setWidth] = useState(defaultWidth)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

export function WinRateTrendView({ games }) {
  const [chartRef, W] = useChartWidth(1000)
  const sorted = [...games]
    .filter(g => g.myPlayerNum != null && g.playedAt != null)
    .sort((a, b) => a.playedAt - b.playedAt)

  if (sorted.length < 2) {
    return <div className="text-sm text-gray-500">Not enough games to show a trend.</div>
  }

  const WINDOW = 10
  const H = 180
  const PAD = { top: 16, right: 16, bottom: 32, left: 40 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  // Rolling win rate at each game index
  const points = sorted.map((game, i) => {
    const slice = sorted.slice(Math.max(0, i - WINDOW + 1), i + 1)
    const wins = slice.filter(g => g.winner === g.myPlayerNum || g.winner === String(g.myPlayerNum)).length
    return wins / slice.length
  })

  const xPos = (i) => PAD.left + (i / (sorted.length - 1)) * chartW
  const yPos = (rate) => PAD.top + (1 - rate) * chartH

  const linePath = points.map((r, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(r).toFixed(1)}`).join(' ')

  // X-axis date labels (first, middle, last)
  const labelIdxs = [...new Set([0, Math.floor((sorted.length - 1) / 2), sorted.length - 1])]
  const formatDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  return (
    <div>
      <div className="text-xs text-gray-400 mb-2">Rolling {WINDOW}-game win rate</div>
      <svg ref={chartRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(r => (
          <g key={r}>
            <line
              x1={PAD.left} y1={yPos(r)} x2={W - PAD.right} y2={yPos(r)}
              stroke={r === 0.5 ? '#9ca3af' : '#e5e7eb'} strokeWidth={r === 0.5 ? 1.5 : 1} strokeDasharray={r === 0.5 ? '6 3' : ''}
            />
            <text x={PAD.left - 6} y={yPos(r) + 4} textAnchor="end" fontSize={18} fill="#9ca3af">{r * 100}%</text>
          </g>
        ))}

        {/* Individual game dots */}
        {sorted.map((game, i) => {
          const won = game.winner === game.myPlayerNum || game.winner === String(game.myPlayerNum)
          return (
            <circle
              key={i}
              cx={xPos(i)} cy={yPos(won ? 1 : 0)}
              r={5}
              fill={won ? '#86efac' : '#fca5a5'}
              opacity={0.5}
            />
          )
        })}

        {/* Rolling win rate line */}
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots on the line */}
        {points.map((r, i) => (
          <circle key={i} cx={xPos(i)} cy={yPos(r)} r={4} fill="#3b82f6" />
        ))}

        {/* X-axis date labels */}
        {labelIdxs.map(i => (
          <text
            key={i} x={xPos(i)} y={H - 4}
            textAnchor={i === 0 ? 'start' : i === sorted.length - 1 ? 'end' : 'middle'}
            fontSize={16} fill="#9ca3af"
          >
            {formatDate(sorted[i].playedAt)}
          </text>
        ))}
      </svg>
    </div>
  )
}

export function MMRTrendView({ games }) {
  const [chartRef, W] = useChartWidth(1000)
  const sorted = [...games]
    .filter(g => g.mmr_delta != null && g.playedAt != null)
    .sort((a, b) => a.playedAt - b.playedAt)

  if (sorted.length === 0) {
    return <div className="text-sm text-gray-500">No imported games with MMR data available. Import games from match history to see MMR trends.</div>
  }

  const H = 180

  // Build actual MMR points: start with mmr_before of first game, then mmr_after of each game
  const startMMR = sorted[0].mmr_before ?? (sorted[0].mmr_after != null ? sorted[0].mmr_after - sorted[0].mmr_delta : 0)
  const points = sorted.map(game => game.mmr_after ?? (startMMR + sorted.slice(0, sorted.indexOf(game) + 1).reduce((s, g) => s + g.mmr_delta, 0)))

  // All values including start point for min/max
  const allValues = [startMMR, ...points]
  const minMMR = Math.min(...allValues)
  const maxMMR = Math.max(...allValues)
  const range = maxMMR - minMMR

  // Add padding to y-axis
  const paddedMin = minMMR - (range * 0.1 || 10)
  const paddedMax = maxMMR + (range * 0.1 || 10)
  const paddedRange = paddedMax - paddedMin

  // MMR is typically 4 digits (unlike the 2-3 digit values other trend charts
  // plot), so the fixed 40px left pad those charts use isn't wide enough —
  // the leading digit renders off the left edge of the SVG viewBox and gets
  // clipped, silently turning e.g. "1400" into "400". Size it to the widest
  // label actually being drawn instead.
  const maxLabelChars = Math.max(String(Math.round(paddedMin)).length, String(Math.round(paddedMax)).length)
  const PAD = { top: 16, right: 16, bottom: 32, left: 16 + maxLabelChars * 11 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  // x positions: index 0 = start point (before first game), index 1..n = after each game
  const totalPoints = points.length + 1
  const xPos = (i) => PAD.left + (i / Math.max(1, totalPoints - 1)) * chartW
  const yPos = (mmr) => PAD.top + (1 - (mmr - paddedMin) / paddedRange) * chartH

  const allPoints = [startMMR, ...points]
  const linePath = allPoints.map((mmr, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(mmr).toFixed(1)}`).join(' ')

  // X-axis date labels (first, middle, last) — offset by 1 for start point
  const labelIdxs = [...new Set([1, Math.max(1, Math.floor((totalPoints - 1) / 2)), totalPoints - 1])]
  const formatDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  // Grid lines — target ~4 labels max to avoid overlap
  const gridLines = []
  const rawStep = paddedRange / 4
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const gridStep = Math.max(1, [1, 2, 5, 10].map(m => m * magnitude).find(s => paddedRange / s <= 5) ?? magnitude * 10)
  for (let mmr = Math.ceil(paddedMin / gridStep) * gridStep; mmr <= paddedMax; mmr += gridStep) {
    gridLines.push(mmr)
  }

  // Calculate summary statistics
  const endMMR = points[points.length - 1]
  const netMMR = endMMR - startMMR
  const highestMMR = maxMMR
  const lowestMMR = minMMR

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Start MMR</div>
          <div className="text-lg font-bold text-gray-900">{startMMR.toFixed(0)}</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">End MMR</div>
          <div className="text-lg font-bold text-gray-900">{endMMR.toFixed(0)}</div>
        </div>
        <div className={`bg-gray-50 border rounded-lg p-3 ${netMMR >= 0 ? 'border-green-200' : 'border-red-200'}`}>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Net Change</div>
          <div className={`text-lg font-bold ${netMMR >= 0 ? 'text-green-600' : 'text-red-600'}`}>{netMMR >= 0 ? '+' : ''}{netMMR.toFixed(0)}</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Highest</div>
          <div className="text-lg font-bold text-gray-900">{highestMMR.toFixed(0)}</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Lowest</div>
          <div className="text-lg font-bold text-gray-900">{lowestMMR.toFixed(0)}</div>
        </div>
      </div>
      <div className="text-xs text-gray-400 mb-2">MMR over time (imported games only)</div>
      <svg ref={chartRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {/* Grid lines */}
        {gridLines.map(mmr => (
          <g key={mmr}>
            <line
              x1={PAD.left} y1={yPos(mmr)} x2={W - PAD.right} y2={yPos(mmr)}
              stroke="#e5e7eb" strokeWidth={1} strokeDasharray="6 3"
            />
            <text x={PAD.left - 6} y={yPos(mmr) + 4} textAnchor="end" fontSize={18} fill="#9ca3af">{mmr.toFixed(0)}</text>
          </g>
        ))}

        {/* Individual game result dots (offset by 1 for start point) */}
        {sorted.map((game, i) => {
          const mmr = points[i]
          const isWin = game.mmr_delta > 0
          return (
            <circle
              key={i}
              cx={xPos(i + 1)} cy={yPos(mmr)}
              r={5}
              fill={isWin ? '#86efac' : '#fca5a5'}
              opacity={0.5}
            />
          )
        })}

        {/* MMR line */}
        <path d={linePath} fill="none" stroke="#8b5cf6" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots on the line */}
        {allPoints.map((mmr, i) => (
          <circle key={i} cx={xPos(i)} cy={yPos(mmr)} r={4} fill="#8b5cf6" />
        ))}

        {/* X-axis date labels */}
        {labelIdxs.map(i => (
          <text
            key={i} x={xPos(i)} y={H - 4}
            textAnchor={i === 1 ? 'start' : i === totalPoints - 1 ? 'end' : 'middle'}
            fontSize={16} fill="#9ca3af"
          >
            {formatDate(sorted[i - 1].playedAt)}
          </text>
        ))}
      </svg>
    </div>
  )
}

export function InkwellTrendView({ games }) {
  const [chartRef, W] = useChartWidth(1000)
  const sorted = [...games]
    .filter(g => g.myPlayerNum != null && g.playedAt != null && g.turnCount > 0)
    .sort((a, b) => a.playedAt - b.playedAt)

  if (sorted.length < 2) {
    return <div className="text-sm text-gray-500">Not enough games to show a trend.</div>
  }

  const finalInkwell = (g) => (g.turns ?? []).filter(t => t.owner === g.myPlayerNum).reduce((s, t) => s + (t.inked ?? 0), 0)
  const inkTotals = sorted.map(finalInkwell)
  const turnTotals = sorted.map(g => g.turnCount)

  const H = 180
  const PAD = { top: 16, right: 16, bottom: 32, left: 40 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const maxVal = Math.max(1, ...inkTotals, ...turnTotals)

  const xPos = (i) => PAD.left + (i / (sorted.length - 1)) * chartW
  const yPos = (v) => PAD.top + (1 - v / maxVal) * chartH

  const pathFor = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(v).toFixed(1)}`).join(' ')

  const labelIdxs = [...new Set([0, Math.floor((sorted.length - 1) / 2), sorted.length - 1])]
  const formatDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  const avgInk = inkTotals.reduce((s, v) => s + v, 0) / inkTotals.length
  const avgTurns = turnTotals.reduce((s, v) => s + v, 0) / turnTotals.length

  // Grid lines — target ~4 labels max
  const gridStep = Math.max(1, Math.ceil(maxVal / 4))
  const gridLines = []
  for (let v = 0; v <= maxVal; v += gridStep) gridLines.push(v)

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Avg Final Inkwell</div>
          <div className="text-lg font-bold text-gray-900">{avgInk.toFixed(1)}</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Avg Turns</div>
          <div className="text-lg font-bold text-gray-900">{avgTurns.toFixed(1)}</div>
        </div>
        <div className={`bg-gray-50 border rounded-lg p-3 ${avgInk > avgTurns ? 'border-amber-200' : 'border-gray-200'}`}>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ink vs Turns</div>
          <div className={`text-lg font-bold ${avgInk > avgTurns ? 'text-amber-600' : 'text-gray-900'}`}>
            {avgInk > avgTurns ? '+' : ''}{(avgInk - avgTurns).toFixed(1)}
          </div>
        </div>
      </div>
      <div className="text-xs text-gray-400 mb-2">Final inkwell size and turn count at the end of each game — inkwell running above turns suggests overinking</div>
      <svg ref={chartRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {/* Grid lines */}
        {gridLines.map(v => (
          <g key={v}>
            <line
              x1={PAD.left} y1={yPos(v)} x2={W - PAD.right} y2={yPos(v)}
              stroke="#e5e7eb" strokeWidth={1} strokeDasharray="6 3"
            />
            <text x={PAD.left - 6} y={yPos(v) + 4} textAnchor="end" fontSize={18} fill="#9ca3af">{v}</text>
          </g>
        ))}

        {/* Turns line */}
        <path d={pathFor(turnTotals)} fill="none" stroke="#3b82f6" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {turnTotals.map((v, i) => (
          <circle key={`turn-${i}`} cx={xPos(i)} cy={yPos(v)} r={4} fill="#3b82f6" />
        ))}

        {/* Inkwell line */}
        <path d={pathFor(inkTotals)} fill="none" stroke="#8b5cf6" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {inkTotals.map((v, i) => (
          <circle key={`ink-${i}`} cx={xPos(i)} cy={yPos(v)} r={4} fill="#8b5cf6" />
        ))}

        {/* X-axis date labels */}
        {labelIdxs.map(i => (
          <text
            key={i} x={xPos(i)} y={H - 4}
            textAnchor={i === 0 ? 'start' : i === sorted.length - 1 ? 'end' : 'middle'}
            fontSize={16} fill="#9ca3af"
          >
            {formatDate(sorted[i].playedAt)}
          </text>
        ))}
      </svg>
      <div className="flex items-center gap-4 mt-2">
        <span className="flex items-center gap-1 text-xs text-gray-500"><span className="inline-block w-3 h-0.5 bg-blue-500" />Turns played</span>
        <span className="flex items-center gap-1 text-xs text-gray-500"><span className="inline-block w-3 h-0.5 bg-purple-500" />Final inkwell</span>
      </div>
    </div>
  )
}

const MULLIGAN_MIN_SAMPLE = 2

export function CardImpactView({ games, deckSelected, deckVersions, hasToken }) {
  const { results, totalGames } = computeCardImpact(games, { deckVersions })
  const scored = results.filter(r => r.war != null)

  const mulliganByCard = {}
  for (const m of aggregateMulliganWinRates(games)) {
    const keptTotal = m.keptWins + m.keptLosses
    const sentTotal = m.sentWins + m.sentLosses
    if (keptTotal === 0 && sentTotal === 0) continue
    mulliganByCard[m.fullName] = {
      keptPct: keptTotal > 0 ? Math.round((m.keptWins / keptTotal) * 100) : null,
      sentPct: sentTotal > 0 ? Math.round((m.sentWins / sentTotal) * 100) : null,
      keptTotal,
      sentTotal,
    }
  }

  return (
    <div>
      {!deckSelected && (
        <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Pick a deck above to compare like-for-like — mixing decks conflates deck strength with card strength.
        </div>
      )}
      {deckSelected && !hasToken && (
        <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Add a duels.ink API token on the Settings page to pull this deck's exact version history from duels.ink — without it, deck-cut detection falls back to the decklist recorded on each individual game (less complete).
        </div>
      )}
      <div className="text-xs text-gray-400 mb-4">
        For each card, wins in games it was drawn/played minus expected wins at the deck's baseline win rate in games without it — a rough "wins above replacement." Based on {totalGames} of your games with a recorded winner. A miss only counts toward "Games w/o" when we can confirm the card was actually in the 60 that game — preferably from duels.ink's own version history for this deck (each version's exact card list, matched to games by date), falling back to the decklist recorded on that individual game when version history isn't available. Misses that can't be confirmed either way, or that are confirmed as a cut card, are excluded so deck changes over time don't get held against a card (hover a "Games w/o" cell for the breakdown). Cards with fewer than 5 games on either side are low-confidence and shown faded. The "Kept % / Sent %" column shows win rate (with the game count in parens) in games this card was kept in your opening hand vs. sent back during mulligan, plus the difference in parentheses when both sides have data — a side shows "—" if you've never done that with this card. Counts are games, not copies: keeping 2 copies in one game still only counts once toward "kept," but a game where you kept one copy while sending another copy of the same card counts once toward each side, since that's genuinely mixed evidence (hover a cell for the full breakdown). A side under 2 games is low-confidence and shown faded.
      </div>
      {scored.length === 0 ? (
        <div className="text-sm text-gray-500">Not enough data yet — play or import more games with this deck.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-200">
                <th className="py-2 pr-3">Card</th>
                <th className="py-2 px-3 text-right">WAR</th>
                <th className="py-2 px-3 text-right">WR w/</th>
                <th className="py-2 px-3 text-right">WR w/o</th>
                <th className="py-2 px-3 text-right">Games w/</th>
                <th className="py-2 px-3 text-right">Games w/o</th>
                <th className="py-2 pl-3 text-right">Kept % / Sent %</th>
              </tr>
            </thead>
            <tbody>
              {scored.map(r => {
                const mull = mulliganByCard[r.name]
                const mullDelta = (mull && mull.keptPct != null && mull.sentPct != null) ? mull.keptPct - mull.sentPct : null
                const mullLowSample = mull && (mull.keptTotal < MULLIGAN_MIN_SAMPLE || mull.sentTotal < MULLIGAN_MIN_SAMPLE)
                return (
                  <tr key={r.name} className={`border-b border-gray-100 ${r.lowSample ? 'opacity-40' : ''}`}>
                    <td className="py-1.5 pr-3 text-gray-800 truncate max-w-[280px]">{r.name}</td>
                    <td className={`py-1.5 px-3 text-right font-semibold ${r.war > 0 ? 'text-emerald-600' : r.war < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                      {r.war > 0 ? '+' : ''}{r.war.toFixed(1)}
                    </td>
                    <td className="py-1.5 px-3 text-right text-gray-600">{Math.round(r.winRateWith * 100)}%</td>
                    <td className="py-1.5 px-3 text-right text-gray-600">{Math.round(r.winRateWithout * 100)}%</td>
                    <td className="py-1.5 px-3 text-right text-gray-400">{r.gamesWith}</td>
                    <td
                      className="py-1.5 px-3 text-right text-gray-400"
                      title={`${r.gamesNotInDeck} game${r.gamesNotInDeck !== 1 ? 's' : ''} confirmed not in deck · ${r.gamesUnknown} game${r.gamesUnknown !== 1 ? 's' : ''} with no recorded decklist — both excluded`}
                    >
                      {r.gamesWithout}
                    </td>
                    <td
                      className={`py-1.5 pl-3 text-right ${mullLowSample ? 'opacity-50' : ''}`}
                      title={mull
                        ? `Kept: ${mull.keptPct != null ? `${mull.keptPct}% (${mull.keptTotal} game${mull.keptTotal !== 1 ? 's' : ''})` : 'never kept'} · Sent: ${mull.sentPct != null ? `${mull.sentPct}% (${mull.sentTotal} game${mull.sentTotal !== 1 ? 's' : ''})` : 'never sent'}. A game where you kept one copy and sent another copy of the same card counts once toward each side.`
                        : 'No mulligan data recorded for this card'
                      }
                    >
                      {mull ? (
                        <>
                          <span className="text-gray-600">
                            {mull.keptPct != null ? `${mull.keptPct}%` : '—'}
                            <span className="text-[10px] text-gray-400">({mull.keptTotal})</span>
                            {' / '}
                            {mull.sentPct != null ? `${mull.sentPct}%` : '—'}
                            <span className="text-[10px] text-gray-400">({mull.sentTotal})</span>
                          </span>
                          {mullDelta != null && (
                            <> <span className={`font-semibold ${mullDelta > 0 ? 'text-emerald-600' : mullDelta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                              ({mullDelta > 0 ? '+' : ''}{mullDelta})
                            </span></>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const TREND_CHART_W = 1000
const TREND_PAD = { top: 16, right: 16, bottom: 32, left: 40 }

function formatMonthLabel(bucket) {
  const [year, month] = bucket.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
}

export function CardImpactTrendView({ games, deckVersions }) {
  const [selectedCard, setSelectedCard] = useState('')

  const { results } = useMemo(() => computeCardImpact(games, { deckVersions }), [games, deckVersions])
  const candidates = useMemo(
    () => results
      .filter(r => r.gamesWith + r.gamesWithout >= 3)
      .sort((a, b) => (b.gamesWith + b.gamesWithout) - (a.gamesWith + a.gamesWithout)),
    [results]
  )

  const activeCard = selectedCard || candidates[0]?.name || ''
  const { points } = useMemo(
    () => activeCard ? computeCardImpactTrend(games, { deckVersions, cardName: activeCard }) : { points: [] },
    [games, deckVersions, activeCard]
  )
  const scored = points.filter(p => p.war != null)

  if (candidates.length === 0) {
    return <div className="text-sm text-gray-500">Not enough data yet to chart card trends over time.</div>
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Card</label>
        <select
          value={activeCard}
          onChange={e => setSelectedCard(e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1 bg-white text-gray-800"
        >
          {candidates.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>
      {scored.length < 2 ? (
        <div className="text-sm text-gray-500">Not enough months with confirmed with/without data for this card to chart a trend — try a card played across more months.</div>
      ) : (
        <CardWarTrendChart points={scored} />
      )}
    </div>
  )
}

function CardWarTrendChart({ points }) {
  const [chartRef, W] = useChartWidth(TREND_CHART_W)
  const H = 180
  const chartW = W - TREND_PAD.left - TREND_PAD.right
  const chartH = H - TREND_PAD.top - TREND_PAD.bottom

  const wars = points.map(p => p.war)
  const minWar = Math.min(0, ...wars)
  const maxWar = Math.max(0, ...wars)
  const range = maxWar - minWar
  const paddedMin = minWar - (range * 0.15 || 1)
  const paddedMax = maxWar + (range * 0.15 || 1)
  const paddedRange = paddedMax - paddedMin

  const xPos = (i) => TREND_PAD.left + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW)
  const yPos = (war) => TREND_PAD.top + (1 - (war - paddedMin) / paddedRange) * chartH
  const zeroY = yPos(0)

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(p.war).toFixed(1)}`).join(' ')

  return (
    <div>
      <div className="text-xs text-gray-400 mb-2">WAR by month (faded points had fewer than 3 games on one side — low confidence)</div>
      <svg ref={chartRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        <line
          x1={TREND_PAD.left} y1={zeroY} x2={W - TREND_PAD.right} y2={zeroY}
          stroke="#e5e7eb" strokeWidth={1} strokeDasharray="6 3"
        />
        <text x={TREND_PAD.left - 6} y={zeroY + 4} textAnchor="end" fontSize={18} fill="#9ca3af">0</text>

        <path d={linePath} fill="none" stroke="#8b5cf6" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <circle
            key={p.bucket}
            cx={xPos(i)} cy={yPos(p.war)}
            r={p.lowSample ? 4 : 6}
            fill={p.war >= 0 ? '#10b981' : '#ef4444'}
            opacity={p.lowSample ? 0.4 : 1}
          />
        ))}

        {points.map((p, i) => (
          <text
            key={p.bucket} x={xPos(i)} y={H - 4}
            textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            fontSize={16} fill="#9ca3af"
          >
            {formatMonthLabel(p.bucket)}
          </text>
        ))}
      </svg>
    </div>
  )
}

export function OpponentMetagameView({ games }) {
  const metagame = analyzeOpponentMetagame(games)

  if (metagame.length === 0) {
    return <div className="text-sm text-gray-500">No opponent deck data available</div>
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {metagame.map(deck => (
          <div key={deck.colorString}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-gray-900 flex-shrink-0">{deck.colors.length > 0 ? deck.colors.map(c => c.charAt(0).toUpperCase()).join('/') : 'Unknown'}</span>
                {deck.colors.length > 0 && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {deck.colors.map(c => <InkImg key={c} color={c} size="w-4 h-4" />)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 text-sm ml-4">
                <span className="text-gray-600">{deck.gameCount}g</span>
                <span className={`font-medium w-12 text-right ${parseFloat(deck.winRate) >= 55 ? 'text-green-600' : parseFloat(deck.winRate) <= 45 ? 'text-red-500' : 'text-gray-500'}`}>{deck.winRate}% WR</span>
                <span className="font-semibold text-gray-900 w-12 text-right">{deck.percentage}%</span>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-6 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all flex items-center justify-center"
                style={{ width: `${parseFloat(deck.percentage)}%` }}
              >
                {parseFloat(deck.percentage) > 8 && (
                  <span className="text-xs font-semibold text-white">{deck.percentage}%</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
