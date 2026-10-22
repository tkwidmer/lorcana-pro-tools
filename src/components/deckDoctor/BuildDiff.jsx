import { fmtPp } from '../../lib/deckDoctor'
import { signColor } from '../../lib/statColors'

// Section 2's three-column diff of your list against the field's average
// build. `lifts` (liftChecklist rows) add a lift pill and the field's
// presence where duels.ink publishes them.
export function BuildDiff({ diff, lifts, nameOf }) {
  const liftById = new Map(lifts.map((l) => [l.cardId, l]))
  const columns = [
    { title: 'Only in your list', rows: diff.onlyMine, detail: (r) => `×${r.mine}` },
    { title: 'Count differs', rows: diff.countDiffs, detail: (r) => `you ${r.mine} · field ${r.field}` },
    {
      title: "Only in the field's build",
      rows: diff.onlyField,
      detail: (r) => {
        const p = liftById.get(r.cardId)?.presence
        return `×${r.field}${p != null ? ` · in ${Math.round(p * 100)}% of lists` : ''}`
      },
    },
  ]
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {columns.map((col) => (
        <div key={col.title}>
          <h3 className="font-display uppercase tracking-wide text-sm text-gray-900 mb-2">{col.title}</h3>
          {col.rows.length === 0 && <p className="text-sm text-gray-400">Nothing here.</p>}
          <ul className="space-y-1">
            {col.rows.map((r) => {
              const lift = liftById.get(r.cardId)
              return (
                <li key={r.cardId} className="text-sm flex flex-wrap items-baseline gap-x-2">
                  <span className="text-gray-900">{nameOf(r.cardId)}</span>
                  <span className="text-gray-500">{col.detail(r)}</span>
                  {lift && <span className={`text-xs ${signColor(lift.lift)}`}>{fmtPp(lift.lift)}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
