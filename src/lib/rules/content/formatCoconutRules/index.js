// [Format Coconut] Beta Rules — official text, extracted from the published
// PDF. The source has no visible effective date or version number; the
// release date used here is the PDF's file creation date (June 26, 2026),
// the only date signal available. The document has no internal numbering,
// so section ids here are synthetic and sequential. This is the rules-text
// document for the Rules browser — unrelated to (but describing the same
// beta format as) the interactive Coconut Deck Builder tool elsewhere in
// the app (see coconutCards.js / coconutFormat.js).

import { createVersionLoader } from '../versionLoader'

// Metadata only, ordered newest first — entries load lazily via
// loadVersion() so switching documents doesn't pull every version's
// content into the bundle.
export const versionsMeta = [
  { version: "2026-06-26", label: "June 2026", releaseDate: "2026-06-26" },
]

const modules = import.meta.glob(['./*.js', '!./index.js'])
export const loadVersion = createVersionLoader(modules)
