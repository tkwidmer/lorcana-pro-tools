#!/usr/bin/env node
// Pull a player's duels.ink games and write coach-readable files: one turn-by-turn narrative per game,
// a per-game metrics table, deck-version diffs, and the rules text of every card that showed up.
// Usage: node pull-games.mjs --account ibai --from 2026-09-26 --deck Amethyst/Emerald [--opp Amber/Sapphire]  (color order does not matter)
//        [--opp-card "Judy Hopps"] [--to ISO] [--out dir]
// Tokens: DUELS_TOKEN (account "me") and DUELS_TOKENS ("name=token,..."), same as mcp-server/index.js.
import { gunzipSync } from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

const args = {}
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) { const k = process.argv[i].slice(2); const v = process.argv[i + 1]; args[k] = v && !v.startsWith('--') ? (i++, v) : true }
const account = args.account ?? 'me'
const out = args.out ?? `coach-${account}-${new Date().toISOString().slice(0, 10)}`
const tokens = { me: process.env.DUELS_TOKEN?.trim() }
for (const e of (process.env.DUELS_TOKENS ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
  const i = e.indexOf('='); tokens[e.slice(0, i).trim()] = e.slice(i + 1).trim()
}
const token = tokens[account]
if (!token) throw new Error(`no token for account "${account}" (DUELS_TOKEN / DUELS_TOKENS)`)
const auth = { headers: { Authorization: `Bearer ${token}` } }
const BASE = 'https://duels.ink'
const pair = s => (s ?? '').split('/').sort().join('/')

fs.mkdirSync(path.join(out, 'raw'), { recursive: true })

// 1. Match history (paged), filtered.
let rows = [], cursor
do {
  const q = new URLSearchParams({ format: 'json', limit: '250', ...(args.from ? { from: args.from } : {}), ...(args.to ? { to: args.to } : {}), ...(cursor ? { cursor } : {}) })
  const res = await fetch(`${BASE}/api/me/match-history?${q}`, auth)
  if (!res.ok) throw new Error(`match-history ${res.status}`)
  const page = await res.json(); rows.push(...page.games); cursor = page.next_cursor
} while (cursor)
if (args.deck) rows = rows.filter(r => pair(r.your_deck_colors) === pair(args.deck))
rows.sort((a, b) => a.started_at.localeCompare(b.started_at))
const deckRows = rows // every game of this deck: deck versions are built from these
if (args.opp) rows = rows.filter(r => pair(r.opp_deck_colors) === pair(args.opp))
console.error(`${deckRows.length} games of the deck, ${rows.length} vs --opp`)

// 2. Cards (LorcanaJSON), keyed by duels id.
const cardsRes = await fetch('https://lorcanajson.org/files/current/en/allCards.json')
const cards = {}
for (const c of (await cardsRes.json()).cards) {
  const k = c.promoGrouping ? `${c.setCode}-${c.promoGrouping}-${c.number}` : `${c.setCode}-${c.number}`
  cards[k] ??= { name: c.fullName ?? c.name, cost: c.cost, inkwell: c.inkwell, color: c.color, type: c.type, strength: c.strength, willpower: c.willpower, lore: c.lore, text: c.fullText ?? '' }
}
const nameOf = id => cards[id]?.name ?? id
const byName = {}
for (const c of Object.values(cards)) byName[c.name] ??= c

// 3. Raw gamelogs.
const logs = {}
for (const r of rows) {
  const f = path.join(out, 'raw', `${r.game_id}.json`)
  if (!fs.existsSync(f)) {
    let res
    for (let attempt = 0; attempt < 6; attempt++) {
      res = await fetch(`${BASE}/g/${r.game_id}`, auth)
      if (res.status !== 429) break
      await new Promise(x => setTimeout(x, 1000 * Number(res.headers.get('retry-after') || 5)))
    }
    if (!res.ok) { console.error(`skip ${r.game_id}: ${res.status}`); continue }
    fs.writeFileSync(f, gunzipSync(Buffer.from(await res.arrayBuffer())))
  }
  logs[r.game_id] = JSON.parse(fs.readFileSync(f, 'utf8'))
}
const games = rows.filter(r => logs[r.game_id])
const revealedBy = (r, who) => new Set(logs[r.game_id].filter(e => e.player === who && ['CARD_PLAYED', 'CARD_INKED', 'CARD_DISCARDED'].includes(e.type)).map(e => e.data.cardName).filter(Boolean))
const kept = args['opp-card'] ? games.filter(r => [...revealedBy(r, 3 - r.your_player)].some(n => n.includes(args['opp-card']))) : games
console.error(`${kept.length} games after --opp-card filter`)

// 4. Deck versions keyed by card name (reprints collapse), with diffs and per-card win rates.
const deckKey = r => { const c = {}; for (const x of r.your_decklist) c[nameOf(x.cardId)] = (c[nameOf(x.cardId)] ?? 0) + x.count; return c }
const versions = []
for (const r of deckRows) {
  const k = deckKey(r); const sig = JSON.stringify(Object.entries(k).sort())
  let v = versions.find(v => v.sig === sig)
  if (!v) { v = { sig, cards: k, games: [] }; versions.push(v) }
  v.games.push(r)
}
const vid = new Map(); versions.forEach((v, i) => v.games.forEach(r => vid.set(r.game_id, i + 1)))
const W = rs => rs.filter(r => r.result === 'win').length
let vt = `# Deck versions (${deckRows.length} games of the deck, ${W(deckRows)}-${deckRows.length - W(deckRows)}), keyed by card name; 'filtered' = the games selected by --opp/--opp-card\n`
versions.forEach((v, i) => {
  const k = kept.filter(r => vid.get(r.game_id) === i + 1)
  vt += `V${i + 1}: ${v.games[0].started_at.slice(0, 10)}..${v.games.at(-1).started_at.slice(0, 10)} n=${v.games.length} ${W(v.games)}-${v.games.length - W(v.games)}` + (args.opp || args['opp-card'] ? ` | filtered ${W(k)}-${k.length - W(k)}` : '') + '\n'
  if (i) {
    const prev = versions[i - 1].cards, cur = v.cards, add = [], cut = []
    for (const n of new Set([...Object.keys(prev), ...Object.keys(cur)])) {
      const d = (cur[n] ?? 0) - (prev[n] ?? 0)
      if (d > 0) add.push(`+${d} ${n}`); if (d < 0) cut.push(`${d} ${n}`)
    }
    vt += `    in: ${add.join(', ')}\n    out: ${cut.join(', ')}\n`
  }
})
vt += `\n# V1 list\n` + Object.entries(versions[0].cards).map(([n, c]) => `${c} ${n}`).join('\n')
vt += `\n\n# Latest list (V${versions.length})\n` + Object.entries(versions.at(-1).cards).map(([n, c]) => `${c} ${n}${byName[n]?.inkwell === false ? ' (uninkable)' : ''}`).join('\n')
const core = Object.keys(versions[0].cards).filter(n => versions.every(v => v.cards[n]))
vt += `\n\n# In every version: ${core.join(', ')}\n\n# Flex cards: games in deck, win% (all), then in the filtered games\n`
const pres = {}
for (const r of deckRows) for (const n of Object.keys(deckKey(r))) { if (core.includes(n)) continue; pres[n] ??= { g: 0, w: 0, fg: 0, fw: 0 }; pres[n].g++; pres[n].w += r.result === 'win'; if (kept.includes(r)) { pres[n].fg++; pres[n].fw += r.result === 'win' } }
for (const [n, p] of Object.entries(pres).sort((a, b) => b[1].g - a[1].g)) vt += `${n.padEnd(46)} ${String(p.w).padStart(3)}/${String(p.g).padStart(3)} ${String(Math.round(100 * p.w / p.g)).padStart(3)}%   filtered ${p.fw}/${p.fg}\n`
fs.writeFileSync(path.join(out, 'versions.txt'), vt)

// 5. Narratives + metrics, from the raw events (no parser in between).
const short = n => (n ?? '?').split(' - ')[0]
const KILL_SRC = { CHAL: 'C' }
let narr = '', met = `# Per game. ink@6/8/10 = inkwell size at start of your T6/T8/T10 (then opp's). noInk = your turns after T1 with no ink; stall = longest run of them.\n# lore@8 = lore at end of T8. minHand = smallest hand T5-T10; dead = max uninkables held T5-T10. sweeps = turns you killed 2+ (turn:kills). killedBy = your banished characters by source. gift = a win the opponent handed over: conceded while ahead on lore, or sat 3+ turns without inking.\n`
met += `date       res  pos  T | gift               | ink@6/8/10 opp@6/8/10 | noInk stall | lore@8 opp@8 | minHand dead | sweeps | killedBy | mulligan sent\n`
const agg = { win: {}, loss: {} }
const add = (res, k, v) => ((agg[res][k] ??= []).push(v))
for (const r of kept) {
  const me = r.your_player, opp = 3 - me, L = logs[r.game_id]
  narr += `\n######## ${r.started_at.slice(0, 16)} V${vid.get(r.game_id)} ${r.result.toUpperCase()} ${r.went_first ? 'FIRST' : 'SECOND'} lore ${r.your_lore}-${r.opp_lore} ${r.end_reason} opp=${r.opp_display_name} (${r.opp_deck_colors}) oppMMR=${r.opp_mmr_before} myMMR=${r.mmr_before} replay=${r.replay_url}\n`
  let hand = [], ink = { 1: 0, 2: 0 }, lore = { 1: {}, 2: {} }, inkAt = { 1: {}, 2: {} }, turn = 0, owner = null, inkedThisTurn = false
  const noInk = [], oppNoInk = [], handSz = {}, dead = {}, sweeps = [], killed = {}, sent = []
  let ended = false
  let kills = 0, lastSrc = null, cur = null, lines = [], lastInked = null
  const flush = () => { if (cur) narr += cur + lines.join(' | ') + '\n'; cur = null; lines = [] }
  for (const e of L) {
    const t = e.type, d = e.data, p = e.player
    if (t === 'INITIAL_HAND' && p === me) hand = d.initialHandCards.map(c => c.name)
    else if (t === 'MULLIGAN') {
      if (p === me) {
        for (const c of d.mulliganedCards ?? []) { hand.splice(hand.indexOf(c.name), 1); sent.push(short(c.name)) }
        hand.push(...(d.drawnCards ?? []).map(c => c.name))
        narr += `  mulligan: sent [${sent}] -> kept [${hand.map(short)}]\n`
      } else narr += `  opp mulliganed ${d.mulliganCount}\n`
    } else if (t === 'TURN_START') {
      flush()
      if (owner === me && turn >= 2 && !inkedThisTurn) noInk.push(turn)
      if (owner === opp && turn >= 2 && !inkedThisTurn) oppNoInk.push(turn)
      if (owner === me && kills >= 2) sweeps.push(`T${turn}:${kills}`)
      if (owner === me && turn) { handSz[turn] = hand.length; dead[turn] = hand.filter(n => byName[n]?.inkwell === false).length }
      owner = p; turn = e.turnNumber; inkedThisTurn = false; kills = 0
      inkAt[1][turn] ??= ink[1]; inkAt[2][turn] ??= ink[2]
      cur = `T${String(turn).padEnd(2)} ${p === me ? 'ME ' : 'OPP'} ink=${ink[p]} ` + (p === me ? `hand[${hand.length}]=[${hand.map(short)}] ` : '')
    } else if (t === 'CARD_DRAWN' && p === me && d.cardName) hand.push(d.cardName)
    else if (t === 'CARD_INKED' || t === 'CARD_PUT_INTO_INKWELL') {
      ink[p]++; inkedThisTurn = true; lastInked = d.cardName; if (p === me) { const i = hand.indexOf(d.cardName); if (i >= 0) hand.splice(i, 1) }
      lines.push(t === 'CARD_INKED' ? `ink ${short(d.cardName)}` : '+ink(deck)')
    } else if (t === 'FREE_UNDO' || t === 'CHOICE_UNDO') {
      // Reverts the action just before it. Only an undone ink changes state we track.
      const last = lines.at(-1) ?? ''
      if (last.startsWith('ink ') && p === owner) { ink[p]--; if (p === me && lastInked) hand.push(lastInked); lines[lines.length - 1] = `${last} (undone)` }
      else lines.push('undo')
    } else if (t === 'CARD_PLAYED') {
      if (p === me) { const i = hand.indexOf(d.cardName); if (i >= 0) hand.splice(i, 1) }
      lastSrc = d.cardName
      lines.push(d.usedShift ? `shift ${short(d.cardName)}(${d.shiftCost}) onto ${short(d.shiftTargetCardName)}` : d.singerCardName ? `sing ${short(d.cardName)} off ${short(d.singerCardName)}` : `play ${short(d.cardName)}(${d.cardCost ?? '?'})`)
    } else if (t === 'CARD_DISCARDED') {
      if (p === me) { const i = hand.indexOf(d.cardName); if (i >= 0) hand.splice(i, 1) }
      lines.push(`disc ${short(d.cardName)}`)
    } else if (t === 'CARD_QUEST') { lore[p][turn] = d.newLoreTotal; lines.push(`Q ${short(d.cardName)}+${d.loreGained}=${d.newLoreTotal}`) }
    else if (t === 'CARD_ATTACK') { lastSrc = 'CHAL'; if (!('cardCost' in d)) lines.push(`CHAL ${short(d.cardName)}->${short(d.targetCardName)} (${d.attackerBaseStrength ?? '?'}+${d.challengerBonus ?? 0} vs ${d.defenderStrength ?? '?'})`) }
    else if (t === 'CARD_DESTROYED') {
      lines.push(`X${p === me ? 'me' : 'opp'}:${short(d.cardName)}`)
      if (p === opp && owner === me) kills++
      if (p === me && owner === opp) { const k = `${KILL_SRC[lastSrc] ?? short(lastSrc)}:${short(d.cardName)}`; killed[k] = (killed[k] ?? 0) + 1 }
    } else if (t === 'SUPPORT_GIVEN') lines.push(`support ${short(d.cardName)}->${short(d.targetCardName)} +${d.supportBonus}`)
    else if (t === 'ABILITY_ACTIVATED') lines.push(`act ${short(d.cardName)}:${d.abilityName}`)
    else if (t === 'CARD_RETURNED_TO_DECK') lines.push(`bounce ${short(d.cardName)}`)
    else if (t === 'CARD_RETURNED') lines.push(`return ${short(d.cardName)}`)
    else if (t === 'CARD_REVEALED') lines.push(`reveal ${short(d.cardName)}`)
    else if (t === 'DAMAGE_DEALT') lines.push(`dmg ${d.damage ?? '?'}->${short(d.targetCardName ?? d.cardName)}`)
    else if (t === 'ABILITY_TRIGGERED' && d.effectDescription && /draw|lore|damage|banish|discard|return|ready|gain|ink/.test(d.effectDescription)) lines.push(`[${short(d.abilitySourceCardName)}: ${d.effectDescription.slice(0, 50)}]`)
    else if (t === 'GAME_END' && !ended) { ended = true; flush(); narr += `  END winner=${d.winner === me ? 'me' : 'opp'} ${d.victoryReason ?? ''} lore me=${Object.values(lore[me]).at(-1) ?? 0} opp=${Object.values(lore[opp]).at(-1) ?? 0}\n` }
  }
  flush()
  const at = (m, T) => { let v = 0; for (const [k, x] of Object.entries(m)) if (+k <= T) v = x; return v }
  let stall = 0, best = 0, prev = -9; for (const tn of noInk) { stall = tn === prev + 1 ? stall + 1 : 1; best = Math.max(best, stall); prev = tn }
  const mid = Object.entries(handSz).filter(([k]) => k >= 5 && k <= 10).map(([, v]) => v)
  const minHand = mid.length ? Math.min(...mid) : '-'
  const deadMax = Math.max(0, ...Object.entries(dead).filter(([k]) => k >= 5 && k <= 10).map(([, v]) => v))
  let os = 0, ob = 0, op = -9; for (const tn of oppNoInk) { os = tn === op + 1 ? os + 1 : 1; ob = Math.max(ob, os); op = tn }
  const gift = r.result !== 'win' ? '-' : r.end_reason === 'concede' && r.opp_lore > r.your_lore ? 'opp-conceded-ahead' : ob >= 3 ? `opp-ink-stall(${ob})` : '-'
  met += `${r.started_at.slice(0, 10)} ${r.result.padEnd(4)} ${r.went_first ? '1st' : '2nd'} ${String(turn).padStart(2)} | ${gift.padEnd(18)} | ${at(inkAt[me], 6)}/${at(inkAt[me], 8)}/${at(inkAt[me], 10)} ${at(inkAt[opp], 6)}/${at(inkAt[opp], 8)}/${at(inkAt[opp], 10)} | ${noInk.length} ${best} | ${at(lore[me], 8)} ${at(lore[opp], 8)} | ${minHand} ${deadMax} | ${sweeps.join(' ') || '-'} | ${Object.entries(killed).map(([k, v]) => v > 1 ? `${k}x${v}` : k).join(', ') || '-'} | ${sent.join(', ') || '-'}\n`
  const res = r.result; if (!agg[res]) continue
  add(res, 'noInk', noInk.length); add(res, 'stall', best); add(res, 'ink@8', at(inkAt[me], 8)); add(res, 'oppInk@8', at(inkAt[opp], 8)); add(res, 'lore@8', at(lore[me], 8)); add(res, 'oppLore@8', at(lore[opp], 8)); add(res, 'minHand', minHand === '-' ? 0 : minHand); add(res, 'dead', deadMax); add(res, 'sweepKills', sweeps.reduce((s, x) => s + +x.split(':')[1], 0)); add(res, 'wentFirst', +r.went_first)
}
met += '\n# Averages\n'
for (const res of ['win', 'loss']) { const a = agg[res]; const n = a.noInk?.length ?? 0; met += `${res} n=${n}` + Object.entries(a).map(([k, v]) => ` ${k}=${(v.reduce((s, x) => s + x, 0) / n).toFixed(1)}`).join('') + '\n' }
fs.writeFileSync(path.join(out, 'narratives.txt'), narr)
fs.writeFileSync(path.join(out, 'metrics.txt'), met)

// 6. Rules text for every card that appeared on either side.
const seen = new Set()
for (const r of kept) for (const e of logs[r.game_id]) for (const n of [e.data?.cardName, e.data?.targetCardName, e.data?.abilitySourceCardName]) if (n) seen.add(n)
for (const r of kept) for (const x of r.your_decklist) seen.add(nameOf(x.cardId))
for (const n of Object.keys(versions.at(-1).cards)) seen.add(n)
fs.writeFileSync(path.join(out, 'cards.txt'), [...seen].sort().map(n => { const c = byName[n]; return c ? `${n} [${c.color} ${c.cost} ${c.type}${c.inkwell === false ? ' UNINKABLE' : ''}${c.strength != null ? ` ${c.strength}/${c.willpower}/${c.lore}` : ''}]: ${c.text.replace(/\s+/g, ' ')}` : `${n}: (not in LorcanaJSON)` }).join('\n\n'))
fs.writeFileSync(path.join(out, 'games.json'), JSON.stringify(kept.map(r => ({ ...r, version: vid.get(r.game_id) })), null, 1))
console.error(`wrote ${out}/{narratives,metrics,versions,cards}.txt and games.json`)
