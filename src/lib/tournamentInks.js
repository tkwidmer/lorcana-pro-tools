// Ink pairs at a Play Hub event. RPH puts each player's submitted deck's inks
// on every match they play, as user_event_status.deck_descriptor_label
// ({ parts: [{ value: 'amethyst,ruby' }] }); standings and registrations do
// not carry it. A player who submitted no deck has no label.
import { resolveColors, VALID_INKS } from './inkColors'

export function inksOfRelationship(rel) {
  const value = rel?.user_event_status?.deck_descriptor_label?.parts?.[0]?.value
  if (!value) return null
  const inks = resolveColors(value.split(','))
  return inks.length ? inks : null
}

// Map of player id (string) → sorted inks, from every match they played.
export function playerInks(matches) {
  const map = new Map()
  for (const match of matches ?? []) {
    for (const rel of match.player_match_relationships ?? []) {
      const inks = inksOfRelationship(rel)
      if (inks && rel.player?.id != null) map.set(String(rel.player.id), inks)
    }
  }
  return map
}

export const pairKey = (inks) => inks.join('/')

// One decided pairing between two players with known inks: each side's pair
// and its score (1 win, 0 loss, 0.5 draw). Byes, assigned losses and
// unreported matches are skipped.
function decidedPairings(matches, inksById) {
  const out = []
  for (const match of matches ?? []) {
    if (match.match_is_bye || match.match_is_loss) continue
    const [a, b] = match.player_match_relationships ?? []
    if (!a?.player || !b?.player) continue
    const aInks = inksById.get(String(a.player.id))
    const bInks = inksById.get(String(b.player.id))
    if (!aInks || !bInks) continue
    const isDraw = match.match_is_intentional_draw || match.match_is_unintentional_draw
    if (!isDraw && match.winning_player == null) continue
    const aScore = isDraw ? 0.5 : match.winning_player === a.player.id ? 1 : 0
    out.push({ a: pairKey(aInks), b: pairKey(bInks), aScore })
  }
  return out
}

const emptyRecord = () => ({ wins: 0, losses: 0, draws: 0 })
function addScore(rec, score) {
  if (score === 1) rec.wins++
  else if (score === 0) rec.losses++
  else rec.draws++
}
// Draws count as half a win, like RPH's own game-win percentages.
export function winRate({ wins, losses, draws }) {
  const n = wins + losses + draws
  return n ? ((wins + draws / 2) / n) * 100 : null
}

// The field by ink pair, most played first: players on each pair, their share
// of players with a known pair, and the pair's record against other pairs
// (mirrors excluded, since they are always even).
export function inkPairMeta(matches) {
  const inksById = playerInks(matches)
  const rows = new Map()
  for (const inks of inksById.values()) {
    const key = pairKey(inks)
    if (!rows.has(key)) rows.set(key, { key, inks, players: 0, ...emptyRecord() })
    rows.get(key).players++
  }
  for (const { a, b, aScore } of decidedPairings(matches, inksById)) {
    if (a === b) continue
    addScore(rows.get(a), aScore)
    addScore(rows.get(b), 1 - aScore)
  }
  const known = inksById.size
  return [...rows.values()]
    .map((r) => ({ ...r, share: (r.players / known) * 100, winRate: winRate(r) }))
    .sort((x, y) => y.players - x.players || x.key.localeCompare(y.key))
}

const cap = (s) => s[0].toUpperCase() + s.slice(1)

// The field as "Emerald/Steel 8" lines, the Stream Overlay Metagame card's
// input (the same lines Field Breakdown and the carde.io bookmarklet give).
export function inkPairCountLines(matches) {
  return inkPairMeta(matches).map((r) => `${r.inks.map(cap).join('/')} ${r.players}`)
}

// Pair-vs-pair records: cells.get(`${row}|${col}`) is the row pair's record
// against the column pair. The diagonal counts mirror matches.
export function inkPairMatrix(matches) {
  const inksById = playerInks(matches)
  const cells = new Map()
  const cell = (row, col) => {
    const k = `${row}|${col}`
    if (!cells.has(k)) cells.set(k, emptyRecord())
    return cells.get(k)
  }
  for (const { a, b, aScore } of decidedPairings(matches, inksById)) {
    addScore(cell(a, b), aScore)
    if (a !== b) addScore(cell(b, a), 1 - aScore)
  }
  return cells
}

// The 15 two-ink pairs, each sorted like resolveColors() returns them.
export const INK_PAIRS = VALID_INKS.flatMap((a, i) => VALID_INKS.slice(i + 1).map((b) => [a, b]))

// "Best of" promo: the best-ranked player on each ink pair, read straight from
// the standings so RPH's tiebreakers decide ties. Pairs with a leader come
// first in standings order; pairs nobody is on follow with entry null.
export function bestOfLeaders(standings, inksById) {
  const leaders = new Map()
  for (const entry of [...(standings ?? [])].sort((a, b) => a.rank - b.rank)) {
    const inks = inksById.get(String(entry.player.id))
    if (inks?.length !== 2) continue
    const key = pairKey(inks)
    if (!leaders.has(key)) leaders.set(key, entry)
  }
  return INK_PAIRS
    .map((inks) => ({ key: pairKey(inks), inks, entry: leaders.get(pairKey(inks)) ?? null }))
    .sort((x, y) => (x.entry?.rank ?? Infinity) - (y.entry?.rank ?? Infinity))
}
