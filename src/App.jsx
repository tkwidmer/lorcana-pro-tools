import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { ErrorBoundary } from './components/ErrorBoundary'
import { routeTitle, routeDescription } from './lib/routeTitle'
import { HomePage } from './pages/HomePage'
import { SitemapPage } from './pages/SitemapPage'
import { ProxyGeneratorPage } from './pages/ProxyGeneratorPage'
import { CoconutDeckBuilderPage } from './pages/CoconutDeckBuilderPage'
import { TournamentCutPage } from './pages/TournamentCutPage'
import { LimitedGuidePage } from './pages/LimitedGuidePage'
import { RulesPage } from './pages/RulesPage'
import { RulesDocumentPage } from './pages/RulesDocumentPage'
import { RulesChangesPage } from './pages/RulesChangesPage'
import { DeckInsightsPage } from './pages/DrawOddsPage'
import { GameScraperPage } from './pages/GameScraperPage'
import { LibraryPage } from './pages/LibraryPage'
import { ScoutedGamePage } from './pages/ScoutedGamePage'
import { PlayerProfilePage } from './pages/PlayerProfilePage'
import { DeckComparisonPage } from './pages/DeckComparisonPage'
import { DecklistInspectorPage } from './pages/DecklistInspectorPage'
import { DecklistOverlayPage } from './pages/DecklistOverlayPage'
import { SettingsPage } from './pages/SettingsPage'
import { MatchHistoryPage } from './pages/MatchHistoryPage'
import { GamelogViewerPage } from './pages/GamelogViewerPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
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

    const description = document.querySelector('meta[name="description"]')
    if (description) description.setAttribute('content', routeDescription(location.pathname))

    const canonical = document.querySelector('link[rel="canonical"]')
    if (canonical) canonical.setAttribute('href', `https://lorcana-pro-tools.vercel.app${location.pathname}`)
  }, [location.pathname])

  return (
    // Reset the boundary on navigation so a crashed page doesn't persist its
    // fallback after the user moves elsewhere. Nav lives outside the boundary
    // so it stays usable even when the current page has thrown.
    <ErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sitemap" element={<SitemapPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/proxy" element={<ProxyGeneratorPage />} />
        <Route path="/coconut-deck-builder" element={<CoconutDeckBuilderPage />} />
        <Route path="/cut-calculator" element={<TournamentCutPage />} />
        <Route path="/limited-guide" element={<LimitedGuidePage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/rules/:doc/changes" element={<RulesChangesPage />} />
        <Route path="/rules/:doc/:chapterSlug" element={<RulesDocumentPage />} />
        <Route path="/rules/:doc" element={<RulesDocumentPage />} />
        <Route path="/deck-insights" element={<SupporterRoute><DeckInsightsPage /></SupporterRoute>} />
        <Route path="/replay-analyzer" element={<Navigate to="/analytics" replace />} />
        <Route path="/game-scraper" element={<SupporterRoute><GameScraperPage /></SupporterRoute>} />
        <Route path="/library" element={<SupporterRoute><LibraryPage /></SupporterRoute>} />
        <Route path="/scouting/game/:uuid" element={<SupporterRoute><ScoutedGamePage /></SupporterRoute>} />
        <Route path="/players/:name" element={<SupporterRoute><PlayerProfilePage /></SupporterRoute>} />
        <Route path="/deck-comparison" element={<DeckComparisonPage />} />
        <Route path="/decklist-inspector" element={<SupporterRoute><DecklistInspectorPage /></SupporterRoute>} />
        {/* Unguarded: an OBS Browser Source has no Supabase session, and this
            read-only view carries its decklist entirely in the URL — no
            account data is exposed. */}
        <Route path="/decklist-inspector/overlay" element={<DecklistOverlayPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/match-history" element={<SupporterRoute><MatchHistoryPage /></SupporterRoute>} />
        <Route path="/gamelog" element={<GamelogViewerPage />} />
        <Route path="/gamelog-analyzer" element={<Navigate to="/analytics" replace />} />
        <Route path="/team-analytics" element={<Navigate to="/analytics" replace />} />
        <Route path="/analytics" element={<SupporterRoute><AnalyticsPage /></SupporterRoute>} />
        <Route path="/winrate-matrix" element={<WinrateMatrixPage />} />
        <Route path="/practice-plan" element={<SupporterRoute><PracticePlanPage /></SupporterRoute>} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/tournament-lookup" element={<SupporterRoute><TournamentLookupPage /></SupporterRoute>} />
        <Route path="/lore-tracker" element={<LoreTrackerPage />} />
        <Route path="/admin" element={<AdminPage />} />
        {/* Redirects from old routes */}
        <Route path="/game-library" element={<Navigate to="/analytics" replace />} />
        <Route path="/shared" element={<Navigate to="/library" replace />} />
        <Route path="/legality-checker" element={<Navigate to="/deck-insights" replace />} />
        {/* Opponent Directory was merged into the Library's Players tab, which now
            combines scouted-game and gamelog-derived opponent data in one place. */}
        <Route path="/opponent-directory" element={<Navigate to="/library?tab=players" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Nav />
        <div className="flex-1">
          <RoutedContent />
        </div>
        <Footer />
      </div>
    </BrowserRouter>
  )
}
