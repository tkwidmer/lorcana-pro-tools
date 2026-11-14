// Standalone port of src/lib/tournamentApi.js for the Discord /tournament
// command. The web app calls its own /api/tournament Vercel proxy; this
// module is itself a Vercel function, so it talks to the (public,
// unauthenticated) Ravensburger API directly.
const RAVEN_BASE = 'https://api.ravensburgerplay.com/api/v2'

// Tournament/round IDs are short alphanumeric tokens. Reject anything else
// before interpolating into the upstream URL.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function assertValidId(id: string | null | undefined, label: string) {
  if (!id || !ID_RE.test(id)) {
    throw new Error(`Invalid ${label}`)
  }
}

async function ravenFetch(path: string) {
  const response = await fetch(`${RAVEN_BASE}${path}`)
  if (!response.ok) {
    throw new Error(`Tournament API error (HTTP ${response.status})`)
  }
  return response.json()
}

export function extractEventId(url: string | null | undefined): string | null {
  const match = String(url).match(/\/events\/(\d+)/)
  return match ? match[1] : null
}

// RPH keeps a phase's points cutoff (a DLC's 18 for Day 2) on the event's
// configuration template, not on the event's own phases. The templates are
// shared by every event, so a warm function instance fetches them once.
let templatesPromise: Promise<any[]> | null = null
function fetchPhaseTemplates() {
  templatesPromise ??= ravenFetch('/event-configuration-templates/?game_slug=disney-lorcana').catch((err) => {
    templatesPromise = null
    throw err
  })
  return templatesPromise
}

// Copies points_required_to_enter_phase from the event's phase template group
// (event.phase_template_group) onto its phases, matched by order. Events
// without a template group are returned unchanged. Same as withPhasePoints()
// in src/lib/tournamentApi.js.
export function withPhasePoints(eventDetails: any, templates: any[]) {
  const group = templates
    .flatMap((t: any) => t.event_structure_policy?.allowed_phase_template_groups ?? [])
    .find((g: any) => g.id === eventDetails.phase_template_group)
  if (!group) return eventDetails
  return {
    ...eventDetails,
    tournament_phases: eventDetails.tournament_phases.map((phase: any) => ({
      ...phase,
      points_required_to_enter_phase: group.phase_templates[phase.order_in_phases - 1]?.points_required_to_enter_phase ?? null,
    })),
  }
}

export async function fetchEventDetails(eventId: string) {
  assertValidId(eventId, 'eventId')
  const [eventDetails, templates] = await Promise.all([
    ravenFetch(`/events/${encodeURIComponent(eventId)}`),
    fetchPhaseTemplates(),
  ])
  return withPhasePoints(eventDetails, templates)
}

// A round's full standings in one call, with match_points normalized to the
// current total (the standings snapshot field is stale mid-event).
export async function fetchAllStandings(roundId: string) {
  assertValidId(roundId, 'roundId')
  const { standings } = await ravenFetch(`/tournament-rounds/${encodeURIComponent(roundId)}/standings/`)
  return standings
}

export function getTournamentStructure(eventDetails: any) {
  if (!eventDetails || !eventDetails.tournament_phases) return null

  const phases = eventDetails.tournament_phases
  const swissPhases = phases.filter((p: any) => p.round_type === 'SWISS')
  const eliminationPhase = phases.find((p: any) => p.round_type === 'RANKED_SINGLE_ELIMINATION')

  const totalSwissRounds = swissPhases.reduce((sum: number, p: any) => sum + (p.number_of_rounds || 0), 0)

  const topCutSize =
    eventDetails.top_cut_size || eliminationPhase?.rank_required_to_enter_phase || null

  let currentRoundId = null
  let currentRoundNumber = null
  let currentPhaseType = null
  let currentPhaseName = null
  let currentPhaseIndex = -1

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]
    if (!phase.rounds) continue

    const inProgressWithStandings = phase.rounds.find(
      (r: any) => r.status === 'IN_PROGRESS' && r.standings_status === 'GENERATED'
    )
    if (inProgressWithStandings) {
      currentRoundId = inProgressWithStandings.id
      currentRoundNumber = inProgressWithStandings.round_number
      currentPhaseType = phase.round_type
      currentPhaseName = phase.phase_name
      currentPhaseIndex = i
      break
    }

    const completedWithStandings = phase.rounds.filter(
      (r: any) => r.status === 'COMPLETE' && r.standings_status === 'GENERATED'
    )
    if (completedWithStandings.length > 0) {
      const last = completedWithStandings[completedWithStandings.length - 1]
      currentRoundId = last.id
      currentRoundNumber = last.round_number
      currentPhaseType = phase.round_type
      currentPhaseName = phase.phase_name
      currentPhaseIndex = i
    }
  }

  const isElimination = currentPhaseType === 'RANKED_SINGLE_ELIMINATION'
  const swissRoundsRemaining =
    currentPhaseType === 'SWISS' ? totalSwissRounds - (currentRoundNumber as number) : 0
  // Rounds left in the current phase: its cut (a DLC's Day 2) comes before
  // later Swiss phases, so their rounds can't count toward it.
  const currentPhase = phases[currentPhaseIndex]
  const phaseRoundsRemaining = currentPhase
    ? currentPhase.number_of_rounds - (currentPhase.rounds.findIndex((r: any) => r.id === currentRoundId) + 1)
    : 0

  const nextPhase =
    currentPhaseIndex >= 0 && currentPhaseIndex + 1 < phases.length
      ? phases[currentPhaseIndex + 1]
      : null

  let advancementRequirement: any = null
  if (nextPhase && !isElimination) {
    if (nextPhase.rank_required_to_enter_phase) {
      advancementRequirement = {
        type: 'rank',
        value: nextPhase.rank_required_to_enter_phase,
        nextPhaseName: nextPhase.phase_name,
      }
    } else if (nextPhase.points_required_to_enter_phase) {
      advancementRequirement = {
        type: 'points',
        value: nextPhase.points_required_to_enter_phase,
        nextPhaseName: nextPhase.phase_name,
      }
    } else {
      const pointsMatch = nextPhase.phase_name.match(/(\d+)\s*point/i)
      if (pointsMatch) {
        advancementRequirement = {
          type: 'points',
          value: parseInt(pointsMatch[1], 10),
          nextPhaseName: nextPhase.phase_name,
        }
      }
    }
  }

  return {
    totalSwissRounds,
    topCutSize,
    currentRoundId,
    currentRoundNumber,
    currentPhaseType,
    currentPhaseName,
    isElimination,
    swissRoundsRemaining,
    phaseRoundsRemaining,
    advancementRequirement,
    tiebreakers: eventDetails.tiebreakers ?? [],
    eventName: eventDetails.name,
    startingPlayerCount: eventDetails.starting_player_count ?? null,
    timerEndDatetime: eventDetails.timer_end_datetime ?? null,
    timerIsRunning: eventDetails.timer_is_running ?? false,
    gameplayFormat: eventDetails.gameplay_format?.name ?? null,
    eventStore: eventDetails.store
      ? { name: eventDetails.store.name, address: eventDetails.full_address ?? null }
      : null,
    rulesEnforcementLevel: eventDetails.rules_enforcement_level ?? null,
  }
}

export function analyzeAdvancement(playerEntry: any, structure: any) {
  if (!playerEntry || structure?.advancementRequirement?.type !== 'points') return null

  const { advancementRequirement, phaseRoundsRemaining } = structure
  const { value, nextPhaseName } = advancementRequirement
  const type = 'points'
  const myPoints = playerEntry.match_points
  const maxPossible = myPoints + phaseRoundsRemaining * 3
  if (myPoints >= value) return { status: 'secured', nextPhaseName, value, type }
  if (maxPossible < value) return { status: 'eliminated', nextPhaseName, value, type }
  const winsNeeded = Math.ceil((value - myPoints) / 3)
  return { status: 'possible', nextPhaseName, value, type, winsNeeded, pointsNeeded: value - myPoints }
}

const isActive = (e: any) => e.user_event_status?.registration_status !== 'DROPPED'

// Port of projectCut in src/lib/tournamentApi.js; see the comment there.
export function projectCut(allStandings: any[], topCutSize: number, swissRoundsRemaining: number) {
  let dist = new Map<number, number>()
  for (const e of allStandings.filter(isActive)) {
    dist.set(e.match_points, (dist.get(e.match_points) ?? 0) + 1)
  }
  for (let r = 0; r < swissRoundsRemaining; r++) {
    const next = new Map<number, number>()
    for (const [p, n] of dist) {
      next.set(p, (next.get(p) ?? 0) + n / 2)
      next.set(p + 3, (next.get(p + 3) ?? 0) + n / 2)
    }
    dist = next
  }
  let above = 0
  let lockPoints: number | null = null
  let bubble: { points: number; spots: number; players: number } | null = null
  for (const p of [...dist.keys()].sort((x, y) => y - x)) {
    const n = dist.get(p)!
    if (above + n <= topCutSize) lockPoints = p
    else if (!bubble) bubble = { points: p, spots: topCutSize - above, players: n }
    above += n
  }
  return {
    lockPoints,
    bubblePoints: bubble?.points ?? null,
    bubbleSpots: bubble ? Math.round(bubble.spots) : null,
    bubblePlayers: bubble ? Math.round(bubble.players) : null,
  }
}

// Port of analyzeId in src/lib/tournamentApi.js; see the comment there.
export function analyzeId(playerEntry: any, allStandings: any[], structure: any) {
  if (!playerEntry || !allStandings || !structure?.topCutSize || structure.isElimination) return null

  const { topCutSize, swissRoundsRemaining } = structure
  const myPoints = playerEntry.match_points
  const others = allStandings.filter((e) => e.id !== playerEntry.id && isActive(e))
  const maxGain = swissRoundsRemaining * 3

  const canCatchMe = others.filter((e) => e.match_points + maxGain >= myPoints).length
  const beyondReach = others.filter((e) => e.match_points > myPoints + maxGain).length

  let status
  if (canCatchMe < topCutSize) {
    status = 'locked'
  } else if (beyondReach >= topCutSize) {
    status = 'eliminated'
  } else if (swissRoundsRemaining === 1) {
    const afterId = myPoints + 1
    const aboveAfterId = others.filter((e) => e.match_points > afterId).length
    const passOnWin = others.filter((e) => e.match_points <= afterId && e.match_points + 3 > afterId).length
    if (aboveAfterId + passOnWin < topCutSize) status = 'safe'
    else if (aboveAfterId + Math.ceil(passOnWin / 2) < topCutSize) status = 'borderline'
    else status = 'danger'
  } else {
    status = 'contending'
  }

  const projection = projectCut(allStandings, topCutSize, swissRoundsRemaining)
  const winsTo = (pts: number | null) => (pts === null ? null : Math.max(0, Math.ceil((pts - myPoints) / 3)))

  return {
    status,
    myRank: playerEntry.rank,
    topCutSize,
    inCut: playerEntry.rank <= topCutSize,
    swissRoundsRemaining,
    maxPoints: myPoints + maxGain,
    afterIdPoints: myPoints + 1,
    ...projection,
    winsToLock: winsTo(projection.lockPoints),
    winsToBubble: winsTo(projection.bubblePoints),
  }
}
