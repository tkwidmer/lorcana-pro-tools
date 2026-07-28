import { useState, useMemo } from 'react'

function parseDeckList(text) {
  const cardMap = new Map()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^(\d+)x?\s+(.+)$/i)
    if (!m) continue
    const count = parseInt(m[1])
    const name = m[2].trim()
    if (!name || count < 1) continue
    cardMap.set(name, (cardMap.get(name) || 0) + count)
  }
  return cardMap
}

function totalCards(cardMap) {
  let total = 0
  for (const count of cardMap.values()) total += count
  return total
}

function computeDelta(currentMap, newMap) {
  const toAdd = []
  const toRemove = []

  for (const [name, newCount] of newMap) {
    const currentCount = currentMap.get(name) || 0
    if (newCount > currentCount) {
      toAdd.push({ name, count: newCount - currentCount })
    }
  }

  for (const [name, currentCount] of currentMap) {
    const newCount = newMap.get(name) || 0
    if (currentCount > newCount) {
      toRemove.push({ name, count: currentCount - newCount })
    }
  }

  toAdd.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  toRemove.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  return { toAdd, toRemove }
}

function DeltaSection({ title, items, colorClass, bgClass, borderClass, emptyMessage }) {
  const totalSwaps = items.reduce((s, c) => s + c.count, 0)
  return (
    <div className={`border ${borderClass} rounded-lg overflow-hidden`}>
      <div className={`${bgClass} px-4 py-3 flex items-center justify-between`}>
        <h3 className={`text-sm font-bold ${colorClass}`}>{title}</h3>
        {items.length > 0 && (
          <span className={`text-xs font-medium ${colorClass} opacity-75`}>
            {totalSwaps} card{totalSwaps !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="divide-y divide-gray-100">
        {items.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400 italic">{emptyMessage}</p>
        ) : (
          items.map(({ name, count }) => (
            <div key={name} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-gray-800">{name}</span>
              <span className={`text-sm font-bold tabular-nums ${colorClass}`}>
                ×{count}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const PLACEHOLDER = `4x Maui - Hero to All
3x Moana - Of Motunui
2x Rapunzel - Gifted with Healing
1x Mickey Mouse - True Friend`

export function DeckComparisonPage() {
  const [paperDeck, setPaperDeck] = useState('')
  const [newList, setNewList] = useState('')

  const paperMap = useMemo(() => parseDeckList(paperDeck), [paperDeck])
  const newMap = useMemo(() => parseDeckList(newList), [newList])

  const paperTotal = useMemo(() => totalCards(paperMap), [paperMap])
  const newTotal = useMemo(() => totalCards(newMap), [newMap])

  const { toAdd, toRemove } = useMemo(
    () => computeDelta(paperMap, newMap),
    [paperMap, newMap]
  )

  const hasInput = paperDeck.trim() || newList.trim()
  const hasChanges = toAdd.length > 0 || toRemove.length > 0
  const totalSwaps = toAdd.reduce((s, c) => s + c.count, 0) + toRemove.reduce((s, c) => s + c.count, 0)

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Deck List Comparison</h1>
        <p className="text-sm text-gray-500 mt-1">
          Paste your paper deck and your updated list to see exactly which cards to swap.
          Format: <code className="bg-gray-100 px-1 rounded text-xs">4x Card Name</code> or{' '}
          <code className="bg-gray-100 px-1 rounded text-xs">4 Card Name</code>, one per line.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-gray-700">
              Paper Deck
            </label>
            {paperTotal > 0 && (
              <span className={`text-xs tabular-nums font-medium ${paperTotal === 60 ? 'text-green-600' : 'text-amber-600'}`}>
                {paperTotal} cards{paperTotal !== 60 ? ' (not 60)' : ''}
              </span>
            )}
          </div>
          <textarea
            className="w-full h-64 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-800 resize-none focus:outline-none focus:border-gray-500 placeholder-gray-300"
            placeholder={PLACEHOLDER}
            value={paperDeck}
            onChange={e => setPaperDeck(e.target.value)}
            spellCheck={false}
          />
          <p className="text-xs text-gray-400 mt-1">Your current physical deck</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-gray-700">
              New List
            </label>
            {newTotal > 0 && (
              <span className={`text-xs tabular-nums font-medium ${newTotal === 60 ? 'text-green-600' : 'text-amber-600'}`}>
                {newTotal} cards{newTotal !== 60 ? ' (not 60)' : ''}
              </span>
            )}
          </div>
          <textarea
            className="w-full h-64 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-800 resize-none focus:outline-none focus:border-gray-500 placeholder-gray-300"
            placeholder={PLACEHOLDER}
            value={newList}
            onChange={e => setNewList(e.target.value)}
            spellCheck={false}
          />
          <p className="text-xs text-gray-400 mt-1">The updated list you want to play</p>
        </div>
      </div>

      {hasInput && (
        <>
          {!hasChanges ? (
            <div className="border border-green-200 bg-green-50 rounded-lg px-6 py-5 text-center">
              <p className="text-sm font-semibold text-green-700">
                {paperTotal > 0 && newTotal > 0
                  ? 'No changes — your paper deck matches the new list!'
                  : 'Add content to both fields to compare.'}
              </p>
            </div>
          ) : (
            <>
              <div className="border border-gray-200 rounded-lg px-4 py-3 mb-6 flex flex-wrap gap-6">
                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total swaps</span>
                  <p className="text-xl font-bold text-gray-900 tabular-nums">{totalSwaps}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">To add</span>
                  <p className="text-xl font-bold text-green-600 tabular-nums">{toAdd.reduce((s, c) => s + c.count, 0)}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">To remove</span>
                  <p className="text-xl font-bold text-red-600 tabular-nums">{toRemove.reduce((s, c) => s + c.count, 0)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <DeltaSection
                  title="Remove from paper deck"
                  items={toRemove}
                  colorClass="text-red-600"
                  bgClass="bg-red-50"
                  borderClass="border-red-200"
                  emptyMessage="Nothing to remove"
                />
                <DeltaSection
                  title="Add to paper deck"
                  items={toAdd}
                  colorClass="text-green-700"
                  bgClass="bg-green-50"
                  borderClass="border-green-200"
                  emptyMessage="Nothing to add"
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
