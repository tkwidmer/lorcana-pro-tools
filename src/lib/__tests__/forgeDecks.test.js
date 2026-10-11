import { describe, it, expect } from 'vitest'
import { parseForgeDeck } from '../forgeDecks'

const PATH = '/content/forge-decks/set-14-core/amber-steel.txt'

describe('parseForgeDeck', () => {
  it('reads the folder, frontmatter and card lines', () => {
    const raw = '---\nname: Princesses\ninks: Steel/Amber\nnote: Mulligan for Cinderella.\n---\n4 Cinderella - Ballroom Sensation\n2x Mowgli - Man Cub\n'
    expect(parseForgeDeck(PATH, raw)).toEqual({
      folderId: 'set-14-core',
      slug: 'amber-steel',
      name: 'Princesses',
      colors: ['amber', 'steel'],
      note: 'Mulligan for Cinderella.',
      cards: [{ name: 'Cinderella - Ballroom Sensation', count: 4 }, { name: 'Mowgli - Man Cub', count: 2 }],
      totalCards: 6,
    })
  })

  it('throws on a missing name, unknown inks, or no cards', () => {
    expect(() => parseForgeDeck(PATH, '---\ninks: amber\n---\n4 X\n')).toThrow('"name"')
    expect(() => parseForgeDeck(PATH, '---\nname: A\ninks: plaid\n---\n4 X\n')).toThrow('unknown inks')
    expect(() => parseForgeDeck(PATH, '---\nname: A\ninks: amber\n---\n')).toThrow('no "<count>')
  })
})
