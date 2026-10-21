import { useEffect, useState } from 'react'
import { VALID_INKS } from '../lib/inkColors'
import { fetchEventDetails, getTournamentStructure } from '../lib/tournamentApi'
import {
  listMyTables, createTable, updateTable, deleteTable, adjustTable, subscribeToTable,
  readSelectedTableId, storeSelectedTableId,
} from '../lib/streamTables'
import {
  MAX_GAME_WINS, rowToState, swapSidesPatch, rphClockPatch,
  startTimer, pauseTimer, resetTimer, timerRemainingMs, formatClock,
} from '../lib/streamOverlay'
import { InkIcon } from '../components/InkIcons'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input, Select } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'

// RPH's live channel doesn't broadcast reliably (see the ravensburger-tournament-api
// skill), so a linked clock is polled. The countdown stays exact between polls;
// only an organizer's start/pause/reset lags by up to this long.
const RPH_POLL_MS = 15000

// Only the columns another writer (the players' controller) changes are taken
// from broadcasts here; everything else on the panel is the owner's own typing,
// and adopting the echo of a keystroke would clobber the next one.
const SCORE_COLUMNS = ['p1_lore', 'p1_game_wins', 'p2_lore', 'p2_game_wins']

// Control panel for the gameplay stream overlay. Each of the owner's tables
// is a `stream_tables` row: edits here are column writes under RLS, the
// row's trigger broadcasts every change to the OBS view and the players'
// controller, and lore / game wins go through the same atomic increment the
// controller uses. Nothing needs this tab open except the RPH clock poll.
export function StreamOverlayPage() {
  const [tables, setTables] = useState(null)
  const [tableId, setTableId] = useState(readSelectedTableId)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [minutes, setMinutes] = useState(50)
  const [rphError, setRphError] = useState(false)

  const row = tables?.find(t => t.id === tableId) ?? tables?.[0] ?? null
  const patchLocal = (id, patch) => setTables(ts => ts.map(t => (t.id === id ? { ...t, ...patch } : t)))

  // No auto-create on first visit: an effect can run twice (StrictMode did,
  // and made two "Table 1"s), so the first table is an explicit click. The
  // cancelled flag keeps a superseded fetch from overwriting an edit made
  // before it resolved (StrictMode's second run did exactly that).
  useEffect(() => {
    let cancelled = false
    listMyTables().then(ts => { if (!cancelled) setTables(ts) }).catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (row) storeSelectedTableId(row.id)
  }, [row])

  const rowId = row?.id
  useEffect(() => {
    if (!rowId) return
    return subscribeToTable(rowId, payload => {
      patchLocal(rowId, Object.fromEntries(SCORE_COLUMNS.map(c => [c, payload[c]])))
    })
  }, [rowId])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  const rphEventId = row?.rph_event_id ?? null
  useEffect(() => {
    if (!rowId || !rphEventId) return
    let cancelled = false
    const poll = () => fetchEventDetails(rphEventId)
      .then(details => {
        if (cancelled) return
        const patch = rphClockPatch(getTournamentStructure(details))
        if (patch) {
          setTables(ts => ts.map(t => (t.id === rowId ? { ...t, ...patch } : t)))
          updateTable(rowId, patch).catch(e => setError(e.message))
        }
        setRphError(false)
      })
      .catch(() => { if (!cancelled) setRphError(true) })
    poll()
    const id = setInterval(poll, RPH_POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [rowId, rphEventId])

  // Optimistic local update, then the column write; a failed write surfaces.
  function write(id, patch) {
    patchLocal(id, patch)
    updateTable(id, patch).catch(e => setError(e.message))
  }
  const setField = (key, value) => write(row.id, { [key]: value })
  const setPlayer = (side, key, value) => write(row.id, { [`p${side}_${key}`]: value })
  const adjust = (side, field, delta) => adjustTable(row.id, row.controller_key, side, field, delta).catch(e => setError(e.message))

  async function addTable() {
    try {
      const t = await createTable(`Table ${tables.length + 1}`)
      setTables(ts => [...ts, t])
      setTableId(t.id)
    } catch (e) { setError(e.message) }
  }

  async function removeTable() {
    if (!window.confirm(`Delete "${row.name}"? Its OBS and controller links stop working.`)) return
    try {
      await deleteTable(row.id)
      setTables(ts => ts.filter(t => t.id !== row.id))
      setTableId(null)
    } catch (e) { setError(e.message) }
  }

  const links = row && {
    overlay: `${window.location.origin}/stream-overlay/view?table=${row.id}`,
    control: `${window.location.origin}/stream-overlay/control?table=${row.id}&key=${row.controller_key}`,
  }
  async function copyLink(which) {
    try {
      await navigator.clipboard.writeText(links[which])
      setCopied(which)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* clipboard unavailable — noop */ }
  }

  const state = row && rowToState(row)
  const running = state?.timerEndsAt !== null

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Stream Overlay"
        description="Run a gameplay stream overlay from here. Each table is one feature match: add its overlay link as one OBS Browser Source (1920×1080) with the gameplay cam and player cams behind it — the cam areas are transparent — and open its player controller link on a tablet at the table so the players keep their own lore and game score. Break shows the next pairing full-screen between matches; a side on 2 game wins is marked the winner."
        actions={row && (
          <>
            <Button onClick={() => copyLink('control')}>{copied === 'control' ? 'Link copied!' : 'Copy player controller link'}</Button>
            <Button variant="primary" onClick={() => copyLink('overlay')}>{copied === 'overlay' ? 'Link copied!' : 'Copy OBS overlay link'}</Button>
          </>
        )}
      />

      {error && <div className="mb-6 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      {tables && tables.length === 0 && (
        <Card className="p-5 mb-6">
          <p className="text-sm text-gray-500 mb-3">No tables yet. Each table is one feature match with its own OBS and controller links.</p>
          <Button variant="primary" onClick={addTable}>Create your first table</Button>
        </Card>
      )}

      {tables && tables.length > 0 && (
        <div className="mb-6 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Table</span>
            <Select value={row?.id ?? ''} onChange={e => setTableId(e.target.value)}>
              {tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </label>
          {row && (
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Name</span>
              <Input value={row.name} onChange={e => setField('name', e.target.value)} />
            </label>
          )}
          <Button size="sm" onClick={addTable}>New table</Button>
          {row && <Button size="sm" variant="danger" onClick={removeTable}>Delete table</Button>}
          {row && (
            <div className="ml-auto flex items-center gap-2" role="group" aria-label="Overlay mode">
              <Button size="sm" variant={row.mode === 'live' ? 'primary' : 'secondary'} aria-pressed={row.mode === 'live'} onClick={() => setField('mode', 'live')}>Live</Button>
              <Button size="sm" variant={row.mode === 'break' ? 'primary' : 'secondary'} aria-pressed={row.mode === 'break'} onClick={() => setField('mode', 'break')}>Break</Button>
            </div>
          )}
        </div>
      )}

      {row && (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Event" className="p-5 space-y-3">
          <Labeled label="Event name (shown when there's no logo)">
            <Input value={row.event_name} onChange={e => setField('event_name', e.target.value)} className="w-full" />
          </Labeled>
          <Labeled label="Event logo URL">
            <Input value={row.event_logo_url} onChange={e => setField('event_logo_url', e.target.value)} className="w-full" placeholder="https://…/logo.png" />
          </Labeled>
          <Labeled label="Sponsor logo URL">
            <Input value={row.sponsor_logo_url} onChange={e => setField('sponsor_logo_url', e.target.value)} className="w-full" placeholder="https://…/sponsor.png" />
          </Labeled>
          <Labeled label="Round">
            <Input value={row.round} onChange={e => setField('round', e.target.value)} className="w-full" placeholder="Round 3, Top 16, Finals…" />
          </Labeled>
          <p className="text-xs text-gray-500">
            To load a feature match, open the pairing in Tournament Lookup's Matches tab and click “Send to Stream Overlay”.
          </p>
        </Card>

        <Card title="Round timer" className="p-5">
          <div className="font-display text-6xl tabular-nums text-gray-900 mb-4">{formatClock(timerRemainingMs(state, now))}</div>
          {rphEventId ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className={`text-xs font-semibold uppercase tracking-widest ${rphError ? 'text-red-600' : 'text-emerald-600'}`}>
                {rphError ? 'RPH clock: last sync failed, retrying' : `Linked to RPH clock · event ${rphEventId}`}
              </span>
              <Button size="sm" onClick={() => setField('rph_event_id', null)}>Unlink</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {running
                ? <Button variant="primary" onClick={() => write(row.id, pauseTimer(state))}>Pause</Button>
                : <Button variant="primary" onClick={() => write(row.id, startTimer(state))}>Start</Button>}
              <Input
                type="number" min="0" value={minutes} onChange={e => setMinutes(Number(e.target.value))}
                className="w-20" aria-label="Timer minutes"
              />
              <Button onClick={() => write(row.id, resetTimer(minutes))}>Reset to {minutes} min</Button>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2 flex justify-end">
          <Button size="sm" onClick={() => write(row.id, swapSidesPatch(row))}>Swap sides</Button>
        </div>

        {state.players.map((player, i) => {
          const side = i + 1
          return (
          <Card key={side} title={`Player ${side} (${side === 1 ? 'left' : 'right'})`} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Name">
                <Input value={player.name} onChange={e => setPlayer(side, 'name', e.target.value)} className="w-full" />
              </Labeled>
              <Labeled label="Record">
                <Input value={player.record} onChange={e => setPlayer(side, 'record', e.target.value)} className="w-full" placeholder="5-0-2" />
              </Labeled>
            </div>

            <Labeled label="Deck inks">
              <div className="flex gap-2">
                {VALID_INKS.map(ink => {
                  const on = player.inks.includes(ink)
                  return (
                    <button
                      key={ink} type="button" title={ink} aria-pressed={on}
                      onClick={() => setPlayer(side, 'inks', on ? player.inks.filter(x => x !== ink) : [...player.inks, ink])}
                      className={`rounded border-2 p-1 transition-opacity ${on ? 'border-forge opacity-100' : 'border-transparent opacity-35 hover:opacity-70'}`}
                    >
                      <InkIcon color={ink} size={32} />
                    </button>
                  )
                })}
              </div>
            </Labeled>

            <div className="grid grid-cols-2 gap-3">
              <Counter label="Lore" value={player.lore} onChange={d => adjust(side, 'lore', d)} />
              <Counter label={`Game wins (of ${MAX_GAME_WINS})`} value={player.gameWins} onChange={d => adjust(side, 'game_wins', d)} />
            </div>
          </Card>
          )
        })}
      </div>
      )}

      {links && (
        <div className="mt-6 text-sm text-gray-500 space-y-1">
          <p>Overlay link: <code className="text-xs break-all">{links.overlay}</code></p>
          <p>Player controller link: <code className="text-xs break-all">{links.control}</code></p>
        </div>
      )}
    </div>
  )
}

function Labeled({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

function Counter({ label, value, onChange }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      <div className="flex items-stretch border border-gray-300 rounded overflow-hidden">
        <button type="button" onClick={() => onChange(-1)} className="w-14 py-3 text-2xl font-display hover:bg-gray-100" aria-label={`${label} minus one`}>−</button>
        <div className="flex-1 grid place-items-center font-display text-4xl tabular-nums text-gray-900">{value}</div>
        <button type="button" onClick={() => onChange(1)} className="w-14 py-3 text-2xl font-display hover:bg-gray-100" aria-label={`${label} plus one`}>+</button>
      </div>
    </div>
  )
}
