import { useState } from 'react'
import { BUCKET_ORDER, BUCKET_LABEL, buildBuckets } from '../lib/decklistShared'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { CardBar } from './DecklistCardBar'

// One list: cards grouped by type with cost emblems, plus a Copy list button
// that writes the `4 Card Name` text duels.ink imports. `entries` are
// { key, name, count, card }; `card` is null when LorcanaJSON has no match
// (a card it hasn't published yet, or a misspelled name), so it's listed
// on its own under the buckets.
export function DeckListCard({ title, subtitle, entries, children }) {
  const [copied, setCopied] = useState(false)
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
          <h3 className="font-display uppercase tracking-wide text-gray-900">{title}</h3>
          {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
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
