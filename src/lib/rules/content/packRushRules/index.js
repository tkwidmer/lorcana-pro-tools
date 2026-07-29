// Disney Lorcana Pack Rush Rules — official text, extracted from the
// published PDF ("29 August 2024"). The source is a short quick-start
// sheet with no internal numbering, so section ids here are synthetic
// and sequential.

import { createVersionLoader } from '../versionLoader'

// Metadata only, ordered newest first — entries load lazily via
// loadVersion() so switching documents doesn't pull every version's
// content into the bundle.
export const versionsMeta = [
  { version: "2024-08-29", label: "August 2024", releaseDate: "2024-08-29" },
]

const modules = import.meta.glob(['./*.js', '!./index.js'])
export const loadVersion = createVersionLoader(modules)
