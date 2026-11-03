#!/usr/bin/env node
// duels.ink MCP server (stdio). Reads your own games with a personal API token.
// API reference: https://duels.ink/api-docs.md
import { gunzipSync } from 'node:zlib'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { parseGamelog } from '../src/lib/parseGamelog.js'

const BASE = 'https://duels.ink'
const TOKEN = process.env.DUELS_TOKEN?.trim()
if (!TOKEN) throw new Error('DUELS_TOKEN is not set. Mint one at https://duels.ink/account → API Tokens.')

async function duels(path) {
  // Gamelogs 302 to a CDN; fetch drops Authorization on the cross-origin hop, which the CDN doesn't need.
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!res.ok) {
    const retry = res.headers.get('retry-after')
    throw new Error(`duels.ink ${res.status} on ${path}${retry ? ` (retry after ${retry}s)` : ''}: ${(await res.text()).slice(0, 300)}`)
  }
  return res
}

const json = async path => (await duels(path)).json()
const text = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] })
const query = params => new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]))

const server = new McpServer({ name: 'duels-ink', version: '0.1.0' })

server.registerTool('whoami', {
  description: 'The duels.ink account behind the token: stable user id, display name, avatar.',
}, async () => text(await json('/api/me')))

server.registerTool('get_match_history', {
  description: 'Your finished duels.ink games, newest first, one row per game (result, lore, decks colors, your decklist, opponent name and colors, MMR, went_first, game_id). Page with next_cursor. The opponent decklist is never included; use get_game to see what they played.',
  inputSchema: {
    limit: z.number().int().min(1).max(250).default(25).describe('Rows per page'),
    cursor: z.string().optional().describe('next_cursor from the previous page, verbatim'),
    from: z.string().optional().describe('Inclusive lower bound, ISO 8601'),
    to: z.string().optional().describe('Exclusive upper bound, ISO 8601'),
    source: z.string().optional().describe("Comma-separated subset of 'matchmaking', 'private', 'bot'"),
    queue: z.string().optional().describe('Comma-separated queue ids, e.g. core-bo1, infinity-bo3'),
  },
}, async args => text(await json(`/api/me/match-history?${query({ format: 'json', ...args })}`)))

server.registerTool('get_game', {
  description: "One of your games parsed from its gamelog: winner, turn-by-turn ink/lore/plays, every card played, challenges, lore progression, mulligans, per-card stats for both players. The log is your perspective: the opponent's draws and hand are hidden, so their p1/p2 cardList holds only the cards they revealed (played, inked, discarded). Pass your_player from the match-history row so 'you' is resolved.",
  inputSchema: {
    game_id: z.string().describe('game_id from get_match_history'),
    your_player: z.union([z.literal(1), z.literal(2)]).optional().describe('your_player from the match-history row'),
  },
}, async ({ game_id, your_player }) => {
  const res = await duels(`/g/${encodeURIComponent(game_id)}`)
  const logs = JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8'))
  const game = parseGamelog(game_id, logs, { yourPlayerNum: your_player })
  // cards duplicates cardList, keyed by name. inferredOppDecklist is built from the
  // opponent's draws, which a perspective-filtered log blanks, so it is always empty here.
  delete game.p1.cards
  delete game.p2.cards
  delete game.inferredOppDecklist
  return text(game)
})

server.registerTool('list_my_decks', {
  description: 'Your saved duels.ink decks (ids, names, colors).',
}, async () => text(await json('/api/decks')))

server.registerTool('get_deck', {
  description: 'One deck with its full card list, by deck id (your_deck_id from match history, or a community deck id).',
  inputSchema: { deck_id: z.string() },
}, async ({ deck_id }) => text(await json(`/api/decks/${encodeURIComponent(deck_id)}`)))

server.registerTool('get_meta_stats', {
  description: 'Community ink-pair win rates and matchups for a queue (public aggregates). Rates are 0–100. A matchup row is written once with colorsA sorted before colorsB; flip it when your deck is side B. Weigh rates by games.',
  inputSchema: {
    queue: z.string().default('core-bo1').describe('core-bo1, core-bo3, infinity-bo1, infinity-bo3, ...'),
    era: z.string().optional().describe('Card-set era key, e.g. set-13; keys are in meta.eras of the response'),
    period: z.string().optional().describe('all_time, week:YYYY-MM-DD or weeks:YYYY-MM-DD,...'),
    ranks: z.string().optional().describe('Comma-separated rank tiers, e.g. Legendary,Epic'),
  },
}, async args => {
  const { meta, activity, colorPairs, matchups, updatedAt } = await json(`/api/stats/meta?${query(args)}`)
  // Only the documented (stable) fields; the rest of the payload is internal to duels.ink.
  return text({
    meta: {
      queueId: meta.queueId, selectedEraKey: meta.selectedEraKey, appliedRanks: meta.appliedRanks,
      appliedWeeks: meta.appliedWeeks, eras: meta.eras, availableWeeks: meta.availableWeeks, queues: meta.queues?.active,
    },
    totalGames: activity.totalGames, colorPairs, matchups, updatedAt,
  })
})

await server.connect(new StdioServerTransport())
