#!/usr/bin/env node
// Sanity-check parseGamelog + leakDetection against the real gamelog fixtures.
// Usage: node fixtures/validate-leaks.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseGamelog } from '../src/lib/parseGamelog.js'
import { detectLeaks, summarizeLeaks } from '../src/lib/leakDetection.js'

const dir = path.dirname(fileURLToPath(import.meta.url))
const fxDir = path.join(dir, 'gamelogs')
const index = JSON.parse(fs.readFileSync(path.join(fxDir, 'index.json'), 'utf8'))

const games = index.games.map(meta => {
  const logs = JSON.parse(fs.readFileSync(path.join(fxDir, meta.file), 'utf8'))
  const parsed = parseGamelog(meta.file.replace('.json', ''), logs, { yourPlayerNum: meta.myPlayerNum })
  return { ...parsed, _rawLogs: logs, myPlayerNum: meta.myPlayerNum, expectedWinner: meta.winner }
})

let failures = 0
for (const g of games) {
  if (g.winner !== g.expectedWinner) {
    console.error(`FAIL ${g.id}: parsed winner ${g.winner} != expected ${g.expectedWinner}`)
    failures++
  }
  const won = g.winner === g.myPlayerNum
  const { leaks } = detectLeaks(g, g.myPlayerNum)
  console.log(`\n${g.id.slice(0, 8)} — P${g.myPlayerNum} ${won ? 'WON' : 'LOST'} (${g.turnCount} rounds, ${g._rawLogs.length} events)`)
  if (!leaks.length) console.log('  (no leaks)')
  for (const l of leaks) console.log(`  - ${l.type} [${l.severity}] x${l.count}: ${l.instances.map(i => i.text).join('; ')}`)
}

console.log('\n========= AGGREGATE RANKING =========')
const sum = summarizeLeaks(games)
console.log(`analyzed=${sum.analyzed} overallWinRate=${(sum.overallWinRate * 100).toFixed(0)}%`)
for (const r of sum.ranked) {
  const wr = r.winRateWhenPresent != null ? `${(r.winRateWhenPresent * 100).toFixed(0)}%` : 'n/a'
  console.log(`  ${r.type}: ${r.gamesAffected}/${sum.analyzed} games, winRateWhenPresent=${wr}, impact=${r.impact.toFixed(2)}`)
}

process.exit(failures ? 1 : 0)
