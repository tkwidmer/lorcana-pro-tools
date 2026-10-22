import { useEffect, useMemo, useState } from 'react'
import { useCards } from '../hooks/useCards'
import { buildCardIndex } from '../lib/cardAnalysis'
import { parseDeckList } from '../lib/parseDeckList'
import { matchDeckList } from '../lib/decklistShared'
import { VALID_INKS } from '../lib/inkColors'
import { fetchEventDetails, getTournamentStructure, extractEventId, fetchAllStandings, fetchAllRoundMatches } from '../lib/tournamentApi'
import { fetchPlayerTournamentHistory, fetchHeadToHead } from '../lib/tournamentHistoryApi'
import {
  listMyTables, createTable, updateTable, deleteTable, adjustTable, subscribeToTable, uploadLogo, resetLore,
  readSelectedTableId, storeSelectedTableId,
} from '../lib/streamTables'
import {
  MAX_GAME_WINS, DEFAULT_THEME, rowToState, swapSidesPatch, rphClockPatch,
  startTimer, pauseTimer, resetTimer, timerRemainingMs, formatClock, hotkeyAction, deckInks, clearTablePatch,
  roundLabel, timerFromRph, featureMatchPatch, buildPlayerCard, buildStandingsSnapshot, buildBracketSnapshot,
} from '../lib/streamOverlay'
import { InkIcon } from '../components/InkIcons'
import { StreamPairingPicker } from '../components/StreamPairingPicker'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input, Select, Textarea } from '../components/ui/Field'
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
  const [rphStructure, setRphStructure] = useState(null)
  const [eventUrl, setEventUrl] = useState('')
  const [picker, setPicker] = useState(false)
  const [sending, setSending] = useState(null)
  const { cards } = useCards()
  const cardIndex = useMemo(() => buildCardIndex(cards), [cards])

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

  // A linked event is polled for its clock and its structure (the round,
  // field size and current round id the pairing picker and the standings
  // and bracket sends work from).
  const rphEventId = row?.rph_event_id ?? null
  useEffect(() => {
    if (!rowId || !rphEventId) return
    let cancelled = false
    const poll = () => fetchEventDetails(rphEventId)
      .then(details => {
        if (cancelled) return
        const structure = getTournamentStructure(details)
        setRphStructure(structure)
        const patch = rphClockPatch(structure)
        if (patch) {
          setTables(ts => ts.map(t => (t.id === rowId ? { ...t, ...patch } : t)))
          updateTable(rowId, patch).catch(e => setError(e.message))
        }
        setRphError(false)
      })
      .catch(() => { if (!cancelled) setRphError(true) })
    poll()
    const id = setInterval(poll, RPH_POLL_MS)
    return () => { cancelled = true; clearInterval(id); setRphStructure(null) }
  }, [rowId, rphEventId])

  // Operator hotkeys (HOTKEYS in streamOverlay.js): scores go through the
  // same atomic RPC as the buttons and come back on the broadcast; the mode
  // flip is an optimistic column write like the Live / Break buttons.
  const controllerKey = row?.controller_key ?? null
  const mode = row?.mode ?? null
  const deckShown = row?.deck_shown ?? 0
  const cardShown = row?.card_shown ?? false
  const hasCard = Boolean(row?.player_card)
  useEffect(() => {
    if (!rowId) return
    const onKey = e => {
      const action = hotkeyAction(e)
      if (!action) return
      e.preventDefault()
      if (action.nextGame) {
        resetLore(rowId, controllerKey).catch(e => setError(e.message))
        return
      }
      if (action.toggleMode || action.toggleDeck || action.toggleCard) {
        if (action.toggleCard && !hasCard) return
        // The deck and the player card share the slot over the cam: showing
        // one hides the other.
        const patch = action.toggleMode
          ? { mode: mode === 'break' ? 'live' : 'break' }
          : action.toggleCard
            ? { card_shown: !cardShown, deck_shown: 0 }
            : { deck_shown: deckShown === action.toggleDeck ? 0 : action.toggleDeck, card_shown: false }
        setTables(ts => ts.map(t => (t.id === rowId ? { ...t, ...patch } : t)))
        updateTable(rowId, patch).catch(e => setError(e.message))
      } else {
        adjustTable(rowId, controllerKey, action.side, action.field, action.delta).catch(e => setError(e.message))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rowId, controllerKey, mode, deckShown, cardShown, hasCard])

  // Optimistic local update, then the column write; a failed write surfaces.
  function write(id, patch) {
    patchLocal(id, patch)
    updateTable(id, patch).catch(e => setError(e.message))
  }
  const setField = (key, value) => write(row.id, { [key]: value })
  const setPlayer = (side, key, value) => write(row.id, { [`p${side}_${key}`]: value })
  const adjust = (side, field, delta) => adjustTable(row.id, row.controller_key, side, field, delta).catch(e => setError(e.message))

  function linkEvent() {
    const id = extractEventId(eventUrl)
    if (!id) { setError('Paste a Play Hub event link, like https://tcg.ravensburgerplay.com/events/12345'); return }
    setError(null)
    setEventUrl('')
    write(row.id, { rph_event_id: Number(id) })
  }

  // A pairing from the picker: the feature-match patch, with the archive
  // player card when both histories and the head-to-head load (best-effort:
  // a failed archive call sends the pairing without a card).
  async function sendPairing(pairing) {
    const [a, b] = pairing.players
    const playerCard = await Promise.all([fetchPlayerTournamentHistory(a.id), fetchPlayerTournamentHistory(b.id), fetchHeadToHead(a.id, b.id)])
      .then(([historyA, historyB, headToHead]) => buildPlayerCard({ histories: [historyA, historyB], headToHead, playerIds: [String(a.id), String(b.id)] }))
      .catch(() => null)
    write(row.id, featureMatchPatch({
      eventName: rphStructure.eventName ?? '',
      round: roundLabel(rphStructure),
      players: pairing.players.map(p => ({ name: p.name, record: p.record })),
      timer: timerFromRph(rphStructure),
      rphEventId,
      playerCard,
    }))
    setPicker(false)
  }

  async function sendStandings() {
    setSending('standings')
    try {
      write(row.id, { standings: buildStandingsSnapshot(await fetchAllStandings(rphStructure.currentRoundId), rphStructure), break_panel: 'standings' })
    } catch (e) { setError(e.message) } finally { setSending(null) }
  }

  async function sendBracket() {
    setSending('bracket')
    try {
      const bracket = buildBracketSnapshot(await fetchAllRoundMatches(rphEventId, await fetchEventDetails(rphEventId)), rphStructure.eliminationPhaseName)
      if (bracket.rounds.length === 0) throw new Error('No top-cut matches posted yet.')
      write(row.id, { bracket, break_panel: 'bracket' })
    } catch (e) { setError(e.message) } finally { setSending(null) }
  }

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
          <Labeled label="RPH event (paste the Play Hub link; links the round clock, pairings, standings and bracket)">
            {rphEventId ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-gray-900">
                  {rphStructure
                    ? `${rphStructure.eventName} · ${roundLabel(rphStructure)}${rphStructure.isElimination ? '' : ` of ${rphStructure.totalSwissRounds}`} · ${rphStructure.startingPlayerCount ?? '?'} players`
                    : rphError ? `Event ${rphEventId}: last sync failed, retrying` : `Event ${rphEventId}…`}
                </span>
                <span className={`text-xs font-semibold uppercase tracking-widest ${rphError ? 'text-red-600' : 'text-emerald-600'}`}>Linked</span>
                <Button size="sm" className="ml-auto" onClick={() => setField('rph_event_id', null)}>Unlink</Button>
              </div>
            ) : (
              <form className="flex items-center gap-3" onSubmit={e => { e.preventDefault(); linkEvent() }}>
                <Input value={eventUrl} onChange={e => setEventUrl(e.target.value)} className="w-full" placeholder="https://tcg.ravensburgerplay.com/events/…" />
                <Button size="sm" variant="primary" onClick={linkEvent}>Link</Button>
              </form>
            )}
          </Labeled>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" disabled={!rphStructure?.currentRoundId} onClick={() => setPicker(true)}>Pick pairing…</Button>
            <Button size="sm" disabled={!rphStructure?.currentRoundId || sending !== null} onClick={sendStandings}>{sending === 'standings' ? 'Sending…' : 'Send standings'}</Button>
            <Button size="sm" disabled={!rphStructure?.eliminationPhaseName || sending !== null} onClick={sendBracket}>{sending === 'bracket' ? 'Sending…' : 'Send bracket'}</Button>
          </div>
          <Labeled label="Event name (shown when there's no logo)">
            <Input value={row.event_name} onChange={e => setField('event_name', e.target.value)} className="w-full" />
          </Labeled>
          <LogoField label="Event logo" value={row.event_logo_url} onChange={v => setField('event_logo_url', v)} onError={setError} />
          <LogoField label="Sponsor logo" value={row.sponsor_logo_url} onChange={v => setField('sponsor_logo_url', v)} onError={setError} />
          <Labeled label="Round">
            <Input value={row.round} onChange={e => setField('round', e.target.value)} className="w-full" placeholder="Round 3, Top 16, Finals…" />
          </Labeled>
          <Labeled label="Banner note (one line under the round, blank to hide)">
            <Input value={row.note} onChange={e => setField('note', e.target.value)} className="w-full" placeholder="Top 8 starts at 5pm · 128 players · #MandosBounty" />
          </Labeled>
          <div className="flex flex-wrap items-end gap-3">
            <Labeled label="Theme fill">
              <input type="color" value={row.theme_fill} onChange={e => setField('theme_fill', e.target.value)} className="h-9 w-14 cursor-pointer" />
            </Labeled>
            <Labeled label="Theme accent">
              <input type="color" value={row.theme_accent} onChange={e => setField('theme_accent', e.target.value)} className="h-9 w-14 cursor-pointer" />
            </Labeled>
            <Button size="sm" onClick={() => write(row.id, { theme_fill: DEFAULT_THEME.fill, theme_accent: DEFAULT_THEME.accent })}>Reset to InkbornForge</Button>
          </div>
        </Card>

        <Card title="Round timer" className="p-5">
          <div className="font-display text-6xl tabular-nums text-gray-900 mb-4">{formatClock(timerRemainingMs(state, now))}</div>
          {rphEventId ? (
            <span className={`text-xs font-semibold uppercase tracking-widest ${rphError ? 'text-red-600' : 'text-emerald-600'}`}>
              {rphError ? 'RPH clock: last sync failed, retrying' : 'Following the RPH round clock'}
            </span>
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

        <Card title="Break screen" description="What the break screen shows: the pairing (with the last result or the next match), or a standings or bracket snapshot from the linked event (Send standings / Send bracket in the Event card). Sending one switches to it; re-send after each round." className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            {[
              ['', 'Pairing', true, ''],
              ['standings', 'Standings', Boolean(row.standings), row.standings ? `after ${row.standings.round} · ${row.standings.players} players` : 'none sent'],
              ['bracket', 'Bracket', Boolean(row.bracket), row.bracket ? `${row.bracket.phase} · ${row.bracket.rounds.length} rounds` : 'none sent'],
            ].map(([value, label, available, sub]) => (
              <Button key={value} size="sm" variant={row.break_panel === value ? 'primary' : 'secondary'} aria-pressed={row.break_panel === value} disabled={!available} onClick={() => setField('break_panel', value)}>
                {label}{sub && <span className="normal-case tracking-normal font-sans opacity-70">· {sub}</span>}
              </Button>
            ))}
          </div>
        </Card>

        <Card title="Player card" description="Both players' majors history and head-to-head from the Tournament History archive, laid over the gameplay cam between games. Comes with a pairing picked from the linked event." className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-gray-600">
              {row.player_card
                ? `${state.players[0].name || 'Left'}: ${row.player_card.players[0].eventsPlayed} majors, ${row.player_card.players[0].topCutCount} top cuts, ${row.player_card.players[0].dayTwoCount} Day 2s · ${state.players[1].name || 'Right'}: ${row.player_card.players[1].eventsPlayed} majors, ${row.player_card.players[1].topCutCount} top cuts, ${row.player_card.players[1].dayTwoCount} Day 2s · head-to-head ${row.player_card.headToHead.wins[0]}-${row.player_card.headToHead.wins[1]}`
                : 'No player card for this pairing yet. It comes with a pairing picked from the linked event.'}
            </span>
            <Button size="sm" variant={row.card_shown ? 'primary' : 'secondary'} aria-pressed={row.card_shown} disabled={!row.player_card} onClick={() => write(row.id, { card_shown: !row.card_shown, deck_shown: 0 })}>
              {row.card_shown ? 'Hide from stream' : 'Show on stream'}
            </Button>
          </div>
        </Card>

        <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            Hotkeys: left player <Kbd>Q</Kbd>/<Kbd>A</Kbd> lore, <Kbd>W</Kbd>/<Kbd>S</Kbd> game wins · right player <Kbd>I</Kbd>/<Kbd>K</Kbd> lore, <Kbd>O</Kbd>/<Kbd>L</Kbd> game wins · <Kbd>B</Kbd> Live / Break · <Kbd>1</Kbd>/<Kbd>2</Kbd> show that player's deck · <Kbd>3</Kbd> player card · <Kbd>N</Kbd> next game (lore to 0). Click outside any field first.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => resetLore(row.id, row.controller_key).catch(e => setError(e.message))}>Next game: lore to 0</Button>
            <Button size="sm" onClick={() => write(row.id, swapSidesPatch(row))}>Swap sides</Button>
            <Button size="sm" variant="danger" onClick={() => { if (window.confirm('Clear both players, the round, the note, the decklists and the player card? The event name, logos, theme and timer stay.')) write(row.id, clearTablePatch()) }}>Clear table</Button>
          </div>
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

            <DecklistField
              text={player.decklist} cardIndex={cardIndex} shown={row.deck_shown === side}
              onChange={text => {
                const inks = deckInks(matchDeckList(text, cardIndex))
                write(row.id, { [`p${side}_decklist`]: text, ...(inks.length ? { [`p${side}_inks`]: inks } : {}) })
              }}
              onToggleShow={() => write(row.id, { deck_shown: row.deck_shown === side ? 0 : side, card_shown: false })}
            />

            <div className="grid grid-cols-2 gap-3">
              <Counter label="Lore" value={player.lore} onChange={d => adjust(side, 'lore', d)} />
              <Counter label={`Game wins (of ${MAX_GAME_WINS})`} value={player.gameWins} onChange={d => adjust(side, 'game_wins', d)} />
            </div>
          </Card>
          )
        })}
      </div>
      )}

      {picker && row && rphStructure && (
        <StreamPairingPicker eventId={rphEventId} structure={rphStructure} onStream={[row.p1_name, row.p2_name]} onSend={sendPairing} onClose={() => setPicker(false)} />
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

// A logo column: paste a URL, or upload a file (uploadLogo) and the public
// URL lands in the same field. The current logo previews beside the input.
function LogoField({ label, value, onChange, onError }) {
  const [busy, setBusy] = useState(false)
  const upload = async e => {
    const file = e.target.files[0]
    if (!file) return
    setBusy(true)
    try { onChange(await uploadLogo(file)) } catch (err) { onError(err.message) } finally { setBusy(false); e.target.value = '' }
  }
  return (
    <Labeled label={`${label} (URL, or upload a PNG up to 2 MB)`}>
      <div className="flex items-center gap-3">
        <Input value={value} onChange={e => onChange(e.target.value)} className="w-full" placeholder="https://…/logo.png" />
        <input type="file" accept="image/*" onChange={upload} disabled={busy} className="text-xs text-gray-600 file:mr-2 file:rounded file:border file:border-gray-900 file:bg-transparent file:px-3 file:py-1.5 file:font-display file:uppercase file:tracking-wider file:text-xs file:text-gray-900 disabled:opacity-40" />
        {value && <img src={value} alt="" className="h-9 w-16 object-contain bg-gray-900 rounded shrink-0" />}
      </div>
      {busy && <span className="mt-1 block text-xs text-gray-500">Uploading…</span>}
    </Labeled>
  )
}

// A side's decklist: pasted "4 Card Name" lines, matched against the card
// database to report what matched and to set that side's inks on paste.
// "Show on stream" lays the deck over the gameplay cam on the live overlay.
function DecklistField({ text, cardIndex, shown, onChange, onToggleShow }) {
  const lines = parseDeckList(text)
  const matched = matchDeckList(text, cardIndex)
  const unmatched = lines.length - matched.length
  const copies = matched.reduce((s, e) => s + e.count, 0)
  return (
    <Labeled label="Decklist (paste “4 Card Name” lines; sets the inks)">
      <Textarea value={text} onChange={e => onChange(e.target.value)} rows={4} className="w-full font-mono text-xs" placeholder={'4 Elsa - Spirit of Winter\n3 Let It Go\n…'} />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-gray-500">
          {text.trim() ? `${copies} cards matched${unmatched ? ` · ${unmatched} line${unmatched === 1 ? '' : 's'} not recognised` : ''}` : 'No decklist'}
        </span>
        <Button size="sm" variant={shown ? 'primary' : 'secondary'} aria-pressed={shown} disabled={!matched.length} onClick={onToggleShow}>
          {shown ? 'Hide from stream' : 'Show on stream'}
        </Button>
      </div>
    </Labeled>
  )
}

function Kbd({ children }) {
  return <kbd className="rounded border border-gray-300 bg-gray-50 px-1 font-mono text-[11px] text-gray-700">{children}</kbd>
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
