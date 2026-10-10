import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchEraStats } from '../lib/duelsApi'
import { useCards } from '../hooks/useCards'
import { buildCardIdToCard } from '../lib/cardIdResolver'
import { STOCK_DECK_FOLDERS, buildStockDecks } from '../lib/stockDecks'
import { BUCKET_ORDER, BUCKET_LABEL, buildBuckets } from '../lib/decklistShared'
import { PageHeader } from '../components/ui/PageHeader'
import { Tabs, Tab } from '../components/ui/Tabs'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { InkIcons } from '../components/InkIcons'
import { CardBar } from '../components/DecklistCardBar'

const capitalize = s => s[0].toUpperCase() + s.slice(1)

function StockDeck({ deck, cardById }) {
  const [copied, setCopied] = useState(false)
  const entries = deck.cards.map(({ cardId, count }) => {
    const card = cardById[cardId]
    return { cardId, count, card, name: card ? card.fullName ?? card.name : cardId }
  })
  // A card duels.ink knows but LorcanaJSON hasn't published yet has no type
  // or cost to bucket by, so it's listed on its own under the buckets.
  const buckets = buildBuckets(entries.filter(e => e.card))
  const unknown = entries.filter(e => !e.card)

  const copyList = async () => {
    const ordered = [...BUCKET_ORDER.flatMap(type => buckets[type]), ...unknown]
    await navigator.clipboard.writeText(ordered.map(e => `${e.count} ${e.name}`).join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-display uppercase tracking-wide text-gray-900">{deck.name}</h3>
          <p className="text-xs text-gray-500">
            {deck.metaShare.toFixed(1)}% of the meta · {deck.winRate.toFixed(1)}% win rate · {deck.gamesPlayed.toLocaleString()} games
          </p>
        </div>
        <Button size="sm" className="ml-auto flex-shrink-0" onClick={copyList}>{copied ? 'Copied' : 'Copy list'}</Button>
      </div>
      <div className="space-y-3">
        {BUCKET_ORDER.filter(type => buckets[type].length > 0).map(type => (
          <div key={type}>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              {BUCKET_LABEL[type]} ({buckets[type].reduce((sum, e) => sum + e.count, 0)})
            </p>
            <div className="space-y-1">
              {buckets[type].map(entry => <CardBar key={entry.cardId} entry={entry} />)}
            </div>
          </div>
        ))}
        {unknown.length > 0 && (
          <div className="text-xs text-gray-500">
            Not in card data yet: {unknown.map(e => `${e.count}× ${e.cardId}`).join(', ')}
          </div>
        )}
      </div>
      {deck.totalCards !== 60 && (
        <p className="text-xs text-gray-500 mt-3">{deck.totalCards} cards: the average build rounds to more than 60, trim to taste.</p>
      )}
    </Card>
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
            {era && ` since ${new Date(era.startedAt).toLocaleDateString()}`}.
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
