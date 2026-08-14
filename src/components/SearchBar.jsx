import { useState, useMemo, useRef, useEffect } from 'react'

const QUANTITIES = [1, 2, 3, 4]

export function SearchBar({ cards, onAdd, disabled }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const seen = new Set()
    const deduped = []
    for (const c of cards) {
      if (seen.has(c.fullName)) continue
      if (c.simpleName.includes(q) || c.fullName.toLowerCase().includes(q)) {
        seen.add(c.fullName)
        deduped.push(c)
      }
    }
    return deduped
  }, [query, cards])

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleAdd(card, qty) {
    for (let i = 0; i < qty; i++) onAdd(card)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => query.trim() && setOpen(true)}
        placeholder="Search for a card by name…"
        disabled={disabled}
        className="w-full border border-gray-300 rounded px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:bg-gray-100 disabled:text-gray-400"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 w-full bg-white border border-gray-300 rounded mt-1 shadow-lg max-h-72 overflow-y-auto">
          {results.map(card => (
            <li
              key={`${card.id}-${card.setCode}`}
              className="flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50"
            >
              <div className="min-w-0 mr-3">
                <div className="text-sm font-medium truncate">{card.fullName}</div>
                <div className="text-xs text-gray-400">{card.color} · {card.type} · Set {card.setCode}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                {QUANTITIES.map(qty => (
                  <button
                    key={qty}
                    onMouseDown={() => handleAdd(card, qty)}
                    className="w-7 h-7 text-xs font-medium border border-gray-300 rounded hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors"
                  >
                    ×{qty}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
