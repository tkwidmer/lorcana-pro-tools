#!/usr/bin/env node
// Pull every ranked duels.ink game for each team account into logs/<account>/, for coaching and training.
//   node scripts/pull-team-gamelogs.mjs [account ...]      (default: every account in DUELS_TOKEN / DUELS_TOKENS)
// Per account: logs/<account>/matches.jsonl (one match-history row per ranked game, plus `excluded`) and one
// <game_id>.logs.gz per kept game, stored exactly as the CDN serves it. Re-runs only fetch new games.
// Path: GET /api/me/match-history (250 rows/page) → POST /api/me/bulk-gamelogs (1000 ids/call, CDN URLs)
// → download at ≤3 in flight (https://duels.ink/api-docs.md, "Data export"). The manifest answers with /g/ URLs, which are
// limited to 30 a minute per account, so run accounts as separate processes to pull them in parallel.
// Excluded, matching the app (AnalyticsPage's AFK filter and parseGamelog's `disconnected`): result
// 'abandoned', victoryReason 'afk' or 'timeout', or a PLAYER_DISCONNECTED event in the log.
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

const BASE = 'https://duels.ink'
const tokens = {}
if (process.env.DUELS_TOKEN?.trim()) tokens.teagan = process.env.DUELS_TOKEN.trim() // "me" in the MCP server
for (const e of (process.env.DUELS_TOKENS ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
  const i = e.indexOf('='); tokens[e.slice(0, i).trim()] = e.slice(i + 1).trim()
}
const accounts = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(tokens)

async function duels(url, token, init = {}) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })
    if (res.status !== 429) return res
    await new Promise(r => setTimeout(r, 1000 * Number(res.headers.get('retry-after') || 5)))
  }
  throw new Error(`rate limited past retries: ${url}`)
}

function exclusion(row, gz) {
  if (row.result === 'abandoned') return 'abandoned'
  const logs = JSON.parse(gunzipSync(gz).toString('utf8'))
  let reason = null
  for (const e of logs) {
    if (e.type === 'PLAYER_DISCONNECTED') reason = 'disconnected'
    if ((e.type === 'GAME_END' || e.type === 'GAME_CONCEDED') && ['afk', 'timeout'].includes(e.data?.victoryReason)) return e.data.victoryReason
  }
  return reason
}

for (const account of accounts) {
  const token = tokens[account]
  if (!token) throw new Error(`no token for "${account}"; known: ${Object.keys(tokens).join(', ')}`)
  const dir = path.join('logs', account); fs.mkdirSync(dir, { recursive: true })
  const indexPath = path.join(dir, 'matches.jsonl')
  const index = new Map(fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8').split('\n').filter(Boolean).map(l => { const r = JSON.parse(l); return [r.game_id, r] }) : [])

  // 1. Match history, every page.
  const rows = []; let cursor
  do {
    const q = new URLSearchParams({ format: 'json', limit: '250', ...(cursor ? { cursor } : {}) })
    const res = await duels(`${BASE}/api/me/match-history?${q}`, token)
    if (!res.ok) throw new Error(`${account}: match-history ${res.status}`)
    const page = await res.json(); rows.push(...page.games); cursor = page.next_cursor
  } while (cursor)
  const ranked = rows.filter(r => r.ranked)
  // A log already on disk (from an interrupted run) is kept without refetching.
  for (const r of ranked) if (!index.has(r.game_id) && fs.existsSync(path.join(dir, `${r.game_id}.logs.gz`))) index.set(r.game_id, { ...r, excluded: exclusion(r, fs.readFileSync(path.join(dir, `${r.game_id}.logs.gz`))) })
  const todo = ranked.filter(r => !index.has(r.game_id))
  console.error(`${account}: ${rows.length} games, ${ranked.length} ranked, ${todo.length} new`)

  // 2. Manifest, 1000 ids per call. 3. Download, 3 in flight, then classify.
  let kept = 0, excluded = 0, missing = 0
  for (let i = 0; i < todo.length; i += 1000) {
    const chunk = todo.slice(i, i + 1000)
    const res = await duels(`${BASE}/api/me/bulk-gamelogs`, token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: chunk.map(r => r.game_id) }) })
    if (!res.ok) throw new Error(`${account}: bulk-gamelogs ${res.status} ${(await res.text()).slice(0, 200)}`)
    const manifest = await res.json()
    for (const id of manifest.missing ?? []) { missing++; index.set(id, { ...chunk.find(r => r.game_id === id), excluded: 'no-gamelog' }) }
    const queue = [...manifest.files]
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (queue.length) {
        const f = queue.shift(); const row = chunk.find(r => r.game_id === f.id)
        const res = await duels(f.url, token)
        if (!res.ok) { console.error(`  ${f.id}: ${res.status}`); index.set(f.id, { ...row, excluded: `http-${res.status}` }); continue }
        const gz = Buffer.from(await res.arrayBuffer())
        const reason = exclusion(row, gz)
        if (reason) excluded++; else { kept++; fs.writeFileSync(path.join(dir, `${f.id}.logs.gz`), gz) }
        index.set(f.id, { ...row, excluded: reason })
      }
    }))
    fs.writeFileSync(indexPath, [...index.values()].sort((a, b) => a.started_at.localeCompare(b.started_at)).map(r => JSON.stringify(r)).join('\n') + '\n')
    console.error(`  ${Math.min(i + 1000, todo.length)}/${todo.length}: kept ${kept}, excluded ${excluded}, missing ${missing}`)
  }
}
