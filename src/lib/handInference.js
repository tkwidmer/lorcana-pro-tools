// Hypergeometric P(0 copies in hand) for K unseen copies of a card, given
// hand of size h drawn from a pool of size N (= hand + deck).
function probZeroInHand(unseenCopies, handSize, totalUnseen) {
  if (unseenCopies <= 0) return 1
  if (handSize <= 0) return 1
  if (handSize >= totalUnseen) return 0 // hand IS everything
  let p = 1
  for (let i = 0; i < unseenCopies; i++) {
    const num = totalUnseen - handSize - i
    const den = totalUnseen - i
    if (num <= 0) return 0
    p *= num / den
  }
  return p
}

// Given an inferred decklist + this game's observations + current hand/deck
// sizes, return per-card hand probabilities.
//
// inferredDeck: [{ name, estimatedCopies }] — best guess of their 60-card list
// observed:     [{ name, plays, inked, discarded }] — this game's events
// handSize, deckSize: current public counts
//
// Returns { entries, totalUnseen, totalKnownOut, consistency }
//   entries: [{ name, K, seen, unseen, expectedInHand, probAtLeastOne }]
//   sorted by probAtLeastOne descending
export function inferHand(inferredDeck, observed, handSize, deckSize) {
  const totalUnseen = (handSize ?? 0) + (deckSize ?? 0)
  if (totalUnseen <= 0 || !inferredDeck?.length) {
    return { entries: [], totalUnseen, totalKnownOut: 0, consistency: null }
  }

  const observedByName = {}
  for (const o of (observed ?? [])) {
    observedByName[o.name] = o
  }

  let totalKnownOut = 0
  let totalUnseenCopies = 0
  const entries = []

  for (const card of inferredDeck) {
    const K = card.estimatedCopies ?? card.plays ?? 0
    if (K <= 0) continue

    const o = observedByName[card.name] ?? { plays: 0, inked: 0, discarded: 0 }
    // Cards definitely out of hand: plays + inks. discards may overlap with
    // a previous play (banishment), so take max(plays + inks, discarded) to
    // avoid double-counting in the common case.
    const seen = Math.max((o.plays ?? 0) + (o.inked ?? 0), o.discarded ?? 0)
    const unseen = Math.max(0, K - seen)

    totalKnownOut += Math.min(K, seen)
    totalUnseenCopies += unseen

    if (unseen <= 0) continue

    const expectedInHand = unseen * handSize / totalUnseen
    const probAtLeastOne = 1 - probZeroInHand(unseen, handSize, totalUnseen)

    entries.push({
      name: card.name,
      K,
      seen,
      unseen,
      expectedInHand,
      probAtLeastOne,
    })
  }

  entries.sort((a, b) =>
    b.probAtLeastOne - a.probAtLeastOne ||
    b.expectedInHand - a.expectedInHand ||
    a.name.localeCompare(b.name)
  )

  // Consistency check: sum of unseen copies should ≈ totalUnseen if the
  // inferred decklist accounts for ~60 cards. Off by N means we're missing
  // (or overcounting) N copies somewhere.
  const consistency = {
    inferredUnseen: totalUnseenCopies,
    actualUnseen: totalUnseen,
    diff: totalUnseenCopies - totalUnseen,
  }

  return { entries, totalUnseen, totalKnownOut, consistency }
}
