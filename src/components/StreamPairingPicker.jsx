import { useEffect, useState } from 'react'
import { fetchAllStandings, fetchRoundMatches } from '../lib/tournamentApi'
import { currentRoundPairings, roundLabel } from '../lib/streamOverlay'
import { Button } from './ui/Button'
import { Input } from './ui/Field'

// The Stream Overlay panel's pairing picker: the linked event's current
// round, one row per table with both names and records, a Send per row.
// Loads the round's matches and standings when opened, so the list is as
// fresh as RPH. `onStream` is the pair of names already on the table.
export function StreamPairingPicker({ eventId, structure, onStream, onSend, onClose }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [sending, setSending] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchRoundMatches(eventId, structure.currentRoundId), fetchAllStandings(structure.currentRoundId)])
      .then(([matches, standings]) => { if (!cancelled) setRows(currentRoundPairings(matches, standings)) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [eventId, structure.currentRoundId])

  const q = query.trim().toLowerCase()
  const shown = rows?.filter(r => !q || String(r.table) === q || r.players.some(p => p.name.toLowerCase().includes(q)))
  const isOnStream = r => r.players.every(p => onStream.includes(p.name))

  async function send(row) {
    setSending(row.id)
    try { await onSend(row) } finally { setSending(null) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-xl border border-gray-200 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()} role="dialog" aria-label="Pairings">
        <div className="flex items-center gap-3 p-4 border-b border-gray-200 shrink-0">
          <h2 className="font-display text-base font-medium uppercase tracking-wide text-gray-900">{roundLabel(structure)} pairings</h2>
          <Input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter by name or table" className="ml-auto w-64" aria-label="Filter pairings" />
          <Button size="sm" variant="quiet" onClick={onClose}>Close</Button>
        </div>
        <div className="overflow-y-auto">
          {error && <p className="p-4 text-sm text-red-600">{error}</p>}
          {!error && !rows && <p className="p-4 text-sm text-gray-500">Loading pairings…</p>}
          {shown && shown.length === 0 && <p className="p-4 text-sm text-gray-500">No pairings{q ? ' match' : ' posted yet'}.</p>}
          {shown && shown.length > 0 && (
            <table className="w-full text-sm">
              <tbody>
                {shown.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 w-16 text-gray-500 tabular-nums">{r.table != null ? `T${r.table}` : ''}</td>
                    <td className="px-2 py-2 text-right text-gray-900">{r.players[0].name} <span className="text-gray-500 tabular-nums">{r.players[0].record}</span></td>
                    <td className="px-2 py-2 w-8 text-center text-gray-400">vs</td>
                    <td className="px-2 py-2 text-gray-900"><span className="text-gray-500 tabular-nums">{r.players[1].record}</span> {r.players[1].name}</td>
                    <td className="px-4 py-2 w-28 text-right">
                      <Button size="sm" className="whitespace-nowrap" variant={isOnStream(r) ? 'primary' : 'secondary'} disabled={sending !== null} onClick={() => send(r)}>
                        {sending === r.id ? 'Sending…' : isOnStream(r) ? 'On stream' : 'Send'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
