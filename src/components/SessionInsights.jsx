import { useMemo, useState } from 'react'
import { StatCard } from './StatCard'
import {
  buildSessions,
  winRateByPosition,
  winRateAfterLossStreak,
  winRateByTimeOfDay,
  winRateByDayOfWeek,
  stopLossSuggestion,
  summarizeSessions,
  SESSION_GAP_MINUTES,
} from '../lib/sessionStats'

// Rows under this many decisive games are shown faded — too few to read much into.
const LOW_SAMPLE = 10

function pct(x) {
  return x == null ? '—' : `${Math.round(x * 100)}%`
}

function BucketTable({ title, rows }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
            <th className="py-1 pr-2 font-medium" />
            <th className="py-1 px-2 font-medium text-right">W–L</th>
            <th className="py-1 px-2 font-medium text-right">Win rate</th>
            <th className="py-1 pl-2 font-medium text-right">Avg MMR Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} className={`border-b border-gray-50 ${r.games < LOW_SAMPLE ? 'opacity-50' : ''}`}>
              <td className="py-1 pr-2 text-gray-700">{r.label}</td>
              <td className="py-1 px-2 text-right tabular-nums text-gray-600">{r.wins}–{r.losses}</td>
              <td className="py-1 px-2 text-right tabular-nums">
                <span className="font-semibold text-gray-900">{pct(r.winRate)}</span>
                {r.interval && (
                  <span className="ml-1 text-xs text-gray-400">{pct(r.interval[0])}–{pct(r.interval[1])}</span>
                )}
              </td>
              <td className={`py-1 pl-2 text-right tabular-nums ${r.avgMmrDelta == null ? 'text-gray-400' : r.avgMmrDelta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {r.avgMmrDelta == null ? '—' : `${r.avgMmrDelta > 0 ? '+' : ''}${r.avgMmrDelta.toFixed(1)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StopLossCallout({ suggestion, streakRows }) {
  if (suggestion) {
    const { afterLosses, streakWinRate, baselineWinRate, games } = suggestion
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="font-semibold">Consider a break after {afterLosses} straight losses.</span>{' '}
        After {afterLosses}+ losses in a row, your next-game win rate is {pct(streakWinRate)} ({games} games), against {pct(baselineWinRate)} after a win. The gap is bigger than chance explains.
      </div>
    )
  }
  const afterLossGames = streakRows.filter(r => r.key !== '0').reduce((sum, r) => sum + r.games, 0)
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
      No clear drop in win rate after losing streaks yet ({afterLossGames} games played right after a loss). Keep playing, or load more history, for a sharper read.
    </div>
  )
}

// Collapsible "Sessions & tilt" card for Match History. `games` is the page's
// filteredGames, so its queue/date/color/deck filters scope this too.
export function SessionInsights({ games }) {
  const [open, setOpen] = useState(false)

  const data = useMemo(() => {
    if (!open) return null
    const sessions = buildSessions(games)
    const streak = winRateAfterLossStreak(sessions)
    return {
      summary: summarizeSessions(sessions, games.length),
      position: winRateByPosition(sessions),
      streak,
      suggestion: stopLossSuggestion(streak),
      timeOfDay: winRateByTimeOfDay(sessions),
      dayOfWeek: winRateByDayOfWeek(sessions),
    }
  }, [games, open])

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
      >
        <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Sessions & Tilt</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {data && (
        <div className="mt-4 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatCard label="Sessions" value={data.summary.sessions} />
            <StatCard label="Avg length" value={`${data.summary.avgLength.toFixed(1)} games`} />
            <StatCard label="Longest" value={`${data.summary.longest} games`} />
            <StatCard label="Bot games skipped" value={data.summary.botGamesExcluded} />
          </div>

          <StopLossCallout suggestion={data.suggestion} streakRows={data.streak} />

          <div className="grid gap-6 lg:grid-cols-2">
            <BucketTable title="By game number in session" rows={data.position} />
            <BucketTable title="After a losing streak" rows={data.streak} />
            <BucketTable title="By time of day (your local time)" rows={data.timeOfDay} />
            <BucketTable title="By day of week" rows={data.dayOfWeek} />
          </div>

          <p className="text-xs text-gray-400">
            Based on the {data.summary.games} games loaded and filtered above. A session ends after {SESSION_GAP_MINUTES} minutes without a game. Each game of a Bo3 counts separately, and draws or abandoned games don't count toward win rates. Faded rows have fewer than {LOW_SAMPLE} games. The ranges show 95% confidence. As MMR climbs within a good session, you also face tougher opponents, so read the trends as signals, not verdicts. Load more history for a sharper read.
          </p>
        </div>
      )}
    </div>
  )
}
