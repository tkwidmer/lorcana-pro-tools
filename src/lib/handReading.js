// Hand-reading trainer support: reconstruct the opponent's actual hand and the
// public information available to you at each of your turns, so you can practice
// reading their hand and compare your read against both the hypergeometric
// engine and the ground truth from the full replay log.
import { inferHand } from './handInference.js'

const normP = (p) => (p === 1 || p === '1' ? 1 : p === 2 || p === '2' ? 2 : null)
const DECK_SIZE = 60

const keyOf = (c) => c?.instanceId || `${c?.id ?? c?.cardId ?? '?'}:${c?.name ?? c?.cardName ?? '?'}`

// Approximate the opponent's decklist from everything they reveal across the
// whole game (used when the real decklist from Match History isn't available).
export function approxDeckFromLog(logs, oppNum) {
  const copies = {} // name -> Set of instance keys
  const note = (name, k) => {
    if (!name) return
    if (!copies[name]) copies[name] = new Set()
    copies[name].add(k)
  }
  for (const e of logs) {
    if (normP(e.player) !== oppNum) continue
    const d = e.data ?? {}
    if (e.type === 'INITIAL_HAND') (d.initialHandCards ?? []).forEach(c => note(c.name, keyOf(c)))
    else if (e.type === 'MULLIGAN') (d.drawnCards ?? []).forEach(c => note(c.name, keyOf(c)))
    else if (['CARD_DRAWN', 'CARD_PLAYED', 'CARD_INKED', 'CARD_DISCARDED', 'CARD_RETURNED', 'CARD_LOOKED_AT'].includes(e.type)) {
      note(d.cardName, keyOf({ instanceId: d.instanceId, id: d.cardId, name: d.cardName }))
    }
  }
  return Object.entries(copies).map(([name, set]) => ({ name, estimatedCopies: set.size }))
}

// Build one training snapshot at the start of each of the viewer's turns.
// parsed: a stored gamelog record (must include _rawLogs)
// viewerNum: which seat is "you"; opponent is the other seat
// inferredDeck: [{ name, estimatedCopies }] (real decklist) or null to derive from the log
export function buildHandReadingPoints(parsed, viewerNum, inferredDeck = null) {
  const logs = parsed?._rawLogs
  const me = normP(viewerNum)
  if (!Array.isArray(logs) || !me) return { points: [], oppNum: null, deck: [] }
  const oppNum = me === 1 ? 2 : 1

  const deck = inferredDeck?.length ? inferredDeck : approxDeckFromLog(logs, oppNum)

  // Running opponent state
  const hand = new Map() // key -> { id, name }
  const observed = {} // name -> { plays, inked, discarded }
  let deckSize = DECK_SIZE
  let inkwell = 0
  const lore = { 1: 0, 2: 0 }

  const obs = (name) => (observed[name] ??= { name, plays: 0, inked: 0, discarded: 0 })
  const addToHand = (c) => { if (c?.name) hand.set(keyOf(c), { id: c.id ?? c.cardId, name: c.name ?? c.cardName }) }
  const removeFromHand = (c) => {
    const k = keyOf(c)
    if (hand.has(k)) { hand.delete(k); return }
    // Fall back to removing any copy with the same name (instanceId mismatch)
    for (const [hk, v] of hand) { if (v.name === (c.name ?? c.cardName)) { hand.delete(hk); return } }
  }

  const snapshot = (turn) => {
    const counts = {}
    for (const v of hand.values()) counts[v.name] = (counts[v.name] ?? 0) + 1
    const actualHand = Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name))
    const handSize = hand.size
    const observedList = Object.values(observed).map(o => ({ ...o }))
    const { entries, consistency } = inferHand(deck, observedList, handSize, Math.max(0, deckSize))
    return {
      turn,
      handSize,
      deckSize: Math.max(0, deckSize),
      inkwell,
      yourLore: lore[me],
      oppLore: lore[oppNum],
      actualHand,
      actualNames: new Set(Object.keys(counts)),
      observed: observedList,
      inference: entries, // [{ name, K, seen, unseen, expectedInHand, probAtLeastOne }]
      consistency,
    }
  }

  const points = []

  for (const e of logs) {
    const p = normP(e.player)
    const d = e.data ?? {}
    const type = e.type

    // Snapshot at the start of each of the viewer's turns (skip the very first,
    // before any meaningful info exists).
    if (type === 'TURN_START' && p === me) {
      if (points.length > 0 || (e.turnNumber ?? 0) > 1) {
        points.push(snapshot(e.turnNumber ?? points.length + 1))
      } else {
        points.push(snapshot(e.turnNumber ?? 1))
      }
    }

    // Lore tracking (both players, for context)
    if (type === 'CARD_QUEST' && p && d.newLoreTotal != null) lore[p] = d.newLoreTotal

    if (p !== oppNum) continue

    switch (type) {
      case 'INITIAL_HAND': {
        const opening = (d.initialHandCards ?? []).filter(c => c?.name)
        for (const c of opening) addToHand(c)
        deckSize -= opening.length // opening hand leaves the deck (mulligan reshuffles equal counts, net zero)
        break
      }
      case 'MULLIGAN':
        for (const c of (d.mulliganedCards ?? [])) removeFromHand(c)
        for (const c of (d.drawnCards ?? [])) addToHand(c)
        break
      case 'CARD_DRAWN':
        addToHand({ instanceId: d.instanceId, id: d.cardId, name: d.cardName })
        deckSize--
        break
      case 'CARD_RETURNED':
        addToHand({ instanceId: d.instanceId, id: d.cardId, name: d.cardName })
        break
      case 'CARD_LOOKED_AT':
        if (d.revealDestination === 'hand') { addToHand({ instanceId: d.instanceId, id: d.cardId, name: d.cardName }); deckSize-- }
        break
      case 'CARD_PLAYED':
        removeFromHand({ instanceId: d.instanceId, id: d.cardId, name: d.cardName })
        obs(d.cardName).plays++
        break
      case 'CARD_INKED':
        removeFromHand({ instanceId: d.instanceId, id: d.cardId, name: d.cardName })
        obs(d.cardName).inked++
        inkwell++
        break
      case 'CARD_DISCARDED':
        removeFromHand({ instanceId: d.instanceId, id: d.cardId, name: d.cardName })
        obs(d.cardName).discarded++
        break
      case 'CARD_PUT_INTO_INKWELL':
        if (d.fromZone === 'hand') { removeFromHand({ instanceId: d.instanceId, id: d.cardId, name: d.cardName }); obs(d.cardName).inked++ }
        inkwell++
        break
      default:
        break
    }
  }

  return { points, oppNum, deck }
}

// Score a "which cards" guess against the truth and a fair engine baseline.
// guesses: Set of card names the user thinks are in hand
// point:   a training point from buildHandReadingPoints
//
// The engine baseline picks its top-N most likely candidates, where N is the
// expected number of held candidate-cards (sum of per-card probabilities). A
// fixed probability threshold doesn't work: a 4-of in a 60-card deck sits well
// under 50%, so a 0.5 cutoff would have the engine pick nothing.
export function scoreCardGuess(guesses, point) {
  const truth = point.actualNames
  const candidates = point.inference.filter(e => e.unseen > 0)
  const candidateSet = new Set(candidates.map(e => e.name))
  const guessableTruth = [...truth].filter(n => candidateSet.has(n))

  const evalSet = (picks) => {
    let tp = 0, fp = 0
    for (const name of picks) {
      if (!candidateSet.has(name)) continue
      if (truth.has(name)) tp++; else fp++
    }
    const fn = guessableTruth.length - tp
    const precision = tp + fp > 0 ? tp / (tp + fp) : null
    const recall = guessableTruth.length > 0 ? tp / guessableTruth.length : null
    const f1 = precision != null && recall != null && precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0
    return { tp, fp, fn, precision, recall, f1 }
  }

  const expectedHeld = Math.round(candidates.reduce((a, e) => a + e.probAtLeastOne, 0))
  const n = Math.max(0, Math.min(candidates.length, expectedHeld || (guessableTruth.length > 0 ? 1 : 0)))
  const enginePicks = [...candidates].sort((a, b) => b.probAtLeastOne - a.probAtLeastOne).slice(0, n).map(e => e.name)

  return {
    you: evalSet(guesses),
    engine: evalSet(enginePicks),
    enginePicks,
    candidateCount: candidates.length,
    guessableTruthCount: guessableTruth.length,
  }
}
