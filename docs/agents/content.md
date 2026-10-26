# Static content: blog and rules browser

Read before touching `content/blog/`, `blogPlugin.js`, `src/lib/blog*.js`, or `src/lib/rules/`. The `new-blog-post` skill scaffolds a post.

## Blog

Posts are markdown files in `content/blog/<slug>.md` — the filename is the URL slug (`/blog/<slug>`, lowercase-hyphenated), and each needs a frontmatter block:

```
---
title: My post
date: 2026-09-23
description: One sentence — used on the index, as the meta description, and on social cards.
author: Jane Doe
authorUrl: https://x.com/janedoe
---
```

Posts can be guest-written, so every post names its own `author` and links `authorUrl` (their X/Twitter, Metafy, or other profile; must be `https://`). The byline (`components/PostByline.jsx` client-side, mirrored in `blogPlugin.js`'s static HTML) links it with `rel="author"`, and the post's `BlogPosting` JSON-LD carries it as a `Person`.

Adding a file is all it takes to publish; there's no registry to update. An optional `draft: true` line keeps a post out of production builds (no static page, no sitemap entry, and it compiles to `null` so its content never reaches the bundle) while still showing it in `npm run dev` with a Draft badge; delete the line to publish. The `new-blog-post` skill (`.claude/skills/new-blog-post/`) scaffolds a draft with today's date and InkbornForge as the default author. `parsePost()` (`src/lib/blogPost.js`) throws on a missing field, a non-`YYYY-MM-DD` date, a non-`https://` `authorUrl`, or a non-slug filename, which fails the build rather than shipping a broken post. Links to other pages on the site should be root-relative (`[Tournament Lookup](/tournament-lookup)`).

`blogPlugin.js` (a Vite plugin registered in `vite.config.js`) does the work:
- **Compile at build time.** It transforms each `content/blog/*.md` import into a JS module exporting the parsed post, so `src/lib/blog.js`'s `import.meta.glob` gets plain HTML strings and `marked` never ships to the browser.
- **Static HTML for SEO.** After `vite build`, it writes `dist/blog/index.html` and `dist/blog/<slug>/index.html` from the built `index.html` shell, with per-post `<title>`, description, canonical, Open Graph/Twitter tags, `BlogPosting` JSON-LD, and the post body inside `#root` — then appends the blog URLs to `dist/sitemap.xml`. The client render replaces `#root` on load, same as a prerendered page. `vercel.json` rewrites `/blog` and `/blog/:slug` to those files explicitly (ahead of the SPA catch-all), since serving a directory's `index.html` for a path without a trailing slash isn't something to rely on (vite preview, for one, doesn't).
- This is independent of `prerender.js` on purpose: that step needs Chromium, and production evidence (every route, including `/proxy/index.html`, returns the identical bare shell) shows it currently emits nothing on Vercel.

Client-side, `routeTitle()`/`routeDescription()` resolve a `/blog/<slug>` path to its post's title/description so in-app navigation updates the tab title too. Post bodies are styled by the `.blog-prose` rules in `src/index.css`, which use palette variables so dark mode works without `dark:` variants.

## Rules Browser

`/rules` renders official documents (Comprehensive Rules, Tournament Rules, Play Correction Guidelines, CORE Lore Guide, Community Code, Pack Rush, [Format Coconut] Beta Rules, CCQ Event Term Sheet, Artist Policy, Diversity & Inclusion Policy) from static content in `src/lib/rules/content/<doc>/<version>.js`. Each version is a flat `entries` array of `{ id, type: 'chapter' | 'rule', title?, text? }`, with dotted `id`s (`1.1.3`) giving the hierarchy (`ruleDepth()`).

- To add a document, register it in `registry.js` and wire its versions into `index.js`. To add a version, drop a new dated file into that document's `content/` folder.
- Version *metadata* is synchronous. Entries load lazily (`loadVersion()`/`loadVersionDiff()` via `content/versionLoader.js` + each document's `import.meta.glob`), so one document doesn't pull every version into the bundle. Pages should go through `index.js`, never import content files directly.
- `diff.js` (`changesById`, `wordDiff`) compares a version against its predecessor. That powers the inline highlighting on `RulesDocumentPage` and the full diff on `RulesChangesPage`.

