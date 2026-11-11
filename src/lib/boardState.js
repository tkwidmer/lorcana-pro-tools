// Board reconstruction from a duels.ink gamelog, and the quest / challenge / end-turn choice rows built on it.
// The log names most actions but not the board, so the board is rebuilt event by event and checked against
// every quest and challenge the log records; only turns where it agrees fully become choice rows.
// Both players are tracked (their quests and challenges are public). Board entries are characters and
// locations: { cardId, instanceId, exerted, dry, damage, location, playedTurn }.

const ACTIONS = new Set(['CARD_INKED', 'CARD_PLAYED', 'CARD_QUEST', 'ABILITY_ACTIVATED', 'CARD_MOVED', 'CARD_BOOSTED'])
const LEAVES = new Set(['CARD_DESTROYED', 'CARD_RETURNED', 'CARD_PUT_INTO_INKWELL', 'CARD_RETURNED_TO_DECK'])
const isDeclaration = (e) => e.type === 'CARD_ATTACK' && !('attackerBaseStrength' in (e.data ?? {}))
const keysOf = (d) => d.effectDescriptionKeys ?? []
const other = (p) => 3 - p

// Card facts the tracker needs, from a LorcanaJSON card. Rule text is matched with whitespace collapsed
// because fullText breaks lines mid-phrase.
export function cardRules(card) {
  const text = (card?.fullText ?? '').replace(/\s+/g, ' ')
  const kw = card?.keywordAbilities ?? []
  const bonus = (name) => Number(text.match(new RegExp(`${name} \\+(\\d+)`))?.[1] ?? 0)
  return {
    type: card?.type, text, cost: card?.cost ?? 0, strength: card?.strength ?? 0, willpower: card?.willpower ?? 0, lore: card?.lore ?? 0,
    rush: kw.includes('Rush'), evasive: kw.includes('Evasive'), bodyguard: kw.includes('Bodyguard'), reckless: kw.includes('Reckless'),
    challenger: bonus('Challenger'), resist: bonus('Resist'), villain: (card?.subtypes ?? []).includes('Villain'),
    challengesReady: text.includes('This character can challenge ready characters'),
    challengesReadyDamaged: text.includes('can challenge ready damaged characters'),
    challengesReadyVillains: text.includes('can challenge ready Villain characters'),
    evasiveOnOwnTurn: text.includes('During your turn, this character gains Evasive'),
  }
}

// The board state machine. step(event) applies one log event and, for a quest or challenge declaration,
// returns the check: { kind, player, cardId, reason, targetCardId, targetReason, inferred } (reason null = agrees).
export function createBoard(cardById) {
  const rulesCache = new Map()
  const rules = (id) => {
    if (!rulesCache.has(id)) rulesCache.set(id, cardRules(cardById[id]))
    return rulesCache.get(id)
  }
  const tracked = (id) => ['Character', 'Location'].includes(rules(id).type)
  const s = {
    board: { 1: [], 2: [] }, lore: { 1: 0, 2: 0 }, turn: { 1: 0, 2: 0 }, active: null,
    undo: [], lastSelected: [], bouncePending: 0, lastAttack: null, phantom: false,
    // Per-turn effects that the log announces without naming the card they touch.
    unnamedExerts: { 1: 0, 2: 0 }, readies: { 1: 0, 2: 0 }, rushGrants: { 1: 0, 2: 0 },
    challengeReady: { 1: false, 2: false }, evasiveGrant: { 1: false, 2: false }, enterExerted: { 1: false, 2: false },
    // Per-turn counts that decide whether a turn can be trusted.
    turnStats: null,
  }
  const resetTurn = () => {
    for (const p of [1, 2]) {
      s.unnamedExerts[p] = 0; s.readies[p] = 0; s.rushGrants[p] = 0
      s.challengeReady[p] = false; s.evasiveGrant[p] = false
    }
    s.turnStats = { inferred: 0, exertEffects: 0, exertChoices: 0, unresolvedBounces: 0 }
  }
  resetTurn()

  // An entry by instance id, else an unbound copy (which takes the id), else the first copy by preference.
  function find(p, cardId, instanceId, prefer) {
    let copies = s.board[p].filter((e) => e.cardId === cardId)
    if (instanceId) {
      const bound = copies.find((e) => e.instanceId === instanceId)
      if (bound) return bound
      const free = copies.find((e) => e.instanceId == null)
      if (free) { free.instanceId = instanceId; return free }
    }
    if (prefer) copies = [...copies].sort(prefer)
    return copies[0] ?? null
  }
  const byInstance = (instanceId) => {
    for (const p of [1, 2]) {
      const e = s.board[p].find((x) => x.instanceId === instanceId)
      if (e) return e
    }
    return null
  }
  const readyFirst = (a, b) => (a.exerted - b.exerted) || (a.dry - b.dry)
  const remove = (p, e) => { s.board[p] = s.board[p].filter((x) => x !== e) }

  function actorReason(p, cardId, e) {
    if (!cardById[cardId]) return 'card unknown'
    if (p !== s.active) return 'not on own turn'
    if (!e) return 'not on board'
    if (e.dry) {
      if (s.rushGrants[p] > 0) { s.rushGrants[p]--; return null }
      return 'drying'
    }
    if (e.exerted) {
      if (s.readies[p] > 0) { s.readies[p]--; return null }
      return 'exerted'
    }
    return null
  }

  function targetReason(p, cardId, target) {
    if (!target) return 'not on board'
    if (target.exerted || rules(target.cardId).type === 'Location') return null
    const r = rules(cardId)
    if (r.challengesReady || s.challengeReady[p]) return null
    const o = other(p)
    if (rules(target.cardId).bodyguard && target.playedTurn === s.turn[o]) {   // Bodyguard may enter play exerted
      target.exerted = true; s.turnStats.inferred++; return null
    }
    if (s.unnamedExerts[p] > 0) {   // an exert effect that did not name its target: the challenge names it
      s.unnamedExerts[p]--; target.exerted = true; s.turnStats.inferred++; return null
    }
    return 'not exerted'
  }

  function applyAbility(p, d) {
    const keys = keysOf(d)
    const names = keys.map((k) => k.key)
    const abilityText = keys.map((k) => k.params?.abilityText ?? '').join(' ')
    if (names.includes('exertsCharacter')) { s.unnamedExerts[p]++; s.turnStats.exertEffects++ }
    if (abilityText.includes('Evasive')) s.evasiveGrant[p] = true
    if (abilityText.includes('Rush')) s.rushGrants[p]++
    if (names.includes('playsFromDiscard') && (d.effectDescription ?? '').includes('exerted')) s.enterExerted[p] = true
    if (names.includes('readiesCharacter')) s.readies[p]++
    if (keys.some((k) => k.params?.effectType === 'can_challenge_ready')) s.challengeReady[p] = true
    if (names.includes('returnsTargetToHand') || names.includes('returnsToHand')) s.bouncePending = 2
    for (const k of keys) {
      const total = k.params?.total
      if (total == null) continue
      if (k.key === 'gainsLore') s.lore[p] = total
      if (k.key === 'opponentLosesLore' || k.key === 'opponentGainsLore') s.lore[other(p)] = total
    }
  }

  function applyChoice(choice) {
    s.lastSelected = choice.selectedInstanceIds ?? []
    for (const o of choice.offered ?? []) {   // offered cards bind instance ids to tracked copies
      if (o?.instanceId && o.cardId && !byInstance(o.instanceId)) for (const p of [1, 2]) if (find(p, o.cardId, o.instanceId)) break
    }
    const message = choice.message ?? ''
    if (message.includes('Exert') && !message.toLowerCase().includes('ready')) {
      s.turnStats.exertChoices++
      for (const id of s.lastSelected) { const e = byInstance(id); if (e) e.exerted = true }
    }
  }

  function play(p, d) {
    const r = rules(d.cardId)
    const e = { cardId: d.cardId, instanceId: d.instanceId ?? null, exerted: s.enterExerted[p], dry: r.type === 'Character' && !r.rush, damage: 0, location: null, playedTurn: s.turn[p] }
    s.enterExerted[p] = false
    if (d.usedShift) {
      const base = find(p, d.shiftTargetCardId)
      if (base) { Object.assign(e, { exerted: base.exerted, dry: base.dry, damage: base.damage, location: base.location }); remove(p, base) }
    }
    s.board[p].push(e)
  }

  function step(ev) {
    const { type: t, player: p } = ev
    const d = ev.data ?? {}
    const id = d.cardId
    if (t === 'FREE_UNDO') {   // reverts the last player action and everything it caused
      const back = s.undo.pop()
      if (back) Object.assign(s, back)
      return null
    }
    if (t === 'TURN_START' || t === 'TURN_END') s.undo = []
    if (ACTIONS.has(t) || isDeclaration(ev)) s.undo.push({ board: structuredClone(s.board), lore: { ...s.lore }, unnamedExerts: { ...s.unnamedExerts } })
    if (t === 'TURN_START') {
      s.active = p; s.turn[p]++; resetTurn()
      for (const e of s.board[p]) { e.exerted = false; e.dry = false }
      return null
    }
    if ('newLoreTotal' in d && (p === 1 || p === 2)) s.lore[p] = d.newLoreTotal
    if (t === 'CARD_PLAYED') {
      if (id && tracked(id)) play(p, d)
      const singers = [d.singerCardId, ...(d.singerCards ?? []).map((x) => x?.cardId)].filter(Boolean)
      for (const singer of singers) { const e = find(p, singer, null, readyFirst); if (e) e.exerted = true }
      return null
    }
    if (t === 'ABILITY_ACTIVATED' && id && rules(id).text.includes(`${d.abilityName ?? ''} ⟳`)) {
      const e = find(p, id, d.instanceId, readyFirst); if (e) e.exerted = true
    }
    if (t === 'ABILITY_TRIGGERED') applyAbility(p, d)
    if (t === 'CHOICE_RESOLVED') applyChoice(d.choice ?? {})
    if (t === 'CARD_RETURNED' && !id && s.bouncePending > 0 && (p === 1 || p === 2)) {   // a bounce the log hides from this side
      s.bouncePending--
      const e = s.board[p].find((x) => x.instanceId && s.lastSelected.includes(x.instanceId))
      if (e) remove(p, e)
      else { s.phantom = true; s.turnStats.unresolvedBounces++ }
    }
    if (LEAVES.has(t) && id && tracked(id)) {
      if ([undefined, null, 'field', 'play'].includes(d.fromZone)) {
        const e = find(p, id, d.instanceId, (a, b) => b.damage - a.damage)
        if (e) remove(p, e)
      }
      return null
    }
    if ((t === 'DAMAGE_DEALT' || t === 'DAMAGE_COUNTERS_PUT') && id) {
      const e = find(p, id, d.instanceId); if (e) e.damage += d.damage ?? 0
    }
    if (t === 'CARD_MOVED' && id && d.locationId) {
      const e = find(p, id, d.instanceId); if (e) e.location = d.locationId
    }
    if (t === 'CARD_QUEST') {
      const e = find(p, id, null, readyFirst)
      const check = { kind: 'quest', player: p, cardId: id, reason: actorReason(p, id, e) }
      if (e) e.exerted = true
      return check
    }
    if (isDeclaration(ev)) {
      const e = find(p, id, d.instanceId, readyFirst)
      const reason = actorReason(p, id, e)
      const target = find(other(p), d.targetCardId, null, (a, b) => b.exerted - a.exerted)
      const inferredBefore = s.turnStats.inferred
      const check = { kind: 'challenge', player: p, cardId: id, reason, targetCardId: d.targetCardId, targetReason: targetReason(p, id, target) }
      check.inferred = s.turnStats.inferred > inferredBefore
      if (e) e.exerted = true
      s.lastAttack = { attacker: e, target }
      return check
    }
    if (t === 'CARD_ATTACK' && s.lastAttack) {   // resolution: each side's total damage after combat
      if (s.lastAttack.attacker) s.lastAttack.attacker.damage = d.attackerTotalDamage ?? s.lastAttack.attacker.damage
      if (s.lastAttack.target) s.lastAttack.target.damage = d.defenderTotalDamage ?? s.lastAttack.target.damage
    }
    return null
  }

  // A turn is trusted when no check failed, no exert was inferred, every exert effect named its target,
  // and no character the log hid has been left on a board.
  const turnTrusted = (checksOk) => checksOk && !s.phantom && s.turnStats.inferred === 0 && s.turnStats.exertEffects <= s.turnStats.exertChoices && s.turnStats.unresolvedBounces === 0

  return { state: s, rules, step, turnTrusted }
}

// Can attacker a (of player p) challenge target t, before Bodyguard?
function canTarget(B, p, a, t) {
  const ra = B.rules(a.cardId), rt = B.rules(t.cardId)
  if (rt.type === 'Location') return true
  if (!t.exerted) {
    const ready = ra.challengesReady || B.state.challengeReady[p] || (ra.challengesReadyDamaged && t.damage > 0) || (ra.challengesReadyVillains && rt.villain)
    if (!ready) return false
  }
  if (rt.evasive && !(ra.evasive || B.state.evasiveGrant[p] || ra.evasiveOnOwnTurn)) return false
  return true
}

// Every legal option for player p now: quest with a ready character, challenge a legal target with it, or end
// the turn. Copies with the same damage are one option.
export function legalOptions(B, p) {
  const s = B.state, o = other(p)
  const rushGranted = s.rushGrants[p] > 0   // a granted Rush lets a drying character challenge, not quest
  const options = [], seen = new Set()
  const add = (kind, a, t) => {
    const key = [kind, a?.cardId, a?.damage, t?.cardId, t?.damage].join('|')
    if (!seen.has(key)) { seen.add(key); options.push({ kind, attacker: a, target: t }) }
  }
  for (const a of s.board[p]) {
    const ra = B.rules(a.cardId)
    if (ra.type !== 'Character' || a.exerted || (a.dry && !rushGranted)) continue
    if (!ra.reckless && !a.dry) add('quest', a, null)
    let pool = s.board[o].filter((t) => canTarget(B, p, a, t))
    const guards = pool.filter((t) => B.rules(t.cardId).bodyguard && B.rules(t.cardId).type === 'Character')
    if (guards.length) pool = pool.filter((t) => guards.includes(t) || B.rules(t.cardId).type === 'Location')
    for (const t of pool) add('challenge', a, t)
  }
  add('end', null, null)
  return options
}

// Printed-stat combat outcome of a challenge option (buffs are not logged, so this is approximate).
function combat(ra, a, rt, t) {
  if (rt.type === 'Location') return { kills: Number(ra.strength + ra.challenger >= rt.willpower - t.damage), survives: 1 }
  return {
    kills: Number(Math.max(0, ra.strength + ra.challenger - rt.resist) >= rt.willpower - t.damage),
    survives: Number(Math.max(0, rt.strength - ra.resist) < ra.willpower - a.damage),
  }
}

const OPTION_FIELDS = ['a_card_id', 'a_str', 'a_wp', 'a_lore', 'a_cost', 'a_damage', 't_card_id', 't_str', 't_wp', 't_lore', 't_cost', 't_damage', 't_location', 'kills', 'survives']

function optionRow(B, p, option) {
  const { kind, attacker: a, target: t } = option
  const row = { option: kind }
  for (const k of OPTION_FIELDS) row[k] = null
  if (a) {
    const ra = B.rules(a.cardId)
    Object.assign(row, { a_card_id: a.cardId, a_str: ra.strength, a_wp: ra.willpower, a_lore: ra.lore, a_cost: ra.cost, a_damage: a.damage })
    if (t) {
      const rt = B.rules(t.cardId)
      Object.assign(row, { t_card_id: t.cardId, t_str: rt.strength, t_wp: rt.willpower, t_lore: rt.lore, t_cost: rt.cost, t_damage: t.damage, t_location: Number(rt.type === 'Location') }, combat(ra, a, rt, t))
    }
  }
  return row
}

function context(B, p) {
  const s = B.state, o = other(p)
  const chars = (q) => s.board[q].filter((e) => B.rules(e.cardId).type === 'Character')
  const sum = (q, f) => chars(q).reduce((n, e) => n + f(B.rules(e.cardId)), 0)
  return {
    turn: s.turn[p], my_lore: s.lore[p], opp_lore: s.lore[o],
    my_chars: chars(p).length, opp_chars: chars(o).length,
    my_board_cost: sum(p, (r) => r.cost), opp_board_cost: sum(o, (r) => r.cost),
    my_board_lore: sum(p, (r) => r.lore), opp_board_lore: sum(o, (r) => r.lore),
    n_ready: chars(p).filter((e) => !e.exerted && !e.dry).length, n_exerted_opp: chars(o).filter((e) => e.exerted).length,
  }
}

// Choice rows for both players: at each quest, challenge and end of turn, one row per legal option, labelled
// `chosen`. Rows are kept only for trusted turns. Also returns agreement counts for every check.
export function boardRows(logs, cardById) {
  const B = createBoard(cardById)
  const rows = []
  const checks = { quest: 0, questBad: 0, challenge: 0, challengeBad: 0, target: 0, targetBad: 0, turns: 0, turnsAgree: 0, turnsTrusted: 0, inLegalSet: 0, legalChecked: 0 }
  let turnRows = [], checksOk = true, picksOk = true, decision = 0

  function decide(p, kind, cardId, targetCardId) {
    const options = legalOptions(B, p)
    const pick = options.findIndex((o) => o.kind === kind && (kind === 'end' || o.attacker.cardId === cardId) && (kind !== 'challenge' || o.target.cardId === targetCardId))
    if (pick < 0) picksOk = false
    const ctx = { decision: decision++, player: p, ...context(B, p) }
    turnRows.push(...options.map((o, i) => ({ ...ctx, ...optionRow(B, p, o), chosen: Number(i === pick) })))
    return pick >= 0
  }

  for (const ev of logs) {
    const p = ev.player, d = ev.data ?? {}
    if (ev.type === 'TURN_START') { turnRows = []; checksOk = true; picksOk = true }
    let legal = null
    if (B.state.active && p === B.state.active) {
      if (ev.type === 'CARD_QUEST') decide(p, 'quest', d.cardId)
      if (isDeclaration(ev)) legal = decide(p, 'challenge', d.cardId, d.targetCardId)
      if (ev.type === 'TURN_END') decide(p, 'end')
    }
    const check = B.step(ev)
    if (check) {
      checks[check.kind]++
      if (check.reason) { checks[`${check.kind}Bad`]++; checksOk = false }
      if (check.kind === 'challenge') {
        checks.target++
        if (check.targetReason) { checks.targetBad++; checksOk = false }
        if (!check.reason && !check.targetReason && !check.inferred && legal !== null) { checks.legalChecked++; checks.inLegalSet += Number(legal) }
      }
    }
    if (ev.type === 'TURN_END' && p === B.state.active) {
      checks.turns++
      checks.turnsAgree += Number(checksOk)
      if (picksOk && B.turnTrusted(checksOk)) { checks.turnsTrusted++; rows.push(...turnRows) }
      turnRows = []
    }
  }
  return { rows, checks }
}
