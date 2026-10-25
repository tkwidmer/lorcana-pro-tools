import { useEffect, useMemo, useState } from 'react'
import { fetchStats } from '../lib/duelsApi'
import { useCards } from '../hooks/useCards'
import { buildCardIndex } from '../lib/cardAnalysis'
import { splitDeckLists, classifyField } from '../lib/fieldBreakdown'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Select, Textarea } from '../components/ui/Field'
import { InkIcons } from '../components/InkIcons'

const QUEUES = [
  { id: 'core-bo1', name: 'Core BO1' }, { id: 'core-bo3', name: 'Core BO3' },
  { id: 'infinity-bo1', name: 'Infinity BO1' }, { id: 'infinity-bo3', name: 'Infinity BO3' },
]
const STORAGE_KEY = 'lorcana_field_breakdown'

function readStored() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {} } catch { return {} }
}

export function FieldBreakdownPage() {
  const [stored] = useState(readStored)
  const [queue, setQueue] = useState(stored.queue ?? 'core-bo1')
  const [text, setText] = useState(stored.text ?? '')
  const [statsState, setStatsState] = useState({ queue: null, data: null, error: null })
  const { cards } = useCards()

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ queue, text }))
  }, [queue, text])

  useEffect(() => {
    let cancelled = false
    fetchStats({ queue, period: 'all_time' })
      .then((data) => { if (!cancelled) setStatsState({ queue, data, error: null }) })
      .catch((err) => { if (!cancelled) setStatsState({ queue, data: null, error: err.message }) })
    return () => { cancelled = true }
  }, [queue])
  const stats = statsState.queue === queue ? statsState.data : null
  const statsError = statsState.queue === queue ? statsState.error : null

  const cardIndex = useMemo(() => buildCardIndex(cards ?? []), [cards])
  const lists = useMemo(() => splitDeckLists(text), [text])
  const result = useMemo(
    () => (stats && cards?.length && lists.length ? classifyField(lists, cards, cardIndex, stats) : null),
    [stats, cards, cardIndex, lists],
  )
  const total = result?.decks.length ?? 0

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Field Breakdown"
        description="Paste every decklist in the room, one blank line between lists, and see the field by archetype."
      />

      <Card className="p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <label className="text-sm text-gray-600">
            <span className="block mb-1">Field queue</span>
            <Select value={queue} onChange={(e) => setQueue(e.target.value)}>
              {QUEUES.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </Select>
          </label>
          <div className="text-sm text-gray-500">
            {statsError ? <span className="text-red-700">Field data failed to load: {statsError}</span>
              : stats ? `${stats.profiles?.length ?? 0} archetype builds from duels.ink` : 'Loading field data…'}
          </div>
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          className="w-full font-mono text-sm"
          placeholder={'4 Card Name\n4 Card Name\n\n4 Card Name\n…'}
        />
        <div className="mt-2 text-sm text-gray-500">{lists.length} list{lists.length === 1 ? '' : 's'}</div>
      </Card>

      {result && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="The field" description={`${total} deck${total === 1 ? '' : 's'}`} className="p-4">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="py-1">Archetype</th><th className="py-1">Inks</th><th className="py-1 text-right">Decks</th><th className="py-1 text-right">Share</th></tr>
              </thead>
              <tbody>
                {result.field.map((row) => (
                  <tr key={row.archetype} className="border-t border-gray-200">
                    <td className="py-1.5">{row.archetype}</td>
                    <td className="py-1.5"><InkIcons colors={row.colors} /></td>
                    <td className="py-1.5 text-right tabular-nums">{row.count}</td>
                    <td className="py-1.5 text-right tabular-nums">{Math.round((row.count / total) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Each list" description="Overlap is the share of cards shared with the archetype's average build." className="p-4">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="py-1">#</th><th className="py-1">Inks</th><th className="py-1">Archetype</th><th className="py-1 text-right">Overlap</th></tr>
              </thead>
              <tbody>
                {result.decks.map((d) => (
                  <tr key={d.index} className="border-t border-gray-200 align-top">
                    <td className="py-1.5 tabular-nums text-gray-500">{d.index}</td>
                    <td className="py-1.5"><InkIcons colors={d.colors} /></td>
                    <td className="py-1.5">
                      {d.archetype ?? <span className="text-gray-500">Unassigned</span>}
                      {d.runnerUp && <div className="text-xs text-gray-500">next: {d.runnerUp.name} {Math.round(d.runnerUp.overlap * 100)}%</div>}
                      {d.cards !== 60 && <div className="text-xs text-amber-700">{d.cards} cards</div>}
                      {d.unmatched.length > 0 && <div className="text-xs text-red-700">Unmatched: {d.unmatched.join(', ')}</div>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{d.overlap === null ? '—' : `${Math.round(d.overlap * 100)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  )
}
