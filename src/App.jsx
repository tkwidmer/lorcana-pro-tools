import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Nav } from './components/Nav'
import { HomePage } from './pages/HomePage'
import { ProxyGeneratorPage } from './pages/ProxyGeneratorPage'
import { TournamentCutPage } from './pages/TournamentCutPage'
import { LimitedGuidePage } from './pages/LimitedGuidePage'
import { DeckInsightsPage } from './pages/DrawOddsPage'
import { GameScraperPage } from './pages/GameScraperPage'
import { LibraryPage } from './pages/LibraryPage'
import { GameHistoryDetailPage } from './pages/GameHistoryDetailPage'
import { PlayerProfilePage } from './pages/PlayerProfilePage'
import { DeckComparisonPage } from './pages/DeckComparisonPage'
import { SettingsPage } from './pages/SettingsPage'
import { MatchHistoryPage } from './pages/MatchHistoryPage'
import { GamelogViewerPage } from './pages/GamelogViewerPage'
import { GamelogAnalyzerPage } from './pages/GamelogAnalyzerPage'
import { GameLibraryPage } from './pages/GameLibraryPage'
import { WinrateMatrixPage } from './pages/WinrateMatrixPage'
import { PracticePlanPage } from './pages/PracticePlanPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { TournamentLookupPage } from './pages/TournamentLookupPage'
import { LoreTrackerPage } from './pages/LoreTrackerPage'
import { LoginPage } from './pages/LoginPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { AdminPage } from './pages/AdminPage'

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/proxy" element={<ProxyGeneratorPage />} />
        <Route path="/cut-calculator" element={<TournamentCutPage />} />
        <Route path="/limited-guide" element={<LimitedGuidePage />} />
        <Route path="/deck-insights" element={<DeckInsightsPage />} />
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
<Route path="/game-library" element={<GameLibraryPage />} />
        <Route path="/winrate-matrix" element={<WinrateMatrixPage />} />
        <Route path="/practice-plan" element={<PracticePlanPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/tournament-lookup" element={<TournamentLookupPage />} />
        <Route path="/lore-tracker" element={<LoreTrackerPage />} />
        <Route path="/admin" element={<AdminPage />} />
        {/* Redirects from old routes */}
        <Route path="/game-history" element={<Navigate to="/library?tab=history" replace />} />
        <Route path="/players" element={<Navigate to="/library?tab=players" replace />} />
        <Route path="/shared" element={<Navigate to="/library" replace />} />
        <Route path="/legality-checker" element={<Navigate to="/deck-insights" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
