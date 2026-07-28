// Accessors for the Rules feature — wires the document registry, versioned
// content, and diff engine together. Pages should go through these helpers
// rather than importing content files directly.

import { RULES_DOCUMENTS } from './registry'
import { comprehensiveRulesVersions } from './content/comprehensiveRules'
import { tournamentRulesVersions } from './content/tournamentRules'
import { playGuideVersions } from './content/playGuide'
import { diffVersions } from './diff'

const VERSIONS_BY_DOC = {
  'comprehensive-rules': comprehensiveRulesVersions,
  'tournament-rules': tournamentRulesVersions,
  'play-guide': playGuideVersions,
}

export function getDocuments() {
  return RULES_DOCUMENTS
}

export function getDocument(slug) {
  return RULES_DOCUMENTS.find(d => d.slug === slug) || null
}

// Versions are stored newest-first in each content file.
export function getVersions(slug) {
  return VERSIONS_BY_DOC[slug] || []
}

export function getLatestVersion(slug) {
  return getVersions(slug)[0] || null
}

export function getVersion(slug, versionId) {
  const versions = getVersions(slug)
  if (!versionId) return versions[0] || null
  return versions.find(v => v.version === versionId) || versions[0] || null
}

export function getPreviousVersion(slug, versionId) {
  const versions = getVersions(slug)
  const idx = versions.findIndex(v => v.version === versionId)
  if (idx === -1 || idx === versions.length - 1) return null
  return versions[idx + 1]
}

export function getChapters(version) {
  if (!version) return []
  return version.entries.filter(e => e.type === 'chapter')
}

export function getChapterBySlug(version, slug) {
  return getChapters(version).find(c => c.slug === slug) || null
}

export function getChapterEntries(version, chapterId) {
  if (!version) return []
  const startIdx = version.entries.findIndex(e => e.id === chapterId && e.type === 'chapter')
  if (startIdx === -1) return []
  const endIdx = version.entries.findIndex((e, i) => i > startIdx && e.type === 'chapter')
  return version.entries.slice(startIdx, endIdx === -1 ? version.entries.length : endIdx)
}

export function ruleDepth(id) {
  return id.split('.').length - 1
}

// Diff between a version and the one immediately before it. Returns null
// when there's no earlier version to compare against (e.g. the first
// release, or a document with only one version so far).
export function getVersionDiff(slug, versionId) {
  const version = getVersion(slug, versionId)
  if (!version) return null
  const previous = getPreviousVersion(slug, version.version)
  if (!previous) return null
  return diffVersions(previous, version)
}

// Narrow a full-document diff down to the rules belonging to one chapter,
// using the chapter's leading digit (chapter ids are "100", "200", ... so
// every rule under it shares that leading digit).
export function getChapterDiff(diffResult, chapterId) {
  if (!diffResult) return null
  const prefix = chapterId[0]
  const belongs = id => id[0] === prefix
  return {
    changed: diffResult.changed.filter(c => belongs(c.id)),
    added: diffResult.added.filter(a => belongs(a.id)),
    removed: diffResult.removed.filter(r => belongs(r.id)),
    renumbered: diffResult.renumbered.filter(r => belongs(r.newId) || belongs(r.oldId)),
  }
}
