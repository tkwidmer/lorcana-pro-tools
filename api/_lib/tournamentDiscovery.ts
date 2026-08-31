// Server-side port of the discovery logic in
// .claude/skills/tournament-history-sync/scripts/sync_import.py — see that
// skill's SKILL.md for the full write-up of how each search term was
// reverse-engineered against the Ravensburger Play Hub API. Kept in sync by
// hand, same as api/_lib/tournamentImport.ts vs src/lib/tournamentApi.js.
//
// There is no upstream "list all majors" endpoint. DLC and Championship
// events are *usually* tagged by a real event-configuration-template, but
// that tag isn't fully reliable (confirmed: some stores mistag their DLC's
// parent event with a generic template), and CCQ/ACQ/big-money events have
// no shared tag at all. So discovery here is a template pass plus a battery
// of `name=` contains-match searches, deduped by event id. This is
// inherently a floor, not a ceiling — it only catches events matching a
// known naming convention.

const RAVEN_BASE = 'https://api.ravensburgerplay.com/api/v2'
const GAME_SLUG = 'disney-lorcana'
const DLC_TEMPLATE_ID = 'a1b77361-c19e-4942-8741-f6b96bb24a80' // "Disney Lorcana Challenge"
const CHALLENGE_CHAMPIONSHIP_TEMPLATE_ID = 'b8c2e34b-2ff2-45b6-b725-18528c56a7cc' // NACC etc.

// Ravensburger's own internal QA/test fixtures show up at these obviously-fake
// stores with huge fake attendee counts — confirmed in a manual crawl.
const FAKE_STORE_NAMES = new Set(['Ravensburger HQ', 'Totally Legit Card Shack'])

const NAME_SEARCH_TERMS = [
  'CCQ',
  'Asia Championship Qualifier',
  'Disney Lorcana Challenge', // backstop for mistagged DLC parents
  'Challenge Championship Qualifier',
  '5K',
  '10K',
  '15K',
  '20K',
  '25K',
  '50K',
  '5,000',
  '10,000',
  '15,000',
  '20,000',
  '25,000',
  '50,000',
]

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Upstream request failed (${response.status}): ${url}`)
  return response.json()
}

async function paginateEvents(params: Record<string, string>, pageSize = 100): Promise<any[]> {
  const results: any[] = []
  let page = 1
  while (true) {
    const qs = new URLSearchParams({ ...params, page_size: String(pageSize), page: String(page) })
    const data = await fetchJson(`${RAVEN_BASE}/events/?${qs.toString()}`)
    results.push(...(data.results ?? []))
    if (!data.next_page_number) break
    page = data.next_page_number
  }
  return results
}

export interface DiscoveredEvent {
  id: number
  name: string
  start_datetime: string | null
  display_status: string | null
  starting_player_count: number | null
  store: { id: number; name: string } | null
}

// Fetches every event matching a known DLC/Championship/CCQ/ACQ/prize-pool
// naming convention, deduped by event id. Does not filter by
// display_status/already-imported/fake-store — callers apply those.
export async function discoverCandidateEvents(): Promise<DiscoveredEvent[]> {
  const seen = new Map<number, DiscoveredEvent>()

  const templateSearches = await Promise.all([
    paginateEvents({ game_slug: GAME_SLUG, event_configuration_template_id: DLC_TEMPLATE_ID }),
    paginateEvents({ game_slug: GAME_SLUG, event_configuration_template_id: CHALLENGE_CHAMPIONSHIP_TEMPLATE_ID }),
  ])
  for (const results of templateSearches) {
    for (const e of results) seen.set(e.id, e)
  }

  const nameSearches = await Promise.all(
    NAME_SEARCH_TERMS.map((term) => paginateEvents({ game_slug: GAME_SLUG, name: term }))
  )
  for (const results of nameSearches) {
    for (const e of results) {
      if (!seen.has(e.id)) seen.set(e.id, e)
    }
  }

  return Array.from(seen.values())
}

// Applies the same filters as sync_import.py's candidate selection: only
// completed events, excluding Ravensburger's own test fixtures. Doesn't
// check "has generated standings" — that's a per-event fetch, too expensive
// to run for every discovered event on every page load; a bad candidate
// just fails cleanly when someone clicks Import, same as pasting its URL
// manually would.
export function filterRealCandidates(events: DiscoveredEvent[]): DiscoveredEvent[] {
  return events.filter((e) => e.display_status === 'complete' && !FAKE_STORE_NAMES.has(e.store?.name ?? ''))
}
