import { useState } from 'react'
import { fetchGameStore } from '../lib/tournamentApi'

const LAST_INPUT_KEY = 'lorcana_store_lookup_last_input'

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

      <p className="text-xs text-gray-400 mt-3 break-all">{data.id}</p>
    </div>
  )
}

export function StoreLookupPage() {
  const [input, setInput] = useState(() => localStorage.getItem(LAST_INPUT_KEY) ?? '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  async function loadStores(e) {
    e.preventDefault()
    const storeIds = extractStoreIds(input)
    if (storeIds.length === 0) {
      setResults([{ status: 'error', storeId: '(none found)', error: 'No store IDs found in the input.' }])
      return
    }

    localStorage.setItem(LAST_INPUT_KEY, input)
    setLoading(true)
    setResults(storeIds.map((storeId) => ({ status: 'loading', storeId })))

    await Promise.all(
      storeIds.map(async (storeId) => {
        try {
          const store = await fetchGameStore(storeId)
          setResults((prev) =>
            prev.map((r) => (r.storeId === storeId ? { status: 'ok', storeId, store } : r))
          )
        } catch (err) {
          setResults((prev) =>
            prev.map((r) =>
              r.storeId === storeId
                ? { status: 'error', storeId, error: err.message || 'Failed to load store' }
                : r
            )
          )
        }
      })
    )

    setLoading(false)
  }

  return (
    <div className="w-full px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">
          Store Lookup
        </h1>
        <p className="text-sm text-gray-500">
          Paste one or more Ravensburger Play store IDs or store URLs (one per line, or separated by commas)
          to look up store details.
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {results.map((result) => (
            <StoreCard key={result.storeId} result={result} />
          ))}
        </div>
      )}
    </div>
  )
}
