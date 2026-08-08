// Multinomial coefficient: n! / (a! * b! * c!)
// Computed as C(n, a) * C(n-a, b) to avoid large intermediate factorials.
export function multinomialCoeff(n, a, b) {
  const c = n - a - b
  if (c < 0) return 0
  let result = 1
  for (let i = 0; i < a; i++) result *= (n - i) / (i + 1)
  for (let i = 0; i < b; i++) result *= (n - a - i) / (i + 1)
  return result
}

// Upper-bound model: pure win/loss, no draws (pessimistic — assumes no IDs in the field).
// P(w wins out of R rounds) = C(R,w) / 2^R
export function expectedAboveWinLoss(N, R, minPoints) {
  let prob = 0
  const pow2R = Math.pow(2, R)
  for (let w = 0; w <= R; w++) {
    if (w * 3 >= minPoints) prob += multinomialCoeff(R, w, 0) / pow2R
  }
  return N * prob
}

// Lower-bound model: trinomial win/draw/loss (optimistic — accounts for IDs compressing the field).
// Default draw rate: ~20%. When the user supplies a known draw count from standings,
// we derive p_draw = drawCount / N instead for a more accurate lower bound.
export const DEFAULT_P_DRAW = 0.20

export function expectedAboveTrinomial(N, R, minPoints, pDraw) {
  const pWin = (1 - pDraw) / 2
  const pLoss = pWin
  let prob = 0
  for (let w = 0; w <= R; w++) {
    for (let d = 0; d <= R - w; d++) {
      if (w * 3 + d >= minPoints) {
        prob += multinomialCoeff(R, w, d) *
          Math.pow(pWin, w) * Math.pow(pDraw, d) * Math.pow(pLoss, R - w - d)
      }
    }
  }
  return N * prob
}

// Walk up from 0 to find the minimum pts where expectedFn drops to <= T.
export function cutlineFrom(expectedFn, N, R, T) {
  for (let pts = 0; pts <= R * 3; pts++) {
    if (expectedFn(N, R, pts) <= T) return pts
  }
  return R * 3
}

// Returns {lower, upper} — the realistic range for where the cutline will fall.
// upper = no IDs (pure W/L, pessimistic). lower = with draws (optimistic).
// drawCount: players known to have at least one draw (from live standings). If
// omitted, falls back to DEFAULT_P_DRAW.
export function estimateCutlineRange(N, R, T, drawCount) {
  const upper = cutlineFrom(expectedAboveWinLoss, N, R, T)
  const pDraw = (drawCount != null && N > 0)
    ? Math.min(drawCount / N, 0.45)
    : DEFAULT_P_DRAW
  const lower = Math.min(
    cutlineFrom((N, R, pts) => expectedAboveTrinomial(N, R, pts, pDraw), N, R, T),
    upper
  )
  return { lower, upper }
}

export function cutlineLabel({ lower, upper }) {
  return lower === upper ? `~${lower} pts` : `~${lower}–${upper} pts`
}
