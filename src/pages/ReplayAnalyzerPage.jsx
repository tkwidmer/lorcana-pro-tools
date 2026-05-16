import { useState, useCallback } from 'react'

// --- Replay parsing ---

async function decompressGzip(arrayBuffer) {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(arrayBuffer)
  writer.close()
  const chunks = []
  const reader = ds.readable.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { out.set(c, offset); offset += c.length }
  return new TextDecoder().decode(out)
}

function resolveCardRefs(message, cardRefs = []) {
  return message.replace(/\{card:(\d+)\}/g, (_, i) => {
    const c = cardRefs[parseInt(i)]
    return c ? (c.fullName || c.name || '?') : '?'
  })
}

function buildCardLookup(data) {
  const map = {}
  function walk(obj) {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) { obj.forEach(walk); return }
    if ('id' in obj && 'cost' in obj && 'fullName' in obj) {
      map[obj.id] = {
        id: obj.id,
        name: obj.name,
        fullName: obj.fullName,
        cost: obj.cost,
        colors: obj.colors,
        type: obj.type,
        strength: obj.strength,
        willpower: obj.willpower,
        lore: obj.lore,
        inkable: obj.inkable,
        rarity: obj.rarity,
        imageSmallUrl: obj.imageSmallUrl,
      }
    }
    Object.values(obj).forEach(walk)
  }
  walk(data)
  return map
}

function parseReplay(data) {
  const logs = data.logs || []
  const perspective = data.perspective // 1 = you are player 1
  const myPlayerNum = perspective
  const cardLookup = buildCardLookup(data)

  const result = {
    gameId: data.gameId,
    createdAt: data.createdAt,
    playerNames: data.playerNames,
    myName: data.playerNames?.[String(myPlayerNum)] || 'You',
    opponentName: data.playerNames?.[String(myPlayerNum === 1 ? 2 : 1)] || 'Opponent',
    myPlayerNum,
    winner: data.winner,
    victoryReason: data.victoryReason,
    turnCount: data.turnCount,
    myCards: {},       // fullName -> { ...cardData, playedCount, questedCount, inkedCount, drawnCount }
    opponentCards: {}, // fullName -> { ...cardData, playCount, inkCount, discardCount, confirmedCopies }
    loreByTurn: [],    // { turn, myLore, oppLore }
    combatLog: [],
    challenges: [], // { turn, isMe, attackerName, defenderName, attackerBanished, defenderBanished }
    mulligan: {
      openingHand: [],      // enriched cards — the initial 7
      sentBack: [],         // enriched cards sent back
      kept: [],             // enriched cards kept
      replacements: [],     // enriched cards drawn as replacements
      tookMulligan: false,
      wentFirst: myPlayerNum === 1,
      matchFormat: data.baseSnapshot?.roomView?.matchFormat ?? null,
      gameNumber: data.baseSnapshot?.roomView?.gameNumber ?? null,
    },
    inkCurve: {},      // turn -> [cardNames played that turn]
    turnSummaries: {},
    inkByTurn: [],     // { turn, inked: bool } for my turns only
  }

  let myLore = 0
  let oppLore = 0
  let trackingMyTurn = false
  let currentTurnInked = false
  let currentTurn = null
  let currentController = null // 'me' | 'opp'
  let inPreGamePhase = true    // true until first TURN_START

  const enrich = (cardRef) => cardRef?.id ? { ...cardLookup[cardRef.id], ...cardRef } : cardRef

  const trackMyCard = (cardRef, field) => {
    if (!cardRef) return
    cardRef = enrich(cardRef)
    const key = cardRef.fullName || cardRef.name || cardRef.id
    if (!result.myCards[key]) {
      result.myCards[key] = {
        name: cardRef.name,
        fullName: cardRef.fullName || cardRef.name,
        id: cardRef.id,
        cost: cardRef.cost,
        inkable: cardRef.inkable,
        colors: cardRef.colors,
        type: cardRef.type,
        strength: cardRef.strength,
        willpower: cardRef.willpower,
        lore: cardRef.lore,
        abilities: cardRef.abilities,
        rarity: cardRef.rarity,
        imageSmallUrl: cardRef.imageSmallUrl,
        playedCount: 0, questedCount: 0, inkedCount: 0, drawnCount: 0, loreGained: 0,
        playedTurns: [],
      }
    }
    result.myCards[key][field]++
  }

  const trackOppCard = (cardRef, event) => {
    // event: 'played' | 'inked' | 'discarded' | 'combat'
    // Each 'played', 'inked', or 'discarded' event means a physical copy left the opponent's hand,
    // so we use them to count minimum confirmed copies. 'combat' just reveals identity, no copy count.
    if (!cardRef) return
    cardRef = enrich(cardRef)
    const key = cardRef.fullName || cardRef.name || cardRef.id
    if (!result.opponentCards[key]) {
      result.opponentCards[key] = {
        name: cardRef.name,
        fullName: cardRef.fullName || cardRef.name,
        id: cardRef.id,
        cost: cardRef.cost,
        inkable: cardRef.inkable,
        colors: cardRef.colors,
        type: cardRef.type,
        strength: cardRef.strength,
        willpower: cardRef.willpower,
        lore: cardRef.lore,
        abilities: cardRef.abilities,
        rarity: cardRef.rarity,
        imageSmallUrl: cardRef.imageSmallUrl,
        playCount: 0,
        inkCount: 0,
        discardCount: 0,
        seenInCombat: false,
      }
    }
    const c = result.opponentCards[key]
    if (event === 'played') c.playCount++
    else if (event === 'inked') c.inkCount++
    else if (event === 'discarded') c.discardCount++
    else if (event === 'combat') c.seenInCombat = true
    // confirmedCopies = distinct from-hand events, capped at 4
    c.confirmedCopies = Math.min(4, c.playCount + c.inkCount + c.discardCount) || 1
  }

  for (const log of logs) {
    const { type, player, turnNumber, cardRefs = [], data: ld = {}, message = '' } = log
    const isMe = player === myPlayerNum
    const isOpp = player !== null && player !== myPlayerNum

    if (turnNumber !== currentTurn) {
      currentTurn = turnNumber
      if (!result.turnSummaries[turnNumber]) {
        result.turnSummaries[turnNumber] = { played: [], quested: [], inked: [], challenges: [] }
      }
    }

    switch (type) {
      case 'INITIAL_HAND':
        if (isMe) result.mulligan.openingHand = cardRefs.map(c => enrich(c))
        break

      case 'MULLIGAN':
        if (isMe) {
          // cardRefs = [sent back cards..., replacement draws...]
          // data.mulliganCount tells us the split point
          const count = ld.mulliganCount ?? cardRefs.length
          const sentBack = cardRefs.slice(0, count).map(c => enrich(c))
          const replacements = cardRefs.slice(count).map(c => enrich(c))
          const sentBackIds = new Set(sentBack.map(c => c.id))
          result.mulligan.sentBack = sentBack
          result.mulligan.replacements = replacements
          result.mulligan.kept = result.mulligan.openingHand.filter(c => !sentBackIds.has(c.id))
          result.mulligan.tookMulligan = count > 0
        }
        break

      case 'TURN_START':
        inPreGamePhase = false
        currentController = isMe ? 'me' : 'opp'
        if (isMe) { trackingMyTurn = true; currentTurnInked = false }
        break

      case 'CARD_PLAYED':
        if (isMe) {
          cardRefs.forEach(c => {
            trackMyCard(c, 'playedCount')
            result.myCards[c.fullName || c.name || c.id].playedTurns.push(turnNumber)
          })
          const played = cardRefs.map(c => c.fullName || c.name)
          if (!result.inkCurve[turnNumber]) result.inkCurve[turnNumber] = []
          result.inkCurve[turnNumber].push(...played)
          result.turnSummaries[turnNumber].played.push(...played)
        } else if (isOpp) {
          cardRefs.forEach(c => trackOppCard(c, 'played'))
          result.turnSummaries[turnNumber].played.push(...cardRefs.map(c => `[OPP] ${c.fullName || c.name}`))
        }
        break

      case 'CARD_INKED':
        if (isMe) { cardRefs.forEach(c => trackMyCard(c, 'inkedCount')); currentTurnInked = true }
        else if (isOpp) cardRefs.forEach(c => trackOppCard(c, 'inked'))
        break

      case 'CARD_DRAWN':
        if (isMe && !inPreGamePhase) cardRefs.forEach(c => trackMyCard(c, 'drawnCount'))
        break

      case 'CARD_DISCARDED':
        // Discards reveal opponent cards
        if (isOpp) cardRefs.forEach(c => trackOppCard(c, 'discarded'))
        break

      case 'CARD_QUEST': {
        // lore is tracked in the message: (+N lore, M total)
        const loreMatch = message.match(/\+(\d+) lore.*?(\d+) total/)
        const gain = loreMatch ? parseInt(loreMatch[1]) : 0
        const total = loreMatch ? parseInt(loreMatch[2]) : null
        if (isMe) {
          if (total !== null) myLore = total
          cardRefs.forEach(c => {
            trackMyCard(c, 'questedCount')
            const key = enrich(c).fullName || c.name || c.id
            if (result.myCards[key]) result.myCards[key].loreGained += gain
          })
          result.turnSummaries[turnNumber].quested.push(cardRefs[0]?.fullName || cardRefs[0]?.name || '?')
        } else {
          if (total !== null) oppLore = total
          // opponent questing with unnamed cards — not revealing info
        }
        break
      }

      case 'CARD_ATTACK': {
        // Only log the detailed damage line (contains '|')
        if (!message.includes('|')) break
        const dmgMatch = message.match(/(\d+) str dealt (\d+) dmg/)
        result.combatLog.push({
          turn: turnNumber,
          isMe,
          message: resolveCardRefs(message.split('|')[0].trim(), cardRefs),
          damage: dmgMatch ? parseInt(dmgMatch[2]) : null,
          attacker: cardRefs[0] ? (cardRefs[0].fullName || cardRefs[0].name) : null,
          defender: cardRefs[1] ? (cardRefs[1].fullName || cardRefs[1].name) : null,
        })
        if (ld.attackerBanished !== undefined) {
          result.challenges.push({
            turn: turnNumber,
            isMe,
            attackerName: cardRefs[0] ? (cardRefs[0].fullName || cardRefs[0].name) : null,
            defenderName: cardRefs[1] ? (cardRefs[1].fullName || cardRefs[1].name) : null,
            attackerBanished: ld.attackerBanished,
            defenderBanished: ld.defenderBanished,
          })
        }
        if (isOpp && cardRefs[0]) trackOppCard(cardRefs[0], 'combat')
        break
      }

      case 'TURN_END':
        if (currentController === 'me') {
          result.loreByTurn.push({ turn: currentTurn, myLore, oppLore, controller: 'me' })
          if (trackingMyTurn) {
            result.inkByTurn.push({ turn: currentTurn, inked: currentTurnInked })
            trackingMyTurn = false
          }
        } else if (currentController === 'opp') {
          result.loreByTurn.push({ turn: currentTurn, myLore, oppLore, controller: 'opp' })
        }
        break

      default:
        break
    }
  }

  // Compute combat stats from challenges
  const myChallenges = result.challenges.filter(c => c.isMe)
  const survived = myChallenges.filter(c => !c.attackerBanished).length
  const trades = myChallenges.filter(c => c.attackerBanished && c.defenderBanished).length

  // Double challenge: same opponent card targeted 2+ times by me in one turn
  const defenderHits = {}
  for (const c of myChallenges) {
    const key = `${c.turn}::${c.defenderName}`
    defenderHits[key] = (defenderHits[key] ?? 0) + 1
  }
  const doubleChallenge = Object.values(defenderHits).filter(n => n >= 2).length

  // 2-for-1: in a single turn, I lost 2+ characters from my own challenges while banishing ≤1 of theirs
  const myTurns = [...new Set(myChallenges.map(c => c.turn))]
  let twoForOne = 0
  for (const turn of myTurns) {
    const t = myChallenges.filter(c => c.turn === turn)
    const myLost = t.filter(c => c.attackerBanished).length
    const oppLost = t.filter(c => c.defenderBanished).length
    if (myLost >= 2 && oppLost <= 1) twoForOne++
  }

  result.combatStats = { challenged: myChallenges.length, survived, trades, doubleChallenge, twoForOne }

  // Build deck reconstruction: confirmed cards + unknown slots to reach 60
  const confirmedCards = Object.values(result.opponentCards)
    .sort((a, b) => (a.cost ?? 99) - (b.cost ?? 99) || a.fullName.localeCompare(b.fullName))
  const confirmedTotal = confirmedCards.reduce((n, c) => n + c.confirmedCopies, 0)
  result.oppDeckList = {
    confirmed: confirmedCards,
    unknownCount: Math.max(0, 60 - confirmedTotal),
    confirmedTotal,
  }

  // Derive ink combos
  const deckIds = data.baseSnapshot?.roomView?.mySetup?.deckCardIds ?? []
  const myColorSet = new Set()
  for (const id of deckIds) {
    cardLookup[id]?.colors?.forEach(c => myColorSet.add(c))
  }
  // Fallback: derive from cards seen in game
  if (myColorSet.size === 0) {
    Object.values(result.myCards).forEach(c => c.colors?.forEach(col => myColorSet.add(col)))
  }
  result.myInkCombo = [...myColorSet].sort()

  const oppColorSet = new Set()
  Object.values(result.opponentCards).forEach(c => c.colors?.forEach(col => oppColorSet.add(col)))
  result.oppInkCombo = [...oppColorSet].sort()

  return result
}

// --- UI helpers ---

const COLOR_BADGE = {
  amber: 'bg-amber-100 text-amber-800',
  amethyst: 'bg-purple-100 text-purple-800',
  emerald: 'bg-emerald-100 text-emerald-800',
  ruby: 'bg-red-100 text-red-800',
  sapphire: 'bg-blue-100 text-blue-800',
  steel: 'bg-gray-200 text-gray-700',
}

function ColorBadge({ color }) {
  const cls = COLOR_BADGE[color?.toLowerCase()] || 'bg-gray-100 text-gray-600'
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded capitalize ${cls}`}>
      {color}
    </span>
  )
}

function StatPill({ label, value }) {
  return (
    <span className="inline-flex items-center gap-1 bg-gray-100 rounded px-2 py-0.5 text-xs text-gray-600">
      <span className="font-medium text-gray-800">{value}</span> {label}
    </span>
  )
}

const SOURCE_LABEL = {
  played: { label: 'played', cls: 'bg-blue-100 text-blue-700' },
  inked: { label: 'inked', cls: 'bg-yellow-100 text-yellow-700' },
  discarded: { label: 'discarded', cls: 'bg-orange-100 text-orange-700' },
  combat: { label: 'combat', cls: 'bg-red-100 text-red-700' },
}

function CardRow({ card, fields, sources }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
      {card.imageSmallUrl && (
        <img
          src={card.imageSmallUrl}
          alt={card.fullName}
          className="w-10 h-14 rounded object-cover flex-shrink-0 border border-gray-200"
          loading="lazy"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          <span className="text-sm font-semibold text-gray-900 truncate">{card.fullName}</span>
          {card.colors?.map(c => <ColorBadge key={c} color={c} />)}
          {card.rarity && (
            <span className="text-xs text-gray-400 capitalize">{card.rarity}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs text-gray-500 mb-1">
          {card.cost != null && <span>Cost {card.cost}</span>}
          {card.strength != null && <span>STR {card.strength}</span>}
          {card.willpower != null && <span>WP {card.willpower}</span>}
          {card.lore != null && <span>◆{card.lore}</span>}
          {card.inkable === false && <span className="text-orange-600 font-medium">Uninkable</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {fields.map(f => f.value != null && f.value > 0
            ? <StatPill key={f.label} label={f.label} value={f.value} />
            : null
          )}
          {sources?.map(s => {
            const cfg = SOURCE_LABEL[s]
            return cfg
              ? <span key={s} className={`text-xs px-1.5 py-0.5 rounded font-medium ${cfg.cls}`}>{cfg.label}</span>
              : null
          })}
        </div>
      </div>
    </div>
  )
}

function Section({ title, subtitle, children, collapsible, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!collapsible) {
    return (
      <div className="mb-8">
        <div className="mb-3">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {children}
      </div>
    )
  }
  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
      >
        <div className="text-left">
          <span className="text-base font-bold text-gray-800 group-hover:text-gray-900 transition-colors">{title}</span>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-4 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  )
}

function GameHeader({ game }) {
  const date = new Date(game.createdAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
  const didWin = game.winner === game.myPlayerNum
  return (
    <div className={`rounded-lg border p-4 mb-6 ${didWin ? 'border-emerald-300 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className={`text-sm font-bold ${didWin ? 'text-emerald-700' : 'text-red-600'}`}>
            {didWin ? '✓ Victory' : '✗ Defeat'} — {game.victoryReason}
          </span>
          <p className="text-xs text-gray-500 mt-0.5">
            {game.myName} vs {game.opponentName} · {game.turnCount} turns · {date}
          </p>
        </div>
        <span className="text-xs font-mono text-gray-400">{game.gameId?.slice(0, 8)}</span>
      </div>
    </div>
  )
}

function LoreBar({ value, maxLore, colorClass, label }) {
  const pct = maxLore > 0 ? value / maxLore : 0
  const heightPx = Math.round(pct * 96)
  return (
    <div className="flex flex-col items-center" style={{ width: 24 }}>
      <span className="text-[10px] font-medium text-gray-600 mb-0.5 leading-none">
        {value > 0 ? value : ''}
      </span>
      <div
        className={`w-5 rounded-t transition-all ${colorClass}`}
        style={{ height: `${heightPx}px` }}
        title={`${label}: ${value} lore`}
      />
    </div>
  )
}

function LoreChart({ loreByTurn, myName, oppName }) {
  if (!loreByTurn.length) return null
  const maxLore = Math.max(...loreByTurn.flatMap(t => [t.myLore, t.oppLore]), 1)
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-2 min-w-max pb-1">
        {loreByTurn.map((t, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="flex items-end gap-0.5 h-32">
              <LoreBar value={t.myLore} maxLore={maxLore} colorClass="bg-blue-400" label={myName} />
              <LoreBar value={t.oppLore} maxLore={maxLore} colorClass="bg-red-400" label={oppName} />
            </div>
            <span className="text-[10px] text-gray-400">T{t.turn}{t.controller === 'me' ? '' : '★'}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-400 rounded-sm inline-block" /> {myName}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-sm inline-block" /> {oppName}</span>
        <span className="text-gray-400">★ = opponent's turn</span>
      </div>
    </div>
  )
}

const HOW_LABEL = {
  playCount: 'played',
  inkCount: 'inked',
  discardCount: 'discarded',
}

function OppDeckList({ confirmed, unknownCount }) {
  if (confirmed.length === 0 && unknownCount > 0) {
    return <p className="text-sm text-gray-400">No opponent cards recorded.</p>
  }
  return (
    <div className="font-mono text-sm space-y-0.5">
      {confirmed.map(c => {
        const how = Object.entries(HOW_LABEL)
          .filter(([field]) => c[field] > 0)
          .map(([, label]) => label)
          .join(', ')
        return (
          <div key={c.fullName} className="flex items-baseline gap-3 py-1 border-b border-gray-100 last:border-0 group">
            <span className="w-5 text-right font-bold text-gray-900 flex-shrink-0">{c.confirmedCopies}x</span>
            <span className="flex-1 text-gray-800 group-hover:text-gray-900">{c.fullName}</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {c.colors?.map(col => <ColorBadge key={col} color={col} />)}
              {c.cost != null && <span className="text-xs text-gray-400">Cost {c.cost}</span>}
              {how && <span className="text-xs text-gray-400 italic">via {how}</span>}
            </div>
          </div>
        )
      })}
      {unknownCount > 0 && (
        <div className="flex items-baseline gap-3 py-1 mt-1 border-t-2 border-dashed border-gray-200">
          <span className="w-5 text-right font-bold text-gray-400 flex-shrink-0">{unknownCount}x</span>
          <span className="flex-1 text-gray-400 italic">Unknown Cards</span>
        </div>
      )}
    </div>
  )
}

function MyDeckList({ cards }) {
  if (cards.length === 0) return <p className="text-sm text-gray-400">No cards recorded.</p>
  return (
    <div className="font-mono text-sm space-y-0.5">
      {cards.map(c => {
        const uses = c.playedCount + c.inkedCount
        const tags = []
        if (c.playedCount > 0) tags.push(`${c.playedCount}× played`)
        if (c.inkedCount > 0) tags.push(`${c.inkedCount}× inked`)
        return (
          <div key={c.fullName} className="flex items-baseline gap-3 py-1 border-b border-gray-100 last:border-0 group">
            <span className="w-5 text-right font-bold text-gray-900 flex-shrink-0">{uses > 0 ? uses : '—'}</span>
            <span className="flex-1 text-gray-800 group-hover:text-gray-900">{c.fullName}</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {c.colors?.map(col => <ColorBadge key={col} color={col} />)}
              {c.cost != null && <span className="text-xs text-gray-400">Cost {c.cost}</span>}
              {tags.length > 0 && <span className="text-xs text-gray-400 italic">{tags.join(', ')}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MiniCard({ card }) {
  const colorCls = card.colors?.[0] ? (COLOR_BADGE[card.colors[0].toLowerCase()] || 'bg-gray-100 text-gray-600') : 'bg-gray-100 text-gray-600'
  return (
    <div className="flex flex-col items-center gap-1 w-20 flex-shrink-0">
      {card.imageSmallUrl
        ? (
          <img
            src={card.imageSmallUrl}
            alt={card.fullName}
            className="w-14 h-20 rounded object-cover border border-gray-200"
            loading="lazy"
          />
        )
        : (
          <div className={`w-14 h-20 rounded border border-gray-200 flex items-center justify-center text-xs text-center font-medium px-1 ${colorCls}`}>
            {card.fullName || card.name || '?'}
          </div>
        )
      }
      <span className="text-[10px] text-gray-500 text-center leading-tight line-clamp-2">{card.fullName || card.name}</span>
      {card.cost != null && (
        <span className="text-[10px] font-bold text-gray-400">Cost {card.cost}</span>
      )}
    </div>
  )
}

function MulliganGroup({ label, cards, accent }) {
  if (!cards.length) return null
  return (
    <div>
      <div className={`text-xs font-semibold uppercase tracking-wide mb-2 ${accent}`}>{label} ({cards.length})</div>
      <div className="flex flex-wrap gap-3">
        {cards.map((c, i) => <MiniCard key={`${c.id}-${i}`} card={c} />)}
      </div>
    </div>
  )
}

function MulliganAnalysis({ mulligan }) {
  if (!mulligan) return null
  const { openingHand = [], sentBack = [], kept = [], replacements = [], tookMulligan = false, wentFirst, matchFormat, gameNumber } = mulligan
  if (!openingHand.length) return null

  const formatLabel = matchFormat === 'bo3' ? `Best of 3${gameNumber ? ` · Game ${gameNumber}` : ''}` : matchFormat === 'bo1' ? 'Best of 1' : null
  const orderLabel = wentFirst ? 'Going First' : 'Going Second'
  const contextParts = [orderLabel, formatLabel].filter(Boolean)
  const mulliganSubtitle = [
    contextParts.join(' · '),
    tookMulligan ? `Sent back ${sentBack.length}, kept ${kept.length}, drew ${replacements.length}` : 'Kept opening hand',
  ].filter(Boolean).join(' — ')

  return (
    <Section collapsible title="Mulligan" subtitle={mulliganSubtitle}>
      <div className="flex flex-wrap gap-2 mb-4">
        <span className={`text-xs font-semibold px-2 py-1 rounded ${wentFirst ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
          {orderLabel}
        </span>
        {formatLabel && (
          <span className="text-xs font-semibold px-2 py-1 rounded bg-gray-100 text-gray-600">{formatLabel}</span>
        )}
      </div>
      {tookMulligan ? (
        <div className="space-y-5">
          <MulliganGroup label="Opening Hand" cards={openingHand} accent="text-gray-500" />
          <div className="border-t border-gray-100 pt-4 space-y-5">
            <MulliganGroup label="Sent Back" cards={sentBack} accent="text-red-500" />
            {kept.length > 0 && <MulliganGroup label="Kept" cards={kept} accent="text-emerald-600" />}
          </div>
          <div className="border-t border-gray-100 pt-4">
            <MulliganGroup label="Drew as Replacements" cards={replacements} accent="text-blue-500" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <MulliganGroup label="Opening Hand — Kept" cards={openingHand} accent="text-emerald-600" />
        </div>
      )}
    </Section>
  )
}

const EARLY_TURNS = 4

function InkDiscipline({ inkByTurn }) {
  if (!inkByTurn?.length) return null

  const earlyMisses = inkByTurn.filter(t => t.turn <= EARLY_TURNS && !t.inked)
  const lateMisses = inkByTurn.filter(t => t.turn > EARLY_TURNS && !t.inked)

  return (
    <div className="mb-6">
      <h2 className="text-base font-bold text-gray-900 mb-2">Ink Discipline</h2>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {inkByTurn.map(({ turn, inked }) => {
          const isEarly = turn <= EARLY_TURNS
          const cls = inked
            ? 'bg-gray-100 text-gray-500'
            : isEarly
              ? 'bg-red-100 text-red-700 font-semibold'
              : 'bg-yellow-50 text-yellow-600'
          return (
            <span key={turn} className={`text-xs px-2 py-1 rounded ${cls}`} title={inked ? `T${turn}: inked` : `T${turn}: skipped`}>
              T{turn} {inked ? '✓' : '✗'}
            </span>
          )
        })}
      </div>
      {earlyMisses.length === 0 && lateMisses.length === 0 && (
        <p className="text-xs text-gray-500">Inked every turn — great ink discipline.</p>
      )}
      {earlyMisses.length > 0 && (
        <p className="text-xs text-red-600">
          Missed early ink on {earlyMisses.map(t => `T${t.turn}`).join(', ')} — these are high-cost tempo misses.
        </p>
      )}
      {lateMisses.length > 0 && (
        <p className="text-xs text-gray-500 mt-0.5">
          Held ink on {lateMisses.map(t => `T${t.turn}`).join(', ')} (late game — likely intentional).
        </p>
      )}
    </div>
  )
}

function BestChallengers({ challenges, myCards }) {
  if (!challenges?.length) return null
  const mine = challenges.filter(c => c.isMe)
  if (!mine.length) return null

  const map = {}
  for (const c of mine) {
    const key = c.attackerName
    if (!key) continue
    if (!map[key]) map[key] = { name: key, challenged: 0, survived: 0, traded: 0, banishedNoKill: 0 }
    map[key].challenged++
    if (!c.attackerBanished) map[key].survived++
    else if (c.defenderBanished) map[key].traded++
    else map[key].banishedNoKill++
  }

  const rows = Object.values(map).sort((a, b) => b.challenged - a.challenged)

  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Your Challengers</h3>
      <div className="text-sm">
        <div className="grid text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 gap-2" style={{ gridTemplateColumns: '1fr 3rem 3rem 3rem 3rem' }}>
          <span>Character</span>
          <span className="text-center">Total</span>
          <span className="text-center text-emerald-600">Survived</span>
          <span className="text-center text-yellow-600">Traded</span>
          <span className="text-center text-red-500">No kill</span>
        </div>
        {rows.map(r => (
          <div key={r.name} className="grid items-center gap-2 py-1.5 border-b border-gray-100 last:border-0" style={{ gridTemplateColumns: '1fr 3rem 3rem 3rem 3rem' }}>
            <span className="text-gray-800 truncate">{r.name}</span>
            <span className="text-center font-bold text-gray-700">{r.challenged}</span>
            <span className="text-center font-semibold text-emerald-600">{r.survived || '—'}</span>
            <span className="text-center font-semibold text-yellow-600">{r.traded || '—'}</span>
            <span className="text-center font-semibold text-red-500">{r.banishedNoKill || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BestDefenders({ challenges }) {
  if (!challenges?.length) return null
  const oppChallenges = challenges.filter(c => !c.isMe)
  if (!oppChallenges.length) return null

  // Group opponent challenges by defender (my character being attacked)
  const map = {}
  for (const c of oppChallenges) {
    const key = c.defenderName
    if (!key) continue
    if (!map[key]) map[key] = { name: key, seq: [] }
    map[key].seq.push(c)
  }

  const rows = Object.values(map).map(({ name, seq }) => {
    // Walk the sequence: reset hit counter each time a banishment occurs
    let hits = 0
    let tanked = 0      // survived individual hits without being banished
    let killedInOne = 0
    let killedMultiple = 0

    for (const c of seq) {
      hits++
      if (c.defenderBanished) {
        if (hits === 1) killedInOne++
        else killedMultiple++
        hits = 0
      } else {
        tanked++
      }
    }

    return { name, timesTargeted: seq.length, tanked, killedInOne, killedMultiple }
  }).sort((a, b) => b.timesTargeted - a.timesTargeted)

  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Your Characters as Defenders</h3>
      <div className="text-sm">
        <div className="grid text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 gap-2" style={{ gridTemplateColumns: '1fr 3rem 3rem 3rem 3rem' }}>
          <span>Character</span>
          <span className="text-center">Targeted</span>
          <span className="text-center text-emerald-600">Tanked</span>
          <span className="text-center text-yellow-600">1-shot</span>
          <span className="text-center text-red-500">Multi</span>
        </div>
        {rows.map(r => (
          <div key={r.name} className="grid items-center gap-2 py-1.5 border-b border-gray-100 last:border-0" style={{ gridTemplateColumns: '1fr 3rem 3rem 3rem 3rem' }}>
            <span className="text-gray-800 truncate">{r.name}</span>
            <span className="text-center font-bold text-gray-700">{r.timesTargeted}</span>
            <span className="text-center font-semibold text-emerald-600">{r.tanked || '—'}</span>
            <span className="text-center font-semibold text-yellow-600">{r.killedInOne || '—'}</span>
            <span className="text-center font-semibold text-red-500">{r.killedMultiple || '—'}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-1.5">Tanked = survived a hit · 1-shot = banished in one challenge · Multi = required 2+ challenges</p>
    </div>
  )
}

function CombatStats({ stats }) {
  if (!stats || stats.challenged === 0) return null
  const rows = [
    {
      label: 'Challenged and survived',
      value: stats.survived,
      sub: `${stats.challenged} total challenges`,
      color: 'text-emerald-600',
    },
    {
      label: 'Challenged and traded',
      value: stats.trades,
      sub: 'both characters banished',
      color: 'text-yellow-600',
    },
    {
      label: 'Double-challenged one character',
      value: stats.doubleChallenge,
      sub: 'needed 2 attackers to finish one',
      color: 'text-orange-500',
    },
    {
      label: "2-for-1'd yourself",
      value: stats.twoForOne,
      sub: 'lost 2+ characters, banished ≤1',
      color: 'text-red-600',
    },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
      {rows.map(r => (
        <div key={r.label} className="border border-gray-100 rounded-lg p-3">
          <div className={`text-2xl font-bold mb-0.5 ${r.color}`}>{r.value}</div>
          <div className="text-xs font-medium text-gray-700 leading-tight mb-1">{r.label}</div>
          <div className="text-[10px] text-gray-400">{r.sub}</div>
        </div>
      ))}
    </div>
  )
}

function ReplayAnalysis({ game }) {
  const myCardList = Object.values(game.myCards).sort((a, b) => (a.cost ?? 99) - (b.cost ?? 99))
  const { confirmed, unknownCount, confirmedTotal } = game.oppDeckList

  return (
    <div>
      <GameHeader game={game} />

      <InkDiscipline inkByTurn={game.inkByTurn} />

      <Section title="Lore Race" subtitle="Lore totals at end of each half-turn">
        <LoreChart loreByTurn={game.loreByTurn} myName={game.myName} oppName={game.opponentName} />
      </Section>

      <MulliganAnalysis mulligan={game.mulligan} />

      <DeckStats games={[game]} subtitle="This game" />

      <Section collapsible title="Your Deck" subtitle="Cards seen this game, sorted by cost. Count = times played or inked.">
        <MyDeckList cards={myCardList} />
      </Section>

      <Section
        collapsible
        title="Opponent Decklist"
        subtitle={`${confirmedTotal} of 60 cards identified · ${unknownCount} unknown`}
      >
        <OppDeckList confirmed={confirmed} unknownCount={unknownCount} />
      </Section>

      {(game.combatLog.length > 0 || game.combatStats?.challenged > 0) && (
        <Section collapsible title="Combat Log">
          <CombatStats stats={game.combatStats} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4 mb-2">
            <BestChallengers challenges={game.challenges} />
            <BestDefenders challenges={game.challenges} />
          </div>
          <div className="space-y-1 mt-3">
            {game.combatLog.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-xs text-gray-400 w-12 flex-shrink-0 pt-0.5">T{e.turn}</span>
                <span className={e.isMe ? 'text-blue-700' : 'text-red-700'}>
                  {e.isMe ? game.myName : game.opponentName}
                </span>
                <span className="text-gray-600 flex-1">{e.message}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

// --- Win rate stats ---

const COLOR_DOT = {
  amber: 'bg-amber-400',
  amethyst: 'bg-purple-500',
  emerald: 'bg-emerald-500',
  ruby: 'bg-red-500',
  sapphire: 'bg-blue-500',
  steel: 'bg-gray-400',
}

function InkDrop({ color, size = 16 }) {
  const c = color?.toLowerCase()
  if (!c) return null
  return (
    <img
      src={`/ink/${c}.png`}
      alt={c}
      title={c.charAt(0).toUpperCase() + c.slice(1)}
      width={size}
      height={size}
      className="inline-block flex-shrink-0"
    />
  )
}

function InkCombo({ colors, size = 16, showLabel = false }) {
  if (!colors?.length) return null
  const label = colors.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(' / ')
  return (
    <span className="inline-flex items-center gap-0.5" title={label}>
      {colors.map(c => <InkDrop key={c} color={c} size={size} />)}
      {showLabel && <span className="text-xs text-gray-500 ml-1">{label}</span>}
    </span>
  )
}

function WinRateRow({ label, wins, losses }) {
  const total = wins + losses
  const pct = total > 0 ? Math.round((wins / total) * 100) : null
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-gray-100 last:border-0">
      <span className="flex-1 text-sm text-gray-700">{label}</span>
      <span className="text-sm font-bold text-gray-900 w-12 text-right">
        {wins}–{losses}
      </span>
      {pct !== null && (
        <span className={`text-xs font-semibold w-10 text-right ${pct >= 50 ? 'text-emerald-600' : 'text-red-500'}`}>
          {pct}%
        </span>
      )}
    </div>
  )
}

function WinRateStats({ games }) {
  if (games.length === 0) return null

  const tally = (subset) => {
    const wins = subset.filter(g => g.winner === g.myPlayerNum).length
    return { wins, losses: subset.length - wins }
  }

  const first = games.filter(g => g.mulligan?.wentFirst)
  const second = games.filter(g => !g.mulligan?.wentFirst)

  // Group by opponent ink combo
  const byOppInk = {}
  for (const g of games) {
    const key = g.oppInkCombo?.join('/') || 'Unknown'
    if (!byOppInk[key]) byOppInk[key] = { colors: g.oppInkCombo ?? [], games: [] }
    byOppInk[key].games.push(g)
  }

  return (
    <Section collapsible title="Win Rate" subtitle={`${games.length} game${games.length !== 1 ? 's' : ''} recorded`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Overall</h3>
          <WinRateRow label="All games" {...tally(games)} />
          <WinRateRow label="Going first" {...tally(first)} />
          <WinRateRow label="Going second" {...tally(second)} />
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">vs Opponent Ink</h3>
          {Object.entries(byOppInk).map(([key, { colors, games: subset }]) => (
            <WinRateRow
              key={key}
              label={colors.length ? <InkCombo colors={colors} size={14} showLabel /> : 'Unknown'}
              {...tally(subset)}
            />
          ))}
        </div>
      </div>
    </Section>
  )
}

// --- Cross-game deck stats ---

function aggregateMulliganSentBack(games) {
  const map = {}
  for (const game of games) {
    const openingHand = game.mulligan?.openingHand ?? []
    const sentBack = game.mulligan?.sentBack ?? []

    // Count copies in hand and sent back per card
    const handCounts = {}
    for (const card of openingHand) {
      const key = card.fullName || card.name
      handCounts[key] = { card, count: (handCounts[key]?.count ?? 0) + 1 }
    }
    const sentBackCounts = {}
    for (const card of sentBack) {
      const key = card.fullName || card.name
      sentBackCounts[key] = (sentBackCounts[key] ?? 0) + 1
    }

    for (const [key, { card, count: inHand }] of Object.entries(handCounts)) {
      if (!map[key]) map[key] = { ...card, sentBackCount: 0, openingHandCount: 0 }
      map[key].openingHandCount++
      // Only counts as a deliberate send-back if zero copies were kept
      if ((sentBackCounts[key] ?? 0) >= inHand) map[key].sentBackCount++
    }
  }
  return Object.values(map)
}

function aggregateMyCards(games) {
  const map = {}
  for (const game of games) {
    for (const card of Object.values(game.myCards)) {
      const key = card.fullName
      if (!map[key]) {
        map[key] = { ...card, playedCount: 0, inkedCount: 0, questedCount: 0, loreGained: 0, games: 0 }
      }
      map[key].playedCount += card.playedCount
      map[key].inkedCount += card.inkedCount
      map[key].questedCount += card.questedCount
      map[key].loreGained += card.loreGained
      if (card.playedCount > 0 || card.inkedCount > 0) map[key].games++
    }
  }
  return Object.values(map)
}

function StatTable({ rows, valueKey, emptyText }) {
  if (!rows.length) return <p className="text-sm text-gray-400">{emptyText}</p>
  return (
    <div className="font-mono text-sm space-y-0.5">
      {rows.map(c => (
        <div key={c.fullName} className="flex items-center gap-2 py-1 border-b border-gray-100 last:border-0">
          <span className="font-bold text-gray-900 w-8 text-right flex-shrink-0">{c[valueKey]}</span>
          <span className="flex-1 text-gray-700 truncate">{c.fullName}</span>
          <InkCombo colors={c.colors} size={12} />
        </div>
      ))}
    </div>
  )
}

function aggregateCardWinRates(games) {
  const map = {}
  for (const game of games) {
    const won = game.winner === game.myPlayerNum
    for (const card of Object.values(game.myCards)) {
      if (card.playedCount === 0 && card.inkedCount === 0) continue
      const key = card.fullName
      if (!map[key]) map[key] = { ...card, wins: 0, losses: 0 }
      if (won) map[key].wins++
      else map[key].losses++
    }
  }
  return Object.values(map)
}

function CardWinRateTable({ games }) {
  const [minGames, setMinGames] = useState(2)
  const cards = aggregateCardWinRates(games)
  const filtered = cards
    .filter(c => c.wins + c.losses >= minGames)
    .sort((a, b) => {
      const pctA = a.wins / (a.wins + a.losses)
      const pctB = b.wins / (b.wins + b.losses)
      return pctB - pctA || (b.wins + b.losses) - (a.wins + a.losses)
    })

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Card Win Rate</h3>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">Min appearances:</span>
          {[2, 3, 5].map(n => (
            <button
              key={n}
              onClick={() => setMinGames(n)}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                minGames === n ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-gray-500 hover:border-gray-500'
              }`}
            >{n}+</button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400">Not enough data — upload more replays.</p>
      ) : (
        <div className="text-sm">
          <div className="grid text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 gap-2" style={{ gridTemplateColumns: '1fr 2.5rem 2.5rem 2.5rem 5rem' }}>
            <span>Card</span>
            <span className="text-center">W</span>
            <span className="text-center">L</span>
            <span className="text-right">Win%</span>
            <span></span>
          </div>
          {filtered.map(c => {
            const total = c.wins + c.losses
            const pct = Math.round((c.wins / total) * 100)
            return (
              <div key={c.fullName} className="grid items-center gap-2 py-1.5 border-b border-gray-100 last:border-0" style={{ gridTemplateColumns: '1fr 2.5rem 2.5rem 2.5rem 5rem' }}>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-gray-800 truncate">{c.fullName}</span>
                  <InkCombo colors={c.colors} size={11} />
                </div>
                <span className="text-center font-semibold text-emerald-600">{c.wins}</span>
                <span className="text-center font-semibold text-red-400">{c.losses}</span>
                <span className={`text-right font-bold text-xs ${pct >= 70 ? 'text-emerald-600' : pct >= 50 ? 'text-gray-700' : 'text-red-500'}`}>{pct}%</span>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 70 ? 'bg-emerald-400' : pct >= 50 ? 'bg-gray-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CrossGameChallengers({ games }) {
  const allChallenges = games.flatMap(g => g.challenges ?? [])
  const mine = allChallenges.filter(c => c.isMe)
  if (!mine.length) return null

  const map = {}
  for (const c of mine) {
    const key = c.attackerName
    if (!key) continue
    if (!map[key]) map[key] = { name: key, challenged: 0, survived: 0, traded: 0, banishedNoKill: 0 }
    map[key].challenged++
    if (!c.attackerBanished) map[key].survived++
    else if (c.defenderBanished) map[key].traded++
    else map[key].banishedNoKill++
  }

  const rows = Object.values(map)
    .filter(r => r.challenged >= 2)
    .sort((a, b) => b.challenged - a.challenged)

  if (!rows.length) return null

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Challenger Stats</h3>
      <div className="text-sm">
        <div className="grid text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 gap-2" style={{ gridTemplateColumns: '1fr 3rem 3rem 3rem 3rem 4rem' }}>
          <span>Character</span>
          <span className="text-center">Total</span>
          <span className="text-center text-emerald-600">Survived</span>
          <span className="text-center text-yellow-600">Traded</span>
          <span className="text-center text-red-500">No kill</span>
          <span className="text-right text-emerald-600">Surv%</span>
        </div>
        {rows.map(r => {
          const pct = Math.round((r.survived / r.challenged) * 100)
          return (
            <div key={r.name} className="grid items-center gap-2 py-1.5 border-b border-gray-100 last:border-0" style={{ gridTemplateColumns: '1fr 3rem 3rem 3rem 3rem 4rem' }}>
              <span className="text-gray-800 truncate">{r.name}</span>
              <span className="text-center font-bold text-gray-700">{r.challenged}</span>
              <span className="text-center font-semibold text-emerald-600">{r.survived || '—'}</span>
              <span className="text-center font-semibold text-yellow-600">{r.traded || '—'}</span>
              <span className="text-center font-semibold text-red-500">{r.banishedNoKill || '—'}</span>
              <div className="flex items-center gap-1 justify-end">
                <span className={`text-xs font-bold ${pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-gray-600' : 'text-red-500'}`}>{pct}%</span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-1.5">Cards with 2+ challenges shown · Surv% = attacker survived the challenge</p>
    </div>
  )
}

function MulliganTable({ rows, emptyText }) {
  if (!rows.length) return <p className="text-sm text-gray-400">{emptyText}</p>
  return (
    <div className="font-mono text-sm space-y-0.5">
      {rows.map(c => {
        const pct = c.openingHandCount > 0 ? Math.round((c.sentBackCount / c.openingHandCount) * 100) : 100
        return (
          <div key={c.fullName} className="flex items-center gap-2 py-1 border-b border-gray-100 last:border-0">
            <span className="font-bold text-gray-900 w-8 text-right flex-shrink-0">{c.sentBackCount}</span>
            <span className="flex-1 text-gray-700 truncate">{c.fullName}</span>
            <InkCombo colors={c.colors} size={12} />
            <span className="text-xs text-gray-400 flex-shrink-0">{pct}%</span>
          </div>
        )
      })}
    </div>
  )
}

function DeckStats({ games, subtitle: subtitleProp }) {
  const [matchupFilter, setMatchupFilter] = useState(null) // null = All

  if (games.length === 0) return null

  // Build unique matchups from all games
  const matchups = []
  const seen = new Set()
  for (const g of games) {
    const key = g.oppInkCombo?.join('/') || 'Unknown'
    if (!seen.has(key)) {
      seen.add(key)
      matchups.push({ key, colors: g.oppInkCombo ?? [] })
    }
  }
  const showFilter = matchups.length > 1

  const filteredGames = matchupFilter
    ? games.filter(g => (g.oppInkCombo?.join('/') || 'Unknown') === matchupFilter)
    : games

  const cards = aggregateMyCards(filteredGames)
  const mulliganCards = aggregateMulliganSentBack(filteredGames)

  const topPlayed = [...cards].filter(c => c.playedCount > 0)
    .sort((a, b) => b.playedCount - a.playedCount).slice(0, 8)
  const topInked = [...cards].filter(c => c.inkedCount > 0)
    .sort((a, b) => b.inkedCount - a.inkedCount).slice(0, 8)
  const topLore = [...cards].filter(c => c.loreGained > 0)
    .sort((a, b) => b.loreGained - a.loreGained).slice(0, 8)
  const topSentBack = [...mulliganCards].filter(c => c.sentBackCount > 0)
    .sort((a, b) => b.sentBackCount - a.sentBackCount).slice(0, 8)

  const totalGames = games.length
  const filteredCount = filteredGames.length
  const subtitle = subtitleProp ?? (
    matchupFilter
      ? `${filteredCount} game${filteredCount !== 1 ? 's' : ''} vs this matchup · ${totalGames} total`
      : `Aggregated across ${totalGames} game${totalGames !== 1 ? 's' : ''}`
  )

  return (
    <Section collapsible defaultOpen={true} title="Deck Stats" subtitle={subtitle}>
      {showFilter && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs text-gray-500 font-medium">vs</span>
          <button
            onClick={() => setMatchupFilter(null)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              matchupFilter === null
                ? 'bg-gray-900 border-gray-900 text-white'
                : 'border-gray-300 text-gray-600 hover:border-gray-500'
            }`}
          >
            All
          </button>
          {matchups.map(({ key, colors }) => (
            <button
              key={key}
              onClick={() => setMatchupFilter(matchupFilter === key ? null : key)}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                matchupFilter === key
                  ? 'bg-gray-900 border-gray-900 text-white'
                  : 'border-gray-300 text-gray-600 hover:border-gray-500'
              }`}
            >
              {colors.length ? (
                colors.map(c => (
                  <img
                    key={c}
                    src={`/ink/${c}.png`}
                    alt={c}
                    width={14}
                    height={14}
                    className={`inline-block flex-shrink-0 ${matchupFilter === key ? 'brightness-0 invert' : ''}`}
                  />
                ))
              ) : key}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-1">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Most Played</h3>
          <StatTable rows={topPlayed} valueKey="playedCount" emptyText="No plays recorded." />
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Most Inked</h3>
          <StatTable rows={topInked} valueKey="inkedCount" emptyText="No inks recorded." />
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Most Lore Gained</h3>
          <StatTable rows={topLore} valueKey="loreGained" emptyText="No quests recorded." />
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Most Mulliganed</h3>
          <p className="text-[10px] text-gray-400 mb-1.5">Count · % of opening hand appearances</p>
          <MulliganTable rows={topSentBack} emptyText="No mulligan data." />
        </div>
      </div>
      {filteredGames.length > 1 && <CardWinRateTable games={filteredGames} />}
      <CrossGameChallengers games={filteredGames} />
    </Section>
  )
}

// --- Main page ---

const LS_KEY = 'lorcana-replays-v1'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveToStorage(games) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(games))
  } catch {
    // storage full — silently continue
  }
}

export function ReplayAnalyzerPage() {
  const [games, setGames] = useState(() => loadFromStorage())
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const persistGames = (updated) => {
    setGames(updated)
    saveToStorage(updated)
  }

  const processFiles = useCallback(async (files) => {
    setLoading(true)
    setError(null)
    const results = []
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer()
        const json = await decompressGzip(buf)
        const data = JSON.parse(json)
        const parsed = parseReplay(data)
        results.push(parsed)
      } catch (e) {
        setError(`Failed to parse ${file.name}: ${e.message}`)
      }
    }
    if (results.length) {
      setGames(prev => {
        // Deduplicate by gameId
        const existingIds = new Set(prev.map(g => g.gameId))
        const fresh = results.filter(g => !existingIds.has(g.gameId))
        const updated = [...prev, ...fresh]
        saveToStorage(updated)
        return updated
      })
      setActiveId(results[results.length - 1].gameId)
    }
    setLoading(false)
  }, [])

  const removeGame = (gameId) => {
    setGames(prev => {
      const updated = prev.filter(g => g.gameId !== gameId)
      saveToStorage(updated)
      return updated
    })
    setActiveId(id => id === gameId ? null : id)
  }

  const activeGame = games.find(g => g.gameId === activeId) ?? null

  const onFileChange = (e) => {
    if (e.target.files?.length) processFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.gz'))
    if (files.length) processFiles(files)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">Replay Analyzer</h1>
        <p className="text-sm text-gray-500">
          Upload Lorcana Duels replay files (<code className="bg-gray-100 px-1 rounded text-xs">.replay.gz</code>) to analyze gameplay and reconstruct opponent decklists. Replays are saved locally in your browser.
        </p>
      </div>

      {/* Drop zone */}
      <label
        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 mb-6 cursor-pointer transition-colors ${dragOver ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400'}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input type="file" accept=".gz" multiple className="sr-only" onChange={onFileChange} />
        <svg className="w-7 h-7 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <span className="text-sm font-medium text-gray-700">Drop replay files here or click to upload</span>
        <span className="text-xs text-gray-400 mt-1">Accepts .replay.gz files · duplicates are skipped</span>
      </label>

      {loading && <div className="text-sm text-gray-500 mb-4">Parsing replays…</div>}
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3 mb-4">{error}</div>}

      {games.length > 0 && <WinRateStats games={games} />}
      {games.length > 1 && <DeckStats games={games} />}

      {/* Saved replays list */}
      {games.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">{games.length} saved replay{games.length !== 1 ? 's' : ''}</h2>
            <button
              onClick={() => { persistGames([]); setActiveId(null) }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Clear all
            </button>
          </div>
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
            {[...games].reverse().map((g) => {
              const isActive = g.gameId === activeId
              const date = new Date(g.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              const didWin = g.winner === g.myPlayerNum
              return (
                <div
                  key={g.gameId}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isActive ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                  onClick={() => setActiveId(isActive ? null : g.gameId)}
                >
                  <span className={`text-xs font-bold w-12 flex-shrink-0 ${didWin ? 'text-emerald-600' : 'text-red-500'}`}>
                    {didWin ? 'W' : 'L'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-gray-900 font-medium truncate">
                        vs {g.opponentName}
                      </span>
                      {g.myInkCombo?.length > 0 && (
                        <InkCombo colors={g.myInkCombo} size={12} />
                      )}
                      {g.oppInkCombo?.length > 0 && (
                        <span className="opacity-50">
                          <InkCombo colors={g.oppInkCombo} size={12} />
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{date} · {g.turnCount} turns · {g.victoryReason}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeGame(g.gameId) }}
                    className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 text-lg leading-none px-1"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeGame && <ReplayAnalysis game={activeGame} />}
    </div>
  )
}
