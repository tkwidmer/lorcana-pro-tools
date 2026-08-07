// Tools that require an active supporter (or admin) to access.
// Used by the router to guard routes and by the home page to badge tool cards.
// Admins pass these checks automatically — `isSupporter` from useSupporter is
// true for both the 'supporter' and 'admin' tiers.
export const SUPPORTER_PATHS = new Set([
  '/deck-insights',
  '/match-history',
  '/analytics',
  '/practice-plan',
  '/tournament-lookup',
  '/library',
  '/game-scraper',
])

export function isSupporterPath(path) {
  return SUPPORTER_PATHS.has(path)
}
