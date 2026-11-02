// Matches an inkdecks.com decklist export (an array of { deck_id, author,
// inks, … }) to an event's standings by exact player name, for the admin
// ink-pair upload on /results/events/:id. Play Hub carries no decks, so the
// author name is the only join: a name that appears on more than one
// standing, or an author whose decks disagree on inks, is reported rather
// than guessed.

const VALID_INKS = new Set(['amber', 'amethyst', 'emerald', 'ruby', 'sapphire', 'steel'])

export interface DeckRow {
  deck_id?: string
  author?: unknown
  inks?: unknown
}

export interface StandingRef {
  rph_player_id: string
  player_name: string
}

export interface DeckInksMatch {
  updates: Array<{ playerId: string; playerName: string; inks: string[] }>
  unmatched: string[] // authors with no standing of that name
  ambiguous: string[] // name on several standings, or decks disagreeing on inks
  invalid: string[] // decks without an author or a valid one-or-two-ink pair
}

// Lowercase, de-duplicated, sorted, as the inks column stores them; null
// when the value is not one or two valid inks.
export function normalizeInks(inks: unknown): string[] | null {
  if (!Array.isArray(inks)) return null
  const set = [...new Set(inks.map((i) => String(i).trim().toLowerCase()))].sort()
  if (set.length < 1 || set.length > 2 || !set.every((i) => VALID_INKS.has(i))) return null
  return set
}

export function matchDeckInks(standings: StandingRef[], decks: DeckRow[]): DeckInksMatch {
  const result: DeckInksMatch = { updates: [], unmatched: [], ambiguous: [], invalid: [] }

  // The export repeats some decks; collect each author's distinct ink pairs.
  const byAuthor = new Map<string, Set<string>>()
  for (const deck of decks) {
    const inks = normalizeInks(deck.inks)
    const author = typeof deck.author === 'string' ? deck.author : ''
    if (!author || !inks) {
      result.invalid.push(author || `deck ${deck.deck_id ?? '?'}`)
      continue
    }
    const pairs = byAuthor.get(author) ?? new Set<string>()
    pairs.add(inks.join(','))
    byAuthor.set(author, pairs)
  }

  const byName = new Map<string, StandingRef[]>()
  for (const s of standings) byName.set(s.player_name, [...(byName.get(s.player_name) ?? []), s])

  for (const [author, pairs] of byAuthor) {
    const players = byName.get(author) ?? []
    if (players.length === 0) result.unmatched.push(author)
    else if (players.length > 1 || pairs.size > 1) result.ambiguous.push(author)
    else result.updates.push({ playerId: players[0].rph_player_id, playerName: author, inks: [...pairs][0].split(',') })
  }
  return result
}
