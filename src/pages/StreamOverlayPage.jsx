import { useEffect, useMemo, useRef, useState } from 'react'
import { useCards } from '../hooks/useCards'
import { buildCardIndex } from '../lib/cardAnalysis'
import { parseDeckList } from '../lib/parseDeckList'
import { VALID_INKS } from '../lib/inkColors'
import { fetchEventDetails, getTournamentStructure, extractEventId, fetchAllStandings, fetchAllRoundMatches, fetchRoundMatches } from '../lib/tournamentApi'
import { fetchPlayerTournamentHistory, fetchHeadToHead } from '../lib/tournamentHistoryApi'
import {
  listMyTables, createTable, updateTable, updateWhileLinked, deleteTable, adjustTable, subscribeToTable, uploadLogo, resetLore,
  readSelectedTableId, storeSelectedTableId,
} from '../lib/streamTables'
import {
  MAX_GAME_WINS, DEFAULT_THEME, rowToState, swapSidesPatch, rphClockPatch,
  startTimer, pauseTimer, resetTimer, timerRemainingMs, formatClock, hotkeyAction, deckInks, clearTablePatch,
  activeRoundLabel, timerFromRph, featureMatchPatch, buildPlayerCard, buildStandingsSnapshot, buildBracketSnapshot, buildResultsSnapshot, metaSlices,
  featuredPhase, CLEAR_FEATURED_PATCH, FEATURED_SECONDS,
} from '../lib/streamOverlay'
import { BUCKET_ORDER, buildBuckets, matchDeckList } from '../lib/decklistShared'
import { InkIcon } from '../components/InkIcons'
import { StreamPairingPicker } from '../components/StreamPairingPicker'
import cardeFieldExport from '../../scripts/carde-field-export.js?raw'
import { readDecklistsPdf } from '../lib/cardePdf'
import { splitDeckLists, inkPairLines } from '../lib/fieldBreakdown'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input, Select, Textarea } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'

// RPH's live channel doesn't broadcast reliably (see the ravensburger-tournament-api
// skill), so a linked clock is polled. The countdown stays exact between polls;
// only an organizer's start/pause/reset lags by up to this long.
const RPH_POLL_MS = 15000
// The carde.io export as a bookmarklet: the script with its comment lines
// dropped, wrapped so the click evaluates to nothing and the page stays put.
const FILE_INPUT = 'text-xs text-gray-600 file:mr-2 file:rounded file:border file:border-gray-900 file:bg-transparent file:px-3 file:py-1.5 file:font-display file:uppercase file:tracking-wider file:text-xs file:text-gray-900 disabled:opacity-40'
const CARDE_BOOKMARKLET = `javascript:${encodeURIComponent(`void ${cardeFieldExport.replace(/^\s*\/\/.*$/gm, '')}`)}`

// Only the columns another writer (the players' controller) changes are taken
// from broadcasts here; everything else on the panel is the owner's own typing,
// and adopting the echo of a keystroke would clobber the next one.
const SCORE_COLUMNS = ['p1_lore', 'p1_game_wins', 'p2_lore', 'p2_game_wins']
// What the panel adopts from the row's broadcasts: the scores (the controller
// writes them) and the RPH link, so a second panel follows a link made or
// cleared elsewhere instead of polling the old event. Everything else is the
// owner's own typing, and adopting the echo of a keystroke would clobber it.
const ADOPTED_COLUMNS = [...SCORE_COLUMNS, 'rph_event_id']

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
      patchLocal(rowId, Object.fromEntries(ADOPTED_COLUMNS.map(c => [c, payload[c]])))
    })
  }, [rowId])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  // A linked event is polled for its clock, its structure (the round,
  // field size and current round id the pairing picker and the standings
  // and bracket sends work from) and the active round's results, which go
  // on the row for the caster notes whenever they change.
  const rphEventId = row?.rph_event_id ?? null
  const lastResults = useRef(null)
  useEffect(() => {
    if (!rowId || !rphEventId) return
    let cancelled = false
    const poll = () => fetchEventDetails(rphEventId)
      .then(async details => {
        if (cancelled) return
        const structure = getTournamentStructure(details)
        setRphStructure(structure)
        const patch = rphClockPatch(structure) ?? {}
        // A failed matches fetch leaves the results as they were; the clock still lands.
        const matches = structure.activeRoundId ? await fetchRoundMatches(rphEventId, structure.activeRoundId).catch(() => null) : null
        if (cancelled) return
        if (matches) {
          const results = buildResultsSnapshot(matches, structure)
          const key = JSON.stringify(results)
          if (key !== lastResults.current) { lastResults.current = key; patch.results = results }
        }
        if (Object.keys(patch).length > 0) {
          setTables(ts => ts.map(t => (t.id === rowId ? { ...t, ...patch } : t)))
          updateWhileLinked(rowId, rphEventId, patch).catch(e => setError(e.message))
        }
        setRphError(false)
      })
      .catch(() => { if (!cancelled) setRphError(true) })
    poll()
    // The tick comes from a worker, not setInterval: a background tab's
    // timers are throttled to about once a minute, which left the overlay
    // on 00:00 for up to a minute after the organizer started the next
    // round's clock, until the operator switched back to this tab.
    const ticker = new Worker(URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${RPH_POLL_MS})`], { type: 'text/javascript' })))
    ticker.onmessage = poll
    return () => { cancelled = true; ticker.terminate(); setRphStructure(null); lastResults.current = null }
  }, [rowId, rphEventId])

  // Operator hotkeys (HOTKEYS in streamOverlay.js): scores go through the
  // same atomic RPC as the buttons and come back on the broadcast; the mode
  // flip is an optimistic column write like the Live / Break buttons.
  const controllerKey = row?.controller_key ?? null
  const mode = row?.mode ?? null
  const deckShown = row?.deck_shown ?? 0
  const cardShown = row?.card_shown ?? false
  const hasCard = Boolean(row?.player_card)
  const metaShown = row?.meta_shown ?? false
  const hasMeta = Boolean(row && metaSlices(row.meta_text, row.meta_players))
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
      if (action.clearFeatured) {
        setTables(ts => ts.map(t => (t.id === rowId ? { ...t, ...CLEAR_FEATURED_PATCH } : t)))
        updateTable(rowId, CLEAR_FEATURED_PATCH).catch(e => setError(e.message))
        return
      }
      if (action.toggleMode || action.toggleDeck || action.toggleCard || action.toggleMeta) {
        if (action.toggleCard && !hasCard) return
        if (action.toggleMeta && !hasMeta) return
        // The deck, the player card and the metagame share the slot over the
        // cam: showing one hides the others.
        const patch = action.toggleMode
          ? { mode: mode === 'break' ? 'live' : 'break' }
          : action.toggleCard
            ? { card_shown: !cardShown, deck_shown: 0, meta_shown: false }
            : action.toggleMeta
              ? { meta_shown: !metaShown, card_shown: false, deck_shown: 0 }
              : { deck_shown: deckShown === action.toggleDeck ? 0 : action.toggleDeck, card_shown: false, meta_shown: false }
        setTables(ts => ts.map(t => (t.id === rowId ? { ...t, ...patch } : t)))
        updateTable(rowId, patch).catch(e => setError(e.message))
      } else {
        adjustTable(rowId, controllerKey, action.side, action.field, action.delta).catch(e => setError(e.message))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rowId, controllerKey, mode, deckShown, cardShown, hasCard, metaShown, hasMeta])

  // Optimistic local update, then the column write; a failed write surfaces.
  function write(id, patch) {
    patchLocal(id, patch)
    updateTable(id, patch).catch(e => setError(e.message))
  }
  const setField = (key, value) => write(row.id, { [key]: value })
  const [pdfBusy, setPdfBusy] = useState(false)
  async function importDecklistsPdf(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setPdfBusy(true)
    try {
      setField('meta_text', inkPairLines(splitDeckLists(await readDecklistsPdf(file)), cardIndex).join('\n'))
    } catch (err) { setError(err.message) } finally { setPdfBusy(false) }
  }
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
      // The operator's own event name wins; RPH's only fills a blank one.
      eventName: row.event_name || (rphStructure.eventName ?? ''),
      round: activeRoundLabel(rphStructure),
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
    notes: `${window.location.origin}/stream-overlay/notes?table=${row.id}`,
  }
  async function copyText(text, which) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* clipboard unavailable — noop */ }
  }
  const copyLink = which => copyText(links[which], which)

  const state = row && rowToState(row)
  const running = state?.timerEndsAt !== null

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Stream Overlay"
        description="Run a gameplay stream overlay from here. Each table is one feature match: add its overlay link as one OBS Browser Source (1920×1080) with the gameplay cam and player cams behind it — the cam areas are transparent — and open its player controller link on a tablet at the table so the players keep their own lore and game score. Break shows the next pairing full-screen between matches; a side on 2 game wins is marked the winner."
        actions={row && (
          <>
            <Button onClick={() => copyLink('notes')}>{copied === 'notes' ? 'Link copied!' : 'Copy caster notes link'}</Button>
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
                    ? `${rphStructure.eventName} · ${rphStructure.activeRoundId ? activeRoundLabel(rphStructure) : 'Not started'}${rphStructure.activePhaseType === 'SWISS' ? ` of ${rphStructure.totalSwissRounds}` : ''} · ${rphStructure.startingPlayerCount ?? '?'} players`
                    : rphError ? `Event ${rphEventId}: last sync failed, retrying` : `Event ${rphEventId}…`}
                </span>
                <span className={`text-xs font-semibold uppercase tracking-widest ${rphError ? 'text-red-600' : 'text-emerald-600'}`}>Linked</span>
                <Button size="sm" className="ml-auto" onClick={() => write(row.id, { rph_event_id: null, results: null })}>Unlink</Button>
              </div>
            ) : (
              <form className="flex items-center gap-3" onSubmit={e => { e.preventDefault(); linkEvent() }}>
                <Input value={eventUrl} onChange={e => setEventUrl(e.target.value)} className="w-full" placeholder="https://tcg.ravensburgerplay.com/events/…" />
                <Button size="sm" variant="primary" onClick={linkEvent}>Link</Button>
              </form>
            )}
          </Labeled>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" disabled={!rphStructure?.activeRoundId} onClick={() => setPicker(true)}>Pick pairing…</Button>
            <Button size="sm" disabled={!rphStructure?.currentRoundId || sending !== null} onClick={sendStandings}>{sending === 'standings' ? 'Sending…' : 'Send standings'}</Button>
            <Button size="sm" disabled={!rphStructure?.eliminationPhaseName || sending !== null} onClick={sendBracket}>{sending === 'bracket' ? 'Sending…' : 'Send bracket'}</Button>
          </div>
          <Labeled label="Event name (shown when there's no logo)">
            <Input value={row.event_name} onChange={e => setField('event_name', e.target.value)} className="w-full" />
          </Labeled>
          <LogoField label="Event logo" value={row.event_logo_url} onChange={v => setField('event_logo_url', v)} onError={setError} />
          <LogoField label="Sponsor logo" value={row.sponsor_logo_url} onChange={v => setField('sponsor_logo_url', v)} onError={setError} />
          <LogoField label="Second sponsor logo" value={row.sponsor2_logo_url} onChange={v => setField('sponsor2_logo_url', v)} onError={setError} />
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
          <Labeled label="Lore display">
            <div className="flex items-center gap-2" role="group" aria-label="Lore display">
              <Button size="sm" variant={row.lore_track ? 'secondary' : 'primary'} aria-pressed={!row.lore_track} onClick={() => setField('lore_track', false)}>Counter</Button>
              <Button size="sm" variant={row.lore_track ? 'primary' : 'secondary'} aria-pressed={row.lore_track} onClick={() => setField('lore_track', true)}>Track</Button>
            </div>
          </Labeled>
          <Labeled label="Featured cards">
            <div className="flex items-center gap-2" role="group" aria-label="Featured cards">
              {[['off', 'Off'], ['fade', `${FEATURED_SECONDS} seconds`], ['stay', 'Stay']].map(([value, label]) => (
                <Button key={value} size="sm" variant={row.featured_cards === value ? 'primary' : 'secondary'} aria-pressed={row.featured_cards === value} onClick={() => setField('featured_cards', value)}>{label}</Button>
              ))}
            </div>
          </Labeled>
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

        <Card title="Break screen" description="What the break screen shows: the pairing (with the last result or the next match), a standings or bracket snapshot from the linked event (Send standings / Send bracket in the Event card), or the metagame chart. Sending a snapshot switches to it; re-send after each round." className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            {[
              ['', 'Pairing', true, ''],
              ['standings', 'Standings', Boolean(row.standings), row.standings ? `after ${row.standings.round} · ${row.standings.players} players` : 'none sent'],
              ['bracket', 'Bracket', Boolean(row.bracket), row.bracket ? `${row.bracket.phase} · ${row.bracket.rounds.length} rounds` : 'none sent'],
              ['meta', 'Metagame', hasMeta, hasMeta ? `${metaSlices(row.meta_text, row.meta_players).slices.length} ink pairs` : 'nothing typed'],
            ].map(([value, label, available, sub]) => (
              <Button key={value} size="sm" variant={row.break_panel === value ? 'primary' : 'secondary'} aria-pressed={row.break_panel === value} disabled={!available} onClick={() => setField('break_panel', value)}>
                {label}{sub && <span className="normal-case tracking-normal font-sans opacity-70">· {sub}</span>}
              </Button>
            ))}
          </div>
        </Card>

        <Card title="Player card" description="Both players' majors, finishes and head-to-head from the Tournament History archive, laid over the gameplay cam between games. Comes with a pairing picked from the linked event." className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-gray-600">
              {row.player_card
                ? `${state.players[0].name || 'Left'}: ${row.player_card.players[0].majorsPlayed} majors, ${row.player_card.players[0].topCutCount} top cuts, ${row.player_card.players[0].dayTwoCount} Day 2s · ${state.players[1].name || 'Right'}: ${row.player_card.players[1].majorsPlayed} majors, ${row.player_card.players[1].topCutCount} top cuts, ${row.player_card.players[1].dayTwoCount} Day 2s · head-to-head ${row.player_card.headToHead.wins[0]}-${row.player_card.headToHead.wins[1]}`
                : 'No player card for this pairing yet. It comes with a pairing picked from the linked event.'}
            </span>
            <Button size="sm" variant={row.card_shown ? 'primary' : 'secondary'} aria-pressed={row.card_shown} disabled={!row.player_card} onClick={() => write(row.id, { card_shown: !row.card_shown, deck_shown: 0, meta_shown: false })}>
              {row.card_shown ? 'Hide from stream' : 'Show on stream'}
            </Button>
          </div>
        </Card>

        <Card title="Metagame" description={'The room\'s decks, one line per archetype or ink pair with a deck count ("Emerald/Steel Midrange 7", "Amber/Sapphire 5") or a share ("… 28%"); lines are grouped into ink pairs. Shown as bars over the gameplay cam or on the break screen; in a room over 50 players, pairs under 5% fold into Other.'} className="p-5 lg:col-span-2">
          <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            <div className="font-display uppercase tracking-wider text-xs text-gray-500">Fetch the room from carde.io</div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span>In the carde.io admin, download the event's decklists PDF and drop it here:</span>
              <input type="file" accept="application/pdf" onChange={importDecklistsPdf} disabled={pdfBusy} aria-label="Decklists PDF" className={FILE_INPUT} />
              {pdfBusy && <span className="text-xs text-gray-500">Reading…</span>}
            </div>
            <p className="mt-1 text-xs text-gray-500">Each deck's two most-played inks make the lines below; the PDF is read in your browser and the player names in it are never kept. Or use the bookmarklet:</p>
            <ol className="mt-1 list-decimal pl-5 space-y-1">
              <li>
                Drag this to your bookmarks bar once:{' '}
                <a href={CARDE_BOOKMARKLET} onClick={e => e.preventDefault()} className="font-semibold text-forge-ink underline decoration-dotted" title="Drag me to the bookmarks bar">Export carde.io decks</a>
                <span className="text-gray-500"> (or </span>
                <button type="button" className="underline text-gray-700" onClick={() => copyText(CARDE_BOOKMARKLET, 'bookmarklet')}>{copied === 'bookmarklet' ? 'copied' : 'copy it'}</button>
                <span className="text-gray-500"> and paste it as a bookmark's URL).</span>
              </li>
              <li>Open the event in the carde.io admin, with the event id in the URL, and click the bookmark. If it says it's waiting, click anything in the admin page.</li>
              <li>It copies one line per ink pair, like <code className="font-mono text-xs">Emerald/Steel 8</code>. Paste them below. Re-run it after the decklist deadline to catch late submissions.</li>
            </ol>
            <p className="mt-1 text-xs text-gray-500">Both run in your own browser with your organizer login; nothing is sent to InkbornForge. Hand-collected lists work too: Field Breakdown's "Copy for Stream Overlay" gives the same lines.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_200px]">
            <Textarea value={row.meta_text} onChange={e => setField('meta_text', e.target.value)} rows={6} className="w-full font-mono text-xs" placeholder={'Emerald/Steel Midrange 7\nAmber/Sapphire Detectives 5\nAmber/Amethyst Midrange 4\n…'} />
            <div className="flex flex-col gap-3">
              <Labeled label="Players (blank: the counts' total)">
                <Input type="number" min="0" value={row.meta_players ?? ''} placeholder={rphStructure?.startingPlayerCount ?? ''} onChange={e => setField('meta_players', e.target.value === '' ? null : Number(e.target.value))} className="w-full" />
              </Labeled>
              <Button size="sm" variant={row.meta_shown ? 'primary' : 'secondary'} aria-pressed={row.meta_shown} disabled={!hasMeta} onClick={() => write(row.id, { meta_shown: !row.meta_shown, card_shown: false, deck_shown: 0 })}>
                {row.meta_shown ? 'Hide from stream' : 'Show on stream'}
              </Button>
              <Button size="sm" variant={row.break_panel === 'meta' ? 'primary' : 'secondary'} aria-pressed={row.break_panel === 'meta'} disabled={!hasMeta} onClick={() => setField('break_panel', row.break_panel === 'meta' ? '' : 'meta')}>
                {row.break_panel === 'meta' ? 'On the break screen' : 'Put on break screen'}
              </Button>
            </div>
          </div>
        </Card>

        <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            Hotkeys: left player <Kbd>Q</Kbd>/<Kbd>A</Kbd> lore, <Kbd>W</Kbd>/<Kbd>S</Kbd> game wins · right player <Kbd>I</Kbd>/<Kbd>K</Kbd> lore, <Kbd>O</Kbd>/<Kbd>L</Kbd> game wins · <Kbd>B</Kbd> Live / Break · <Kbd>1</Kbd>/<Kbd>2</Kbd> show that player's deck · <Kbd>3</Kbd> player card · <Kbd>4</Kbd> metagame · <Kbd>N</Kbd> next game (lore to 0) · <Kbd>X</Kbd> takes the featured cards off. Click outside any field first.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => resetLore(row.id, row.controller_key).catch(e => setError(e.message))}>Next game: lore to 0</Button>
            <Button size="sm" onClick={() => write(row.id, swapSidesPatch(row))}>Swap sides</Button>
            <Button size="sm" variant="danger" onClick={() => { if (window.confirm('Clear both players, their decklists and the player card? The event, logos, theme, timer, linked event, round and note stay.')) write(row.id, clearTablePatch()) }}>Clear table</Button>
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
              onToggleShow={() => write(row.id, { deck_shown: row.deck_shown === side ? 0 : side, card_shown: false, meta_shown: false })}
            />

            {row.featured_cards !== 'off' && (
              <FeaturedPicker
                player={player} cardIndex={cardIndex}
                onStream={featuredPhase(row.featured_cards, player.featured, player.featuredAt, now) !== 'hidden'}
                onPick={name => write(row.id, { [`p${side}_featured`]: name, [`p${side}_featured_at`]: name ? new Date().toISOString() : null })}
              />
            )}

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
          <p>Caster notes link: <code className="text-xs break-all">{links.notes}</code></p>
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
        <input type="file" accept="image/*" onChange={upload} disabled={busy} className={FILE_INPUT} />
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

// A side's matched deck as small tiles, characters first then by cost.
// Clicking a tile puts that card on stream in the player's side column, or
// shows it again after it faded; clicking the card that's on stream takes it
// off. `onStream` says whether the featured card is showing right now.
function FeaturedPicker({ player, cardIndex, onStream, onPick }) {
  const buckets = buildBuckets(matchDeckList(player.decklist, cardIndex))
  const entries = BUCKET_ORDER.flatMap(type => buckets[type])
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Featured card</span>
        {entries.length > 0 && <span className="text-xs text-gray-500">Click to show beside {player.name || 'this player'} · click again to hide · <Kbd>X</Kbd> hides both</span>}
      </div>
      {entries.length === 0
        ? <p className="text-xs text-gray-500">Paste a decklist to feature its cards.</p>
        : (
          <div className="flex flex-wrap gap-1.5">
            {entries.map(({ key, name, card }) => {
              const showing = onStream && name === player.featured
              return (
                <button
                  key={key} type="button" title={name} aria-pressed={showing}
                  onClick={() => onPick(showing ? '' : name)}
                  className={`w-14 rounded border-[3px] ${showing ? 'border-forge' : 'border-transparent hover:border-gray-300'}`}
                >
                  <img src={card.images.thumbnail} alt={name} className="block w-full rounded-sm" loading="lazy" />
                </button>
              )
            })}
          </div>
        )}
    </div>
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
