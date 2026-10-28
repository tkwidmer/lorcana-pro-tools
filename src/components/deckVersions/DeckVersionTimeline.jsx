import { LOW_SAMPLE_GAMES } from '../../lib/deckVersions'

const pct = x => `${Math.round(x * 100)}%`
const day = iso => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const span = ({ from, to }) => (day(from) === day(to) ? day(from) : `${day(from)} – ${day(to)}`)

function Changes({ changes }) {
  if (!changes) return <span className="text-gray-400">First list</span>
  const parts = [
    ...changes.toAdd.map(c => <span key={`+${c.name}`} className="text-green-700">+{c.count} {c.name}</span>),
    ...changes.toRemove.map(c => <span key={`-${c.name}`} className="text-red-700">−{c.count} {c.name}</span>),
  ]
  return <span className="flex flex-wrap gap-x-3 gap-y-0.5">{parts}</span>
}

// One row per version from buildDeckVersions(): label, date spans, record with
// a 95% range, and the card changes from the previous version. Versions with
// few games are faded rather than hidden, so the history stays complete.
export function DeckVersionTimeline({ versions }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-4 font-semibold">Version</th>
            <th className="py-2 pr-4 font-semibold">Played</th>
            <th className="py-2 pr-4 font-semibold text-right">Record</th>
            <th className="py-2 pr-4 font-semibold text-right">Win rate (95% range)</th>
            <th className="py-2 font-semibold min-w-64">Changes from previous</th>
          </tr>
        </thead>
        <tbody>
          {versions.map(v => (
            <tr key={v.label} className={`border-b border-gray-100 align-top ${v.wins + v.losses < LOW_SAMPLE_GAMES ? 'opacity-50' : ''}`}>
              <td className="py-2 pr-4 font-semibold text-gray-900">{v.label}</td>
              <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{v.spans.map(s => <div key={s.from}>{span(s)}</div>)}</td>
              <td className="py-2 pr-4 text-right tabular-nums whitespace-nowrap">{v.wins}–{v.losses}</td>
              <td className="py-2 pr-4 text-right tabular-nums whitespace-nowrap">
                {v.winRate == null ? '—' : <>{pct(v.winRate)} <span className="text-gray-500">({pct(v.interval[0])}–{pct(v.interval[1])})</span></>}
              </td>
              <td className="py-2 text-gray-700"><Changes changes={v.changes} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
