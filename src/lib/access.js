// Where a non-supporter is sent to become one: the InkbornForge community on
// Metafy, and its membership picker. Only The Forge tier unlocks the app (see
// "Metafy Integration" in CLAUDE.md); its price is shown on the gate.
export const METAFY_URL = 'https://metafy.gg/@inkbornforge'
export const METAFY_JOIN_URL = `${METAFY_URL}/members`
export const METAFY_PRICE = '$9.99'

// Tools that require an active supporter (or admin) to access.
// Used by the router to guard routes and by the home page to badge tool cards.
// Admins pass these checks automatically — `isSupporter` from useSupporter is
// true for both the 'supporter' and 'admin' tiers.
export const SUPPORTER_PATHS = new Set([
  '/deck-insights',
  '/match-history',
  '/analytics',
  '/practice-plan',
  '/deck-doctor',
  '/deck-lab',
  '/tournament-lookup',
  '/field-breakdown',
  '/meta-synthesis',
  '/library',
  '/game-scraper',
  '/decklist-inspector',
  '/stream-overlay',
])

export function isSupporterPath(path) {
  return SUPPORTER_PATHS.has(path)
}
