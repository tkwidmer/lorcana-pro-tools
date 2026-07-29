import { createVersionLoader } from '../versionLoader'

// Metadata only, ordered newest first — entries load lazily via
// loadVersion() so switching documents doesn't pull every version's
// content into the bundle.
export const versionsMeta = [
  { version: "2024-05-21", label: "May 2024", releaseDate: "2024-05-21" },
  { version: "2023-08-22", label: "August 2023", releaseDate: "2023-08-22" },
]

const modules = import.meta.glob(['./*.js', '!./index.js'])
export const loadVersion = createVersionLoader(modules)
