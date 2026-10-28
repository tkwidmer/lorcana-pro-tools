import { InkIcons } from '../InkIcons'
import { Badge } from '../ui/Badge'
import { MIN_MATCHUP_GAMES } from '../../lib/deckDoctor'
import { winrateTextColor, deltaColor } from '../../lib/statColors'

const fmt = (x) => (x == null ? '—' : `${Math.round(x)}%`)

// Section 5: your record with this deck against each opponent colour pair,
// beside the field's rate for your archetype (or colour pair) in the same
// matchup. A gap is marked only when the 95% interval excludes zero.
export function MatchupsVsField({ rows, fieldLabel }) {
  if (rows.length === 0) return <p className="text-sm text-gray-600">No ranked games with this deck yet.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
            <th className="py-1 pr-3 font-semibold">Opponent</th>
            <th className="py-1 pr-3 font-semibold text-right">Games</th>
            <th className="py-1 pr-3 font-semibold text-right">Record</th>
            <th className="py-1 pr-3 font-semibold text-right">Your win rate</th>
            <th className="py-1 pr-3 font-semibold text-right">{fieldLabel}</th>
            <th className="py-1 font-semibold text-right">Gap</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.oppKey} className={`border-b border-gray-100 ${r.belowMin ? 'opacity-50' : ''}`}>
              <td className="py-1 pr-3"><InkIcons colors={r.oppColors} size={18} /></td>
              <td className="py-1 pr-3 text-right tabular-nums text-gray-900">{r.games}</td>
              <td className="py-1 pr-3 text-right tabular-nums text-gray-900">{r.wins}-{r.losses}</td>
              <td className={`py-1 pr-3 text-right tabular-nums ${winrateTextColor(r.shrunkWinRate)}`}>{fmt(r.shrunkWinRate)}</td>
              <td className="py-1 pr-3 text-right tabular-nums text-gray-600">{fmt(r.fieldWinRate)}</td>
              <td className={`py-1 text-right tabular-nums ${deltaColor(r.gap)}`}>
                {r.gap == null ? '—' : `${r.gap > 0 ? '+' : ''}${r.gap.toFixed(1)} pp`}
                {r.significant && <Badge className="ml-2">beyond noise</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500 mt-2">
        Your win rate is shrunk toward the field's (10-game prior). Matchups with fewer than {MIN_MATCHUP_GAMES} games are faded.
      </p>
    </div>
  )
}
