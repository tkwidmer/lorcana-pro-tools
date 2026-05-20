import { useEffect, useMemo, useState } from 'react'
import { fetchLeaderboard } from '../lib/leaderboardApi'

function Histogram({ buckets, highlightMmr }) {
  const max = Math.max(...buckets.map(b => b.count), 1)
  return (
    <div className="flex items-end gap-px h-32">
      {buckets.map(b => {
        const h = Math.max(2, Math.round((b.count / max) * 100))
        const isHighlight =
          highlightMmr != null && highlightMmr >= b.bucket && highlightMmr < b.bucket + 50
        return (
          <div
            key={b.bucket}
            className="flex-1 group relative"
            title={`${b.bucket}-${b.bucket + 49} MMR: ${b.count} players`}
          >
            <div
              className={`w-full ${isHighlight ? 'bg-gray-900' : 'bg-gray-300 group-hover:bg-gray-500'} transition-colors`}
              style={{ height: `${h}%` }}
            />
          </div>
        )
      })}
    </div>
  )
}

function tierSlug(name) {
  return name?.toLowerCase().replace(/\s+/g, '-')
}

function TierIcon({ tier }) {
  if (!tier?.name) return null
  const slug = tierSlug(tier.name)
  return (
    <img
      src={`/tiers/${slug}.png`}
      alt={tier.name}
      title={tier.name}
      className="w-5 h-5 inline-block align-middle"
      onError={e => {
        e.currentTarget.style.visibility = 'hidden'
      }}
    />
  )
}

function SocialLinks({ links }) {
  if (!links) return null
  const items = []
  if (links.twitch) items.push({ label: 'Twitch', href: links.twitch })
  if (links.twitter) items.push({ label: 'X', href: links.twitter })
  if (links.youtube) items.push({ label: 'YT', href: links.youtube })
  if (!items.length) return null
  return (
    <span className="text-xs text-gray-400">
      {items.map((it, i) => (
        <span key={it.href}>
          {i > 0 && ' · '}
          <a
            href={it.href}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-700 hover:underline"
          >
            {it.label}
          </a>
        </span>
      ))}
    </span>
  )
}

export function LeaderboardPage() {
  const [data, setData] = useState(null)
  const [queue, setQueue] = useState('core-bo1')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchLeaderboard({ queue })
      .then(d => {
        if (!cancelled) setData(d)
      })
      .catch(e => {
        if (!cancelled) setError(e.message || String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [queue])

  const queues = data?.meta?.queues?.active ?? []
  const leaderboard = data?.leaderboard ?? []
  const distribution = data?.meta?.mmrDistribution ?? []
  const currentSeason = data?.meta?.seasons?.currentSeason
  const minGames = data?.meta?.minGamesRequired

  const totalPlayers = useMemo(
    () => distribution.reduce((acc, b) => acc + b.count, 0),
    [distribution],
  )
  const top1Mmr = leaderboard[0]?.mmr

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">
          Leaderboard
        </h1>
        <p className="text-sm text-gray-500">
          Top 50 ranked players from duels.ink, MMR distribution, and current season info.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-700">Queue:</label>
        <select
          value={queue}
          onChange={e => setQueue(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
        >
          {queues.length === 0 && (
            <option value={queue}>{queue}</option>
          )}
          {queues.map(q => (
            <option key={q.id} value={q.id}>
              {q.name}
            </option>
          ))}
        </select>
        {currentSeason && (
          <span className="text-xs text-gray-500">
            Season {currentSeason.number}: {currentSeason.name}
          </span>
        )}
        {minGames != null && (
          <span className="text-xs text-gray-500">· Min {minGames} games to qualify</span>
        )}
      </div>

      {loading && <div className="text-sm text-gray-500">Loading…</div>}
      {error && (
        <div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded p-3">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="mb-8 border border-gray-200 rounded-lg p-4">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-900">MMR Distribution</h2>
              <span className="text-xs text-gray-500">
                {totalPlayers.toLocaleString()} ranked players · top MMR{' '}
                {top1Mmr ?? '—'}
              </span>
            </div>
            <Histogram buckets={distribution} highlightMmr={top1Mmr} />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{distribution[0]?.bucket ?? ''}</span>
              <span>
                {distribution[distribution.length - 1]?.bucket
                  ? `${distribution[distribution.length - 1].bucket}+`
                  : ''}
              </span>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 w-12">#</th>
                  <th className="text-left px-3 py-2">Player</th>
                  <th className="text-right px-3 py-2">MMR</th>
                  <th className="text-right px-3 py-2 hidden sm:table-cell">Peak</th>
                  <th className="text-right px-3 py-2">W</th>
                  <th className="text-right px-3 py-2">L</th>
                  <th className="text-right px-3 py-2">WR</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map(row => {
                  const name =
                    row.isAnonymous || !row.username ? 'Anonymous' : row.username
                  const nameStyle = row.supporterData?.nameColor
                    ? { color: row.supporterData.nameColor }
                    : undefined
                  return (
                    <tr
                      key={row.userId}
                      className="border-t border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-3 py-2 text-gray-500">{row.rank}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <TierIcon tier={row.tier} />
                          <span className="font-medium" style={nameStyle}>
                            {name}
                          </span>
                          <SocialLinks links={row.socialLinks} />
                          {row.isInactive && (
                            <span className="text-xs text-gray-400">(inactive)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {row.mmr}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-500 hidden sm:table-cell">
                        {row.peakMmr}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700">
                        {row.wins}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-500">
                        {row.losses}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {row.winRate}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
