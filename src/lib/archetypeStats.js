// Helpers for the archetype-level data duels.ink added to /api/stats/meta
// alongside the existing color-pair `matchups`/`colorPairs`:
//   - `profiles`: one entry per detected archetype (plus a handful of raw,
//     uncurated color-pair entries where `archetypeName` is null — e.g. a
//     mono-color bucket that hasn't been split into named archetypes yet).
//   - `archetypeMatchups`: head-to-head records between two archetype ids,
//     stored once per unordered pair (A vs B), analogous to `matchups` but
//     keyed by archetypeId instead of color arrays.

// Only archetypes duels.ink has actually named — the rest are raw color-pair
// fallback rows (already covered by the existing color matrix) and would
// just be noise here.
export function getCuratedArchetypes(profiles) {
  return (profiles ?? [])
    .filter(p => p.archetypeName)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed)
}

export function archetypePlayRate(profile, totalGames) {
  if (!totalGames) return 0
  return (profile.gamesPlayed / totalGames) * 100
}

export function getArchetypesForColorPair(profiles, colors) {
  const key = [...colors].sort().join('/')
  return getCuratedArchetypes(profiles).filter(p => [...p.colors].sort().join('/') === key)
}

// Bidirectional lookup + opponent-list builder for one archetype, mirroring
// the approach WinrateMatrixPage already uses for color-pair `matchups`.
export function getArchetypeMatchupsFor(archetypeMatchups, archetypeId, profilesById) {
  const rows = []
  for (const m of archetypeMatchups ?? []) {
    if (m.archetypeIdA === archetypeId) {
      rows.push({
        opponentId: m.archetypeIdB,
        opponent: profilesById.get(m.archetypeIdB) ?? null,
        games: m.games,
        winRate: m.winRate,
        firstPlayerWinRate: m.firstPlayerWinRate,
        isMirror: m.archetypeIdA === m.archetypeIdB,
      })
    } else if (m.archetypeIdB === archetypeId && m.archetypeIdA !== m.archetypeIdB) {
      // duels.ink only records first-player stats from A's perspective, so
      // there's no clean flip for the reverse direction — omit it rather
      // than show a misleading number.
      rows.push({
        opponentId: m.archetypeIdA,
        opponent: profilesById.get(m.archetypeIdA) ?? null,
        games: m.games,
        winRate: 100 - m.winRate,
        firstPlayerWinRate: null,
        isMirror: false,
      })
    }
  }
  return rows.sort((a, b) => b.games - a.games)
}

export function buildProfilesById(profiles) {
  return new Map((profiles ?? []).map(p => [p.id, p]))
}
