#!/usr/bin/env node
// Mulligan, ink and quest/challenge decision rows for training, from every kept game under logs/<account>/.
//   node scripts/decision-rows.mjs [account ...]      (default: every account in logs/)
// Writes decisions/mulligan.csv and decisions/ink.csv (one row per candidate card, labelled
// `kept` / `inked`, from src/lib/decisionRows.js) and decisions/choices.csv (one row per legal quest,
// challenge or end-turn option, labelled `chosen`, from src/lib/boardState.js), and prints how far the
// hand and board reconstructions can be trusted. Card features from LorcanaJSON.
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { decisionRows, deckShape } from '../src/lib/decisionRows.js'
import { boardRows } from '../src/lib/boardState.js'
import { buildCardIdToCard } from '../src/lib/cardIdResolver.js'

const OUT = 'decisions'
const accounts = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync('logs').filter(a => fs.existsSync(path.join('logs', a, 'matches.jsonl')))

const res = await fetch('https://lorcanajson.org/files/current/en/allCards.json')
if (!res.ok) throw new Error(`LorcanaJSON ${res.status}`)
const cardById = buildCardIdToCard((await res.json()).cards)

const csvCell = (v) => v == null ? '' : typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : String(v)
function writer(file) {
  const fd = fs.openSync(file, 'w'); let cols = null
  return {
    write(row) {
      if (!cols) { cols = Object.keys(row); fs.writeSync(fd, cols.join(',') + '\n') }
      fs.writeSync(fd, cols.map(c => csvCell(row[c])).join(',') + '\n')
    },
    close: () => fs.closeSync(fd),
  }
}

fs.mkdirSync(OUT, { recursive: true })
const mulliganOut = writer(path.join(OUT, 'mulligan.csv')), inkOut = writer(path.join(OUT, 'ink.csv')), choicesOut = writer(path.join(OUT, 'choices.csv'))
const totals = {}, board = {}, rows = { mulligan: 0, ink: 0, choices: 0 }
let games = 0
for (const account of accounts) {
  for (const line of fs.readFileSync(path.join('logs', account, 'matches.jsonl'), 'utf8').split('\n').filter(Boolean)) {
    const m = JSON.parse(line)
    if (m.excluded) continue
    const logs = JSON.parse(gunzipSync(fs.readFileSync(path.join('logs', account, `${m.game_id}.logs.gz`))))
    const out = decisionRows(logs, m.your_player, cardById, m.your_decklist)
    const game = {
      account, game_id: m.game_id, started_at: m.started_at, queue_id: m.queue_id,
      my_colors: m.your_deck_colors, opp_colors: m.opp_deck_colors, went_first: m.went_first ? 1 : 0,
      mmr: m.mmr_before, opp_mmr: m.opp_mmr_before, won: m.result === 'win' ? 1 : 0,
      ...deckShape(m.your_decklist, cardById),
    }
    const name = (r) => ({ card_name: cardById[r.card_id]?.fullName })
    for (const r of out.mulligan) mulliganOut.write({ ...game, ...r, ...name(r) })
    for (const { decision, ...r } of out.ink) inkOut.write({ ...game, decision_id: `${account}:${m.game_id}:${decision}`, ...r, ...name(r) })
    rows.mulligan += out.mulligan.length; rows.ink += out.ink.length; games++

    // Quest / challenge / end-turn choices of both players, on turns where the rebuilt board agrees with the log.
    const b = boardRows(logs, cardById)
    const side = (p) => {
      const me = p === m.your_player
      return { is_me: me ? 1 : 0, mmr: me ? m.mmr_before : m.opp_mmr_before, went_first: me === Boolean(m.went_first) ? 1 : 0, won: me === (m.result === 'win') ? 1 : 0 }
    }
    for (const { decision, player, ...r } of b.rows) choicesOut.write({ account, game_id: m.game_id, started_at: m.started_at, decision_id: `${account}:${m.game_id}:${decision}`, ...side(player), ...r })
    rows.choices += b.rows.length
    for (const [k, v] of Object.entries(b.checks)) board[k] = (board[k] ?? 0) + v
    for (const [k, v] of Object.entries(out.checks)) totals[k] = (totals[k] ?? 0) + v
  }
}
mulliganOut.close(); inkOut.close(); choicesOut.close()

console.log(`${games} games → ${rows.mulligan} mulligan rows, ${rows.ink} ink rows in ${OUT}/`)
console.log(`ink decisions with a trusted hand: ${totals.certainInkDecisions} of ${totals.inkDecisions} (${(100 * totals.certainInkDecisions / totals.inkDecisions).toFixed(1)}%)`)
console.log(`full-hand checkpoints matching the tracked hand: ${totals.exact} of ${totals.checkpoints} (${(100 * totals.exact / totals.checkpoints).toFixed(1)}%)`)
console.log(`hand lost by: ${totals.undos} undos, ${totals.misses} unexplained misses, ${totals.unseenDraws} unnamed draws`)
const pct = (n, d) => `${(100 * n / d).toFixed(1)}%`
console.log(`board agrees with quests ${pct(board.quest - board.questBad, board.quest)}, challengers ${pct(board.challenge - board.challengeBad, board.challenge)}, targets ${pct(board.target - board.targetBad, board.target)}; turns agree ${pct(board.turnsAgree, board.turns)}`)
console.log(`logged challenges in the legal option set: ${pct(board.inLegalSet, board.legalChecked)}; ${rows.choices} choice rows from ${board.turnsTrusted} trusted turns (${pct(board.turnsTrusted, board.turns)})`)
