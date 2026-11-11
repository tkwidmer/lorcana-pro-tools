import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCards } from '../hooks/useCards'
import { useCardPrices } from '../hooks/useCardPrices'
import { runQuery, withDirective, QuerySyntaxError } from '../lib/cardQuery'
import { cardPath } from '../lib/cardPrintings'
import { legality } from '../lib/cardLegality'
import { printingPrice, usdOf, priceLabel } from '../lib/cardPrices'
import { resolveColors } from '../lib/inkColors'
import { PageHeader } from '../components/ui/PageHeader'
import { Input } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { InkIcons } from '../components/InkIcons'
import { CostBadge } from '../components/DecklistCardBar'
import { CardSearchSyntax } from '../components/CardSearchSyntax'

const PAGE = 120
// [order key or null (not sortable), header]
const COLUMNS = [
  ['name', 'Name'], ['color', 'Inks'], ['cost', 'Cost'], [null, 'Type'], ['strength', 'S/W/L'],
  ['rarity', 'Rarity'], ['set', 'Set'], [null, 'Core'], [null, 'Infinity'], ['usd', 'TCGplayer'],
]
const LEGAL = { legal: 'text-green-700', banned: 'text-red-700', rotated: 'text-gray-400', not_legal: 'text-gray-400' }
const LEGAL_LABEL = { legal: 'Legal', banned: 'Banned', rotated: '—', not_legal: '—' }

const usd = n => (n == null ? '—' : `$${n.toFixed(2)}`)

function ListView({ results, prices, order, direction, sortBy }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
            {COLUMNS.map(([key, label]) => (
              <th key={label} className="py-2 pr-3 font-semibold whitespace-nowrap">
                {key
                  ? (
                    <button type="button" onClick={() => sortBy(key)} className={`uppercase tracking-wider ${key === order ? 'text-gray-900' : 'hover:text-gray-900'}`}>
                      {label}{key === order ? (direction === 'desc' ? ' ↓' : ' ↑') : ''}
                    </button>
                  )
                  : label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map(card => {
            const l = legality(card)
            const price = printingPrice(prices, card)
            return (
              <tr key={cardPath(card)} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-1.5 pr-3"><Link to={cardPath(card)} className="text-gray-900 hover:underline">{card.fullName}</Link></td>
                <td className="py-1.5 pr-3"><InkIcons colors={resolveColors([card.color])} size={16} /></td>
                <td className="py-1.5 pr-3"><CostBadge cost={card.cost} inkable={card.inkwell} /></td>
                <td className="py-1.5 pr-3 text-gray-600 whitespace-nowrap">{card.type}{card.subtypesText ? ` • ${card.subtypesText}` : ''}</td>
                <td className="py-1.5 pr-3 tabular-nums text-gray-700">
                  {card.type === 'Character' ? `${card.strength}/${card.willpower}/${card.lore}` : card.type === 'Location' ? `–/${card.willpower}/${card.lore}` : ''}
                </td>
                <td className="py-1.5 pr-3 text-gray-600">{card.rarity}</td>
                <td className="py-1.5 pr-3 text-gray-600 whitespace-nowrap">{card.setCode} #{card.promoGrouping ? `${card.promoGrouping}-` : ''}{card.number}{card.variant ?? ''}</td>
                <td className={`py-1.5 pr-3 ${LEGAL[l.Core.status]}`}>{LEGAL_LABEL[l.Core.status]}</td>
                <td className={`py-1.5 pr-3 ${LEGAL[l.Infinity.status]}`}>{LEGAL_LABEL[l.Infinity.status]}</td>
                <td className="py-1.5 tabular-nums text-gray-700" title={priceLabel(price)}>{usd(usdOf(price))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function GridView({ results, prices }) {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
      {results.map(card => (
        <li key={cardPath(card)}>
          <Link to={cardPath(card)} className="block group">
            <img
              src={card.images.thumbnail}
              alt={card.fullName}
              loading="lazy"
              className="w-full rounded-lg border border-gray-200 group-hover:border-gray-900 transition-colors"
            />
            <span className="block mt-1 text-xs text-gray-700 truncate">{card.fullName}</span>
            <span className="block text-xs text-gray-500 tabular-nums">{usd(usdOf(printingPrice(prices, card)))}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function CardSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const [draft, setDraft] = useState(q)
  const [shown, setShown] = useState(PAGE)
  const [helpOpen, setHelpOpen] = useState(false)
  // The box follows ?q= when it changes from outside the form (an example
  // chip, a card page's quick search, a view or sort button, Back).
  const [draftFor, setDraftFor] = useState(q)
  if (draftFor !== q) {
    setDraftFor(q)
    setDraft(q)
    setShown(PAGE)
  }
  const { cards, sets, loading: cardsLoading, error: cardsError } = useCards()
  // Without prices the page still searches and shows the error; a usd term
  // then reports "Prices are not loaded" from the query engine.
  const { prices, error: pricesError } = useCardPrices()
  const loading = cardsLoading || (!prices && !pricesError)
  const setQ = next => setSearchParams(next.trim() ? { q: next.trim() } : {})

  // Either a result list or the syntax message, never both.
  const outcome = useMemo(() => {
    if (!q.trim() || loading) return null
    try {
      return runQuery(cards, sets, q, prices)
    } catch (e) {
      if (e instanceof QuerySyntaxError) return { syntaxError: e.message }
      throw e
    }
  }, [cards, sets, q, prices, loading])

  function submit(e) {
    e.preventDefault()
    setShown(PAGE)
    setQ(draft)
  }

  // A sortable header rewrites order:, flipping to dir:desc when the column is
  // already the ascending sort.
  function sortBy(key) {
    const flip = outcome.order === key && outcome.direction === 'asc'
    setQ(withDirective(withDirective(q, 'order', key), 'dir', flip ? 'desc' : null))
  }

  const results = outcome?.cards
  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Card Search"
        description="Every Lorcana card, searchable the way Scryfall searches Magic."
        actions={<Button size="sm" variant="quiet" onClick={() => setHelpOpen(o => !o)}>{helpOpen ? 'Hide syntax' : 'Syntax'}</Button>}
      />

      <form onSubmit={submit} className="flex gap-2 max-w-3xl mb-6">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder='k:shift c:amethyst f:core — or just a name'
          className="flex-1 font-mono"
          autoFocus
          spellCheck={false}
        />
        <Button type="submit" variant="primary" disabled={loading}>Search</Button>
      </form>

      {cardsError && <p className="text-sm text-red-700 mb-4">{cardsError}</p>}
      {pricesError && <p className="text-sm text-red-700 mb-4">{pricesError}</p>}
      {loading && !cardsError && <p className="text-sm text-gray-500">Loading card data…</p>}

      {(helpOpen || (!q.trim() && !loading)) && (
        <Card title="Search syntax" className="p-4 mb-8">
          <CardSearchSyntax />
        </Card>
      )}

      {outcome?.syntaxError && (
        <p className="text-sm text-red-700">{outcome.syntaxError}</p>
      )}

      {results && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <p className="text-sm text-gray-500">{results.length.toLocaleString()} card{results.length === 1 ? '' : 's'}</p>
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant={outcome.display === 'grid' ? 'primary' : 'quiet'} onClick={() => setQ(withDirective(q, 'display', null))}>Grid</Button>
              <Button size="sm" variant={outcome.display === 'list' ? 'primary' : 'quiet'} onClick={() => setQ(withDirective(q, 'display', 'list'))}>List</Button>
            </div>
          </div>
          {outcome.display === 'list'
            ? <ListView results={results.slice(0, shown)} prices={prices} order={outcome.order} direction={outcome.direction} sortBy={sortBy} />
            : <GridView results={results.slice(0, shown)} prices={prices} />}
          {results.length > shown && (
            <div className="mt-6 text-center">
              <Button onClick={() => setShown(s => s + PAGE)}>Show {Math.min(PAGE, results.length - shown)} more</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
