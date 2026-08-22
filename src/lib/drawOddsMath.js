// --- Math ---

export function logFact(n) {
  if (n <= 1) return 0
  let s = 0
  for (let i = 2; i <= n; i++) s += Math.log(i)
  return s
}

export function logBinom(n, k) {
  if (k < 0 || k > n || n < 0) return -Infinity
  if (k === 0 || k === n) return 0
  return logFact(n) - logFact(k) - logFact(n - k)
}

// P(see at least 1 copy of a K-of card) through sequential draw stages:
//   1) Initial 7-card opening draw from N-card deck
//   2) M mulligan replacement draws, drawn from the N-7 undrawn deck only — the cards put
//      back can't be part of their own replacement draw
//   3) g additional gameplay draws from the N-7 card remaining deck (the M cards put back
//      have been reshuffled in by now, but since stage 2 only runs in the "missed" branch,
//      none of them were targets, so the deck's K targets are still all sitting in this pool)
// Each stage is only included if you missed in the prior stage.
//
// This is exact, and deliberately models NO scry. Scry can't be expressed in closed form
// here: whether a scry source fires depends on holding it, affording its ink cost on the
// turn in question, and how many of the revealed cards you're allowed to keep — all
// path-dependent. An earlier version approximated it by adding round(copies * lookAt *
// drawnFraction) extra hypergeometric draws, which ignored cost and keep entirely and
// overstated a 6-cost source by ~7 points. Anything scry-aware goes through mcSim instead.
export function drawOdds(N, K, M, g) {
  const safeG = Math.min(g, Math.max(0, N - 7))
  let logPMiss = logBinom(N - K, 7) - logBinom(N, 7)
  if (M > 0) {
    const pool = N - 7
    logPMiss += logBinom(pool - K, M) - logBinom(pool, M)
  }
  if (safeG > 0) {
    const pool = N - 7
    logPMiss += logBinom(pool - K, safeG) - logBinom(pool, safeG)
  }
  if (!isFinite(logPMiss)) return logPMiss < 0 ? 1 : 0
  return Math.max(0, Math.min(1, 1 - Math.exp(logPMiss)))
}

// P(at least 1 from every group in `ks`), assuming disjoint groups.
// Uses inclusion-exclusion over "missed group S" events: for any subset S of groups,
// P(miss every group in S) = 1 - drawOdds treating the union of S as a single pool.
// P(hit every group) = 1 - P(union of "missed group i" events), expanded via inclusion-exclusion.
// For two groups this reduces to the familiar P(A∩B) = P(A) + P(B) - P(A∪B).
export function jointDrawOddsN(N, ks, M, g) {
  const n = ks.length
  let missUnion = 0
  for (let mask = 1; mask < (1 << n); mask++) {
    let sumK = 0, bits = 0
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) { sumK += ks[i]; bits++ }
    }
    const sign = bits % 2 === 1 ? 1 : -1
    missUnion += sign * (1 - drawOdds(N, sumK, M, g))
  }
  return Math.max(0, Math.min(1, 1 - missUnion))
}

// P(drawing at least minCopies copies of a K-of card in n draws from N-card deck).
export function drawOddsAtLeast(N, K, n, minCopies) {
  if (minCopies <= 0) return 1
  if (K < minCopies || n < minCopies) return 0
  let p = 0
  for (let k = minCopies; k <= Math.min(K, n); k++) {
    const logP = logBinom(K, k) + logBinom(N - K, n - k) - logBinom(N, n)
    if (isFinite(logP)) p += Math.exp(logP)
  }
  return Math.max(0, Math.min(1, p))
}


export function pct(p) {
  if (p >= 0.995) return '99%+'
  return (p * 100).toFixed(1) + '%'
}
