import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthProvider.jsx'
import { ThemeProvider } from './context/ThemeProvider.jsx'

// A tab open across a deploy asks for chunk names the new deploy no longer has;
// reload once to pick up the current build. The timestamp stops a reload loop
// if the chunk is missing even on a fresh load.
window.addEventListener('vite:preloadError', () => {
  const last = Number(sessionStorage.getItem('lorcana_chunk_reload'))
  if (Date.now() - last < 10_000) return
  sessionStorage.setItem('lorcana_chunk_reload', String(Date.now()))
  window.location.reload()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
