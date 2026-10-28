import { aggregateArchetypes, representativeProfile } from './metaSynthesis'
import { deckFingerprint } from './deckFingerprint'
import { matchupKey, resolveColors } from './inkColors'
import { shrinkWR, diffInterval } from './practiceSim'

// Pure helpers behind /deck-doctor: a player's own list (from match-history
// rows, which carry the exact decklist played in every game) against the
// field's average build and card lift for the matching duels.ink archetype,
// plus their matchup record against the field's. Design:
// docs/superpowers/specs/2026-10-22-deck-doctor-design.md. Every read of the
// undocumented meta fields (profiles, cardLift, pairCardLift,
// archetypeMatchups) is null-safe: a missing field empties a section.

export const MIN_ARCHETYPE_OVERLAP = 0.5
export const MIN_MATCHUP_GAMES = 5

export function countsFromDecklist(yourDecklist) {
  const m = new Map()
  for (const { cardId, count } of yourDecklist ?? []) if (count > 0) m.set(cardId, (m.get(cardId) ?? 0) + count)
  return m
}

// Every card id the field data names: centroids, archetype lift, pair lift.
export function fieldCardIds(stats) {
  const ids = new Set()
  for (const p of stats?.profiles ?? []) {
    for (const id of Object.keys(p.centroidCounts ?? {})) ids.add(id)
    for (const e of p.cardLift ?? []) ids.add(e.cardId)
  }
  for (const list of Object.values(stats?.pairCardLift ?? {})) for (const e of list ?? []) ids.add(e.cardId)
  return ids
}

// Paste mode: matchDeckList entries → Map<cardId, count>. LorcanaJSON lists a
// reprint under each printing's id and duels.ink names only one, so a pasted
// card takes the printing the field data uses (`knownIds`, fieldCardIds),
// else the matched card's own id.
export function countsFromPasted(entries, cards, knownIds) {
  const idsByName = new Map()
  for (const c of cards ?? []) {
    const ids = idsByName.get(c.fullName) ?? []
    ids.push(`${c.setCode}-${c.number}`)
    idsByName.set(c.fullName, ids)
  }
  const m = new Map()
  for (const { card, count } of entries) {
    const id = (idsByName.get(card.fullName) ?? []).find((i) => knownIds.has(i)) ?? `${card.setCode}-${card.number}`
    m.set(id, (m.get(id) ?? 0) + count)
  }
  return m
}

// Sealed and draft games: their decks are built per event, not iterated on.
export function isLimited(g) {
  const s = `${g.queue_id ?? ''} ${g.queue_name ?? ''}`.toLowerCase()
  return s.includes('sealed') || s.includes('draft')
}

function colorsOf(str) {
  return str ? resolveColors([str]) : []
}

function titleCase(c) {
  return c[0].toUpperCase() + c.slice(1)
}

// One entry per deck the player has used in a constructed queue, same
// grouping MatchHistoryPage uses (deck id, else list fingerprint). Draws and
// abandoned games count as games played but neither wins nor losses.
export function constructedDecks(games, deckNames = {}) {
  const byKey = new Map()
  for (const g of games) {
    if (isLimited(g) || !g.your_decklist?.length) continue
    const key = g.your_deck_id ?? deckFingerprint(g.your_decklist)
    if (!key) continue
    let d = byKey.get(key)
    if (!d) {
      const colors = colorsOf(g.your_deck_colors)
      d = {
        key, deckId: g.your_deck_id ?? null, colors,
        name: (g.your_deck_id && deckNames[g.your_deck_id]) || colors.map(titleCase).join('/') || 'Unknown deck',
        queueName: g.queue_name ?? null, games: 0, wins: 0, losses: 0, latestDecklist: g.your_decklist,
      }
      byKey.set(key, d)
    }
    if (g.result === 'win') d.wins += 1
    else if (g.result === 'loss') d.losses += 1
    if (g.result === 'win' || g.result === 'loss') d.games += 1
    if (g.started_at && (!d.latestAt || g.started_at > d.latestAt)) { d.latestAt = g.started_at; d.latestDecklist = g.your_decklist }
  }
  return [...byKey.values()].sort((a, b) => b.games - a.games)
}

export function diffBuild(myCounts, centroidCounts) {
  const field = new Map(Object.entries(centroidCounts ?? {}))
  const onlyMine = [], onlyField = [], countDiffs = []
  for (const [cardId, mine] of myCounts) {
    const f = field.get(cardId)
    if (f == null) onlyMine.push({ cardId, mine })
    else if (f !== mine) countDiffs.push({ cardId, mine, field: f })
  }
  for (const [cardId, f] of field) if (!myCounts.has(cardId)) onlyField.push({ cardId, field: f })
  const byCount = (k) => (a, b) => b[k] - a[k] || a.cardId.localeCompare(b.cardId)
  onlyMine.sort(byCount('mine')); onlyField.sort(byCount('field'))
  countDiffs.sort((a, b) => Math.abs(b.field - b.mine) - Math.abs(a.field - a.mine) || a.cardId.localeCompare(b.cardId))
  return { onlyMine, onlyField, countDiffs }
}

// Versions of one deck: its games grouped by the exact list played, newest
// first, each diffed against the latest list (so "4-2 on the version before
// I cut X" is visible). Draws/abandoned count toward games only.
export function deckVersions(games) {
  const byFp = new Map()
  for (const g of games) {
    if (!g.your_decklist?.length) continue
    const fp = deckFingerprint(g.your_decklist)
    let v = byFp.get(fp)
    if (!v) { v = { fingerprint: fp, counts: countsFromDecklist(g.your_decklist), games: 0, wins: 0, losses: 0, firstAt: g.started_at, lastAt: g.started_at }; byFp.set(fp, v) }
    v.games += 1
    if (g.result === 'win') v.wins += 1
    else if (g.result === 'loss') v.losses += 1
    if (g.started_at < v.firstAt) v.firstAt = g.started_at
    if (g.started_at > v.lastAt) v.lastAt = g.started_at
  }
  const versions = [...byFp.values()].sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))
  const latest = versions[0]?.counts ?? new Map()
  return versions.map((v) => ({ ...v, diffFromLatest: diffBuild(v.counts, Object.fromEntries(latest)) }))
}

function sameColors(a, b) {
  const x = [...a].sort().join('/'), y = [...b].sort().join('/')
  return x === y
}

// Same-colour archetypes ranked by how much of the list matches the
// representative variant's average build: shared = Σ min(mine, centroid),
// overlap = shared / the larger of the two deck sizes.
export function archetypeCandidates(stats, colors, myCounts) {
  if (!stats?.profiles?.length || !colors?.length) return []
  const mineTotal = [...myCounts.values()].reduce((s, n) => s + n, 0)
  return aggregateArchetypes(stats.profiles)
    .filter((a) => sameColors(a.colors, colors))
    .map((archetype) => {
      const profile = representativeProfile(stats, archetype.key)
      const centroid = profile?.centroidCounts ?? {}
      let shared = 0, centroidTotal = 0
      for (const [cardId, n] of Object.entries(centroid)) { centroidTotal += n; shared += Math.min(n, myCounts.get(cardId) ?? 0) }
      const total = Math.max(mineTotal, centroidTotal, 1)
      return { key: archetype.key, name: archetype.name, overlap: shared / total, shared, total, profile, archetype }
    })
    .sort((a, b) => b.overlap - a.overlap)
}

export function assignArchetype(stats, colors, myCounts) {
  const best = archetypeCandidates(stats, colors, myCounts)[0]
  return best && best.overlap >= MIN_ARCHETYPE_OVERLAP ? best : null
}

export function liftChecklist(liftEntries, myCounts) {
  return (liftEntries ?? [])
    .map((e) => {
      const mine = myCounts.get(e.cardId) ?? 0
      const flag = e.lift > 0 && mine === 0 ? 'missing-positive' : e.lift < 0 && mine > 0 ? 'present-negative' : null
      return { cardId: e.cardId, lift: e.lift, presence: e.presence ?? null, mine, flag }
    })
    .sort((a, b) => b.lift - a.lift)
}

function pct(wins, games) {
  return games > 0 ? Math.round((wins / games) * 10000) / 100 : null
}

// The field's record for one archetype against each opponent colour pair,
// rolled up from duels.ink's profile-id-keyed archetypeMatchups across every
// variant of the archetype, both directions (as side B, wins = games − winsA).
export function archetypeVsColorPairs(stats, archetypeKey) {
  const out = new Map()
  if (!stats?.profiles?.length || !stats.archetypeMatchups?.length) return out
  const archetype = aggregateArchetypes(stats.profiles).find((a) => a.key === archetypeKey)
  if (!archetype) return out
  const mine = new Set(archetype.ids)
  const colorsById = new Map(stats.profiles.map((p) => [p.id, p.colors]))
  const add = (oppId, games, wins) => {
    const colors = colorsById.get(oppId)
    if (!colors) return
    const k = matchupKey(colors)
    const cur = out.get(k) ?? { games: 0, wins: 0 }
    out.set(k, { games: cur.games + games, wins: cur.wins + wins })
  }
  for (const m of stats.archetypeMatchups) {
    if (mine.has(m.archetypeIdA) && !mine.has(m.archetypeIdB)) add(m.archetypeIdB, m.games, m.winsA)
    else if (mine.has(m.archetypeIdB) && !mine.has(m.archetypeIdA)) add(m.archetypeIdA, m.games, m.games - m.winsA)
  }
  for (const [k, v] of out) out.set(k, { ...v, winRate: pct(v.wins, v.games) })
  return out
}

// Fallback field: colour pair vs colour pair from stats.matchups (what
// Practice Plan uses), when no archetype is assigned.
export function colorPairField(stats, myColors) {
  const out = new Map()
  const myKey = matchupKey(myColors ?? [])
  for (const m of stats?.matchups ?? []) {
    const a = matchupKey(m.colorsA), b = matchupKey(m.colorsB)
    if (a === myKey) out.set(b, { games: m.games, winRate: m.winRate })
    else if (b === myKey) out.set(a, { games: m.games, winRate: m.winRate == null ? null : Math.round((100 - m.winRate) * 100) / 100 })
  }
  return out
}

export function personalMatchups(games) {
  const out = new Map()
  for (const g of games) {
    if (g.result !== 'win' && g.result !== 'loss') continue
    const opp = colorsOf(g.opp_deck_colors)
    if (opp.length !== 2) continue
    const k = matchupKey(opp)
    const cur = out.get(k) ?? { games: 0, wins: 0, losses: 0 }
    cur.games += 1
    if (g.result === 'win') cur.wins += 1; else cur.losses += 1
    out.set(k, cur)
  }
  return out
}

// One row per opponent pair the player has faced: record, win rate shrunk
// toward the field's (practiceSim.shrinkWR), the field's rate, and whether
// the gap is beyond sample noise (Newcombe interval excludes zero).
export function matchupTable(personal, field, { minGames = MIN_MATCHUP_GAMES } = {}) {
  const rows = []
  for (const [oppKey, p] of personal) {
    const f = field.get(oppKey) ?? null
    const fieldWinRate = f?.winRate ?? null
    const shrunkWinRate = shrinkWR(p.wins, p.games, fieldWinRate) * 100
    let gap = null, significant = false
    if (fieldWinRate != null && f.games > 0) {
      gap = (p.wins / p.games) * 100 - fieldWinRate
      const fieldWins = f.wins ?? Math.round((fieldWinRate / 100) * f.games)
      const [lo, hi] = diffInterval(p.wins, p.games, fieldWins, f.games)
      significant = p.games >= minGames && (hi < 0 || lo > 0)
    }
    rows.push({ oppKey, oppColors: oppKey.split('+'), games: p.games, wins: p.wins, losses: p.losses, shrunkWinRate, fieldWinRate, fieldGames: f?.games ?? null, gap, significant, belowMin: p.games < minGames })
  }
  return rows.sort((a, b) => b.games - a.games)
}

export function defaultQueueFor(queueName) {
  const s = (queueName ?? '').toLowerCase()
  const format = s.includes('infinity') ? 'infinity' : 'core'
  const mode = s.includes('bo3') ? 'bo3' : 'bo1'
  return `${format}-${mode}`
}

const text = (t) => ({ type: 'text', text: t })
export const fmtPp = (n) => `${n > 0 ? '+' : ''}${n.toFixed(1)} pp`
const fmtPct = (n) => `${Math.round(n)}%`
export const pairLabel = (colors) => colors.map(titleCase).join('/')

// The verdict: three to five sentences, every optional one omitted when its
// input is empty. `nameOf` resolves a duels.ink card id to a display name.
export function deckDoctorVerdict({ eraName, archetype, noProfiles = false, lifts = [], impact = [], matchups = [], nameOf = (id) => id }) {
  const blocks = []
  if (archetype) blocks.push(text(`Your list is ${archetype.name}: ${archetype.shared} of ${archetype.total} cards match the field's average build.`))
  else if (noProfiles) blocks.push(text(`duels.ink hasn't published ${eraName ?? 'this set'}'s archetype builds yet, so there is no field build to compare against. Your own results below still apply.`))
  else blocks.push(text(`Your list doesn't match any ${eraName ?? 'current'} archetype closely, so the comparison uses the field for your colours instead.`))

  // Archetype and pair lift lists can name the same card; the first wins.
  const seen = new Set()
  lifts = lifts.filter((l) => !seen.has(l.cardId) && seen.add(l.cardId))
  const missing = lifts.filter((l) => l.flag === 'missing-positive')
  if (missing.length) blocks.push(text(`You're missing ${missing.length} of the field's win-rate-lift cards: ${missing.slice(0, 4).map((l) => `${nameOf(l.cardId)} (${fmtPp(l.lift)}${l.presence != null ? `, in ${fmtPct(l.presence * 100)} of lists` : ''})`).join(', ')}.`))
  const negative = lifts.filter((l) => l.flag === 'present-negative')
  if (negative.length) blocks.push(text(`You run ${negative.length} card${negative.length === 1 ? '' : 's'} that correlate${negative.length === 1 ? 's' : ''} with losing in this field: ${negative.slice(0, 4).map((l) => `${nameOf(l.cardId)} (${fmtPp(l.lift)})`).join(', ')}.`))

  const weakest = impact.filter((c) => c.war != null && !c.lowSample).sort((a, b) => a.war - b.war)[0]
  if (weakest && weakest.war < 0) blocks.push(text(`Over your own games, ${weakest.name} is your weakest card by wins above replacement (${weakest.war.toFixed(1)} WAR across ${weakest.gamesWith} games with it).`))

  // matchups: null means no personal results (a pasted list): no sentence.
  if (matchups == null) return blocks
  const worst = matchups.filter((m) => m.significant && m.gap < 0).sort((a, b) => a.gap - b.gap)[0]
  if (worst) blocks.push(text(`Your worst matchup relative to the field: vs ${pairLabel(worst.oppColors)}, ${fmtPct(worst.shrunkWinRate)} over ${worst.games} games where the field wins ${fmtPct(worst.fieldWinRate)}.`))
  else blocks.push(text('No matchup where your results differ from the field’s beyond sample noise.'))
  return blocks
}
