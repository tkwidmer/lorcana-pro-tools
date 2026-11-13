// Pure helpers for the Team Tracker pages and Tournament Lookup's Teams tab
// (spec: docs/superpowers/specs/2026-11-06-team-tracker-design.md). Members
// arrive in the API's shape: { id, playerId, playerName, joinedOn, leftOn }.

// Current members by join date (unknown starts first, they are the longest
// standing); former members by most recent departure.
export function splitRoster(members) {
  const current = members.filter((m) => m.leftOn === null).sort((a, b) => (a.joinedOn ?? '').localeCompare(b.joinedOn ?? ''))
  const former = members.filter((m) => m.leftOn !== null).sort((a, b) => b.leftOn.localeCompare(a.leftOn))
  return { current, former }
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

// Every directory team with a current member in a live event's standings
// (or pre-event roster), ranked by combined match points, then wins, then
// name: the Tournament Lookup Teams tab. `teams` is the `teams` read (each
// with its current `members`); `entries` are RPH standings rows.
export function teamsAtEvent(teams, entries, topCutSize) {
  const byPlayer = new Map(entries.map((e) => [String(e.player.id), e]))
  return teams
    .map((t) => {
      const teamEntries = t.members.map((m) => byPlayer.get(String(m.playerId))).filter(Boolean)
      return {
        slug: t.slug,
        name: t.name,
        logoUrl: t.logoUrl,
        rosterSize: t.members.length,
        inEvent: teamEntries.length,
        points: teamEntries.reduce((sum, e) => sum + (e.match_points ?? 0), 0),
        entries: teamEntries,
        summary: teamLiveSummary(teamEntries, topCutSize),
      }
    })
    .filter((r) => r.inEvent > 0)
    .sort((a, b) => b.points - a.points || b.summary.wins - a.summary.wins || a.name.localeCompare(b.name))
}

// The Teams share image: the top `n` teams from teamsAtEvent() ranked by
// their best individual placement (ties: combined points, then name), each
// with the member who holds it. Teams with no ranked member are left out.
export function topTeamsByBestPlacement(rows, n = 5) {
  return rows
    .filter((r) => r.summary.bestRank !== null)
    .sort((a, b) => a.summary.bestRank - b.summary.bestRank || b.points - a.points || a.name.localeCompare(b.name))
    .slice(0, n)
    .map((r) => {
      const top = r.entries.find((e) => e.rank === r.summary.bestRank)
      return { ...r, topPlayer: { name: top.user_event_status?.best_identifier ?? top.player.best_identifier, rank: top.rank, record: top.record } }
    })
}

function monthYear(yyyyMmDd) {
  return new Date(`${yyyyMmDd}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// A null joinedOn is an unknown start: the member counts since before the archive.
export function formatMembership({ joinedOn, leftOn }) {
  if (leftOn) return `${joinedOn ? monthYear(joinedOn) : 'Before the archive'} – ${monthYear(leftOn)}`
  return joinedOn ? `Since ${monthYear(joinedOn)}` : 'Since before the archive'
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
