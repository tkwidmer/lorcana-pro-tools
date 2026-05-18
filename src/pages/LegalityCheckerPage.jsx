import { useState, useMemo } from 'react'
import { useCards } from '../hooks/useCards'

// Sets rotating out of Core when Set 13 releases (July 2026).
// Show rotation warning within 6 months of the rotation date.
const ROTATION_DATE = new Date('2026-07-01')
const WARN_WINDOW_MS = 180 * 24 * 60 * 60 * 1000
const SHOW_ROTATION_WARNING = (ROTATION_DATE - Date.now()) <= WARN_WINDOW_MS
const ROTATING_SETS = new Set(['5', '6', '7', '8'])

const SET_NAMES = {
  '1': 'The First Chapter',
  '2': 'Rise of the Floodborn',
  '3': 'Into the Inklands',
  '4': "Ursula's Return",
  '5': 'Shimmering Skies',
  '6': 'Azurite Sea',
  '7': "Archazia's Island",
  '8': 'Lorcana Anniversary',
  '9': 'Destiny Awaits',
  '10': 'Set 10',
  '11': 'Set 11',
  '12': 'Set 12',
  'Q1': 'Quest 1',
  'Q2': 'Quest 2',
}

function setLabel(setCode) {
  const name = SET_NAMES[setCode]
  if (!name) return `Set ${setCode}`
  const num = parseInt(setCode)
  return isNaN(num) ? name : `${name} (Set ${setCode})`
}

function toSimpleName(str) {
  return str
    .toLowerCase()
    .replace(/\s*-\s*/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDeckList(text) {
  const entries = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^(\d+)x?\s+(.+)$/i)
    if (!m) continue
    const count = parseInt(m[1])
    const name = m[2].trim()
    if (!name || count < 1) continue
    entries.push({ name, count })
  }
  return entries
}

function buildCardIndex(cards) {
  // Map simpleName -> best card entry.
  // Priority: Core-legal > Infinity-legal > highest set number.
  const bySimpleName = new Map()
  for (const card of cards) {
    const key = card.simpleName
    const existing = bySimpleName.get(key)
    if (!existing) {
      bySimpleName.set(key, card)
      continue
    }
    const score = c => {
      if (c.allowedInFormats?.Core?.allowed) return 2
      if (c.allowedInFormats?.Infinity?.allowed) return 1
      return 0
    }
    const thisScore = score(card)
    const existingScore = score(existing)
    if (thisScore > existingScore) {
      bySimpleName.set(key, card)
    } else if (thisScore === existingScore) {
      const existingSet = parseInt(existing.setCode) || 0
      const thisSet = parseInt(card.setCode) || 0
      if (thisSet > existingSet) bySimpleName.set(key, card)
    }
  }
  return bySimpleName
}

function getLegality(card) {
  if (!card) return { core: null, infinity: null, rotationRisk: false }
  const formats = card.allowedInFormats ?? {}
  const coreAllowed = formats.Core?.allowed === true
  const infAllowed = formats.Infinity?.allowed === true
  const isBanned = !infAllowed && !!formats.Infinity?.bannedSinceDate
  const rotationRisk = coreAllowed && SHOW_ROTATION_WARNING && ROTATING_SETS.has(card.setCode)
  return { core: coreAllowed, infinity: infAllowed, banned: isBanned, rotationRisk }
}

function Badge({ status, rotationRisk }) {
  if (status === null) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-400">
        —
      </span>
    )
  }
  if (status === 'banned') {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
        Banned
      </span>
    )
  }
  if (status) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border ${
        rotationRisk
          ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
          : 'bg-green-50 text-green-700 border-green-200'
      }`}>
        Legal
        {rotationRisk && <span title="Rotates with Set 13 (July 2026)">⚠</span>}
      </span>
    )
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
      Not legal
    </span>
  )
}

const EXAMPLE_DECK = `4 Cinderella - Gentle and Kind
4 Goofy - Musketeer
3 Ariel - On Human Legs
2 Mickey Mouse - Brave Little Tailor
4 Elsa - Snow Queen
3 Moana - Of Motunui
2 Giant Cobra - Ghostly Serpent`

export function LegalityCheckerPage() {
  const { cards, loading, error } = useCards()
  const [deckText, setDeckText] = useState('')

  const cardIndex = useMemo(() => buildCardIndex(cards), [cards])
  const entries = useMemo(() => parseDeckList(deckText), [deckText])

  const results = useMemo(() => {
    return entries.map(entry => {
      const key = toSimpleName(entry.name)
      const cardData = cardIndex.get(key)
      const legality = getLegality(cardData)
      return { entry, cardData, legality }
    })
  }, [entries, cardIndex])

  // Per-format summary counts (by card name, not total copies)
  const totalNames = results.length
  const coreIllegalNames = results.filter(r => !r.legality.core).length
  const infIllegalNames = results.filter(r => !r.legality.infinity).length
  const rotationRiskNames = results.filter(r => r.legality.rotationRisk).length
  const notFoundNames = results.filter(r => !r.cardData).length

  const coreLegal = coreIllegalNames === 0 && totalNames > 0
  const infLegal = infIllegalNames === 0 && totalNames > 0

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">
          Legality Checker
        </h1>
        <p className="text-sm text-gray-500">
          Paste a decklist to see format legality for every card at a glance.
        </p>
      </div>

      {/* Decklist input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Decklist
        </label>
        <textarea
          className="w-full h-44 font-mono text-sm border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:border-gray-400"
          placeholder={"4 Card Name\n3 Another Card\n2 Third Card - Subtitle\n..."}
          value={deckText}
          onChange={e => setDeckText(e.target.value)}
          spellCheck={false}
        />
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-xs text-gray-400">
            Accepts <code className="bg-gray-100 px-1 rounded">4 Card Name</code> or{' '}
            <code className="bg-gray-100 px-1 rounded">4x Card Name</code> format, one per line.
          </p>
          <button
            onClick={() => setDeckText(EXAMPLE_DECK)}
            className="text-xs text-gray-400 hover:text-gray-700 underline"
          >
            Load example
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading card data…</p>}
      {error && <p className="text-sm text-red-600">Failed to load card data: {error}</p>}

      {!loading && entries.length === 0 && deckText.trim() !== '' && (
        <p className="text-sm text-gray-400">
          No valid card entries found. Use format:{' '}
          <code className="bg-gray-100 px-1 rounded">4 Card Name</code>
        </p>
      )}

      {!loading && results.length > 0 && (
        <>
          {/* Format summary row */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {/* Core */}
            <div className={`rounded-lg border px-4 py-3 ${
              coreLegal ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Core</span>
                <span className={`text-xs font-semibold ${coreLegal ? 'text-green-700' : 'text-red-700'}`}>
                  {coreLegal ? 'Legal' : 'Not legal'}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                {coreIllegalNames > 0
                  ? `${coreIllegalNames} of ${totalNames} card name${totalNames !== 1 ? 's' : ''} not legal`
                  : `All ${totalNames} card name${totalNames !== 1 ? 's' : ''} legal`}
              </p>
              {rotationRiskNames > 0 && (
                <p className="text-xs text-yellow-700 mt-0.5">
                  ⚠ {rotationRiskNames} name{rotationRiskNames !== 1 ? 's rotate' : ' rotates'} with Set 13 (July 2026)
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">Sets 5–12 currently legal</p>
            </div>

            {/* Infinity */}
            <div className={`rounded-lg border px-4 py-3 ${
              infLegal ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Infinity</span>
                <span className={`text-xs font-semibold ${infLegal ? 'text-green-700' : 'text-red-700'}`}>
                  {infLegal ? 'Legal' : 'Not legal'}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                {infIllegalNames > 0
                  ? `${infIllegalNames} of ${totalNames} card name${totalNames !== 1 ? 's' : ''} not legal`
                  : `All ${totalNames} card name${totalNames !== 1 ? 's' : ''} legal`}
              </p>
              <p className="text-xs text-gray-400 mt-1">All sets · banned cards excluded</p>
            </div>
          </div>

          {notFoundNames > 0 && (
            <p className="text-xs text-gray-400 mb-4">
              {notFoundNames} card name{notFoundNames !== 1 ? 's' : ''} not recognized — check spelling or subtitle.
            </p>
          )}

          {/* Card table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="py-2 pl-4 pr-2 text-left text-xs font-semibold text-gray-500 w-10">Qty</th>
                  <th className="py-2 pr-4 text-left text-xs font-semibold text-gray-500">Card</th>
                  <th className="py-2 pr-4 text-left text-xs font-semibold text-gray-500 hidden sm:table-cell">Set</th>
                  <th className="py-2 pr-4 text-center text-xs font-semibold text-gray-500 w-24">Core</th>
                  <th className="py-2 pr-4 text-center text-xs font-semibold text-gray-500 w-24">Infinity</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const { entry, cardData, legality } = r
                  const rowBg = (!legality.core || !legality.infinity)
                    ? 'bg-red-50/20'
                    : legality.rotationRisk
                    ? 'bg-yellow-50/30'
                    : ''

                  return (
                    <tr key={i} className={`border-b border-gray-100 last:border-0 ${rowBg}`}>
                      <td className="py-2.5 pl-4 pr-2 text-sm font-medium text-gray-500 text-right">
                        {entry.count}×
                      </td>
                      <td className="py-2.5 pr-4 text-sm text-gray-900">
                        {entry.name}
                        {!cardData && (
                          <span className="ml-2 text-xs text-gray-400 italic">not found</span>
                        )}
                        {cardData && cardData.fullName !== entry.name && (
                          <span className="ml-1.5 text-xs text-gray-400">→ {cardData.fullName}</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-400 hidden sm:table-cell">
                        {cardData ? setLabel(cardData.setCode) : '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-center">
                        {!cardData ? (
                          <Badge status={null} />
                        ) : (
                          <Badge status={legality.core} rotationRisk={legality.rotationRisk} />
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-center">
                        {!cardData ? (
                          <Badge status={null} />
                        ) : legality.banned ? (
                          <Badge status="banned" />
                        ) : (
                          <Badge status={legality.infinity} />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-800 border border-yellow-200 font-semibold text-xs">Legal ⚠</span>
              Rotates with Set 13 (July 2026)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200 font-semibold text-xs">Banned</span>
              Banned in Infinity
            </span>
            <span>
              Legality data sourced from{' '}
              <a href="https://lorcanajson.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">
                lorcanajson.org
              </a>
            </span>
          </div>
        </>
      )}
    </div>
  )
}
