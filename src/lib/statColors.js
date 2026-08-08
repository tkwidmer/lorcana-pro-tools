// Shared "value → Tailwind color class" helpers. These consolidate several
// near-identical color-bucket functions that were reimplemented per-page
// (WinrateMatrixPage, PracticePlanPage, DrawOddsPage). Each function keeps
// its original domain-specific thresholds — they are not the same scale,
// just the same shape of function.

// Matchup matrix cell background — win rate is 0-100.
export function winrateCellColor(winRate, isMirror = false) {
  if (isMirror) {
    if (winRate >= 60) return 'bg-blue-300 border border-blue-500'
    if (winRate >= 55) return 'bg-blue-200 border border-blue-400'
    if (winRate >= 51) return 'bg-blue-100 border border-blue-300'
    return 'bg-gray-50 border border-gray-200'
  }
  if (winRate >= 60) return 'bg-green-300 border border-green-500'
  if (winRate >= 55) return 'bg-green-200 border border-green-400'
  if (winRate >= 51) return 'bg-green-100 border border-green-300'
  if (winRate >= 49) return 'bg-gray-50 border border-gray-200'
  if (winRate >= 45) return 'bg-red-100 border border-red-300'
  if (winRate >= 40) return 'bg-red-200 border border-red-400'
  return 'bg-red-300 border border-red-500'
}

// Text color for a win rate value (0-100), used in practice-plan tables.
export function winrateTextColor(wr) {
  if (wr == null || Number.isNaN(wr)) return 'text-gray-400'
  if (wr >= 60) return 'text-green-700 font-semibold'
  if (wr >= 52) return 'text-green-600'
  if (wr >= 48) return 'text-gray-700'
  if (wr >= 40) return 'text-red-600'
  return 'text-red-700 font-semibold'
}

// Text color for a personal-vs-public win rate delta.
export function deltaColor(delta) {
  if (delta == null) return 'text-gray-400'
  if (delta >= 5) return 'text-green-700'
  if (delta <= -5) return 'text-red-700'
  return 'text-gray-500'
}

// Text color for a draw-odds probability (0-1).
export function oddsColor(p) {
  if (p >= 0.75) return 'text-green-700'
  if (p >= 0.50) return 'text-yellow-700'
  if (p >= 0.25) return 'text-orange-600'
  return 'text-red-600'
}

// Letter grade for a deck's max brick risk (0-1, lower is better).
export function brickGrade(maxRisk) {
  if (maxRisk < 0.03) return 'A'
  if (maxRisk < 0.07) return 'B'
  if (maxRisk < 0.14) return 'C'
  if (maxRisk < 0.25) return 'D'
  return 'F'
}

export function brickGradeColor(grade) {
  if (grade === 'A') return 'text-green-600'
  if (grade === 'B') return 'text-emerald-600'
  if (grade === 'C') return 'text-yellow-600'
  if (grade === 'D') return 'text-orange-500'
  return 'text-red-600'
}

// Text color for a brick risk probability (0-1, lower is better).
export function brickRiskColor(p) {
  if (p < 0.03) return 'text-green-600'
  if (p < 0.07) return 'text-yellow-600'
  if (p < 0.14) return 'text-orange-500'
  return 'text-red-600'
}

// Bar fill color for the same brick risk scale.
export function brickBarColor(p) {
  if (p < 0.03) return 'bg-green-400'
  if (p < 0.07) return 'bg-yellow-400'
  if (p < 0.14) return 'bg-orange-400'
  return 'bg-red-500'
}
