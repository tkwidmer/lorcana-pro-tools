/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
        target: 'https://api.cloudflare.ravensburgerplay.com',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost')
          const eventId = url.searchParams.get('eventId')
          return `/hydraproxy/api/v2/events/${eventId}`
        },
      },
      '/api/tournament-registrations': {
        target: 'https://api.cloudflare.ravensburgerplay.com',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost')
          const eventId = url.searchParams.get('eventId')
          const page = url.searchParams.get('page') || '1'
          const pageSize = url.searchParams.get('pageSize') || '10'
          return `/hydraproxy/api/v2/events/${eventId}/registrations/?page=${page}&page_size=${pageSize}`
        },
      },
      '/api/tournament-standings': {
        target: 'https://api.cloudflare.ravensburgerplay.com',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost')
          const roundId = url.searchParams.get('roundId')
          const page = url.searchParams.get('page') || '1'
          const pageSize = url.searchParams.get('pageSize') || '10'
          return `/hydraproxy/api/v2/tournament-rounds/${roundId}/standings/paginated/?page=${page}&page_size=${pageSize}`
        },
      },
      '/api/tournament-matches': {
        target: 'https://api.cloudflare.ravensburgerplay.com',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost')
          const roundId = url.searchParams.get('roundId')
          const page = url.searchParams.get('page') || '1'
          const pageSize = url.searchParams.get('pageSize') || '50'
          return `/hydraproxy/api/v2/tournament-rounds/${roundId}/matches/?page=${page}&page_size=${pageSize}`
        },
      },
    },
  },
})
