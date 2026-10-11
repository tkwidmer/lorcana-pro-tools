// The Forge's own recommended lists, shown above the duels.ink averages on
// the Stock Deck Lists page. One file per list at
// content/forge-decks/<folder id>/<slug>.txt (folder ids from
// STOCK_DECK_FOLDERS), in this format:
//
//   ---
//   name: Amber/Steel Princesses
//   inks: amber/steel
//   note: Optional one-paragraph note shown above the list.
//   ---
//   4 Cinderella - Ballroom Sensation
//   4 Miguel Rivera - Street Musician
//
// The card lines are the same `4 Card Name` text duels.ink exports, with or
// without its trailing `(set-number)` card ids. Adding a
// file is all it takes to publish; a malformed one throws, failing the build.
import { splitFrontmatter } from './frontmatter'
import { parseDeckList } from './parseDeckList'
import { resolveColors } from './inkColors'

export function parseForgeDeck(path, raw) {
  const [, folderId, slug] = path.match(/([^/]+)\/([^/]+)\.txt$/)
  const { fields, body } = splitFrontmatter(path, raw)
  if (!fields.name) throw new Error(`${path}: frontmatter is missing "name"`)
  if (!fields.inks) throw new Error(`${path}: frontmatter is missing "inks"`)
  const colors = resolveColors([fields.inks])
  if (colors.length === 0) throw new Error(`${path}: unknown inks "${fields.inks}"`)
  // duels.ink exports may tag each line with a card id, e.g. "(13-PD1-3)".
  const cards = parseDeckList(body.replace(/[ \t]*\([^)\n]*\)[ \t]*$/gm, ''))
  if (cards.length === 0) throw new Error(`${path}: no "<count> <card name>" lines`)
  return {
    folderId,
    slug,
    name: fields.name,
    colors,
    note: fields.note ?? null,
    cards,
    totalCards: cards.reduce((sum, c) => sum + c.count, 0),
  }
}

const files = import.meta.glob('/content/forge-decks/*/*.txt', { eager: true, query: '?raw', import: 'default' })
const FORGE_DECKS = Object.entries(files).map(([path, raw]) => parseForgeDeck(path, raw))

export function forgeDecksFor(folderId) {
  return FORGE_DECKS.filter(d => d.folderId === folderId)
}
