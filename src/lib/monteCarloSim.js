// --- Monte Carlo simulation ---
// Used for group/joint calculations to accurately model keepInMulligan and scry effects.

// Iteration count for the group / joint mulligan ranges — the numbers people actually make
// deck decisions on. Standard error is sqrt(p(1-p)/n), so 25k puts it near 0.3 points at
// p=0.5. Raising this is bounded by the joint panel: combos grow quadratically with group
// count (3 groups = 3 groups + 3 pairs + 1 full intersection), so the worst realistic case
// costs ~8x a single group. Batching the mulligan levels onto shared deals (see
// mcSimMulliganRange) is what made this increase affordable.
const MC_ITERS = 25000
export const SIM_TURNS = 12  // turns simulated in quest pressure / win turn

// Deterministic seeding: every sim below hashes its own inputs into a seed instead of
// pulling from the shared Math.random() stream. Without this, re-rendering the exact same
// deck/config reruns the simulation with a fresh random sample every time, so two visually
// identical configs (or the same config recomputed twice) can show different — sometimes
// even order-flipped — percentages purely from sampling noise, which reads as a bug.
function hashSeed(parts) {
  let h = 0x811c9dc5
  for (const p of parts) {
    if (ArrayBuffer.isView(p)) {
      for (let i = 0; i < p.length; i++) h = Math.imul(h ^ p[i], 16777619)
    } else {
      h = Math.imul(h ^ (p | 0), 16777619)
    }
    h = Math.imul(h ^ 0xff, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Build typed arrays for a single group simulation.
// scrySourceList entries may carry `mulliganMode`: 'keep' forces that scry card to never be
// sent back on mulligan, 'mulligan' forces it to always be sent back (overriding the default
// heuristic, which only keeps it if it happens to also be a target); 'default'/unset leaves
// the normal mulligan logic (isKeep/isTarget) in charge of that card.
export function buildMCDeck(N, cards, targetNames, keepInMulligan, scrySourceList) {
  const targetSet = new Set(targetNames)
  const scryByName = new Map()
  // How many copies are in the deck comes from the deck list itself, not from the scry
  // source entry — the entry only says how that named card behaves.
  for (const s of scrySourceList) {
    if (s.name && s.lookAt > 0) scryByName.set(s.name, s)
  }
  const isTarget = new Uint8Array(N)
  const isKeep = new Uint8Array(N)   // alwaysKeep = isTarget && keepInMulligan, or scry alwaysKeep
  const scryLookAt = new Uint8Array(N)
  const scryKeep = new Uint8Array(N) // max cards actually kept from that scry (rest are bottomed)
  const scryCost = new Uint8Array(N) // ink cost to cast — the scry can't fire before you can afford it
  const scryForceMulligan = new Uint8Array(N)
  let pos = 0
  for (const card of cards) {
    const t = targetSet.has(card.name)
    const s = scryByName.get(card.name)
    const count = Math.min(card.count, N - pos)
    for (let i = 0; i < count; i++) {
      isTarget[pos] = t ? 1 : 0
      isKeep[pos] = ((t && keepInMulligan) || s?.mulliganMode === 'keep') ? 1 : 0
      scryLookAt[pos] = s ? s.lookAt : 0
      scryKeep[pos] = s ? Math.max(1, Math.min(s.keep || s.lookAt, s.lookAt)) : 0
      scryCost[pos] = s ? Math.max(1, s.cost || 1) : 0
      scryForceMulligan[pos] = s?.mulliganMode === 'mulligan' ? 1 : 0
      pos++
    }
  }
  return { isTarget, isKeep, scryLookAt, scryKeep, scryCost, scryForceMulligan }
}

// Build typed arrays for an N-group joint simulation.
export function buildMCJointDeckN(N, cards, groupList, scrySourceList) {
  const sets = groupList.map(g => new Set(g.cardNames))
  const scryByName = new Map()
  // How many copies are in the deck comes from the deck list itself, not from the scry
  // source entry — the entry only says how that named card behaves.
  for (const s of scrySourceList) {
    if (s.name && s.lookAt > 0) scryByName.set(s.name, s)
  }
  const targets = groupList.map(() => new Uint8Array(N))
  const keeps = groupList.map(() => new Uint8Array(N))
  const scryLookAt = new Uint8Array(N)
  const scryKeep = new Uint8Array(N) // max cards actually kept from that scry (rest are bottomed)
  const scryCost = new Uint8Array(N) // ink cost to cast — the scry can't fire before you can afford it
  const scryForceMulligan = new Uint8Array(N)
  let pos = 0
  for (const card of cards) {
    const s = scryByName.get(card.name)
    const count = Math.min(card.count, N - pos)
    for (let i = 0; i < count; i++) {
      for (let gi = 0; gi < groupList.length; gi++) {
        const t = sets[gi].has(card.name)
        targets[gi][pos] = t ? 1 : 0
        keeps[gi][pos] = ((t && groupList[gi].keepInMulligan) || s?.mulliganMode === 'keep') ? 1 : 0
      }
      scryLookAt[pos] = s ? s.lookAt : 0
      scryKeep[pos] = s ? Math.max(1, Math.min(s.keep || s.lookAt, s.lookAt)) : 0
      scryCost[pos] = s ? Math.max(1, s.cost || 1) : 0
      scryForceMulligan[pos] = s?.mulliganMode === 'mulligan' ? 1 : 0
      pos++
    }
  }
  return { targets, keeps, scryLookAt, scryKeep, scryCost, scryForceMulligan }
}

// How many cards you draw on a given turn. Additional Draws are modeled as extra cards
// arriving on turn 1 (matching questPressureSim's "already in hand" convention), and going
// first costs you the turn-1 draw. Summed over turns 1..targetTurn this equals the page's
// gameDraws(targetTurn), so totals stay consistent with the closed-form drawOdds math.
function drawsOnTurn(turn, goingFirst, additionalDraws) {
  if (turn !== 1) return 1
  return (goingFirst ? 0 : 1) + additionalDraws
}

// Evaluates ONE already-shuffled deal for a single mulligan count, returning whether the
// goal was met. Split out of mcSim so a whole mulligan range can reuse one shuffle — see
// mcSimMulliganRange. `order` must already be shuffled; `pool`/`hand` are scratch buffers.
//
// This models an actual hand rather than a flat sequence of draws, which matters for scry:
// a scry source is playable from your OPENING HAND, not just when you happen to topdeck it.
// Each turn we draw, then play any scry sources in hand we can afford (1 ink per turn, spent
// down as we play), reveal `lookAt` cards, keep up to `scryKeep` of the ones we're looking
// for, and bottom the rest so they're out of reach of subsequent draws.
//
// Mulligan: cards are sent back only when the opener didn't already satisfy the goal.
// `isKeep` cards are never sent back (group "always keep", or a scry source set to Keep);
// `scryForceMulligan` cards are always sent back even if some other rule would keep them.
function evaluateDeal(d, N, M, need, targetTurn, goingFirst, additionalDraws, order, pool, hand, rngPool) {
  const { isTarget, isKeep, scryLookAt, scryKeep, scryCost, scryForceMulligan } = d
  let handN = 0
  let count = 0
  for (let i = 0; i < 7; i++) {
    const c = order[i]
    hand[handN++] = c
    if (isTarget[c]) count++
  }
  let found = count >= need

  // The zone we draw from: the undrawn deck, or the reshuffled pool after a mulligan.
  let deck = order
  let deckLen = N
  let dp = 7

  if (!found && M > 0) {
    let pi = 0
    for (let i = 7; i < N; i++) pool[pi++] = order[i]
    let sent = 0
    let kept = 0
    for (let i = 0; i < handN; i++) {
      const c = hand[i]
      // need>1 keeps partial progress; scryForceMulligan overrides every keep rule.
      let keepThis = isKeep[c] || (need > 1 && isTarget[c])
      if (scryForceMulligan[c]) keepThis = false
      if (!keepThis && sent < M) { pool[pi++] = c; sent++ }
      else hand[kept++] = c
    }
    handN = kept
    const poolSize = pi
    for (let i = poolSize - 1; i > 0; i--) {
      const j = (rngPool() * (i + 1)) | 0
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t
    }
    for (let i = 0; i < sent; i++) {
      const c = pool[i]
      hand[handN++] = c
      if (isTarget[c]) count++
    }
    found = count >= need
    deck = pool
    deckLen = poolSize
    dp = sent
  }

  for (let turn = 1; turn <= targetTurn && !found; turn++) {
    let draws = drawsOnTurn(turn, goingFirst, additionalDraws)
    while (draws > 0 && dp < deckLen) {
      const c = deck[dp++]
      hand[handN++] = c
      if (isTarget[c]) { count++; if (count >= need) { found = true; break } }
      draws--
    }
    if (found) break

    // Play every scry source in hand this turn's ink can pay for.
    let ink = turn
    let i = 0
    while (i < handN && !found) {
      const c = hand[i]
      if (scryLookAt[c] === 0 || scryCost[c] > ink) { i++; continue }
      ink -= scryCost[c]
      hand[i] = hand[--handN] // playing it removes it from hand; re-check this slot
      const look = Math.min(scryLookAt[c], deckLen - dp)
      const cap = scryKeep[c]
      let taken = 0
      for (let s = 0; s < look && taken < cap; s++) {
        if (isTarget[deck[dp + s]]) {
          count++; taken++
          if (count >= need) { found = true; break }
        }
      }
      dp += look // whatever we didn't keep goes to the bottom
    }
  }
  return found
}

// Common random numbers: the seed depends only on deck size, so every configuration of the
// same deck is evaluated against the SAME sequence of shuffles. Toggling an option that has
// no mechanical effect then returns a bit-identical number instead of resampling and
// wobbling by ~1%, and a real effect shows up as a clean differential rather than being
// buried in sampling noise. (seedOffset exists only so tests can resample the same
// configuration to separate genuine bias from one unlucky draw.)
function makeRngs(N, seedOffset) {
  return {
    rngDeck: mulberry32(hashSeed([N, seedOffset])),
    rngPool: mulberry32(hashSeed([N, 1, seedOffset])),
  }
}

// Reset to identity before shuffling so the n-th deal is identical across configurations.
function shuffleDeck(order, N, rngDeck) {
  for (let i = 0; i < N; i++) order[i] = i
  for (let i = N - 1; i > 0; i--) {
    const j = (rngDeck() * (i + 1)) | 0
    const t = order[i]; order[i] = order[j]; order[j] = t
  }
}

// P(find ≥need targets by end of turn `targetTurn`, with an M-card mulligan).
export function mcSim({
  isTarget, isKeep, scryLookAt, scryKeep, scryCost, scryForceMulligan,
  N, M, need = 1, targetTurn = 0, goingFirst = false, additionalDraws = 0,
  iters = MC_ITERS, seedOffset = 0,
}) {
  const d = { isTarget, isKeep, scryLookAt, scryKeep, scryCost, scryForceMulligan }
  const { rngDeck, rngPool } = makeRngs(N, seedOffset)
  const order = new Int32Array(N)
  const pool = new Int32Array(N)
  const hand = new Int32Array(N)
  let hits = 0
  for (let iter = 0; iter < iters; iter++) {
    shuffleDeck(order, N, rngDeck)
    if (evaluateDeal(d, N, M, need, targetTurn, goingFirst, additionalDraws, order, pool, hand, rngPool)) hits++
  }
  return hits / iters
}

// P(find ≥need targets) for EVERY mulligan count 0..maxM, from a single pass.
// The mulligan levels differ only in how many cards go back, so they can share one shuffled
// deal per iteration instead of reshuffling the same deck eight times — shuffling is ~2/3 of
// a simulation's cost, so this pays for a much higher iteration count at the same wall time.
// It also means the whole Mull 0..7 row is measured against identical deals, which removes
// the independent per-column noise that could make the curve read as non-monotonic.
export function mcSimMulliganRange({
  isTarget, isKeep, scryLookAt, scryKeep, scryCost, scryForceMulligan,
  N, maxM, need = 1, targetTurn = 0, goingFirst = false, additionalDraws = 0,
  iters = MC_ITERS, seedOffset = 0,
}) {
  const d = { isTarget, isKeep, scryLookAt, scryKeep, scryCost, scryForceMulligan }
  const { rngDeck, rngPool } = makeRngs(N, seedOffset)
  const order = new Int32Array(N)
  const pool = new Int32Array(N)
  const hand = new Int32Array(N)
  const hits = new Int32Array(maxM + 1)
  for (let iter = 0; iter < iters; iter++) {
    shuffleDeck(order, N, rngDeck)
    for (let M = 0; M <= maxM; M++) {
      if (evaluateDeal(d, N, M, need, targetTurn, goingFirst, additionalDraws, order, pool, hand, rngPool)) hits[M]++
    }
  }
  return Array.from(hits, (h, M) => ({ m: M, p: h / iters }))
}

// Evaluates ONE already-shuffled joint deal for a single mulligan count. Same hand/turn
// model as evaluateDeal — see there for the scry and mulligan rules. Groups are disjoint, so
// a scry-revealed card matches at most one group; if more useful cards are revealed than
// `scryKeep` allows, only the first `scryKeep` (in reveal order) are kept and the rest are
// bottomed. Scratch buffers cnt/found are reused across calls and reset here.
function evaluateJointDeal(d, N, M, needs, targetTurns, goingFirst, additionalDraws,
                           order, pool, hand, cnt, found, rngPool) {
  const { targets, keeps, scryLookAt, scryKeep, scryCost, scryForceMulligan } = d
  const G = targets.length
  const lastTurn = Math.max(...targetTurns)

  cnt.fill(0)
  let handN = 0
  for (let i = 0; i < 7; i++) {
    const c = order[i]
    hand[handN++] = c
    for (let gi = 0; gi < G; gi++) if (targets[gi][c]) cnt[gi]++
  }
  let allFound = true
  for (let gi = 0; gi < G; gi++) {
    found[gi] = cnt[gi] >= needs[gi] ? 1 : 0
    if (!found[gi]) allFound = false
  }

  let deck = order
  let deckLen = N
  let dp = 7

  if (!allFound && M > 0) {
    let pi = 0
    for (let i = 7; i < N; i++) pool[pi++] = order[i]
    let sent = 0
    let kept = 0
    for (let i = 0; i < handN; i++) {
      const c = hand[i]
      let keepThis = false
      for (let gi = 0; gi < G; gi++) {
        if (keeps[gi][c] || (needs[gi] > 1 && cnt[gi] < needs[gi] && targets[gi][c])) { keepThis = true; break }
      }
      if (scryForceMulligan[c]) keepThis = false
      if (!keepThis && sent < M) { pool[pi++] = c; sent++ }
      else hand[kept++] = c
    }
    handN = kept
    const poolSize = pi
    for (let i = poolSize - 1; i > 0; i--) {
      const j = (rngPool() * (i + 1)) | 0
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t
    }
    for (let i = 0; i < sent; i++) {
      const c = pool[i]
      hand[handN++] = c
      for (let gi = 0; gi < G; gi++) {
        if (!found[gi] && targets[gi][c]) { cnt[gi]++; if (cnt[gi] >= needs[gi]) found[gi] = 1 }
      }
    }
    allFound = true
    for (let gi = 0; gi < G; gi++) if (!found[gi]) allFound = false
    deck = pool
    deckLen = poolSize
    dp = sent
  }

  for (let turn = 1; turn <= lastTurn && !allFound; turn++) {
    let draws = drawsOnTurn(turn, goingFirst, additionalDraws)
    while (draws > 0 && dp < deckLen) {
      const c = deck[dp++]
      hand[handN++] = c
      for (let gi = 0; gi < G; gi++) {
        if (!found[gi] && turn <= targetTurns[gi] && targets[gi][c]) {
          cnt[gi]++; if (cnt[gi] >= needs[gi]) found[gi] = 1
        }
      }
      draws--
    }
    allFound = true
    for (let gi = 0; gi < G; gi++) if (!found[gi]) allFound = false
    if (allFound) break

    let ink = turn
    let i = 0
    while (i < handN && !allFound) {
      const c = hand[i]
      if (scryLookAt[c] === 0 || scryCost[c] > ink) { i++; continue }
      ink -= scryCost[c]
      hand[i] = hand[--handN]
      const look = Math.min(scryLookAt[c], deckLen - dp)
      const cap = scryKeep[c]
      let taken = 0
      for (let s = 0; s < look && taken < cap; s++) {
        const sc = deck[dp + s]
        for (let gi = 0; gi < G; gi++) {
          if (!found[gi] && turn <= targetTurns[gi] && targets[gi][sc]) {
            cnt[gi]++; taken++
            if (cnt[gi] >= needs[gi]) found[gi] = 1
            break
          }
        }
      }
      dp += look
      allFound = true
      for (let gi = 0; gi < G; gi++) if (!found[gi]) allFound = false
    }
  }
  return allFound
}

// P(find ≥needs[i] of group i by turn targetTurns[i], for EVERY group, with an M-card mulligan).
export function mcJointSimN({
  targets, keeps, scryLookAt, scryKeep, scryCost, scryForceMulligan,
  N, M, targetTurns, needs, goingFirst = false, additionalDraws = 0,
  iters = MC_ITERS, seedOffset = 0,
}) {
  const d = { targets, keeps, scryLookAt, scryKeep, scryCost, scryForceMulligan }
  const { rngDeck, rngPool } = makeRngs(N, seedOffset)
  const order = new Int32Array(N)
  const pool = new Int32Array(N)
  const hand = new Int32Array(N)
  const cnt = new Int32Array(targets.length)
  const found = new Uint8Array(targets.length)
  let hits = 0
  for (let iter = 0; iter < iters; iter++) {
    shuffleDeck(order, N, rngDeck)
    if (evaluateJointDeal(d, N, M, needs, targetTurns, goingFirst, additionalDraws,
                          order, pool, hand, cnt, found, rngPool)) hits++
  }
  return hits / iters
}

// Joint version of mcSimMulliganRange: every mulligan count 0..maxM from one pass, sharing
// a single shuffled deal per iteration.
export function mcJointSimMulliganRange({
  targets, keeps, scryLookAt, scryKeep, scryCost, scryForceMulligan,
  N, maxM, targetTurns, needs, goingFirst = false, additionalDraws = 0,
  iters = MC_ITERS, seedOffset = 0,
}) {
  const d = { targets, keeps, scryLookAt, scryKeep, scryCost, scryForceMulligan }
  const { rngDeck, rngPool } = makeRngs(N, seedOffset)
  const order = new Int32Array(N)
  const pool = new Int32Array(N)
  const hand = new Int32Array(N)
  const cnt = new Int32Array(targets.length)
  const found = new Uint8Array(targets.length)
  const hits = new Int32Array(maxM + 1)
  for (let iter = 0; iter < iters; iter++) {
    shuffleDeck(order, N, rngDeck)
    for (let M = 0; M <= maxM; M++) {
      if (evaluateJointDeal(d, N, M, needs, targetTurns, goingFirst, additionalDraws,
                            order, pool, hand, cnt, found, rngPool)) hits[M]++
    }
  }
  return Array.from(hits, (h, M) => ({ m: M, p: h / iters }))
}

// --- Keyword Analysis ---
// Parses keyword abilities from card data and checks cross-card relationships:
// - Shift: is the lower-cost base character also in the deck?
// - Singer: how much song-cost capacity does the deck have vs. its song count?
// - Keyword density: per-keyword copy counts across the whole deck.

// Accounts for mulligan: keeps playable cards, sends back up to maxMulligan non-playable ones.
// When no playable card is in opening hand, sends back min(maxMulligan, 7) cards and redraws.
export function curveProbMC(deckCosts, N, maxMulligan, goingFirst, additionalDraws, iterations = 20000) {
  const rng = mulberry32(hashSeed([deckCosts, N, maxMulligan, goingFirst ? 1 : 0, additionalDraws, iterations]))
  const hits = new Int32Array(8)
  const order = new Int32Array(N)
  const pool = new Int32Array(N)

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < N; i++) order[i] = i
    for (let i = N - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp
    }

    for (let ti = 0; ti < 8; ti++) {
      const T = ti + 1
      const extraDraws = Math.min(
        (goingFirst ? Math.max(0, T - 1) : T) + additionalDraws,
        N - 7
      )

      // Check opening hand
      let handHas = false
      for (let i = 0; i < 7; i++) {
        if (deckCosts[order[i]] <= T) { handHas = true; break }
      }
      if (handHas) { hits[ti]++; continue }

      // No playable card in hand — mulligan if allowed
      if (maxMulligan === 0) {
        // No mulligan: check extra draws only
        let found = false
        for (let i = 7; i < 7 + extraDraws && i < N; i++) {
          if (deckCosts[order[i]] <= T) { found = true; break }
        }
        if (found) hits[ti]++
        continue
      }

      // Send back min(maxMulligan, 7) non-playable hand cards, pool = undrawn + sent
      const toSend = Math.min(maxMulligan, 7)
      let pi = 0
      for (let i = 7; i < N; i++) pool[pi++] = order[i]
      for (let i = 0; i < toSend; i++) pool[pi++] = order[i] // all hand cards are non-playable here

      // Shuffle pool
      for (let i = pi - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0
        const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp
      }

      // Draw toSend replacements + extraDraws turn draws from pool
      const toDraw = toSend + extraDraws
      let found = false
      for (let i = 0; i < toDraw && i < pi; i++) {
        if (deckCosts[pool[i]] <= T) { found = true; break }
      }
      if (found) hits[ti]++
    }
  }

  return Array.from(hits).map(h => h / iterations)
}

// P(3+ non-inkable cards in opening hand even after mulliganing excess non-inkables).
// Strategy: if hand has 3+ non-inkable, send back non-inkable cards (up to maxMulligan).
export function uninkableRiskMC(deckInkable, N, maxMulligan, iterations = 20000) {
  const rng = mulberry32(hashSeed([deckInkable, N, maxMulligan, iterations]))
  const order = new Int32Array(N)
  const pool = new Int32Array(N)
  let hits = 0

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < N; i++) order[i] = i
    for (let i = N - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp
    }

    // Count non-inkables in opening hand
    let nonInk = 0
    for (let i = 0; i < 7; i++) if (!deckInkable[order[i]]) nonInk++

    if (nonInk < 3) continue
    if (maxMulligan === 0) { hits++; continue }

    // Send back non-inkable cards (up to maxMulligan), pool = undrawn + sent
    let pi = 0
    for (let i = 7; i < N; i++) pool[pi++] = order[i]
    let sent = 0
    for (let i = 0; i < 7 && sent < maxMulligan; i++) {
      if (!deckInkable[order[i]]) { pool[pi++] = order[i]; sent++ }
    }

    // Shuffle pool
    for (let i = pi - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp
    }

    // Final hand = original hand minus sent non-inkables + sent replacements from pool
    let newNonInk = nonInk - sent // non-inkables kept from original hand
    for (let i = 0; i < sent && i < pi; i++) {
      if (!deckInkable[pool[i]]) newNonInk++
    }

    if (newNonInk >= 3) hits++
  }

  return hits / iterations
}

// P(no card with cost ≤ threshold in opening hand even after mulliganing non-playable cards).
// Used for Brickability dead draw risk.
export function deadDrawRiskMC(deckCosts, N, threshold, maxMulligan, iterations = 20000) {
  const rng = mulberry32(hashSeed([deckCosts, N, threshold, maxMulligan, iterations]))
  const order = new Int32Array(N)
  const pool = new Int32Array(N)
  let misses = 0

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < N; i++) order[i] = i
    for (let i = N - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp
    }

    // Check opening hand
    let hasPlayable = false
    for (let i = 0; i < 7; i++) {
      if (deckCosts[order[i]] <= threshold) { hasPlayable = true; break }
    }
    if (hasPlayable) continue
    if (maxMulligan === 0) { misses++; continue }

    // All hand cards are non-playable — send back up to maxMulligan, draw replacements
    const toSend = Math.min(maxMulligan, 7)
    let pi = 0
    for (let i = 7; i < N; i++) pool[pi++] = order[i]
    for (let i = 0; i < toSend; i++) pool[pi++] = order[i]

    // Shuffle pool
    for (let i = pi - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp
    }

    // Draw replacements only (opening hand, no subsequent turn draws)
    let found = false
    for (let i = 0; i < toSend && i < pi; i++) {
      if (deckCosts[pool[i]] <= threshold) { found = true; break }
    }
    if (!found) misses++
  }

  return misses / iterations
}

// --- Quest Pressure Simulation ---
// Simulates T1-T8 cumulative lore assuming:
//   - Opening hand of 7 (+ additionalDraws, matching this page's convention that
//     Additional Draws is a flat bonus already in hand from turn 1 on), draw 1 per turn
//     (skipped on turn 1 only when going first — matches the Going First/Second toggle)
//   - Ink 1 inkable card per turn (prefer non-questers, then lowest lore)
//   - Play characters + locations greedily (highest lore first) within ink budget
//   - Cards played on turn K can quest starting turn K+1 (they "dry" for one turn)
//   - Locations generate lore passively each turn after played, no characters needed
// Note: scry sources aren't modeled — this sim only plays Characters/Locations, never
// the Action/Item cards scry sources (and other draw effects) would come from.
export function questPressureSim(deckCards, goingFirst, additionalDraws, iterations = 15000) {
  const N = deckCards.length
  if (N === 0) return {
    avgLore: new Array(SIM_TURNS).fill(0), estWinTurn: null,
    loreBands: Array.from({ length: SIM_TURNS }, () => ({ p10: 0, p50: 0, p90: 0 })),
    winTurnCdf: new Array(SIM_TURNS).fill(0), winTurnPmf: new Array(SIM_TURNS).fill(0),
    medianWinTurn: null, neverWinRate: 1,
  }
  const deckFingerprint = new Int32Array(N * 4)
  for (let i = 0; i < N; i++) {
    const c = deckCards[i]
    deckFingerprint[i * 4] = c.cost ?? 0
    deckFingerprint[i * 4 + 1] = c.lore ?? 0
    deckFingerprint[i * 4 + 2] = c.inkwell ? 1 : 0
    deckFingerprint[i * 4 + 3] = c.type === 'Character' ? 1 : c.type === 'Location' ? 2 : 0
  }
  const rng = mulberry32(hashSeed([deckFingerprint, N, goingFirst ? 1 : 0, additionalDraws, iterations]))
  const order = new Uint16Array(N)
  const loreSums = new Float64Array(SIM_TURNS)
  // Per-turn cumulative lore samples (one column per simulated game) for percentile bands.
  const loreSamples = Array.from({ length: SIM_TURNS }, () => new Float32Array(iterations))
  // winTurnCdf[t] = count of games that have reached 20 lore by the end of turn t+1.
  const winTurnCdf = new Float64Array(SIM_TURNS)
  let neverWin = 0

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < N; i++) order[i] = i
    for (let i = N - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp
    }

    // inHand[i] = 1 if card i is in hand. Additional Draws is modeled as already in
    // hand from turn 1, matching gameDraws() elsewhere on this page.
    const openingSize = Math.min(N, 7 + additionalDraws)
    const inHand = new Uint8Array(N)
    for (let i = 0; i < openingSize; i++) inHand[order[i]] = 1
    let deckIdx = openingSize

    let cumLore = 0
    let ink = 0
    // boardLore[i] = lore of a card on the board ready to quest this turn
    const boardLore = []
    // justPlayed: lore values of cards played this turn (quest next turn)
    const justPlayed = []

    for (let t = 0; t < SIM_TURNS; t++) {
      // Draw one card (skip only on T1 when going first — going second still draws T1)
      if (!(goingFirst && t === 0) && deckIdx < N) inHand[order[deckIdx++]] = 1

      // Gain 1 permanent ink token
      ink++

      // Ink the best card: prefer non-questers, then lowest lore among questers
      // Only inkable cards can go to inkwell
      let inkChoice = -1
      let inkScore = Infinity
      for (let i = 0; i < N; i++) {
        if (!inHand[i] || !deckCards[i].inkwell) continue
        const c = deckCards[i]
        const isQuester = c.type === 'Character' || c.type === 'Location'
        const score = (isQuester ? 10000 : 0) + (c.lore ?? 0)
        if (score < inkScore) { inkScore = score; inkChoice = i }
      }
      if (inkChoice !== -1) inHand[inkChoice] = 0

      // Quest with existing board
      for (let i = 0; i < boardLore.length; i++) cumLore += boardLore[i]

      // Move last turn's just-played cards onto board
      for (let i = 0; i < justPlayed.length; i++) boardLore.push(justPlayed[i])
      justPlayed.length = 0

      // Collect playable questers sorted by lore desc, cost asc
      const candidates = []
      for (let i = 0; i < N; i++) {
        if (!inHand[i]) continue
        const c = deckCards[i]
        if ((c.type === 'Character' || c.type === 'Location') && c.cost <= ink) {
          candidates.push(i)
        }
      }
      candidates.sort((a, b) => {
        const la = deckCards[a].lore ?? 0, lb = deckCards[b].lore ?? 0
        if (lb !== la) return lb - la
        return deckCards[a].cost - deckCards[b].cost
      })

      // Greedily play highest-lore cards within ink budget
      let spent = 0
      for (const idx of candidates) {
        const cost = deckCards[idx].cost
        if (spent + cost <= ink) {
          spent += cost
          inHand[idx] = 0
          justPlayed.push(deckCards[idx].lore ?? 0)
        }
      }

      loreSums[t] += cumLore
      loreSamples[t][iter] = cumLore
    }

    // Win turn = first turn this game's cumulative lore reached 20.
    let winTurn = -1
    for (let t = 0; t < SIM_TURNS; t++) {
      if (loreSamples[t][iter] >= 20) { winTurn = t; break }
    }
    if (winTurn === -1) {
      neverWin++
    } else {
      // CDF: a game that wins on turn winTurn has also "won by" every later turn.
      for (let t = winTurn; t < SIM_TURNS; t++) winTurnCdf[t]++
    }
  }

  const avgLore = Array.from(loreSums).map(v => v / iterations)
  // Percentile bands per turn: sort each turn's samples and read off p10/p50/p90.
  // TypedArray.sort is numeric by default, so no comparator is needed.
  const loreBands = loreSamples.map(samples => {
    const sorted = samples.slice().sort()
    const at = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
    return { p10: at(0.10), p50: at(0.50), p90: at(0.90) }
  })
  // Cumulative P(reached 20 lore by turn t) and the per-turn marginal P(win on turn t).
  const winTurnCdfArr = Array.from(winTurnCdf).map(c => c / iterations)
  const winTurnPmf = winTurnCdfArr.map((p, t) => p - (t > 0 ? winTurnCdfArr[t - 1] : 0))
  const neverWinRate = neverWin / iterations
  // Median win turn: first turn where the cumulative win probability reaches 50%.
  const medianIdx = winTurnCdfArr.findIndex(p => p >= 0.5)
  const medianWinTurn = medianIdx === -1 ? null : medianIdx + 1
  // Estimated turn to reach 20 lore (first turn where avg >= 20, or null)
  const estWinTurn = avgLore.findIndex(v => v >= 20)
  return {
    avgLore,
    estWinTurn: estWinTurn === -1 ? null : estWinTurn + 1,
    loreBands,
    winTurnCdf: winTurnCdfArr,
    winTurnPmf,
    medianWinTurn,
    neverWinRate,
  }
}

