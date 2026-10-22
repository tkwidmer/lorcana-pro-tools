// The one implementation of major-event discovery, behind the admin import
// page's suggested list (`?endpoint=suggested-imports`). See the
// tournament-history-sync skill's SKILL.md for how each template and search
// term was reverse-engineered against the Ravensburger Play Hub API.
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
const LCQ_TEMPLATE_ID = '4881658d-a6ef-4f98-9c2a-1baf9ef12b82' // the ~500-player Last Chance Qualifiers at a Championship weekend

// Ravensburger's own internal QA/test fixtures show up at these obviously-fake
// stores with huge fake attendee counts — confirmed in a manual crawl.
const FAKE_STORE_NAMES = new Set(['Ravensburger HQ', 'Totally Legit Card Shack'])

export type DiscoveryLabel = 'DLC' | 'Championship' | 'LCQ' | 'CCQ' | 'ACQ' | 'PRIZE'

// `name=` is a case-insensitive contains-match upstream. Order is precedence
// when an event matches more than one search (cosmetic: the label shown).
const NAME_SEARCH_TERMS: Array<[string, DiscoveryLabel]> = [
  ['Disney Lorcana Challenge', 'DLC'], // backstop for mistagged DLC parents
  ['CCQ', 'CCQ'],
  ['Challenge Championship Qualifier', 'CCQ'],
  ['Asia Championship Qualifier', 'ACQ'],
  ['亞洲冠軍資格賽', 'ACQ'], // Saka Saka Taiwan names its stop in Chinese
  ['5K', 'PRIZE'],
  ['10K', 'PRIZE'],
  ['15K', 'PRIZE'],
  ['20K', 'PRIZE'],
  ['25K', 'PRIZE'],
  ['50K', 'PRIZE'],
  ['5,000', 'PRIZE'],
  ['10,000', 'PRIZE'],
  ['15,000', 'PRIZE'],
  ['20,000', 'PRIZE'],
  ['25,000', 'PRIZE'],
  ['50,000', 'PRIZE'],
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
  label: DiscoveryLabel
  start_datetime: string | null
  display_status: string | null
  starting_player_count: number | null
  store: { id: number; name: string } | null
  tournament_phases?: Array<{ rounds?: Array<{ status: string; standings_status: string }> }>
}

// Fetches every event matching a known DLC/Championship/CCQ/ACQ/prize-pool
// naming convention, deduped by event id. Does not filter by
// display_status/already-imported/fake-store — callers apply those.
export async function discoverCandidateEvents(): Promise<DiscoveredEvent[]> {
  const seen = new Map<number, DiscoveredEvent>()

  const templates: Array<[string, DiscoveryLabel]> = [
    [DLC_TEMPLATE_ID, 'DLC'],
    [CHALLENGE_CHAMPIONSHIP_TEMPLATE_ID, 'Championship'],
    [LCQ_TEMPLATE_ID, 'LCQ'],
  ]
  const templateSearches = await Promise.all(
    templates.map(([id]) => paginateEvents({ game_slug: GAME_SLUG, event_configuration_template_id: id }))
  )
  templateSearches.forEach((results, i) => {
    for (const e of results) seen.set(e.id, { ...e, label: templates[i][1] })
  })

  const nameSearches = await Promise.all(
    NAME_SEARCH_TERMS.map(([term]) => paginateEvents({ game_slug: GAME_SLUG, name: term }))
  )
  nameSearches.forEach((results, i) => {
    for (const e of results) {
      if (!seen.has(e.id)) seen.set(e.id, { ...e, label: NAME_SEARCH_TERMS[i][1] })
    }
  })

  return Array.from(seen.values())
}

// Only completed events with something to import — the list response carries
// every round's standings status, so this is the import's own precondition
// (a round with generated standings) applied without a per-event fetch. A
// store that flags an event complete but never entered results on the Play
// Hub (rounds empty or NOT_GENERATED) is left out rather than failing on
// Import forever. Ravensburger's own test fixtures are excluded by store.
export function filterRealCandidates(events: DiscoveredEvent[]): DiscoveredEvent[] {
  return events.filter(
    (e) =>
      e.display_status === 'complete' &&
      !FAKE_STORE_NAMES.has(e.store?.name ?? '') &&
      (e.tournament_phases ?? []).some((p) =>
        (p.rounds ?? []).some((r) => (r.status === 'COMPLETE' || r.status === 'IN_PROGRESS') && r.standings_status === 'GENERATED')
      )
  )
}
