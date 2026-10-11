import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchEraStats } from '../lib/duelsApi'
import { useCards } from '../hooks/useCards'
import { buildCardIdToCard } from '../lib/cardIdResolver'
import { STOCK_DECK_FOLDERS, buildStockDecks } from '../lib/stockDecks'
import { PageHeader } from '../components/ui/PageHeader'
import { Tabs, Tab } from '../components/ui/Tabs'
import { InkIcons } from '../components/InkIcons'
import { DeckListCard } from '../components/DeckListCard'

const capitalize = s => s[0].toUpperCase() + s.slice(1)

function StockDeck({ deck, cardById }) {
  const entries = deck.cards.map(({ cardId, count }) => {
    const card = cardById[cardId] ?? null
    return { key: cardId, count, card, name: card ? card.fullName ?? card.name : cardId }
  })
  return (
    <DeckListCard
      title={deck.name}
      subtitle={`${deck.metaShare.toFixed(1)}% of the meta · ${deck.winRate.toFixed(1)}% win rate · ${deck.gamesPlayed.toLocaleString()} games`}
      entries={entries}
    >
      {deck.totalCards !== 60 && (
        <p className="text-xs text-gray-500 mt-3">{deck.totalCards} cards: the average build rounds to more than 60, trim to taste.</p>
      )}
    </DeckListCard>
  )
}

export function StockDecksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const folder = STOCK_DECK_FOLDERS.find(f => f.id === searchParams.get('folder')) ?? STOCK_DECK_FOLDERS[0]
  // Keyed by folder, so switching folders shows loading instead of the last folder's lists.
  const [result, setResult] = useState({})
  const stats = result.folderId === folder.id ? result.stats : null
  const error = result.folderId === folder.id ? result.error : null
  const { cards, loading: cardsLoading } = useCards()
  const cardById = useMemo(() => buildCardIdToCard(cards), [cards])

  useEffect(() => {
    let cancelled = false
    fetchEraStats({ queue: folder.queue, era: folder.era })
      .then(data => { if (!cancelled) setResult({ folderId: folder.id, stats: data }) })
      .catch(e => { if (!cancelled) setResult({ folderId: folder.id, error: e.message }) })
    return () => { cancelled = true }
  }, [folder])

  const pairs = useMemo(() => (stats ? buildStockDecks(stats) : []), [stats])
  const era = stats && [stats.meta.eras.currentEra, ...stats.meta.eras.pastEras].find(e => e.key === folder.era)

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Stock Deck Lists"
        description="A starting list for every archetype people are playing, grouped by ink pair. Each list is the average build of that archetype's most-played version on duels.ink, so it updates as the meta settles."
      />

      <Tabs className="mb-6">
        {STOCK_DECK_FOLDERS.map(f => (
          <Tab key={f.id} active={f.id === folder.id} onClick={() => setSearchParams({ folder: f.id })}>
            {f.title}
          </Tab>
        ))}
      </Tabs>

      {error && <p className="text-red-700">Couldn't load deck lists: {error}</p>}
      {!error && (!stats || cardsLoading) && <p className="text-gray-500">Loading deck lists…</p>}

      {stats && !cardsLoading && (
        <>
          <p className="text-sm text-gray-500 mb-6">
            From {stats.activity.totalGames.toLocaleString()} {stats.meta.queue.name} games on duels.ink
            {era && ` since ${new Date(era.startedAt).toLocaleDateString()}`}. duels.ink last updated these stats {new Date(stats.updatedAt).toLocaleString()}.
          </p>
          <div className="space-y-10">
            {pairs.map(pair => (
              <section key={pair.key}>
                <h2 className="flex items-center gap-2 font-display text-xl uppercase tracking-wide text-gray-900 mb-3">
                  <InkIcons colors={pair.colors} size={24} />
                  {pair.colors.map(capitalize).join(' / ')}
                </h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {pair.decks.map(deck => <StockDeck key={deck.key} deck={deck} cardById={cardById} />)}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
