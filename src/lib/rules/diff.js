// Version-diff engine for the Rules feature.
//
// Compares two versions of a rules document (arrays of `rule`-type entries
// keyed by their rule id, e.g. "103.1.a") and classifies every rule as
// changed, added, removed, or renumbered.
//
// Renumbering-aware: a rule that only moved to a new id (identical text)
// is reported separately from genuine text changes, so a chapter-wide
// renumber doesn't drown out the rules that actually changed.

import { diffWords } from 'diff'

function normalizeText(text) {
  return (text || '').trim().replace(/\s+/g, ' ')
}

// Section/chapter headers (e.g. "1.1 General") carry a `title` and no
// `text`; numbered rules carry `text` and no `title`. Diff on whichever one
// an entry actually has, so a header that got renamed (or a rule number
// that got reused for unrelated new content) is still detected as changed
// instead of two empty `text` fields silently comparing as equal.
function contentOf(entry) {
  return entry?.text || entry?.title || ''
}

// Below this length, text is too generic ("General", "Ready", "Songs") to
// safely match across ids — several unrelated sections share these short
// titles, so text-only matching risks pairing the wrong ones. Only rely on
// content matching for renumbering once it's long/distinctive enough.
const MIN_RENUMBER_MATCH_LENGTH = 20

export function diffVersions(oldVersion, newVersion) {
  const oldEntries = oldVersion.entries.filter(e => e.type === 'rule')
  const newEntries = newVersion.entries.filter(e => e.type === 'rule')

  const oldById = new Map(oldEntries.map(e => [e.id, e]))
  const newById = new Map(newEntries.map(e => [e.id, e]))

  // Step 1: drop anything that's truly unchanged (same id, same content).
  // Everything left over — including same-id entries whose content differs —
  // goes through matching below.
  const remainingOld = oldEntries.filter(entry => {
    const match = newById.get(entry.id)
    return !(match && normalizeText(contentOf(match)) === normalizeText(contentOf(entry)))
  })
  const remainingNew = newEntries.filter(entry => {
    const match = oldById.get(entry.id)
    return !(match && normalizeText(contentOf(match)) === normalizeText(contentOf(entry)))
  })

  // Step 2: renumbering — match remaining entries by identical content,
  // regardless of id. Same-id pairs are excluded here so a rule number
  // that got reassigned to unrelated new content (id matches, content
  // doesn't) falls through to "changed" instead of being mistaken for a
  // coincidental renumbering.
  const renumbered = []
  const usedOldIds = new Set()
  const usedNewIds = new Set()

  for (const entry of remainingNew) {
    const entryContent = normalizeText(contentOf(entry))
    if (entryContent.length < MIN_RENUMBER_MATCH_LENGTH) continue
    const match = remainingOld.find(
      o => !usedOldIds.has(o.id) && o.id !== entry.id && normalizeText(contentOf(o)) === entryContent
    )
    if (match) {
      usedOldIds.add(match.id)
      usedNewIds.add(entry.id)
      renumbered.push({ oldId: match.id, newId: entry.id, text: entry.text, title: entry.title })
    }
  }

  // Step 3: changed — whatever's left that still shares an id across versions.
  const changed = []
  for (const entry of remainingNew) {
    if (usedNewIds.has(entry.id)) continue
    const prev = remainingOld.find(o => o.id === entry.id && !usedOldIds.has(o.id))
    if (prev) {
      usedOldIds.add(prev.id)
      usedNewIds.add(entry.id)
      changed.push({ id: entry.id, oldText: contentOf(prev), newText: contentOf(entry) })
    }
  }

  // Step 4: whatever's still unmatched is a genuine addition or removal.
  const added = remainingNew.filter(entry => !usedNewIds.has(entry.id))
  const removed = remainingOld.filter(entry => !usedOldIds.has(entry.id))

  return { changed, added, removed, renumbered }
}

export function wordDiff(oldText, newText) {
  return diffWords(oldText || '', newText || '')
}

// Map of rule id -> change info, for annotating the document/chapter view.
export function changesById(diffResult) {
  const map = new Map()
  for (const c of diffResult.changed) map.set(c.id, { kind: 'changed', oldText: c.oldText, newText: c.newText })
  for (const a of diffResult.added) map.set(a.id, { kind: 'added' })
  for (const r of diffResult.renumbered) map.set(r.newId, { kind: 'renumbered', oldId: r.oldId })
  return map
}

export function hasChanges(diffResult) {
  return (
    diffResult.changed.length > 0 ||
    diffResult.added.length > 0 ||
    diffResult.removed.length > 0 ||
    diffResult.renumbered.length > 0
  )
}
