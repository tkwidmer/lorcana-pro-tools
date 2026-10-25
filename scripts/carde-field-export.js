// Pull every submitted decklist for an event out of carde.io (Play Hub's
// back end) and copy them as Field Breakdown input.
//
// Only the organizer's logged-in session can read registrations and decks,
// so this runs in YOUR browser, not on our server: open the event in the
// carde.io admin (the URL carries the event id), open DevTools, paste this
// whole file into the Console and press Enter. It pages the registrations,
// fetches each submitted deck, and copies the decklists to the clipboard,
// one `4 Card Name` list per deck with a blank line between. Paste that
// into Field Breakdown (/field-breakdown) for the archetype split, then
// "Copy for Stream Overlay" there. It also builds ink-pair lines for the
// Stream Overlay's Metagame card directly: copy(cardeField.metaLines).
//
// Nothing here is stored or sent anywhere: the registration payload carries
// player emails, and only card names and inks are kept.
//
// If the registrations request 404s, the path differs from the one seen in
// the Network tab when this was written; set REGISTRATIONS to the URL the
// admin page itself calls (minus the page params).
(async () => {
  const API = 'https://api.admin.carde.io/api/v2'
  const eventId = location.pathname.match(/events\/(\d+)/)?.[1] ?? new URLSearchParams(location.search).get('event')
  if (!eventId) throw new Error('No event id in this URL. Open the event page in the carde.io admin first.')
  const REGISTRATIONS = `${API}/events/${eventId}/registrations/`

  // The page's own session: cookies ride along, and a JWT in web storage is
  // sent as a Bearer token when there is one.
  const stored = [localStorage, sessionStorage].flatMap(s => Object.keys(s).map(k => s.getItem(k)))
  const unwrap = v => { try { const j = JSON.parse(v); return typeof j === 'string' ? j : j?.access ?? j?.access_token ?? j?.token ?? null } catch { return v } }
  const token = stored.map(unwrap).find(v => typeof v === 'string' && /^ey[\w-]+\.[\w-]+\.[\w-]+$/.test(v))
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const get = async url => {
    const r = await fetch(url, { headers, credentials: 'include' })
    if (!r.ok) throw new Error(`${r.status} from ${url}`)
    return r.json()
  }

  const registrations = []
  for (let page = 1; page; ) {
    const data = await get(`${REGISTRATIONS}?page=${page}&page_size=100`)
    registrations.push(...data.results)
    page = data.next_page_number
  }
  const submitted = registrations.filter(r => r.registration_status === 'COMPLETE' && r.deck_submission?.deck_id)

  const decks = []
  for (let i = 0; i < submitted.length; i += 4) {
    decks.push(...await Promise.all(submitted.slice(i, i + 4).map(r => get(`${API}/deckbuilder/decks/${r.deck_submission.deck_id}/`))))
  }

  const mainCards = deck => deck.sections.filter(s => s.section_type === 'main').flatMap(s => s.cards)
  const lists = decks.map(deck => mainCards(deck).map(c => `${c.quantity} ${c.card.display_name}`).join('\n'))

  // A deck's ink pair: its two most-played inks, alphabetical.
  const cap = s => s[0].toUpperCase() + s.slice(1)
  const inkPair = deck => {
    const weight = {}
    for (const c of mainCards(deck)) for (const ink of c.card.ink_array ?? []) weight[ink] = (weight[ink] ?? 0) + c.quantity
    return Object.entries(weight).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([ink]) => cap(ink)).sort().join('/')
  }
  const pairs = {}
  for (const deck of decks) pairs[inkPair(deck)] = (pairs[inkPair(deck)] ?? 0) + 1
  const metaLines = Object.entries(pairs).sort((a, b) => b[1] - a[1]).map(([pair, n]) => `${pair} ${n}`).join('\n')

  window.cardeField = { fieldText: lists.join('\n\n'), metaLines }
  console.log(`${registrations.length} registrations, ${submitted.length} with a submitted deck, ${decks.length} decks fetched.`)
  console.log(metaLines)
  try {
    await navigator.clipboard.writeText(window.cardeField.fieldText)
    console.log('Decklists copied: paste into Field Breakdown. For the Metagame card lines instead, run copy(cardeField.metaLines).')
  } catch {
    console.log('Clipboard blocked: run copy(cardeField.fieldText) for Field Breakdown or copy(cardeField.metaLines) for the Metagame card.')
  }
})()
