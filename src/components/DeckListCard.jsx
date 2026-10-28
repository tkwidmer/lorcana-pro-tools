import { useState } from 'react'
import { BUCKET_ORDER, BUCKET_LABEL, buildBuckets } from '../lib/decklistShared'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { CardBar } from './DecklistCardBar'

// One list: cards grouped by type with cost emblems, plus a Copy list button
// that writes the `4 Card Name` text duels.ink imports, and buttons that open
// the same text in Deck Insights / the Decklist Inspector (both read their
// deck from localStorage, the same hand-off Match History uses). `entries` are
// { key, name, count, card }; `card` is null when LorcanaJSON has no match
// (a card it hasn't published yet, or a misspelled name), so it's listed
// on its own under the buckets.
export function DeckListCard({ title, subtitle, entries, children }) {
  const [copied, setCopied] = useState(false)
  const buckets = buildBuckets(entries.filter(e => e.card))
  const unknown = entries.filter(e => !e.card)

  const listText = [...BUCKET_ORDER.flatMap(type => buckets[type]), ...unknown]
    .map(e => `${e.count} ${e.name}`).join('\n')

  const copyList = async () => {
    await navigator.clipboard.writeText(listText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card className="p-4">
      <h3 className="font-display uppercase tracking-wide text-gray-900">{title}</h3>
      {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
      <div className="flex flex-wrap gap-1 mt-2 mb-3">
        <Button size="sm" onClick={copyList}>{copied ? 'Copied' : 'Copy list'}</Button>
        <Button size="sm" to="/deck-insights" onClick={() => localStorage.setItem('drawOdds.deckText', listText)}>Deck Insights</Button>
        <Button size="sm" to="/decklist-inspector" onClick={() => localStorage.setItem('decklistInspector.deckText', listText)}>Inspector</Button>
      </div>
      <div className="space-y-3">
        {BUCKET_ORDER.filter(type => buckets[type].length > 0).map(type => (
          <div key={type}>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              {BUCKET_LABEL[type]} ({buckets[type].reduce((sum, e) => sum + e.count, 0)})
            </p>
            <div className="space-y-1">
              {buckets[type].map(entry => <CardBar key={entry.key} entry={entry} />)}
            </div>
          </div>
        ))}
        {unknown.length > 0 && (
          <div className="text-xs text-gray-500">
            Not in card data: {unknown.map(e => `${e.count}× ${e.name}`).join(', ')}
          </div>
        )}
      </div>
      {children}
    </Card>
  )
}
