// The numeric event id from a Play Hub event URL, or null.
export function extractEventId(url) {
  const match = String(url ?? '').match(/\/events\/(\d+)/)
  return match ? match[1] : null
}

// RPH keeps a phase's points cutoff (a DLC's 18 for Day 2) on the event's
// configuration template, not on the event's own phases. The templates are
// shared by every event, so they're fetched once per page load.
let templatesPromise = null
function fetchPhaseTemplates() {
  templatesPromise ??= fetch('/api/tournament?type=templates')
    .then(async (response) => {
      if (!response.ok) throw new Error(`Failed to fetch event templates (HTTP ${response.status})`)
      return response.json()
    })
    .catch((err) => {
      templatesPromise = null
      throw err
    })
  return templatesPromise
}

// Copies points_required_to_enter_phase from the event's phase template group
// (event.phase_template_group) onto its phases, matched by order. Events
// without a template group are returned unchanged.
export function withPhasePoints(eventDetails, templates) {
  const group = templates
    .flatMap((t) => t.event_structure_policy?.allowed_phase_template_groups ?? [])
    .find((g) => g.id === eventDetails.phase_template_group)
  if (!group) return eventDetails
  return {
    ...eventDetails,
    tournament_phases: eventDetails.tournament_phases.map((phase) => ({
      ...phase,
      points_required_to_enter_phase: group.phase_templates[phase.order_in_phases - 1]?.points_required_to_enter_phase ?? null,
    })),
  }
}

export async function fetchEventDetails(eventId) {
  try {
    const [response, templates] = await Promise.all([
      fetch(`/api/tournament?type=event&eventId=${eventId}`),
      fetchPhaseTemplates(),
    ])

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(`${error.detail || error.error || 'Failed to fetch event details'} (HTTP ${response.status})`)
    }

    return withPhasePoints(await response.json(), templates)
  } catch (err) {
    console.error('Event details fetch error:', err)
    throw err
  }
}

export async function fetchGameStore(storeId) {
  try {
    const response = await fetch(`/api/tournament?type=store&storeId=${encodeURIComponent(storeId)}`)

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || error.error || `Failed to fetch store ${storeId}`)
    }

    return await response.json()
  } catch (err) {
    console.error('Game store fetch error:', err)
    throw err
  }
}

// Fetches every Disney Lorcana event ever run at a store, paginating until
// exhausted. `numericStoreId` is the store's internal integer id
// (`store.store.id` from fetchGameStore), not the store-page UUID.
export async function fetchAllStoreEvents(numericStoreId) {
  const allResults = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const response = await fetch(
      `/api/tournament?type=storeEvents&storeNumericId=${encodeURIComponent(numericStoreId)}&page=${page}&pageSize=100`
    )
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.detail || error.error || `Failed to fetch events for store ${numericStoreId}`)
    }
    const data = await response.json()
    allResults.push(...(data.results ?? []))
    hasMore = data.next_page_number !== null && data.next_page_number !== undefined
    page = data.next_page_number || page + 1
  }

  return allResults
}

// Runs `fn` over `items` with at most `limit` calls in flight at once.
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let index = 0

  async function worker() {
    while (index < items.length) {
      const i = index++
      results[i] = await fn(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// Fetches registrations for each event and returns the count of distinct
// registered users across all of them — a store's "unique fans" for a period,
// as opposed to raw ticket count which double-counts repeat attendees.
export async function fetchUniqueFanCount(events, concurrency = 5) {
  const userIds = new Set()

  await mapWithConcurrency(events, concurrency, async (event) => {
    try {
      const regs = await fetchAllRegistrations(event.id)
      for (const reg of regs) {
        if (reg.user?.id != null) userIds.add(reg.user.id)
      }
    } catch {
      // Skip events whose registrations fail to load; don't block the rest
    }
  })

  return userIds.size
}

function dayOneOver(phases, dayOne, currentPhaseIndex, currentRoundNumber) {
  if (!dayOne || currentPhaseIndex < 0) return false
  const dayOneIndex = phases.indexOf(dayOne)
  return currentPhaseIndex > dayOneIndex || (currentPhaseIndex === dayOneIndex && currentRoundNumber >= dayOne.number_of_rounds)
}

export function getTournamentStructure(eventDetails) {
  if (!eventDetails || !eventDetails.tournament_phases) return null

  const phases = eventDetails.tournament_phases
  const swissPhases = phases.filter((p) => p.round_type === 'SWISS')
  const eliminationPhase = phases.find((p) => p.round_type === 'RANKED_SINGLE_ELIMINATION')

  // Total swiss rounds across all swiss phases
  const totalSwissRounds = swissPhases.reduce((sum, p) => sum + (p.number_of_rounds || 0), 0)

  // Top cut size: prefer explicit field, fall back to rank_required on elimination phase
  const topCutSize =
    eventDetails.top_cut_size || eliminationPhase?.rank_required_to_enter_phase || null

  // Find the best round to show standings for:
  // Prefer IN_PROGRESS with standings generated, then fall back to last COMPLETE with standings generated
  let currentRoundId = null
  let currentRoundNumber = null
  let currentPhaseType = null
  let currentPhaseName = null
  let currentPhaseIndex = -1

  // The active round is the latest one that has started, whether or not its
  // standings exist yet: RPH posts a round's pairings before it generates
  // that round's standings, and the current-round logic below waits for the
  // standings. Pairings come from this round; records from the current one.
  let activeRoundId = null
  let activeRoundNumber = null
  let activePhaseType = null
  let activePhaseName = null
  for (const phase of phases) {
    for (const r of phase.rounds ?? []) {
      if (r.status === 'UPCOMING') continue
      activeRoundId = r.id
      activeRoundNumber = r.round_number
      activePhaseType = phase.round_type
      activePhaseName = phase.phase_name
    }
  }

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]
    if (!phase.rounds) continue

    // Check for in-progress round with generated standings
    const inProgressWithStandings = phase.rounds.find(
      (r) => r.status === 'IN_PROGRESS' && r.standings_status === 'GENERATED'
    )
    if (inProgressWithStandings) {
      currentRoundId = inProgressWithStandings.id
      currentRoundNumber = inProgressWithStandings.round_number
      currentPhaseType = phase.round_type
      currentPhaseName = phase.phase_name
      currentPhaseIndex = i
      break
    }

    // Track last completed round with generated standings as fallback
    const completedWithStandings = phase.rounds.filter(
      (r) => r.status === 'COMPLETE' && r.standings_status === 'GENERATED'
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
    currentPhaseType === 'SWISS' ? totalSwissRounds - currentRoundNumber : 0

  // Determine what's needed to advance to the next phase
  const nextPhase =
    currentPhaseIndex >= 0 && currentPhaseIndex + 1 < phases.length
      ? phases[currentPhaseIndex + 1]
      : null

  let advancementRequirement = null
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
    activeRoundId,
    activeRoundNumber,
    activePhaseType,
    activePhaseName,
    // The elimination phase's own phase_name, present whenever the event has
    // a top-cut bracket at all — regardless of whether Swiss or the bracket
    // is the *currently* displayed phase. Used to pick out bracket matches
    // from the flat `allMatches` list (each match carries `phase_name`).
    eliminationPhaseName: eliminationPhase?.phase_name ?? null,
    // Day 2: the second Swiss phase's points cutoff (a DLC's 18), and whether
    // the standings shown are from Day 1's last round or later, when the
    // players at or over it are the Day 2 field.
    dayTwoPoints: swissPhases[1]?.points_required_to_enter_phase ?? null,
    dayOneOver: dayOneOver(phases, swissPhases[0], currentPhaseIndex, currentRoundNumber),
    isElimination,
    swissRoundsRemaining,
    advancementRequirement,
    tiebreakers: eventDetails.tiebreakers ?? [],
    eventName: eventDetails.name,
    startingPlayerCount: eventDetails.starting_player_count ?? null,
    timerEndDatetime: eventDetails.timer_end_datetime ?? null,
    timerIsRunning: eventDetails.timer_is_running ?? false,
    timerPausedAtDatetime: eventDetails.timer_paused_at_datetime ?? null,
    gameplayFormat: eventDetails.gameplay_format?.name ?? null,
    eventStore: eventDetails.store
      ? { name: eventDetails.store.name, address: eventDetails.full_address ?? null }
      : null,
    rulesEnforcementLevel: eventDetails.rules_enforcement_level ?? null,
  }
}

export async function fetchEventMatches(eventId, roundId, page = 1, pageSize = 100) {
  try {
    const params = new URLSearchParams({
      eventId: String(eventId),
      roundId: String(roundId),
      page: String(page),
      pageSize: String(pageSize),
    })
    const response = await fetch(`/api/tournament?type=matches&${params}`)
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(`${error.detail || error.error || 'Failed to fetch matches'} (HTTP ${response.status})`)
    }
    return await response.json()
  } catch (err) {
    console.error('Tournament matches fetch error:', err)
    throw err
  }
}

// Normalise the two possible response shapes:
// - Paginated: { results: [...], next_page_number: N|null }
// - Round object: { id, matches: [...], round_number, ... }
function extractMatches(data) {
  if (Array.isArray(data.results)) return { matches: data.results, nextPage: data.next_page_number ?? null }
  if (Array.isArray(data.matches)) return { matches: data.matches, nextPage: null }
  return { matches: [], nextPage: null }
}

// Every page of one round's matches.
export async function fetchRoundMatches(eventId, roundId) {
  const all = []
  let page = 1
  let hasMore = true
  while (hasMore) {
    const data = await fetchEventMatches(eventId, roundId, page, 500)
    const { matches, nextPage } = extractMatches(data)
    all.push(...matches)
    hasMore = nextPage !== null
    page = nextPage || page + 1
  }
  return all
}

// Fetches all matches for every round in the event, in parallel, with pagination.
// Returns flat array of match objects with `round_number` and `phase_name` injected.
export async function fetchAllRoundMatches(eventId, eventDetails) {
  if (!eventDetails?.tournament_phases) return []

  const rounds = []
  for (const phase of eventDetails.tournament_phases) {
    if (!phase.rounds) continue
    for (const round of phase.rounds) {
      // Skip only rounds that haven't started — an IN_PROGRESS round can
      // already have reported/partial match results worth showing, even
      // before its standings are regenerated.
      if (round.status === 'UPCOMING') continue
      rounds.push({ roundId: round.id, roundNumber: round.round_number, phaseName: phase.phase_name })
    }
  }

  const allMatches = []

  await Promise.all(
    rounds.map(async ({ roundId, roundNumber, phaseName }) => {
      try {
        for (const match of await fetchRoundMatches(eventId, roundId)) {
          allMatches.push({ ...match, round_number: roundNumber, phase_name: phaseName })
        }
      } catch {
        // Skip rounds that fail; don't block the rest
      }
    })
  )

  allMatches.sort((a, b) => a.round_number - b.round_number)
  return allMatches
}

// Keep backward compat
export function getCurrentRoundId(eventDetails) {
  return getTournamentStructure(eventDetails)?.currentRoundId ?? null
}

export async function fetchAllRegistrations(eventId) {
  const allResults = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const response = await fetch(
      `/api/tournament?type=registrations&eventId=${eventId}&page=${page}&pageSize=250`
    )
    if (!response.ok) break
    const data = await response.json()
    allResults.push(...data.results)
    hasMore = data.next_page_number !== null
    page = data.next_page_number || page + 1
  }

  return allResults
}

// A round's full standings in one call ({ standings, round_number }), with
// match_points normalized to the current total — the standings snapshot
// field is stale mid-event.
export async function fetchAllStandings(roundId) {
  const response = await fetch(`/api/tournament?type=standings&roundId=${roundId}`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`${error.detail || error.error || 'Failed to fetch standings'} (HTTP ${response.status})`)
  }
  const { standings } = await response.json()
  return standings
}

const TIEBREAKER_LABELS = {
  opponent_match_win_percentage: 'Opp. Match Win %',
  game_win_percentage: 'Game Win %',
  opponent_game_win_percentage: 'Opp. Game Win %',
}

export function formatTiebreakers(entry, tiebreakerOrder = []) {
  const order =
    tiebreakerOrder.length > 0
      ? tiebreakerOrder
      : ['opponent_match_win_percentage', 'game_win_percentage', 'opponent_game_win_percentage']

  const values = {
    opponent_match_win_percentage: (entry.opponent_match_win_percentage * 100).toFixed(2),
    game_win_percentage: (entry.game_win_percentage * 100).toFixed(2),
    opponent_game_win_percentage: (entry.opponent_game_win_percentage * 100).toFixed(2),
  }

  return {
    rank: entry.rank,
    record: entry.match_record,
    matchPoints: entry.match_points,
    ordered: order.map((key) => ({ key, label: TIEBREAKER_LABELS[key] ?? key, value: values[key] })),
  }
}

export function analyzeAdvancement(playerEntry, structure) {
  if (!playerEntry || structure?.advancementRequirement?.type !== 'points') return null

  const { advancementRequirement, swissRoundsRemaining } = structure
  const { value, nextPhaseName } = advancementRequirement
  const type = 'points'
  const myPoints = playerEntry.match_points
  const maxPossible = myPoints + swissRoundsRemaining * 3
  if (myPoints >= value) {
    return { status: 'secured', nextPhaseName, value, type }
  }
  if (maxPossible < value) {
    return { status: 'eliminated', nextPhaseName, value, type }
  }
  const winsNeeded = Math.ceil((value - myPoints) / 3)
  return { status: 'possible', nextPhaseName, value, type, winsNeeded, pointsNeeded: value - myPoints }
}

const isActive = (e) => e.user_event_status?.registration_status !== 'DROPPED'

// Where the top cut will land after the remaining Swiss rounds, from the
// current match-point distribution: each remaining round splits every point
// group in half (Swiss pairs within groups). `lockPoints` is the lowest total
// that fits entirely inside the cut; `bubblePoints` is the total the cut line
// falls in, with how many of its `bubblePlayers` get the remaining `bubbleSpots`.
// ponytail: ignores draws and the odd-player bye; a Monte Carlo of the same
// Swiss agrees within a fraction of a seat.
export function projectCut(allStandings, topCutSize, swissRoundsRemaining) {
  let dist = new Map()
  for (const e of allStandings.filter(isActive)) {
    dist.set(e.match_points, (dist.get(e.match_points) ?? 0) + 1)
  }
  for (let r = 0; r < swissRoundsRemaining; r++) {
    const next = new Map()
    for (const [p, n] of dist) {
      next.set(p, (next.get(p) ?? 0) + n / 2)
      next.set(p + 3, (next.get(p + 3) ?? 0) + n / 2)
    }
    dist = next
  }
  let above = 0
  let lockPoints = null
  let bubble = null
  for (const p of [...dist.keys()].sort((a, b) => b - a)) {
    const n = dist.get(p)
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

// Top-cut outlook for one player given the standings after the last complete
// Swiss round and the rounds still to play (`swissRoundsRemaining` counts the
// round in progress). Exact where it can be: `locked` means fewer than
// `topCutSize` others can still reach my points; `eliminated` means that many
// are already beyond my best finish. In the final round the ID question is
// answered by counting who could end above my points + 1: `safe` if even all
// of them winning leaves me in, `borderline` if that needs about half of
// those still tied with me to lose, `danger` otherwise. Earlier rounds are
// `contending`, with the projected cut and the wins it takes to reach it.
export function analyzeId(playerEntry, allStandings, structure) {
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
  const winsTo = (pts) => (pts === null ? null : Math.max(0, Math.ceil((pts - myPoints) / 3)))

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
