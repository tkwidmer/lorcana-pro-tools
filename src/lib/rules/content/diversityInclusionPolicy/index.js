// Disney Lorcana TCG Organized Play Diversity & Inclusion Policy — official
// text, extracted from the published PDF ("Effective Aug 17, 2023"). The
// source document has no internal numbering (just plain headings), so
// section ids here are synthetic and sequential.

import { createVersionLoader } from '../versionLoader'

// Metadata only, ordered newest first — entries load lazily via
// loadVersion() so switching documents doesn't pull every version's
// content into the bundle.
export const versionsMeta = [
  { version: "2023-08-17", label: "August 2023", releaseDate: "2023-08-17" },
]

const modules = import.meta.glob(['./*.js', '!./index.js'])
export const loadVersion = createVersionLoader(modules)
