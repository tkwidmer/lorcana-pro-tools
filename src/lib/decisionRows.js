// Training rows for the player's mulligan and ink decisions, rebuilt from one duels.ink gamelog
// (the raw event array, the player's perspective). One row per candidate card at each decision,
// labelled with what the player chose.
//
// The hand is reconstructed from the log. It is only trusted ("certain") from a named opening hand
// until something the log can't account for: a turn draw with no card named (logs before June
// 2026), an ink or play of a card not in the tracked hand, or an undo (FREE_UNDO does not always
// revert the event just before it). A prompt that lists the whole hand resets it to the truth.
// Ink decisions are only emitted while the hand is certain; `checks` reports how often it was.

// Choice prompts whose `offered` list is every card in one player's hand. Discard prompts can show
// the opponent's hand (The Bare Necessities), so the owner is read off the discard that follows.
const FULL_HAND_PROMPT = /^(chooseCardToDiscard|chooseCardsToDiscard|chooseCardsFromHand|howsPickingsDiscard)$|^Choose \d+ card\(s\) to discard/
const LOOKAHEAD = 12

export function cardFeatures(card) {
  return {
    cost: card?.cost ?? null,
    inkable: card ? (card.inkwell ? 1 : 0) : null,
    type: card?.type ?? null,
    strength: card?.strength ?? null,
    willpower: card?.willpower ?? null,
    card_lore: card?.lore ?? null,
    shift: card?.keywordAbilities?.includes('Shift') ? 1 : 0,
  }
}

// A play of a card not in hand is a play from the discard, the deck or a reveal (Circle of Life,
// Chernabog, Max Goof) when a prompt beside it, logged just before or after, offered that card.
function playedFromElsewhere(logs, i, me, cardId) {
  return logs.slice(Math.max(0, i - 4), i + 5).some(x => x.type === 'CHOICE_RESOLVED' && x.player === me
    && !FULL_HAND_PROMPT.test(x.data?.choice?.message ?? '') && x.data?.choice?.offered?.some(c => c.cardId === cardId))
}

const count = (ids) => { const m = new Map(); for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1); return m }
const total = (m) => { let n = 0; for (const v of m.values()) n += v; return n }

// logs: raw gamelog events. me: the player's seat (1 or 2). cardById: duels.ink card id → LorcanaJSON card.
export function decisionRows(logs, me, cardById) {
  const card = (id) => cardById[id]
  let hand = new Map(), certain = false
  const add = (id) => hand.set(id, (hand.get(id) ?? 0) + 1)
  const remove = (id) => {
    const n = hand.get(id) ?? 0
    if (!n) return false
    if (n === 1) hand.delete(id); else hand.set(id, n - 1)
    return true
  }

  const mulligan = [], decisions = [], discarded = new Set(), drawnEarly = new Set()
  const checks = { checkpoints: 0, exact: 0, missing: 0, extra: 0, misses: 0, undos: 0, unseenDraws: 0, inkDecisions: 0, certainInkDecisions: 0 }
  const lost = () => { certain = false }
  const miss = () => { if (certain) checks.misses++; lost() }
  let ink = 0, myLore = 0, oppLore = 0, turn = 0, myTurn = 0, inMyTurn = false, inkedThisTurn = false

  logs.forEach((e, i) => {
    const d = e.data ?? {}, mine = e.player === me
    switch (e.type) {
      case 'TURN_START':
        turn = e.turnNumber ?? turn
        inMyTurn = mine
        inkedThisTurn = false
        if (mine) myTurn++
        break
      case 'TURN_END':
        // A turn with no ink is a decision too: every inkable card held was passed over.
        if (mine && inMyTurn && !inkedThisTurn) decide(null)
        inMyTurn = false
        break
      case 'CARD_QUEST':
        if (mine) myLore = d.newLoreTotal ?? myLore; else oppLore = d.newLoreTotal ?? oppLore
        break
    }
    if (!mine) return

    switch (e.type) {
      case 'INITIAL_HAND':
        if (d.initialHandCards) { hand = count(d.initialHandCards.map(c => c.id)); certain = true }
        break
      case 'MULLIGAN': {
        if (!certain) break
        const sent = count((d.mulliganedCards ?? []).map(c => c.id))
        const initial = [...hand].flatMap(([id, n]) => Array(n).fill(id))
        const handCtx = {
          hand_inkable: initial.filter(id => card(id)?.inkwell).length,
          hand_cost_le2: initial.filter(id => (card(id)?.cost ?? 99) <= 2).length,
          hand_cost_ge5: initial.filter(id => (card(id)?.cost ?? 0) >= 5).length,
        }
        // Copies are interchangeable, so the kept ones are numbered first: copy 2 of a pair is the
        // question "keep a second one?".
        for (const [id, n] of hand) for (let copy = 1; copy <= n; copy++) {
          mulligan.push({ card_id: id, copy, copies: n, ...cardFeatures(card(id)), ...handCtx, kept: copy <= n - (sent.get(id) ?? 0) ? 1 : 0 })
        }
        for (const [id, n] of sent) for (let k = 0; k < n; k++) remove(id)
        for (const c of d.drawnCards ?? []) add(c.id)
        break
      }
      case 'TURN_DRAW': {
        const next = logs.slice(i + 1).find(x => x.player === me)
        if (!(next?.type === 'CARD_DRAWN' && next.data?.cardId)) { checks.unseenDraws++; lost() }
        break
      }
      case 'CARD_DRAWN':
        if (drawnEarly.delete(d.instanceId)) break // already in hand via the prompt that listed it
        if (d.cardId) add(d.cardId); else { checks.unseenDraws++; lost() }
        break
      case 'CARD_REVEALED':
      case 'CARD_LOOKED_AT':
        if (d.revealDestination === 'hand' && d.cardId) add(d.cardId)
        break
      case 'CARD_RETURNED': // the player's own card back to hand, from play or the inkwell
        if (d.cardId) add(d.cardId)
        if (d.fromZone === 'inkwell') ink--
        break
      case 'CARD_INKED':
        ink++
        if (d.fromZone && d.fromZone !== 'hand') break
        inkedThisTurn = true
        if (!hand.get(d.cardId)) miss()
        decide(d.cardId)
        remove(d.cardId)
        break
      case 'CARD_PUT_INTO_INKWELL':
        ink++
        if (d.fromZone === 'hand' && !remove(d.cardId)) miss()
        break
      case 'CARD_PLAYED':
        if (!remove(d.cardId) && !playedFromElsewhere(logs, i, me, d.cardId)) miss()
        break
      case 'CARD_DISCARDED':
        // Every discard is logged twice with the same instance id.
        if (d.instanceId && discarded.has(d.instanceId)) break
        if (d.instanceId) discarded.add(d.instanceId)
        if (d.fromZone === 'hand' && !remove(d.cardId)) miss()
        break
      case 'CARD_RETURNED_TO_DECK':
        if (d.fromZone === 'hand' && !remove(d.cardId)) miss()
        break
      case 'FREE_UNDO':
      case 'UNDO_ACCEPTED':
        // What was undone is not knowable from the log, so this turn's decisions go too.
        checks.undos++
        while (decisions.at(-1)?.myTurn === myTurn) { decisions.pop(); checks.certainInkDecisions-- }
        lost()
        break
      case 'CHOICE_RESOLVED': {
        const ch = d.choice ?? {}
        if (!FULL_HAND_PROMPT.test(ch.message ?? '') || !ch.offered) break
        const after = logs.slice(i + 1, i + 1 + LOOKAHEAD)
        if (ch.message !== 'chooseCardsFromHand') {
          const discard = after.find(x => x.type === 'CARD_DISCARDED' && (ch.selectedInstanceIds ?? []).includes(x.data?.instanceId))
          if (discard?.player !== me) break
        }
        // "Draw, then discard" effects (Tod, Strike a Good Match) log their draws after the prompt, so
        // the prompt already lists those cards. The hand is set to the prompt's list and the late
        // CARD_DRAWN events for those instances are skipped when they arrive.
        const offeredIds = new Set(ch.offered.map(c => c.instanceId))
        const late = after.filter(x => x.type === 'CARD_DRAWN' && x.player === me && offeredIds.has(x.data?.instanceId)).map(x => x.data.instanceId)
        const truth = count(ch.offered.map(c => c.cardId))
        if (certain) {
          const expected = new Map(hand)
          for (const c of ch.offered) if (late.includes(c.instanceId)) expected.set(c.cardId, (expected.get(c.cardId) ?? 0) + 1)
          checks.checkpoints++
          let missing = 0, extra = 0
          for (const [id, n] of truth) missing += Math.max(0, n - (expected.get(id) ?? 0))
          for (const [id, n] of expected) extra += Math.max(0, n - (truth.get(id) ?? 0))
          checks.missing += missing; checks.extra += extra
          if (!missing && !extra) checks.exact++
        }
        hand = truth
        for (const iid of late) drawnEarly.add(iid)
        certain = true
        // Sleight of Hand puts the chosen cards on the bottom of the deck with no move event of its own.
        if (ch.message === 'chooseCardsFromHand') {
          const byInstance = new Map(ch.offered.map(c => [c.instanceId, c.cardId]))
          for (const iid of ch.selectedInstanceIds ?? []) remove(byInstance.get(iid))
        }
        break
      }
    }
  })

  function decide(chosen) {
    checks.inkDecisions++
    if (!certain) return
    checks.certainInkDecisions++
    decisions.push({ turn, myTurn, ink: chosen === null ? ink : ink - 1, myLore, oppLore, hand: new Map(hand), chosen })
  }

  const inkRows = []
  decisions.forEach((x, decision) => {
    const candidates = [...x.hand].filter(([id]) => card(id)?.inkwell)
    const inkableCards = candidates.reduce((s, [, n]) => s + n, 0)
    for (const [id, copies] of candidates) {
      const f = cardFeatures(card(id))
      inkRows.push({
        decision, turn: x.turn, my_turn: x.myTurn, ink: x.ink, my_lore: x.myLore, opp_lore: x.oppLore,
        hand_size: total(x.hand), hand_inkable: inkableCards, no_ink: x.chosen === null ? 1 : 0,
        card_id: id, copies, ...f, cost_gap: f.cost === null ? null : f.cost - (x.ink + 1),
        inked: id === x.chosen ? 1 : 0,
      })
    }
  })
  return { mulligan, ink: inkRows, checks }
}
