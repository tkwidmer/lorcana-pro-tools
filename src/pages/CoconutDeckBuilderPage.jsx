import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useCards } from '../hooks/useCards'
import { COCONUT_CARDS, getCoconutCard } from '../lib/coconutCards'
import { getCardLimit, isCardInkLegal, validateDeck, MIN_DECK_SIZE, MAX_INKS } from '../lib/coconutFormat'
import { VALID_INKS, resolveColors } from '../lib/inkColors'
import { saveDeck, getDeck, getAllDecks, deleteDeck } from '../lib/coconutDecks'

const INK_LABELS = {
  amber: 'Amber',
  amethyst: 'Amethyst',
  emerald: 'Emerald',
  ruby: 'Ruby',
  sapphire: 'Sapphire',
  steel: 'Steel',
}

const TYPE_ORDER = ['Character', 'Action', 'Song', 'Item', 'Location']
const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Super Rare', 'Legendary', 'Enchanted']
// Not all of these appear as a distinct `keywordAbilities` field across every
// LorcanaJSON card — falling back to matching the leading word of each named
// ability covers cards where the keyword is only present inline (e.g. "Shift 2").
const KNOWN_KEYWORDS = [
  'Bodyguard', 'Challenger', 'Evasive', 'Reckless', 'Resist', 'Rush',
  'Shift', 'Singer', 'Support', 'Ward', 'Sing Together', 'Vanish',
]

function InkIcon({ ink, size = 20 }) {
  if (!ink) return null
  return (
    <img
      src={`/ink/${ink}.png`}
      alt={INK_LABELS[ink] ?? ink}
      title={INK_LABELS[ink] ?? ink}
      style={{ width: size, height: size }}
    />
  )
}

function coconutDisplayName(coconutCard) {
  return `${coconutCard.name} – "${coconutCard.version}"`
}

// LorcanaJSON's card image field isn't exercised anywhere else in this repo
// (every other page renders text-only), so this checks a few plausible
// shapes rather than assuming one exact key.
function getCardImageUrl(card) {
  if (!card) return null
  return card.images?.full || card.images?.large || card.images?.thumbnail || card.images?.small || card.imageUrl || null
}

function getCardKeywords(card) {
  if (Array.isArray(card.keywordAbilities) && card.keywordAbilities.length > 0) {
    return card.keywordAbilities
  }
  const found = new Set()
  for (const ability of card.abilities ?? []) {
    const name = ability?.name
    if (!name) continue
    for (const keyword of KNOWN_KEYWORDS) {
      if (name.startsWith(keyword)) found.add(keyword)
    }
  }
  return Array.from(found)
}

function distinctSorted(cards, getter) {
  const set = new Set()
  for (const c of cards) {
    const value = getter(c)
    if (Array.isArray(value)) {
      for (const v of value) if (v) set.add(v)
    } else if (value) {
      set.add(value)
    }
  }
  return Array.from(set).sort()
}

function sortByKnownOrder(values, order) {
  return [...values].sort((a, b) => {
    const ai = order.indexOf(a)
    const bi = order.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

function inRange(value, min, max) {
  if (value == null) return min === '' && max === ''
  if (min !== '' && value < Number(min)) return false
  if (max !== '' && value > Number(max)) return false
  return true
}

const EMPTY_FILTERS = {
  query: '',
  inks: [],
  types: [],
  inkable: 'any',
  costMin: '', costMax: '',
  strengthMin: '', strengthMax: '',
  willpowerMin: '', willpowerMax: '',
  loreMin: '', loreMax: '',
  sets: [],
  rarities: [],
  keywords: [],
  classifications: [],
  franchises: [],
}

function hasActiveFilters(filters) {
  return Object.entries(filters).some(([key, value]) => {
    if (key === 'inkable') return value !== 'any'
    if (Array.isArray(value)) return value.length > 0
    return value !== ''
  })
}

function cardMatchesFilters(card, filters) {
  const cardInks = resolveColors([card.color])
  if (filters.inks.length && !cardInks.some(ink => filters.inks.includes(ink))) return false
  if (filters.types.length && !filters.types.includes(card.type)) return false
  if (filters.inkable === 'yes' && !card.inkwell) return false
  if (filters.inkable === 'no' && card.inkwell) return false
  if (!inRange(card.cost, filters.costMin, filters.costMax)) return false
  if (!inRange(card.strength, filters.strengthMin, filters.strengthMax)) return false
  if (!inRange(card.willpower, filters.willpowerMin, filters.willpowerMax)) return false
  if (!inRange(card.lore, filters.loreMin, filters.loreMax)) return false
  if (filters.sets.length && !filters.sets.includes(card.setCode)) return false
  if (filters.rarities.length && !filters.rarities.includes(card.rarity)) return false
  if (filters.keywords.length) {
    const keywords = getCardKeywords(card)
    if (!filters.keywords.some(k => keywords.includes(k))) return false
  }
  if (filters.classifications.length) {
    const subtypes = card.subtypes ?? []
    if (!filters.classifications.some(c => subtypes.includes(c))) return false
  }
  if (filters.franchises.length && !filters.franchises.includes(card.story)) return false
  const q = filters.query.trim().toLowerCase()
  if (q && !(card.simpleName?.includes(q) || card.fullName?.toLowerCase().includes(q))) return false
  return true
}

// ---------- Deck list (home view) ----------

function DeckListView({ decks, loading, cardsLoading, onNew, onOpen, onDelete }) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Coconut Deck Builder</h1>
          <p className="text-sm text-gray-500 mt-1">
            Build singleton decks for [Format Coconut] — pick a Coconut card, lock in your inks, and build a {MIN_DECK_SIZE}+ card deck around it. Saved locally in your browser only.
          </p>
        </div>
        <button
          onClick={onNew}
          disabled={cardsLoading}
          title={cardsLoading ? 'Loading card data…' : undefined}
          className="bg-black text-white text-sm px-4 py-2 rounded hover:bg-gray-800 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + New deck
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Loading saved decks…</div>
      ) : decks.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-24 border-2 border-dashed border-gray-200 rounded-lg">
          No decks yet. Create one to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map(deck => {
            const coconutCard = getCoconutCard(deck.coconutCardId)
            const totalCount = (deck.cards ?? []).reduce((sum, e) => sum + e.qty, 0)
            return (
              <div key={deck.id} className="border border-gray-200 rounded-lg p-5 hover:border-gray-900 transition-colors">
                <button onClick={() => onOpen(deck.id)} className="text-left w-full">
                  <h3 className="text-base font-bold text-gray-900 mb-1 truncate">{deck.name}</h3>
                  <p className="text-xs text-gray-400 mb-3">
                    {coconutCard ? coconutDisplayName(coconutCard) : 'Unknown Coconut card'}
                  </p>
                  <div className="flex items-center gap-1.5 mb-3">
                    {(deck.inks ?? []).map(ink => <InkIcon key={ink} ink={ink} size={18} />)}
                  </div>
                  <p className="text-xs text-gray-500">{totalCount} / {MIN_DECK_SIZE}+ cards</p>
                </button>
                <button
                  onClick={() => onDelete(deck.id, deck.name)}
                  className="text-xs text-gray-400 hover:text-red-600 underline mt-3"
                >
                  Delete
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------- Step 1: pick a Coconut card ----------

function PickCoconutCardView({ cardsByFullName, onPick, onCancel }) {
  const groups = useMemo(() => {
    const byInk = {}
    for (const c of COCONUT_CARDS) {
      byInk[c.ink] = byInk[c.ink] ?? []
      byInk[c.ink].push(c)
    }
    return byInk
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Choose your Coconut card</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your deck is built around this card's alternate ability — you can run up to 4 copies of it.
          </p>
        </div>
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-700 underline whitespace-nowrap">
          Cancel
        </button>
      </div>

      <div className="space-y-8">
        {VALID_INKS.map(ink => (
          <div key={ink}>
            <div className="flex items-center gap-2 mb-3">
              <InkIcon ink={ink} />
              <h2 className="text-sm font-semibold text-gray-800">{INK_LABELS[ink]}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(groups[ink] ?? []).map(cc => {
                const baseCard = cardsByFullName.get(cc.baseFullName.toLowerCase())
                const imageUrl = getCardImageUrl(baseCard)
                return (
                  <button
                    key={cc.id}
                    onClick={() => onPick(cc.id)}
                    className="text-left border border-gray-200 rounded-lg p-4 hover:border-gray-900 transition-colors flex gap-3"
                  >
                    {imageUrl && (
                      <img src={imageUrl} alt="" className="w-16 aspect-[2.5/3.5] object-cover rounded flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-gray-900">{cc.name}</h3>
                      <p className="text-xs text-gray-500 italic mb-2">"{cc.version}"</p>
                      <p className="text-xs text-gray-600 whitespace-pre-line">{cc.ability}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Step 2: pick inks ----------

function PickInksView({ coconutCard, onConfirm, onCancel }) {
  const [inks, setInks] = useState([coconutCard.ink])

  const toggleInk = (ink) => {
    if (ink === coconutCard.ink) return
    setInks(prev => {
      if (prev.includes(ink)) return prev.filter(i => i !== ink)
      if (prev.length >= MAX_INKS) return prev
      return [...prev, ink]
    })
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Choose your inks</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pick up to {MAX_INKS} ink types. {coconutCard.name}'s ink ({INK_LABELS[coconutCard.ink]}) is locked in.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-8">
        {VALID_INKS.map(ink => {
          const active = inks.includes(ink)
          const locked = ink === coconutCard.ink
          const disabled = !active && inks.length >= MAX_INKS
          return (
            <button
              key={ink}
              onClick={() => toggleInk(ink)}
              disabled={locked || disabled}
              className={`flex items-center gap-2 border rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700 hover:border-gray-500'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${locked ? 'cursor-default' : ''}`}
            >
              <InkIcon ink={ink} size={18} />
              {INK_LABELS[ink]}
              {locked && <span className="text-xs opacity-70">(locked)</span>}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-700 underline">
          ← Back
        </button>
        <button
          onClick={() => onConfirm(inks)}
          className="bg-black text-white text-sm px-4 py-2 rounded hover:bg-gray-800 ml-auto"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

// ---------- Step 3: build the deck ----------

function FacetDropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (options.length === 0) return null

  const toggle = (value) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value])
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`text-xs px-3 py-1.5 rounded border whitespace-nowrap transition-colors ${
          selected.length ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'
        }`}
      >
        {label}{selected.length ? ` (${selected.length})` : ''}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-56 max-h-64 overflow-y-auto bg-white border border-gray-300 rounded shadow-lg p-2">
          {selected.length > 0 && (
            <button onClick={() => onChange([])} className="text-xs text-gray-400 hover:text-gray-700 underline mb-1">
              Clear
            </button>
          )}
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 text-xs py-1 cursor-pointer">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function RangeInputs({ label, lo, hi, onChangeLo, onChangeHi }) {
  const inputCls = 'w-12 border border-gray-300 rounded px-1 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-gray-500'
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-500 w-16">{label}</span>
      <input type="number" className={inputCls} placeholder="min" value={lo} onChange={e => onChangeLo(e.target.value)} />
      <span className="text-xs text-gray-300">–</span>
      <input type="number" className={inputCls} placeholder="max" value={hi} onChange={e => onChangeHi(e.target.value)} />
    </div>
  )
}

const RESULT_CAP = 150

function CardBrowser({ cards, coconutCard, lockedInks, deckEntries, onAdd }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }))

  const legalCards = useMemo(
    () => cards.filter(c => c.fullName && c.allowedInFormats?.Infinity?.allowed && isCardInkLegal(c, lockedInks)),
    [cards, lockedInks]
  )

  const typeOptions = useMemo(
    () => TYPE_ORDER.filter(t => legalCards.some(c => c.type === t)),
    [legalCards]
  )
  const setOptions = useMemo(() => distinctSorted(legalCards, c => c.setCode), [legalCards])
  const rarityOptions = useMemo(
    () => sortByKnownOrder(distinctSorted(legalCards, c => c.rarity), RARITY_ORDER),
    [legalCards]
  )
  const keywordOptions = useMemo(() => distinctSorted(legalCards, getCardKeywords), [legalCards])
  const classificationOptions = useMemo(() => distinctSorted(legalCards, c => c.subtypes), [legalCards])
  const franchiseOptions = useMemo(() => distinctSorted(legalCards, c => c.story), [legalCards])

  const deckQtyByFullName = useMemo(() => {
    const map = new Map()
    for (const e of deckEntries) map.set(e.fullName.toLowerCase(), e.qty)
    return map
  }, [deckEntries])

  const results = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const c of legalCards) {
      const key = c.fullName.toLowerCase()
      if (seen.has(key)) continue
      if (!cardMatchesFilters(c, filters)) continue
      seen.add(key)
      out.push(c)
    }
    out.sort((a, b) => a.cost - b.cost || a.fullName.localeCompare(b.fullName))
    return out
  }, [legalCards, filters])

  const shown = results.slice(0, RESULT_CAP)
  const filtersActive = hasActiveFilters(filters)

  return (
    <div>
      <input
        type="text"
        value={filters.query}
        onChange={e => setFilter('query', e.target.value)}
        placeholder="Search by name…"
        className="w-full border border-gray-300 rounded px-4 py-2 text-sm mb-3 focus:outline-none focus:ring-1 focus:ring-gray-500"
      />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {lockedInks.map(ink => {
          const active = filters.inks.includes(ink)
          return (
            <button
              key={ink}
              onClick={() => setFilter('inks', active ? filters.inks.filter(i => i !== ink) : [...filters.inks, ink])}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors ${
                active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'
              }`}
            >
              <InkIcon ink={ink} size={14} />
              {INK_LABELS[ink]}
            </button>
          )
        })}
        {typeOptions.map(type => {
          const active = filters.types.includes(type)
          return (
            <button
              key={type}
              onClick={() => setFilter('types', active ? filters.types.filter(t => t !== type) : [...filters.types, type])}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'
              }`}
            >
              {type}
            </button>
          )
        })}
        <div className="flex border border-gray-300 rounded overflow-hidden text-xs">
          {[['any', 'Inkable: Any'], ['yes', 'Inkable'], ['no', 'Uninkable']].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter('inkable', value)}
              className={`px-2.5 py-1.5 transition-colors ${filters.inkable === value ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <RangeInputs label="Cost" lo={filters.costMin} hi={filters.costMax} onChangeLo={v => setFilter('costMin', v)} onChangeHi={v => setFilter('costMax', v)} />
        <RangeInputs label="Strength" lo={filters.strengthMin} hi={filters.strengthMax} onChangeLo={v => setFilter('strengthMin', v)} onChangeHi={v => setFilter('strengthMax', v)} />
        <RangeInputs label="Willpower" lo={filters.willpowerMin} hi={filters.willpowerMax} onChangeLo={v => setFilter('willpowerMin', v)} onChangeHi={v => setFilter('willpowerMax', v)} />
        <RangeInputs label="Lore" lo={filters.loreMin} hi={filters.loreMax} onChangeLo={v => setFilter('loreMin', v)} onChangeHi={v => setFilter('loreMax', v)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <FacetDropdown label="Set" options={setOptions} selected={filters.sets} onChange={v => setFilter('sets', v)} />
        <FacetDropdown label="Rarity" options={rarityOptions} selected={filters.rarities} onChange={v => setFilter('rarities', v)} />
        <FacetDropdown label="Keywords" options={keywordOptions} selected={filters.keywords} onChange={v => setFilter('keywords', v)} />
        <FacetDropdown label="Classification" options={classificationOptions} selected={filters.classifications} onChange={v => setFilter('classifications', v)} />
        <FacetDropdown label="Franchise" options={franchiseOptions} selected={filters.franchises} onChange={v => setFilter('franchises', v)} />
        {filtersActive && (
          <button onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs text-gray-400 hover:text-gray-700 underline">
            Reset filters
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400 mb-2">
        {results.length} card{results.length === 1 ? '' : 's'} match{results.length > RESULT_CAP ? ` — showing first ${RESULT_CAP}` : ''}
      </p>

      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[32rem] overflow-y-auto">
        {shown.map(card => {
          const limit = getCardLimit(card, coconutCard)
          const qty = deckQtyByFullName.get(card.fullName.toLowerCase()) ?? 0
          const atLimit = qty >= limit
          const imageUrl = getCardImageUrl(card)
          return (
            <div key={card.fullName} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
              <div className="min-w-0 mr-3 flex items-center gap-2">
                {imageUrl && <img src={imageUrl} alt="" className="w-8 aspect-[2.5/3.5] object-cover rounded flex-shrink-0" />}
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{card.fullName}</div>
                  <div className="text-xs text-gray-400 truncate">
                    {card.color} · {card.type} · Cost {card.cost}{card.rarity ? ` · ${card.rarity}` : ''}{qty > 0 ? ` · ${qty}/${limit} in deck` : ''}
                  </div>
                </div>
              </div>
              <button
                onClick={() => { if (!atLimit) onAdd(card) }}
                disabled={atLimit}
                className="text-xs font-medium border border-gray-300 rounded px-3 py-1.5 hover:bg-black hover:text-white hover:border-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0"
              >
                {atLimit ? 'Max' : 'Add'}
              </button>
            </div>
          )
        })}
        {shown.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-10">No cards match these filters.</div>
        )}
      </div>
    </div>
  )
}

function DeckCardRow({ entry, limit, onChangeQty, onRemove }) {
  const canAdjust = limit > 1
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
      <div className="min-w-0 flex items-center gap-2">
        <span className="text-xs text-gray-400 w-6 text-right flex-shrink-0">{entry.qty}×</span>
        <span className="text-sm text-gray-900 truncate">{entry.fullName}</span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {canAdjust ? (
          <>
            <button
              onClick={() => onChangeQty(entry.fullName, entry.qty - 1)}
              className="w-6 h-6 text-xs border border-gray-300 rounded hover:bg-gray-100"
            >
              −
            </button>
            <button
              onClick={() => onChangeQty(entry.fullName, entry.qty + 1)}
              disabled={entry.qty >= limit}
              className="w-6 h-6 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              +
            </button>
          </>
        ) : (
          <button onClick={() => onRemove(entry.fullName)} className="text-xs text-gray-400 hover:text-red-600">
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

function BuildView({ initialDeck, cards, onBack }) {
  const [deck, setDeck] = useState(initialDeck)
  const [savedAt, setSavedAt] = useState(null)
  const saveTimer = useRef(null)

  const coconutCard = getCoconutCard(deck.coconutCardId)
  const baseCard = useMemo(
    () => cards.find(c => c.fullName?.toLowerCase() === coconutCard?.baseFullName?.toLowerCase()) ?? null,
    [cards, coconutCard]
  )

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveDeck(deck).then(() => setSavedAt(Date.now()))
    }, 400)
    return () => clearTimeout(saveTimer.current)
  }, [deck])

  const setEntries = useCallback((updater) => {
    setDeck(prev => ({ ...prev, cards: updater(prev.cards) }))
  }, [])

  const addCard = useCallback((card) => {
    setEntries(entries => {
      const idx = entries.findIndex(e => e.fullName.toLowerCase() === card.fullName.toLowerCase())
      const limit = getCardLimit(card, coconutCard)
      if (idx === -1) {
        return [...entries, {
          fullName: card.fullName,
          name: card.name,
          version: card.version,
          cost: card.cost,
          color: card.color,
          type: card.type,
          qty: 1,
        }]
      }
      if (entries[idx].qty >= limit) return entries
      return entries.map((e, i) => (i === idx ? { ...e, qty: e.qty + 1 } : e))
    })
  }, [coconutCard, setEntries])

  const changeQty = useCallback((fullName, qty) => {
    setEntries(entries => {
      if (qty <= 0) return entries.filter(e => e.fullName !== fullName)
      const target = entries.find(e => e.fullName === fullName)
      const limit = getCardLimit(target, coconutCard)
      const clamped = Math.min(qty, limit)
      return entries.map(e => (e.fullName === fullName ? { ...e, qty: clamped } : e))
    })
  }, [coconutCard, setEntries])

  const removeCard = useCallback((fullName) => {
    setEntries(entries => entries.filter(e => e.fullName !== fullName))
  }, [setEntries])

  const validity = useMemo(
    () => validateDeck(deck.cards, coconutCard, deck.inks),
    [deck.cards, coconutCard, deck.inks]
  )

  const grouped = useMemo(() => {
    const byType = {}
    for (const e of deck.cards) {
      byType[e.type] = byType[e.type] ?? []
      byType[e.type].push(e)
    }
    for (const t of Object.keys(byType)) {
      byType[t].sort((a, b) => a.cost - b.cost || a.fullName.localeCompare(b.fullName))
    }
    return byType
  }, [deck.cards])

  if (!coconutCard) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 text-sm text-red-500">
        This deck's Coconut card could not be found.
      </div>
    )
  }

  const imageUrl = getCardImageUrl(baseCard)

  return (
    <div className="max-w-[90rem] mx-auto px-6 py-8">
      <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-700 underline mb-4">
        ← All decks
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
        <input
          value={deck.name}
          onChange={e => setDeck(prev => ({ ...prev, name: e.target.value }))}
          className="text-2xl font-bold tracking-tight text-gray-900 border-b border-transparent hover:border-gray-300 focus:border-gray-500 focus:outline-none bg-transparent min-w-0"
        />
        <span className="text-xs text-gray-400 whitespace-nowrap">{savedAt ? 'Saved' : ''}</span>
      </div>

      <div className="flex items-center gap-2 mb-6">
        {deck.inks.map(ink => <InkIcon key={ink} ink={ink} size={18} />)}
        <span className="text-sm text-gray-500 ml-1">Built around {coconutDisplayName(coconutCard)}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div>
          <div className="border border-gray-200 rounded-lg bg-white p-4 mb-6 flex gap-4">
            {imageUrl && <img src={imageUrl} alt="" className="w-20 aspect-[2.5/3.5] object-cover rounded flex-shrink-0" />}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {coconutDisplayName(coconutCard)}
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{coconutCard.ability}</p>
            </div>
          </div>

          <CardBrowser
            cards={cards}
            coconutCard={coconutCard}
            lockedInks={deck.inks}
            deckEntries={deck.cards}
            onAdd={addCard}
          />
        </div>

        <div className="lg:sticky lg:top-6 space-y-4">
          <div className={`text-sm rounded-lg px-4 py-3 border ${
            validity.isValid ? 'bg-green-50 text-green-800 border-green-200' : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}>
            <p className="font-medium mb-1">
              {validity.totalCount} / {MIN_DECK_SIZE}+ cards{validity.isValid ? ' — deck is legal' : ''}
            </p>
            {validity.issues.length > 0 && (
              <ul className="list-disc list-inside space-y-0.5">
                {validity.issues.slice(0, 8).map((issue, i) => <li key={i}>{issue}</li>)}
                {validity.issues.length > 8 && <li>…and {validity.issues.length - 8} more</li>}
              </ul>
            )}
          </div>

          <div className="border border-gray-200 rounded-lg bg-white p-4 max-h-[36rem] overflow-y-auto">
            {deck.cards.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-8">
                Add cards from the browser to build your deck.
              </div>
            ) : (
              <div className="space-y-4">
                {TYPE_ORDER.filter(t => grouped[t]?.length).map(type => (
                  <div key={type}>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      {type} ({grouped[type].reduce((s, e) => s + e.qty, 0)})
                    </h3>
                    <div>
                      {grouped[type].map(entry => (
                        <DeckCardRow
                          key={entry.fullName}
                          entry={entry}
                          limit={getCardLimit(entry, coconutCard)}
                          onChangeQty={changeQty}
                          onRemove={removeCard}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Page ----------

export function CoconutDeckBuilderPage() {
  const { cards, loading: cardsLoading, error: cardsError } = useCards()
  const [view, setView] = useState('list')
  const [decks, setDecks] = useState([])
  const [decksLoading, setDecksLoading] = useState(true)
  const [draftCoconutId, setDraftCoconutId] = useState(null)
  const [activeDeck, setActiveDeck] = useState(null)

  const cardsByFullName = useMemo(() => {
    const map = new Map()
    for (const c of cards) {
      if (c.fullName && !map.has(c.fullName.toLowerCase())) map.set(c.fullName.toLowerCase(), c)
    }
    return map
  }, [cards])

  const refreshDecks = useCallback(async () => {
    const all = await getAllDecks()
    setDecks(all)
    setDecksLoading(false)
  }, [])

  useEffect(() => { refreshDecks() }, [refreshDecks]) // eslint-disable-line react-hooks/set-state-in-effect -- initial fetch on mount

  const handleNew = () => setView('pick-coconut')

  const handlePickCoconut = (id) => {
    setDraftCoconutId(id)
    setView('pick-inks')
  }

  const handleConfirmInks = (inks) => {
    const coconutCard = getCoconutCard(draftCoconutId)
    const baseCard = cardsByFullName.get(coconutCard.baseFullName.toLowerCase())
    const initialEntries = baseCard
      ? [{
          fullName: baseCard.fullName,
          name: baseCard.name,
          version: baseCard.version,
          cost: baseCard.cost,
          color: baseCard.color,
          type: baseCard.type,
          qty: 4,
        }]
      : []
    setActiveDeck({
      id: crypto.randomUUID(),
      name: coconutDisplayName(coconutCard),
      coconutCardId: coconutCard.id,
      inks,
      cards: initialEntries,
      createdAt: Date.now(),
    })
    setView('build')
  }

  const handleOpen = async (id) => {
    const deck = await getDeck(id)
    if (deck) {
      setActiveDeck(deck)
      setView('build')
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete deck "${name}"? This cannot be undone.`)) return
    await deleteDeck(id)
    refreshDecks()
  }

  const handleBack = () => {
    setActiveDeck(null)
    setDraftCoconutId(null)
    setView('list')
    refreshDecks()
  }

  if (cardsError) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="text-sm text-red-500 border border-red-200 rounded px-4 py-2 bg-white">{cardsError}</div>
      </div>
    )
  }

  if (view === 'pick-coconut') {
    return <PickCoconutCardView cardsByFullName={cardsByFullName} onPick={handlePickCoconut} onCancel={handleBack} />
  }

  if (view === 'pick-inks' && draftCoconutId) {
    return (
      <PickInksView
        coconutCard={getCoconutCard(draftCoconutId)}
        onConfirm={handleConfirmInks}
        onCancel={() => setView('pick-coconut')}
      />
    )
  }

  if (view === 'build' && activeDeck) {
    if (cardsLoading) {
      return <div className="max-w-7xl mx-auto px-6 py-8 text-sm text-gray-400">Loading card data…</div>
    }
    return <BuildView key={activeDeck.id} initialDeck={activeDeck} cards={cards} onBack={handleBack} />
  }

  return (
    <DeckListView
      decks={decks}
      loading={decksLoading}
      cardsLoading={cardsLoading}
      onNew={handleNew}
      onOpen={handleOpen}
      onDelete={handleDelete}
    />
  )
}
