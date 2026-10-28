import { describe, it, expect } from 'vitest'
import { decklistsFromPages } from '../cardePdf'

const page = (title, cards, extra = '') =>
  `${title}\nPlayer: Someone\nFormat: Core Constructed\nSubmitted: Oct 24, 2026 7:49 AM\nEvent: Quest Coast IV\nOrganizer: Angry Goose Games\n${cards}\n${extra}10/25/26, 2:45 PM Decklists - Quest Coast IV\nabout:blank 1/27`

describe('decklistsFromPages', () => {
  it('reads one deck per page, rejoining a card name that wrapped and dropping the print chrome', () => {
    const text = decklistsFromPages([
      page("Derek A's Deck", '4 Another Tale to Spin\n4 Mickey Mouse & Minnie Mouse - Adventuring\nDuo\n2 Let It Go'),
      page('Hella Sideways 🤘💢🌉', '4 Hamm - Piggy Bank\n4 The Horseman Strikes!', '🤘 💢 🌉\n'),
    ])
    expect(text).toBe('4 Another Tale to Spin\n4 Mickey Mouse & Minnie Mouse - Adventuring Duo\n2 Let It Go\n\n4 Hamm - Piggy Bank\n4 The Horseman Strikes!')
  })
  it('continues a deck onto a page with no Player line and skips pages without cards', () => {
    expect(decklistsFromPages([page('A', '4 Hamm - Piggy Bank'), '3 Tod - Clever Fox\nabout:blank 2/2', page('Cover', '')])).toBe('4 Hamm - Piggy Bank\n3 Tod - Clever Fox')
    expect(decklistsFromPages(['Nothing here'])).toBe('')
  })
})
