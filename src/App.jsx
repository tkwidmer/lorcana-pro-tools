import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Nav } from './components/Nav'
import { HomePage } from './pages/HomePage'
import { ProxyGeneratorPage } from './pages/ProxyGeneratorPage'
import { TournamentCutPage } from './pages/TournamentCutPage'
import { LimitedGuidePage } from './pages/LimitedGuidePage'
import { DrawOddsPage } from './pages/DrawOddsPage'
import { GameScraperPage } from './pages/GameScraperPage'
import { LibraryPage } from './pages/LibraryPage'
import { GameHistoryDetailPage } from './pages/GameHistoryDetailPage'
import { PlayerProfilePage } from './pages/PlayerProfilePage'
import { DeckComparisonPage } from './pages/DeckComparisonPage'
import { SettingsPage } from './pages/SettingsPage'
import { MatchHistoryPage } from './pages/MatchHistoryPage'
import { GamelogViewerPage } from './pages/GamelogViewerPage'
import { GamelogAnalyzerPage } from './pages/GamelogAnalyzerPage'

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
        <Route path="/replay-analyzer" element={<Navigate to="/gamelog-analyzer" replace />} />
        <Route path="/game-scraper" element={<GameScraperPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/game-history/:uuid" element={<GameHistoryDetailPage />} />
        <Route path="/players/:name" element={<PlayerProfilePage />} />
        <Route path="/deck-comparison" element={<DeckComparisonPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/match-history" element={<MatchHistoryPage />} />
        <Route path="/gamelog" element={<GamelogViewerPage />} />
        <Route path="/gamelog-analyzer" element={<GamelogAnalyzerPage />} />
        {/* Redirects from old routes */}
        <Route path="/game-history" element={<Navigate to="/library?tab=history" replace />} />
        <Route path="/players" element={<Navigate to="/library?tab=players" replace />} />
        <Route path="/shared" element={<Navigate to="/library" replace />} />
        <Route path="/legality-checker" element={<Navigate to="/deck-insights" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
