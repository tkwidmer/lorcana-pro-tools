import { useState, useMemo, useRef } from 'react'
import { useCards } from '../hooks/useCards'

// --- Math ---

function logFact(n) {
  if (n <= 1) return 0
  let s = 0
  for (let i = 2; i <= n; i++) s += Math.log(i)
  return s
}

function logBinom(n, k) {
  if (k < 0 || k > n || n < 0) return -Infinity
  if (k === 0 || k === n) return 0
  return logFact(n) - logFact(k) - logFact(n - k)
}

// P(see at least 1 copy of a K-of card) through three sequential draw stages:
//   1) Initial 7-card opening draw from N-card deck
//   2) M mulligan replacement draws (cards go back, deck reshuffled to N-7+M)
//   3) g additional gameplay draws from the N-7 card remaining deck
// Each stage is only included if you missed in the prior stage.
function drawOdds(N, K, M, g) {
  const safeG = Math.min(g, Math.max(0, N - 7))
  let logPMiss = logBinom(N - K, 7) - logBinom(N, 7)
  if (M > 0) {
    const pool = N - 7 + M
    logPMiss += logBinom(pool - K, M) - logBinom(pool, M)
  }
  if (safeG > 0) {
    const pool = N - 7
    logPMiss += logBinom(pool - K, safeG) - logBinom(pool, safeG)
  }
  if (!isFinite(logPMiss)) return logPMiss < 0 ? 1 : 0
  return Math.max(0, Math.min(1, 1 - Math.exp(logPMiss)))
}

// P(at least 1 from group A AND at least 1 from group B), assuming disjoint groups.
// Uses inclusion-exclusion: P(A∩B) = P(A) + P(B) - P(A∪B)
// where P(A∪B) = drawOdds treating A+B as a single pool.
function jointDrawOdds(N, kA, kB, M, g) {
  return Math.max(0, Math.min(1,
    drawOdds(N, kA, M, g) + drawOdds(N, kB, M, g) - drawOdds(N, kA + kB, M, g)
  ))
}

// --- Deck list parsing ---

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
  return Array.from(cardMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

// --- Formatting ---

function pct(p) {
  if (p >= 0.995) return '99%+'
  return (p * 100).toFixed(1) + '%'
}

function oddsColor(p) {
  if (p >= 0.75) return 'text-green-700'
  if (p >= 0.50) return 'text-yellow-700'
  if (p >= 0.25) return 'text-orange-600'
  return 'text-red-600'
}

// --- Constants ---

const SAMPLE = `4 John Silver - Alien Pirate
2 Mother Knows Best
4 Develop Your Brain
4 Donald Duck - Perfect Gentleman
2 Improvise
4 Prince Phillip - Vanquisher of Foes
4 Clarabelle - Light on Her Hooves
4 Clarabelle - Clumsy Guest
4 You're Welcome
4 Tipo - Growing Son
4 Vision of the Future
4 Prince Phillip - Royal Explorer
1 Bend To My Will
4 Sail The Azurite Sea
3 Basil - Undercover Detective
4 Malicious, Mean, and Scary
4 Cinderella - Dream Come True`

const TURN_COLS = [1, 2, 3, 4, 5, 6]

// --- Component ---

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw)
  } catch { return fallback }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function encodeShareState({ deckText, deckSize, goingFirst, mulliganCount, additionalDraws, groups }) {
  const payload = { v: 1, d: deckText, s: deckSize, f: goingFirst, m: mulliganCount, x: additionalDraws, g: groups }
  return btoa(encodeURIComponent(JSON.stringify(payload)))
}

function decodeShareState() {
  try {
    const hash = window.location.hash
    if (!hash.startsWith('#d=')) return null
    return JSON.parse(decodeURIComponent(atob(hash.slice(3))))
  } catch { return null }
}

export function DrawOddsPage() {
  // Bootstrap: if a share URL is present, write its state into localStorage before
  // other state initializers read from it, then clear the hash.
  useState(() => {
    const payload = decodeShareState()
    if (!payload || payload.v !== 1) return null
    localStorage.setItem('drawOdds.deckText', payload.d ?? '')
    lsSet('drawOdds.deckSize', payload.s ?? 60)
    lsSet('drawOdds.goingFirst', payload.f ?? true)
    lsSet('drawOdds.mulliganCount', payload.m ?? 0)
    lsSet('drawOdds.additionalDraws', payload.x ?? 0)
    lsSet('drawOdds.groups', payload.g ?? [])
    history.replaceState(null, '', window.location.pathname)
    return null
  })

  const [copied, setCopied] = useState(false)
  const [deckSize, setDeckSize] = useState(() => lsGet('drawOdds.deckSize', 60))
  const [goingFirst, setGoingFirst] = useState(() => lsGet('drawOdds.goingFirst', true))
  const [mulliganCount, setMulliganCount] = useState(() => lsGet('drawOdds.mulliganCount', 0))
  const [additionalDraws, setAdditionalDraws] = useState(() => lsGet('drawOdds.additionalDraws', 0))
  const [deckText, setDeckText] = useState(() => localStorage.getItem('drawOdds.deckText') ?? '')
  const [groups, setGroups] = useState(() => lsGet('drawOdds.groups', []))
  const nextGroupId = useRef(
    (() => {
      const saved = lsGet('drawOdds.groups', [])
      return saved.length > 0 ? Math.max(...saved.map(g => g.id)) + 1 : 1
    })()
  )

  function saveDeckSize(v) { setDeckSize(v); lsSet('drawOdds.deckSize', v) }
  function saveGoingFirst(v) { setGoingFirst(v); lsSet('drawOdds.goingFirst', v) }
  function saveMulliganCount(v) { setMulliganCount(v); lsSet('drawOdds.mulliganCount', v) }
  function saveAdditionalDraws(v) { setAdditionalDraws(v); lsSet('drawOdds.additionalDraws', v) }
  function saveDeckText(text) { setDeckText(text); localStorage.setItem('drawOdds.deckText', text) }
  function resetDeck() {
    saveDeckText('')
    saveGroups([])
  }
  function copyShareLink() {
    const hash = encodeShareState({ deckText, deckSize, goingFirst, mulliganCount, additionalDraws, groups })
    const url = `${window.location.origin}${window.location.pathname}#d=${hash}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  function saveGroups(updater) {
    setGroups(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      lsSet('drawOdds.groups', next)
      return next
    })
  }

  const { cards: allApiCards } = useCards()

  const costMap = useMemo(() => {
    const map = new Map()
    for (const c of allApiCards) {
      if (c.fullName && c.cost != null) map.set(c.fullName.toLowerCase(), c.cost)
    }
    return map
  }, [allApiCards])

  const cards = useMemo(() => parseDeckList(deckText), [deckText])
  const totalCards = useMemo(() => cards.reduce((s, c) => s + c.count, 0), [cards])

  // Ink curve: aggregate copy counts by ink cost using API data
  const curveCounts = useMemo(() => {
    const counts = new Map()
    for (const card of cards) {
      const cost = costMap.get(card.name.toLowerCase())
      if (cost != null) counts.set(cost, (counts.get(cost) || 0) + card.count)
    }
    return counts
  }, [cards, costMap])

  const N = deckSize
  const M = mulliganCount

  // Gameplay draws by turn T plus any bonus draws from card effects
  const gameDraws = (T) => (goingFirst ? Math.max(0, T - 1) : T) + additionalDraws

  function addGroup() {
    const id = nextGroupId.current++
    saveGroups(gs => [...gs, { id, name: `Group ${id}`, cardNames: [] }])
  }
  function removeGroup(id) {
    saveGroups(gs => gs.filter(g => g.id !== id))
  }
  function renameGroup(id, name) {
    saveGroups(gs => gs.map(g => g.id === id ? { ...g, name } : g))
  }
  function addCardToGroup(id, cardName) {
    saveGroups(gs => gs.map(g =>
      g.id === id && !g.cardNames.includes(cardName)
        ? { ...g, cardNames: [...g.cardNames, cardName] }
        : g
    ))
  }
  function removeCardFromGroup(id, cardName) {
    saveGroups(gs => gs.map(g =>
      g.id === id ? { ...g, cardNames: g.cardNames.filter(n => n !== cardName) } : g
    ))
  }

  const deckSizeWarning = totalCards > 0 && totalCards !== N
    ? `Deck list has ${totalCards} cards (expected ${N})`
    : null

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">
          Draw Odds Calculator
        </h1>
        <p className="text-gray-500">
          Paste a deck list to see your probability of drawing each card by key turns.
        </p>
      </div>

      {/* Settings */}
      <div className="border border-gray-200 rounded-lg p-6 mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">Settings</h2>
        <div className="flex flex-wrap gap-6 items-end mb-6">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Deck Size</label>
            <input
              type="number"
              min="7"
              max="120"
              inputMode="numeric"
              value={deckSize}
              onChange={e => saveDeckSize(Math.max(7, parseInt(e.target.value) || 60))}
              className="w-24 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Turn Order</label>
            <div className="flex rounded border border-gray-200 overflow-hidden text-sm">
              <button
                onClick={() => saveGoingFirst(true)}
                className={`px-4 py-2 transition-colors ${goingFirst ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Going First
              </button>
              <button
                onClick={() => saveGoingFirst(false)}
                className={`px-4 py-2 border-l border-gray-200 transition-colors ${!goingFirst ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Going Second
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-6 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Mulliganed <span className="text-gray-400">(cards sent back)</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => saveMulliganCount(Math.max(0, mulliganCount - 1))}
                disabled={mulliganCount === 0}
                className="w-8 h-8 rounded border border-gray-200 hover:border-gray-900 transition-colors disabled:opacity-30 text-lg leading-none"
              >
                −
              </button>
              <span className="text-xl font-bold w-6 text-center tabular-nums">{mulliganCount}</span>
              <button
                onClick={() => saveMulliganCount(Math.min(7, mulliganCount + 1))}
                disabled={mulliganCount === 7}
                className="w-8 h-8 rounded border border-gray-200 hover:border-gray-900 transition-colors disabled:opacity-30 text-lg leading-none"
              >
                +
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Additional Draws <span className="text-gray-400">(e.g. Develop Your Brain)</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => saveAdditionalDraws(Math.max(0, additionalDraws - 1))}
                disabled={additionalDraws === 0}
                className="w-8 h-8 rounded border border-gray-200 hover:border-gray-900 transition-colors disabled:opacity-30 text-lg leading-none"
              >
                −
              </button>
              <span className="text-xl font-bold w-6 text-center tabular-nums">{additionalDraws}</span>
              <button
                onClick={() => saveAdditionalDraws(Math.min(20, additionalDraws + 1))}
                disabled={additionalDraws === 20}
                className="w-8 h-8 rounded border border-gray-200 hover:border-gray-900 transition-colors disabled:opacity-30 text-lg leading-none"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Deck List */}
      <div className="border border-gray-200 rounded-lg p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Deck List</h2>
          <div className="flex items-center gap-3">
            {totalCards > 0 && (
              <span className={`text-xs ${deckSizeWarning ? 'text-orange-600' : 'text-gray-400'}`}>
                {totalCards} cards · {cards.length} unique
              </span>
            )}
            {deckText && (
              <button
                onClick={copyShareLink}
                className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            )}
            {!deckText && (
              <button
                onClick={() => saveDeckText(SAMPLE)}
                className="text-xs text-gray-400 hover:text-gray-700 transition-colors underline"
              >
                Load sample
              </button>
            )}
          </div>
        </div>
        <textarea
          value={deckText}
          onChange={e => saveDeckText(e.target.value)}
          placeholder={'4 John Silver - Alien Pirate\n2 Mother Knows Best\n...'}
          rows={8}
          className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-gray-900 resize-y"
        />
        {deckSizeWarning && (
          <p className="text-xs text-orange-600 mt-1">{deckSizeWarning}</p>
        )}
        {deckText && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
            <button
              onClick={resetDeck}
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              Reset deck &amp; clear groups
            </button>
          </div>
        )}
      </div>

      {/* Ink Curve */}
      {curveCounts.size > 0 && (() => {
        const costs = [...curveCounts.keys()].sort((a, b) => a - b)
        const maxCount = Math.max(...curveCounts.values())
        const avgCost = (
          [...curveCounts.entries()].reduce((s, [c, n]) => s + c * n, 0) /
          [...curveCounts.values()].reduce((s, n) => s + n, 0)
        ).toFixed(1)
        return (
          <div className="border border-gray-200 rounded-lg p-6 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ink Curve</h2>
              <span className="text-xs text-gray-400">avg cost {avgCost}</span>
            </div>
            <div className="flex items-end gap-3">
              {costs.map(cost => {
                const count = curveCounts.get(cost)
                const heightPct = count / maxCount
                return (
                  <div key={cost} className="flex flex-col items-center gap-1 flex-1">
                    <span className="text-xs font-medium text-gray-600">{count}</span>
                    <div
                      className="w-full bg-gray-900 rounded-t min-h-[4px]"
                      style={{ height: `${Math.round(heightPct * 72)}px` }}
                    />
                    <span className="text-xs text-gray-500">{cost}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Results table */}
      {cards.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Card
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    #
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Opening Hand
                    {M > 0 && (
                      <div className="font-normal normal-case tracking-normal text-gray-400">
                        +{M} mulligan
                      </div>
                    )}
                  </th>
                  {TURN_COLS.map(T => (
                    <th key={T} className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      By Turn {T}
                      <div className="font-normal normal-case tracking-normal text-gray-400">
                        {7 + gameDraws(T)} drawn
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cards.map((card, i) => {
                  const opening = drawOdds(N, card.count, M, 0)
                  const turns = TURN_COLS.map(T => drawOdds(N, card.count, M, gameDraws(T)))
                  return (
                    <tr key={card.name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2.5 text-gray-900">{card.name}</td>
                      <td className="px-3 py-2.5 text-center text-gray-400 text-xs tabular-nums">
                        {card.count}
                      </td>
                      <td className={`px-3 py-2.5 text-center font-semibold tabular-nums ${oddsColor(opening)}`}>
                        {pct(opening)}
                      </td>
                      {turns.map((p, j) => (
                        <td key={j} className={`px-3 py-2.5 text-center font-semibold tabular-nums ${oddsColor(p)}`}>
                          {pct(p)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-200 px-4 py-3 bg-gray-50/50">
            <p className="text-xs text-gray-400 leading-relaxed">
              Each percentage is the chance of drawing at least 1 copy by that point.{' '}
              {goingFirst
                ? 'Going first — no draw on turn 1, so turn 1 odds equal your opening hand.'
                : 'Going second — you draw on every turn, starting with turn 1.'}
              {M > 0
                ? ` Mulligan: assumes you send back ${M} non-target card${M > 1 ? 's' : ''} and draw ${M} fresh replacement${M > 1 ? 's' : ''}.`
                : ''}
              {additionalDraws > 0
                ? ` +${additionalDraws} additional draw${additionalDraws > 1 ? 's' : ''} added to every turn column (not opening hand).`
                : ''}
            </p>
          </div>
        </div>
      )}

      {cards.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-8">
          Paste a deck list above to see draw odds.
        </p>
      )}

      {/* Groups */}
      {cards.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Card Groups</h2>
              <p className="text-xs text-gray-400 mt-0.5">Combine cards to see odds of drawing any one of them.</p>
            </div>
            <button
              onClick={addGroup}
              className="text-sm border border-gray-200 rounded px-3 py-1.5 hover:border-gray-900 transition-colors text-gray-700"
            >
              + New Group
            </button>
          </div>

          {groups.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-lg">
              No groups yet — click "New Group" to combine cards like all your T2 ramp pieces.
            </p>
          )}

          <div className="space-y-3">
            {groups.map(group => {
              const cardEntries = group.cardNames.map(name => {
                const match = cards.find(c => c.name === name)
                return { name, count: match?.count ?? 0, missing: !match }
              })
              const hasMissing = cardEntries.some(e => e.missing)
              const kTotal = cardEntries.reduce((s, e) => s + e.count, 0)
              const opening = drawOdds(N, kTotal, M, 0)
              const turns = TURN_COLS.map(T => drawOdds(N, kTotal, M, gameDraws(T)))
              const available = cards.filter(c => !group.cardNames.includes(c.name))

              return (
                <div key={group.id} className={`border rounded-lg p-4 ${hasMissing ? 'border-orange-200' : 'border-gray-200'}`}>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <input
                      type="text"
                      value={group.name}
                      onChange={e => renameGroup(group.id, e.target.value)}
                      className="text-sm font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-gray-900 focus:outline-none"
                    />
                    <button
                      onClick={() => removeGroup(group.id)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-4"
                    >
                      Delete
                    </button>
                  </div>

                  {hasMissing && (
                    <p className="text-xs text-orange-500 mb-2">
                      Some cards below are no longer in the deck list and are excluded from the odds.
                    </p>
                  )}

                  {/* Card chips + add dropdown */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {cardEntries.map(({ name, count, missing }) => (
                      <span
                        key={name}
                        className={`inline-flex items-center gap-1 text-xs rounded px-2 py-1 ${missing ? 'bg-orange-50 text-orange-600 line-through' : 'bg-gray-100'}`}
                      >
                        {name}
                        {missing
                          ? <span className="text-orange-400 no-underline" style={{ textDecoration: 'none' }}>(missing)</span>
                          : <span className="text-gray-400">({count})</span>
                        }
                        <button
                          onClick={() => removeCardFromGroup(group.id, name)}
                          className="text-gray-400 hover:text-gray-700 leading-none ml-0.5"
                          style={{ textDecoration: 'none' }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {available.length > 0 && (
                      <select
                        value=""
                        onChange={e => { if (e.target.value) addCardToGroup(group.id, e.target.value) }}
                        className="text-xs border border-dashed border-gray-300 rounded px-2 py-1 bg-white text-gray-500 hover:border-gray-500 focus:outline-none focus:border-gray-900 cursor-pointer"
                      >
                        <option value="">+ Add card</option>
                        {available.map(c => (
                          <option key={c.name} value={c.name}>
                            {c.name} ({c.count})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Odds */}
                  {group.cardNames.length === 0 ? (
                    <p className="text-xs text-gray-400">Add cards above to see combined odds.</p>
                  ) : (
                    <div className="border-t border-gray-100 pt-3">
                      <div className="flex items-center gap-1 mb-2">
                        <span className="text-xs text-gray-400">{kTotal} cop{kTotal === 1 ? 'y' : 'ies'} total</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        <div className="text-center min-w-[4rem]">
                          <div className={`text-base font-bold tabular-nums ${oddsColor(opening)}`}>{pct(opening)}</div>
                          <div className="text-xs text-gray-400">Opening</div>
                        </div>
                        {TURN_COLS.map((T, i) => (
                          <div key={T} className="text-center min-w-[4rem]">
                            <div className={`text-base font-bold tabular-nums ${oddsColor(turns[i])}`}>{pct(turns[i])}</div>
                            <div className="text-xs text-gray-400">Turn {T}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Joint Probability */}
      {cards.length > 0 && groups.length >= 2 && (() => {
        const pairs = []
        for (let i = 0; i < groups.length; i++) {
          for (let j = i + 1; j < groups.length; j++) {
            pairs.push([groups[i], groups[j]])
          }
        }
        return (
          <div className="mt-6">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Joint Probability</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Odds of drawing at least 1 card from <em>both</em> groups simultaneously. Assumes groups don't share cards.
              </p>
            </div>
            <div className="space-y-3">
              {pairs.map(([gA, gB]) => {
                const kA = gA.cardNames.reduce((s, n) => s + (cards.find(c => c.name === n)?.count || 0), 0)
                const kB = gB.cardNames.reduce((s, n) => s + (cards.find(c => c.name === n)?.count || 0), 0)
                const opening = jointDrawOdds(N, kA, kB, M, 0)
                const turns = TURN_COLS.map(T => jointDrawOdds(N, kA, kB, M, gameDraws(T)))
                return (
                  <div key={`${gA.id}-${gB.id}`} className="border border-gray-200 rounded-lg p-4">
                    <p className="text-sm font-semibold text-gray-900 mb-3">
                      {gA.name} <span className="text-gray-400 font-normal">and</span> {gB.name}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      <div className="text-center min-w-[4rem]">
                        <div className={`text-base font-bold tabular-nums ${oddsColor(opening)}`}>{pct(opening)}</div>
                        <div className="text-xs text-gray-400">Opening</div>
                      </div>
                      {TURN_COLS.map((T, i) => (
                        <div key={T} className="text-center min-w-[4rem]">
                          <div className={`text-base font-bold tabular-nums ${oddsColor(turns[i])}`}>{pct(turns[i])}</div>
                          <div className="text-xs text-gray-400">Turn {T}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
