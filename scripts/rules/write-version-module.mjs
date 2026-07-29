// Converts one parser output (a JSON array of { id, type, title?, slug?,
// text? } entries) into a per-version content module —
// src/lib/rules/content/<doc>/<version-id>.js — in the format the app's
// lazy loader (content/versionLoader.js) expects.
//
// Usage:
//   node scripts/rules/write-version-module.mjs <input.json> <output.js> \
//     --version 2026-07-09 --label "July 2026 (v2.2.0)" --releaseDate 2026-07-09
//
// After running this, add { version, label, releaseDate } to the
// document's src/lib/rules/content/<doc>/index.js versionsMeta array, in
// the correct chronological position (newest first) — that step is left
// manual since getting the ordering right for irregularly-dated errata
// versions (see the Comprehensive Rules v2.0.0/v2.0.1 pair) needs a human
// judgment call, not a script.
import { readFileSync, writeFileSync } from 'fs'

const args = process.argv.slice(2)
const [inputPath, outputPath] = args
const flags = {}
for (let i = 2; i < args.length; i += 2) {
  flags[args[i].replace(/^--/, '')] = args[i + 1]
}

if (!inputPath || !outputPath || !flags.version || !flags.label || !flags.releaseDate) {
  console.error(
    'Usage: node write-version-module.mjs <input.json> <output.js> --version <id> --label <label> --releaseDate <date>'
  )
  process.exit(1)
}

const entries = JSON.parse(readFileSync(inputPath, 'utf8'))

function entryToJs(e, indent) {
  const pad = ' '.repeat(indent)
  const fields = [`id: ${JSON.stringify(e.id)}`, `type: ${JSON.stringify(e.type)}`]
  if (e.title) fields.push(`title: ${JSON.stringify(e.title)}`)
  if (e.slug) fields.push(`slug: ${JSON.stringify(e.slug)}`)
  if (e.text) fields.push(`text: ${JSON.stringify(e.text)}`)
  return `${pad}{ ${fields.join(', ')} },`
}

let out = `export default {\n`
out += `  version: ${JSON.stringify(flags.version)},\n`
out += `  label: ${JSON.stringify(flags.label)},\n`
out += `  releaseDate: ${JSON.stringify(flags.releaseDate)},\n`
out += `  entries: [\n`
let lastChapter = null
for (const e of entries) {
  if (e.type === 'chapter') {
    if (lastChapter !== null) out += '\n'
    lastChapter = e.id
  }
  out += entryToJs(e, 4) + '\n'
}
out += `  ],\n`
out += `}\n`

writeFileSync(outputPath, out)
console.log(`wrote ${outputPath} (${entries.length} entries)`)
