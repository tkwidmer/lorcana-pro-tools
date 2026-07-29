// Disney Lorcana Community Code — official text, extracted from the
// published PDF ("Effective May 10, 2023"). The source document has no
// internal numbering (just plain headings), so section ids here are
// synthetic and sequential.

import { createVersionLoader } from '../versionLoader'

// Metadata only, ordered newest first — entries load lazily via
// loadVersion() so switching documents doesn't pull every version's
// content into the bundle.
export const versionsMeta = [
  { version: "2023-05-10", label: "May 2023", releaseDate: "2023-05-10" },
]

const modules = import.meta.glob(['./*.js', '!./index.js'])
export const loadVersion = createVersionLoader(modules)
