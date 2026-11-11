import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCards } from '../hooks/useCards'
import { runQuery, QuerySyntaxError } from '../lib/cardQuery'
import { cardPath } from '../lib/cardPrintings'
import { PageHeader } from '../components/ui/PageHeader'
import { Input } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { CardSearchSyntax } from '../components/CardSearchSyntax'

const PAGE = 120

export function CardSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const [draft, setDraft] = useState(q)
  const [shown, setShown] = useState(PAGE)
  const [helpOpen, setHelpOpen] = useState(false)
  // The box follows ?q= when it changes from outside the form (an example
  // chip, a card page's quick search, Back).
  const [draftFor, setDraftFor] = useState(q)
  if (draftFor !== q) {
    setDraftFor(q)
    setDraft(q)
    setShown(PAGE)
  }
  const { cards, sets, loading, error } = useCards()

  // Either a result list or the syntax message, never both.
  const outcome = useMemo(() => {
    if (!q.trim() || loading) return null
    try {
      return { results: runQuery(cards, sets, q) }
    } catch (e) {
      if (e instanceof QuerySyntaxError) return { syntaxError: e.message }
      throw e
    }
  }, [cards, sets, q, loading])

  function submit(e) {
    e.preventDefault()
    setShown(PAGE)
    setSearchParams(draft.trim() ? { q: draft.trim() } : {})
  }

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

      {error && <p className="text-sm text-red-700 mb-4">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading card data…</p>}

      {(helpOpen || (!q.trim() && !loading)) && (
        <Card title="Search syntax" className="p-4 mb-8">
          <CardSearchSyntax />
        </Card>
      )}

      {outcome?.syntaxError && (
        <p className="text-sm text-red-700">{outcome.syntaxError}</p>
      )}

      {outcome?.results && (
        <>
          <p className="text-sm text-gray-500 mb-4">
            {outcome.results.length.toLocaleString()} card{outcome.results.length === 1 ? '' : 's'}
          </p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {outcome.results.slice(0, shown).map(card => (
              <li key={cardPath(card)}>
                <Link to={cardPath(card)} className="block group">
                  <img
                    src={card.images.thumbnail}
                    alt={card.fullName}
                    loading="lazy"
                    className="w-full rounded-lg border border-gray-200 group-hover:border-gray-900 transition-colors"
                  />
                  <span className="block mt-1 text-xs text-gray-700 truncate">{card.fullName}</span>
                </Link>
              </li>
            ))}
          </ul>
          {outcome.results.length > shown && (
            <div className="mt-6 text-center">
              <Button onClick={() => setShown(s => s + PAGE)}>Show {Math.min(PAGE, outcome.results.length - shown)} more</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
