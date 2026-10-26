# Weekly meta digest, auto-drafted to the blog

**Status:** approved for implementation. Free; marketing.

## Player problem (and the site's)

Meta Synthesis already writes a plain-English report of the week's duels.ink meta, but only supporters see it, on demand. The blog has one post. A fresh, indexable post every week, emailed through the Substack sync, is the cheapest steady source of new visitors the site can have, and the text already exists.

## Data check

- `src/lib/metaSynthesis.js` is pure: `buildSynthesis(stats, { queueLabel, periodLabel, bandLabel, resolveCardName })` returns `{ blocks, topPlayed, topWinRate, underperformers, ... }` where a block is `{ type: 'text', text }` or `{ type: 'list', intro, items }`; `compareWeeks(thisWeek, lastWeek, { thisLabel, lastLabel })` returns `{ risers, fallers, blocks }`. Its only import is `./archetypeStats` (also pure).
- duels.ink stats come from `https://duels.ink/api/stats/meta?queue=<queue>&period=<period>&era=<era>` with no auth (`api/duels.ts` `handleStats`); the current era key is `meta.eras.currentEra.key` of any response and `meta.availableWeeks` lists the weeks (`period=week:<startDate>`), as `MetaSynthesisPage` and `fetchStats()` in `duelsApi.js` use them.
- Card names: `MetaSynthesisPage` resolves duels.ink card ids through the LorcanaJSON card index; the script does the same from `https://lorcanajson.org/files/current/en/allCards.json`. Copy the page's id-to-card mapping rather than inventing one.
- Blog contract (`docs/agents/content.md`): `content/blog/<slug>.md` with `title`, `date` (`YYYY-MM-DD`), `description`, `author`, `authorUrl` (`https://`), optional `draft: true`; the build throws on a bad file, and a draft is excluded from production but shown in `npm run dev`.
- `src/lib/*.js` imports are extensionless, so plain `node` cannot import them. Load them through Vite's server-side module loader instead: `createServer({ server: { middlewareMode: true } })` then `ssrLoadModule('/src/lib/metaSynthesis.js')`; Vite is already a dependency. No new dependency.

## What the user sees

Every Monday a new draft appears at `content/blog/core-meta-<week start>.md` ("Core meta, <Mon> to <Sun>"), visible in `npm run dev` with the Draft badge. The owner reads it, edits anything that reads wrong, deletes the `draft: true` line, and the next deploy publishes it and the Substack sync picks it up. Nothing is published without that edit.

The post body, from the synthesis blocks, in this order:
1. One paragraph: games and players this week in Core Bo1 (all ranks).
2. Most played: the top five archetypes with meta share and win rate.
3. Winning: top five by win rate above the sample floor; then the underperformers.
4. Moving: `compareWeeks` risers and fallers against the previous week.
5. A closing line linking to `/meta-synthesis` (supporter) and `/winrate-matrix` (free) for the full numbers, and naming the data source (duels.ink).

Lists render as Markdown bullets; text blocks as paragraphs. Archetype names and card names are plain text, no links (the matrix link covers it).

## How it works

- `src/lib/metaDigest.js` (pure, unit-tested): `digestPost({ stats, prevStats, week, prevWeek, resolveCardName })` returns `{ slug, frontmatter, markdown }`; `renderBlocks(blocks)` turns synthesis blocks into Markdown; `digestFrontmatter(week)` builds the fields with `author: InkbornForge`, `authorUrl: https://inkbornforge.substack.com`, `draft: true`, `date` = the Monday the script runs. Test with a small stats fixture: the slug, that every block type renders, that the frontmatter satisfies `parsePost()` (`src/lib/blogPost.js`) when the draft is parsed.
- `scripts/meta-digest.mjs`: fetches the era key and `availableWeeks`, picks the latest **complete** week and the one before, fetches both, fetches LorcanaJSON, calls `digestPost()`, writes the file. Exits 0 without writing when the file exists (a week is never overwritten) or when the latest week has under 1,000 games. Logs the slug it wrote. Runnable locally with `node scripts/meta-digest.mjs`.
- `.github/workflows/meta-digest.yml`: `schedule: '0 14 * * 1'` (Monday 14:00 UTC, after duels.ink's weekly rollover) plus `workflow_dispatch`; `permissions: contents: write`; checkout, setup-node 20, `npm ci`, run the script, then commit `content/blog/` to `main` as `github-actions[bot]` with message `Draft meta digest for <week>` only if the tree changed. A push by `GITHUB_TOKEN` does not trigger the CI workflow, which is fine for a draft; Vercel's own integration still deploys, and a draft changes nothing visible.
- Reuse, not copies: the script must import `buildSynthesis`, `compareWeeks`, `metaShare` and the page's card-name resolution; if the page's resolver is inline in `MetaSynthesisPage.jsx`, lift it into `src/lib/` and have both use it.

## Build order

1. `metaDigest.js` + test.
2. The script; run it locally once and commit the resulting draft as the first post so the PR shows a real one.
3. The workflow.
4. Docs: a "Meta digest" paragraph in `docs/agents/content.md`, the workflow in CLAUDE.md's commands or API section where the other ticks are mentioned, the script in the libs table.

## Risks

- Wrong claims about the meta cost trust: hence draft-only, and the sample floor from `winRateSampleFloor()` on every win-rate list.
- duels.ink's archetype fields are undocumented (`docs/agents/duels-data.md`); the script must exit 0 with a log line, not fail the workflow, when they are missing.
- Two Core queues exist; v1 covers Core Bo1 only. Infinity is a follow-up once the format is worth a weekly post.
