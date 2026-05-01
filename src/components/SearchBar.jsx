import { useState, useMemo, useRef, useEffect } from 'react'

export function SearchBar({ cards, onAdd, disabled }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return cards
      .filter(c => c.simpleName.includes(q) || c.fullName.toLowerCase().includes(q))
      .slice(0, 12)
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

  function handleSelect(card) {
    onAdd(card)
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
              onMouseDown={() => handleSelect(card)}
              className="flex items-baseline justify-between px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
            >
              <span className="font-medium">{card.fullName}</span>
              <span className="text-xs text-gray-400 ml-3 shrink-0">
                {card.color} · {card.type} · Set {card.setCode}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
