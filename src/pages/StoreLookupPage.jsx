import { useState, useEffect, useRef } from 'react'
import {
  fetchGameStore,
  fetchAllStoreEvents,
  fetchUniqueFanCount,
  mapWithConcurrency,
} from '../lib/tournamentApi'
import {
  eventsInWindow,
  computeTierProgress,
  PRORATE_WINDOW,
  standingWindowEvents,
  computeStandingTierStatus,
} from '../lib/storeTiers'
import { DEFAULT_TRACKED_STORE_URLS } from '../lib/trackedStores'

const LAST_INPUT_KEY = 'lorcana_store_lookup_last_input'
const DEFAULT_INPUT = DEFAULT_TRACKED_STORE_URLS.join('\n')

// Store IDs are UUIDs. Accept either raw IDs (one per line / comma-separated)
// or pasted store URLs — pull every UUID out of the input regardless of
// surrounding text.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

function extractStoreIds(input) {
  const matches = input.match(UUID_RE) ?? []
  return [...new Set(matches.map((id) => id.toLowerCase()))]
}

const STORE_TYPE_LABELS = {
  physicalAndOnlineRetailer: 'Physical and Online Retailer',
  organizedPlay: 'Organized Play',
}

const PRORATE_WINDOW_LABEL = 'Sep 1 – Nov 1, 2026'

function TierMetric({ label, value, target }) {
  const met = value >= target
  return (
    <div className={`rounded px-2 py-1 ${met ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-600'}`}>
      <div className="font-semibold">{value}/{target}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  )
}

function TierStatusBlock({ tier }) {
  if (!tier || tier.status === 'idle') return null

  if (tier.status === 'loading') {
    return <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">Checking tier status…</p>
  }

  if (tier.status === 'error') {
    return (
      <p className="text-xs text-red-500 mt-3 pt-3 border-t border-gray-100">
        Tier status: {tier.error}
      </p>
    )
  }

  const { totalEvents, eventTickets, uniqueFans, hasHyperiaPrerelease, requirements, meetsProvisionalLegendary } =
    tier.data

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Pro-rated Legendary ({PRORATE_WINDOW_LABEL})
        </span>
        <span
          className={`flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${
            meetsProvisionalLegendary ? 'text-emerald-700 bg-emerald-100' : 'text-gray-600 bg-gray-100'
          }`}
        >
          {meetsProvisionalLegendary ? 'On Pace' : 'Not Yet'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
        <TierMetric label="Events" value={totalEvents} target={requirements.totalEvents} />
        <TierMetric label="Unique Fans" value={uniqueFans} target={requirements.uniqueFans} />
        <TierMetric label="Tickets" value={eventTickets} target={requirements.eventTickets} />
      </div>
      <p className={`text-xs mt-2 ${hasHyperiaPrerelease ? 'text-emerald-700' : 'text-gray-500'}`}>
        {hasHyperiaPrerelease ? '✓' : '—'} Hyperia City Prerelease
      </p>
    </div>
  )
}

const STANDING_TIER_LABELS = {
  welcome: 'Welcome',
  standard: 'Standard',
  legendary: 'Legendary',
}

const STANDING_TIER_STYLES = {
  welcome: 'text-gray-600 bg-gray-100',
  standard: 'text-blue-700 bg-blue-100',
  legendary: 'text-emerald-700 bg-emerald-100',
}

function StandingTierBlock({ standing }) {
  if (!standing || standing.status === 'idle') return null

  if (standing.status === 'loading') {
    return <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">Checking standing tier (trailing 4 set seasons)…</p>
  }

  if (standing.status === 'error') {
    return (
      <p className="text-xs text-red-500 mt-3 pt-3 border-t border-gray-100">
        Standing tier: {standing.error}
      </p>
    )
  }

  const { tier, insufficientHistory, seasonsAvailable } = standing.data

  if (insufficientHistory) {
    return (
      <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
        Standing tier: no Prerelease history found — can't determine set seasons yet.
      </p>
    )
  }

  const { metrics, standardRequirements, legendaryRequirements } = standing.data
  const requirements = tier === 'legendary' || metrics.totalEvents >= standardRequirements.totalEvents
    ? legendaryRequirements
    : standardRequirements

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Standing Tier (last {seasonsAvailable} set season{seasonsAvailable === 1 ? '' : 's'})
        </span>
        <span
          className={`flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${STANDING_TIER_STYLES[tier]}`}
        >
          {STANDING_TIER_LABELS[tier]}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
        <TierMetric label="Events" value={metrics.totalEvents} target={requirements.totalEvents} />
        <TierMetric label="Unique Fans" value={metrics.uniqueFans} target={requirements.uniqueFans} />
        <TierMetric label="Tickets" value={metrics.eventTickets} target={requirements.eventTickets} />
      </div>
      <p className="text-xs text-gray-500 mt-2">
        {metrics.prereleaseCount}/{metrics.prereleaseRequirement} Prerelease seasons run
      </p>
    </div>
  )
}

function StoreCard({ result }) {
  if (result.status === 'loading') {
    return (
      <div className="border border-gray-200 rounded-lg p-5 text-sm text-gray-500">
        Loading {result.storeId}…
      </div>
    )
  }

  if (result.status === 'error') {
    return (
      <div className="border border-red-200 bg-red-50 rounded-lg p-5">
        <p className="text-sm font-medium text-red-700 break-all">{result.storeId}</p>
        <p className="text-sm text-red-600 mt-1">{result.error}</p>
      </div>
    )
  }

  const { store: data } = result
  const store = data.store

  return (
    <div className="border border-gray-200 rounded-lg p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-base font-bold text-gray-900">{store.name}</h3>
        {store.is_premium && (
          <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
            Premium
          </span>
        )}
      </div>

      {store.full_address && (
        <p className="text-sm text-gray-600 mb-1">{store.full_address}</p>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mb-3">
        {store.email && <a href={`mailto:${store.email}`} className="hover:underline">{store.email}</a>}
        {store.phone_number && <span>{store.phone_number}</span>}
        {store.website && (
          <a href={store.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
            Website ↗
          </a>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {(store.store_types_pretty ?? store.store_types ?? []).map((t) => (
          <span
            key={t}
            className="text-xs text-gray-700 bg-gray-100 rounded px-2 py-0.5"
          >
            {STORE_TYPE_LABELS[t] ?? t}
          </span>
        ))}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600 border-t border-gray-100 pt-3">
        {store.seat_count != null && (
          <>
            <dt className="text-gray-400">Seats</dt>
            <dd className="text-gray-900">{store.seat_count}</dd>
          </>
        )}
        {store.carde_store_number != null && (
          <>
            <dt className="text-gray-400">Carde #</dt>
            <dd className="text-gray-900">{store.carde_store_number}</dd>
          </>
        )}
        {store.total_player_interactions != null && (
          <>
            <dt className="text-gray-400">Player interactions</dt>
            <dd className="text-gray-900">{store.total_player_interactions}</dd>
          </>
        )}
      </dl>

      <TierStatusBlock tier={result.tier} />
      <StandingTierBlock standing={result.standing} />

      <p className="text-xs text-gray-400 mt-3 break-all">{data.id}</p>
    </div>
  )
}

export function StoreLookupPage() {
  const [input, setInput] = useState(() => localStorage.getItem(LAST_INPUT_KEY) ?? DEFAULT_INPUT)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const hasAutoLoaded = useRef(false)

  function patchResult(storeId, patch) {
    setResults((prev) => prev.map((r) => (r.storeId === storeId ? { ...r, ...patch } : r)))
  }

  async function loadTierStatus(storeId, store) {
    const numericStoreId = store?.store?.id
    if (numericStoreId == null) {
      const error = { status: 'error', error: 'Missing internal store id' }
      patchResult(storeId, { tier: error, standing: error })
      return
    }

    patchResult(storeId, { tier: { status: 'loading' }, standing: { status: 'loading' } })

    let allEvents
    try {
      allEvents = await fetchAllStoreEvents(numericStoreId)
    } catch (err) {
      const error = { status: 'error', error: err.message || 'Failed to load events' }
      patchResult(storeId, { tier: error, standing: error })
      return
    }

    // Pro-rated window (Sep 1 – Nov 1, 2026) — a handful of events, resolves fast.
    try {
      const windowEvents = eventsInWindow(allEvents, PRORATE_WINDOW.start, PRORATE_WINDOW.end)
      const uniqueFans = await fetchUniqueFanCount(windowEvents)
      patchResult(storeId, { tier: { status: 'ok', data: computeTierProgress(windowEvents, uniqueFans) } })
    } catch (err) {
      patchResult(storeId, { tier: { status: 'error', error: err.message || 'Failed to compute tier status' } })
    }

    // Steady-state standing (trailing 4 set seasons, derived from each
    // store's own Prerelease history) — a larger event set, so this settles
    // after the pro-rated panel above.
    try {
      const { eligibleEvents } = standingWindowEvents(allEvents)
      const uniqueFans = eligibleEvents.length > 0 ? await fetchUniqueFanCount(eligibleEvents) : 0
      patchResult(storeId, { standing: { status: 'ok', data: computeStandingTierStatus(allEvents, uniqueFans) } })
    } catch (err) {
      patchResult(storeId, { standing: { status: 'error', error: err.message || 'Failed to compute standing tier' } })
    }
  }

  async function runLookup(text) {
    const storeIds = extractStoreIds(text)
    if (storeIds.length === 0) {
      setResults([{ status: 'error', storeId: '(none found)', error: 'No store IDs found in the input.' }])
      return
    }

    localStorage.setItem(LAST_INPUT_KEY, text)
    setLoading(true)
    setResults(
      storeIds.map((storeId) => ({
        status: 'loading',
        storeId,
        tier: { status: 'idle' },
        standing: { status: 'idle' },
      }))
    )

    const loadedStores = []

    // Limit concurrent store-info requests so we don't fire dozens of
    // simultaneous serverless invocations at once.
    await mapWithConcurrency(storeIds, 8, async (storeId) => {
      try {
        const store = await fetchGameStore(storeId)
        patchResult(storeId, { status: 'ok', store })
        loadedStores.push({ storeId, store })
      } catch (err) {
        patchResult(storeId, { status: 'error', error: err.message || 'Failed to load store' })
      }
    })

    setLoading(false)

    // Tier status is a second, heavier pass (event history + per-event
    // registrations) — run it after store cards are up, with its own
    // (lower) concurrency cap since each store fans out into several
    // more requests internally.
    await mapWithConcurrency(loadedStores, 4, ({ storeId, store }) => loadTierStatus(storeId, store))
  }

  // Auto-load once on first visit so the page is useful without an extra click.
  // Deferred to the next tick (rather than called synchronously in the effect
  // body) so the resulting setState calls don't trigger cascading renders.
  useEffect(() => {
    if (hasAutoLoaded.current) return
    hasAutoLoaded.current = true
    if (!input) return
    const id = setTimeout(() => runLookup(input), 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function loadStores(e) {
    e.preventDefault()
    runLookup(input)
  }

  const tiersDone = results.filter((r) => r.status === 'ok' && r.tier?.status === 'ok')
  const tiersPending = results.some(
    (r) => r.status === 'ok' && (!r.tier || r.tier.status === 'idle' || r.tier.status === 'loading')
  )
  const onPaceCount = tiersDone.filter((r) => r.tier.data.meetsProvisionalLegendary).length

  return (
    <div className="w-full px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">
          Store Lookup
        </h1>
        <p className="text-sm text-gray-500">
          Paste one or more Ravensburger Play store IDs or store URLs (one per line, or separated by commas)
          to look up store details, progress toward provisional Legendary status for the {PRORATE_WINDOW_LABEL}{' '}
          pro-rating window, and steady-state Standard/Legendary standing over the trailing 4 set seasons
          (derived from each store's own Prerelease event history).
        </p>
      </div>

      <form onSubmit={loadStores} className="mb-6">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="63116552-e809-4e3d-85f0-9ef1f8f3f950"
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono mb-3"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading…' : 'Look Up Stores'}
        </button>
      </form>

      {results.length > 0 && (
        <div className="mb-4 text-sm text-gray-600">
          {tiersPending
            ? 'Checking pro-rated Legendary tier status for each store…'
            : `${onPaceCount} of ${tiersDone.length} stores on pace for provisional Legendary status (${PRORATE_WINDOW_LABEL}).`}
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {results.map((result) => (
            <StoreCard key={result.storeId} result={result} />
          ))}
        </div>
      )}
    </div>
  )
}
