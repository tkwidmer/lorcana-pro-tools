// Disney Lorcana TCG CORE (Core Operations, Rules, and Enforcement) Lore
// Guide Document — official text extracted from the published PDF. This
// document has only top-level numbering (1–5); the sub-headings within
// section 2 have no numbers of their own in the source, so their ids here
// are synthetic and sequential.

import { createVersionLoader } from '../versionLoader'

// Metadata only, ordered newest first — entries load lazily via
// loadVersion() so switching documents doesn't pull every version's
// content into the bundle.
export const versionsMeta = [
  { version: "current", label: "Current", releaseDate: null },
]

const modules = import.meta.glob(['./*.js', '!./index.js'])
export const loadVersion = createVersionLoader(modules)
