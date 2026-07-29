// Disney Lorcana TCG Tournament Rules — official text, extracted from the
// published PDFs. Versions are ordered newest first.
//
// Source documents:
//   - July 2026: "Effective 07/14/2026"
//   - June 2026: "Effective 06/11/2026"
//   - September 2025: "Last Updated 09/09/2025"
//   - May 2024: "Effective 5/22/2024"
//   - October 2023: "Effective 10/3/2023" — an early version with a
//     different (shorter) chapter structure and mixed-case "Section N:"
//     headers; one body numbering typo (Deck Registration mislabeled 3.4,
//     duplicating Match Procedure) corrected here to 3.6 per the
//     document's own table of contents.

import { createVersionLoader } from '../versionLoader'

// Metadata only, ordered newest first — entries load lazily via
// loadVersion() so switching documents doesn't pull every version's
// content into the bundle.
export const versionsMeta = [
  { version: "2026-07-14", label: "July 2026", releaseDate: "2026-07-14" },
  { version: "2026-06-11", label: "June 2026", releaseDate: "2026-06-11" },
  { version: "2025-09-09", label: "September 2025", releaseDate: "2025-09-09" },
  { version: "2024-05-22", label: "May 2024", releaseDate: "2024-05-22" },
  { version: "2023-10-03", label: "October 2023", releaseDate: "2023-10-03" },
]

const modules = import.meta.glob(['./*.js', '!./index.js'])
export const loadVersion = createVersionLoader(modules)
