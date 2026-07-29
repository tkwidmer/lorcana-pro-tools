// Accessors for the Rules feature — wires the document registry, versioned
// content, and diff engine together. Pages should go through these helpers
// rather than importing content files directly.
//
// Version *metadata* (id/label/releaseDate) is available synchronously for
// every document — it's cheap, and things like the version dropdown need
// the full list up front. The *entries* for a given version are loaded
// lazily (loadVersion / loadVersionDiff return Promises) so visiting one
// document doesn't pull every other document's — or every other version's
// — content into the bundle. See content/<doc>/index.js for the per-doc
// lazy loader and content/versionLoader.js for the shared mechanism.

import { RULES_DOCUMENTS } from './registry'
import * as comprehensiveRules from './content/comprehensiveRules'
import * as tournamentRules from './content/tournamentRules'
import * as playGuide from './content/playGuide'
import * as coreLoreGuide from './content/coreLoreGuide'
import * as communityCode from './content/communityCode'
import * as diversityInclusionPolicy from './content/diversityInclusionPolicy'
import * as packRushRules from './content/packRushRules'
import * as artistPolicy from './content/artistPolicy'
import * as ccqEventTermSheet from './content/ccqEventTermSheet'
import * as formatCoconutRules from './content/formatCoconutRules'
import { diffVersions } from './diff'

const DOC_MODULES = {
  'comprehensive-rules': comprehensiveRules,
  'tournament-rules': tournamentRules,
  'play-guide': playGuide,
  'core-lore-guide': coreLoreGuide,
  'community-code': communityCode,
  'diversity-inclusion-policy': diversityInclusionPolicy,
  'pack-rush-rules': packRushRules,
  'artist-policy': artistPolicy,
  'ccq-event-term-sheet': ccqEventTermSheet,
  'format-coconut-rules': formatCoconutRules,
}

export function getDocuments() {
  return RULES_DOCUMENTS
}

export function getDocument(slug) {
  return RULES_DOCUMENTS.find(d => d.slug === slug) || null
}

// Metadata only ({ version, label, releaseDate }), newest first. Cheap —
// safe to call from render.
export function getVersions(slug) {
  return DOC_MODULES[slug]?.versionsMeta || []
}

export function getLatestVersionMeta(slug) {
  return getVersions(slug)[0] || null
}

export function getVersionMeta(slug, versionId) {
  const versions = getVersions(slug)
  if (!versionId) return versions[0] || null
  return versions.find(v => v.version === versionId) || versions[0] || null
}

export function getPreviousVersionMeta(slug, versionId) {
  const versions = getVersions(slug)
  const idx = versions.findIndex(v => v.version === versionId)
  if (idx === -1 || idx === versions.length - 1) return null
  return versions[idx + 1]
}

// Full version object (with entries) — async. Memoized so re-visiting a
// version already loaded this session (switching chapters, toggling
// inline changes, coming back from the diff page) doesn't re-fetch it.
const versionCache = new Map()

export function loadVersion(slug, versionId) {
  const meta = getVersionMeta(slug, versionId)
  if (!meta) return Promise.resolve(null)
  const key = `${slug}:${meta.version}`
  if (!versionCache.has(key)) {
    versionCache.set(key, DOC_MODULES[slug].loadVersion(meta.version))
  }
  return versionCache.get(key)
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

// Diff between a version and the one immediately before it — async, since
// it needs both versions' entries loaded. Resolves null when there's no
// earlier version to compare against (e.g. the first release, or a
// document with only one version so far).
export async function loadVersionDiff(slug, versionId) {
  const meta = getVersionMeta(slug, versionId)
  if (!meta) return null
  const previousMeta = getPreviousVersionMeta(slug, meta.version)
  if (!previousMeta) return null
  const [version, previous] = await Promise.all([
    loadVersion(slug, meta.version),
    loadVersion(slug, previousMeta.version),
  ])
  return diffVersions(previous, version)
}

// Narrow a full-document diff down to the rules belonging to one chapter.
// A rule "belongs" to a chapter if its id is the chapter id itself or
// starts with "<chapterId>." — matched on the full id, not just a leading
// digit, so chapter "1" and chapter "10" (which share a leading "1") don't
// bleed into each other.
export function getChapterDiff(diffResult, chapterId) {
  if (!diffResult) return null
  const belongs = id => id === chapterId || id.startsWith(`${chapterId}.`)
  return {
    changed: diffResult.changed.filter(c => belongs(c.id)),
    added: diffResult.added.filter(a => belongs(a.id)),
    removed: diffResult.removed.filter(r => belongs(r.id)),
    renumbered: diffResult.renumbered.filter(r => belongs(r.newId) || belongs(r.oldId)),
  }
}
