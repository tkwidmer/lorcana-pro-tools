// One card's standing in duels.ink's /api/stats/meta feed (the same response
// Stock Decks and Deck Doctor read): which named archetypes run it, how many
// copies their average build carries, and its per-archetype and per-colour-pair
// lift. A card is looked up by every duels.ink id its printings carry, because
// the feed names one printing per card. Every undocumented field is null-safe.
import { aggregateArchetypes, representativeProfile, metaShare } from './metaSynthesis'

const pct = (wins, games) => (games > 0 ? Math.round((wins / games) * 10000) / 100 : null)

export function cardMetaRows(stats, ids) {
  const wanted = new Set(ids)
  const totalGames = stats?.activity?.totalGames ?? 0
  const rows = []
  for (const archetype of aggregateArchetypes(stats?.profiles)) {
    const build = representativeProfile(stats, archetype.key)
    const copies = Object.entries(build?.centroidCounts ?? {}).filter(([id]) => wanted.has(id)).reduce((sum, [, n]) => sum + n, 0)
    const lift = (build?.cardLift ?? []).find(e => wanted.has(e.cardId)) ?? null
    if (copies === 0 && !lift) continue
    rows.push({
      key: archetype.key,
      name: archetype.name,
      colors: archetype.colors,
      gamesPlayed: archetype.gamesPlayed,
      winRate: pct(archetype.wins, archetype.gamesPlayed),
      metaShare: metaShare(archetype.gamesPlayed, totalGames),
      copies,
      presence: lift?.presence ?? null,
      winRateWith: lift?.winRateWith ?? null,
      lift: lift?.lift ?? null,
    })
  }
  return rows.sort((a, b) => b.gamesPlayed - a.gamesPlayed)
}

export function cardPairLift(stats, ids) {
  const wanted = new Set(ids)
  const rows = []
  for (const [pair, list] of Object.entries(stats?.pairCardLift ?? {})) {
    for (const e of list ?? []) {
      if (wanted.has(e.cardId)) rows.push({ pair, presence: e.presence ?? null, winRateWith: e.winRateWith ?? null, lift: e.lift ?? null })
    }
  }
  return rows.sort((a, b) => (b.lift ?? -Infinity) - (a.lift ?? -Infinity))
}
