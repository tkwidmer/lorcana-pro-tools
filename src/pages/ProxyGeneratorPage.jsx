import { useState, useCallback } from 'react'
import { useCards } from '../hooks/useCards'
import { SearchBar } from '../components/SearchBar'
import { ProxyCard } from '../components/ProxyCard'

const CARDS_PER_SHEET = 9

const BLANK_CUSTOM = {
  name: '',
  version: '',
  type: 'Character',
  cost: 3,
  color: '',
  inkwell: true,
  strength: 2,
  willpower: 2,
  lore: 1,
  abilityText: '',
}

function chunk(arr, size) {
  const result = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

function buildCustomCardObject(fields) {
  const { abilityText, ...rest } = fields
  return {
    ...rest,
    abilities: abilityText.trim() ? [{ fullText: abilityText.trim() }] : [],
    effects: [],
    subtypes: [],
    artistsText: 'Custom',
    setCode: 'CUSTOM',
    number: '',
    rarity: '',
  }
}

function CustomCardForm({ onAdd }) {
  const [form, setForm] = useState(BLANK_CUSTOM)

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const handleAdd = () => {
    if (!form.name.trim()) return
    onAdd(buildCustomCardObject(form))
    setForm(BLANK_CUSTOM)
  }

  const isCharacter = form.type === 'Character'
  const isLocation = form.type === 'Location'
  const showStrength = isCharacter
  const showWillpower = isCharacter || isLocation
  const showLore = isCharacter || isLocation

  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'
  const inputCls = 'w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black'
  const numInputCls = inputCls + ' text-center'

  return (
    <div className="border border-gray-200 rounded-lg bg-white p-5 mb-6">
      <h2 className="text-sm font-semibold text-gray-800 mb-4">Custom card</h2>

      {/* Row 1: name + subname + type */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="col-span-1">
          <label className={labelCls}>Name *</label>
          <input
            className={inputCls}
            placeholder="Mickey Mouse"
            value={form.name}
            onChange={e => set('name', e.target.value)}
          />
        </div>
        <div className="col-span-1">
          <label className={labelCls}>Subname</label>
          <input
            className={inputCls}
            placeholder="Brave Little Tailor"
            value={form.version}
            onChange={e => set('version', e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Type</label>
          <select
            className={inputCls}
            value={form.type}
            onChange={e => set('type', e.target.value)}
          >
            <option>Character</option>
            <option>Action</option>
            <option>Item</option>
            <option>Location</option>
          </select>
        </div>
      </div>

      {/* Row 2: cost + color + inkable + strength + willpower + lore */}
      <div className="flex flex-wrap gap-3 mb-3">
        <div style={{ width: '60px' }}>
          <label className={labelCls}>Cost</label>
          <input
            type="number" min={0} max={20}
            className={numInputCls}
            value={form.cost}
            onChange={e => set('cost', Number(e.target.value))}
          />
        </div>
        <div style={{ minWidth: '120px', flex: 1 }}>
          <label className={labelCls}>Ink color</label>
          <select
            className={inputCls}
            value={form.color}
            onChange={e => set('color', e.target.value)}
          >
            <option value="">—</option>
            <option value="Amber">Amber</option>
            <option value="Amethyst">Amethyst</option>
            <option value="Emerald">Emerald</option>
            <option value="Ruby">Ruby</option>
            <option value="Sapphire">Sapphire</option>
            <option value="Steel">Steel</option>
          </select>
        </div>
        <div className="flex items-end pb-1 gap-1">
          <input
            type="checkbox"
            id="custom-inkable"
            checked={form.inkwell}
            onChange={e => set('inkwell', e.target.checked)}
            className="cursor-pointer"
          />
          <label htmlFor="custom-inkable" className="text-sm text-gray-600 cursor-pointer select-none">Inkable</label>
        </div>
        {showStrength && (
          <div style={{ width: '70px' }}>
            <label className={labelCls}>Strength</label>
            <input
              type="number" min={0} max={99}
              className={numInputCls}
              value={form.strength}
              onChange={e => set('strength', Number(e.target.value))}
            />
          </div>
        )}
        {showWillpower && (
          <div style={{ width: '70px' }}>
            <label className={labelCls}>Willpower</label>
            <input
              type="number" min={0} max={99}
              className={numInputCls}
              value={form.willpower}
              onChange={e => set('willpower', Number(e.target.value))}
            />
          </div>
        )}
        {showLore && (
          <div style={{ width: '60px' }}>
            <label className={labelCls}>Lore ◇</label>
            <input
              type="number" min={0} max={4}
              className={numInputCls}
              value={form.lore}
              onChange={e => set('lore', Number(e.target.value))}
            />
          </div>
        )}
      </div>

      {/* Row 3: ability text */}
      <div className="mb-4">
        <label className={labelCls}>Ability text</label>
        <textarea
          className={inputCls + ' resize-y'}
          rows={3}
          placeholder="Bodyguard (This character may enter play exerted. An opposing character who challenges one of your characters must instead challenge this one if able.)"
          value={form.abilityText}
          onChange={e => set('abilityText', e.target.value)}
        />
      </div>

      <button
        onClick={handleAdd}
        disabled={!form.name.trim()}
        className="bg-black text-white text-sm px-4 py-2 rounded hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Add to sheet
      </button>
    </div>
  )
}

export function ProxyGeneratorPage() {
  const { cards, loading, error } = useCards()
  const [selected, setSelected] = useState([])
  const [showCustomForm, setShowCustomForm] = useState(false)

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

          <div className="flex items-center gap-3 mb-4">
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

            <button
              onClick={() => setShowCustomForm(v => !v)}
              className={`text-sm px-3 py-2 rounded border whitespace-nowrap ${showCustomForm ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'}`}
            >
              + Custom card
            </button>

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

          {showCustomForm && (
            <CustomCardForm onAdd={(card) => { addCard(card); setShowCustomForm(false) }} />
          )}

          {selected.length === 0 && !showCustomForm ? (
            <div className="text-center text-gray-400 text-sm py-24 border-2 border-dashed border-gray-200 rounded-lg">
              Search for a card above to get started, or create a custom card.
            </div>
          ) : selected.length > 0 ? (
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
          ) : null}
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
