// Wilson 95% confidence interval for a binomial proportion (0..1)
export function wilsonInterval(wins, n) {
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
export function shrinkWR(wins, n, publicWR, priorN = 10) {
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
export function runMonteCarlo({ rows, rounds, format, sims }) {
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
