import { fmtPp } from '../../lib/deckDoctor'
import { signColor } from '../../lib/statColors'

const ROW_TONE = { 'missing-positive': 'bg-forge-soft', 'present-negative': 'bg-red-50' }

// One lift list (an archetype's cardLift or a colour pair's pairCardLift)
// against your list: the cards that lift you're missing and the cards that
// sink you're running are tinted.
export function LiftChecklist({ title, rows, nameOf }) {
  if (rows.length === 0) return null
  return (
    <div>
      <h3 className="font-display uppercase tracking-wide text-sm text-gray-900 mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="py-1 pr-3 font-semibold">Card</th>
              <th className="py-1 pr-3 font-semibold text-right">Lift</th>
              <th className="py-1 pr-3 font-semibold text-right">In lists</th>
              <th className="py-1 font-semibold text-right">In your list</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cardId} className={`border-b border-gray-100 ${ROW_TONE[r.flag] ?? ''}`}>
                <td className="py-1 pr-3 text-gray-900">{nameOf(r.cardId)}</td>
                <td className={`py-1 pr-3 text-right tabular-nums ${signColor(r.lift)}`}>{fmtPp(r.lift)}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-gray-600">{r.presence != null ? `${Math.round(r.presence * 100)}%` : '—'}</td>
                <td className="py-1 text-right tabular-nums text-gray-900">{r.mine > 0 ? `✓ ×${r.mine}` : '✗'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
