import { useState, useMemo, useRef, useEffect } from 'react'
import { useCards } from '../hooks/useCards'
import { oddsColor, brickGrade, brickGradeColor, brickRiskColor, brickBarColor } from '../lib/statColors'
import { parseDeckList } from '../lib/parseDeckList'
import { drawOdds, jointDrawOddsN, drawOddsAtLeast, pct } from '../lib/drawOddsMath'
import { buildMCDeck, buildMCJointDeckN, mcSim, mcJointSimN, curveProbMC, uninkableRiskMC, deadDrawRiskMC, questPressureSim, SIM_TURNS } from '../lib/monteCarloSim'
import {
  buildKeywordAnalysis,
  buildDrawEffects,
  classifyCardRole,
  buildMulliganAdvice,
  setLabel,
  toSimpleName,
  buildCardIndex,
  getLegality,
} from '../lib/cardAnalysis'

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

// --- Curve Probability Simulation ---
// For each turn T1-T8: P(have at least one card with cost ≤ T in hand)
// Accounts for mulligan: keeps playable cards, sends back up to maxMulligan non-playable ones.
// When no playable card is in opening hand, sends back min(maxMulligan, 7) cards and redraws.


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
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* noop */ }
}

function encodeShareState({ deckText, deckSize, goingFirst, maxMulligan, additionalDraws, groups, scrySources }) {
  const payload = { v: 1, d: deckText, s: deckSize, f: goingFirst, m: maxMulligan, x: additionalDraws, g: groups, sc: scrySources }
  return btoa(encodeURIComponent(JSON.stringify(payload)))
}

function decodeShareState() {
  try {
    const hash = window.location.hash
    if (!hash.startsWith('#d=')) return null
    return JSON.parse(decodeURIComponent(atob(hash.slice(3))))
  } catch { return null }
}

export function DeckInsightsPage() {
  // Bootstrap: if a share URL is present, write its state into localStorage before
  // other state initializers read from it, then clear the hash.
  useState(() => {
    const payload = decodeShareState()
    if (!payload || payload.v !== 1) return null
    localStorage.setItem('drawOdds.deckText', payload.d ?? '')
    lsSet('drawOdds.deckSize', payload.s ?? 60)
    lsSet('drawOdds.goingFirst', payload.f ?? true)
    lsSet('drawOdds.maxMulligan', payload.m ?? 7)
    lsSet('drawOdds.additionalDraws', payload.x ?? 0)
    lsSet('drawOdds.groups', payload.g ?? [])
    lsSet('drawOdds.scrySources', payload.sc ?? [])
    history.replaceState(null, '', window.location.pathname)
    return null
  })

  const [copied, setCopied] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(true)
  const [mulliganOpen, setMulliganOpen] = useState(true)
  const [drawRatesOpen, setDrawRatesOpen] = useState(false)
  const [targetTurnOverrides, setTargetTurnOverrides] = useState({})
  const [targetedOddsOpen, setTargetedOddsOpen] = useState(true)
  const [methodologyOpen, setMethodologyOpen] = useState(false)
  const [legalityOpen, setLegalityOpen] = useState(false)
  const [deckSize, setDeckSize] = useState(() => lsGet('drawOdds.deckSize', 60))
  const [goingFirst, setGoingFirst] = useState(() => lsGet('drawOdds.goingFirst', true))
  const [maxMulligan, setMaxMulligan] = useState(() => lsGet('drawOdds.maxMulligan', 7))
  const [additionalDraws, setAdditionalDraws] = useState(() => lsGet('drawOdds.additionalDraws', 0))
  const [deckText, setDeckText] = useState(() => localStorage.getItem('drawOdds.deckText') ?? '')
  const [debouncedDeckText, setDebouncedDeckText] = useState(deckText)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedDeckText(deckText), 400)
    return () => clearTimeout(id)
  }, [deckText])
  const [groups, setGroups] = useState(() => lsGet('drawOdds.groups', []))
  const [scrySources, setScrySources] = useState(() => lsGet('drawOdds.scrySources', []))
  const nextGroupId = useRef(
    (() => {
      const saved = lsGet('drawOdds.groups', [])
      return saved.length > 0 ? Math.max(...saved.map(g => g.id)) + 1 : 1
    })()
  )
  const nextScryId = useRef(
    (() => {
      const saved = lsGet('drawOdds.scrySources', [])
      return saved.length > 0 ? Math.max(...saved.map(s => s.id)) + 1 : 1
    })()
  )

  function saveDeckSize(v) { setDeckSize(v); lsSet('drawOdds.deckSize', v) }
  function saveGoingFirst(v) { setGoingFirst(v); lsSet('drawOdds.goingFirst', v) }
  function saveMaxMulligan(v) { setMaxMulligan(v); lsSet('drawOdds.maxMulligan', v) }
  function saveAdditionalDraws(v) { setAdditionalDraws(v); lsSet('drawOdds.additionalDraws', v) }
  function saveDeckText(text) { setDeckText(text); localStorage.setItem('drawOdds.deckText', text) }
  function resetDeck() {
    saveDeckText('')
    saveGroups([])
  }
  function saveScrySources(updater) {
    setScrySources(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      lsSet('drawOdds.scrySources', next)
      return next
    })
  }
  function addScrySource() {
    const id = nextScryId.current++
    saveScrySources(ss => [...ss, { id, name: '', copies: 4, lookAt: 2, keep: 1 }])
  }
  function removeScrySource(id) {
    saveScrySources(ss => ss.filter(s => s.id !== id))
  }
  function updateScrySource(id, field, value) {
    saveScrySources(ss => ss.map(s => s.id === id ? { ...s, [field]: value } : s))
  }
  function copyShareLink() {
    const hash = encodeShareState({ deckText, deckSize, goingFirst, maxMulligan, additionalDraws, groups, scrySources })
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
      if (c.fullName && c.cost != null) map.set(toSimpleName(c.fullName), c.cost)
    }
    return map
  }, [allApiCards])

  const inkwellMap = useMemo(() => {
    const map = new Map()
    for (const c of allApiCards) {
      if (c.fullName) map.set(toSimpleName(c.fullName), c.inkwell)
    }
    return map
  }, [allApiCards])

  // Per-card strategic role (board development, removal, draw/ramp, song …) inferred
  // from type + rules text, used by the Mulligan Advisor.
  const roleMap = useMemo(() => {
    const map = new Map()
    for (const c of allApiCards) {
      if (c.fullName) map.set(toSimpleName(c.fullName), classifyCardRole(c))
    }
    return map
  }, [allApiCards])

  const colorMap = useMemo(() => {
    const map = new Map()
    for (const c of allApiCards) {
      if (c.fullName) map.set(toSimpleName(c.fullName), (c.color || '').toLowerCase())
    }
    return map
  }, [allApiCards])

  const cardIndex = useMemo(() => buildCardIndex(allApiCards), [allApiCards])

  const legalityEntries = useMemo(() => {
    const entries = []
    for (const raw of debouncedDeckText.split('\n')) {
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
  }, [debouncedDeckText])

  const legalityResults = useMemo(() => {
    return legalityEntries.map(entry => {
      const key = toSimpleName(entry.name)
      const cardData = cardIndex.get(key)
      const legality = getLegality(cardData)
      return { entry, cardData, legality }
    })
  }, [legalityEntries, cardIndex])

  const cards = useMemo(() => parseDeckList(debouncedDeckText), [debouncedDeckText])
  const totalCards = useMemo(() => cards.reduce((s, c) => s + c.count, 0), [cards])

  const brickability = useMemo(() => {
    if (cards.length === 0) return null
    let uninkableCount = 0
    let unknownCount = 0
    const costCopies = []
    for (const card of cards) {
      const key = toSimpleName(card.name)
      const inkwell = inkwellMap.get(key)
      const cost = costMap.get(key)
      if (inkwell === undefined) {
        unknownCount += card.count
      } else if (!inkwell) {
        uninkableCount += card.count
      }
      if (cost != null) {
        for (let i = 0; i < card.count; i++) costCopies.push(cost)
      }
    }
    // Adaptive threshold: deck's median cost minus 1, clamped to [1, 3].
    // Aggro (median ≤2) checks ≤1 — missing a 1-drop is effectively dead.
    // Mid-curve (median 3) checks ≤2; control/midrange (median 4+) checks ≤3 —
    // even control needs to play something by T2-T3.
    costCopies.sort((a, b) => a - b)
    const medianCost = costCopies.length > 0 ? costCopies[Math.floor(costCopies.length / 2)] : 3
    const curveThreshold = Math.max(1, Math.min(3, medianCost - 1))
    const playableCount = cards.reduce((s, c) => {
      const cost = costMap.get(toSimpleName(c.name))
      return s + (cost != null && cost <= curveThreshold ? c.count : 0)
    }, 0)
    // Build flat deck arrays for MC simulations
    const deckCosts = new Int16Array(deckSize).fill(999)
    const deckInkable = new Uint8Array(deckSize) // 1 = inkable, 0 = non-inkable (unknown treated as inkable)
    let idx = 0
    for (const card of cards) {
      const key = toSimpleName(card.name)
      const cost = costMap.get(key)
      const inkwell = inkwellMap.get(key)
      const c = cost != null ? cost : 999
      const ink = inkwell === false ? 0 : 1 // unknown → treat as inkable (conservative)
      for (let i = 0; i < card.count && idx < deckSize; i++) {
        deckCosts[idx] = c
        deckInkable[idx] = ink
        idx++
      }
    }
    // Uninkable hand: MC — if 3+ non-inkables, send them back and redraw
    const uninkableRisk = uninkableRiskMC(deckInkable, deckSize, maxMulligan)
    // Dead draw: MC — if no ≤curveThreshold card, send non-playables back and redraw
    const curveRisk = playableCount > 0
      ? deadDrawRiskMC(deckCosts, deckSize, curveThreshold, maxMulligan)
      : 1
    const grade = brickGrade(Math.max(uninkableRisk, curveRisk))
    return { uninkableRisk, curveRisk, grade, uninkableCount, playableCount, unknownCount, curveThreshold, medianCost }
  }, [cards, deckSize, inkwellMap, costMap, maxMulligan])

  // Ink curve: aggregate copy counts by ink cost using API data
  const curveCounts = useMemo(() => {
    const counts = new Map()
    for (const card of cards) {
      const cost = costMap.get(toSimpleName(card.name))
      if (cost != null) counts.set(cost, (counts.get(cost) || 0) + card.count)
    }
    return counts
  }, [cards, costMap])

  // Per-cost inkability breakdown: for each ink cost, how many copies are inkable vs. not.
  const curveByInkability = useMemo(() => {
    const map = new Map() // cost → { inkable, nonInkable }
    for (const card of cards) {
      const key = toSimpleName(card.name)
      const cost = costMap.get(key)
      const inkable = inkwellMap.get(key)
      if (cost == null || inkable === undefined) continue
      if (!map.has(cost)) map.set(cost, { inkable: 0, nonInkable: 0 })
      const bucket = map.get(cost)
      if (inkable) bucket.inkable += card.count
      else bucket.nonInkable += card.count
    }
    return map
  }, [cards, costMap, inkwellMap])

  // Ink color distribution across the deck.
  const colorBalance = useMemo(() => {
    if (cards.length === 0) return null
    const counts = new Map() // color → { inkable, nonInkable, total }
    let unknown = 0
    for (const card of cards) {
      const key = toSimpleName(card.name)
      const color = colorMap.get(key)
      const inkable = inkwellMap.get(key)
      if (!color) { unknown += card.count; continue }
      if (!counts.has(color)) counts.set(color, { inkable: 0, nonInkable: 0, total: 0 })
      const bucket = counts.get(color)
      bucket.total += card.count
      if (inkable === false) bucket.nonInkable += card.count
      else bucket.inkable += card.count
    }
    const total = cards.reduce((s, c) => s + c.count, 0)
    const entries = [...counts.entries()]
      .map(([color, v]) => ({ color, ...v, pct: v.total / total }))
      .sort((a, b) => b.total - a.total)
    // Classify: a color is a "splash" if it has fewer copies than 10% of the deck
    // or fewer than 4 copies.
    const splashThreshold = Math.max(4, Math.round(total * 0.10))
    const mainColors = entries.filter(e => e.total >= splashThreshold)
    const splashes   = entries.filter(e => e.total < splashThreshold)
    return { entries, mainColors, splashes, total, unknown }
  }, [cards, colorMap, inkwellMap])

  // Lore density: distribution of lore values across characters and locations only.
  const loreDensity = useMemo(() => {
    if (cards.length === 0) return null
    const buckets = new Map() // lore value → copy count
    let totalQuesters = 0, totalLore = 0, unknownCount = 0
    for (const card of cards) {
      const api = cardIndex.get(toSimpleName(card.name))
      if (!api) continue
      const type = api.type || ''
      if (!/character|location/i.test(type)) continue
      const lore = api.lore ?? 0
      buckets.set(lore, (buckets.get(lore) || 0) + card.count)
      totalQuesters += card.count
      totalLore += lore * card.count
      if (api.lore == null) unknownCount += card.count
    }
    if (totalQuesters === 0) return null
    const avgLore = totalLore / totalQuesters
    // Build ordered distribution: 0, 1, 2, 3, 4+
    const distribution = [0, 1, 2, 3].map(v => ({
      lore: v,
      count: buckets.get(v) || 0,
      pct: (buckets.get(v) || 0) / totalQuesters,
    }))
    const fourPlus = [...buckets.entries()]
      .filter(([v]) => v >= 4)
      .reduce((s, [, c]) => s + c, 0)
    if (fourPlus > 0) distribution.push({ lore: '4+', count: fourPlus, pct: fourPlus / totalQuesters })
    const questingCopies = totalQuesters - (buckets.get(0) || 0)
    return { distribution, totalQuesters, questingCopies, avgLore, unknownCount }
  }, [cards, cardIndex])

  // Curve probability: P(can play at least one card) for each turn T1-T8
  // Monte Carlo — accounts for mulligan strategy (keep playable, send back non-playable)
  const curveProbability = useMemo(() => {
    if (cards.length === 0) return null
    // Build a flat cost array across all deck positions
    const deckCosts = new Int16Array(deckSize).fill(999)
    let idx = 0
    for (const card of cards) {
      const cost = costMap.get(toSimpleName(card.name))
      const c = cost != null ? cost : 999
      for (let i = 0; i < card.count && idx < deckSize; i++) deckCosts[idx++] = c
    }
    const probs = curveProbMC(deckCosts, deckSize, maxMulligan, goingFirst, additionalDraws)
    return probs.map((prob, i) => ({ turn: i + 1, prob }))
  }, [cards, deckSize, costMap, maxMulligan, goingFirst, additionalDraws])

  // Quest pressure: full deck array (one entry per copy) for simulation
  const questDeckCards = useMemo(() => {
    if (cards.length === 0) return []
    const result = []
    for (const card of cards) {
      const apiCard = cardIndex.get(toSimpleName(card.name))
      if (!apiCard) continue
      for (let i = 0; i < card.count; i++) {
        result.push({
          cost: apiCard.cost ?? 0,
          lore: apiCard.lore ?? 0,
          type: apiCard.type ?? '',
          inkwell: !!apiCard.inkwell,
        })
      }
    }
    return result
  }, [cards, cardIndex])

  const questPressure = useMemo(() => {
    if (questDeckCards.length === 0) return null
    return questPressureSim(questDeckCards, goingFirst, additionalDraws)
  }, [questDeckCards, goingFirst, additionalDraws])

  const keywordAnalysis = useMemo(() =>
    buildKeywordAnalysis(cards, allApiCards)
  , [cards, allApiCards])

  // Lowercase names of Shift cards whose base is in the deck (a live Shift line).
  const shiftLineNames = useMemo(() => {
    const set = new Set()
    for (const s of keywordAnalysis?.shifts ?? []) {
      if (s.covered) set.add(s.name.toLowerCase())
    }
    return set
  }, [keywordAnalysis])

  const mulliganAdvice = useMemo(() => {
    if (cards.length === 0) return null
    const medianCost = brickability?.medianCost ?? 3
    return buildMulliganAdvice(cards, costMap, inkwellMap, roleMap, medianCost, deckSize, shiftLineNames)
  }, [cards, costMap, inkwellMap, roleMap, brickability, deckSize, shiftLineNames])

  const drawEffects = useMemo(() =>
    buildDrawEffects(cards, allApiCards)
  , [cards, allApiCards])

  const N = deckSize

  // Gameplay draws by turn T plus any bonus draws from card effects
  const gameDraws = (T) => (goingFirst ? Math.max(0, T - 1) : T) + additionalDraws

  // Monte Carlo results for group and joint probability displays.
  // Recomputes only when deck, groups, scry sources, or draw settings change.
  const mcResults = useMemo(() => {
    if (cards.length === 0) return {}
    const gDraws = (T) => (goingFirst ? Math.max(0, T - 1) : T) + additionalDraws
    const result = {}

    for (const group of groups) {
      if (group.cardNames.length === 0) continue
      const deck = buildMCDeck(N, cards, group.cardNames, group.keepInMulligan, scrySources)
      const need = group.need ?? 1
      if (group.targetTurn != null) {
        result[group.id] = {
          mulliganRange: Array.from({ length: maxMulligan + 1 }, (_, m) => ({
            m,
            p: mcSim({ ...deck, N, M: m, T: gDraws(group.targetTurn), need }),
          })),
        }
      } else {
        result[group.id] = {
          opening: mcSim({ ...deck, N, M: 0, T: 0, need }),
          turns: TURN_COLS.map(T => mcSim({ ...deck, N, M: 0, T: gDraws(T), need })),
        }
      }
    }

    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const gA = groups[i], gB = groups[j]
        if (gA.cardNames.length === 0 || gB.cardNames.length === 0) continue
        if (gA.targetTurn == null || gB.targetTurn == null) continue
        const deck = buildMCJointDeckN(N, cards, [gA, gB], scrySources)
        result[`${gA.id}-${gB.id}`] = Array.from({ length: maxMulligan + 1 }, (_, m) => ({
          m,
          p: mcJointSimN({ ...deck, N, M: m, Ts: [gDraws(gA.targetTurn), gDraws(gB.targetTurn)], needs: [gA.need ?? 1, gB.need ?? 1] }),
        }))
      }
    }

    // Full intersection across all groups at once (shown alongside pairwise combos when 3+ groups exist).
    if (groups.length >= 3 && groups.every(g => g.cardNames.length > 0 && g.targetTurn != null)) {
      const key = groups.map(g => g.id).join('-')
      const deck = buildMCJointDeckN(N, cards, groups, scrySources)
      result[key] = Array.from({ length: maxMulligan + 1 }, (_, m) => ({
        m,
        p: mcJointSimN({ ...deck, N, M: m, Ts: groups.map(g => gDraws(g.targetTurn)), needs: groups.map(g => g.need ?? 1) }),
      }))
    }

    return result
  }, [N, cards, groups, scrySources, maxMulligan, goingFirst, additionalDraws])

  function addGroup() {
    const id = nextGroupId.current++
    saveGroups(gs => [...gs, { id, name: `Group ${id}`, cardNames: [], keepInMulligan: false, targetTurn: null, need: 1 }])
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
  function toggleKeepInMulligan(id) {
    saveGroups(gs => gs.map(g => g.id === id ? { ...g, keepInMulligan: !g.keepInMulligan } : g))
  }
  function setGroupTargetTurn(id, turn) {
    saveGroups(gs => gs.map(g => g.id === id ? { ...g, targetTurn: turn } : g))
  }
  function setGroupNeed(id, n) {
    saveGroups(gs => gs.map(g => g.id === id ? { ...g, need: n } : g))
  }

  const deckSizeWarning = totalCards > 0 && totalCards !== N
    ? `Deck list has ${totalCards} cards (expected ${N})`
    : null

  return (
    <div className="w-full px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">
          Deck Insights
        </h1>
        <p className="text-gray-500">
          Paste a deck list to analyse your curve, consistency, lore pressure, keyword synergies, mulligan strategy, and draw odds.
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
              Max Mulligan <span className="text-gray-400">(max cards replaced)</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => saveMaxMulligan(Math.max(0, maxMulligan - 1))}
                disabled={maxMulligan === 0}
                className="w-8 h-8 rounded border border-gray-200 hover:border-gray-900 transition-colors disabled:opacity-30 text-lg leading-none"
              >
                −
              </button>
              <span className="text-xl font-bold w-6 text-center tabular-nums">{maxMulligan}</span>
              <button
                onClick={() => saveMaxMulligan(Math.min(7, maxMulligan + 1))}
                disabled={maxMulligan === 7}
                className="w-8 h-8 rounded border border-gray-200 hover:border-gray-900 transition-colors disabled:opacity-30 text-lg leading-none"
              >
                +
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Additional Draws
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

      {/* Scry Sources */}
      <div className="border border-gray-200 rounded-lg p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Scry Sources</h2>
          <span className="text-xs text-gray-400">Develop Your Brain &amp; similar</span>
        </div>
        <div className="border-l-2 border-yellow-400 pl-3 mb-4 text-xs text-gray-500 leading-relaxed">
          A <strong>scry source</strong> looks at the top <em>N</em> cards of your deck, lets you keep <em>K</em> in hand, and bottoms the rest.
          Example: <em>Develop Your Brain</em> = look at 2, keep 1. The calculator models each scry as seeing those extra cards from your remaining
          deck — if your target is among them, you keep it. A scry source counts only as a scry — not toward any group.
        </div>
        {scrySources.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Source Name</span>
              <span className="w-24 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">Copies</span>
              <span className="w-24 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">Look At</span>
              <span className="w-24 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">Keep</span>
              <span className="w-6" />
            </div>
            <div className="space-y-2">
              {scrySources.map(src => (
                <div key={src.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={src.name}
                    onChange={e => updateScrySource(src.id, 'name', e.target.value)}
                    placeholder="Card name (optional)"
                    className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  />
                  <input
                    type="number"
                    min="1"
                    max="4"
                    value={src.copies}
                    onChange={e => updateScrySource(src.id, 'copies', Math.max(1, Math.min(4, parseInt(e.target.value) || 1)))}
                    className="w-24 border border-gray-200 rounded px-3 py-2 text-sm text-center focus:outline-none focus:border-gray-900"
                  />
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={src.lookAt}
                    onChange={e => {
                      const v = Math.max(1, Math.min(10, parseInt(e.target.value) || 1))
                      updateScrySource(src.id, 'lookAt', v)
                      if (src.keep > v) updateScrySource(src.id, 'keep', v)
                    }}
                    className="w-24 border border-gray-200 rounded px-3 py-2 text-sm text-center focus:outline-none focus:border-gray-900"
                  />
                  <input
                    type="number"
                    min="1"
                    max={src.lookAt}
                    value={src.keep}
                    onChange={e => updateScrySource(src.id, 'keep', Math.max(1, Math.min(src.lookAt, parseInt(e.target.value) || 1)))}
                    className="w-24 border border-gray-200 rounded px-3 py-2 text-sm text-center focus:outline-none focus:border-gray-900"
                  />
                  <button
                    onClick={() => removeScrySource(src.id)}
                    className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={addScrySource}
          className="w-full border border-dashed border-gray-300 rounded py-2 text-sm text-gray-500 hover:border-gray-500 hover:text-gray-700 transition-colors"
        >
          + Add scry source
        </button>
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

      {/* Format Legality — collapsible panel */}
      {legalityResults.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setLegalityOpen(o => !o)}
            className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
          >
            <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Format Legality</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${legalityOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {legalityOpen && (() => {
            const totalNames = legalityResults.length
            const coreIllegalNames = legalityResults.filter(r => !r.legality.core).length
            const infIllegalNames = legalityResults.filter(r => !r.legality.infinity).length
            const rotationRiskNames = legalityResults.filter(r => r.legality.rotationRisk).length
            const notFoundNames = legalityResults.filter(r => !r.cardData).length
            const coreLegal = coreIllegalNames === 0 && totalNames > 0
            const infLegal = infIllegalNames === 0 && totalNames > 0
            return (
              <div className="mt-6 space-y-6">
                {/* Format summary row */}
                <div className="grid grid-cols-2 gap-3">
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
                  <p className="text-xs text-gray-400">
                    {notFoundNames} card name{notFoundNames !== 1 ? 's' : ''} not recognized — check spelling or subtitle.
                  </p>
                )}

                {/* Card table */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
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
                      {legalityResults.map((r, i) => {
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
                <div className="flex flex-wrap gap-4 text-xs text-gray-400">
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
              </div>
            )
          })()}
        </div>
      )}

      {/* Deck Insights — collapsible 2×2 tile grid */}
      {(curveCounts.size > 0 || curveProbability || brickability || questPressure) && (
        <div className="mb-4">
          <button
            onClick={() => setInsightsOpen(o => !o)}
            className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
          >
            <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Deck Insights</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${insightsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {insightsOpen && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">

          {/* Ink Curve tile — stacked inkable / non-inkable bars */}
          {curveCounts.size > 0 && (() => {
            const costs = [...curveCounts.keys()].sort((a, b) => a - b)
            const maxCount = Math.max(...curveCounts.values())
            const avgCost = (
              [...curveCounts.entries()].reduce((s, [c, n]) => s + c * n, 0) /
              [...curveCounts.values()].reduce((s, n) => s + n, 0)
            ).toFixed(1)
            const hasNonInkable = [...curveByInkability.values()].some(v => v.nonInkable > 0)
            return (
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ink Curve</h2>
                  <span className="text-xs text-gray-400">avg {avgCost}</span>
                </div>
                <div className="flex items-end gap-1.5">
                  {costs.map(cost => {
                    const count = curveCounts.get(cost)
                    const split = curveByInkability.get(cost) || { inkable: count, nonInkable: 0 }
                    const totalH = Math.round((count / maxCount) * 52)
                    const nonInkH = count > 0 ? Math.round((split.nonInkable / count) * totalH) : 0
                    const inkH = totalH - nonInkH
                    return (
                      <div key={cost} className="flex flex-col items-center gap-0.5 flex-1">
                        <span className="text-[10px] font-medium text-gray-600">{count}</span>
                        <div className="w-full flex flex-col-reverse min-h-[3px]" style={{ height: `${totalH}px` }}>
                          {inkH > 0 && <div className={`w-full bg-gray-900 ${nonInkH === 0 ? 'rounded-t' : ''}`} style={{ height: `${inkH}px` }} />}
                          {nonInkH > 0 && <div className="w-full bg-orange-400 rounded-t" style={{ height: `${nonInkH}px` }} />}
                        </div>
                        <span className="text-[10px] text-gray-500">{cost}</span>
                      </div>
                    )
                  })}
                </div>
                {hasNonInkable && (
                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex items-center gap-1 text-[10px] text-gray-400">
                      <span className="inline-block w-2 h-2 rounded-sm bg-gray-900" /> inkable
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-orange-500">
                      <span className="inline-block w-2 h-2 rounded-sm bg-orange-400" /> non-inkable
                    </span>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Curve Probability tile */}
          {curveProbability && (() => {
            const barColor = (p) => {
              if (p >= 0.90) return 'bg-green-500'
              if (p >= 0.75) return 'bg-yellow-400'
              if (p >= 0.55) return 'bg-orange-400'
              return 'bg-red-500'
            }
            const textColor = (p) => {
              if (p >= 0.90) return 'text-green-600'
              if (p >= 0.75) return 'text-yellow-600'
              if (p >= 0.55) return 'text-orange-500'
              return 'text-red-600'
            }
            return (
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Curve Probability</h2>
                  <span className="text-xs text-gray-400">P(playable by turn)</span>
                </div>
                <div className="flex items-end gap-1.5">
                  {curveProbability.map(({ turn, prob }) => (
                    <div key={turn} className="flex flex-col items-center gap-0.5 flex-1">
                      <span className={`text-[10px] font-semibold tabular-nums ${textColor(prob)}`}>
                        {Math.round(prob * 100)}%
                      </span>
                      <div className="relative w-full" style={{ height: '52px' }}>
                        <div
                          className="absolute w-full border-t border-dashed border-gray-300"
                          style={{ bottom: `${0.80 * 52}px` }}
                        />
                        <div
                          className={`absolute bottom-0 w-full rounded-t ${barColor(prob)}`}
                          style={{ height: `${Math.max(2, prob * 52)}px` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500">T{turn}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                  Mull {maxMulligan} · dashed = 80%
                  {scrySources.length > 0 && <> · scry not included</>}
                </p>
              </div>
            )
          })()}

          {/* Brickability tile */}
          {brickability && (
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Brickability</h2>
                <div className={`text-2xl font-black leading-none ${brickGradeColor(brickability.grade)}`}>
                  {brickability.grade}
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-500">Uninkable hand</span>
                    <span className={`text-[10px] font-semibold tabular-nums ${brickRiskColor(brickability.uninkableRisk)}`}>
                      {pct(brickability.uninkableRisk)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${brickBarColor(brickability.uninkableRisk)}`}
                      style={{ width: `${Math.min(100, brickability.uninkableRisk / 0.30 * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{brickability.uninkableCount} non-inkable · 3+ after mull</div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-500">Dead draw</span>
                    <span className={`text-[10px] font-semibold tabular-nums ${brickRiskColor(brickability.curveRisk)}`}>
                      {pct(brickability.curveRisk)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${brickBarColor(brickability.curveRisk)}`}
                      style={{ width: `${Math.min(100, brickability.curveRisk / 0.30 * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{brickability.playableCount} playable (≤{brickability.curveThreshold} cost) · after mull</div>
                </div>
              </div>
              {brickability.unknownCount > 0 && (
                <p className="text-[10px] text-gray-400 mt-3 pt-2 border-t border-gray-100">
                  {brickability.unknownCount} cop{brickability.unknownCount === 1 ? 'y' : 'ies'} not in database — ink data may be incomplete.
                </p>
              )}
            </div>
          )}

          {/* Lore Density tile */}
          {loreDensity && (() => {
            const { distribution, totalQuesters, questingCopies, avgLore } = loreDensity
            const maxCount = Math.max(...distribution.map(d => d.count), 1)
            const loreBarColor = (lore) => {
              if (lore === 0)   return 'bg-gray-200'
              if (lore === 1)   return 'bg-blue-300'
              if (lore === 2)   return 'bg-blue-500'
              if (lore === 3)   return 'bg-blue-700'
              return 'bg-blue-900'
            }
            const loreTextColor = (lore) => {
              if (lore === 0)   return 'text-gray-400'
              if (lore === 1)   return 'text-blue-400'
              if (lore === 2)   return 'text-blue-500'
              if (lore === 3)   return 'text-blue-700'
              return 'text-blue-900'
            }
            const questingPct = totalQuesters > 0 ? Math.round((questingCopies / totalQuesters) * 100) : 0
            return (
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lore Density</h2>
                  <span className="text-xs text-gray-400">avg {avgLore.toFixed(2)} ◆ per quester</span>
                </div>
                <div className="flex items-end gap-1.5 mb-3">
                  {distribution.map(({ lore, count }) => (
                    <div key={lore} className="flex flex-col items-center gap-0.5 flex-1">
                      <span className={`text-[10px] font-semibold tabular-nums ${loreTextColor(lore)}`}>{count}</span>
                      <div
                        className={`w-full rounded-t min-h-[3px] ${loreBarColor(lore)}`}
                        style={{ height: `${Math.max(3, Math.round((count / maxCount) * 52))}px` }}
                      />
                      <span className="text-[10px] text-gray-500">{lore}◆</span>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-gray-500 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Questing characters &amp; locations</span>
                    <span className="tabular-nums font-medium text-gray-700">{questingCopies} / {totalQuesters} ({questingPct}%)</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Ink Color Balance tile */}
          {colorBalance && colorBalance.entries.length > 0 && (() => {
            const INK_CSS = {
              amber:    { bar: 'bg-amber-400',    text: 'text-amber-700',    dot: 'bg-amber-400'    },
              amethyst: { bar: 'bg-purple-500',   text: 'text-purple-700',   dot: 'bg-purple-500'   },
              emerald:  { bar: 'bg-emerald-500',  text: 'text-emerald-700',  dot: 'bg-emerald-500'  },
              ruby:     { bar: 'bg-red-500',      text: 'text-red-700',      dot: 'bg-red-500'      },
              sapphire: { bar: 'bg-blue-500',     text: 'text-blue-700',     dot: 'bg-blue-500'     },
              steel:    { bar: 'bg-slate-500',    text: 'text-slate-700',    dot: 'bg-slate-500'    },
            }
            const { entries, mainColors, splashes, total } = colorBalance
            const maxTotal = Math.max(...entries.map(e => e.total))
            const isMono = mainColors.length === 1 && splashes.length === 0
            const label = isMono ? 'Mono' : mainColors.length >= 2 && splashes.length === 0
              ? `${mainColors.length}-Color`
              : splashes.length > 0 ? `${mainColors.length}-Color + splash` : 'Multi-Color'
            return (
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ink Color Balance</h2>
                  <span className="text-xs text-gray-400">{label}</span>
                </div>
                <div className="space-y-2">
                  {entries.map(({ color, total: ct, nonInkable, pct }) => {
                    const css = INK_CSS[color] || { bar: 'bg-gray-400', text: 'text-gray-600', dot: 'bg-gray-400' }
                    const barW = Math.round((ct / maxTotal) * 100)
                    const nonInkW = ct > 0 ? Math.round((nonInkable / ct) * barW) : 0
                    const isSplash = splashes.some(s => s.color === color)
                    return (
                      <div key={color}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <img src={`/ink/${color}.png`} alt={color} className="w-3.5 h-3.5 shrink-0" />
                          <span className={`text-[11px] font-medium capitalize ${isSplash ? 'text-gray-400' : 'text-gray-700'}`}>
                            {color}{isSplash ? ' (splash)' : ''}
                          </span>
                          <span className="ml-auto text-[10px] text-gray-400 tabular-nums">
                            {ct} cop{ct === 1 ? 'y' : 'ies'} · {Math.round(pct * 100)}%
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full flex">
                            <div className={`h-full ${css.bar} rounded-full`} style={{ width: `${barW - nonInkW}%` }} />
                            {nonInkW > 0 && <div className="h-full bg-orange-300" style={{ width: `${nonInkW}%` }} />}
                          </div>
                        </div>
                        {nonInkable > 0 && (
                          <div className="text-[10px] text-orange-500 mt-0.5">
                            {nonInkable} non-inkable · can't use as ink if flooded
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {colorBalance.unknown > 0 && (
                  <p className="text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-100">
                    {colorBalance.unknown} cop{colorBalance.unknown === 1 ? 'y' : 'ies'} not in database — color data may be incomplete.
                  </p>
                )}
                {splashes.length > 0 && (
                  <p className="text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-100">
                    Splash colors (&lt;{Math.round(total * 0.10)}–4 copies) may be inconsistent to draw.
                  </p>
                )}
              </div>
            )
          })()}

          {/* Quest Pressure tile */}
          {questPressure && (() => {
            const { avgLore, estWinTurn, loreBands } = questPressure
            const turns = Array.from({ length: SIM_TURNS }, (_, i) => i + 1)
            const maxLore = Math.max(20, ...avgLore, ...loreBands.map(b => b.p90))
            const W = 300, H = 96, padL = 22, padR = 6, padT = 6, padB = 18
            const cW = W - padL - padR
            const cH = H - padT - padB
            const tx = (i) => padL + (i / (SIM_TURNS - 1)) * cW
            const ty = (v) => padT + cH - (v / maxLore) * cH
            const points = avgLore.map((v, i) => `${tx(i).toFixed(1)},${ty(v).toFixed(1)}`).join(' ')
            // p10–p90 band: trace p90 left→right, then p10 right→left to close the area.
            const bandTop = loreBands.map((b, i) => `${tx(i).toFixed(1)},${ty(b.p90).toFixed(1)}`)
            const bandBot = loreBands.map((b, i) => `${tx(i).toFixed(1)},${ty(b.p10).toFixed(1)}`).reverse()
            const bandPath = `${bandTop.join(' ')} ${bandBot.join(' ')}`
            const callouts = [3, 7, 11].map(i => ({ turn: i + 1, lore: avgLore[i].toFixed(1) }))
            return (
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Quest Pressure</h2>
                  {estWinTurn != null
                    ? <span className="text-xs text-gray-400">avg win ~T{estWinTurn}</span>
                    : <span className="text-xs text-gray-400">avg &lt;20 by T8</span>
                  }
                </div>
                <div className="flex gap-3 mb-2">
                  {callouts.map(({ turn, lore }) => (
                    <div key={turn} className="text-center">
                      <div className="text-[10px] text-gray-400">T{turn}</div>
                      <div className="text-xs font-semibold tabular-nums text-gray-700">{lore}</div>
                    </div>
                  ))}
                  <div className="text-[10px] text-gray-300 self-end pb-px ml-0.5">avg lore</div>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: '96px' }}>
                  {[5, 10, 15, 20].map(v => (
                    <g key={v}>
                      <line x1={padL} y1={ty(v).toFixed(1)} x2={W - padR} y2={ty(v).toFixed(1)}
                        stroke={v === 20 ? '#ef4444' : '#e5e7eb'}
                        strokeWidth={v === 20 ? 1 : 0.5}
                        strokeDasharray={v === 20 ? '3 3' : undefined}
                      />
                      <text x={padL - 3} y={ty(v)} textAnchor="end" fontSize="6" fill={v === 20 ? '#ef4444' : '#9ca3af'} dominantBaseline="middle">{v}</text>
                    </g>
                  ))}
                  {turns.map((t, i) => (
                    <text key={t} x={tx(i).toFixed(1)} y={H - padB + 9} textAnchor="middle" fontSize="6" fill="#9ca3af">T{t}</text>
                  ))}
                  <polygon points={bandPath} fill="#1d4ed8" fillOpacity="0.12" stroke="none" />
                  <polyline points={points} fill="none" stroke="#1d4ed8" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                  {avgLore.map((v, i) => (
                    <circle key={i} cx={tx(i).toFixed(1)} cy={ty(v).toFixed(1)} r="2" fill="#1d4ed8" />
                  ))}
                </svg>
                <p className="text-[10px] text-gray-400 mt-1">
                  Line = average · shaded = 10th–90th percentile
                  {scrySources.length > 0 && <> · doesn&apos;t model scry or other Action/Item effects</>}
                </p>
              </div>
            )
          })()}

          {/* Win Turn tile */}
          {questPressure && (() => {
            const { winTurnCdf, medianWinTurn, neverWinRate } = questPressure
            const turns = Array.from({ length: SIM_TURNS - 4 }, (_, i) => i + 5)
            const barColor = (p) => {
              if (p >= 0.75) return 'bg-green-500'
              if (p >= 0.50) return 'bg-yellow-400'
              if (p >= 0.25) return 'bg-orange-400'
              return 'bg-red-500'
            }
            return (
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Win Turn</h2>
                  {medianWinTurn != null
                    ? <span className="text-xs text-gray-400">median ~T{medianWinTurn}</span>
                    : <span className="text-xs text-gray-400">&lt;50% by T{SIM_TURNS}</span>
                  }
                </div>
                <div className="flex items-end gap-1.5">
                  {turns.map((t) => {
                    const p = winTurnCdf[t - 1]
                    return (
                      <div key={t} className="flex flex-col items-center gap-0.5 flex-1">
                        <span className="text-[10px] font-semibold tabular-nums text-gray-600">
                          {Math.round(p * 100)}%
                        </span>
                        <div className="relative w-full" style={{ height: '52px' }}>
                          <div
                            className="absolute w-full border-t border-dashed border-gray-300"
                            style={{ bottom: `${0.50 * 52}px` }}
                          />
                          <div
                            className={`absolute bottom-0 w-full rounded-t ${barColor(p)}`}
                            style={{ height: `${Math.max(2, p * 52)}px` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-500">T{t}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                  P(reach 20 lore by turn) · dashed = 50%
                  {neverWinRate > 0.005 && <> · {pct(neverWinRate)} not by T{SIM_TURNS}</>}
                </p>
              </div>
            )
          })()}

          {/* Draw Effects tile */}
          {drawEffects && (() => {
            const { drawCards, rampCards, discardRecoveryCards, scryCards, totalDrawCopies, totalRampCopies, totalDiscardCopies, totalScryCopies, drawPotential, hasVariableDraw } = drawEffects
            const summaryParts = [
              totalDrawCopies > 0 && `${totalDrawCopies} draw`,
              totalScryCopies > 0 && `${totalScryCopies} scry`,
              totalDiscardCopies > 0 && `${totalDiscardCopies} recovery`,
              totalRampCopies > 0 && `${totalRampCopies} ramp`,
            ].filter(Boolean)
            return (
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Draw Effects</h2>
                  <span className="text-xs text-gray-400">{summaryParts.join(' · ')}</span>
                </div>

                <div className="space-y-3">
                  {drawCards.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Draw</div>
                      <div className="space-y-1">
                        {drawCards.map(c => (
                          <div key={c.name} className="flex items-center justify-between text-xs">
                            <span className="text-gray-700 truncate">
                              <span className="text-gray-400 tabular-nums">{c.copies}×</span> {c.name}
                            </span>
                            <span className="text-[10px] text-blue-500 shrink-0 ml-2">
                              {c.variable ? 'variable' : `+${c.drawCount} card${c.drawCount !== 1 ? 's' : ''}`}
                            </span>
                          </div>
                        ))}
                      </div>
                      {drawPotential > 0 && (
                        <p className="text-[10px] text-gray-400 mt-1.5">
                          {hasVariableDraw ? 'At least ' : 'Up to '}
                          <span className="font-semibold text-gray-600">{drawPotential}</span> extra cards if all copies played
                          {hasVariableDraw && ' (plus variable draws)'}
                        </p>
                      )}
                    </div>
                  )}

                  {scryCards.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Scry / Tutor</div>
                      <div className="space-y-1">
                        {scryCards.map(c => (
                          <div key={c.name} className="flex items-center justify-between text-xs">
                            <span className="text-gray-700 truncate">
                              <span className="text-gray-400 tabular-nums">{c.copies}×</span> {c.name}
                            </span>
                            <span className="text-[10px] text-indigo-500 shrink-0 ml-2">
                              {c.lookCount != null ? `look ${c.lookCount}` : 'look'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {discardRecoveryCards.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Discard Recovery</div>
                      <div className="space-y-1">
                        {discardRecoveryCards.map(c => (
                          <div key={c.name} className="flex items-center justify-between text-xs">
                            <span className="text-gray-700 truncate">
                              <span className="text-gray-400 tabular-nums">{c.copies}×</span> {c.name}
                            </span>
                            <span className="text-[10px] text-violet-500 shrink-0 ml-2">from discard</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {rampCards.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Ramp</div>
                      <div className="space-y-1">
                        {rampCards.map(c => (
                          <div key={c.name} className="flex items-center justify-between text-xs">
                            <span className="text-gray-700 truncate">
                              <span className="text-gray-400 tabular-nums">{c.copies}×</span> {c.name}
                            </span>
                            <span className="text-[10px] text-green-600 shrink-0 ml-2">+ink</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {drawCards.length === 0 && scryCards.length === 0 && discardRecoveryCards.length === 0 && (
                    <p className="text-xs text-gray-400 italic">No draw effects detected.</p>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Keyword Analysis tile */}
          {keywordAnalysis && keywordAnalysis.density.length > 0 && (() => {
            const { density, shifts, singers, totalSongs, totalSingers, avgSingerLevel, unsingSongs, maxSingingPower } = keywordAnalysis
            const uncoveredShifts = shifts.filter(s => !s.covered)
            const coveredShifts = shifts.filter(s => s.covered)
            return (
              <div className="border border-gray-200 rounded-lg p-4 sm:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Keyword Analysis</h2>
                  <span className="text-xs text-gray-400">{density.length} keyword{density.length !== 1 ? 's' : ''} found</span>
                </div>

                {/* Keyword density pills */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {density.map(({ keyword, count }) => (
                    <span key={keyword} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                      {keyword}
                      <span className="text-gray-400 tabular-nums">×{count}</span>
                    </span>
                  ))}
                </div>

                {/* Singer ↔ Song balance */}
                {totalSongs > 0 && (
                  <div className={`rounded-md p-3 mb-3 text-xs ${unsingSongs.length > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-100'}`}>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 mb-1">
                      <span><span className="font-semibold text-gray-700">{totalSongs}</span> song{totalSongs === 1 ? '' : 's'}</span>
                      {totalSingers > 0 && <span><span className="font-semibold text-gray-700">{totalSingers}</span> Singer cop{totalSingers === 1 ? 'y' : 'ies'}{avgSingerLevel ? ` (avg Singer ${avgSingerLevel})` : ''}</span>}
                      <span className="text-gray-500">max singing power: <span className="font-semibold text-gray-700">{maxSingingPower}⬡</span></span>
                    </div>
                    {unsingSongs.length > 0 && (
                      <p className="text-amber-700 mt-1">
                        {unsingSongs.map(s => `${s.name} (${s.cost}⬡)`).join(', ')} can&apos;t be sung — no character with cost or Singer level ≥ {Math.min(...unsingSongs.map(s => s.cost))}.
                      </p>
                    )}
                    {unsingSongs.length === 0 && totalSingers > 0 && singers.length > 0 && (
                      <p className="text-gray-500">
                        Highest Singer: {singers[0].name} (Singer {singers[0].singerLevel})
                        {' · '}most expensive song: {[...keywordAnalysis.songs].sort((a,b) => (b.cost??0) - (a.cost??0))[0]?.name} ({[...keywordAnalysis.songs].sort((a,b) => (b.cost??0) - (a.cost??0))[0]?.cost}⬡)
                      </p>
                    )}
                  </div>
                )}

                {/* Shift coverage */}
                {shifts.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Shift Coverage</div>
                    <div className="space-y-1">
                      {uncoveredShifts.map(s => (
                        <div key={s.name} className="flex items-start gap-2 text-xs">
                          <span className="text-red-500 mt-px shrink-0">✗</span>
                          <div>
                            <span className="font-medium text-gray-800">{s.name}</span>
                            <span className="text-gray-400"> (Shift {s.shiftCost})</span>
                            <span className="text-red-600"> — no &ldquo;{s.baseName}&rdquo; base in deck</span>
                          </div>
                        </div>
                      ))}
                      {coveredShifts.map(s => (
                        <div key={s.name} className="flex items-start gap-2 text-xs">
                          <span className="text-green-500 mt-px shrink-0">✓</span>
                          <div>
                            <span className="font-medium text-gray-800">{s.name}</span>
                            <span className="text-gray-400"> (Shift {s.shiftCost})</span>
                            <span className="text-gray-500"> — {s.baseCopies} base cop{s.baseCopies === 1 ? 'y' : 'ies'} in deck</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          </div>}
        </div>
      )}

      {/* Mulligan Advisor — collapsible keep/toss guidance */}
      {mulliganAdvice && (() => {
        const { keep, flexible, toss, keepThreshold, keepCopies, pAtLeast1, pAtLeast2 } = mulliganAdvice
        const tiers = [
          { key: 'keep', label: 'Keep', cards: keep, dot: 'bg-green-500', text: 'text-green-700', border: 'border-green-200', bg: 'bg-green-50' },
          { key: 'flexible', label: 'Flexible', cards: flexible, dot: 'bg-yellow-400', text: 'text-yellow-700', border: 'border-yellow-200', bg: 'bg-yellow-50' },
          { key: 'toss', label: 'Toss', cards: toss, dot: 'bg-red-500', text: 'text-red-700', border: 'border-red-200', bg: 'bg-red-50' },
        ]
        return (
          <div className="mb-4">
            <button
              onClick={() => setMulliganOpen(o => !o)}
              className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
            >
              <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Mulligan Advisor</span>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${mulliganOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {mulliganOpen && <div className="mt-3">
              <div className="border border-gray-200 rounded-lg p-4 mb-3 bg-gray-50">
                <p className="text-sm text-gray-700">
                  Aim to keep an opening hand with <span className="font-semibold">at least one early play</span> (cost ≤ {keepThreshold})
                  and enough inkable cards to ramp. Throw back slow, high-cost cards unless your hand already curves into them.
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-xs text-gray-500">
                  <span><span className="font-semibold text-gray-700">{keepCopies}</span> keep-tier copies in deck</span>
                  <span>P(≥1 in opener): <span className={`font-semibold tabular-nums ${oddsColor(pAtLeast1)}`}>{pct(pAtLeast1)}</span></span>
                  <span>P(≥2 in opener): <span className={`font-semibold tabular-nums ${oddsColor(pAtLeast2)}`}>{pct(pAtLeast2)}</span></span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {tiers.map(tier => (
                  <div key={tier.key} className={`border ${tier.border} rounded-lg overflow-hidden`}>
                    <div className={`flex items-center justify-between px-3 py-2 ${tier.bg} border-b ${tier.border}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${tier.dot}`} />
                        <span className={`text-xs font-semibold uppercase tracking-wide ${tier.text}`}>{tier.label}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 tabular-nums">
                        {tier.cards.reduce((s, c) => s + c.count, 0)} cop{tier.cards.reduce((s, c) => s + c.count, 0) === 1 ? 'y' : 'ies'}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {tier.cards.length === 0 && (
                        <div className="px-3 py-3 text-[11px] text-gray-400 italic">No cards</div>
                      )}
                      {tier.cards.map(card => (
                        <div key={card.name} className="px-3 py-2" title={card.reason}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-gray-800 truncate">
                              <span className="text-gray-400 tabular-nums">{card.count}×</span> {card.name}
                            </span>
                            <span className="text-[10px] text-gray-400 tabular-nums shrink-0">
                              {card.cost == null ? '?' : `${card.cost}⬡`}
                              {card.inkable === false && <span className="text-orange-500 ml-0.5" title="Non-inkable">◇</span>}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{card.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>}
          </div>
        )
      })()}

      {/* Draw Rates — collapsible results table */}
      {cards.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setDrawRatesOpen(o => !o)}
            className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
          >
            <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Card Draw Rates</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${drawRatesOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {drawRatesOpen && <div className="mt-3">
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Card</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Cost</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Count</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Target Turn
                    <div className="font-normal normal-case tracking-normal text-gray-400">defaults to cost</div>
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    On Curve %
                    <div className="font-normal normal-case tracking-normal text-gray-400">P(≥1 by target)</div>
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Avg Seen
                    <div className="font-normal normal-case tracking-normal text-gray-400">copies by target</div>
                  </th>
                  {scrySources.length > 0 && (
                    <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Scry Boost
                      <div className="font-normal normal-case tracking-normal text-gray-400">vs no scry</div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...cards].sort((a, b) => {
                  const ca = costMap.get(toSimpleName(a.name)) ?? 99
                  const cb = costMap.get(toSimpleName(b.name)) ?? 99
                  return ca !== cb ? ca - cb : a.name.localeCompare(b.name)
                }).map((card, i) => {
                  const cost = costMap.get(toSimpleName(card.name))
                  const defaultTurn = cost != null ? Math.max(1, Math.min(8, cost)) : 4
                  const curveT = targetTurnOverrides[card.name] ?? defaultTurn
                  const draws = gameDraws(curveT)
                  const totalDrawn = 7 + draws
                  const onCurve = drawOdds(N, card.count, maxMulligan, draws, scrySources)
                  const onCurveNoScry = drawOdds(N, card.count, maxMulligan, draws)
                  const avgSeen = card.count * totalDrawn / N
                  const scryBoost = onCurve - onCurveNoScry
                  const isCustom = targetTurnOverrides[card.name] != null
                  return (
                    <tr key={card.name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2.5 text-gray-900">{card.name}</td>
                      <td className="px-3 py-2.5 text-center text-gray-400 text-xs tabular-nums">
                        {cost != null ? cost : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-400 text-xs tabular-nums">{card.count}</td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="number"
                          min={1}
                          max={8}
                          value={curveT}
                          onChange={e => {
                            const v = Math.max(1, Math.min(8, parseInt(e.target.value) || 1))
                            setTargetTurnOverrides(prev => ({ ...prev, [card.name]: v }))
                          }}
                          className={`w-12 text-center text-sm rounded border py-0.5 tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                            isCustom
                              ? 'border-blue-300 bg-blue-50 text-blue-700 font-semibold'
                              : 'border-gray-200 bg-transparent text-gray-500'
                          }`}
                        />
                      </td>
                      <td className={`px-3 py-2.5 text-center font-semibold tabular-nums ${oddsColor(onCurve)}`}>
                        {pct(onCurve)}
                      </td>
                      <td className={`px-3 py-2.5 text-center font-semibold tabular-nums ${
                        avgSeen >= 1 ? 'text-green-600'
                        : avgSeen >= 0.5 ? 'text-yellow-500'
                        : 'text-red-500'
                      }`}>
                        {avgSeen.toFixed(2)}
                      </td>
                      {scrySources.length > 0 && (
                        <td className={`px-3 py-2.5 text-center tabular-nums text-xs font-medium ${
                          scryBoost > 0.01 ? 'text-blue-500' : 'text-gray-400'
                        }`}>
                          {scryBoost > 0.001 ? `+${pct(scryBoost)}` : '—'}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-200 px-4 py-3 bg-gray-50/50">
            <p className="text-xs text-gray-400 leading-relaxed">
              Sorted by cost. <strong className="text-gray-500">Target Turn</strong> defaults to each card's ink cost — adjust it for songs or off-curve plays. <strong className="text-gray-500">On Curve %</strong> = P(see ≥1 copy by that turn) with up to {maxMulligan}-card mulligan{scrySources.length > 0 ? ' and scry' : ''}. <strong className="text-gray-500">Avg Seen</strong> = expected copies in hand — below 0.5 means you'll often miss it entirely.{' '}
              {scrySources.length > 0 && <><strong className="text-gray-500">Scry Boost</strong> = improvement from your scry sources. </>}
              {goingFirst ? 'Going first.' : 'Going second.'}
            </p>
          </div>
        </div>
          </div>}
        </div>
      )}

      {cards.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-8">
          Paste a deck list above to see draw odds.
        </p>
      )}

      {/* Targeted Card Odds — collapsible groups + joint probability */}
      {cards.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setTargetedOddsOpen(o => !o)}
            className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
          >
            <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Targeted Card Odds</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${targetedOddsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {targetedOddsOpen && (
            <div className="mt-3">
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
              const available = cards.filter(c => !group.cardNames.includes(c.name))
              const targetTurn = group.targetTurn
              const mcGroup = mcResults[group.id]
              const mulliganRange = targetTurn != null ? (mcGroup?.mulliganRange ?? null) : null
              const opening = targetTurn == null ? (mcGroup?.opening ?? 0) : 0
              const turns = targetTurn == null ? (mcGroup?.turns ?? TURN_COLS.map(() => 0)) : []

              return (
                <div key={group.id} className={`border rounded-lg p-4 ${hasMissing ? 'border-orange-200' : 'border-gray-200'}`}>
                  {/* Header */}
                  <div className="flex items-center gap-2 justify-between mb-3">
                    <input
                      type="text"
                      value={group.name}
                      onChange={e => renameGroup(group.id, e.target.value)}
                      className="text-sm font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-gray-900 focus:outline-none min-w-0 flex-1"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      {targetTurn != null && (
                        <button
                          onClick={() => toggleKeepInMulligan(group.id)}
                          title="Always keep in mulligan — these cards won't be sent back when mulliganing"
                          className={`text-xs px-2 py-1 rounded border transition-colors ${group.keepInMulligan ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}
                        >
                          Always keep
                        </button>
                      )}
                      <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-400 whitespace-nowrap">Need</label>
                        <input
                          type="number"
                          min="1"
                          max="4"
                          value={group.need ?? 1}
                          onChange={e => {
                            const v = parseInt(e.target.value)
                            setGroupNeed(group.id, isNaN(v) ? 1 : Math.max(1, Math.min(4, v)))
                          }}
                          className="w-10 border border-gray-200 rounded px-1.5 py-1 text-xs text-center focus:outline-none focus:border-gray-900"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-400 whitespace-nowrap">By T</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          placeholder="—"
                          value={targetTurn ?? ''}
                          onChange={e => {
                            const v = parseInt(e.target.value)
                            setGroupTargetTurn(group.id, isNaN(v) ? null : Math.max(1, Math.min(10, v)))
                          }}
                          className="w-10 border border-gray-200 rounded px-1.5 py-1 text-xs text-center focus:outline-none focus:border-gray-900"
                        />
                      </div>
                      <button
                        onClick={() => removeGroup(group.id)}
                        className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
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
                  ) : mulliganRange != null ? (
                    <div className="border-t border-gray-100 pt-3">
                      <div className="text-xs text-gray-400 mb-2">
                        By Turn {targetTurn} · need {group.need ?? 1}+ of {kTotal}{group.keepInMulligan ? ' · always keep' : ''}{' '}
                        <span className="text-gray-300">· simulated</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-2">
                        {mulliganRange.map(({ m, p }) => (
                          <div key={m} className="text-center min-w-[3rem]">
                            <div className={`text-sm font-bold tabular-nums ${oddsColor(p)}`}>{pct(p)}</div>
                            <div className="text-xs text-gray-400">Mull {m}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-gray-100 pt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-gray-400">{kTotal} cop{kTotal === 1 ? 'y' : 'ies'} total</span>
                        {group.keepInMulligan && <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">always keep</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        <div className="text-center min-w-[4rem]">
                          <div className={`text-base font-bold tabular-nums ${oddsColor(opening)}`}>{pct(opening)}</div>
                          <div className="text-xs text-gray-400">Opening</div>
                          {kTotal >= 2 && (
                            <div className="text-xs text-gray-300 tabular-nums">{pct(drawOddsAtLeast(N, kTotal, 7, 2))} 2+</div>
                          )}
                        </div>
                        {TURN_COLS.map((T, i) => (
                          <div key={T} className="text-center min-w-[4rem]">
                            <div className={`text-base font-bold tabular-nums ${oddsColor(turns[i])}`}>{pct(turns[i])}</div>
                            <div className="text-xs text-gray-400">Turn {T}</div>
                            {kTotal >= 2 && (
                              <div className="text-xs text-gray-300 tabular-nums">{pct(drawOddsAtLeast(N, kTotal, 7 + gameDraws(T), 2))} 2+</div>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        Assumes no mulligan. Set a target turn to see simulated odds across mulligan counts.
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

      {/* Joint Probability */}
      {groups.length >= 2 && (() => {
        const pairs = []
        for (let i = 0; i < groups.length; i++) {
          for (let j = i + 1; j < groups.length; j++) {
            pairs.push([groups[i], groups[j]])
          }
        }
        const combos = groups.length >= 3 ? [groups, ...pairs] : pairs

        function renderCombo(combo) {
          const key = combo.map(g => g.id).join('-')
          const isFullSet = combo.length > 2
          const ks = combo.map(g => g.cardNames.reduce((s, n) => s + (cards.find(c => c.name === n)?.count || 0), 0))
          const hasJointTarget = combo.every(g => g.targetTurn != null)
          const opening = jointDrawOddsN(N, ks, 0, 0)
          const turns = TURN_COLS.map(T => jointDrawOddsN(N, ks, 0, gameDraws(T), scrySources))
          const jointMulliganRange = hasJointTarget ? (mcResults[key] ?? null) : null
          const firstTurn = combo[0].targetTurn
          const turnLabel = hasJointTarget
            ? combo.every(g => g.targetTurn === firstTurn)
              ? `By Turn ${firstTurn}`
              : combo.map(g => `${g.name} by T${g.targetTurn}`).join(' · ')
            : null
          return (
            <div key={key} className={`border rounded-lg p-4 ${isFullSet ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'}`}>
              <p className="text-sm font-semibold text-gray-900 mb-3">
                {combo.length === 2 ? (
                  <>{combo[0].name} <span className="text-gray-400 font-normal">and</span> {combo[1].name}</>
                ) : (
                  combo.map(g => g.name).join(' + ')
                )}
                {combo.some(g => g.keepInMulligan) && (
                  <span className="ml-2 text-xs font-normal text-green-600">always keep modeled</span>
                )}
              </p>
              {jointMulliganRange != null ? (
                <div>
                  <div className="text-xs text-gray-400 mb-2">{turnLabel} <span className="text-gray-300">· simulated</span></div>
                  <div className="flex flex-wrap gap-x-3 gap-y-2">
                    {jointMulliganRange.map(({ m, p }) => (
                      <div key={m} className="text-center min-w-[3rem]">
                        <div className={`text-sm font-bold tabular-nums ${oddsColor(p)}`}>{pct(p)}</div>
                        <div className="text-xs text-gray-400">Mull {m}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
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
                  <p className="text-xs text-gray-400 mt-2">
                    Assumes no mulligan (M=0). Set a target turn on {combo.length === 2 ? 'both' : 'all'} groups to see simulated odds across mulligan counts.
                  </p>
                </div>
              )}
            </div>
          )
        }

        return (
          <div className="mt-6">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Joint Probability</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Odds of drawing at least 1 card from <em>every</em> group in a combination simultaneously. Assumes groups don't share cards.
              </p>
            </div>
            <div className="space-y-3">
              {combos.map(renderCombo)}
            </div>
          </div>
        )
      })()}
            </div>
          )}
        </div>
      )}
      {/* Methodology */}
      <div className="mb-4 mt-6">
        <button
          onClick={() => setMethodologyOpen(o => !o)}
          className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
        >
          <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Methodology</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${methodologyOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {methodologyOpen && (
          <div className="mt-6 space-y-6 text-sm text-gray-600 leading-relaxed">

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Ink Curve</h3>
              <p>
                A bar chart showing how many cards in your deck cost each amount of ink, alongside the average cost across all cards. Each bar is now split into two segments: the dark portion represents inkable copies at that cost, and the orange portion represents non-inkable copies. This makes it easy to spot cost brackets where you&apos;re committed to playing into a specific position — cards that can&apos;t be inked and have no other use if your curve stalls.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Ink Color Balance</h3>
              <p>
                A per-color breakdown of how many copies in your deck belong to each ink color, shown as proportional bars. Each bar is split to indicate how many of that color&apos;s cards are non-inkable (orange segment) — which matters because non-inkable cards of your secondary color can sit stranded in hand if you&apos;re color-flooded. Colors with very few copies (below roughly 10% of the deck or fewer than 4 copies) are marked as splashes and may be inconsistent to draw. The summary label classifies your deck as Mono, 2-Color, or multi-color with splashes.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Curve Probability</h3>
              <p>
                The bars show how likely you are to have at least one playable card on each turn from T1 through T8 — meaning a card that costs no more than the current turn number. This is simulated using Monte Carlo methods (thousands of random game openings) so it correctly accounts for your mulligan: if your opening hand has nothing playable, the simulator will send back cards and redraw, just like you would in a real game. The dashed line marks the 80% threshold — turns above it mean you'll almost always have a play, turns below it are where you might get stuck.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Brickability</h3>
              <p>
                Two separate risks, both simulated with Monte Carlo across thousands of hands:
              </p>
              <ul className="mt-2 space-y-1.5 list-disc list-inside text-gray-500">
                <li><span className="font-medium text-gray-700">Uninkable hand</span> — the chance your opening hand (after mulligan) has three or more cards that can't be put into your inkwell. A flooded inkwell hand means you can't ramp your ink and will fall behind on tempo.</li>
                <li><span className="font-medium text-gray-700">Dead draw</span> — the chance your opening hand (after mulligan) has no card you could play on the early turns, based on your deck's cost profile. An aggro deck needs a T1 play; a control deck can survive until T2 or T3.</li>
              </ul>
              <p className="mt-2">
                The letter grade combines both risks into a single score: <span className="font-medium text-green-600">A</span> means your deck is very consistent, <span className="font-medium text-red-500">F</span> means you're likely to brick at least one of these ways fairly often.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Lore Density</h3>
              <p>
                A bar chart showing how many copies of your characters and locations produce each lore value per quest. Cards with 0◆ sit on the board and challenge but never advance your win condition on their own; 1◆ cards are steady; 2◆ and 3◆ cards are your fastest lore engines. The summary row shows what fraction of your board-development cards actually quest, which is a quick read on whether you&apos;re building a racing deck or a defensive one.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Quest Pressure</h3>
              <p>
                A simulation of how much lore your deck generates on average across turns T1–T12, played out across thousands of games. Each simulated game follows the basic rules of Lorcana: characters enter play "dry" and can't quest until the following turn, locations generate passive lore each turn automatically, and the ink system is modeled so you're spending the right amount each turn. The simulator plays greedily — it always tries to maximize lore gained — so the numbers represent a best-case ceiling rather than a conservative floor. The dashed red line at 20 lore marks the win condition. The average win turn is shown in the top-right corner. The shaded band around the line shows the 10th-to-90th percentile range across all simulated games — a wide band means your lore output swings a lot game to game, a narrow band means it's consistent.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Win Turn</h3>
              <p>
                Built from the same Quest Pressure simulation, this shows the probability that your deck has reached the 20-lore win condition by each turn — so the T7 bar answers "in what fraction of games have I already won by turn 7?" The dashed line marks 50%, and the median win turn (the first turn you win in at least half of games) is called out in the top-right. If a meaningful share of games never reach 20 lore by turn 8, that percentage is noted too. Because the underlying simulation plays greedily for maximum lore, treat these as an optimistic ceiling on your clock.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Mulligan Advisor</h3>
              <p>
                A keep-or-toss guide for your opening hand, sorted into three tiers. Cost thresholds are derived from your deck's own curve (its median ink cost) so the advice adapts to your archetype — an aggro deck wants to keep almost only its cheapest cards, while a control deck can afford to hold mid-cost cards. On top of cost, the advisor reads each card's <span className="font-medium">role</span> from its type and rules text, because a cheap card isn't automatically a good keep:
              </p>
              <ul className="mt-2 space-y-1.5 list-disc list-inside text-gray-500">
                <li><span className="font-medium text-gray-700">Characters &amp; locations</span> are real board development — the cheap ones are your best keeps.</li>
                <li><span className="font-medium text-gray-700">Card draw &amp; ink ramp</span> smooth your hand, so cheap ones are worth keeping even though they don't develop the board.</li>
                <li><span className="font-medium text-gray-700">Removal and other reactive actions</span> are dead in hand without a target, so they stay flexible rather than auto-keep.</li>
                <li><span className="font-medium text-gray-700">Songs</span> are treated as later payoffs you'll sing with a character, not opening plays — so a cheap-on-paper song is demoted out of Keep.</li>
              </ul>
              <p className="mt-2">
                Non-inkable cards (marked ◇) lean toward tossing because they can't fall back to being ink. The summary at the top shows how likely your opening seven is to contain one or two keep-tier cards. One honest caveat: this reads card <em>function</em>, not strategy — it can tell a song is a payoff, but it doesn't know which specific cards combo together, so treat its calls on niche combo pieces as a starting point, not gospel.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Keyword Analysis</h3>
              <p>
                A cross-card keyword breakdown with two relationship checks:
              </p>
              <ul className="mt-2 space-y-1.5 list-disc list-inside text-gray-500">
                <li><span className="font-medium text-gray-700">Keyword density</span> — total copies of each tracked keyword (Shift, Singer, Bodyguard, Rush, Evasive, Ward, Reckless, Support, Challenger) across the deck, so you can see at a glance how keyword-heavy your strategy is.</li>
                <li><span className="font-medium text-gray-700">Singer–song balance</span> — total Singer characters vs. total songs, with the average Singer level and the gap between your cheapest singer and most expensive song. A Singer 4 character can&apos;t pay for a 6-cost song; mismatches are flagged in amber.</li>
                <li><span className="font-medium text-gray-700">Shift coverage</span> — for each Shift card in your deck, checks whether a lower-cost version of that character (same name before the dash) is also in the deck. A missing base is flagged in red, since Shifting without a target means always hard-casting at full cost.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Card Draw Rates</h3>
              <p>
                A card-by-card table showing how likely you are to have seen each card by your chosen target turn. The target turn defaults to each card's ink cost (its "on curve" turn), but you can adjust it — useful for songs you plan to sing with a character rather than hard-cast, or late-game finishers you just need to see eventually. The percentages account for your mulligan and any scry sources you've configured. <span className="font-medium text-gray-700">Avg Seen</span> is the expected number of copies in your hand by that turn: a value below 0.5 means you'll typically miss it entirely.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Targeted Card Odds</h3>
              <p>
                A flexible tool for asking specific questions about your deck — like "how likely am I to have at least one of these three win conditions by turn 5?" You can group any cards together and the calculator works out the combined probability of drawing at least one of them by your target turn. It runs a full simulation across mulligan counts so you can see exactly how many cards you need to send back to maximize your odds of hitting the group. Joint probability mode lets you ask about two separate groups at once — for example, "what are the odds I have both an early play and a finisher by turn 6?"
              </p>
            </div>

          </div>
        )}
      </div>

    </div>
  )
}
