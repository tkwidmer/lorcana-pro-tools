/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const RAVEN_BASE = 'https://api.ravensburgerplay.com/api/v2'
// Match results are not exposed on RAVEN_BASE without an authenticated session
// (401 "Authentication credentials were not provided"). The public tournament
// results page instead reads match data through this Cloudflare-fronted proxy.
// Mirrors api/tournament.ts's routing exactly — vite's declarative `proxy`
// config only supports one upstream host per path, so `matches`/`store` (which
// need HYDRA_BASE) can't be expressed there; this dev-only middleware plugs
// that gap by reimplementing the same per-`type` routing directly.
const HYDRA_BASE = 'https://api.cloudflare.ravensburgerplay.com/hydraproxy/api/v2'

function tournamentApiDevProxy() {
  return {
    name: 'tournament-api-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/tournament', async (req, res) => {
        const url = new URL(req.url, 'http://localhost')
        const type = url.searchParams.get('type')
        const eventId = url.searchParams.get('eventId')
        const roundId = url.searchParams.get('roundId')
        const storeId = url.searchParams.get('storeId')
        const storeNumericId = url.searchParams.get('storeNumericId')
        const page = url.searchParams.get('page') || '1'
        const pageSize = url.searchParams.get('pageSize') || '10'

        let target
        switch (type) {
          case 'event':
            target = `${RAVEN_BASE}/events/${eventId}/`
            break
          case 'registrations':
            target = `${RAVEN_BASE}/events/${eventId}/registrations/?page=${page}&page_size=${pageSize}`
            break
          case 'standings':
            target = `${RAVEN_BASE}/tournament-rounds/${roundId}/standings/paginated/?page=${page}&page_size=${pageSize}`
            break
          case 'matches':
            target = `${HYDRA_BASE}/tournament-rounds/${roundId}/matches/paginated/?page=${page}&page_size=${pageSize}&avoid_cache=false`
            break
          case 'store':
            target = `${HYDRA_BASE}/game-stores/${storeId}/`
            break
          case 'storeEvents':
            target = `${RAVEN_BASE}/events/?store=${storeNumericId}&game_slug=disney-lorcana&page=${page}&page_size=${pageSize}`
            break
          default:
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'Missing or invalid type param' }))
            return
        }

        try {
          const upstream = await fetch(target)
          const body = await upstream.text()
          if (!upstream.ok && upstream.status === 404 && type === 'matches') {
            res.statusCode = 200
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ matches: [], results: [], next_page_number: null }))
            return
          }
          res.statusCode = upstream.status
          res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json')
          res.end(body)
        } catch (err) {
          res.statusCode = 502
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'Failed to reach tournament API', detail: String(err) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), tournamentApiDevProxy()],
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
    proxy: {
      '/api/cards': {
        target: 'https://lorcanajson.org',
        changeOrigin: true,
        rewrite: () => '/files/current/en/allCards.json',
      },
    },
  },
})
