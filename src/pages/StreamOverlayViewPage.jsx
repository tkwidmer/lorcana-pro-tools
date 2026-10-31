import { useEffect, useMemo, useState } from 'react'
import { useCards } from '../hooks/useCards'
import { buildCardIndex } from '../lib/cardAnalysis'
import { BUCKET_ORDER, buildBuckets, matchDeckList, inkFill } from '../lib/decklistShared'
import { useSearchParams } from 'react-router-dom'
import { useTransparentBackground } from '../hooks/useTransparentBackground'
import { InkIcon } from '../components/InkIcons'
import { fetchPublicTable, subscribeToTable } from '../lib/streamTables'
import {
  OVERLAY_WIDTH, OVERLAY_HEIGHT, MAX_GAME_WINS, WINNING_LORE, rowToState, timerRemainingMs, formatClock, winnerIndex, breakHeadline, DEFAULT_THEME, themeTextColor, nameSizeClass, STANDINGS_ROWS, metaSlices, deckCardWidth, CARD_ASPECT, featuredPhase, FEATURED_FADE_MS } from '../lib/streamOverlay'

const SIDE_WIDTH = 320
// Name size classes per slot, big → small, with the character budget each
// fits in Oswald caps at that slot's width; beyond the last it still truncates.
const COLUMN_NAME_SIZES = [['text-4xl', 13], ['text-3xl', 17], ['text-2xl', 22], ['text-xl', 27]]
const BREAK_NAME_SIZES = [['text-6xl', 16], ['text-5xl', 21], ['text-4xl', 28]]

// The event's theme as CSS variables on the frame: every fill, border, lore
// number, pip and ribbon reads these, so one pair of colors restyles both the
// live overlay and the break screen.
const themeVars = theme => ({ '--fill': theme.fill, '--accent': theme.accent, '--on-fill': theme.text })
const FALLBACK_THEME = { ...DEFAULT_THEME, text: themeTextColor(DEFAULT_THEME.fill) }
// Square cutout: tall enough for a portrait player cam, and the operator
// positions the camera source behind it in OBS.
const CAM_HEIGHT = SIDE_WIDTH
// The lore track's strip, against the inner edge of each side column.
const TRACK_WIDTH = 72
// Rows on the track: the WIN label, then 20 down to 0 (START).
const TRACK_ROW_H = OVERLAY_HEIGHT / (WINNING_LORE + 2)

// The single OBS Browser Source for a gameplay stream: a 1920×1080 frame with
// opaque side columns (square player cam cutout, name, record, inks, game-win
// pips, lore) and a top banner (event and up to two sponsor logos, round, timer), everything else
// transparent so the gameplay cam and player cams sit behind it. Once a side
// reaches the match win count it's marked the winner; on `break` the same
// source renders an opaque full-frame screen with the next pairing. It reads
// the stream table named in the link through the public function and then
// renders every broadcast the row's trigger publishes. Unguarded (see
// App.jsx): a Browser Source has no Supabase session, and the public shape
// exposes nothing but what the panel operator typed in.
export function StreamOverlayViewPage() {
  useTransparentBackground()
  const [searchParams] = useSearchParams()
  const tableId = searchParams.get('table') ?? ''
  const [row, setRow] = useState(null)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const { cards } = useCards()
  const cardIndex = useMemo(() => buildCardIndex(cards), [cards])

  useEffect(() => {
    fetchPublicTable(tableId).then(setRow).catch(e => setError(e.message))
    return subscribeToTable(tableId, setRow)
  }, [tableId])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  const state = row && rowToState(row)
  const winner = state && winnerIndex(state.players)
  // Panels over the gameplay cam sit 40px inside the columns (and tracks).
  const edge = SIDE_WIDTH + (state?.loreTrack ? TRACK_WIDTH : 0) + 40

  if (state?.mode === 'break') return <BreakScreen state={state} now={now} />

  return (
    <div
      className="relative overflow-hidden font-display text-(--on-fill) select-none"
      style={{ width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT, ...themeVars(state?.theme ?? FALLBACK_THEME) }}
    >
      {!state && (
        <div className="absolute inset-x-0 top-1/2 text-center text-2xl uppercase tracking-widest text-(--on-fill)/70">
          {error ?? 'Loading the stream table…'}
        </div>
      )}
      {state && (
        <>
          <SideColumn player={state.players[0]} side="left" isWinner={winner === 0} showLore={!state.loreTrack} featured={featuredOf(state, 0, cardIndex, now)} />
          <SideColumn player={state.players[1]} side="right" isWinner={winner === 1} showLore={!state.loreTrack} featured={featuredOf(state, 1, cardIndex, now)} />
          {state.loreTrack && <LoreTrack lore={state.players[0].lore} side="left" />}
          {state.loreTrack && <LoreTrack lore={state.players[1].lore} side="right" />}
          {state.deckShown > 0 && !state.cardShown && !state.metaShown && <DeckPanel player={state.players[state.deckShown - 1]} cardIndex={cardIndex} edge={edge} />}
          {state.cardShown && !state.metaShown && state.playerCard && <PlayerCardPanel state={state} card={state.playerCard} edge={edge} />}
          {state.metaShown && <MetaPanel state={state} framed edge={edge} />}
          <TopBanner state={state} now={now} winner={winner} />
        </>
      )}
    </div>
  )
}

// A side's featured card while it's on stream: the card from that side's
// decklist and its phase (featuredPhase), or null.
function featuredOf(state, i, cardIndex, now) {
  const player = state.players[i]
  const phase = featuredPhase(state.featuredCards, player.featured, player.featuredAt, now)
  if (phase === 'hidden') return null
  const card = matchDeckList(player.decklist, cardIndex).find(e => e.name === player.featured)?.card
  return card ? { card, phase, key: `${player.featured}@${player.featuredAt}` } : null
}

function SideColumn({ player, side, isWinner, showLore, featured }) {
  return (
    <div
      className={`absolute top-0 bottom-0 flex flex-col ${side === 'left' ? 'left-0 border-r-4' : 'right-0 border-l-4'} border-(--accent)`}
      style={{ width: SIDE_WIDTH }}
    >
      {/* Transparent square cutout: place this player's camera behind it in OBS. The
          dark fill starts below it, so nothing paints over the cam. */}
      <div className="w-full border-b-4 border-(--accent)" style={{ height: CAM_HEIGHT }} />

      <div className="flex-1 min-h-0 w-full bg-(--fill) flex flex-col items-center">
      <div className="mt-6 px-4 w-full text-center">
        {/* Fixed-height line so a shrunken name doesn't move what's below it. */}
        <div className={`h-10 flex items-center justify-center uppercase tracking-wide leading-tight ${nameSizeClass(player.name, COLUMN_NAME_SIZES)}`}>
          <span className="truncate">{player.name || ' '}</span>
        </div>
        <div className="mt-1 text-2xl text-(--on-fill)/70 tracking-widest">{player.record || ' '}</div>
      </div>

      <div className="mt-5 flex gap-3">
        {player.inks.map(ink => <InkIcon key={ink} color={ink} size={56} />)}
      </div>

      <div className="mt-5 flex gap-3" aria-label={`${player.gameWins} game wins`}>
        {Array.from({ length: MAX_GAME_WINS }, (_, i) => (
          <svg key={i} viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <path
              d="M12 2l10 10-10 10L2 12z"
              className={i < player.gameWins ? 'fill-(--accent) stroke-(--accent)' : 'fill-transparent stroke-(--on-fill)/60'}
              strokeWidth="2"
            />
          </svg>
        ))}
      </div>

      {/* The featured card takes the free height between the pips and the
          winner slot, so the lore display decides its size: small beside the
          big lore number, larger with the lore track. */}
      {featured && <FeaturedCard key={featured.key} card={featured.card} fading={featured.phase === 'fading'} />}

      {/* Fixed-height slot just above the lore, so the lore block never moves
          and both columns stay aligned whether or not there's a winner. */}
      <div className="mt-auto h-10 flex items-center justify-center">
        {isWinner && (
          <div className="px-5 py-1 bg-(--accent) text-(--fill) text-xl uppercase tracking-[0.35em]">Winner</div>
        )}
      </div>

      {showLore && (
        <div className="mt-2 text-center">
          <div className="text-base uppercase tracking-[0.3em] text-(--on-fill)/60">Lore</div>
          <div className={`text-[9rem] leading-none text-(--accent) tabular-nums ${player.lore >= WINNING_LORE ? 'animate-pulse' : ''}`}>{player.lore}</div>
        </div>
      )}

      {/* Brand lockup, bottom-right like the reference streams; mirrors Nav's. */}
      <div className="mt-6 mb-5 h-8 flex items-center justify-center gap-2">
        {side === 'right' && (
          <>
            <img src="/inkborn_forge_mark_64.png" alt="" className="h-8 w-8 rounded-sm" />
            <span className="text-xl uppercase tracking-[0.12em]">InkbornForge</span>
          </>
        )}
      </div>
      </div>
    </div>
  )
}

// Fades in once the full-size image has loaded (so it never paints half
// loaded on stream) and out over its last FEATURED_FADE_MS.
function FeaturedCard({ card, fading }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="flex-1 min-h-0 w-full flex items-center justify-center px-5 pt-5">
      <img
        src={card.images.full} alt={card.fullName} onLoad={() => setLoaded(true)}
        className={`max-w-full max-h-full rounded-xl border-[3px] border-(--accent) transition-opacity ${loaded && !fading ? 'opacity-100' : 'opacity-0'}`}
        style={{ transitionDuration: `${FEATURED_FADE_MS}ms` }}
      />
    </div>
  )
}

// The alternate lore display: a full-height strip against the column's inner
// edge, WIN at the top, 20 down to START, with the accent marker climbing to
// the player's lore (held at 20 beyond it, pulsing there as the cue to tap the
// game win, as the big number does).
function LoreTrack({ lore, side }) {
  const at = Math.min(lore, WINNING_LORE)
  const rows = Array.from({ length: WINNING_LORE + 1 }, (_, i) => WINNING_LORE - i)
  return (
    <div
      className={`absolute top-0 bottom-0 bg-(--fill) border-(--accent) ${side === 'left' ? 'border-r-4' : 'border-l-4'}`}
      style={{ width: TRACK_WIDTH, [side]: SIDE_WIDTH }}
      aria-label={`${lore} lore`}
    >
      <div
        className={`absolute left-1/2 -translate-x-1/2 rounded-full bg-(--accent) transition-[top] duration-300 ${lore >= WINNING_LORE ? 'animate-pulse' : ''}`}
        style={{ width: TRACK_ROW_H - 4, height: TRACK_ROW_H - 4, top: (WINNING_LORE - at + 1) * TRACK_ROW_H + 2 }}
      />
      <div className="relative flex items-center justify-center text-xl uppercase tracking-[0.2em] text-(--accent)" style={{ height: TRACK_ROW_H }}>Win</div>
      {rows.map(n => (
        <div
          key={n}
          className={`relative flex items-center justify-center tabular-nums leading-none ${n === 0 ? 'text-sm uppercase tracking-[0.1em]' : 'text-3xl'} ${n === at ? 'text-(--fill)' : 'text-(--on-fill)/60'}`}
          style={{ height: TRACK_ROW_H }}
        >
          {n === 0 ? 'Start' : n}
        </div>
      ))}
    </div>
  )
}

// A player's decklist laid over the gameplay cam while the panel has it
// shown: the card images, characters then actions / songs, items and
// locations, each by cost (buildBuckets), sized as large as fits the whole
// deck. The frame's theme colors the chrome.
// ponytail: grid box estimated from the panel's layout (1200×870 less border,
// header and padding); re-measure if the panel's chrome changes.
const DECK_GRID = { width: 1160, height: 770, gap: 8 }

function DeckPanel({ player, cardIndex, edge }) {
  const buckets = buildBuckets(matchDeckList(player.decklist, cardIndex))
  const entries = BUCKET_ORDER.flatMap(type => buckets[type])
  const gridWidth = DECK_GRID.width - 2 * (edge - SIDE_WIDTH - 40)
  const cardWidth = deckCardWidth(entries.length, gridWidth, DECK_GRID.height, DECK_GRID.gap)
  return (
    <div
      className="absolute flex flex-col bg-(--fill)/95 border-4 border-(--accent) rounded-lg overflow-hidden"
      style={{ left: edge, right: edge, top: 170, bottom: 40 }}
    >
      <div className="flex items-center justify-center gap-4 px-6 py-3 border-b-4 border-(--accent)">
        <span className="text-3xl uppercase tracking-wide">{player.name || ' '}</span>
        <span className="flex gap-2">{player.inks.map(ink => <InkIcon key={ink} color={ink} size={36} />)}</span>
      </div>
      <div className="flex-1 min-h-0 px-4 py-3 flex flex-wrap content-center justify-center" style={{ gap: DECK_GRID.gap }}>
        {entries.map(({ key, name, count, card }) => (
          <div key={key} className="relative" style={{ width: cardWidth, height: cardWidth * CARD_ASPECT }}>
            <img src={card.images.thumbnail} alt={name} className="w-full h-full object-contain" />
            <span className="absolute bottom-1 right-1 rounded px-2 text-2xl font-bold tabular-nums bg-(--fill) text-(--on-fill) border-2 border-(--accent)">×{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const ordinal = n => `${n}${(n % 100 > 10 && n % 100 < 14) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

// The pair's archive history over the gameplay cam while the panel has it
// shown (between games): each player's majors, top cuts, Day 2s and best
// finishes on their own side, the head-to-head at every archived event
// (side events included) between. The data
// is the row's `player_card` (buildPlayerCard), written by Tournament
// Lookup's send — the view has no session to query the archive itself.
function PlayerCardPanel({ state, card, edge }) {
  const { wins, draws, matches } = card.headToHead
  const [a, b] = state.players
  const lead = wins[0] === wins[1] ? (wins[0] + draws === 0 ? 'First meeting' : 'Series tied') : `${(wins[0] > wins[1] ? a : b).name} leads`
  return (
    <div className="absolute flex bg-(--fill)/95 border-4 border-(--accent) rounded-lg overflow-hidden" style={{ left: edge, right: edge, top: 170, bottom: 40 }}>
      <PlayerHalf player={a} history={card.players[0]} align="left" />
      <div className="w-[300px] shrink-0 border-x-4 border-(--accent) flex flex-col items-center px-5 py-8 text-center">
        <div className="text-base uppercase tracking-[0.35em] text-(--on-fill)/60">Head to head</div>
        <div className="mt-1 text-sm uppercase tracking-[0.2em] text-(--on-fill)/50">at archived events</div>
        <div className="mt-6 text-7xl leading-none tabular-nums text-(--accent)">
          {wins[0]}<span className="text-(--on-fill)/40 mx-2">–</span>{wins[1]}
        </div>
        {draws > 0 && <div className="mt-2 text-base uppercase tracking-[0.2em] text-(--on-fill)/50">{draws} draw{draws === 1 ? '' : 's'}</div>}
        <div className="mt-3 text-xl uppercase tracking-wide">{lead}</div>
        <div className="mt-8 w-full space-y-4">
          {matches.map((m, i) => (
            <div key={i}>
              <div className="text-lg leading-tight">{m.event} {m.year && <span className="text-(--on-fill)/50">{m.year}</span>}</div>
              <div className="text-base text-(--on-fill)/60 uppercase tracking-wide">{m.phase}</div>
              <div className="text-xl text-(--accent)">{m.winner === null ? 'Draw' : `${state.players[m.winner].name}${m.score ? ` ${m.score}` : ''}`}</div>
            </div>
          ))}
        </div>
      </div>
      <PlayerHalf player={b} history={card.players[1]} align="right" />
    </div>
  )
}

const TIER_LABEL = { cut: 'Top cut', day2: 'Day 2' }
const BRACKET_MAX_MATCHES = 8

function PlayerHalf({ player, history, align }) {
  const right = align === 'right'
  return (
    <div className={`flex-1 min-w-0 flex flex-col px-8 py-7 ${right ? 'items-end text-right' : 'items-start text-left'}`}>
      <div className="text-5xl uppercase tracking-wide leading-none truncate max-w-full">{player.name}</div>
      <div className={`mt-2 flex items-center gap-3 ${right ? 'flex-row-reverse' : ''}`}>
        <span className="text-2xl text-(--on-fill)/70 tracking-widest">{player.record}</span>
        <span className="flex gap-1.5">{player.inks.map(ink => <InkIcon key={ink} color={ink} size={30} />)}</span>
      </div>
      <div className="mt-7 flex gap-6">
        <Tile
          label="Rating"
          value={history.rating == null ? '—' : history.rating.toLocaleString('en-US')}
          sub={history.rank ? `#${history.rank}` : history.rating == null ? null : 'Provisional'}
          align={align}
        />
        <Tile label="Majors" value={history.majorsPlayed} align={align} />
        <Tile label="Top cuts" value={history.topCutCount} align={align} />
        <Tile label="Day 2s" value={history.dayTwoCount} align={align} />
      </div>
      <div className="mt-7 text-base uppercase tracking-[0.35em] text-(--on-fill)/60">Best finishes</div>
      <div className="mt-2 w-full space-y-2">
        {history.finishes.map((f, i) => (
          <div key={i} className={`flex items-baseline gap-4 ${right ? 'flex-row-reverse' : ''}`}>
            <span className="text-3xl text-(--accent) tabular-nums w-16 shrink-0" style={{ textAlign: align }}>{ordinal(f.rank)}</span>
            <span className="min-w-0">
              <span className="text-2xl leading-tight block truncate">{f.event}</span>
              <span className="text-base text-(--on-fill)/60 uppercase tracking-wide block">
                {[f.year, f.players && `${f.players} players`, f.tier === 'cut' && f.topCutSize && `top ${f.topCutSize}`].filter(Boolean).join(' · ')}
              </span>
              {(f.tier || f.side) && (
                <span className={`mt-1 flex gap-2 ${right ? 'flex-row-reverse' : ''}`}>
                  {f.tier && <span className="text-xs uppercase tracking-[0.2em] px-1.5 py-0.5 bg-(--accent) text-(--fill)">{TIER_LABEL[f.tier]}</span>}
                  {f.side && <span className="text-xs uppercase tracking-[0.2em] px-1.5 py-0.5 border border-(--on-fill)/40 text-(--on-fill)/70">Side event</span>}
                </span>
              )}
            </span>
          </div>
        ))}
        {history.finishes.length === 0 && <div className="text-2xl text-(--on-fill)/50">No finishes on record</div>}
      </div>
    </div>
  )
}

function Tile({ label, value, sub, align }) {
  return (
    <div className="whitespace-nowrap" style={{ textAlign: align }}>
      <div className="text-5xl leading-none tabular-nums text-(--accent)">{value}</div>
      <div className="mt-1 text-sm uppercase tracking-[0.3em] text-(--on-fill)/60">{label}</div>
      {sub && <div className="text-sm uppercase tracking-[0.2em] text-(--on-fill)/40">{sub}</div>}
    </div>
  )
}

function TopBanner({ state, now, winner }) {
  const remaining = timerRemainingMs(state, now)
  const result = winner === null ? null : `${state.players[winner].name} ${state.players[winner].gameWins}-${state.players[1 - winner].gameWins}`
  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center px-8 py-3 bg-(--fill) border-x-4 border-b-4 border-(--accent) rounded-b-lg">
      <div className="flex items-center gap-8">
        {state.eventLogoUrl
          ? <img src={state.eventLogoUrl} alt={state.eventName} className="h-16 object-contain" />
          : <div className="text-3xl uppercase tracking-wide">{state.eventName || ' '}</div>}
        {state.sponsorLogoUrl && <img src={state.sponsorLogoUrl} alt="" className="h-16 object-contain -ml-4" />}
        {state.sponsor2LogoUrl && <img src={state.sponsor2LogoUrl} alt="" className="h-16 object-contain -ml-4" />}
        {result ? <Stat label="Winner" value={result} /> : <Stat label="Round" value={state.round || '—'} />}
        <Stat label="Time" value={formatClock(remaining)} warn={state.timerEndsAt !== null && remaining < 5 * 60 * 1000} />
      </div>
      {state.note && <div className="mt-2 text-xl uppercase tracking-[0.3em] text-(--on-fill)/70 max-w-[1100px] truncate">{state.note}</div>}
    </div>
  )
}

// Between matches: opaque, the event up top, then whatever the table holds —
// the result of the match that just ended until the next pairing is published
// on RPH and sent over, then the next match (breakHeadline decides). A feature
// match often ends early, so while the round clock has time left it counts
// down here too, so viewers know roughly when the next round starts.
function BreakScreen({ state, now }) {
  const headline = breakHeadline(state.players)
  const remaining = timerRemainingMs(state, now)
  return (
    <div
      className="relative overflow-hidden bg-(--fill) font-display text-(--on-fill) select-none flex flex-col items-center justify-center gap-10"
      style={{ width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT, ...themeVars(state.theme) }}
    >
      <div className="flex items-center gap-10">
        {state.eventLogoUrl
          ? <img src={state.eventLogoUrl} alt={state.eventName} className="h-48 object-contain" />
          : <div className="text-7xl uppercase tracking-wide">{state.eventName || ' '}</div>}
        {state.sponsorLogoUrl && <img src={state.sponsorLogoUrl} alt="" className="h-36 object-contain" />}
        {state.sponsor2LogoUrl && <img src={state.sponsor2LogoUrl} alt="" className="h-36 object-contain" />}
      </div>

      {state.breakPanel === 'standings' && state.standings ? (
        <StandingsPanel standings={state.standings} note={state.note} />
      ) : state.breakPanel === 'bracket' && state.bracket ? (
        <BracketPanel bracket={state.bracket} note={state.note} />
      ) : state.breakPanel === 'meta' && metaSlices(state.metaText, state.metaPlayers) ? (
        <MetaPanel state={state} note={state.note} />
      ) : (
        <>
          <div className="text-center">
            <div className="text-2xl uppercase tracking-[0.4em] text-(--on-fill)/60">{headline.label}</div>
            {state.round && <div className="mt-1 text-3xl uppercase tracking-wide text-(--accent)">{state.round}</div>}
            {state.note && <div className="mt-2 text-2xl uppercase tracking-[0.3em] text-(--on-fill)/70">{state.note}</div>}
          </div>

          <div className="flex items-center gap-16">
            <BreakPlayer player={state.players[0]} isWinner={headline.winner === 0} />
            <div className={`text-5xl tabular-nums ${headline.score ? 'text-(--on-fill)' : 'text-(--on-fill)/40'}`}>{headline.score ?? 'vs'}</div>
            <BreakPlayer player={state.players[1]} isWinner={headline.winner === 1} />
          </div>
        </>
      )}

      {remaining > 0 && (
        <div className="text-center">
          <div className="text-2xl uppercase tracking-[0.4em] text-(--on-fill)/60">Time left in round</div>
          <div className="text-7xl leading-tight tabular-nums">{formatClock(remaining)}</div>
        </div>
      )}

      <div className="absolute bottom-6 right-8 flex items-center gap-2">
        <img src="/inkborn_forge_mark_64.png" alt="" className="h-8 w-8 rounded-sm" />
        <span className="text-xl uppercase tracking-[0.12em]">InkbornForge</span>
      </div>
    </div>
  )
}

// The tournament's metagame (metaSlices over the panel's text): one bar per
// ink pair, largest first, in its two colors (inkFill, as the
// Inspector paints a deck), the share and the deck count beside it. Framed
// over the gameplay cam (same box as the player card) or bare on the break
// screen. Type and row height step down as the list grows.
function MetaPanel({ state, note, framed, edge }) {
  const meta = metaSlices(state.metaText, state.metaPlayers)
  if (!meta) return null
  const n = meta.slices.length
  const size = n > 10 ? 'text-xl' : n > 6 ? 'text-2xl' : 'text-3xl'
  const rowH = n > 10 ? 40 : n > 6 ? 52 : 64
  const barH = n > 10 ? 20 : 28
  const max = Math.max(...meta.slices.map(sl => sl.share))
  const body = (
    <div className="flex flex-col justify-center w-full h-full px-14">
      {meta.slices.map(sl => (
        <div key={sl.name} className="flex items-center gap-5" style={{ height: rowH }}>
          <span className="flex gap-1 w-[72px] shrink-0">{sl.inks.map(ink => <InkIcon key={ink} color={ink} size={n > 10 ? 26 : 32} />)}</span>
          <span className={`${size} uppercase tracking-wide leading-none truncate w-[340px] shrink-0`}>{sl.name}</span>
          <div className="flex-1 bg-(--on-fill)/10 overflow-hidden" style={{ height: barH }}>
            <div className="h-full" style={{ width: `${(sl.share / max) * 100}%`, ...inkFill(sl.inks) }} />
          </div>
          <span className={`${size} tabular-nums text-(--accent) w-[90px] text-right`}>{Math.round(sl.share * 100)}%</span>
          <span className="text-xl tabular-nums text-(--on-fill)/60 w-[56px] text-right">{sl.count ?? ''}</span>
        </div>
      ))}
    </div>
  )
  if (framed) {
    return (
      <div className="absolute flex flex-col bg-(--fill)/95 border-4 border-(--accent) rounded-lg overflow-hidden" style={{ left: edge, right: edge, top: 170, bottom: 40 }}>
        <div className="pt-6 text-center">
          <span className="text-2xl uppercase tracking-[0.4em] text-(--on-fill)/60">Metagame</span>
          {meta.players && <span className="ml-6 text-2xl uppercase tracking-wide text-(--accent)">{meta.players} players</span>}
        </div>
        <div className="flex-1 min-h-0">{body}</div>
      </div>
    )
  }
  return (
    <>
      <div className="text-center">
        <div className="text-2xl uppercase tracking-[0.4em] text-(--on-fill)/60">Metagame</div>
        {meta.players && <div className="mt-1 text-3xl uppercase tracking-wide text-(--accent)">{meta.players} players</div>}
        {note && <div className="mt-2 text-2xl uppercase tracking-[0.3em] text-(--on-fill)/70">{note}</div>}
      </div>
      <div style={{ width: 1500, height: n * rowH }}>{body}</div>
    </>
  )
}

// Standings snapshot on the break screen: the top of the field in two
// columns, rank / name / record / points.
function StandingsPanel({ standings, note }) {
  const rows = standings.rows.slice(0, STANDINGS_ROWS)
  const half = Math.ceil(rows.length / 2)
  const columns = [rows.slice(0, half), rows.slice(half)].filter(c => c.length)
  return (
    <>
      <div className="text-center">
        <div className="text-2xl uppercase tracking-[0.4em] text-(--on-fill)/60">Standings</div>
        <div className="mt-1 text-3xl uppercase tracking-wide text-(--accent)">After {standings.round} · {standings.players} players</div>
        {note && <div className="mt-2 text-2xl uppercase tracking-[0.3em] text-(--on-fill)/70">{note}</div>}
      </div>
      <div className="flex gap-16">
        {columns.map((rows, c) => (
          <div key={c} className="w-[620px] space-y-1.5">
            {rows.map(r => (
              <div key={r.rank} className="flex items-baseline gap-4 border-b border-(--on-fill)/10 pb-1">
                <span className="w-12 text-3xl text-(--accent) tabular-nums text-right">{r.rank}</span>
                <span className="flex-1 min-w-0 text-3xl uppercase tracking-wide truncate">{r.name}</span>
                <span className="text-2xl text-(--on-fill)/70 tabular-nums tracking-widest">{r.record}</span>
                <span className="w-14 text-2xl tabular-nums text-right">{r.points ?? ''}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

// Bracket snapshot on the break screen: one column per round, boxes sized
// so the biggest round fits the frame; the winner of each match in accent.
function BracketPanel({ bracket, note }) {
  // Rounds of more than eight matches don't fit legibly, so a Top 32 opens
  // at the Round of 16 and a Top 64 at the quarterfinals' grandparent.
  const rounds = bracket.rounds.filter(r => r.matches.length <= BRACKET_MAX_MATCHES)
  const maxMatches = Math.max(...rounds.map(r => r.matches.length), 1)
  const boxH = Math.min(96, Math.floor(600 / maxMatches) - 10)
  const size = boxH >= 80 ? 'text-2xl' : boxH >= 56 ? 'text-xl' : 'text-base'
  return (
    <>
      <div className="text-center">
        <div className="text-2xl uppercase tracking-[0.4em] text-(--on-fill)/60">{bracket.phase}</div>
        {note && <div className="mt-2 text-2xl uppercase tracking-[0.3em] text-(--on-fill)/70">{note}</div>}
      </div>
      <div className="flex gap-10 items-stretch" style={{ height: 620 }}>
        {rounds.map((round, ri) => (
          <div key={ri} className="flex flex-col w-[320px]">
            <div className="text-base uppercase tracking-[0.3em] text-(--on-fill)/60 text-center mb-3">{round.label}</div>
            <div className="flex-1 flex flex-col justify-around gap-2">
              {round.matches.map((m, mi) => (
                <div key={mi} style={{ flexGrow: 2 ** ri }} className="flex items-center">
                  <div className={`w-full border-2 border-(--accent)/60 rounded overflow-hidden ${size} uppercase tracking-wide`} style={{ height: boxH }}>
                    {[m.p1, m.p2].map((name, side) => (
                      <div key={side} className={`h-1/2 px-3 flex items-center justify-between gap-2 ${m.winner === side ? 'bg-(--accent) text-(--fill)' : side === 0 ? 'border-b border-(--on-fill)/15' : ''}`}>
                        <span className="truncate">{name ?? (m.bye ? 'Bye' : '—')}</span>
                        {m.winner === side && m.score && <span className="tabular-nums shrink-0">{m.score}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function BreakPlayer({ player, isWinner }) {
  return (
    <div className="w-[560px] text-center">
      {/* Fixed-height slot above the name, so nothing moves and both sides stay
          aligned whether or not there's a winner. */}
      <div className="mb-2 h-10 flex items-center justify-center">
        {isWinner && <div className="px-5 py-1 bg-(--accent) text-(--fill) text-xl uppercase tracking-[0.35em]">Winner</div>}
      </div>
      <div className={`h-16 flex items-center justify-center uppercase tracking-wide leading-tight ${nameSizeClass(player.name, BREAK_NAME_SIZES)} ${isWinner ? 'text-(--accent)' : ''}`}>
        <span className="truncate">{player.name || ' '}</span>
      </div>
      <div className="mt-2 text-3xl text-(--on-fill)/70 tracking-widest">{player.record || ' '}</div>
      <div className="mt-5 flex justify-center gap-4">
        {player.inks.map(ink => <InkIcon key={ink} color={ink} size={72} />)}
      </div>
    </div>
  )
}

function Stat({ label, value, warn = false }) {
  return (
    <div className="text-center">
      <div className="text-sm uppercase tracking-[0.3em] text-(--on-fill)/60">{label}</div>
      <div className={`text-4xl leading-tight tabular-nums ${warn ? 'text-red-400' : ''}`}>{value}</div>
    </div>
  )
}
