import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useCards } from '../hooks/useCards'
import { COCONUT_CARDS, getCoconutCard } from '../lib/coconutCards'
import { getCardLimit, isCardInkLegal, validateDeck, MIN_DECK_SIZE, MAX_INKS } from '../lib/coconutFormat'
import { VALID_INKS, resolveColors } from '../lib/inkColors'
import { saveDeck, getDeck, getAllDecks, deleteDeck } from '../lib/coconutDecks'
import { generateCoconutDeckShareImage } from '../lib/coconutShareImage'
import { ShareCardModal } from '../components/ShareCardModal'
import { InkIcon as BaseInkIcon } from '../components/InkIcons'
import { generateCoconutDecklistText, parseCoconutDecklist } from '../lib/coconutDecklistText'

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
  return <BaseInkIcon color={ink} size={size} label={INK_LABELS[ink] ?? ink} />
}

function coconutDisplayName(coconutCard) {
  return `${coconutCard.name} – "${coconutCard.version}"`
}

// Real beta [Format Coconut] card art, bundled locally (public/coconut-cards/)
// since these are alternate-ability variants with their own printed card face —
// not the same image LorcanaJSON serves for the base card.
function getCoconutCardImageUrl(coconutCard) {
  if (!coconutCard) return null
  return `/coconut-cards/${coconutCard.id}.jpg`
}

// LorcanaJSON's card image field isn't exercised anywhere else in this repo
// (every other page renders text-only), so this checks a few plausible
// shapes rather than assuming one exact key.
function getCardImageUrl(card) {
  if (!card) return null
  return card.images?.full || card.images?.large || card.images?.thumbnail || card.images?.small || card.imageUrl || null
}

// LorcanaJSON represents Song cards as `type: "Action"` with a "Song" entry
// in `subtypes` rather than a distinct type — songs are treated as their own
// card type everywhere in this browser, so this derives the type players
// actually think in terms of.
function getEffectiveType(card) {
  if (card.type === 'Action' && card.subtypes?.includes('Song')) return 'Song'
  return card.type
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

function distinctSorted(cards, getter, compareFn) {
  const set = new Set()
  for (const c of cards) {
    const value = getter(c)
    if (Array.isArray(value)) {
      for (const v of value) if (v) set.add(v)
    } else if (value) {
      set.add(value)
    }
  }
  const arr = Array.from(set)
  return compareFn ? arr.sort(compareFn) : arr.sort()
}

// Set codes are mostly numeric strings ("1".."9") but promos/quests use
// letter-prefixed codes (e.g. "Q1") — numeric sets sort first, in numeric
// order, then any non-numeric codes fall back to a plain string compare.
function compareSetCodes(a, b) {
  const an = parseInt(a, 10)
  const bn = parseInt(b, 10)
  const aIsNum = !Number.isNaN(an)
  const bIsNum = !Number.isNaN(bn)
  if (aIsNum && bIsNum) return an - bn
  if (aIsNum !== bIsNum) return aIsNum ? -1 : 1
  return a.localeCompare(b)
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

// Builds `start, start+1, ..., cap-1, cap+` — the last bucket is a catch-all
// for that value and anything higher (real cost/strength/willpower top out
// around 12, so a "10+" bucket keeps the row from growing unbounded).
function makeStatBuckets(start, cap) {
  const buckets = []
  for (let n = start; n < cap; n++) buckets.push({ value: n, label: String(n), isMax: false })
  buckets.push({ value: cap, label: `${cap}+`, isMax: true })
  return buckets
}

const COST_BUCKETS = makeStatBuckets(1, 10)
const STRENGTH_BUCKETS = makeStatBuckets(0, 10)
const WILLPOWER_BUCKETS = makeStatBuckets(1, 10)
// Lore tops out at 5 across all printed cards, so every bucket is exact.
const LORE_BUCKETS = [0, 1, 2, 3, 4, 5].map(n => ({ value: n, label: String(n), isMax: n === 5 }))

function matchesStatBuckets(value, selected, bucketDefs) {
  if (!selected.length) return true
  if (value == null) return false
  return selected.some(v => {
    const def = bucketDefs.find(b => b.value === v)
    return def ? (def.isMax ? value >= def.value : value === def.value) : false
  })
}

const SORT_OPTIONS = [
  { value: 'set-number', label: 'Set # / Card #' },
  { value: 'cost-asc', label: 'Cost: Low to High' },
  { value: 'cost-desc', label: 'Cost: High to Low' },
  { value: 'ink', label: 'Ink Color' },
  { value: 'name-asc', label: 'Name: A to Z' },
  { value: 'name-desc', label: 'Name: Z to A' },
]

// Set codes are mostly numeric strings ("1".."9") but promos/quests use
// letter-prefixed codes (e.g. "Q1") — numeric sets sort first, in order,
// then any non-numeric codes fall back to a plain string compare.
function compareBySetNumber(a, b) {
  const an = parseInt(a.setCode, 10)
  const bn = parseInt(b.setCode, 10)
  const aIsNum = !Number.isNaN(an)
  const bIsNum = !Number.isNaN(bn)
  if (aIsNum && bIsNum && an !== bn) return an - bn
  if (aIsNum !== bIsNum) return aIsNum ? -1 : 1
  if (aIsNum && bIsNum) return (a.number ?? 0) - (b.number ?? 0)
  return String(a.setCode).localeCompare(String(b.setCode)) || (a.number ?? 0) - (b.number ?? 0)
}

// Same idea as compareBySetNumber but newest set first — used as the
// tie-break for Cost and Ink Color sorts, where "same cost" or "same ink"
// cards should surface the most recently printed version first.
function compareBySetNumberDesc(a, b) {
  const an = parseInt(a.setCode, 10)
  const bn = parseInt(b.setCode, 10)
  const aIsNum = !Number.isNaN(an)
  const bIsNum = !Number.isNaN(bn)
  if (aIsNum && bIsNum && an !== bn) return bn - an
  if (aIsNum !== bIsNum) return aIsNum ? -1 : 1
  if (aIsNum && bIsNum) return (a.number ?? 0) - (b.number ?? 0)
  return String(b.setCode).localeCompare(String(a.setCode)) || (a.number ?? 0) - (b.number ?? 0)
}

function compareByInk(a, b) {
  const ai = VALID_INKS.indexOf(resolveColors([a.color])[0] ?? '')
  const bi = VALID_INKS.indexOf(resolveColors([b.color])[0] ?? '')
  const aRank = ai === -1 ? VALID_INKS.length : ai
  const bRank = bi === -1 ? VALID_INKS.length : bi
  if (aRank !== bRank) return aRank - bRank
  return (a.cost - b.cost) || compareBySetNumberDesc(a, b)
}

function compareCards(a, b, sortBy) {
  switch (sortBy) {
    case 'cost-asc': return (a.cost - b.cost) || compareBySetNumberDesc(a, b)
    case 'cost-desc': return (b.cost - a.cost) || compareBySetNumberDesc(a, b)
    case 'name-asc': return a.fullName.localeCompare(b.fullName)
    case 'name-desc': return b.fullName.localeCompare(a.fullName)
    case 'ink': return compareByInk(a, b)
    case 'set-number':
    default: return compareBySetNumber(a, b)
  }
}

const EMPTY_FILTERS = {
  query: '',
  inks: [],
  types: [],
  inkable: 'any',
  costBuckets: [],
  strengthBuckets: [],
  willpowerBuckets: [],
  loreBuckets: [],
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
  if (filters.types.length && !filters.types.includes(getEffectiveType(card))) return false
  if (filters.inkable === 'yes' && !card.inkwell) return false
  if (filters.inkable === 'no' && card.inkwell) return false
  if (!matchesStatBuckets(card.cost, filters.costBuckets, COST_BUCKETS)) return false
  if (!matchesStatBuckets(card.strength, filters.strengthBuckets, STRENGTH_BUCKETS)) return false
  if (!matchesStatBuckets(card.willpower, filters.willpowerBuckets, WILLPOWER_BUCKETS)) return false
  if (!matchesStatBuckets(card.lore, filters.loreBuckets, LORE_BUCKETS)) return false
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

function PickCoconutCardView({ onPick, onCancel }) {
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
                const imageUrl = getCoconutCardImageUrl(cc)
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

function CheckboxGroup({ label, options, selected, onChange }) {
  if (options.length === 0) return null

  const toggle = (value) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value])
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        {selected.length > 0 && (
          <button onClick={() => onChange([])} className="text-xs text-gray-400 hover:text-gray-700 underline">
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 max-h-40 overflow-y-auto pr-1">
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
            {opt}
          </label>
        ))}
      </div>
    </div>
  )
}

function CardFilterModal({
  filters, setFilter, setOptions, rarityOptions, keywordOptions, classificationOptions, franchiseOptions, onReset, onClose,
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-gray-200 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Filters</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>

        <div className="overflow-y-auto p-4 space-y-5">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Inkable</p>
            <div className="flex border border-gray-300 rounded overflow-hidden text-xs w-fit">
              {[['any', 'Any'], ['yes', 'Inkable'], ['no', 'Uninkable']].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter('inkable', value)}
                  className={`px-3 py-1.5 transition-colors ${filters.inkable === value ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <StatFilterGroup label="Cost" buckets={COST_BUCKETS} selected={filters.costBuckets} onChange={v => setFilter('costBuckets', v)} />
          <StatFilterGroup label="Strength" buckets={STRENGTH_BUCKETS} selected={filters.strengthBuckets} onChange={v => setFilter('strengthBuckets', v)} />
          <StatFilterGroup label="Willpower" buckets={WILLPOWER_BUCKETS} selected={filters.willpowerBuckets} onChange={v => setFilter('willpowerBuckets', v)} />
          <StatFilterGroup label="Lore" buckets={LORE_BUCKETS} selected={filters.loreBuckets} onChange={v => setFilter('loreBuckets', v)} />

          <CheckboxGroup label="Set" options={setOptions} selected={filters.sets} onChange={v => setFilter('sets', v)} />
          <CheckboxGroup label="Rarity" options={rarityOptions} selected={filters.rarities} onChange={v => setFilter('rarities', v)} />
          <CheckboxGroup label="Keywords" options={keywordOptions} selected={filters.keywords} onChange={v => setFilter('keywords', v)} />
          <CheckboxGroup label="Classification" options={classificationOptions} selected={filters.classifications} onChange={v => setFilter('classifications', v)} />
          <CheckboxGroup label="Franchise" options={franchiseOptions} selected={filters.franchises} onChange={v => setFilter('franchises', v)} />
        </div>

        <div className="px-4 py-3 border-t border-gray-200 shrink-0 flex justify-between">
          <button onClick={onReset} className="px-3 py-1.5 text-xs font-medium rounded border border-red-300 text-red-600 hover:bg-red-50 transition-colors">
            Reset
          </button>
          <button onClick={onClose} className="px-4 py-1.5 text-xs font-medium rounded bg-black text-white hover:bg-gray-800 transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function StatFilterGroup({ label, buckets, selected, onChange }) {
  const toggle = (value) => onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value])
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        {selected.length > 0 && (
          <button onClick={() => onChange([])} className="text-xs text-gray-400 hover:text-gray-700 underline">
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {buckets.map(b => (
          <button
            key={b.value}
            onClick={() => toggle(b.value)}
            className={`min-w-[2.25rem] px-1.5 py-1 text-xs border rounded transition-colors ${
              selected.includes(b.value) ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const RESULT_CAP = 1000

function QtyStepper({ qty, limit, onDecrement, onIncrement }) {
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <button
        onClick={onDecrement}
        disabled={qty <= 0}
        className="w-6 h-6 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        −
      </button>
      <span className="text-xs text-gray-500 w-10 text-center">{qty}/{limit}</span>
      <button
        onClick={onIncrement}
        disabled={qty >= limit}
        className="w-6 h-6 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        +
      </button>
    </div>
  )
}

function GridIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  )
}

function countModalFilters(filters) {
  let n = 0
  if (filters.inkable !== 'any') n++
  for (const k of ['costBuckets', 'strengthBuckets', 'willpowerBuckets', 'loreBuckets', 'sets', 'rarities', 'keywords', 'classifications', 'franchises']) {
    if (filters[k].length) n++
  }
  return n
}

function CardBrowser({ cards, coconutCard, lockedInks, deckEntries, onAdd, onChangeQty }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [sortBy, setSortBy] = useState('set-number')
  const [layout, setLayout] = useState('list')
  const [filtersModalOpen, setFiltersModalOpen] = useState(false)
  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }))

  // Format Coconut has no ties to the official Core/Infinity banlist — a card
  // banned there (e.g. Hiram Flaversham - Toymaker) is still fair game here.
  // What actually needs excluding is LorcanaJSON's ~66 colorless "Illumineer's
  // Quest" solo-adventure promos: they aren't real deckbuilding cards, and
  // isCardInkLegal's "no color = always legal" branch would otherwise let them
  // into every deck regardless of locked inks. A real printed card always has
  // a resolvable color, so requiring one excludes exactly those promos.
  const legalCards = useMemo(
    () => cards.filter(c => c.fullName && resolveColors([c.color]).length > 0 && isCardInkLegal(c, lockedInks)),
    [cards, lockedInks]
  )

  const typeOptions = useMemo(
    () => TYPE_ORDER.filter(t => legalCards.some(c => getEffectiveType(c) === t)),
    [legalCards]
  )
  const setOptions = useMemo(() => distinctSorted(legalCards, c => c.setCode, compareSetCodes), [legalCards])
  const rarityOptions = useMemo(
    () => sortByKnownOrder(distinctSorted(legalCards, c => c.rarity), RARITY_ORDER),
    [legalCards]
  )
  const keywordOptions = useMemo(() => distinctSorted(legalCards, getCardKeywords), [legalCards])
  const classificationOptions = useMemo(
    () => distinctSorted(legalCards, c => (c.subtypes ?? []).filter(s => s !== 'Song')),
    [legalCards]
  )
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
    out.sort((a, b) => compareCards(a, b, sortBy))
    return out
  }, [legalCards, filters, sortBy])

  const shown = results.slice(0, RESULT_CAP)
  const filtersActive = hasActiveFilters(filters)
  const modalFilterCount = countModalFilters(filters)

  const resetAll = () => setFilters(EMPTY_FILTERS)

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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Sort by</label>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-gray-500"
          >
            {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFiltersModalOpen(true)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
              modalFilterCount > 0 ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'
            }`}
          >
            Filters{modalFilterCount > 0 ? ` (${modalFilterCount})` : ''}
          </button>
          {filtersActive && (
            <button onClick={resetAll} className="text-xs text-gray-400 hover:text-gray-700 underline">
              Reset all
            </button>
          )}
          <div className="flex border border-gray-300 rounded overflow-hidden">
            <button
              onClick={() => setLayout('list')}
              title="List view"
              className={`p-1.5 transition-colors ${layout === 'list' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              <ListIcon />
            </button>
            <button
              onClick={() => setLayout('grid')}
              title="Grid view"
              className={`p-1.5 transition-colors ${layout === 'grid' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              <GridIcon />
            </button>
          </div>
        </div>
      </div>

      {filtersModalOpen && (
        <CardFilterModal
          filters={filters}
          setFilter={setFilter}
          setOptions={setOptions}
          rarityOptions={rarityOptions}
          keywordOptions={keywordOptions}
          classificationOptions={classificationOptions}
          franchiseOptions={franchiseOptions}
          onReset={resetAll}
          onClose={() => setFiltersModalOpen(false)}
        />
      )}

      <p className="text-xs text-gray-400 mb-2">
        {results.length} card{results.length === 1 ? '' : 's'} match{results.length > RESULT_CAP ? ` — showing first ${RESULT_CAP}` : ''}
      </p>

      {layout === 'list' ? (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[32rem] overflow-y-auto">
          {shown.map(card => {
            const limit = getCardLimit(card, coconutCard)
            const qty = deckQtyByFullName.get(card.fullName.toLowerCase()) ?? 0
            const imageUrl = getCardImageUrl(card)
            return (
              <div key={card.fullName} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                <div className="min-w-0 mr-3 flex items-center gap-2">
                  {imageUrl && <img src={imageUrl} alt="" className="w-8 aspect-[2.5/3.5] object-cover rounded flex-shrink-0" />}
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{card.fullName}</div>
                    <div className="text-xs text-gray-400 truncate">
                      {card.color} · {getEffectiveType(card)} · Cost {card.cost}{card.rarity ? ` · ${card.rarity}` : ''}
                    </div>
                  </div>
                </div>
                <QtyStepper
                  qty={qty}
                  limit={limit}
                  onDecrement={() => onChangeQty(card.fullName, qty - 1)}
                  onIncrement={() => { if (qty < limit) onAdd(card) }}
                />
              </div>
            )
          })}
          {shown.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-10">No cards match these filters.</div>
          )}
        </div>
      ) : (
        <div className="max-h-[32rem] overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {shown.map(card => {
              const limit = getCardLimit(card, coconutCard)
              const qty = deckQtyByFullName.get(card.fullName.toLowerCase()) ?? 0
              const imageUrl = getCardImageUrl(card)
              return (
                <div key={card.fullName} className="border border-gray-200 rounded-lg overflow-hidden hover:border-gray-400 transition-colors flex flex-col">
                  <div className="aspect-[2.5/3.5] bg-gray-100">
                    {imageUrl && <img src={imageUrl} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-2 flex-1 flex flex-col">
                    <div className="text-xs font-medium text-gray-900 truncate" title={card.fullName}>{card.fullName}</div>
                    <div className="text-xs text-gray-400 truncate mb-2">
                      {getEffectiveType(card)} · Cost {card.cost}
                    </div>
                    <div className="mt-auto flex justify-center">
                      <QtyStepper
                        qty={qty}
                        limit={limit}
                        onDecrement={() => onChangeQty(card.fullName, qty - 1)}
                        onIncrement={() => { if (qty < limit) onAdd(card) }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {shown.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-10">No cards match these filters.</div>
          )}
        </div>
      )}
    </div>
  )
}

// Preview image + last cursor position; fixed-positioned so it floats above
// everything and never gets clipped by the sidebar's own scroll container.
function HoverCardPreview({ preview }) {
  if (!preview) return null
  const previewWidth = 192
  const previewHeight = Math.round(previewWidth * 3.5 / 2.5)
  const left = preview.x > window.innerWidth / 2 ? preview.x - previewWidth - 16 : preview.x + 16
  const top = Math.min(Math.max(preview.y - previewHeight / 2, 8), window.innerHeight - previewHeight - 8)
  return (
    <div className="fixed z-50 pointer-events-none" style={{ left, top }}>
      <img
        src={preview.imageUrl}
        alt=""
        className="rounded-lg shadow-xl border border-gray-200 bg-white"
        style={{ width: previewWidth, aspectRatio: '2.5 / 3.5', objectFit: 'cover' }}
      />
    </div>
  )
}

function DeckCardRow({ entry, limit, imageUrl, onChangeQty, onRemove, onHoverMove, onHoverEnd }) {
  const canAdjust = limit > 1
  return (
    <div
      className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0"
      onMouseMove={imageUrl ? e => onHoverMove(imageUrl, e) : undefined}
      onMouseLeave={onHoverEnd}
    >
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

const CURVE_BUCKETS = [1, 2, 3, 4, 5, 6, 7]

function costBucket(cost) {
  const c = Math.max(1, cost ?? 1)
  return c >= 7 ? 7 : c
}

function ManaCurveBar({ label, curve, barClassName }) {
  const max = Math.max(1, ...CURVE_BUCKETS.map(b => curve[b] ?? 0))
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <div className="flex items-end gap-2">
        {CURVE_BUCKETS.map(b => {
          const count = curve[b] ?? 0
          return (
            <div key={b} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-gray-400">{count || ''}</span>
              <div className="w-full h-20 bg-gray-100 rounded flex items-end overflow-hidden">
                <div className={`w-full rounded-t ${barClassName}`} style={{ height: `${(count / max) * 100}%` }} />
              </div>
              <span className="text-[10px] text-gray-400">{b === 7 ? '7+' : b}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Read-only gallery of every card in the deck plus the three insights the
// deck builder promises: ink breakdown, type breakdown, and mana curve
// (overall, and characters-only since actions/items/locations skew it low).
function DeckOverview({ deck, cardsByFullName }) {
  const insights = useMemo(() => {
    const inkCounts = {}
    const typeCounts = {}
    const curveAll = {}
    const curveChar = {}
    for (const e of deck.cards) {
      const ink = resolveColors([e.color])[0]
      if (ink) inkCounts[ink] = (inkCounts[ink] ?? 0) + e.qty
      typeCounts[e.type] = (typeCounts[e.type] ?? 0) + e.qty
      const bucket = costBucket(e.cost)
      curveAll[bucket] = (curveAll[bucket] ?? 0) + e.qty
      if (e.type === 'Character') curveChar[bucket] = (curveChar[bucket] ?? 0) + e.qty
    }
    return { inkCounts, typeCounts, curveAll, curveChar }
  }, [deck.cards])

  const sortedEntries = useMemo(
    () => [...deck.cards].sort((a, b) => (a.cost - b.cost) || a.fullName.localeCompare(b.fullName)),
    [deck.cards]
  )

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="border border-gray-200 rounded-lg bg-white p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By Ink</p>
          <div className="space-y-1.5">
            {VALID_INKS.filter(ink => insights.inkCounts[ink]).map(ink => (
              <div key={ink} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5"><InkIcon ink={ink} size={16} />{INK_LABELS[ink]}</span>
                <span className="text-gray-500">{insights.inkCounts[ink]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg bg-white p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By Type</p>
          <div className="space-y-1.5">
            {TYPE_ORDER.filter(t => insights.typeCounts[t]).map(t => (
              <div key={t} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{t}</span>
                <span className="text-gray-500">{insights.typeCounts[t]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="border border-gray-200 rounded-lg bg-white p-4">
          <ManaCurveBar label="Mana Curve" curve={insights.curveAll} barClassName="bg-gray-900" />
        </div>
        <div className="border border-gray-200 rounded-lg bg-white p-4">
          <ManaCurveBar label="Mana Curve — Characters Only" curve={insights.curveChar} barClassName="bg-indigo-500" />
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-2">
        {sortedEntries.length} unique card{sortedEntries.length === 1 ? '' : 's'} · sorted by cost
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        {sortedEntries.map(entry => {
          const imageUrl = getCardImageUrl(cardsByFullName.get(entry.fullName.toLowerCase()))
          return (
            <div key={entry.fullName} className="border border-gray-200 rounded-lg overflow-hidden flex flex-col">
              <div className="aspect-[2.5/3.5] bg-gray-100">
                {imageUrl && <img src={imageUrl} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="p-2">
                <div className="text-xs font-medium text-gray-900 truncate" title={entry.fullName}>{entry.fullName}</div>
                <div className="text-xs text-gray-400">{entry.qty}× · Cost {entry.cost}</div>
              </div>
            </div>
          )
        })}
        {sortedEntries.length === 0 && (
          <div className="col-span-full text-center text-gray-400 text-sm py-16 border-2 border-dashed border-gray-200 rounded-lg">
            No cards in this deck yet.
          </div>
        )}
      </div>
    </div>
  )
}

function DecklistModal({ deck, coconutCard, cardsByFullName, onImport, onClose }) {
  const [text, setText] = useState(() => generateCoconutDecklistText(deck, coconutCard))
  const [copyStatus, setCopyStatus] = useState(null) // null | 'copied' | 'error'
  const [importResult, setImportResult] = useState(null) // null | { ok: true, unmatchedCount } | { ok: false, message }

  function flashCopy(next) {
    setCopyStatus(next)
    setTimeout(() => setCopyStatus(null), 2000)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      flashCopy('copied')
    } catch {
      flashCopy('error')
    }
  }

  function handleImport() {
    const result = parseCoconutDecklist(text, cardsByFullName, getEffectiveType)
    if (!result.coconutCard) {
      setImportResult({
        ok: false,
        message: 'Could not identify the Coconut card. Add a "Coconut Card: <name>" line, or make sure exactly one card in the list is at 4 copies.',
      })
      return
    }
    if (result.entries.length === 0) {
      setImportResult({ ok: false, message: 'No cards in the list could be matched against the card database.' })
      return
    }
    onImport(result)
    setImportResult({ ok: true, unmatchedCount: result.unmatchedNames.length })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-gray-200 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Copy / Import Decklist</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3">
          <p className="text-xs text-gray-500">
            Copy this deck as text to share it, or paste a decklist below and click Import to load it into this deck.
          </p>
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setImportResult(null) }}
            rows={14}
            className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-500"
            spellCheck={false}
          />
          {importResult && (
            <p className={`text-xs rounded px-3 py-2 border ${
              importResult.ok ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              {importResult.ok
                ? `Imported successfully.${importResult.unmatchedCount ? ` ${importResult.unmatchedCount} line${importResult.unmatchedCount === 1 ? '' : 's'} could not be matched and were skipped.` : ''}`
                : importResult.message}
            </p>
          )}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 shrink-0 flex flex-wrap gap-2 justify-end">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {copyStatus === 'copied' ? '✓ Copied' : copyStatus === 'error' ? 'Failed' : 'Copy to Clipboard'}
          </button>
          <button
            onClick={handleImport}
            className="px-3 py-1.5 text-xs font-medium rounded bg-black text-white hover:bg-gray-800 transition-colors"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  )
}

function BuildView({ initialDeck, cards, onBack }) {
  const [deck, setDeck] = useState(initialDeck)
  const [savedAt, setSavedAt] = useState(null)
  const saveTimer = useRef(null)
  const [hoverPreview, setHoverPreview] = useState(null)
  const [mainView, setMainView] = useState('browse') // 'browse' | 'deck'
  const [shareCard, setShareCard] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [decklistModalOpen, setDecklistModalOpen] = useState(false)

  const coconutCard = getCoconutCard(deck.coconutCardId)

  const cardsByFullName = useMemo(() => {
    const map = new Map()
    for (const c of cards) {
      if (c.fullName && !map.has(c.fullName.toLowerCase())) map.set(c.fullName.toLowerCase(), c)
    }
    return map
  }, [cards])

  const handleHoverMove = useCallback((imageUrl, e) => {
    setHoverPreview({ imageUrl, x: e.clientX, y: e.clientY })
  }, [])
  const handleHoverEnd = useCallback(() => setHoverPreview(null), [])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const entries = deck.cards.map(e => {
        const real = cardsByFullName.get(e.fullName.toLowerCase())
        return {
          fullName: e.fullName,
          name: e.name,
          cost: e.cost,
          type: e.type,
          color: resolveColors([e.color])[0] ?? null,
          qty: e.qty,
          imageUrl: getCardImageUrl(real),
          inkwell: real?.inkwell ?? null,
        }
      })
      const canvas = await generateCoconutDeckShareImage({
        deckName: deck.name,
        coconutName: coconutDisplayName(coconutCard),
        coconutImageUrl: getCoconutCardImageUrl(coconutCard),
        inks: deck.inks,
        entries,
      })
      const filename = `${deck.name.replace(/\s+/g, '-').toLowerCase()}-coconut-deck.jpg`
      setShareCard({ canvas, imageUrl: canvas.toDataURL('image/jpeg', 0.92), filename })
    } finally {
      setExporting(false)
    }
  }, [deck, coconutCard, cardsByFullName])

  const handleImportDecklist = useCallback((result) => {
    setDeck(prev => ({
      ...prev,
      name: result.deckName ?? prev.name,
      coconutCardId: result.coconutCard.id,
      inks: result.inks,
      cards: result.entries,
    }))
  }, [])

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
          type: getEffectiveType(card),
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

  const imageUrl = getCoconutCardImageUrl(coconutCard)

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <HoverCardPreview preview={hoverPreview} />
      {shareCard && (
        <ShareCardModal
          shareCard={shareCard}
          onClose={() => setShareCard(null)}
          title="Share deck"
          altText="Deck share card"
          shareTitle="My Coconut Deck"
          maxWidthClass="sm:max-w-md"
        />
      )}
      {decklistModalOpen && (
        <DecklistModal
          deck={deck}
          coconutCard={coconutCard}
          cardsByFullName={cardsByFullName}
          onImport={handleImportDecklist}
          onClose={() => setDecklistModalOpen(false)}
        />
      )}

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

      <div className="flex items-center gap-2 mb-4">
        <div className="flex border border-gray-300 rounded overflow-hidden text-xs">
          <button
            onClick={() => setMainView('browse')}
            className={`px-3 py-1.5 font-medium transition-colors ${mainView === 'browse' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Card Browser
          </button>
          <button
            onClick={() => setMainView('deck')}
            className={`px-3 py-1.5 font-medium transition-colors ${mainView === 'deck' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            View Deck
          </button>
        </div>
        <button
          onClick={() => setDecklistModalOpen(true)}
          className="ml-auto text-xs font-medium px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Copy / Import List
        </button>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="text-xs font-medium px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {exporting ? 'Generating…' : 'Export / Share Deck'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div>
          {mainView === 'browse' ? (
            <CardBrowser
              cards={cards}
              coconutCard={coconutCard}
              lockedInks={deck.inks}
              deckEntries={deck.cards}
              onAdd={addCard}
              onChangeQty={changeQty}
            />
          ) : (
            <DeckOverview deck={deck} cardsByFullName={cardsByFullName} />
          )}
        </div>

        <div className="lg:sticky lg:top-6 space-y-4">
          <div className="border border-gray-200 rounded-lg bg-white p-4">
            {imageUrl && (
              <img src={imageUrl} alt="" className="w-40 mx-auto aspect-[2.5/3.5] object-cover rounded mb-3" />
            )}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {coconutDisplayName(coconutCard)}
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-line">{coconutCard.ability}</p>
          </div>

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
                          imageUrl={getCardImageUrl(cardsByFullName.get(entry.fullName.toLowerCase()))}
                          onChangeQty={changeQty}
                          onRemove={removeCard}
                          onHoverMove={handleHoverMove}
                          onHoverEnd={handleHoverEnd}
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
          type: getEffectiveType(baseCard),
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
    return <PickCoconutCardView onPick={handlePickCoconut} onCancel={handleBack} />
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
