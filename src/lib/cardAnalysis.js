import { drawOddsAtLeast } from './drawOddsMath'


// --- Legality constants ---
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

const TRACKED_KEYWORDS = ['Shift', 'Singer', 'Bodyguard', 'Rush', 'Evasive', 'Ward', 'Reckless', 'Support', 'Challenger']

// LorcanaJSON keyword abilities have a `keyword` field (e.g. "Shift", "Singer");
// named/triggered/static abilities use `name` instead and have no `keyword` field.
function parseKeyword(ab) {
  if (!ab) return null
  if (ab.keyword) {
    const kwName = TRACKED_KEYWORDS.find(k => ab.keyword.startsWith(k))
    if (!kwName) return null
    return { keyword: kwName, value: ab.keywordValueNumber ?? null }
  }
  // Fallback: scan ab.name in case the keyword is encoded there
  const name = ab.name || ''
  for (const kw of TRACKED_KEYWORDS) {
    if (name.startsWith(kw)) {
      const numMatch = name.match(/\d+/)
      return { keyword: kw, value: numMatch ? parseInt(numMatch[0]) : null }
    }
  }
  return null
}

// The "simple name" of a card is everything before the first " - " separator —
// this is what Shift cards share with their lower-cost base version.
function simpleName(fullName) {
  const dash = fullName.indexOf(' - ')
  return dash === -1 ? fullName : fullName.slice(0, dash)
}

export function buildKeywordAnalysis(cards, allApiCards) {
  if (cards.length === 0) return null

  // Build a lookup: normalized fullName → apiCard
  const byName = buildCardIndex(allApiCards)

  // Build a lookup: simpleName → array of { fullName, cost, copies } for cards in deck
  const deckBySimple = new Map()
  for (const card of cards) {
    const api = byName.get(toSimpleName(card.name))
    const sn = simpleName(card.name)
    if (!deckBySimple.has(sn)) deckBySimple.set(sn, [])
    deckBySimple.get(sn).push({ fullName: card.name, cost: api?.cost ?? null, copies: card.count })
  }

  const keywordCopies = new Map()   // keyword → total copies in deck
  const shifts = []                 // { name, copies, shiftCost, baseName, baseCopies }
  const singers = []                // { name, copies, singerLevel }
  const songs = []                  // { name, copies, cost }
  // All characters in the deck: { name, cost, singerLevel (null if no Singer keyword) }
  const characters = []
  let totalSongs = 0, totalSingers = 0, totalSingerCapacity = 0

  for (const card of cards) {
    const api = byName.get(toSimpleName(card.name))
    const type = api?.type || ''
    const subs = api?.subtypes || api?.classifications || []
    const isSong = /song/i.test(type) || (Array.isArray(subs) && subs.some(s => /song/i.test(s)))
    const isCharacter = /character/i.test(type)
    if (isSong) {
      totalSongs += card.count
      songs.push({ name: card.name, copies: card.count, cost: api?.cost ?? null })
    }
    if (isCharacter && api?.cost != null) {
      characters.push({ name: card.name, copies: card.count, cost: api.cost, singerLevel: null })
    }

    // keywordAbilities is a top-level string array listing keyword names without
    // values (e.g. ["Shift", "Singer"]) — use it for density counts when present.
    // Fall back to parsing abilities entries for older schema versions.
    if (Array.isArray(api?.keywordAbilities)) {
      for (const kwName of api.keywordAbilities) {
        const tracked = TRACKED_KEYWORDS.find(k => kwName.startsWith(k))
        if (tracked) keywordCopies.set(tracked, (keywordCopies.get(tracked) || 0) + card.count)
      }
    }

    if (!api?.abilities) continue
    for (const ab of api.abilities) {
      const kw = parseKeyword(ab)
      if (!kw) continue
      // Only count toward density if keywordAbilities wasn't already used above
      if (!Array.isArray(api?.keywordAbilities)) {
        keywordCopies.set(kw.keyword, (keywordCopies.get(kw.keyword) || 0) + card.count)
      }

      if (kw.keyword === 'Shift') {
        const sn = simpleName(card.name)
        const bases = (deckBySimple.get(sn) || []).filter(b => {
          if (toSimpleName(b.fullName) === toSimpleName(card.name)) return false
          if (b.cost == null || api.cost == null) return false
          return b.cost < api.cost
        })
        const baseCopies = bases.reduce((s, b) => s + b.copies, 0)
        shifts.push({
          name: card.name, copies: card.count, shiftCost: kw.value,
          baseName: sn, baseCopies, covered: baseCopies > 0,
        })
      }

      if (kw.keyword === 'Singer') {
        totalSingers += card.count
        if (kw.value != null) totalSingerCapacity += kw.value * card.count
        singers.push({ name: card.name, copies: card.count, singerLevel: kw.value })
        // Update the matching character entry with its singer level
        const charEntry = characters.find(c => c.name === card.name)
        if (charEntry) charEntry.singerLevel = kw.value
      }
    }
  }

  shifts.sort((a, b) => a.covered - b.covered || a.name.localeCompare(b.name))
  singers.sort((a, b) => (b.singerLevel ?? 0) - (a.singerLevel ?? 0))

  // A character can sing a song if: its cost >= song cost (base rule),
  // OR it has Singer N where N >= song cost (keyword extends reach).
  // The effective "singing power" of a character is max(cost, singerLevel ?? 0).
  const singingPowers = characters.map(c => Math.max(c.cost, c.singerLevel ?? 0))
  const maxSingingPower = singingPowers.length > 0 ? Math.max(...singingPowers) : 0

  // For each song, flag whether any character in the deck can sing it.
  const unsingSongs = songs.filter(s => s.cost != null && s.cost > maxSingingPower)
  const avgSingerLevel = totalSingers > 0 ? (totalSingerCapacity / totalSingers).toFixed(1) : null

  // Keyword density: sort by copy count descending
  const density = [...keywordCopies.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kw, count]) => ({ keyword: kw, count }))

  return { density, shifts, singers, songs, unsingSongs, totalSongs, totalSingers, avgSingerLevel, maxSingingPower, characters }
}

// --- Draw Effects ---
// Scans each deck card's rules text to identify draw and ramp effects.
// `isDraw` and `isRamp` come from classifyCardRole; here we also try to parse
// the exact draw count (e.g. "draw 2 cards" → drawCount: 2).
export function buildDrawEffects(cards, allApiCards) {
  if (cards.length === 0) return null
  const byName = buildCardIndex(allApiCards)

  const drawCards = []
  const rampCards = []
  const discardRecoveryCards = []
  const scryCards = []

  for (const card of cards) {
    const api = byName.get(toSimpleName(card.name))
    if (!api) continue
    const role = classifyCardRole(api)
    const text = (
      api.fullText ||
      api.text ||
      (Array.isArray(api.abilities) ? api.abilities.map(a => a.fullText || a.effect || '').join(' ') : '')
    ).toLowerCase()

    if (role.isDraw) {
      // A fixed draw ("draw 2 cards") parses to a number; conditional or open-ended
      // draws ("draw cards until …", "draw a card for each …", "up to") have no fixed
      // count, so mark them variable rather than defaulting to 1.
      const numMatch = text.match(/draws? (\d+) cards?/)
      const isVariable = /draws? cards? until/.test(text)
        || /draws? .*for each/.test(text)
        || /draws? cards? equal to/.test(text)
        || /draws? up to/.test(text)
      let drawCount, variable = false
      if (numMatch) {
        drawCount = parseInt(numMatch[1])
      } else if (isVariable) {
        drawCount = null
        variable = true
      } else {
        drawCount = 1
      }
      drawCards.push({ name: card.name, copies: card.count, drawCount, variable })
    }
    if (role.isRamp) {
      rampCards.push({ name: card.name, copies: card.count })
    }
    if (role.isDiscardRecovery) {
      discardRecoveryCards.push({ name: card.name, copies: card.count })
    }
    if (role.isScry) {
      const lookMatch = text.match(/look at the top (\d+) cards?/)
      const lookCount = lookMatch ? parseInt(lookMatch[1]) : null
      scryCards.push({ name: card.name, copies: card.count, lookCount })
    }
  }

  const sortFn = (a, b) => b.copies - a.copies || a.name.localeCompare(b.name)
  drawCards.sort(sortFn)
  rampCards.sort(sortFn)
  discardRecoveryCards.sort(sortFn)
  scryCards.sort(sortFn)

  const totalDrawCopies = drawCards.reduce((s, c) => s + c.copies, 0)
  const totalRampCopies = rampCards.reduce((s, c) => s + c.copies, 0)
  const totalDiscardCopies = discardRecoveryCards.reduce((s, c) => s + c.copies, 0)
  const totalScryCopies = scryCards.reduce((s, c) => s + c.copies, 0)
  // Weighted draw potential: if every draw card were played once, how many extra cards?
  // Variable draws have no fixed count, so they're excluded from this floor estimate.
  const drawPotential = drawCards.reduce((s, c) => s + c.copies * (c.drawCount ?? 0), 0)
  const hasVariableDraw = drawCards.some(c => c.variable)

  if (totalDrawCopies === 0 && totalRampCopies === 0 && totalDiscardCopies === 0 && totalScryCopies === 0) return null
  return {
    drawCards, rampCards, discardRecoveryCards, scryCards,
    totalDrawCopies, totalRampCopies, totalDiscardCopies, totalScryCopies,
    drawPotential, hasVariableDraw,
  }
}

// --- Mulligan Advisor ---
// Infer a card's strategic role from its type and rules text. This is deterministic
// and necessarily rough — it reads card *function* (does it develop the board? is it
// reactive? does it draw/ramp?), not specific combos. It can tell that a song is a
// sing-it-later payoff rather than an opening play, but it can't know which cards
// combo together.
export function classifyCardRole(apiCard) {
  if (!apiCard) return {}
  const type = apiCard.type || ''
  const subtypes = apiCard.subtypes || apiCard.classifications || []
  const isSong = /song/i.test(type) || (Array.isArray(subtypes) && subtypes.some(s => /song/i.test(s)))
  const isCharacter = /character/i.test(type)
  const isLocation = /location/i.test(type)
  const isItem = /item/i.test(type)
  const text = (
    apiCard.fullText ||
    apiCard.text ||
    (Array.isArray(apiCard.abilities) ? apiCard.abilities.map(a => a.fullText || a.reminderText || a.text || '').join(' ') : '') ||
    ''
  ).toLowerCase()
  const isRemoval = /\bbanish\b/.test(text)
    || /deals? \d+ damage/.test(text)
    || /return[s]? .*(character|item|location|card).* to .*(hand|inkwell)/.test(text)
  const isDraw = /draws? (a card|\d+ cards?|cards)/.test(text)
  const isRamp = /into your inkwell/.test(text)
  // Cards that retrieve a card from the discard pile into hand or play.
  const isDiscardRecovery = /from (your |the )?discard/.test(text)
  // Cards that look at the top N cards and put one or more into hand (scry/tutor).
  const isScry = /look at the top \d+ cards?/.test(text) && /(put|place|add).{0,40}(into|in) (your )?hand/.test(text)
  return {
    isSong, isCharacter, isLocation, isItem,
    isRemoval, isDraw, isRamp, isDiscardRecovery, isScry,
    develops: isCharacter || isLocation,
  }
}

// Classifies each unique card into keep / flexible / toss tiers for the opening hand.
// Cost thresholds are derived from the deck's own curve (median cost) so the advice
// scales from aggro to control; card role then refines the tier so cheap-but-conditional
// cards (songs, removal, generic actions) aren't blindly kept just for being cheap.
export function buildMulliganAdvice(cards, costMap, inkwellMap, roleMap, medianCost, deckSize, shiftLineNames) {
  // Lowercase set of Shift cards whose base version is also in the deck — keeping
  // these in the opener enables a turn-cheaper Shift play, so they're worth holding
  // even when their printed cost would otherwise read as too slow.
  const shiftLine = shiftLineNames || new Set()
  // Keep cards you can deploy by the early turns; toss cards too slow to matter in the opener.
  const keepThreshold = Math.max(2, Math.min(3, medianCost))
  const tossThreshold = Math.max(5, medianCost + 2)
  const keep = [], flexible = [], toss = []
  for (const card of cards) {
    const key = toSimpleName(card.name)
    const cost = costMap.get(key)
    const inkable = inkwellMap.get(key)
    const role = roleMap.get(key) || {}
    if (cost == null) {
      flexible.push({ ...card, cost: null, inkable, reason: 'Not in database — judge by hand' })
      continue
    }
    let tier, reason
    if (role.isSong) {
      // Songs are paid by singing later; rarely a standalone opening play.
      if (cost <= 2) { tier = 'flexible'; reason = `${cost}-cost song — only if you can hard-cast it early` }
      else { tier = 'toss'; reason = `${cost}-cost song — sing it later with a character; a payoff, not an opener` }
    } else if (role.develops) {
      // Characters and locations are real board development — what you most want early.
      const kind = role.isLocation ? 'location' : 'character'
      if (cost <= keepThreshold) { tier = 'keep'; reason = `${cost}-cost ${kind} — early board presence` }
      else if (cost >= tossThreshold) { tier = 'toss'; reason = `${cost}-cost ${kind} — too slow to commit early` }
      else { tier = 'flexible'; reason = `${cost}-cost ${kind} — keep if your hand curves into it` }
    } else if (role.isDraw || role.isRamp) {
      // Card advantage / ink ramp smooths the opening hand.
      const kind = role.isRamp ? 'ramp' : 'draw'
      if (cost <= keepThreshold) { tier = 'keep'; reason = `${cost}-cost ${kind} — smooths your hand and ink` }
      else if (cost >= tossThreshold) { tier = 'toss'; reason = `${cost}-cost ${kind} — too slow for early smoothing` }
      else { tier = 'flexible'; reason = `${cost}-cost ${kind} — keep alongside an early play` }
    } else if (role.isRemoval) {
      // Reactive interaction — dead in hand without a target on the board.
      if (cost >= tossThreshold) { tier = 'toss'; reason = `${cost}-cost removal — slow and reactive` }
      else { tier = 'flexible'; reason = `${cost}-cost removal — reactive; keep only if you expect a target` }
    } else {
      // Generic actions / items: no immediate board presence, so never an auto-keep.
      const kind = role.isItem ? 'item' : 'action'
      if (cost <= keepThreshold) { tier = 'flexible'; reason = `${cost}-cost ${kind} — situational, no board presence` }
      else { tier = 'toss'; reason = `${cost}-cost ${kind} — slow with no board presence` }
    }
    // A Shift card with its base in the deck is part of a Shift line — a key win
    // condition you can deploy a turn early. Don't toss it; hold it as flexible.
    if (tier === 'toss' && shiftLine.has(key)) {
      tier = 'flexible'
      reason = `${cost}-cost Shift — part of a Shift line; hold to enable a cheaper play`
    }
    // Non-inkable cards can't fall back to being ink. Note it, and nudge non-developing
    // borderline cards further toward tossing.
    if (inkable === false) {
      reason += ' · non-inkable'
      if (tier === 'flexible' && !role.develops && !shiftLine.has(key) && cost > keepThreshold) tier = 'toss'
    }
    const entry = { ...card, cost, inkable, reason }
    if (tier === 'keep') keep.push(entry)
    else if (tier === 'toss') toss.push(entry)
    else flexible.push(entry)
  }
  const sortFn = (a, b) => (a.cost ?? 99) - (b.cost ?? 99) || a.name.localeCompare(b.name)
  keep.sort(sortFn); flexible.sort(sortFn); toss.sort(sortFn)
  const keepCopies = keep.reduce((s, c) => s + c.count, 0)
  // Odds your opening 7 contains the early plays you'd want to keep.
  const pAtLeast1 = drawOddsAtLeast(deckSize, keepCopies, 7, 1)
  const pAtLeast2 = drawOddsAtLeast(deckSize, keepCopies, 7, 2)
  return { keep, flexible, toss, keepThreshold, tossThreshold, keepCopies, pAtLeast1, pAtLeast2 }
}

// --- Legality helpers ---

export function setLabel(setCode) {
  const name = SET_NAMES[setCode]
  if (!name) return `Set ${setCode}`
  const num = parseInt(setCode)
  return isNaN(num) ? name : `${name} (Set ${setCode})`
}

export function toSimpleName(str) {
  return str
    .toLowerCase()
    .replace(/\s*[-‐-―]\s*/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildCardIndex(cards) {
  const bySimpleName = new Map()
  for (const card of cards) {
    const key = toSimpleName(card.fullName)
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

export function getLegality(card) {
  if (!card) return { core: null, infinity: null, rotationRisk: false }
  const formats = card.allowedInFormats ?? {}
  const coreAllowed = formats.Core?.allowed === true
  const infAllowed = formats.Infinity?.allowed === true
  const isBanned = !infAllowed && !!formats.Infinity?.bannedSinceDate
  const rotationRisk = coreAllowed && SHOW_ROTATION_WARNING && ROTATING_SETS.has(card.setCode)
  return { core: coreAllowed, infinity: infAllowed, banned: isBanned, rotationRisk }
}

