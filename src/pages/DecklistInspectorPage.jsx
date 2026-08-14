import { useState, useMemo } from 'react'
import { useCards } from '../hooks/useCards'
import { parseDeckList } from '../lib/parseDeckList'
import { buildCardIndex, toSimpleName } from '../lib/cardAnalysis'
import { resolveColors, VALID_INKS, INK_HEX, INK_TEXT_ON } from '../lib/inkColors'

const SAMPLE = `4x Maui - Hero to All
4x Moana - Of Motunui
2x Elsa - Snow Queen
4x Be Prepared
2x Friends on the Other Side
4x Sail The Azurite Sea
3x Cinderella's Castle
4x Prince Phillip - Vanquisher of Foes`

const BUCKET_ORDER = ['Character', 'Action', 'Item', 'Location']
const BUCKET_LABEL = {
  Character: 'Characters',
  Action: 'Actions / Songs',
  Item: 'Items',
  Location: 'Locations',
}
const MAX_SELECTED = 4
const DECK_TEXT_KEY = 'decklistInspector.deckText'
const COST_BUCKET_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9+']

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : raw
  } catch { return fallback }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, value) } catch { /* noop */ }
}

function inkFill(colors) {
  const hexes = colors.map(c => INK_HEX[c]).filter(Boolean)
  if (hexes.length === 0) return { background: '#9ca3af' }
  if (hexes.length === 1) return { background: hexes[0] }
  return { background: `linear-gradient(90deg, ${hexes[0]} 0%, ${hexes[0]} 48%, ${hexes[1]} 52%, ${hexes[1]} 100%)` }
}

function textColorFor(colors) {
  const first = colors[0]
  return INK_TEXT_ON[first] || '#ffffff'
}

function CardBar({ entry, selected, onToggle }) {
  const { card, name, count } = entry
  const colors = resolveColors(card.colors?.length ? card.colors : [card.color])
  const textColor = textColorFor(colors)
  const isCharacterOrLocation = card.type === 'Character' || card.type === 'Location'

  let stats = null
  if (card.type === 'Character') {
    stats = `${card.strength ?? '–'} / ${card.willpower ?? '–'}${card.lore ? ` · ${'◆'.repeat(card.lore)}` : ''}`
  } else if (card.type === 'Location') {
    stats = `W:${card.willpower ?? '–'}${card.lore ? ` · ${'◆'.repeat(card.lore)}` : ''}`
  }

  return (
    <button
      type="button"
      onClick={() => onToggle(entry)}
      style={{ ...inkFill(colors), color: textColor }}
      className={`w-full text-left rounded-md px-2.5 py-1.5 flex items-center gap-2 transition-shadow ${
        selected ? 'ring-2 ring-offset-1 ring-gray-900' : 'hover:opacity-90'
      }`}
    >
      <span
        className="flex-shrink-0 w-5 h-5 rounded-full bg-black/25 flex items-center justify-center text-[11px] font-bold"
        style={{ color: textColor }}
      >
        {card.cost}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-semibold truncate">{name}</span>
        {isCharacterOrLocation && stats && (
          <span className="block text-[10px] opacity-90 truncate">{stats}</span>
        )}
      </span>
      <span className="flex-shrink-0 text-xs font-bold tabular-nums">×{count}</span>
    </button>
  )
}

function PieChart({ data }) {
  // data: [{ label, value, color }]
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <p className="text-xs text-gray-400">No data</p>
  const r = 42
  const cx = 50
  const cy = 50
  const toXY = a => {
    const rad = (a * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
  }
  let cursor = -90
  const slices = []
  for (const d of data) {
    const frac = d.value / total
    const sweep = frac * 360
    const start = cursor
    const end = cursor + sweep
    cursor = end
    const large = sweep > 180 ? 1 : 0
    const [x1, y1] = toXY(start)
    const [x2, y2] = toXY(end)
    const path = frac >= 0.9999
      ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
      : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
    slices.push({ ...d, path, frac })
  }
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-24 h-24 flex-shrink-0">
        {slices.map(s => (
          <path key={s.label} d={s.path} fill={s.color} stroke="var(--color-white)" strokeWidth="1" />
        ))}
      </svg>
      <div className="space-y-1">
        {data.map(d => (
          <div key={d.label} className="flex items-center gap-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
            <span className="text-gray-600">{d.label}</span>
            <span className="font-semibold text-gray-900 tabular-nums">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BarChart({ data }) {
  // data: [{ label, value, color }]
  const max = Math.max(1, ...data.map(d => d.value))
  return (
    <div className="space-y-1.5">
      {data.map(d => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="w-24 flex-shrink-0 text-xs text-gray-600 truncate">{d.label}</span>
          <div className="flex-1 bg-gray-100 rounded h-4 overflow-hidden">
            <div
              className="h-full rounded"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color }}
            />
          </div>
          <span className="w-6 flex-shrink-0 text-xs font-semibold text-gray-900 tabular-nums text-right">
            {d.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function CostCurveChart({ buckets, inks }) {
  // buckets: [{ label, total, segments: [{ ink, value }] }]
  const max = Math.max(1, ...buckets.map(b => b.total))
  const CHART_HEIGHT = 140
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: CHART_HEIGHT }}>
        {buckets.map(b => (
          <div key={b.label} className="flex-1 flex flex-col items-center justify-end h-full">
            <div className="w-full flex flex-col-reverse justify-start" style={{ height: '100%' }}>
              {b.total === 0 ? null : (
                <div style={{ height: `${(b.total / max) * 100}%` }} className="w-full flex flex-col-reverse">
                  {b.segments.map(seg => seg.value > 0 && (
                    <div
                      key={seg.ink}
                      style={{ height: `${(seg.value / b.total) * 100}%`, background: INK_HEX[seg.ink] || '#9ca3af' }}
                      className="w-full"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1">
        {buckets.map(b => (
          <span key={b.label} className="flex-1 text-center text-[10px] text-gray-500">{b.label}</span>
        ))}
      </div>
      {inks.length > 1 && (
        <div className="flex flex-wrap gap-3 mt-2">
          {inks.map(ink => (
            <div key={ink} className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: INK_HEX[ink] }} />
              <span className="text-gray-600 capitalize">{ink}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FullArtCard({ entry, onRemove }) {
  const { card, name, count } = entry
  const img = card.images?.full || card.images?.thumbnail
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onRemove(entry)}
        className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center hover:bg-gray-700"
        title="Remove from selection"
      >
        ×
      </button>
      {img ? (
        <img src={img} alt={name} className="w-full h-auto rounded-lg shadow-md" />
      ) : (
        <div className="w-full aspect-[2.5/3.5] rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-400">
          No image
        </div>
      )}
      <p className="mt-1 text-center text-xs text-gray-500">×{count}</p>
    </div>
  )
}

export function DecklistInspectorPage() {
  const { cards, loading, error } = useCards()
  const [deckText, setDeckText] = useState(() => lsGet(DECK_TEXT_KEY, ''))
  const [editing, setEditing] = useState(() => !lsGet(DECK_TEXT_KEY, ''))
  const [selectedKeys, setSelectedKeys] = useState([])

  function updateDeckText(value) {
    setDeckText(value)
    lsSet(DECK_TEXT_KEY, value)
  }

  function clearDeckText() {
    updateDeckText('')
    setSelectedKeys([])
    setEditing(true)
  }

  const cardIndex = useMemo(() => buildCardIndex(cards), [cards])

  const parsed = useMemo(() => parseDeckList(deckText), [deckText])

  const entries = useMemo(() => {
    return parsed.map(({ name, count }) => {
      const card = cardIndex.get(toSimpleName(name))
      return { key: name, name, count, card }
    })
  }, [parsed, cardIndex])

  const matchedEntries = entries.filter(e => e.card)
  const unmatchedEntries = entries.filter(e => !e.card)

  const buckets = useMemo(() => {
    const map = { Character: [], Action: [], Item: [], Location: [] }
    for (const entry of matchedEntries) {
      const type = entry.card.type
      if (map[type]) map[type].push(entry)
    }
    for (const type of Object.keys(map)) {
      map[type].sort((a, b) => (a.card.cost ?? 0) - (b.card.cost ?? 0) || a.name.localeCompare(b.name))
    }
    return map
  }, [matchedEntries])

  const totalCards = matchedEntries.reduce((s, e) => s + e.count, 0)

  const inkableStats = useMemo(() => {
    let inkable = 0
    let uninkable = 0
    for (const e of matchedEntries) {
      if (e.card.inkwell) inkable += e.count
      else uninkable += e.count
    }
    return [
      { label: 'Inkable', value: inkable, color: '#329044' },
      { label: 'Uninkable', value: uninkable, color: '#97a3ae' },
    ]
  }, [matchedEntries])

  const typeStats = useMemo(() => {
    return BUCKET_ORDER.map(type => ({
      label: BUCKET_LABEL[type],
      value: buckets[type].reduce((s, e) => s + e.count, 0),
      color: INK_HEX.sapphire,
    }))
  }, [buckets])

  const costCurve = useMemo(() => {
    const inksUsed = new Set()
    const buckets = COST_BUCKET_LABELS.map(label => ({ label, total: 0, byInk: {} }))
    for (const e of matchedEntries) {
      const cost = e.card.cost ?? 0
      const idx = Math.min(Math.max(cost, 1), 9) - 1
      const colors = resolveColors(e.card.colors?.length ? e.card.colors : [e.card.color])
      const ink = colors[0] || 'steel'
      inksUsed.add(ink)
      buckets[idx].total += e.count
      buckets[idx].byInk[ink] = (buckets[idx].byInk[ink] || 0) + e.count
    }
    const inks = VALID_INKS.filter(i => inksUsed.has(i))
    const withSegments = buckets.map(b => ({
      label: b.label,
      total: b.total,
      segments: inks.map(ink => ({ ink, value: b.byInk[ink] || 0 })),
    }))
    return { buckets: withSegments, inks }
  }, [matchedEntries])

  const selected = selectedKeys.map(k => matchedEntries.find(e => e.key === k)).filter(Boolean)

  function toggleSelect(entry) {
    setSelectedKeys(prev => {
      if (prev.includes(entry.key)) return prev.filter(k => k !== entry.key)
      if (prev.length >= MAX_SELECTED) return prev
      return [...prev, entry.key]
    })
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Decklist Inspector</h1>
        <p className="text-sm text-gray-500 mt-1">
          Paste a decklist, browse it by card type and cost, then click up to {MAX_SELECTED} cards to
          pin their full art for video / stream overlays.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading card data…</p>}
      {error && <p className="text-sm text-red-600">Failed to load card data: {error}</p>}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: decklist, ~25% */}
        <div className="lg:w-1/4 flex-shrink-0 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Decklist</label>
              {totalCards > 0 && (
                <span className={`text-xs tabular-nums font-medium ${totalCards === 60 ? 'text-green-600' : 'text-amber-600'}`}>
                  {totalCards} cards
                </span>
              )}
            </div>
            {editing ? (
              <>
                <textarea
                  className="w-full h-40 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 resize-none focus:outline-none focus:border-gray-500 placeholder-gray-300"
                  placeholder={SAMPLE}
                  value={deckText}
                  onChange={e => updateDeckText(e.target.value)}
                  spellCheck={false}
                />
                {deckText.trim() && (
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="text-xs font-medium text-gray-500 hover:text-gray-900 mt-1"
                  >
                    Done editing
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-xs font-medium text-gray-500 hover:text-gray-900 underline underline-offset-2"
                >
                  Edit list
                </button>
                <button
                  type="button"
                  onClick={clearDeckText}
                  className="text-xs font-medium text-gray-500 hover:text-gray-900 underline underline-offset-2"
                >
                  Clear
                </button>
              </div>
            )}
            {unmatchedEntries.length > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                {unmatchedEntries.length} line{unmatchedEntries.length !== 1 ? 's' : ''} not matched to a card:{' '}
                {unmatchedEntries.map(e => e.name).join(', ')}
              </p>
            )}
          </div>

          {matchedEntries.length > 0 && (
            <div className="space-y-4">
              {BUCKET_ORDER.map(type => (
                buckets[type].length > 0 && (
                  <div key={type}>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                      {BUCKET_LABEL[type]} ({buckets[type].reduce((s, e) => s + e.count, 0)})
                    </h3>
                    <div className="space-y-1">
                      {buckets[type].map(entry => (
                        <CardBar
                          key={entry.key}
                          entry={entry}
                          selected={selectedKeys.includes(entry.key)}
                          onToggle={toggleSelect}
                        />
                      ))}
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </div>

        {/* Right: stats + full art, ~75% */}
        <div className="lg:w-3/4 space-y-6">
          {matchedEntries.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 border border-gray-200 rounded-lg p-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
                  Inkable / Uninkable
                </h3>
                <PieChart data={inkableStats} />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
                  Card Type
                </h3>
                <BarChart data={typeStats} />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
                  Cost Curve
                </h3>
                <CostCurveChart buckets={costCurve.buckets} inks={costCurve.inks} />
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Selected Cards ({selected.length}/{MAX_SELECTED})
              </h3>
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedKeys([])}
                  className="text-xs font-medium text-gray-500 hover:text-gray-900"
                >
                  Clear
                </button>
              )}
            </div>
            {selected.length === 0 ? (
              <div className="border border-dashed border-gray-200 rounded-lg py-12 text-center text-sm text-gray-400">
                Click cards in the decklist to pin their full art here
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {selected.map(entry => (
                  <FullArtCard key={entry.key} entry={entry} onRemove={toggleSelect} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
