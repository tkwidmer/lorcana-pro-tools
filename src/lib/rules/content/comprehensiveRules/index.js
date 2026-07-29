// Disney Lorcana Comprehensive Rules — official rules text, extracted from
// the published PDFs. Versions are ordered newest first.
//
// Source documents:
//   - July 2026 (v2.2.0): "Version 2.2.0, Effective July 9, 2026" — a full
//     restructure (new chapter/section numbering) vs earlier versions
//   - April 2026 (v2.1.0): "Version 2.1.0, Effective April 30, 2026"
//   - February 2026 (v2.0.1): "Version 2.0.1, Effective February 5, 2026" —
//     an errata pass on v2.0.0 (cross-reference fixes, a "Beginning Phase"
//     → "Start-of-Turn Phase" rename, and minor wording clarifications);
//     both v2.0.0 and v2.0.1 carry the same printed effective date, so the
//     version id here uses the PDF's file creation date (Feb 10) instead
//   - February 2026 (v2.0.0): "Version 2.0.0, Effective February 5, 2026" —
//     the restructure (new 10-chapter numbering) that v2.1.0/v2.2.0 build on
//   - October 2025: "Effective October 31, 2025" — renamed chapter 5 from
//     "Cards" to "Conditions" and added two new keywords (Alert, Boost)
//   - August 2025: "Effective August 22, 2025"
//   - May 2025: "Effective May 27, 2025"
//   - February 2025: "Effective February 28, 2025"
//   - August 2024: "Effective August 9, 2024"
//   - May 2024: "Effective May 20, 2024"
//   - April 2024: "Effective April 13, 2024"
//   - March 2024: "Effective March 27, 2024"
//
// Only the numbered rules chapters (1–10 / 1–9 depending on version) are
// included; the Glossary and Update Summary appendices are not.

import { createVersionLoader } from '../versionLoader'

// Metadata only, ordered newest first — entries load lazily via
// loadVersion() so switching documents doesn't pull every version's
// content into the bundle.
export const versionsMeta = [
  { version: "2026-07-09", label: "July 2026 (v2.2.0)", releaseDate: "2026-07-09" },
  { version: "2026-04-30", label: "April 2026 (v2.1.0)", releaseDate: "2026-04-30" },
  { version: "2026-02-10", label: "February 2026 (v2.0.1)", releaseDate: "2026-02-10" },
  { version: "2026-02-05", label: "February 2026 (v2.0.0)", releaseDate: "2026-02-05" },
  { version: "2025-10-31", label: "October 2025", releaseDate: "2025-10-31" },
  { version: "2025-08-22", label: "August 2025", releaseDate: "2025-08-22" },
  { version: "2025-05-27", label: "May 2025", releaseDate: "2025-05-27" },
  { version: "2025-02-28", label: "February 2025", releaseDate: "2025-02-28" },
  { version: "2024-08-09", label: "August 2024", releaseDate: "2024-08-09" },
  { version: "2024-05-20", label: "May 2024", releaseDate: "2024-05-20" },
  { version: "2024-04-13", label: "April 2024", releaseDate: "2024-04-13" },
  { version: "2024-03-27", label: "March 2024", releaseDate: "2024-03-27" },
]

const modules = import.meta.glob(['./*.js', '!./index.js'])
export const loadVersion = createVersionLoader(modules)
