import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/cards': {
        target: 'https://lorcanajson.org',
        changeOrigin: true,
        rewrite: () => '/files/current/en/allCards.json',
      },
    },
  },
})
