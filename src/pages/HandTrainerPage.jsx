import { useState, useEffect, useMemo } from 'react'
import { getAllGamelogs } from '../lib/gamelogHistory'
import { buildHandReadingPoints, scoreCardGuess } from '../lib/handReading'
import { useCards } from '../hooks/useCards'

function pct(x) { return x == null ? '—' : `${Math.round(x * 100)}%` }

// Pick the most instructive card to estimate odds for: the one the engine is
// least sure about (probability closest to 50%).
function focusCard(point) {
  const cands = point.inference.filter(e => e.unseen > 0)
  if (!cands.length) return null
  return [...cands].sort((a, b) =>
    Math.abs(a.probAtLeastOne - 0.5) - Math.abs(b.probAtLeastOne - 0.5) ||
    b.expectedInHand - a.expectedInHand
  )[0]
}

function ScoreBadge({ label, value, good }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${good ? 'text-emerald-600' : 'text-gray-800'}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  )
}

export function HandTrainerPage() {
  const { cards } = useCards()
  const [gamelogs, setGamelogs] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [viewerNum, setViewerNum] = useState(null)
  const [mode, setMode] = useState('cards') // 'cards' | 'odds'
  const [pointIdx, setPointIdx] = useState(0)
  const [guesses, setGuesses] = useState(new Set())
  const [estimate, setEstimate] = useState(50)
  const [revealed, setRevealed] = useState(false)
  const [session, setSession] = useState([]) // [{ mode, ... }]

  const resetInteraction = () => { setGuesses(new Set()); setEstimate(50); setRevealed(false) }

  useEffect(() => {
    getAllGamelogs().then(all => {
      const usable = all.filter(g => Array.isArray(g._rawLogs) && g._rawLogs.length > 0 && g.myPlayerNum != null)
      setGamelogs(usable)
      if (usable.length && !selectedId) {
        setSelectedId(usable[0].id)
        setViewerNum(usable[0].myPlayerNum)
      }
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const record = useMemo(() => gamelogs.find(g => g.id === selectedId) ?? null, [gamelogs, selectedId])

  // cardId -> name, from card data (setCode-number) plus names seen in this log
  const cardNameById = useMemo(() => {
    const m = new Map()
    for (const c of cards) if (c.setCode != null && c.number != null) m.set(`${c.setCode}-${c.number}`, c.fullName ?? c.name)
    return m
  }, [cards])

  const inferredDeck = useMemo(() => {
    if (!record?.oppDecklist?.length) return null
    const logName = new Map()
    for (const e of (record._rawLogs ?? [])) {
      const d = e.data ?? {}
      if (d.cardId && d.cardName) logName.set(d.cardId, d.cardName)
    }
    return record.oppDecklist.map(({ cardId, count }) => ({
      name: cardNameById.get(cardId) ?? logName.get(cardId) ?? cardId,
      estimatedCopies: count,
    }))
  }, [record, cardNameById])

  const { points, oppNum } = useMemo(() => {
    if (!record || viewerNum == null) return { points: [], oppNum: null }
    return buildHandReadingPoints(record, viewerNum, inferredDeck)
  }, [record, viewerNum, inferredDeck])

  const point = points[pointIdx] ?? null
  const focus = useMemo(() => (mode === 'odds' && point ? focusCard(point) : null), [mode, point])

  function changeGame(id) {
    const g = gamelogs.find(x => x.id === id)
    setSelectedId(id)
    setViewerNum(g?.myPlayerNum ?? 1)
    setPointIdx(0)
    setSession([])
    resetInteraction()
  }

  function changeMode(m) { setMode(m); resetInteraction() }
  function flipViewer() { setViewerNum(v => (v === 1 ? 2 : 1)); setPointIdx(0); setSession([]); resetInteraction() }

  function toggleGuess(name) {
    if (revealed) return
    setGuesses(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function reveal() {
    if (!point || revealed) return
    setRevealed(true)
    if (mode === 'cards') {
      const sc = scoreCardGuess(guesses, point)
      setSession(s => [...s, { mode, turn: point.turn, you: sc.you, engine: sc.engine }])
    } else if (focus) {
      const inHand = point.actualNames.has(focus.name)
      const youBrier = Math.pow((estimate / 100) - (inHand ? 1 : 0), 2)
      const engBrier = Math.pow(focus.probAtLeastOne - (inHand ? 1 : 0), 2)
      setSession(s => [...s, { mode, turn: point.turn, youBrier, engBrier, inHand }])
    }
  }

  function step(delta) {
    setPointIdx(i => Math.max(0, Math.min(points.length - 1, i + delta)))
    resetInteraction()
  }

  // ---- Render ----

  if (!gamelogs.length) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <Header />
        <div className="text-center py-12 text-gray-400 text-sm">
          No usable games yet. Import games from <a href="/match-history" className="text-blue-500 hover:underline">Match History</a> (they store the full log needed to reveal the opponent's hand).
        </div>
      </div>
    )
  }

  const oppName = record ? (oppNum === 1 ? record.p1Name : record.p2Name) : ''
  const candidates = point ? point.inference.filter(e => e.unseen > 0) : []
  // Hide engine ordering before reveal so it doesn't give away the answer.
  const displayCandidates = revealed
    ? [...candidates].sort((a, b) => b.probAtLeastOne - a.probAtLeastOne)
    : [...candidates].sort((a, b) => a.name.localeCompare(b.name))

  const cardsSessions = session.filter(s => s.mode === 'cards')
  const oddsSessions = session.filter(s => s.mode === 'odds')

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <Header />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={selectedId ?? ''}
          onChange={e => changeGame(e.target.value)}
          className="text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400 max-w-xs"
        >
          {gamelogs.map(g => {
            const opp = g.myPlayerNum === 1 ? g.p2Name : g.p1Name
            return <option key={g.id} value={g.id}>vs {opp} · {g.turnCount}T · {new Date(g.playedAt ?? g.savedAt).toLocaleDateString()}</option>
          })}
        </select>

        <div className="inline-flex rounded border border-gray-200 overflow-hidden">
          <button onClick={() => changeMode('cards')} className={`text-xs px-3 py-1.5 ${mode === 'cards' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Which cards</button>
          <button onClick={() => changeMode('odds')} className={`text-xs px-3 py-1.5 ${mode === 'odds' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Estimate odds</button>
        </div>

        {record && (
          <button
            onClick={flipViewer}
            className="text-xs px-2.5 py-1.5 rounded border border-gray-200 text-gray-600 hover:border-gray-400"
            title="Switch which seat you're reading from"
          >Reading: {oppName || `P${oppNum}`}'s hand ⇄</button>
        )}
        {!inferredDeck && record && (
          <span className="text-[11px] text-amber-600">No decklist for this game — using cards seen in-game (engine less precise)</span>
        )}
      </div>

      {!point ? (
        <div className="text-center py-12 text-gray-400 text-sm">No readable turns in this game.</div>
      ) : (
        <>
          {/* Point header + nav */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => step(-1)} disabled={pointIdx === 0} className="text-sm text-gray-500 disabled:opacity-30 hover:text-gray-900">← Prev</button>
            <div className="text-center">
              <div className="text-sm font-bold text-gray-900">Your turn · round {point.turn}</div>
              <div className="text-xs text-gray-400">read {pointIdx + 1} of {points.length}</div>
            </div>
            <button onClick={() => step(1)} disabled={pointIdx === points.length - 1} className="text-sm text-gray-500 disabled:opacity-30 hover:text-gray-900">Next →</button>
          </div>

          {/* Public state */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 text-center">
            <Stat label="Their hand" value={point.handSize} />
            <Stat label="Their deck" value={point.deckSize} />
            <Stat label="Their inkwell" value={point.inkwell} />
            <Stat label="Lore (you–them)" value={`${point.yourLore}–${point.oppLore}`} />
          </div>

          {/* What you've seen */}
          <div className="mb-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Seen so far (played · inked · discarded)</h3>
            {point.observed.length === 0 ? (
              <p className="text-sm text-gray-400">Nothing revealed yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {point.observed.map(o => (
                  <span key={o.name} className="text-xs bg-gray-100 text-gray-700 rounded px-2 py-0.5">
                    {o.name}{(o.plays + o.inked + o.discarded) > 1 ? ` ×${o.plays + o.inked + o.discarded}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>

          {mode === 'cards' ? (
            <CardsMode
              displayCandidates={displayCandidates}
              guesses={guesses}
              toggleGuess={toggleGuess}
              revealed={revealed}
              point={point}
            />
          ) : (
            <OddsMode focus={focus} estimate={estimate} setEstimate={setEstimate} revealed={revealed} point={point} />
          )}

          <div className="mt-6 flex items-center gap-3">
            {!revealed ? (
              <button onClick={reveal} className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-700 transition-colors">Reveal hand</button>
            ) : (
              <button onClick={() => step(1)} disabled={pointIdx === points.length - 1} className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-700 transition-colors disabled:opacity-40">Next read →</button>
            )}
            {revealed && (
              <span className="text-sm text-gray-500">
                Actual hand: <span className="text-gray-800 font-medium">{point.actualHand.map(c => c.count > 1 ? `${c.name} ×${c.count}` : c.name).join(', ') || '(empty)'}</span>
              </span>
            )}
          </div>

          {/* Session score */}
          {session.length > 0 && (
            <div className="mt-8 pt-5 border-t border-gray-100">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">This session ({session.length} reads)</h3>
              {cardsSessions.length > 0 && (() => {
                const agg = (key) => {
                  const tp = cardsSessions.reduce((a, s) => a + s[key].tp, 0)
                  const fp = cardsSessions.reduce((a, s) => a + s[key].fp, 0)
                  const fn = cardsSessions.reduce((a, s) => a + s[key].fn, 0)
                  return { tp, fp, fn, prec: tp + fp > 0 ? tp / (tp + fp) : null, rec: tp + fn > 0 ? tp / (tp + fn) : null }
                }
                const you = agg('you')
                const eng = agg('engine')
                return (
                  <div className="space-y-2">
                    <div className="grid grid-cols-6 gap-2 text-[10px] uppercase tracking-wide text-gray-400">
                      <span></span><span className="text-center">Correct</span><span className="text-center">Wrong</span><span className="text-center">Missed</span><span className="text-center">Precision</span><span className="text-center">Recall</span>
                    </div>
                    <div className="grid grid-cols-6 gap-2 items-center text-sm">
                      <span className="font-semibold text-gray-700">You</span>
                      <span className="text-center font-bold text-emerald-600">{you.tp}</span>
                      <span className="text-center text-red-400">{you.fp}</span>
                      <span className="text-center text-gray-500">{you.fn}</span>
                      <span className="text-center font-semibold">{pct(you.prec)}</span>
                      <span className="text-center font-semibold">{pct(you.rec)}</span>
                    </div>
                    <div className="grid grid-cols-6 gap-2 items-center text-sm">
                      <span className="font-semibold text-gray-500">Engine</span>
                      <span className="text-center font-bold text-gray-600">{eng.tp}</span>
                      <span className="text-center text-gray-400">{eng.fp}</span>
                      <span className="text-center text-gray-400">{eng.fn}</span>
                      <span className="text-center text-gray-500">{pct(eng.prec)}</span>
                      <span className="text-center text-gray-500">{pct(eng.rec)}</span>
                    </div>
                  </div>
                )
              })()}
              {oddsSessions.length > 0 && (() => {
                const youAvg = oddsSessions.reduce((a, s) => a + s.youBrier, 0) / oddsSessions.length
                const engAvg = oddsSessions.reduce((a, s) => a + s.engBrier, 0) / oddsSessions.length
                return (
                  <div className="flex gap-8">
                    <ScoreBadge label="Your Brier (lower=better)" value={youAvg.toFixed(3)} good={youAvg <= engAvg} />
                    <ScoreBadge label="Engine Brier" value={engAvg.toFixed(3)} good={engAvg < youAvg} />
                  </div>
                )
              })()}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Header() {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">Hand-Reading Trainer</h1>
      <p className="text-sm text-gray-500">
        Practice reading your opponent's hand. At each of your turns, predict what they're holding — then reveal the actual hand and see how the hypergeometric engine reasons.
      </p>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="border border-gray-100 rounded-lg py-2">
      <div className="text-lg font-bold text-gray-900">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  )
}

function CardsMode({ displayCandidates, guesses, toggleGuess, revealed, point }) {
  if (!displayCandidates.length) {
    return <p className="text-sm text-gray-400">No unseen cards to read here.</p>
  }
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
        {revealed ? 'Results — green = in their hand' : 'Tap the cards you think are in their hand'}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {displayCandidates.map(c => {
          const picked = guesses.has(c.name)
          const inHand = point.actualNames.has(c.name)
          let cls = 'border-gray-200 hover:border-gray-400'
          if (revealed) {
            if (inHand && picked) cls = 'border-emerald-400 bg-emerald-50'
            else if (inHand && !picked) cls = 'border-emerald-300 bg-emerald-50/40'
            else if (!inHand && picked) cls = 'border-red-300 bg-red-50'
            else cls = 'border-gray-200 opacity-60'
          } else if (picked) {
            cls = 'border-gray-900 bg-gray-900 text-white'
          }
          return (
            <button
              key={c.name}
              onClick={() => toggleGuess(c.name)}
              disabled={revealed}
              className={`flex items-center justify-between gap-2 text-left text-sm border rounded px-3 py-1.5 transition-colors ${cls}`}
            >
              <span className="truncate flex items-center gap-1.5">
                {revealed && inHand && <span className="text-emerald-600">✓</span>}
                {revealed && !inHand && picked && <span className="text-red-500">✕</span>}
                {c.name}
              </span>
              {revealed && (
                <span className={`text-xs flex-shrink-0 ${c.probAtLeastOne >= 0.5 ? 'font-semibold text-gray-700' : 'text-gray-400'}`}>{pct(c.probAtLeastOne)}</span>
              )}
            </button>
          )
        })}
      </div>
      {revealed && (
        <p className="text-[11px] text-gray-400 mt-2">% = engine's estimated chance the card is in hand. Cards it rates ≥50% are its picks.</p>
      )}
    </div>
  )
}

function OddsMode({ focus, estimate, setEstimate, revealed, point }) {
  if (!focus) return <p className="text-sm text-gray-400">No uncertain card to estimate here.</p>
  const inHand = point.actualNames.has(focus.name)
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">What's the chance they hold this card right now?</h3>
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="text-base font-bold text-gray-900 mb-1">{focus.name}</div>
        <div className="text-xs text-gray-400 mb-3">{focus.unseen} unseen cop{focus.unseen === 1 ? 'y' : 'ies'} among {point.handSize + point.deckSize} unknown cards</div>
        <input
          type="range" min="0" max="100" value={estimate}
          onChange={e => setEstimate(Number(e.target.value))}
          disabled={revealed}
          className="w-full"
        />
        <div className="text-center text-2xl font-bold text-gray-900 mt-1">{estimate}%</div>
        {revealed && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className={`text-lg font-bold ${inHand ? 'text-emerald-600' : 'text-red-500'}`}>{inHand ? 'In hand' : 'Not in hand'}</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400">Truth</div>
            </div>
            <div>
              <div className="text-lg font-bold text-gray-800">{estimate}%</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400">Your guess</div>
            </div>
            <div>
              <div className="text-lg font-bold text-gray-800">{pct(focus.probAtLeastOne)}</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400">Engine</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
