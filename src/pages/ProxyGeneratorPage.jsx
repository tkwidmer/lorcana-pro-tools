import { useState, useCallback } from 'react'
import { useCards } from '../hooks/useCards'
import { SearchBar } from '../components/SearchBar'
import { ProxyCard } from '../components/ProxyCard'

const CARDS_PER_SHEET = 9

function chunk(arr, size) {
  const result = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

export function ProxyGeneratorPage() {
  const { cards, loading, error } = useCards()
  const [selected, setSelected] = useState([])

  const addCard = useCallback((card) => {
    setSelected(prev => [...prev, { instanceId: crypto.randomUUID(), card }])
  }, [])

  const removeCard = useCallback((instanceId) => {
    setSelected(prev => prev.filter(e => e.instanceId !== instanceId))
  }, [])

  const clearAll = useCallback(() => setSelected([]), [])

  const sheets = chunk(selected, CARDS_PER_SHEET)
  const sheetCount = sheets.length
  const cardCount = selected.length

  return (
    <>
      {/* ── Screen UI ─────────────────────────────────────────── */}
      <div className="no-print min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto px-6 py-8">

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Proxy Generator
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Search for cards, build your sheet, then print. 9 cards per page, B&amp;W friendly.
            </p>
          </div>

          <div className="flex items-center gap-3 mb-8">
            {loading ? (
              <div className="flex-1 max-w-xl text-sm text-gray-400 border border-gray-200 rounded px-4 py-2 bg-white">
                Loading card data…
              </div>
            ) : error ? (
              <div className="flex-1 max-w-xl text-sm text-red-500 border border-red-200 rounded px-4 py-2 bg-white">
                {error}
              </div>
            ) : (
              <SearchBar cards={cards} onAdd={addCard} />
            )}

            {cardCount > 0 && (
              <>
                <span className="text-sm text-gray-400 whitespace-nowrap">
                  {cardCount} card{cardCount !== 1 ? 's' : ''} · {sheetCount} sheet{sheetCount !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={clearAll}
                  className="text-sm text-gray-400 hover:text-gray-700 underline whitespace-nowrap"
                >
                  Clear all
                </button>
                <button
                  onClick={() => window.print()}
                  className="bg-black text-white text-sm px-4 py-2 rounded hover:bg-gray-800 whitespace-nowrap"
                >
                  Print
                </button>
              </>
            )}
          </div>

          {selected.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-24 border-2 border-dashed border-gray-200 rounded-lg">
              Search for a card above to get started.
            </div>
          ) : (
            <div>
              {sheets.map((sheet, si) => (
                <div key={si}>
                  {si > 0 && (
                    <div className="flex items-center gap-3 my-6">
                      <div className="flex-1 border-t border-dashed border-gray-300" />
                      <span className="text-xs text-gray-400">Sheet {si + 1}</span>
                      <div className="flex-1 border-t border-dashed border-gray-300" />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {sheet.map(({ instanceId, card }) => (
                      <div key={instanceId} style={{ position: 'relative' }}>
                        <ProxyCard
                          card={card}
                          onRemove={() => removeCard(instanceId)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Print sheets ── */}
      <div className="print-only">
        {sheets.map((sheet, si) => (
          <div key={si} className="print-sheet">
            {sheet.map(({ instanceId, card }) => (
              <ProxyCard key={instanceId} card={card} />
            ))}
          </div>
        ))}
      </div>
    </>
  )
}
