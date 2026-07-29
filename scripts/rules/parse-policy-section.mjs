// Parser for the "SECTION N: TITLE" / "N.N Title" house style used by
// Tournament Rules and Play Correction Guidelines: numbered chapters and
// sub-headings that each introduce free-flowing prose paragraphs (no
// per-sentence numbering like the Comprehensive Rules).
//
// Usage:
//   pdftotext -layout Some-Tournament-Rules.pdf some-tournament-rules.txt
//   node scripts/rules/parse-policy-section.mjs some-tournament-rules.txt
//
// Writes some-tournament-rules.json next to the input file. See the header
// comment in parse-comprehensive-rules.mjs and README.md for the rest of
// the workflow (sanity-check → write-version-module → update versionsMeta).
// This parser's known trouble spot beyond the general artifact list: it
// cannot linearize genuine multi-column tables (pod-size / round-count
// guidance) into readable prose — those come out as run-on text and need
// hand reconstruction every time, watch for it.
import { readFileSync, writeFileSync } from 'fs'

const file = process.argv[2]
const raw = readFileSync(file, 'utf8')
  .replace(/\f/g, '\n')
  // Some source PDFs use a Wingdings/Symbol private-use-area bullet glyph
  // (U+F0A7) or a black-small-square bullet (U+25AA) for the same kind of
  // list another version renders as a plain bullet — normalize both so
  // equivalent lists diff as equal across versions instead of showing a
  // false "changed" from the glyph alone.
  .replace(/[▪]/g, '•')
  // Some source PDFs use typographic ligature glyphs (ff/fi/fl/ffi/ffl)
  // instead of plain letters — expand them so text matches/searches
  // normally and doesn't diff as "changed" against a version that
  // doesn't use them.
  .replace(/\uFB00/g, 'ff')
  .replace(/\uFB01/g, 'fi')
  .replace(/\uFB02/g, 'fl')
  .replace(/\uFB03/g, 'ffi')
  .replace(/\uFB04/g, 'ffl')
let lines = raw.split('\n')

const NOISE_RE = [
  /^\s*disneylorcana\.com\s*$/,
  /^\s*©Disney\b.*$/,
  /^\s*\d+\s*$/, // bare page numbers
  /^\s*Effective \S.*$/,
  /^\f$/,
]
lines = lines.filter(l => !NOISE_RE.some(re => re.test(l)))

const CHAPTER_RE = /^SECTION (\d+): (.+)$/i
const HEADING_RE = /^(\d+(?:\.\d+)*)\s+([A-Z][^.]*[A-Za-z0-9)”’])$/

const bodyStartIdx = lines.findIndex(l => CHAPTER_RE.test(l.trim()))
if (bodyStartIdx === -1) {
  console.error('Could not find "SECTION 1:" body start')
  process.exit(1)
}
const body = lines.slice(bodyStartIdx)

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const entries = []
let current = null // { id, title, paragraphs: [], buffer: [] }

function endParagraph() {
  if (current && current.buffer.length) {
    let text = current.buffer.join(' ').replace(/\s+/g, ' ').trim()
    // The source PDF hyphenates words that wrap across a line (e.g.
    // "single-\nplayer"); joining with a space leaves a stray "single-
    // player". A literal ASCII hyphen (not the en dash "–" this document
    // uses for asides) immediately followed by a space is always this
    // line-wrap artifact, never intentional.
    text = text.replace(/(\w)- (\w)/g, '$1-$2')
    current.paragraphs.push(text)
    current.buffer = []
  }
}

function flush() {
  if (!current) return
  endParagraph()
  entries.push({ id: current.id, type: 'rule', title: current.title, text: current.paragraphs.join('\n\n') })
  current = null
}

for (const rawLine of body) {
  const trimmed = rawLine.trim()

  const chapterMatch = trimmed.match(CHAPTER_RE)
  if (chapterMatch) {
    flush()
    entries.push({ id: chapterMatch[1], type: 'chapter', title: chapterMatch[2], slug: slugify(chapterMatch[2]) })
    continue
  }

  if (trimmed === '') {
    // A word that hyphenates across a page break (rare, but occurs when
    // the break falls mid-word) leaves a blank line — from page-number/
    // footer spacing — between the "word-" fragment and its continuation
    // on the next page. Don't end the paragraph there, or the hyphen
    // rejoin in endParagraph() never gets to see both halves together.
    const last = current?.buffer[current.buffer.length - 1]
    if (!last || !/\w-$/.test(last)) endParagraph()
    continue
  }

  const headingMatch = trimmed.match(HEADING_RE)
  if (headingMatch) {
    flush()
    current = { id: headingMatch[1], title: headingMatch[2], paragraphs: [], buffer: [] }
    continue
  }

  if (current) {
    // Bullets aren't blank-line separated from each other in the source,
    // but each one should still render as its own paragraph rather than
    // running together into a wall of text.
    if (/^[•o]\s/.test(trimmed) && current.buffer.length) endParagraph()
    current.buffer.push(trimmed)
  }
}
flush()

writeFileSync(file.replace(/\.txt$/, '.json'), JSON.stringify(entries, null, 2))
console.log('entries:', entries.length, 'chapters:', entries.filter(e => e.type === 'chapter').length)
