import { useState } from 'react'
import { detectLeaks, summarizeLeaks, LEAK_TYPES } from '../../lib/leakDetection'
import { Section } from './StatTables'

// --- Leak / mistake detection ---

const SEVERITY_STYLE = {
  high: { dot: 'bg-red-500', text: 'text-red-600', label: 'High' },
  medium: { dot: 'bg-amber-500', text: 'text-amber-600', label: 'Medium' },
  low: { dot: 'bg-gray-400', text: 'text-gray-500', label: 'Low' },
}

export function LeakReport({ enrichedGames }) {
  const [expanded, setExpanded] = useState(null)
  const summary = summarizeLeaks(enrichedGames)
  if (!summary.ranked.length) {
    return (
      <Section collapsible defaultOpen title="Leaks & Mistakes" subtitle="Recurring tendencies that cost you games">
        <p className="text-sm text-gray-400">
          No leaks detected across {summary.analyzed} game{summary.analyzed !== 1 ? 's' : ''} — clean play, or not enough signal yet. Import more games for a fuller picture.
        </p>
      </Section>
    )
  }

  return (
    <Section collapsible defaultOpen title="Leaks & Mistakes" subtitle={`Top tendencies across ${summary.analyzed} game${summary.analyzed !== 1 ? 's' : ''} · review, don't take as gospel`}>
      <div className="space-y-2">
        {summary.ranked.map(leak => {
          const meta = LEAK_TYPES[leak.type] ?? { label: leak.type }
          const isOpen = expanded === leak.type
          const wr = leak.winRateWhenPresent
          const games = leak.winsWhenPresent + leak.lossesWhenPresent
          const instances = summary.results
            .map(r => ({ game: r.game, leak: r.res.leaks.find(l => l.type === leak.type) }))
            .filter(x => x.leak)
          return (
            <div key={leak.type} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : leak.type)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{meta.label}</span>
                    <span className="text-xs text-gray-400">{leak.gamesAffected}/{summary.analyzed} games</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{meta.blurb}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {wr != null && games > 0 && (
                    <div className={`text-sm font-bold ${wr < summary.overallWinRate ? 'text-red-500' : 'text-gray-600'}`}>
                      {Math.round(wr * 100)}%
                    </div>
                  )}
                  <div className="text-[10px] text-gray-400">win rate when present</div>
                </div>
                <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/50">
                  <div className="text-xs text-gray-600 mb-3 mt-2">
                    <span className="font-semibold text-gray-700">How to fix: </span>{meta.tip}
                  </div>
                  {wr != null && wr < summary.overallWinRate && (
                    <p className="text-[11px] text-red-500 mb-3">
                      You win {Math.round(wr * 100)}% of games with this leak vs {Math.round(summary.overallWinRate * 100)}% overall — a {Math.round((summary.overallWinRate - wr) * 100)}-point drop.
                    </p>
                  )}
                  <div className="space-y-1.5">
                    {instances.map(({ game, leak: gl }) => {
                      const sev = SEVERITY_STYLE[gl.severity] ?? SEVERITY_STYLE.low
                      return (
                        <div key={game.id} className="text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${sev.dot}`} />
                            <span className="font-medium text-gray-700">
                              vs {game.opponentName || 'Unknown'}
                              {game.oppInkCombo?.length > 0 && ` (${game.oppInkCombo.map(c => c[0].toUpperCase() + c.slice(1)).join('/')})`}
                            </span>
                            <span className={`text-[10px] font-semibold ${game.won ? 'text-emerald-600' : 'text-red-500'}`}>
                              {game.won ? 'W' : 'L'}
                            </span>
                          </div>
                          <div className="ml-3.5 text-gray-500">
                            {gl.instances.map((inst, i) => (
                              <div key={i}>{inst.text}</div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-3">
        Leaks are inferred from log data without full hand knowledge — treat them as patterns to review, not certain mistakes.
      </p>
    </Section>
  )
}

export function GameLeaks({ gamelog, myPlayerNum }) {
  if (myPlayerNum == null) return null
  const { leaks } = detectLeaks(gamelog, myPlayerNum)
  if (!leaks.length) return null
  return (
    <div className="mt-6 border border-gray-100 rounded-lg p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Leaks This Game</h3>
      <div className="space-y-2.5">
        {leaks.map(leak => {
          const meta = LEAK_TYPES[leak.type] ?? { label: leak.type }
          const sev = SEVERITY_STYLE[leak.severity] ?? SEVERITY_STYLE.low
          return (
            <div key={leak.type} className="text-sm">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${sev.dot}`} />
                <span className="font-semibold text-gray-800">{meta.label}</span>
                <span className={`text-[10px] font-semibold uppercase ${sev.text}`}>{sev.label}</span>
              </div>
              <div className="ml-4 mt-0.5 text-xs text-gray-500 space-y-0.5">
                {leak.instances.map((inst, i) => (
                  <div key={i}>{inst.text}</div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-3">Inferred from the log — patterns to review, not certain mistakes.</p>
    </div>
  )
}
