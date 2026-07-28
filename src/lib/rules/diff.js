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

export function diffVersions(oldVersion, newVersion) {
  const oldEntries = oldVersion.entries.filter(e => e.type === 'rule')
  const newEntries = newVersion.entries.filter(e => e.type === 'rule')

  const oldById = new Map(oldEntries.map(e => [e.id, e]))
  const newById = new Map(newEntries.map(e => [e.id, e]))

  // Step 1: drop anything that's truly unchanged (same id, same text).
  // Everything left over — including same-id entries whose text differs —
  // goes through matching below.
  const remainingOld = oldEntries.filter(entry => {
    const match = newById.get(entry.id)
    return !(match && normalizeText(match.text) === normalizeText(entry.text))
  })
  const remainingNew = newEntries.filter(entry => {
    const match = oldById.get(entry.id)
    return !(match && normalizeText(match.text) === normalizeText(entry.text))
  })

  // Step 2: renumbering — match remaining entries by identical text,
  // regardless of id. Same-id pairs are excluded here so a rule number
  // that got reassigned to unrelated new content (id matches, text
  // doesn't) falls through to "changed" instead of being mistaken for a
  // coincidental renumbering.
  const renumbered = []
  const usedOldIds = new Set()
  const usedNewIds = new Set()

  for (const entry of remainingNew) {
    const match = remainingOld.find(
      o => !usedOldIds.has(o.id) && o.id !== entry.id && normalizeText(o.text) === normalizeText(entry.text)
    )
    if (match) {
      usedOldIds.add(match.id)
      usedNewIds.add(entry.id)
      renumbered.push({ oldId: match.id, newId: entry.id, text: entry.text })
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
      changed.push({ id: entry.id, oldText: prev.text, newText: entry.text })
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
