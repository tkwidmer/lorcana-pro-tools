// Helpers for the archetype-level data duels.ink added to /api/stats/meta
// alongside the existing color-pair `matchups`/`colorPairs`:
//   - `profiles`: one entry per detected build-variant cluster (plus a handful
//     of raw, uncurated color-pair entries where `archetypeName` is null — e.g.
//     a mono-color bucket that hasn't been split into named archetypes yet).
//     Several profiles share one archetype; metaSynthesis.js's
//     `aggregateArchetypes` groups them.
//   - `archetypeMatchups`: head-to-head records between two profile ids
//     (`archetypeIdA`/`archetypeIdB` are profile `id`s, not `archetypeId`s),
//     stored once per unordered pair.

// Only archetypes duels.ink has actually named — the rest are raw color-pair
// fallback rows (already covered by the existing color matrix) and would
// just be noise here.
export function getCuratedArchetypes(profiles) {
  return (profiles ?? [])
    .filter(p => p.archetypeName)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed)
}
