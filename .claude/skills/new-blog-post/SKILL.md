---
name: new-blog-post
description: Start a new InkbornForge blog post — creates content/blog/<slug>.md with today's date, InkbornForge as the default author, and `draft: true` so it won't publish yet, then helps the user write it. Use when the user says "new blog post", "start a post", "draft an article", "write a guest post", or similar. Also covers previewing a draft and publishing it (removing the draft flag).
---

# New blog post

Blog posts are markdown files in `content/blog/`. Read CLAUDE.md's "Blog"
section if you haven't this session — it covers the frontmatter rules and how
posts are built. The short version: the build fails on a missing field, a bad
date, a non-`https://` `authorUrl`, or a non-slug filename, and a post with
`draft: true` shows up in `npm run dev` but is left out of production builds
entirely.

## 1. Gather the basics

- **Title** — from the user's request, or ask for it. It's the only thing you
  need before creating the file.
- **Author** — default to InkbornForge (below). If the user says it's a guest
  post, ask for the author's name and a profile link (X/Twitter, Metafy, or
  similar). The link must be `https://`; add the scheme if they give a bare
  `x.com/handle`.
- **Description** — one sentence, shown on the blog index, as the meta
  description, and on social cards. If the user doesn't give one, write a
  plausible one from the title and tell them it's a placeholder to revisit.

## 2. Create the file

- **Slug** — lowercase the title, replace every run of non-alphanumeric
  characters with `-`, trim leading/trailing `-`. It becomes the URL
  (`/blog/<slug>`), so keep it short: drop filler words if it's long.
- **Check for a collision** — if `content/blog/<slug>.md` already exists,
  stop and ask the user for a different title or slug. Never overwrite a post.
- **Date** — today, from `date +%F`. (It's updated to the publish date in step 4.)

Write `content/blog/<slug>.md`:

```markdown
---
title: <Title>
date: <YYYY-MM-DD>
description: <One sentence.>
author: InkbornForge
authorUrl: https://inkbornforge.substack.com
draft: true
---

<!-- Write the post here. -->
```

For a guest post, swap in their `author` and `authorUrl`.

Frontmatter values are plain text after the first `: ` — no quotes needed,
and colons later in the line are fine (`title: Set 9: First Impressions`).

## 3. Write it with the user

Tell the user the file path and that it's a draft, then help them write:
take what they dictate or paste, and draft, expand, or edit sections into the
file on request. Replace the `<!-- Write the post here. -->` placeholder once
there's real content. Keep their voice — edit, don't rewrite, unless asked.

Markdown notes for the body:
- Start sections at `##` — the page already renders the title as the `<h1>`.
- Link to site tools root-relatively: `[Tournament Lookup](/tournament-lookup)`.
- Images go in `public/blog/<slug>/` and are referenced as
  `/blog/<slug>/<file>`.

**Previewing:** `npm run dev`, then open `/blog/<slug>` (the draft is also
listed on `/blog` with a Draft badge). For the Claude Code web app, follow
CLAUDE.md's "Screenshots & Manual Verification" section and screenshot the
local dev server.

## 4. Publish

Only when the user says it's ready:

1. Delete the `draft: true` line.
2. Set `date` to today (`date +%F`) — the publish date, not the day the draft
   was started.
3. Check that the description is still accurate and no placeholder text is left.
4. Run `npm test` and `npx vite build`. Both fail loudly on a malformed post,
   and the build's `blog: wrote N post page(s)` log line should now count
   this one (drafts aren't counted).
5. Commit and open a PR like any other change. It goes live when the PR merges.

A draft can also be committed and merged while still in progress — it stays
invisible in production until the `draft: true` line is removed.
