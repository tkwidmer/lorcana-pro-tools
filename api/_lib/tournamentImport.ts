// Server-side port of the RPH event/standings/matches fetch logic used by
// api/tournament.ts + src/lib/tournamentApi.js. The import job in
// api/tournament-history.ts runs as a Vercel function, so it calls
// RAVEN_BASE/HYDRA_BASE directly rather than going through the browser's
// `/api/tournament` proxy (which only exists for the client). This
// duplicates the fetch/pagination/shape-normalization logic in those two
// files — the same category of hand-kept-in-sync duplication as
// api/_lib/discordTournamentApi.ts already is for the Discord bot. If either
// upstream shape changes, update all three call sites.
//
// See the `ravensburger-tournament-api` skill for background on why there
// are two upstream hosts and why match data requires the Hydra-proxied one.

const RAVEN_BASE = 'https://api.ravensburgerplay.com/api/v2'
const HYDRA_BASE = 'https://api.cloudflare.ravensburgerplay.com/hydraproxy/api/v2'

// RPH event_configuration_template UUID -> tier key. Confirmed against the
// full official list via GET /api/v2/event-configuration-templates/?game_slug=
// disney-lorcana (see the tournament-history-sync skill), and against real
// events including the NA Championship (886104 =
// b8c2e34b-2ff2-45b6-b725-18528c56a7cc = "Challenge Championship", RPH's
// name for a Continental/National-level event — one tier up from a regular
// "Challenge", which is the DLC/regional-level event, i.e. "Disney Lorcana
// Challenge" in RPH's own template name).
//
// Deliberately does NOT include CCQs (Challenge Championship Qualifiers) —
// per the tournament-history-sync skill, CCQs have no shared official
// template; they're independently run by third-party organizers, each under
// their own store-specific one-off configuration UUID (confirmed: two CCQ
// events in this archive, 217488 and 351064, each have a distinct
// unofficial UUID not in this map). Any UUID missing from this map falls
// through to tier: null, which the pedigree query already treats as "not
// notable" — the correct fail-safe outcome for a CCQ.
//
// TODO(worlds): Disney Lorcana Championship (Worlds) had not been scheduled
// on RPH as of 2026-09-01, so its UUID is unknown. Once a Worlds event
// appears, fetch its event_configuration_template and add it here as
// 'worlds', then add 'worlds' to NOTABLE_EVENT_TIERS in
// tournamentHistorySupabase.ts.
export const EVENT_CONFIGURATION_TEMPLATES: Record<string, string> = {
  'b8c2e34b-2ff2-45b6-b725-18528c56a7cc': 'challenge_championship',
  'a1b77361-c19e-4942-8741-f6b96bb24a80': 'challenge',
  '4881658d-a6ef-4f98-9c2a-1baf9ef12b82': 'lcq',
  '810d4ea0-3ea8-4c67-9381-4c4840330cf8': 'weekly_constructed',
  '7cd013ab-7eb6-4adc-9563-ce2a073628e8': 'weekly_draft',
  '4a011d41-38f2-4860-90e4-62843c2ec2dd': 'weekly_sealed',
  '5597eb4b-aafa-45ef-b69c-06d745201ebe': 'ink_sprint',
  'ea5a8924-6b4e-473c-bbee-597c7408c7c4': 'side_events',
  'fa6de20e-925d-4700-9d58-e0cd4e2e286b': 'unstructured',
  '36363a54-a90a-4cf2-89bb-de4669a26f58': 'format_coconut',
  '868b0085-5853-4e1b-a294-e9bc30002afa': 'collection_quest',
}

export function deriveEventTier(eventDetails: any): { templateId: string | null; tier: string | null } {
  const templateId: string | null = eventDetails?.event_configuration_template ?? null
  return { templateId, tier: templateId ? (EVENT_CONFIGURATION_TEMPLATES[templateId] ?? null) : null }
}

export interface TournamentStructureLite {
  topCutSize: number | null
  totalSwissRounds: number
  hasElimination: boolean
  finalRoundId: string | null
  eventName: string
  storeName: string | null
  gameplayFormat: string | null
  startingPlayerCount: number | null
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Upstream request failed (${response.status}): ${url}`)
  }
  const body = await response.text()
  if (!body || body.trim().length === 0) throw new Error(`Empty response from ${url}`)
  return JSON.parse(body)
}

export async function fetchEventDetailsServer(eventId: string): Promise<any> {
  return fetchJson(`${RAVEN_BASE}/events/${encodeURIComponent(eventId)}`)
}

// Derives the same structure fields as getTournamentStructure() in
// src/lib/tournamentApi.js, but only what the import job needs: top cut
// size, total swiss rounds, whether an elimination phase exists, and the
// *final* round with generated standings — which, for a fully-completed
// event, is the last completed round of the last phase (the true final
// ranking, including any top-cut results), not just the current round of an
// in-progress event.
export function deriveTournamentStructure(eventDetails: any): TournamentStructureLite {
  const phases = eventDetails?.tournament_phases ?? []
  const swissPhases = phases.filter((p: any) => p.round_type === 'SWISS')
  const eliminationPhase = phases.find((p: any) => p.round_type === 'RANKED_SINGLE_ELIMINATION')

  const totalSwissRounds = swissPhases.reduce((sum: number, p: any) => sum + (p.number_of_rounds || 0), 0)
  const topCutSize = eventDetails?.top_cut_size || eliminationPhase?.rank_required_to_enter_phase || null

  let finalRoundId: string | null = null
  for (const phase of phases) {
    if (!phase.rounds) continue
    const completedWithStandings = phase.rounds.filter(
      (r: any) => r.status === 'COMPLETE' && r.standings_status === 'GENERATED'
    )
    if (completedWithStandings.length > 0) {
      finalRoundId = completedWithStandings[completedWithStandings.length - 1].id
    }
    const inProgressWithStandings = phase.rounds.find(
      (r: any) => r.status === 'IN_PROGRESS' && r.standings_status === 'GENERATED'
    )
    if (inProgressWithStandings) finalRoundId = inProgressWithStandings.id
  }

  return {
    topCutSize,
    totalSwissRounds,
    hasElimination: Boolean(eliminationPhase),
    finalRoundId,
    eventName: eventDetails?.name,
    storeName: eventDetails?.store?.name ?? null,
    gameplayFormat: eventDetails?.gameplay_format?.name ?? null,
    startingPlayerCount: eventDetails?.starting_player_count ?? null,
  }
}

export async function fetchFinalStandings(roundId: string): Promise<any[]> {
  const allResults: any[] = []
  let page = 1
  let hasMore = true
  while (hasMore) {
    const data = await fetchJson(
      `${RAVEN_BASE}/tournament-rounds/${encodeURIComponent(roundId)}/standings/paginated/?page=${page}&page_size=50`
    )
    allResults.push(...(data.results ?? []))
    hasMore = data.next_page_number !== null && data.next_page_number !== undefined
    page = data.next_page_number || page + 1
  }
  return allResults
}

// Normalizes the two possible /matches/paginated/ response shapes, same as
// extractMatches() in src/lib/tournamentApi.js.
function extractMatches(data: any): { matches: any[]; nextPage: number | null } {
  if (Array.isArray(data.results)) return { matches: data.results, nextPage: data.next_page_number ?? null }
  if (Array.isArray(data.matches)) return { matches: data.matches, nextPage: null }
  return { matches: [], nextPage: null }
}

async function fetchRoundMatches(roundId: string): Promise<any[]> {
  const allMatches: any[] = []
  let page = 1
  let hasMore = true
  while (hasMore) {
    let data: any
    try {
      data = await fetchJson(
        `${HYDRA_BASE}/tournament-rounds/${encodeURIComponent(roundId)}/matches/paginated/?page=${page}&page_size=100&avoid_cache=false`
      )
    } catch {
      // A round with no reported matches yet (404) is a normal state, same
      // as api/tournament.ts's 404-on-matches normalization.
      break
    }
    const { matches, nextPage } = extractMatches(data)
    allMatches.push(...matches)
    hasMore = nextPage !== null
    page = nextPage || page + 1
  }
  return allMatches
}

// Fetches every match across every COMPLETE round in the event, flat, with
// round_number/phase_name injected — mirrors fetchAllRoundMatches() in
// src/lib/tournamentApi.js.
export async function fetchAllRoundMatchesServer(eventDetails: any): Promise<any[]> {
  const phases = eventDetails?.tournament_phases ?? []
  const rounds: { roundId: string; roundNumber: number; phaseName: string }[] = []
  for (const phase of phases) {
    if (!phase.rounds) continue
    for (const round of phase.rounds) {
      if (round.status !== 'COMPLETE') continue
      rounds.push({ roundId: round.id, roundNumber: round.round_number, phaseName: phase.phase_name })
    }
  }

  const allMatches: any[] = []
  await Promise.all(
    rounds.map(async ({ roundId, roundNumber, phaseName }) => {
      try {
        const matches = await fetchRoundMatches(roundId)
        for (const match of matches) {
          allMatches.push({ ...match, round_number: roundNumber, phase_name: phaseName })
        }
      } catch {
        // Skip rounds that fail to fetch; don't block the rest of the import
      }
    })
  )

  allMatches.sort((a, b) => a.round_number - b.round_number)
  return allMatches
}
