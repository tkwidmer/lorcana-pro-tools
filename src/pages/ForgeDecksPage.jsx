import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCards } from '../hooks/useCards'
import { STOCK_DECK_FOLDERS } from '../lib/stockDecks'
import { forgeDecksFor } from '../lib/forgeDecks'
import { PageHeader } from '../components/ui/PageHeader'
import { Tabs, Tab } from '../components/ui/Tabs'
import { InkIcons } from '../components/InkIcons'
import { DeckListCard } from '../components/DeckListCard'

export function ForgeDecksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const folder = STOCK_DECK_FOLDERS.find(f => f.id === searchParams.get('folder')) ?? STOCK_DECK_FOLDERS[0]
  const decks = forgeDecksFor(folder.id)
  const { cards, loading } = useCards()
  // Reprints share a fullName and the card's type/cost, so any match will do.
  const cardByName = useMemo(
    () => Object.fromEntries(cards.map(c => [(c.fullName ?? c.name).toLowerCase(), c])),
    [cards],
  )

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="The Forge Decklists"
        description="Our recommended lists for each format, organized by set."
      />

      <Tabs className="mb-6">
        {STOCK_DECK_FOLDERS.map(f => (
          <Tab key={f.id} active={f.id === folder.id} onClick={() => setSearchParams({ folder: f.id })}>
            {f.title}
          </Tab>
        ))}
      </Tabs>

      {loading && <p className="text-gray-500">Loading deck lists…</p>}
      {!loading && decks.length === 0 && <p className="text-gray-500">No recommended lists for this format yet.</p>}
      {!loading && decks.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {decks.map(deck => (
            <DeckListCard
              key={deck.slug}
              title={<span className="flex items-center gap-2"><InkIcons colors={deck.colors} size={20} />{deck.name}</span>}
              subtitle={deck.note}
              entries={deck.cards.map(({ name, count }) => ({ key: name, name, count, card: cardByName[name.toLowerCase()] ?? null }))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
