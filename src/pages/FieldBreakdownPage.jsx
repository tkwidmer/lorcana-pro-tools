import { useEffect, useMemo, useState } from 'react'
import { useCards } from '../hooks/useCards'
import { buildCardIndex } from '../lib/cardAnalysis'
import { splitDeckLists, inkPairField } from '../lib/fieldBreakdown'
import { readDecklistsPdf } from '../lib/cardePdf'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Textarea } from '../components/ui/Field'
import { InkIcons } from '../components/InkIcons'

const STORAGE_KEY = 'lorcana_field_breakdown'

function readStored() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY))?.text ?? '' } catch { return '' }
}

export function FieldBreakdownPage() {
  const [text, setText] = useState(readStored)
  const { cards } = useCards()

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ text }))
  }, [text])

  const cardIndex = useMemo(() => buildCardIndex(cards ?? []), [cards])
  const lists = useMemo(() => splitDeckLists(text), [text])
  const result = useMemo(() => (cards?.length && lists.length ? inkPairField(lists, cardIndex) : null), [cards, cardIndex, lists])

  const [copied, setCopied] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  async function importPdf(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    try { setText(await readDecklistsPdf(file)); setPdfError(null) } catch (err) { setPdfError(err.message) }
  }
  async function copyForOverlay() {
    try {
      await navigator.clipboard.writeText(result.field.map((r) => `${r.pair} ${r.count}`).join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Field Breakdown"
        description="Paste every decklist in the room, one blank line between lists, or upload carde.io's decklists PDF, and see the field by ink pair."
      />

      <Card className="p-4 mb-6">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          className="w-full font-mono text-sm"
          placeholder={'4 Card Name\n4 Card Name\n\n4 Card Name\n…'}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
          <span className="flex items-center gap-3">
            {lists.length} list{lists.length === 1 ? '' : 's'}
            <Button size="sm" disabled={!result} onClick={copyForOverlay}>{copied ? 'Copied' : 'Copy for Stream Overlay'}</Button>
            <span className="text-xs">One line per ink pair with its deck count, the Stream Overlay Metagame card's input.</span>
          </span>
          <label className="flex items-center gap-2">
            <span>Or the carde.io decklists PDF (replaces the text):</span>
            <input type="file" accept="application/pdf" onChange={importPdf} className="text-xs text-gray-600 file:mr-2 file:rounded file:border file:border-gray-900 file:bg-transparent file:px-3 file:py-1.5 file:font-display file:uppercase file:tracking-wider file:text-xs file:text-gray-900" />
          </label>
          {pdfError && <span className="text-red-700">{pdfError}</span>}
        </div>
      </Card>

      {result && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Ink pairs" description={`${lists.length} deck${lists.length === 1 ? '' : 's'} by their two most-played inks`} className="p-4">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="py-1">Ink pair</th><th className="py-1">Inks</th><th className="py-1 text-right">Decks</th><th className="py-1 text-right">Share</th></tr>
              </thead>
              <tbody>
                {result.field.map((row) => (
                  <tr key={row.pair} className="border-t border-gray-200">
                    <td className="py-1.5">{row.pair}</td>
                    <td className="py-1.5"><InkIcons colors={row.colors} /></td>
                    <td className="py-1.5 text-right tabular-nums">{row.count}</td>
                    <td className="py-1.5 text-right tabular-nums">{Math.round((row.count / lists.length) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Each list" description="A card name that didn't match the card database is listed so the list can be fixed." className="p-4">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="py-1">#</th><th className="py-1">Inks</th><th className="py-1 text-right">Cards</th></tr>
              </thead>
              <tbody>
                {result.decks.map((d) => (
                  <tr key={d.index} className="border-t border-gray-200 align-top">
                    <td className="py-1.5 tabular-nums text-gray-500">{d.index}</td>
                    <td className="py-1.5">
                      <InkIcons colors={d.colors} />
                      {d.unmatched.length > 0 && <div className="text-xs text-red-700">Unmatched: {d.unmatched.join(', ')}</div>}
                    </td>
                    <td className={`py-1.5 text-right tabular-nums${d.cards !== 60 ? ' text-amber-700' : ''}`}>{d.cards}</td>
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
