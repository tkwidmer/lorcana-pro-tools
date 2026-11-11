import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchEraStats } from '../lib/duelsApi'
import { STOCK_DECK_FOLDERS } from '../lib/stockDecks'
import { cardMetaRows, cardPairLift } from '../lib/cardMetaStats'
import { cardKey } from '../lib/cardIdResolver'
import { fmtPp } from '../lib/deckDoctor'
import { signColor } from '../lib/statColors'
import { Tabs, Tab } from './ui/Tabs'
import { InkIcons } from './InkIcons'

const pct = v => (v == null ? '—' : `${Math.round(v)}%`)
const share = v => (v == null ? '—' : `${v.toFixed(1)}%`)

// The card's standing in each current duels.ink meta (one tab per Stock Decks
// folder): the named archetypes whose average build runs it, with copies,
// presence, win rate with it and lift; then its colour-pair lift rows.
export function CardMetaSection({ printings }) {
  const [folder, setFolder] = useState(STOCK_DECK_FOLDERS[0])
  const [result, setResult] = useState({})
  const ids = useMemo(() => printings.map(cardKey), [printings])

  useEffect(() => {
    let mounted = true
    fetchEraStats({ queue: folder.queue, era: folder.era }).then(
      stats => mounted && setResult({ folderId: folder.id, stats }),
      err => mounted && setResult({ folderId: folder.id, error: err.message }),
    )
    return () => { mounted = false }
  }, [folder])

  const current = result.folderId === folder.id ? result : {}
  const rows = current.stats ? cardMetaRows(current.stats, ids) : []
  const pairs = current.stats ? cardPairLift(current.stats, ids) : []

  return (
    <section>
      <h2 className="font-display uppercase tracking-wide text-sm text-gray-500 mb-2">In the duels.ink meta</h2>
      <Tabs className="mb-3">
        {STOCK_DECK_FOLDERS.map(f => <Tab key={f.id} active={f.id === folder.id} onClick={() => setFolder(f)}>{f.title.split(' · ')[1]}</Tab>)}
      </Tabs>
      {current.error && <p className="text-sm text-red-700">{current.error}</p>}
      {!current.stats && !current.error && <p className="text-sm text-gray-500">Loading…</p>}
      {current.stats && rows.length === 0 && (
        <p className="text-sm text-gray-500">No named archetype's average build runs this card in {folder.title}.</p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="py-1 pr-3 font-semibold">Archetype</th>
                <th className="py-1 pr-3 font-semibold text-right">Copies</th>
                <th className="py-1 pr-3 font-semibold text-right">In lists</th>
                <th className="py-1 pr-3 font-semibold text-right">Win rate with</th>
                <th className="py-1 pr-3 font-semibold text-right">Lift</th>
                <th className="py-1 pr-3 font-semibold text-right">Meta share</th>
                <th className="py-1 font-semibold text-right">Games</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} className="border-b border-gray-100">
                  <td className="py-1 pr-3">
                    <Link to={`/stock-decks?folder=${folder.id}`} className="inline-flex items-center gap-1.5 text-gray-900 hover:underline">
                      <InkIcons colors={r.colors} size={14} />{r.name}
                    </Link>
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">{r.copies || '—'}</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-gray-600">{r.presence == null ? '—' : pct(r.presence * 100)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{r.winRateWith == null ? '—' : `${r.winRateWith.toFixed(1)}%`}</td>
                  <td className={`py-1 pr-3 text-right tabular-nums ${r.lift == null ? 'text-gray-400' : signColor(r.lift)}`}>{r.lift == null ? '—' : fmtPp(r.lift)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-gray-600">{share(r.metaShare)}</td>
                  <td className="py-1 text-right tabular-nums text-gray-600">{r.gamesPlayed.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <p className="text-xs text-gray-500 mt-2">
          duels.ink lists lift only for each archetype's ten highest-lift cards; "—" means this card is not among them.
        </p>
      )}
      {pairs.length > 0 && (
        <p className="text-xs text-gray-500 mt-2">
          Colour-pair lift: {pairs.map(p => `${p.pair} ${fmtPp(p.lift)}`).join(' · ')}
        </p>
      )}
    </section>
  )
}
