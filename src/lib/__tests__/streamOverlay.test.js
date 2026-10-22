import { describe, it, expect } from 'vitest'
import {
  rowToState, startTimer, pauseTimer, resetTimer, timerRemainingMs, timerPatch, formatClock,
  timerFromRph, rphClockPatch, featureMatchPatch, swapSidesPatch, winnerIndex, breakHeadline, themeTextColor, DEFAULT_THEME, nameSizeClass, hotkeyAction, deckInks, buildPlayerCard, shortEventName, clearTablePatch,
} from '../streamOverlay'

const row = (overrides = {}) => ({
  id: 't1', name: 'Table 1', mode: 'live', theme_fill: '#17171a', theme_accent: '#b5832a', event_name: 'Open', event_logo_url: '', sponsor_logo_url: '', round: 'Top 16', note: 'Top 8 at 5pm', deck_shown: 0, player_card: null, card_shown: false,
  timer_ends_at: null, timer_remaining_ms: 50 * 60 * 1000, rph_event_id: null,
  p1_name: 'Ryan', p1_record: '5-0-2', p1_inks: ['amethyst', 'emerald'], p1_lore: 12, p1_game_wins: 0, p1_decklist: '4 Elsa',
  p2_name: 'Dylan', p2_record: '5-2-0', p2_inks: ['amber'], p2_lore: 7, p2_game_wins: 1, p2_decklist: '',
  ...overrides,
})

describe('streamOverlay row mapping', () => {
  it('turns a row into the render shape, parsing the clock target', () => {
    const s = rowToState(row({ timer_ends_at: '2026-05-24T23:38:39+00:00' }))
    expect(s.timerEndsAt).toBe(Date.parse('2026-05-24T23:38:39+00:00'))
    expect(s.players[0]).toEqual({ name: 'Ryan', record: '5-0-2', inks: ['amethyst', 'emerald'], lore: 12, gameWins: 0, decklist: '4 Elsa' })
    expect(s.deckShown).toBe(0)
    expect(s.playerCard).toBeNull()
    expect(s.cardShown).toBe(false)
    expect(s.players[1].gameWins).toBe(1)
    expect(s.note).toBe('Top 8 at 5pm')
    expect(rowToState(row()).timerEndsAt).toBeNull()
  })

  it('maps operator hotkeys, and ignores them while typing or with a modifier held', () => {
    const key = (k, extra = {}) => ({ key: k, target: { tagName: 'BODY' }, ...extra })
    expect(hotkeyAction(key('q'))).toEqual({ side: 1, field: 'lore', delta: 1 })
    expect(hotkeyAction(key('S'))).toEqual({ side: 1, field: 'game_wins', delta: -1 })
    expect(hotkeyAction(key('k'))).toEqual({ side: 2, field: 'lore', delta: -1 })
    expect(hotkeyAction(key('o'))).toEqual({ side: 2, field: 'game_wins', delta: 1 })
    expect(hotkeyAction(key('b'))).toEqual({ toggleMode: true })
    expect(hotkeyAction(key('2'))).toEqual({ toggleDeck: 2 })
    expect(hotkeyAction(key('3'))).toEqual({ toggleCard: true })
    expect(hotkeyAction(key('N'))).toEqual({ nextGame: true })
    expect(hotkeyAction(key('x'))).toBeNull()
    expect(hotkeyAction(key('q', { ctrlKey: true }))).toBeNull()
    expect(hotkeyAction(key('q', { target: { tagName: 'INPUT' } }))).toBeNull()
    expect(hotkeyAction(key('q', { target: { tagName: 'DIV', isContentEditable: true } }))).toBeNull()
  })

  it('shortens RPH event names for the stream', () => {
    expect(shortEventName('Disney Lorcana Challenge: Milwaukee')).toBe('DLC Milwaukee')
    expect(shortEventName('Disney Lorcana Challenge - Bologna')).toBe('DLC Bologna')
    expect(shortEventName('The Cauldron Cup CCQ - $5,000 Challenge Championship Qualifier')).toBe('The Cauldron Cup CCQ $5,000 CCQ')
    expect(shortEventName('D23 - Sat - 10am - Challenge Championship Qualifier (CCQ)')).toBe('D23 Sat 10am CCQ')
    expect(shortEventName('Quest Coast III')).toBe('Quest Coast III')
  })

  it('builds the player card: cuts and Day 2s first, meetings newest first, head-to-head by side', () => {
    const ev = (eventName, eventDate, rank, o = {}) => ({ eventName, eventDate, rank, startingPlayerCount: 500, topCutSize: 32, madeTopCut: false, madeDayTwo: false, ...o })
    const histories = [
      { eventsPlayed: 4, topCutCount: 1, dayTwoCount: 1, events: [
        ev('Open A', '2026-01-01', 40), ev('Disney Lorcana Challenge: Milwaukee', '2026-03-01', 150, { madeDayTwo: true }),
        ev('CCQ B', '2026-05-01', 3, { madeTopCut: true, madeDayTwo: true }), ev('Open C', '2026-06-01', 9),
      ] },
      { eventsPlayed: 1, topCutCount: 0, dayTwoCount: 0, events: [ev('Open A', '2026-01-01', 77)] },
    ]
    const headToHead = { matches: [
      { eventName: 'Open A', eventDate: '2026-01-01', roundNumber: 4, phaseName: 'Phase 1', winnerId: 'b', isDraw: false, isBye: false, gamesWonByWinner: 2, gamesWonByLoser: 0 },
      { eventName: 'CCQ B', eventDate: '2026-05-01', roundNumber: 9, phaseName: 'Top 8', winnerId: 'a', isDraw: false, isBye: false, gamesWonByWinner: 2, gamesWonByLoser: 1 },
      { eventName: 'Open C', eventDate: '2026-06-01', roundNumber: 2, phaseName: 'Swiss', winnerId: null, isDraw: true, isBye: false, gamesWonByWinner: null, gamesWonByLoser: null },
    ] }
    const card = buildPlayerCard({ histories, headToHead, playerIds: ['a', 'b'] })
    expect(card.players[0].finishes.map(f => [f.event, f.rank, f.tier])).toEqual([
      ['CCQ B', 3, 'cut'], ['DLC Milwaukee', 150, 'day2'], ['Open C', 9, null], ['Open A', 40, null],
    ])
    expect(card.players[0].finishes[0].year).toBe(2026)
    expect(card.players[1].finishes).toHaveLength(1)
    expect(card.headToHead.wins).toEqual([1, 1])
    expect(card.headToHead.draws).toBe(1)
    expect(card.headToHead.matches.map(m => [m.event, m.phase, m.winner, m.score])).toEqual([
      ['Open C', 'Round 2', null, null], ['CCQ B', 'Top 8', 0, '2-1'], ['Open A', 'Round 4', 1, '2-0'],
    ])
  })

  it('clears the pairing but keeps the event setup', () => {
    const p = clearTablePatch()
    expect(p).toMatchObject({ p1_name: '', p2_name: '', p1_inks: [], p2_lore: 0, p1_game_wins: 0, p2_decklist: '', round: '', note: '', rph_event_id: null, deck_shown: 0, card_shown: false, player_card: null, mode: 'live' })
    for (const kept of ['event_name', 'event_logo_url', 'sponsor_logo_url', 'theme_fill', 'theme_accent', 'timer_ends_at', 'timer_remaining_ms']) expect(p).not.toHaveProperty(kept)
  })

  it('swaps the player card with the sides', () => {
    const card = { players: [{ eventsPlayed: 1 }, { eventsPlayed: 2 }], headToHead: { wins: [2, 1], draws: 0, matches: [{ winner: 0 }, { winner: null }] } }
    const p = swapSidesPatch(row({ player_card: card }))
    expect(p.player_card.players.map(x => x.eventsPlayed)).toEqual([2, 1])
    expect(p.player_card.headToHead.wins).toEqual([1, 2])
    expect(p.player_card.headToHead.matches.map(m => m.winner)).toEqual([1, null])
    expect(swapSidesPatch(row()).player_card).toBeNull()
  })

  it('lists a deck\'s inks from its matched cards, most copies first', () => {
    const entries = [
      { count: 4, card: { color: 'Steel' } },
      { count: 4, card: { colors: ['Amethyst', 'Steel'] } },
      { count: 2, card: { color: 'Amethyst' } },
      { count: 1, card: { color: 'Ruby' } },
    ]
    expect(deckInks(entries)).toEqual(['steel', 'amethyst', 'ruby'])
    expect(deckInks([])).toEqual([])
  })

  it('steps a name down a size class as it outgrows the slot', () => {
    const sizes = [['text-4xl', 13], ['text-3xl', 17], ['text-2xl', 22]]
    expect(nameSizeClass('Ryan', sizes)).toBe('text-4xl')
    expect(nameSizeClass('Jonathan Reyes', sizes)).toBe('text-3xl')
    expect(nameSizeClass('Christopher Lee', sizes)).toBe('text-3xl')
    expect(nameSizeClass('Christopher Montgomery', sizes)).toBe('text-2xl')
    expect(nameSizeClass('Maximilian Featherstonehaugh', sizes)).toBe('text-2xl')
  })

  it('names the winner only once a side reaches the match win count', () => {
    expect(winnerIndex(rowToState(row()).players)).toBeNull()
    expect(winnerIndex(rowToState(row({ p2_game_wins: 2 })).players)).toBe(1)
    expect(winnerIndex(rowToState(row({ p1_game_wins: 2, p2_game_wins: 1 })).players)).toBe(0)
    expect(rowToState(row({ mode: 'break' })).mode).toBe('break')
  })

  it('headlines the break screen from the score alone', () => {
    const fresh = rowToState(row({ p1_game_wins: 0, p2_game_wins: 0 })).players
    expect(breakHeadline(fresh)).toEqual({ label: 'Next match', score: null, winner: null })
    const decided = rowToState(row({ p1_game_wins: 1, p2_game_wins: 2 })).players
    expect(breakHeadline(decided)).toEqual({ label: 'Final', score: '1-2', winner: 1 })
    const midway = rowToState(row({ p1_game_wins: 1, p2_game_wins: 0 })).players
    expect(breakHeadline(midway)).toEqual({ label: 'Match in progress', score: '1-0', winner: null })
  })

  it('derives the text color from the fill, and carries the theme on the state', () => {
    expect(themeTextColor(DEFAULT_THEME.fill)).toBe('#f2f1ee')
    expect(themeTextColor('#b00020')).toBe('#f2f1ee')
    expect(themeTextColor('#ffffff')).toBe('#17171a')
    expect(themeTextColor('#f5e6b3')).toBe('#17171a')
    expect(rowToState(row({ theme_fill: '#ffffff', theme_accent: '#b00020' })).theme)
      .toEqual({ fill: '#ffffff', accent: '#b00020', text: '#17171a' })
  })

  it('swaps every per-side column, and a shown deck follows its player', () => {
    const p = swapSidesPatch(row({ deck_shown: 1 }))
    expect(p.deck_shown).toBe(2)
    expect(swapSidesPatch(row()).deck_shown).toBe(0)
    expect(p.p1_decklist).toBe('')
    expect(p.p2_decklist).toBe('4 Elsa')
    expect(p.p1_name).toBe('Dylan')
    expect(p.p2_name).toBe('Ryan')
    expect(p.p1_inks).toEqual(['amber'])
    expect(p.p2_lore).toBe(12)
    expect(p.p1_game_wins).toBe(1)
  })
})

describe('streamOverlay timer', () => {
  it('starts from the paused remainder and counts down against wall time', () => {
    const paused = rowToState(row())
    expect(timerRemainingMs(paused, 123)).toBe(50 * 60 * 1000)
    const patch = startTimer(paused, 1000)
    expect(patch.timer_ends_at).toBe(new Date(1000 + 50 * 60 * 1000).toISOString())
    const running = rowToState(row(patch))
    expect(timerRemainingMs(running, 1000 + 60 * 1000)).toBe(49 * 60 * 1000)
  })

  it('pauses by freezing the remainder, and never goes below zero', () => {
    const running = rowToState(row(startTimer(rowToState(row(resetTimer(1))), 0)))
    const paused = pauseTimer(running, 20 * 1000)
    expect(paused).toEqual({ timer_ends_at: null, timer_remaining_ms: 40 * 1000 })
    expect(timerRemainingMs(running, 5 * 60 * 1000)).toBe(0)
  })

  it('start and pause are no-ops when already in that state', () => {
    const paused = rowToState(row())
    expect(pauseTimer(paused)).toBeNull()
    const running = rowToState(row(startTimer(paused, 0)))
    expect(startTimer(running, 99)).toBeNull()
  })

  it('formats the clock like a tournament stream', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(59 * 1000 + 1)).toBe('1:00')
    expect(formatClock(37 * 60 * 1000 + 48 * 1000)).toBe('37:48')
    expect(formatClock(60 * 60 * 1000)).toBe('1:00:00')
  })
})

describe('streamOverlay RPH', () => {
  it('maps a running RPH clock to a wall-time target', () => {
    const t = timerFromRph({ timerEndDatetime: '2026-05-24T23:38:39+00:00', timerIsRunning: true, timerPausedAtDatetime: null })
    expect(t).toEqual({ timerEndsAt: Date.parse('2026-05-24T23:38:39+00:00'), timerRemainingMs: 0 })
    expect(timerPatch(t).timer_ends_at).toBe('2026-05-24T23:38:39.000Z')
  })

  it('maps a paused RPH clock to its remainder, and no clock to no patch', () => {
    expect(rphClockPatch({
      timerEndDatetime: '2026-05-24T23:38:39+00:00', timerIsRunning: false, timerPausedAtDatetime: '2026-05-24T22:28:39+00:00',
    })).toEqual({ timer_ends_at: null, timer_remaining_ms: 70 * 60 * 1000 })
    expect(rphClockPatch({ timerEndDatetime: null, timerIsRunning: false, timerPausedAtDatetime: null })).toBeNull()
  })

  it('builds the feature-match patch: names, records, event, round, clock, link; scores reset; inks untouched', () => {
    const p = featureMatchPatch({
      eventName: 'Open', round: 'Top 16', rphEventId: 528227,
      players: [{ name: 'Ryan', record: '5-2-0' }, { name: 'Dylan', record: '5-0-2' }],
      timer: { timerEndsAt: null, timerRemainingMs: 70 * 60 * 1000 },
    })
    expect(p).toEqual({
      timer_ends_at: null, timer_remaining_ms: 70 * 60 * 1000, rph_event_id: 528227, event_name: 'Open', round: 'Top 16',
      p1_name: 'Ryan', p1_record: '5-2-0', p1_lore: 0, p1_game_wins: 0, p1_decklist: '',
      p2_name: 'Dylan', p2_record: '5-0-2', p2_lore: 0, p2_game_wins: 0, p2_decklist: '',
      deck_shown: 0, player_card: null, card_shown: false,
    })
    expect(featureMatchPatch({ eventName: '', round: '', rphEventId: 1, players: [{ name: 'A', record: '' }, { name: 'B', record: '' }], timer: null }))
      .not.toHaveProperty('timer_ends_at')
  })
})
