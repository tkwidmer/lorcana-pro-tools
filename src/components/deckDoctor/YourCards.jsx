import { Link } from 'react-router-dom'
import { fmtPp } from '../../lib/deckDoctor'
import { signColor } from '../../lib/statColors'

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)

function ImpactTable({ title, rows, liftByName }) {
  if (rows.length === 0) return null
  return (
    <div>
      <h3 className="font-display uppercase tracking-wide text-sm text-gray-900 mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="py-1 pr-3 font-semibold">Card</th>
              <th className="py-1 pr-3 font-semibold text-right">WAR</th>
              <th className="py-1 pr-3 font-semibold text-right">Win% with</th>
              <th className="py-1 pr-3 font-semibold text-right">Win% without</th>
              <th className="py-1 pr-3 font-semibold text-right">Games with</th>
              <th className="py-1 font-semibold text-right">Field lift</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const lift = liftByName.get(c.name)
              return (
                <tr key={c.name} className={`border-b border-gray-100 ${c.lowSample ? 'text-gray-400' : 'text-gray-900'}`}>
                  <td className="py-1 pr-3">{c.name}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{c.war.toFixed(1)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{pct(c.winRateWith)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{pct(c.winRateWithout)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{c.gamesWith}</td>
                  <td className={`py-1 text-right tabular-nums ${lift ? signColor(lift.lift) : 'text-gray-400'}`}>{lift ? fmtPp(lift.lift) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Section 4: your own wins above replacement (computeCardImpact, sorted by
// WAR desc) for this deck's imported gamelogs, with the field's lift beside
// any card duels.ink lists.
export function YourCards({ impact, lifts, hasGamelogs, nameOf }) {
  if (!hasGamelogs) {
    return (
      <p className="text-sm text-gray-600">
        Import this deck's gamelogs in <Link to="/analytics" className="underline">Analytics</Link> to see which of your cards win games.
      </p>
    )
  }
  const liftByName = new Map()
  for (const l of lifts) if (!liftByName.has(nameOf(l.cardId))) liftByName.set(nameOf(l.cardId), l)
  const top = impact.filter((c) => c.war != null && c.war > 0).slice(0, 5)
  const bottom = impact.filter((c) => c.war != null && c.war < 0).slice(-8).reverse()
  if (top.length === 0 && bottom.length === 0) {
    return <p className="text-sm text-gray-600">Not enough games with and without each card yet to compare.</p>
  }
  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-500">Greyed rows have fewer than 5 games with or without the card.</p>
      <ImpactTable title="Underperforming" rows={bottom} liftByName={liftByName} />
      <ImpactTable title="Pulling their weight" rows={top} liftByName={liftByName} />
    </div>
  )
}
