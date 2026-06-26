import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Nav } from './components/Nav'
import { ErrorBoundary } from './components/ErrorBoundary'
import { routeTitle } from './lib/routeTitle'
import { HomePage } from './pages/HomePage'
import { ProxyGeneratorPage } from './pages/ProxyGeneratorPage'
import { TournamentCutPage } from './pages/TournamentCutPage'
import { LimitedGuidePage } from './pages/LimitedGuidePage'
import { DeckInsightsPage } from './pages/DrawOddsPage'
import { GameScraperPage } from './pages/GameScraperPage'
import { LibraryPage } from './pages/LibraryPage'
import { ScoutedGamePage } from './pages/ScoutedGamePage'
import { PlayerProfilePage } from './pages/PlayerProfilePage'
import { DeckComparisonPage } from './pages/DeckComparisonPage'
import { SettingsPage } from './pages/SettingsPage'
import { MatchHistoryPage } from './pages/MatchHistoryPage'
import { GamelogViewerPage } from './pages/GamelogViewerPage'
import { GamelogAnalyzerPage } from './pages/GamelogAnalyzerPage'
import { TeamAnalyticsPage } from './pages/TeamAnalyticsPage'
import { WinrateMatrixPage } from './pages/WinrateMatrixPage'
import { PracticePlanPage } from './pages/PracticePlanPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { TournamentLookupPage } from './pages/TournamentLookupPage'
import { LoreTrackerPage } from './pages/LoreTrackerPage'
import { LoginPage } from './pages/LoginPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { AdminPage } from './pages/AdminPage'
import { SupporterRoute } from './components/SupporterRoute'

function RoutedContent() {
  const location = useLocation()

  useEffect(() => {
    document.title = routeTitle(location.pathname)
  }, [location.pathname])

  return (
    // Reset the boundary on navigation so a crashed page doesn't persist its
    // fallback after the user moves elsewhere. Nav lives outside the boundary
    // so it stays usable even when the current page has thrown.
    <ErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/proxy" element={<ProxyGeneratorPage />} />
        <Route path="/cut-calculator" element={<TournamentCutPage />} />
        <Route path="/limited-guide" element={<LimitedGuidePage />} />
        <Route path="/deck-insights" element={<SupporterRoute><DeckInsightsPage /></SupporterRoute>} />
        <Route path="/replay-analyzer" element={<Navigate to="/gamelog-analyzer" replace />} />
        <Route path="/game-scraper" element={<SupporterRoute><GameScraperPage /></SupporterRoute>} />
        <Route path="/library" element={<SupporterRoute><LibraryPage /></SupporterRoute>} />
        <Route path="/scouting/game/:uuid" element={<SupporterRoute><ScoutedGamePage /></SupporterRoute>} />
        <Route path="/players/:name" element={<SupporterRoute><PlayerProfilePage /></SupporterRoute>} />
        <Route path="/deck-comparison" element={<DeckComparisonPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/match-history" element={<SupporterRoute><MatchHistoryPage /></SupporterRoute>} />
        <Route path="/gamelog" element={<GamelogViewerPage />} />
        <Route path="/gamelog-analyzer" element={<SupporterRoute><GamelogAnalyzerPage /></SupporterRoute>} />
        <Route path="/team-analytics" element={<SupporterRoute><TeamAnalyticsPage /></SupporterRoute>} />
        <Route path="/winrate-matrix" element={<WinrateMatrixPage />} />
        <Route path="/practice-plan" element={<SupporterRoute><PracticePlanPage /></SupporterRoute>} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/tournament-lookup" element={<SupporterRoute><TournamentLookupPage /></SupporterRoute>} />
        <Route path="/lore-tracker" element={<LoreTrackerPage />} />
        <Route path="/admin" element={<AdminPage />} />
        {/* Redirects from old routes */}
        <Route path="/game-library" element={<Navigate to="/team-analytics" replace />} />
        <Route path="/shared" element={<Navigate to="/library" replace />} />
        <Route path="/legality-checker" element={<Navigate to="/deck-insights" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <RoutedContent />
    </BrowserRouter>
  )
}
