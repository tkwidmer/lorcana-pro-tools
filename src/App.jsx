import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Nav } from './components/Nav'
import { HomePage } from './pages/HomePage'
import { ProxyGeneratorPage } from './pages/ProxyGeneratorPage'
import { TournamentCutPage } from './pages/TournamentCutPage'
import { LimitedGuidePage } from './pages/LimitedGuidePage'
import { DrawOddsPage } from './pages/DrawOddsPage'
import { ReplayAnalyzerPage } from './pages/ReplayAnalyzerPage'
import { GameScraperPage } from './pages/GameScraperPage'
import { GameHistoryPage } from './pages/GameHistoryPage'
import { GameHistoryDetailPage } from './pages/GameHistoryDetailPage'
import { PlayersPage } from './pages/PlayersPage'
import { PlayerProfilePage } from './pages/PlayerProfilePage'
import { SharedGamePage } from './pages/SharedGamePage'

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/proxy" element={<ProxyGeneratorPage />} />
        <Route path="/cut-calculator" element={<TournamentCutPage />} />
        <Route path="/limited-guide" element={<LimitedGuidePage />} />
        <Route path="/deck-insights" element={<DrawOddsPage />} />
        <Route path="/replay-analyzer" element={<ReplayAnalyzerPage />} />
        <Route path="/game-scraper" element={<GameScraperPage />} />
        <Route path="/game-history" element={<GameHistoryPage />} />
        <Route path="/game-history/:uuid" element={<GameHistoryDetailPage />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="/shared" element={<SharedGamePage />} />
        <Route path="/players/:name" element={<PlayerProfilePage />} />
      </Routes>
    </BrowserRouter>
  )
}
