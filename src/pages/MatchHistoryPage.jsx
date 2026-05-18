import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getToken, fetchMatchHistory, fetchReplayBuffer } from '../lib/duelsApi'

function formatDate(isoString) {
  if (!isoString) return '—'
  const d = new Date(isoString)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).replace(',', ' ·')
}

function formatDuration(seconds) {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function ResultBadge({ result }) {
  if (!result) return <span className="text-gray-400">—</span>
  const lower = result.toLowerCase()
  if (lower === 'win') return <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800">Win</span>
  if (lower === 'loss') return <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded bg-red-100 text-red-800">Loss</span>
  return <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600">Draw</span>
}

function MmrDelta({ delta }) {
  if (delta == null) return <span className="text-gray-400">—</span>
  if (delta > 0) return <span className="text-green-600 font-medium">+{delta}</span>
  if (delta < 0) return <span className="text-red-600 font-medium">{delta}</span>
  return <span className="text-gray-500">0</span>
}

function InkIcons({ colors }) {
  if (!colors) return <span className="text-gray-400">—</span>
  const names = colors.split('/').map(c => c.trim().toLowerCase()).filter(Boolean)
  return (
    <span className="flex items-center gap-1">
      {names.map(name => (
        <img key={name} src={`/ink/${name}.png`} alt={name} title={name} className="w-5 h-5" />
      ))}
    </span>
  )
}

function ImportReplayButton({ game }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState(null) // null | 'loading' | 'done' | 'error'

  if (!game.replay_id) return null

  async function handleImport() {
    setStatus('loading')
    try {
      const buf = await fetchReplayBuffer(game.replay_id)
      const bytes = new Uint8Array(buf)
      const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('')
      const base64 = btoa(binary)
      sessionStorage.setItem('lorcana_pending_replay', JSON.stringify({
        base64,
        filename: game.replay_filename ?? `${game.replay_id}.replay.gz`,
      }))
      navigate('/replay-analyzer')
    } catch {
      setStatus('error')
      setTimeout(() => setStatus(null), 3000)
    }
  }

  return (
    <button
      onClick={handleImport}
      disabled={status === 'loading'}
      className="text-xs text-gray-400 hover:text-gray-900 transition-colors disabled:opacity-40 whitespace-nowrap"
      title="Import replay into Replay Analyzer"
    >
      {status === 'loading' ? 'Importing…' : status === 'error' ? 'Failed' : '↗ Replay'}
    </button>
  )
}

function GameRow({ game }) {
  const isSealed = game.queue_id?.toLowerCase().includes('sealed') || game.queue_name?.toLowerCase().includes('sealed')
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="py-3 px-3 text-sm text-gray-600 whitespace-nowrap">
        {formatDate(game.started_at)}
      </td>
      <td className="py-3 px-3 text-sm text-gray-700 hidden sm:table-cell max-w-[120px] truncate">
        {game.queue_name ?? '—'}
      </td>
      <td className="py-3 px-3">
        <ResultBadge result={game.result} />
      </td>
      <td className="py-3 px-3 hidden sm:table-cell">
        {isSealed ? <span className="text-gray-400 text-sm">Sealed</span> : <InkIcons colors={game.your_deck_colors} />}
      </td>
      <td className="py-3 px-3 text-sm text-gray-700 hidden sm:table-cell">
        <span className="inline-flex items-center gap-2">
          {!isSealed && game.opp_deck_colors && <InkIcons colors={game.opp_deck_colors} />}
          <span className="font-medium">{game.opp_display_name ?? '—'}</span>
        </span>
      </td>
      <td className="py-3 px-3 text-sm text-gray-700 whitespace-nowrap">
        {game.your_lore ?? '?'} – {game.opp_lore ?? '?'}
      </td>
      <td className="py-3 px-3 text-sm text-gray-500 hidden sm:table-cell text-center">
        {game.turns ?? '—'}
      </td>
      <td className="py-3 px-3 text-sm text-gray-500 hidden sm:table-cell whitespace-nowrap">
        {formatDuration(game.duration_seconds)}
      </td>
      <td className="py-3 px-3 text-sm hidden sm:table-cell text-center">
        <MmrDelta delta={game.mmr_delta} />
      </td>
      <td className="py-3 px-3 hidden sm:table-cell">
        <div className="flex flex-col gap-1">
          <ImportReplayButton game={game} />
          {game.gamelog_id && (
            <Link
              to={`/gamelog?id=${game.gamelog_id}`}
              className="text-xs text-gray-400 hover:text-gray-900 transition-colors whitespace-nowrap"
              title="View full gamelog"
            >
              ↗ Gamelog
            </Link>
          )}
        </div>
      </td>
    </tr>
  )
}

export function MatchHistoryPage() {
  const hasToken = Boolean(getToken())
  const [games, setGames] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

  async function load({ cursor = null, append = false } = {}) {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)

    try {
      const data = await fetchMatchHistory({ cursor: cursor ?? undefined, limit: 100 })
      setGames(prev => append ? [...prev, ...(data.games ?? [])] : (data.games ?? []))
      setNextCursor(data.next_cursor ?? null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    if (hasToken) load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">Match History</h1>
        <p className="text-sm text-gray-500">Imported from duels.ink</p>
      </div>

      {!hasToken && (
        <div className="border border-gray-200 rounded-lg p-6 text-sm text-gray-600">
          Add your duels.ink API token in{' '}
          <Link to="/settings" className="underline hover:text-gray-900 transition-colors">
            Settings
          </Link>{' '}
          to import match history.
        </div>
      )}

      {hasToken && loading && (
        <p className="text-sm text-gray-500">Loading match history…</p>
      )}

      {hasToken && error && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {hasToken && !loading && !error && games.length === 0 && (
        <p className="text-sm text-gray-500">No games found.</p>
      )}

      {games.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Queue</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Your Colors</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Opponent</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell text-center">Turns</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Duration</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell text-center">MMR Δ</th>
                <th className="py-2 px-3 hidden sm:table-cell" />
              </tr>
            </thead>
            <tbody>
              {games.map((game, i) => (
                <GameRow key={game.game_id ?? i} game={game} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => load({ cursor: nextCursor, append: true })}
            disabled={loadingMore}
            className="border border-gray-900 text-sm font-medium px-4 py-2 hover:bg-gray-900 hover:text-white transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
