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
      '/api/event-details': {
        target: RAVEN_BASE,
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost')
          const eventId = url.searchParams.get('eventId')
          return `/api/v2/events/${eventId}`
        },
      },
      '/api/tournament-registrations': {
        target: RAVEN_BASE,
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost')
          const eventId = url.searchParams.get('eventId')
          const page = url.searchParams.get('page') || '1'
          const pageSize = url.searchParams.get('pageSize') || '10'
          return `/api/v2/events/${eventId}/registrations/?page=${page}&page_size=${pageSize}`
        },
      },
      '/api/tournament-standings': {
        target: RAVEN_BASE,
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost')
          const roundId = url.searchParams.get('roundId')
          const page = url.searchParams.get('page') || '1'
          const pageSize = url.searchParams.get('pageSize') || '10'
          return `/api/v2/tournament-rounds/${roundId}/standings/paginated/?page=${page}&page_size=${pageSize}`
        },
      },
      '/api/tournament-matches': {
        target: RAVEN_BASE,
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost')
          const roundId = url.searchParams.get('roundId')
          return `/api/v2/tournament-rounds/${roundId}/matches/`
        },
      },
    },
  },
})
