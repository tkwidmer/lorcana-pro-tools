// Compares two saved meta snapshots (see metaSnapshots.js) for the same
// queue/period/ranks config and returns the winRate/games delta per matchup,
// so a shift in the meta between two dates can be surfaced without re-fetching
// duels.ink — both snapshots' matchups are already stored locally.
export function computeMetaDrift(fromSnapshot, toSnapshot) {
  if (!fromSnapshot || !toSnapshot) return []

  const fromByKey = new Map()
  for (const m of fromSnapshot.matchups ?? []) {
    fromByKey.set(matchupKey(m.colorsA, m.colorsB), m)
  }

  const seen = new Set()
  const rows = []
  for (const m of toSnapshot.matchups ?? []) {
    const key = matchupKey(m.colorsA, m.colorsB)
    seen.add(key)
    const prev = fromByKey.get(key)
    rows.push(buildRow(m.colorsA, m.colorsB, prev, m))
  }
  // Matchups present before but missing now (too few games in the newer window).
  for (const [key, prev] of fromByKey) {
    if (seen.has(key)) continue
    rows.push(buildRow(prev.colorsA, prev.colorsB, prev, null))
  }

  return rows.sort((a, b) => Math.abs(b.winRateDelta ?? 0) - Math.abs(a.winRateDelta ?? 0))
}

function matchupKey(colorsA, colorsB) {
  return [JSON.stringify(colorsA), JSON.stringify(colorsB)].sort().join('::')
}

function buildRow(colorsA, colorsB, prev, curr) {
  const winRateDelta = (prev && curr) ? curr.winRate - prev.winRate : null
  const gamesDelta = (prev && curr) ? curr.games - prev.games : null
  return {
    colorsA,
    colorsB,
    prevWinRate: prev?.winRate ?? null,
    currWinRate: curr?.winRate ?? null,
    prevGames: prev?.games ?? null,
    currGames: curr?.games ?? null,
    winRateDelta,
    gamesDelta,
    isNew: !prev,
    isGone: !curr,
  }
}
