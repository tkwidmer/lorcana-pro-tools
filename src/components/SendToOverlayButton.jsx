import { useEffect, useState } from 'react'
import { listMyTables, createTable, updateTable, readSelectedTableId, storeSelectedTableId } from '../lib/streamTables'
import { Button } from './ui/Button'
import { Select } from './ui/Field'

// "Send … to Stream Overlay" for a snapshot (standings, bracket): writes
// `buildPatch()` to one of the operator's tables without leaving the page.
// With one table it sends straight there (creating "Table 1" on a first
// use); with several, a picker sits beside the button, preselected to the
// table the panel last showed.
export function SendToOverlayButton({ label, buildPatch }) {
  const [tables, setTables] = useState(null)
  const [tableId, setTableId] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    listMyTables()
      .then(ts => { if (cancelled) return; setTables(ts); setTableId(ts.find(t => t.id === readSelectedTableId())?.id ?? ts[0]?.id ?? '') })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  async function send() {
    try {
      setError(null)
      let target = tableId
      if (!target) {
        const t = await createTable('Table 1')
        setTables([t])
        setTableId(t.id)
        target = t.id
      }
      await updateTable(target, buildPatch())
      storeSelectedTableId(target)
      setSent(true)
      setTimeout(() => setSent(false), 2500)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tables && tables.length > 1 && (
        <Select value={tableId} onChange={e => setTableId(e.target.value)} aria-label="Stream table" className="text-xs py-1">
          {tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      )}
      <Button size="sm" onClick={send} disabled={!tables}>{sent ? 'Sent to Stream Overlay' : label}</Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
