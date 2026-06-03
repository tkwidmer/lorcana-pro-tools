// Cards that draw when played (card ID → draw count).
// Used to attribute subsequent CARD_DRAWN events when ABILITY_TRIGGERED isn't fired on-play.
const ON_PLAY_DRAWS = {
  '10-66': 2, // Junior Woodchuck Guidebook
}

export async function decompressGzip(arrayBuffer) {
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

export function parseColors(str) {
  if (!str) return []
  return str.split('/').map(c => c.trim().toLowerCase()).filter(Boolean)
}

export function parseGamelog(id, logs, meta = {}) {
  const players = {
    1: { initialHand: [], mulliganSent: [], mulliganKept: [], mulliganDrawn: [], cards: {} },
    2: { initialHand: [], mulliganSent: [], mulliganKept: [], mulliganDrawn: [], cards: {} },
  }
  let p1Name = 'Player 1', p2Name = 'Player 2'
  let winner = null, turnCount = 0
  let victoryReason = null, concededBy = null
  let wentFirstFromLog = null
  const loreByPlayer = { 1: 0, 2: 0 }
  const loreEvents = []
  const challenges = []

  const ensureCard = (p, name, cardId) => {
    const pData = players[p]
    if (!pData.cards[name]) {
      pData.cards[name] = {
        name, id: cardId,
        drawn: 0, played: 0, inked: 0, discarded: 0, destroyed: 0,
        loreGained: 0, shiftPlays: 0,
        effectDraws: 0, oppForcedDiscards: 0, extraInks: 0, effectRemovals: 0, exerts: 0, cardsRecovered: 0,
        sings: 0, oppRestrictions: 0,
      }
    }
    return pData.cards[name]
  }

  const lastPlayedByPlayer = { 1: null, 2: null }
  let pendingDrawSource = null
  let pendingDrawCount = 0

  // Track unique instanceIds from CARD_DRAWN per player for opponent decklist inference
  const instanceCards = { 1: new Map(), 2: new Map() }

  // Per-player-turn tempo aggregation for leak/mistake detection.
  // NOTE: turnNumber is a *round* shared by both players (the first player gets
  // a solo opening round, then each round contains both players' turns), so we
  // segment by TURN_START boundaries rather than keying on turnNumber.
  const turnSegments = []
  let curSeg = null

  for (const entry of logs) {
    const p = entry.player === 1 || entry.player === '1' ? 1 : entry.player === 2 || entry.player === '2' ? 2 : null
    const type = entry.type
    const d = entry.data ?? {}
    if ((entry.turnNumber ?? 0) > turnCount) turnCount = entry.turnNumber ?? 0

    if (type === 'TURN_START' && entry.turnNumber === 1 && wentFirstFromLog === null && p) {
      wentFirstFromLog = p
    }

    if (type === 'GAME_CONCEDED') {
      winner = d.winner ?? winner
      victoryReason = d.victoryReason ?? 'concession'
      concededBy = d.concededBy ?? null
    }

    if (type === 'GAME_END') {
      winner = d.winner ?? winner
      if (!victoryReason) victoryReason = d.victoryReason ?? null
    }

    if (!p) continue
    const pData = players[p]

    // Per-player-turn tempo tracking. A segment runs from one TURN_START to the
    // next; only the active player's own actions are counted into it.
    if (type === 'TURN_START') {
      if (curSeg) turnSegments.push(curSeg)
      curSeg = { turn: entry.turnNumber ?? 0, owner: p, inked: 0, lore: 0, plays: 0 }
    } else if (curSeg && p === curSeg.owner) {
      if (type === 'CARD_INKED') curSeg.inked++
      else if (type === 'CARD_PUT_INTO_INKWELL' && (d.fromZone === 'hand')) curSeg.inked++
      else if (type === 'CARD_PLAYED') curSeg.plays++
      else if (type === 'CARD_QUEST') curSeg.lore += (d.loreGained ?? 0)
    }

    if (type === 'INITIAL_HAND') {
      pData.initialHand = (d.initialHandCards ?? []).filter(c => c?.name)
    }

    if (type === 'MULLIGAN') {
      pData.mulliganSent = (d.mulliganedCards ?? []).filter(c => c?.name)
      const sentIds = new Set(pData.mulliganSent.map(c => c.id))
      pData.mulliganKept = pData.initialHand.filter(c => !sentIds.has(c.id))
      pData.mulliganDrawn = (d.drawnCards ?? []).filter(c => c?.name)
    }

    if (type === 'CARD_DRAWN' && p && d.instanceId && d.cardId) {
      instanceCards[p].set(d.instanceId, { cardId: d.cardId, cardName: d.cardName ?? d.cardId })
    }

    const cardRefs = []
    if (d.cardName) cardRefs.push({ name: d.cardName, id: d.cardId })
    for (const arr of [d.initialHandCards, d.mulliganedCards, d.drawnCards, d.cards, d.keptCards, d.returnedCards]) {
      if (Array.isArray(arr)) arr.forEach(c => { if (c?.name) cardRefs.push({ name: c.name, id: c.id }) })
    }

    for (const card of cardRefs) {
      if (!card.name) continue
      const c = ensureCard(p, card.name, card.id)
      if (type === 'CARD_DRAWN') {
        c.drawn++
        if (pendingDrawCount > 0 && pendingDrawSource && pendingDrawSource.player === p) {
          ensureCard(p, pendingDrawSource.name, pendingDrawSource.id).effectDraws++
          pendingDrawCount--
          if (pendingDrawCount <= 0) { pendingDrawSource = null; pendingDrawCount = 0 }
        }
      } else if (type === 'CARD_PLAYED') {
        c.played++
        lastPlayedByPlayer[p] = { name: card.name, id: card.id }
        const drawCount = ON_PLAY_DRAWS[card.id]
        if (drawCount) { pendingDrawSource = { ...card, player: p }; pendingDrawCount = drawCount }
        // Track singer: the character that exerted to sing this song
        if (d.singerCardName && d.singerCardId && card.name === d.cardName) {
          ensureCard(p, d.singerCardName, d.singerCardId).sings++
        }
      } else if (type === 'CARD_INKED') {
        c.inked++
      } else if (type === 'CARD_DISCARDED') {
        c.discarded++
      } else if (type === 'CARD_DESTROYED') {
        c.destroyed++
      }
    }

    // When a card moves to the inkwell FROM the field, the other player caused it
    // (Let It Go, Hades, etc.). Attribute as effectRemoval to the other player's last played card.
    if (type === 'CARD_PUT_INTO_INKWELL' && (d.fromZone === 'field' || d.fromZone === 'board')) {
      const causedBy = p === 1 ? 2 : 1
      const src = lastPlayedByPlayer[causedBy]
      if (src) ensureCard(causedBy, src.name, src.id).effectRemovals++
    }

    // When a card is destroyed by an ability effect (abilitySourceCardId present and fromZone === 'field'),
    // attribute the removal to the source card owned by the other player.
    if (type === 'CARD_DESTROYED' && d.abilitySourceCardId && d.abilitySourceCardName && d.fromZone === 'field') {
      const causedBy = p === 1 ? 2 : 1
      ensureCard(causedBy, d.abilitySourceCardName, d.abilitySourceCardId).effectRemovals++
    }

    // CARD_REVEALED with revealDestination === 'hand' means an on-play ability fetched a card
    // from the deck to hand (e.g. Ariel - Spectacular Singer's MUSICAL DEBUT). Attribute as
    // effectDraws to the card that was most recently played by this player.
    if (type === 'CARD_REVEALED' && d.revealDestination === 'hand') {
      const src = lastPlayedByPlayer[p]
      if (src) ensureCard(p, src.name, src.id).effectDraws++
    }

    if (type === 'CARD_QUEST' && d.cardName) {
      const gain = d.loreGained ?? 0
      ensureCard(p, d.cardName, d.cardId).loreGained += gain
      if (d.newLoreTotal != null) {
        loreByPlayer[p] = d.newLoreTotal
        loreEvents.push({ turn: entry.turnNumber ?? 0, player: p, total: d.newLoreTotal })
      }
    }

    // CARD_ATTACK comes in two events per challenge: the first has names only,
    // the second has full combat stats including banished flags — only use the second.
    if (type === 'CARD_ATTACK' && d.attackerBanished !== undefined) {
      challenges.push({
        turn: entry.turnNumber,
        player: p,
        attackerName: d.cardName,
        defenderName: d.targetCardName,
        attackerBanished: d.attackerBanished,
        defenderBanished: d.defenderBanished,
        attackerStrength: (d.attackerBaseStrength ?? 0) + (d.attackerChallengerBonus ?? 0),
        challengerBonus: d.attackerChallengerBonus ?? 0,
        defenderStrength: d.defenderBaseStrength ?? 0,
        attackerWillpower: d.attackerWillpower ?? 0,
        defenderWillpower: d.defenderWillpower ?? 0,
      })
    }

    // CARD_BOOSTED = Shift play (card played on top of another)
    if (type === 'CARD_BOOSTED' && d.cardName) {
      ensureCard(p, d.cardName, d.cardId).shiftPlays++
    }

    if (type === 'ABILITY_TRIGGERED' && d.abilitySourceCardName) {
      const c = ensureCard(p, d.abilitySourceCardName, d.abilitySourceCardId)
      for (const ek of (d.effectDescriptionKeys ?? [])) {
        const k = ek.key ?? ''
        const count = ek.params?.count ?? 1
        if (k === 'drawsACard' || k === 'eachPlayerDrawsToHandSize' || k === 'youMayDraw' || k === 'drawACard')
          c.effectDraws++
        else if (k === 'drawsCards' || k === 'youMayDrawCards' || k === 'drawCards')
          c.effectDraws += count
        else if (k === 'discardedCard' || k === 'opponentDiscardsACard')
          c.oppForcedDiscards++
        else if (k === 'opponentDiscardsCards')
          c.oppForcedDiscards += count
        else if (k === 'grantsAnAdditionalInk' || k === 'additionalInk')
          c.extraInks++
        else if (k === 'movesDamageDetailedBanished' || k === 'banishesTarget' || k === 'banishTarget' || k === 'banishesCharacter')
          c.effectRemovals++
        else if (k === 'exertsCharacter' || k === 'exertTarget' || k === 'exertsTarget')
          c.exerts++
        else if (k === 'returnedFromDiscard' || k === 'returnFromDiscard')
          c.cardsRecovered += (d.returnedCardRefs?.length ?? count)
        else if (k === 'cannotPlayTypes')
          c.oppRestrictions++
      }
    }
  }

  if (curSeg) turnSegments.push(curSeg)
  const turns = turnSegments

  // Build inferred opponent decklist from instanceId tracking + hand data.
  // Counts are lower bounds: exact for drawn cards, max-simultaneous for opening hand cards.
  const buildInferredDecklist = (oppPlayerNum) => {
    const oppData = players[oppPlayerNum]
    const cardCounts = {} // cardId → { count, name }

    // Step 1: unique instanceIds from CARD_DRAWN → exact copies that cycled through deck
    for (const { cardId, cardName } of instanceCards[oppPlayerNum].values()) {
      if (!cardCounts[cardId]) cardCounts[cardId] = { count: 0, name: cardName }
      cardCounts[cardId].count++
    }

    // Step 2: post-mulligan hand snapshot (kept + replacement draws)
    // Cards held from initial hand may never appear in CARD_DRAWN if played/inked directly
    const handCounts = {}
    for (const card of (oppData.mulliganKept ?? [])) {
      handCounts[card.id] = (handCounts[card.id] ?? 0) + 1
      if (!cardCounts[card.id]) cardCounts[card.id] = { count: 0, name: card.name }
    }
    for (const card of (oppData.mulliganDrawn ?? [])) {
      handCounts[card.id] = (handCounts[card.id] ?? 0) + 1
      if (!cardCounts[card.id]) cardCounts[card.id] = { count: 0, name: card.name }
    }
    for (const [cardId, handCount] of Object.entries(handCounts)) {
      cardCounts[cardId].count = Math.max(cardCounts[cardId].count, handCount)
    }

    // Step 3: mulliganed cards go back to deck — ensure count ≥ 1 even if never redrawn
    for (const card of (oppData.mulliganSent ?? [])) {
      if (!cardCounts[card.id]) cardCounts[card.id] = { count: 0, name: card.name }
      if (cardCounts[card.id].count === 0) cardCounts[card.id].count = 1
    }

    return Object.entries(cardCounts)
      .filter(([, { count }]) => count > 0)
      .map(([cardId, { count }]) => ({ cardId, count }))
      .sort((a, b) => b.count - a.count || a.cardId.localeCompare(b.cardId))
  }

  const toList = (cardsMap) => Object.values(cardsMap).sort((a, b) => {
    const aTotal = a.drawn + a.played + a.inked
    const bTotal = b.drawn + b.played + b.inked
    return bTotal - aTotal || a.name.localeCompare(b.name)
  })

  // your_player directly identifies which seat is "you" — most reliable source
  let myPlayerNum = meta.yourPlayerNum ? Number(meta.yourPlayerNum) : null

  // Fallback: derive from win/loss + winner when your_player isn't available
  if (!myPlayerNum && meta.yourResult && winner !== null) {
    const winnerNum = winner === 1 || winner === '1' ? 1 : 2
    myPlayerNum = meta.yourResult === 'win' ? winnerNum : (winnerNum === 1 ? 2 : 1)
  }

  // Override names from match history API (authoritative — gamelog has no names)
  if (myPlayerNum && meta.opponentName) {
    if (myPlayerNum === 1) p2Name = meta.opponentName
    else p1Name = meta.opponentName
  }
  if (myPlayerNum && meta.yourDisplayName) {
    if (myPlayerNum === 1) p1Name = meta.yourDisplayName
    else p2Name = meta.yourDisplayName
  }

  // yourColors/oppColors from the API always name the user and opponent respectively,
  // regardless of which seat (1 or 2) myPlayerNum occupies.
  const myInkCombo = parseColors(meta.yourColors ?? '')
  const oppInkCombo = parseColors(meta.oppColors ?? '')

  const wentFirst = meta.wentFirst != null
    ? (meta.wentFirst ? myPlayerNum : (myPlayerNum === 1 ? 2 : 1))
    : wentFirstFromLog

  return {
    id,
    p1Name,
    p2Name,
    winner,
    turnCount,
    eventCount: logs.length,
    victoryReason,
    concededBy,
    wentFirst,
    p1FinalLore: loreByPlayer[1] > 0 ? loreByPlayer[1] : null,
    p2FinalLore: loreByPlayer[2] > 0 ? loreByPlayer[2] : null,
    challenges,
    turns,
    myPlayerNum,
    myInkCombo,
    oppInkCombo,
    loreEvents,
    yourDecklist: meta.yourDecklist ?? null,
    oppDecklist: meta.oppDecklist ?? null,
    inferredOppDecklist: myPlayerNum ? buildInferredDecklist(myPlayerNum === 1 ? 2 : 1) : null,
    playedAt: meta.startedAt ? new Date(meta.startedAt).getTime() : null,
    mmr_delta: meta.mmr_delta ?? null,
    mmr_before: meta.mmr_before ?? null,
    mmr_after: meta.mmr_after ?? null,
    duration_seconds: meta.duration_seconds ?? null,
    match_id: meta.match_id ?? null,
    match_format: meta.match_format ?? null,
    match_game_number: meta.match_game_number ?? null,
    deckName: meta.deckName ?? null,
    deck_id: meta.deck_id ?? null,
    queue_name: meta.queue_name ?? null,
    p1: { ...players[1], cardList: toList(players[1].cards) },
    p2: { ...players[2], cardList: toList(players[2].cards) },
  }
}
