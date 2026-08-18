import { useEffect, useMemo, useState } from 'react'
import { fetchLeaderboard } from '../lib/leaderboardApi'

// Ranked MMR tier thresholds, lowest to highest. duels.ink doesn't return
// these from the API (a leaderboard row's `tier` only carries a name/icon
// for that player, not the band's MMR range) — these are the fixed
// breakpoints duels.ink's own site uses, in 150-MMR steps starting at 1000.
const RANK_TIERS = [
  { name: 'Common', min: -Infinity, color: '#9a5b2e' },
  { name: 'Uncommon', min: 1000, color: '#6b7280' },
  { name: 'Rare', min: 1150, color: '#b7791f' },
  { name: 'Super Rare', min: 1300, color: '#0f7c8c' },
  { name: 'Epic', min: 1450, color: '#b08900' },
  { name: 'Legendary', min: 1600, color: '#0e9169' },
  { name: 'Enchanted', min: 1750, color: '#8b5cf6' },
  { name: 'Iconic', min: 1900, color: '#dc2626' },
]

function tierForMmr(mmr) {
  let tier = RANK_TIERS[0]
  for (const t of RANK_TIERS) {
    if (mmr >= t.min) tier = t
  }
  return tier
}

function RankTierChart({ buckets, highlightMmr }) {
  if (!buckets.length) return null
  const max = Math.max(...buckets.map(b => b.count), 1)
  const W = 1000
  const H = 160
  const padY = 4
  const stepX = W / (buckets.length - 1 || 1)
  const baseMmr = buckets[0].bucket

  const points = buckets.map((b, i) => {
    const x = i * stepX
    const y = H - padY - ((b.count / max) * (H - padY * 2))
    return [x, y]
  })
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`
  const clipId = 'rank-tier-mountain-clip'

  // Group consecutive buckets that fall in the same tier into one colored
  // rect segment (clipped to the mountain shape) — recreates the layered
  // "rank tiers" look duels.ink's own leaderboard page shows.
  const segments = []
  buckets.forEach((b, i) => {
    const tier = tierForMmr(b.bucket)
    const x0 = i * stepX - stepX / 2
    const x1 = i * stepX + stepX / 2
    const last = segments[segments.length - 1]
    if (last && last.tier === tier) {
      last.x1 = x1
    } else {
      segments.push({ tier, x0, x1 })
    }
  })

  const xForMmr = mmr => ((mmr - baseMmr) / 50) * stepX
  const breakpoints = RANK_TIERS
    .filter(t => Number.isFinite(t.min))
    .map(t => ({ mmr: t.min, x: xForMmr(t.min) }))
    .filter(bp => bp.x >= 0 && bp.x <= W)

  const highlightIdx = highlightMmr == null
    ? -1
    : buckets.findIndex(b => highlightMmr >= b.bucket && highlightMmr < b.bucket + 50)

  // Tier name labels above the chart, one per segment wide enough to fit a
  // label without crowding — positioned at each segment's midpoint.
  const labelSegments = segments.filter(s => s.x1 - s.x0 >= 60)

  return (
    <div>
      <div className="relative h-5 mb-1">
        {labelSegments.map((s, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 text-[10px] font-medium text-gray-500 whitespace-nowrap"
            style={{ left: `${((s.x0 + s.x1) / 2 / W) * 100}%` }}
          >
            {s.tier.name}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-40"
        role="img"
        aria-label="MMR distribution by rank tier"
      >
        <defs>
          <clipPath id={clipId}>
            <path d={areaPath} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {segments.map((s, i) => (
            <rect key={i} x={s.x0} y={0} width={s.x1 - s.x0} height={H} fill={s.tier.color} opacity={0.75} />
          ))}
        </g>
        <path d={linePath} fill="none" stroke="rgb(55 65 81)" strokeWidth="1.5" />
        {breakpoints.map(bp => (
          <line
            key={bp.mmr}
            x1={bp.x} x2={bp.x} y1={0} y2={H}
            stroke="white" strokeWidth="1" opacity={0.5}
          />
        ))}
        {highlightIdx >= 0 && (
          <>
            <line
              x1={points[highlightIdx][0]}
              x2={points[highlightIdx][0]}
              y1={0}
              y2={H}
              stroke="rgb(17 24 39)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle
              cx={points[highlightIdx][0]}
              cy={points[highlightIdx][1]}
              r="3.5"
              fill="rgb(17 24 39)"
            />
          </>
        )}
        {buckets.map((b, i) => (
          <rect
            key={b.bucket}
            x={i * stepX - stepX / 2}
            y={0}
            width={stepX}
            height={H}
            fill="transparent"
          >
            <title>{`${b.bucket}-${b.bucket + 49} MMR (${tierForMmr(b.bucket).name}): ${b.count} players`}</title>
          </rect>
        ))}
      </svg>
      <div className="relative h-4 mt-1">
        {breakpoints.map(bp => (
          <span
            key={bp.mmr}
            className="absolute -translate-x-1/2 text-[10px] text-gray-400"
            style={{ left: `${(bp.x / W) * 100}%` }}
          >
            {bp.mmr}
          </span>
        ))}
      </div>
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const distribution = data?.meta?.mmrDistribution
  const currentSeason = data?.meta?.seasons?.currentSeason
  const minGames = data?.meta?.minGamesRequired

  const totalPlayers = useMemo(
    () => (distribution ?? []).reduce((acc, b) => acc + b.count, 0),
    [distribution],
  )
  const top1Mmr = leaderboard[0]?.mmr

  return (
    <div className="w-full px-6 py-8">
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
              <h2 className="text-sm font-semibold text-gray-900">Rank Tiers</h2>
              <span className="text-xs text-gray-500">
                {totalPlayers.toLocaleString()} ranked players · top MMR{' '}
                {top1Mmr ?? '—'}
              </span>
            </div>
            <RankTierChart buckets={distribution} highlightMmr={top1Mmr} />
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
