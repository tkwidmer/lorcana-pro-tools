// Stable hash of a decklist's card+count composition, order-independent —
// two decklists with the same cards/counts (regardless of array order or key
// shape) fingerprint identically. Used to group games/decks by the deck they
// were actually played with, without relying on an external deck id.
export function deckFingerprint(decklist) {
  if (!decklist) return null
  const cards = Array.isArray(decklist) ? decklist : Object.values(decklist)
  // Each entry is { cardId, count } — include count so a different card quantity = different deck
  const key = cards
    .map(c => typeof c === 'string' ? c : `${c?.cardId ?? c?.name ?? c?.id ?? ''}x${c?.count ?? 1}`)
    .filter(s => s && s !== 'x1')
    .sort()
    .join('|')
  if (!key) return null
  let h = 5381
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0
  }
  return String(Math.abs(h))
}

// True when a game's recorded decklist differs from the deck's current
// (latest) card composition — i.e. the deck has been edited since that game.
export function isDeckModified(latestDecklist, apiCardIds) {
  if (!latestDecklist?.length || !apiCardIds?.length) return false
  const gameCounts = {}
  for (const { cardId, count } of latestDecklist) gameCounts[cardId] = (gameCounts[cardId] ?? 0) + (count ?? 1)
  const apiCounts = {}
  for (const id of apiCardIds) apiCounts[id] = (apiCounts[id] ?? 0) + 1
  const toSig = obj => Object.entries(obj).sort().map(([k, v]) => `${k}:${v}`).join('|')
  return toSig(gameCounts) !== toSig(apiCounts)
}
