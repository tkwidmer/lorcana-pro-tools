// carde.io's decklists PDF (the admin's "Download decklists" export): one
// submitted deck per page — a title, Player / Format / Submitted / Event /
// Organizer lines, the "4 Card Name" lines, then the browser's print header
// and footer — read into Field Breakdown's input, lists separated by a blank
// line. A long card name wraps onto a line of its own; a deck that overflows
// its page continues on a page with no Player line.
const CARD = /^\d+\s+\S/
const PRINT_CHROME = /^(about:blank|\d+\/\d+\/\d+, )/

export function decklistsFromPages(pages) {
  const decks = []
  for (const text of pages) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.some(l => l.startsWith('Player:'))) decks.push([])
    const deck = decks.at(-1)
    if (!deck) continue
    for (const line of lines) {
      if (CARD.test(line)) deck.push(line)
      else if (deck.length && !PRINT_CHROME.test(line) && /\p{L}/u.test(line)) deck[deck.length - 1] += ` ${line}`
    }
  }
  return decks.filter(d => d.length).map(d => d.join('\n')).join('\n\n')
}

// pdf.js is loaded on first use so it stays out of the main bundle; the legacy
// build, because the current one needs JS APIs (Math.sumPrecise, Promise.try)
// that shipping browsers don't all have yet.
export async function readDecklistsPdf(file) {
  const [pdfjs, { default: workerSrc }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const { items } = await (await doc.getPage(n)).getTextContent()
    pages.push(items.map(it => it.str + (it.hasEOL ? '\n' : '')).join(''))
  }
  const text = decklistsFromPages(pages)
  if (!text) throw new Error('No decklists found in this PDF')
  return text
}
