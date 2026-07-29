// Shared lazy-loader for per-version content modules. Each document's
// content/<doc>/index.js calls `import.meta.glob` itself — Vite requires
// that call to be written literally in the importing file to statically
// discover the modules — and hands the resulting map of loader functions
// to this helper, which turns it into a `loadVersion(versionId)` function.
export function createVersionLoader(modules) {
  return function loadVersion(versionId) {
    const loader = modules[`./${versionId}.js`]
    if (!loader) return Promise.resolve(null)
    return loader().then(m => m.default)
  }
}
