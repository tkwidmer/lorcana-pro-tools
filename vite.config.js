/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const RAVEN_BASE = 'https://api.ravensburgerplay.com'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
    proxy: {
      '/api/cards': {
        target: 'https://lorcanajson.org',
        changeOrigin: true,
        rewrite: () => '/files/current/en/allCards.json',
      },
      '/api/tournament': {
        target: RAVEN_BASE,
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost')
          const type = url.searchParams.get('type')
          const eventId = url.searchParams.get('eventId')
          const roundId = url.searchParams.get('roundId')
          const page = url.searchParams.get('page') || '1'
          const pageSize = url.searchParams.get('pageSize') || '10'

          switch (type) {
            case 'event':        return `/api/v2/events/${eventId}/`
            case 'registrations': return `/api/v2/events/${eventId}/registrations/?page=${page}&page_size=${pageSize}`
            case 'standings':    return `/api/v2/tournament-rounds/${roundId}/standings/paginated/?page=${page}&page_size=${pageSize}`
            case 'matches':      return `/api/v2/tournament-rounds/${roundId}/matches/`
            default:             return path
          }
        },
      },
    },
  },
})
