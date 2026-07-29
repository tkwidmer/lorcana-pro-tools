// Disney Lorcana TCG Artist Policy — official text, extracted from the
// published PDF. The source has no visible effective date or version
// number; the release date used here is the PDF's file creation date
// (January 15, 2026), the only date signal available. The document has
// no internal numbering, so section ids here are synthetic and sequential.

import { createVersionLoader } from '../versionLoader'

// Metadata only, ordered newest first — entries load lazily via
// loadVersion() so switching documents doesn't pull every version's
// content into the bundle.
export const versionsMeta = [
  { version: "2026-01-15", label: "January 2026", releaseDate: "2026-01-15" },
]

const modules = import.meta.glob(['./*.js', '!./index.js'])
export const loadVersion = createVersionLoader(modules)
