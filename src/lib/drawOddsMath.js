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
//   2) M mulligan replacement draws (cards go back, deck reshuffled to N-7+M)
//   3) g additional gameplay draws from the N-7 card remaining deck
//   4) Scry sources: each played copy looks at `lookAt` cards from the remaining deck;
//      if a target is among them it's kept, so P(hit in scry) uses the same hypergeometric
//      formula as a regular draw of `lookAt` cards.
// Each stage is only included if you missed in the prior stage.
export function drawOdds(N, K, M, g, scrySources = []) {
  const safeG = Math.min(g, Math.max(0, N - 7))
  let logPMiss = logBinom(N - K, 7) - logBinom(N, 7)
  if (M > 0) {
    const pool = N - 7 + M
    logPMiss += logBinom(pool - K, M) - logBinom(pool, M)
  }
  if (safeG > 0) {
    const pool = N - 7
    logPMiss += logBinom(pool - K, safeG) - logBinom(pool, safeG)
  }
  if (scrySources.length > 0) {
    const totalDrawn = 7 + (M > 0 ? M : 0) + safeG
    const remainingPool = N - 7 - safeG
    // Expected scry cards in hand by this point, proportional to cards drawn so far.
    let totalLooks = 0
    for (const src of scrySources) {
      if (src.copies > 0 && src.lookAt > 0) {
        const fraction = Math.min(1, totalDrawn / N)
        totalLooks += src.copies * fraction * src.lookAt
      }
    }
    const intLooks = Math.min(Math.round(totalLooks), Math.max(0, remainingPool - K))
    if (intLooks > 0 && remainingPool >= K) {
      logPMiss += logBinom(remainingPool - K, intLooks) - logBinom(remainingPool, intLooks)
    }
  }
  if (!isFinite(logPMiss)) return logPMiss < 0 ? 1 : 0
  return Math.max(0, Math.min(1, 1 - Math.exp(logPMiss)))
}

// P(at least 1 from every group in `ks`), assuming disjoint groups.
// Uses inclusion-exclusion over "missed group S" events: for any subset S of groups,
// P(miss every group in S) = 1 - drawOdds treating the union of S as a single pool.
// P(hit every group) = 1 - P(union of "missed group i" events), expanded via inclusion-exclusion.
// For two groups this reduces to the familiar P(A∩B) = P(A) + P(B) - P(A∪B).
export function jointDrawOddsN(N, ks, M, g, scrySources = []) {
  const n = ks.length
  let missUnion = 0
  for (let mask = 1; mask < (1 << n); mask++) {
    let sumK = 0, bits = 0
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) { sumK += ks[i]; bits++ }
    }
    const sign = bits % 2 === 1 ? 1 : -1
    missUnion += sign * (1 - drawOdds(N, sumK, M, g, scrySources))
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
