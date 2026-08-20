// Ranked MMR tier thresholds, lowest to highest. duels.ink doesn't return
// these from the API (a leaderboard row's `tier` only carries a name/icon
// for that player, not the band's MMR range) — these are the fixed
// breakpoints duels.ink's own site uses, in 150-MMR steps starting at 1000.
export const RANK_TIERS = [
  { name: 'Common', min: -Infinity, color: '#9a5b2e' },
  { name: 'Uncommon', min: 1000, color: '#6b7280' },
  { name: 'Rare', min: 1150, color: '#b7791f' },
  { name: 'Super Rare', min: 1300, color: '#0f7c8c' },
  { name: 'Epic', min: 1450, color: '#b08900' },
  { name: 'Legendary', min: 1600, color: '#0e9169' },
  { name: 'Enchanted', min: 1750, color: '#8b5cf6' },
  { name: 'Iconic', min: 1900, color: '#dc2626' },
]

export function tierForMmr(mmr) {
  let tier = RANK_TIERS[0]
  for (const t of RANK_TIERS) {
    if (mmr >= t.min) tier = t
  }
  return tier
}

// Every tier name at or above `tierName` (e.g. "Epic" -> ["Epic", "Legendary",
// "Enchanted", "Iconic"]) — the rank list to pass to /api/stats/meta's `ranks`
// filter for an "X and above" band. Returns [] for an unknown tier name.
export function ranksAtOrAbove(tierName) {
  const idx = RANK_TIERS.findIndex(t => t.name === tierName)
  if (idx === -1) return []
  return RANK_TIERS.slice(idx).map(t => t.name)
}

// Every tier name below `tierName` — the complementary "everyone under this
// band" set, used to compare what's played at lower MMR against the
// selected band. Returns [] when `tierName` is already the bottom tier.
export function ranksBelow(tierName) {
  const idx = RANK_TIERS.findIndex(t => t.name === tierName)
  if (idx <= 0) return []
  return RANK_TIERS.slice(0, idx).map(t => t.name)
}
