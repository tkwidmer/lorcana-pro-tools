import { compareVersions } from '../../lib/deckVersions'
import { InkIcons } from '../InkIcons'

const pct = x => `${Math.round(x * 100)}%`

const pts = x => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x * 1000) / 10)} pts`

function verdictText(cmp, a, b) {
  if (cmp.verdict === 'a-ahead') return `${a.label} is ahead with reasonable confidence.`
  if (cmp.verdict === 'b-ahead') return `${b.label} is ahead with reasonable confidence.`
  if (cmp.verdict === 'no-clear-difference') return 'No clear difference: the gap is within the noise.'
  const more = cmp.gamesNeeded - Math.min(a.wins + a.losses, b.wins + b.losses)
  return `Not enough games yet: about ${more} more per version needed to detect a 10-point difference.`
}

function Rate({ wins, losses }) {
  const n = wins + losses
  return n ? <>{pct(wins / n)} <span className="text-gray-500">({wins}–{losses})</span></> : <span className="text-gray-400">—</span>
}

// Two versions side by side: the win-rate difference with its 95% range, a
// plain verdict, and both records by opponent colors, so a version that met
// an easier field is easy to spot.
export function DeckVersionCompare({ a, b }) {
  const cmp = compareVersions(a, b)
  return (
    <div className="space-y-4">
      <div>
        <p className="text-2xl font-display tracking-wide text-gray-900">
          {cmp.diff == null ? '—' : `${a.label} ${pts(cmp.diff)} vs ${b.label}`}
        </p>
        {cmp.interval && (
          <p className="text-sm text-gray-500">95% range: {pts(cmp.interval[0])} to {pts(cmp.interval[1])}</p>
        )}
        <p className="mt-2 text-sm font-medium text-gray-800">{verdictText(cmp, a, b)}</p>
      </div>
      {cmp.byOppColors.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-4 font-semibold">Opponent</th>
                <th className="py-2 pr-4 font-semibold text-right">{a.label}</th>
                <th className="py-2 font-semibold text-right">{b.label}</th>
              </tr>
            </thead>
            <tbody>
              {cmp.byOppColors.map(r => (
                <tr key={r.oppColors} className="border-b border-gray-100">
                  <td className="py-1.5 pr-4">
                    {r.oppColors === 'unknown' ? <span className="text-gray-400">Unknown</span> : <InkIcons colors={r.oppColors.split('+')} size={18} />}
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums"><Rate {...r.a} /></td>
                  <td className="py-1.5 text-right tabular-nums"><Rate {...r.b} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
