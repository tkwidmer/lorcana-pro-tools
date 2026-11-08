#!/usr/bin/env node
// Mulligan and ink decision rows for training, from every kept game under logs/<account>/.
//   node scripts/decision-rows.mjs [account ...]      (default: every account in logs/)
// Writes decisions/mulligan.csv and decisions/ink.csv (one row per candidate card, labelled
// `kept` / `inked`) and prints how far the hand reconstruction can be trusted. The rows come from
// src/lib/decisionRows.js; card features from LorcanaJSON.
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { decisionRows } from '../src/lib/decisionRows.js'
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
const mulliganOut = writer(path.join(OUT, 'mulligan.csv')), inkOut = writer(path.join(OUT, 'ink.csv'))
const totals = {}, rows = { mulligan: 0, ink: 0 }
let games = 0
for (const account of accounts) {
  for (const line of fs.readFileSync(path.join('logs', account, 'matches.jsonl'), 'utf8').split('\n').filter(Boolean)) {
    const m = JSON.parse(line)
    if (m.excluded) continue
    const logs = JSON.parse(gunzipSync(fs.readFileSync(path.join('logs', account, `${m.game_id}.logs.gz`))))
    const out = decisionRows(logs, m.your_player, cardById)
    const game = {
      account, game_id: m.game_id, started_at: m.started_at, queue_id: m.queue_id,
      my_colors: m.your_deck_colors, opp_colors: m.opp_deck_colors, went_first: m.went_first ? 1 : 0,
      mmr: m.mmr_before, opp_mmr: m.opp_mmr_before, won: m.result === 'win' ? 1 : 0,
    }
    for (const r of out.mulligan) mulliganOut.write({ ...game, ...r })
    for (const { decision, ...r } of out.ink) inkOut.write({ ...game, decision_id: `${m.game_id}:${decision}`, ...r })
    rows.mulligan += out.mulligan.length; rows.ink += out.ink.length; games++
    for (const [k, v] of Object.entries(out.checks)) totals[k] = (totals[k] ?? 0) + v
  }
}
mulliganOut.close(); inkOut.close()

console.log(`${games} games → ${rows.mulligan} mulligan rows, ${rows.ink} ink rows in ${OUT}/`)
console.log(`ink decisions with a trusted hand: ${totals.certainInkDecisions} of ${totals.inkDecisions} (${(100 * totals.certainInkDecisions / totals.inkDecisions).toFixed(1)}%)`)
console.log(`full-hand checkpoints matching the tracked hand: ${totals.exact} of ${totals.checkpoints} (${(100 * totals.exact / totals.checkpoints).toFixed(1)}%)`)
console.log(`hand lost by: ${totals.undos} undos, ${totals.misses} unexplained misses, ${totals.unseenDraws} unnamed draws`)
