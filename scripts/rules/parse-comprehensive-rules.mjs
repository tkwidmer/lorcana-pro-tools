// Parser for the Comprehensive Rules' atomic-numbered-rule house style:
// chapter headers ("N. TITLE"), section headers ("N.N Title", label only,
// no body text), and numbered rules ("N.N.N. Text...") with real body text.
//
// Usage:
//   pdftotext -layout Some-Comprehensive-Rules.pdf some-comprehensive-rules.txt
//   node scripts/rules/parse-comprehensive-rules.mjs some-comprehensive-rules.txt
//
// Writes some-comprehensive-rules.json next to the input file — an array
// of { id, type: 'chapter'|'rule', title?, slug?, text? } entries. From
// there:
//   1. Sanity-check it — grep for known pdftotext artifacts (mangled
//      multi-column tables, hyphen-at-linewrap, ligatures, stray bullet
//      glyphs) and hand-fix any that show up. See README.md.
//   2. node scripts/rules/write-version-module.mjs <json> \
//        src/lib/rules/content/<doc>/<version-id>.js \
//        --version <id> --label <label> --releaseDate <date>
//   3. Add the new version's metadata to that document's
//      src/lib/rules/content/<doc>/index.js versionsMeta array, in the
//      correct chronological position.
import { readFileSync, writeFileSync } from 'fs'

const file = process.argv[2]
const raw = readFileSync(file, 'utf8').replace(/\f/g, '\n')
let lines = raw.split('\n')

// Strip footer/header noise lines.
const NOISE_RE = [
  /^\s*disneylorcana\.com\s*$/,
  /^\s*©Disney\b/,
  /^\s*COMPREHENSIVE RULES\s*$/,
  /^\s*Effective \w+ \d+, \d+\s*$/,
  /^\s*Version [\d.]+\s*$/,
  /^\s*Based on the /,
  /^\f$/,
]
lines = lines.filter(l => !NOISE_RE.some(re => re.test(l)))

const CHAPTER_RE = /^(\d{1,2})\.\s+([A-Z][A-Z0-9 &'’,\-]*)$/

// Greedily capture the longest run of dot-separated number segments at the
// start of a line, plus whatever follows. Matched in code (not one combined
// regex) so we can explicitly require the character right after the full
// number to be a literal "." — a single regex with a trailing `\.` there
// is prone to backtracking into a *shorter* number when the real next
// char is a space (e.g. a wrapped cross-reference like "6.1.2.2 to be a
// character..." mid-sentence, which must NOT be read as a header for
// "6.1.2").
const NUMBER_PREFIX_RE = /^\s*(\d{1,2}(?:\.\d{1,2})*)(.*)$/

// A real section/rule header always has the number immediately followed by
// a literal period (the space after it is optional — some source PDFs omit
// it, e.g. "10.11.Support").
function matchNumberedHeader(trimmed) {
  const m = trimmed.match(NUMBER_PREFIX_RE)
  if (!m) return null
  const [, id, rest] = m
  if (!rest.startsWith('.')) return null
  const segments = id.split('.').length
  if (segments < 2) return null // chapter numbers are handled separately
  const content = rest.slice(1).trimStart()
  // A real header always has a title/body immediately after the number.
  // An empty tail means this is just a cross-reference (e.g. "...see
  // section 7.5.") that word-wrapped to the start of a line — not a header.
  if (content === '') return null
  return { id, segments, content }
}

// Find the real chapter-1 body start: the LAST line matching CHAPTER_RE with
// number "1" (the TOC entry has trailing second-column text so won't match
// the strict full-line regex, but just in case, take the last match).
let chapter1Indices = []
lines.forEach((l, i) => {
  const m = l.trim().match(CHAPTER_RE)
  if (m && m[1] === '1') chapter1Indices.push(i)
})
if (chapter1Indices.length === 0) {
  console.error('Could not find chapter 1 start')
  process.exit(1)
}
const bodyStart = chapter1Indices[chapter1Indices.length - 1]

// Find end: first line that's just "Glossary" (any case) after bodyStart.
let bodyEnd = lines.length
for (let i = bodyStart + 1; i < lines.length; i++) {
  if (/^\s*glossary\s*$/i.test(lines[i])) {
    bodyEnd = i
    break
  }
}

const body = lines.slice(bodyStart, bodyEnd)

const entries = []
let current = null // { id, segments, buffer: [] }

function flush() {
  if (!current) return
  let text = current.buffer.join(' ').replace(/\s+/g, ' ').trim()
  // Restore a paragraph break before inline "Example:" callouts.
  text = text.replace(/\s+(Example(?: [A-Z])?:)/g, '\n\n$1')
  // The source PDF hyphenates words that wrap across a line (e.g.
  // "best-of-\nthree"); joining with a space leaves a stray "best-of-
  // three". A literal ASCII hyphen (not an en dash) immediately followed
  // by a space is always this line-wrap artifact, never intentional.
  text = text.replace(/(\w)- (\w)/g, '$1-$2')

  // 2-segment ids are usually short section-header labels ("General",
  // "Golden Rules") with the real content living in 3+-segment sub-rules
  // below them. But at least one chapter (Multiplayer, in v2.2.0; the
  // condensed Keywords chapter in mar2024) skips that layer and puts full
  // rule text directly at the 2-segment level. Decided on the FULLY
  // assembled text (not just the first line) since a real multi-line rule's
  // first line often doesn't end mid-sentence with punctuation — a short,
  // punctuation-free label is the header case; anything longer or ending
  // in sentence punctuation is real rule content.
  const looksLikeHeader = current.segments === 2 && text.split(' ').length <= 8 && !/[.!?]["”]?$/.test(text)

  if (looksLikeHeader) {
    entries.push({ id: current.id, type: 'rule', title: text })
  } else {
    entries.push({ id: current.id, type: 'rule', text })
  }
  current = null
}

for (const line of body) {
  const trimmed = line.trim()
  if (trimmed === '') continue

  const chapterMatch = trimmed.match(CHAPTER_RE)
  if (chapterMatch) {
    flush()
    const title = toTitleCase(chapterMatch[2])
    entries.push({ id: chapterMatch[1], type: 'chapter', title, slug: slugify(title) })
    continue
  }

  const header = matchNumberedHeader(trimmed)

  if (header) {
    flush()
    current = { id: header.id, segments: header.segments, buffer: [header.content] }
    continue
  }

  // Continuation line of the current rule's text.
  if (current) {
    current.buffer.push(trimmed)
  }
}
flush()

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toTitleCase(s) {
  return s
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bOf\b/g, 'of')
    .replace(/\bThe\b/g, 'the')
    .replace(/\bA\b/g, 'a')
    .replace(/^\w/, c => c.toUpperCase())
}

writeFileSync(file.replace(/\.txt$/, '.json'), JSON.stringify(entries, null, 2))
console.log('entries:', entries.length)
console.log('chapters:', entries.filter(e => e.type === 'chapter').length)
console.log('sample:', JSON.stringify(entries.slice(0, 6), null, 2))
