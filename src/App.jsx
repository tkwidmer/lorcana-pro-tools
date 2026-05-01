import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Nav } from './components/Nav'
import { HomePage } from './pages/HomePage'
import { ProxyGeneratorPage } from './pages/ProxyGeneratorPage'
import { TournamentCutPage } from './pages/TournamentCutPage'

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/proxy" element={<ProxyGeneratorPage />} />
        <Route path="/cut-calculator" element={<TournamentCutPage />} />
      </Routes>
    </BrowserRouter>
  )
}
