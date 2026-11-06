// Pure helpers for the Team Tracker pages and Tournament Lookup's team tab
// (spec: docs/superpowers/specs/2026-11-06-team-tracker-design.md). Members
// arrive in the API's shape: { id, playerId, playerName, joinedOn, leftOn }.

// Current members by join date; former members by most recent departure.
export function splitRoster(members) {
  const current = members.filter((m) => m.leftOn === null).sort((a, b) => a.joinedOn.localeCompare(b.joinedOn))
  const former = members.filter((m) => m.leftOn !== null).sort((a, b) => b.leftOn.localeCompare(a.leftOn))
  return { current, former }
}

// The { [playerId]: { name } } map Tournament Lookup threads as `team`, from
// the current roster only: a live event always uses who is on the team now.
export function rosterMap(members) {
  return Object.fromEntries(members.filter((m) => m.leftOn === null).map((m) => [String(m.playerId), { name: m.playerName }]))
}

// Parses RPH's "W-L-D" record string into integer parts, defaulting missing
// or malformed segments to 0.
export function parseRecord(record) {
  const [w, l, d] = String(record ?? '').split('-').map((n) => parseInt(n, 10))
  return { w: w || 0, d: d || 0, l: l || 0 }
}

// The Team tab's tiles over the team members found in a live event's
// standings: combined record, rank spread, and how many sit inside the cut.
export function teamLiveSummary(entries, topCutSize) {
  if (entries.length === 0) return null
  const summary = { wins: 0, draws: 0, losses: 0, bestRank: null, worstRank: null, inCut: 0 }
  for (const entry of entries) {
    const { w, d, l } = parseRecord(entry.record)
    summary.wins += w
    summary.draws += d
    summary.losses += l
    if (entry.rank == null) continue
    summary.bestRank = summary.bestRank === null ? entry.rank : Math.min(summary.bestRank, entry.rank)
    summary.worstRank = summary.worstRank === null ? entry.rank : Math.max(summary.worstRank, entry.rank)
    if (topCutSize && entry.rank <= topCutSize) summary.inCut += 1
  }
  return summary
}

function monthYear(yyyyMmDd) {
  return new Date(`${yyyyMmDd}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function formatMembership({ joinedOn, leftOn }) {
  return leftOn ? `${monthYear(joinedOn)} – ${monthYear(leftOn)}` : `Since ${monthYear(joinedOn)}`
}

// Up to two initials for a team without a logo.
export function teamInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}
