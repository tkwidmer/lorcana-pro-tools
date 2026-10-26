import { aggregateTurningPoints, turningPointSentences, MIN_GAMES, HISTOGRAM_ROUNDS } from '../../lib/turningPoints'
import { wilsonInterval } from '../../lib/practiceSim'

const pct = x => `${Math.round(x * 100)}%`
const SERIES = [
  { key: 'wins', label: 'Wins', bar: 'fill-emerald-400', swatch: 'bg-emerald-400' },
  { key: 'losses', label: 'Losses', bar: 'fill-red-300', swatch: 'bg-red-300' },
]

// Share of wins and of losses decided on each round, side by side.
function DecisiveHistogram({ decisive }) {
  const W = 480, H = 140, PAD = { top: 8, right: 8, bottom: 20, left: 28 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom
  const share = (s, i) => (s.n ? s.histogram[i] / s.n : 0)
  const rounds = Array.from({ length: HISTOGRAM_ROUNDS }, (_, i) => i)
  const max = Math.max(0.1, ...rounds.flatMap(i => SERIES.map(s => share(decisive[s.key], i))))
  const y = v => PAD.top + chartH - (v / max) * chartH
  const slot = chartW / HISTOGRAM_ROUNDS
  const barW = slot * 0.35
  const roundLabel = i => (i === HISTOGRAM_ROUNDS - 1 ? `${i + 1}+` : `${i + 1}`)

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Decisive round</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
        {[0, max / 2, max].map(v => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-gray-200" strokeWidth="0.5" />
            <text x={PAD.left - 4} y={y(v) + 3.5} textAnchor="end" fontSize="7" className="fill-gray-400">{pct(v)}</text>
          </g>
        ))}
        {SERIES.map((s, k) => rounds.map(i => {
          const { n, histogram } = decisive[s.key]
          const [lo, hi] = wilsonInterval(histogram[i], n)
          const top = y(share(decisive[s.key], i))
          return (
            <rect key={`${s.key}-${i}`} x={PAD.left + i * slot + slot * 0.15 + k * barW} y={top} width={barW} height={PAD.top + chartH - top} className={s.bar}>
              <title>{`${s.label} decided on round ${roundLabel(i)}: ${histogram[i]} of ${n} (${pct(share(decisive[s.key], i))}, 95% CI ${pct(lo)}–${pct(hi)})`}</title>
            </rect>
          )
        }))}
        {rounds.map(i => (
          <text key={i} x={PAD.left + (i + 0.5) * slot} y={H - 8} textAnchor="middle" fontSize="7" className="fill-gray-400">{roundLabel(i)}</text>
        ))}
        <text x={PAD.left + chartW / 2} y={H - 1} textAnchor="middle" fontSize="7" className="fill-gray-300">round</text>
      </svg>
      <div className="flex items-center gap-4 mt-1">
        {SERIES.map(s => (
          <span key={s.key} className="flex items-center gap-1 text-xs text-gray-500">
            <span className={`inline-block w-3 h-3 rounded-sm ${s.swatch}`} />{s.label} (n={decisive[s.key].n})
          </span>
        ))}
        <span className="text-xs text-gray-400 ml-auto">Bar height: share of that result's games. Hover for the 95% interval.</span>
      </div>
    </div>
  )
}

function CardList({ label, n, cards }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label} (n={n})</div>
      {cards.length === 0 ? <div className="text-xs text-gray-400">None</div> : (
        <table className="w-full text-sm">
          <tbody>
            {cards.slice(0, 10).map(c => (
              <tr key={c.name} className="border-b border-gray-100">
                <td className="py-1 pr-3 text-gray-800">{c.name}</td>
                <td className="py-1 text-right text-gray-600 tabular-nums">{c.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// games: enriched games (each with myPlayerNum), after the page's filters.
export function TurningPoints({ games }) {
  const summary = aggregateTurningPoints(games)
  if (summary.games < MIN_GAMES) {
    return <div className="text-sm text-gray-500">Import more games. Turning points need at least {MIN_GAMES} finished games in the current filters.</div>
  }
  const { wins, losses } = summary.decisiveCards

  return (
    <div className="space-y-8">
      <ul className="space-y-2 text-sm text-gray-800 list-disc pl-5">
        {turningPointSentences(summary).map(s => <li key={s}>{s}</li>)}
      </ul>
      <div className="border border-gray-100 rounded-lg p-4">
        <DecisiveHistogram decisive={summary.decisive} />
      </div>
      {wins.n + losses.n > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Cards you played on the decisive round</h3>
          <p className="text-xs text-gray-400 mb-3">Games in which you played each card on that round. A card that shows up far more in losses is worth a look.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <CardList label="Wins" n={wins.n} cards={wins.cards} />
            <CardList label="Losses" n={losses.n} cards={losses.cards} />
          </div>
        </div>
      )}
    </div>
  )
}
