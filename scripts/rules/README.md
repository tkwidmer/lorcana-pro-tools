# Rules content pipeline

Scripts for turning an official Disney Lorcana rules PDF into a version
module under `src/lib/rules/content/<doc>/`. The Rules browser (`/rules`)
reads document metadata from `src/lib/rules/registry.js` and per-document
version lists from `src/lib/rules/content/<doc>/index.js`; see
`src/lib/rules/index.js` for the accessors pages actually call.

Source PDFs aren't committed to the repo (they're Ravensburger's copyrighted
documents) — only the derived text content ships. Because of that, there's
no fully-automated pipeline from PDF to committed file; every version
addition needs the sanity-check and hand-fix step below.

## Adding a new version of an existing document

1. **Extract text.** `pdftotext` (poppler-utils) with `-layout` preserves
   column alignment much better than the default flow mode, which matters
   for parsing:

   ```
   pdftotext -layout SomeRules.pdf some-rules.txt
   ```

2. **Pick a parser** based on the document's house style:
   - `parse-comprehensive-rules.mjs` — atomic numbered rules ("N.N.N. Text
     with real body text"), chapter headers ("N. TITLE"), section headers
     ("N.N Title", label only). Used for Comprehensive Rules.
   - `parse-policy-section.mjs` — "SECTION N: TITLE" chapters with "N.N
     Title" subsections that introduce free-flowing prose paragraphs, not
     atomic rules. Used for Tournament Rules and Play Correction
     Guidelines.

   ```
   node scripts/rules/parse-comprehensive-rules.mjs some-rules.txt
   # or
   node scripts/rules/parse-policy-section.mjs some-rules.txt
   ```

   Writes `some-rules.json` next to the input — an array of
   `{ id, type: 'chapter'|'rule', title?, slug?, text? }` entries.

   For a document too short or irregular to be worth a parser (one-off
   policy sheets with no internal numbering — Pack Rush Rules, Artist
   Policy, CCQ Event Term Sheet, [Format Coconut] Beta Rules, Community
   Code, Diversity & Inclusion Policy) skip straight to hand-writing the
   version module; see "Adding a brand-new document" below.

3. **Sanity-check the JSON before trusting it.** `pdftotext -layout` has
   known failure modes that both parsers can't fully correct for on their
   own — grep the *source .txt*, not just the parsed JSON, since some of
   these only show up as run-on lines:

   - **Mangled multi-column tables.** Genuine tables (Draft pod-size
     guidance, Swiss-round-count guidance, Play Correction Guidelines'
     corrective-action tables) linearize into unreadable run-on text like
     `Players Swiss Rounds Playoff Format 8 3 Single-Elimination...`.
     Reconstruct these by hand as a plain-English sentence — see any
     existing "Recommended pod sizes by player count: ..." entry in
     `content/tournamentRules/` for the pattern. Check regex:
     `Players Swiss Rounds|# of [Pp]layers|minutes\s+\d|Pods\s+\d|\d\s+\d\s+\d\s+\d`
   - **Hyphenation across a line wrap.** `best-of- three` should be
     `best-of-three`. Both parsers already rejoin a same-paragraph
     `word- word` pattern; check regex `\w- \w` in the parsed JSON for
     anything that slipped through (usually because it wrapped across a
     *page* boundary instead of a line, landing in a separate paragraph).
   - **Ligature glyphs.** Some PDFs render `ff`/`fi`/`fl`/`ffi`/`ffl` as a
     single typographic ligature character instead of plain letters
     (`Eﬀective`, `Deﬁnition`). `parse-policy-section.mjs` already expands
     the common ones; check regex `[ﬀﬁﬂﬃﬄ]` for anything new.
   - **Inconsistent bullet glyphs across versions.** Some PDFs use a
     Wingdings private-use-area bullet (U+F0A7) or a black-small-square
     bullet (▪, U+25AA) where another version of the same document uses a
     plain `•`. Left unnormalized, this makes an unchanged list show up as
     "changed" in the diff view purely from the glyph. Both are already
     normalized to `•` in `parse-policy-section.mjs`; if a new glyph shows
     up, add it there.
   - **Numbering typos in the source document itself.** Not a parser bug —
     the PDF's own body text sometimes contradicts its table of contents
     (e.g. Tournament Rules Oct 2023 duplicates section `3.4`). Hand-fix
     the id in the JSON to match the document's own TOC, and note it in
     the comment at the top of the resulting `index.js`.

   After any hand-fix, re-run the artifact regex sweep across *all*
   versions of that document, not just the new one — several of the above
   were found retroactively in already-shipped versions this way.

4. **Write the version module:**

   ```
   node scripts/rules/write-version-module.mjs some-rules.json \
     src/lib/rules/content/<doc>/<version-id>.js \
     --version 2026-07-09 --label "July 2026 (v2.2.0)" --releaseDate 2026-07-09
   ```

   `<version-id>` is conventionally the release date (`YYYY-MM-DD`). When
   two versions share a printed effective date (an errata point-release,
   for example), disambiguate with the source PDF's file creation date
   (`pdfinfo the.pdf`) instead of inventing a suffix — see the Comprehensive
   Rules v2.0.0/v2.0.1 pair for a worked example, documented in that
   document's `index.js` header comment.

5. **Add the version to that document's `index.js`.** Insert
   `{ version, label, releaseDate }` into the `versionsMeta` array in
   `src/lib/rules/content/<doc>/index.js`, newest first — this step is
   manual; getting the chronological position right (especially for
   restructures or errata that don't sort cleanly by date alone) needs a
   human judgment call. The `import.meta.glob` loader in that file picks
   up the new version file automatically; nothing else needs updating.

6. **Verify before shipping:**
   - `npm run lint && npm test && npm run build`
   - Load `/rules/<doc-slug>` in a browser, switch to the new version in
     the dropdown, and check `/rules/<doc-slug>/changes?v=<new-version-id>`
     — read every "changed" entry, not just the counts, to catch a parser
     artifact masquerading as a real wording change (this is how both
     known parser bugs — bullet-glyph false positives and a mid-word
     paragraph break — were actually found).
   - Check for console errors while navigating.

## Adding a brand-new document

1. Add an entry to `src/lib/rules/registry.js` (`slug`, `name`, `tagline`).
2. Create `src/lib/rules/content/<doc>/` with one version file per the
   steps above, plus an `index.js` following this shape (copy an existing
   one, e.g. `content/packRushRules/index.js`, for a document with a
   single version):

   ```js
   import { createVersionLoader } from '../versionLoader'

   export const versionsMeta = [
     { version: '2024-08-29', label: 'August 2024', releaseDate: '2024-08-29' },
   ]

   const modules = import.meta.glob(['./*.js', '!./index.js'])
   export const loadVersion = createVersionLoader(modules)
   ```

3. Wire it into `VERSIONS_BY_DOC`... actually `DOC_MODULES` in
   `src/lib/rules/index.js`: add the import and a `'<doc-slug>': <module>`
   entry.
4. Verify per step 6 above.

## Why per-version files instead of one file per document

Each document's versions live in their own file
(`content/<doc>/<version-id>.js`) rather than one big array, and are
loaded lazily via `import.meta.glob` (see `content/versionLoader.js`) —
Vite code-splits each version into its own chunk, so visiting one document
only downloads the versions you actually view instead of every version of
every document up front. `src/lib/rules/index.js`'s `getVersions()` stays
synchronous (it only needs cheap metadata for dropdowns); `loadVersion()`
and `loadVersionDiff()` are async and memoized per session.
