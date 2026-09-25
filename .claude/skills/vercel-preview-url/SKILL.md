---
name: vercel-preview-url
description: Load this whenever you create or update a pull request in this repo and need its Vercel preview link for the PR description. The URL can't be derived from the branch name — Vercel truncates it and appends a hash — so it must be read from the vercel[bot] comment on the PR. Use it for every "Include Vercel preview link" step in CLAUDE.md.
---

# Vercel Preview URL

**Never construct the preview URL.** Read it from Vercel.

## Why guessing fails

The branch alias is `lorcana-pro-tools-git-<branch>-tkwidmers-projects.vercel.app`.
With `claude/<adjective>-<name>-<suffix>` branches it's always longer than the
63-character DNS label limit, so Vercel truncates the branch part and appends
a 6-hex hash:

| Branch | Preview host |
|---|---|
| `claude/bold-curie-bnvptq` | `lorcana-pro-tools-git-claude-bold-cur-517696-tkwidmers-projects.vercel.app` |
| `claude/jolly-brown-0kf3gx` | `lorcana-pro-tools-git-claude-jolly-br-837c2b-tkwidmers-projects.vercel.app` |
| `claude/festive-ptolemy-x5zce9` | `lorcana-pro-tools-git-claude-festive-669a91-tkwidmers-projects.vercel.app` |

The hash isn't reproducible from the branch name (sha256/sha1/md5 of the
obvious inputs don't match), and `https://<branch>.<project>.vercel.app` —
the pattern CLAUDE.md used to give — never resolves.

## Steps

1. **Push, then create the PR without a preview line.** Don't write a
   placeholder or guessed URL.
2. **Read the vercel[bot] comment.** It posts within seconds of the PR being
   opened (and arrives as an `issue_comment.created` event if you're
   subscribed). Fetch the PR's comments (`pull_request_read`,
   `method: get_comments`) and take the comment whose author is `vercel[bot]`.
   The URL is the `[Preview](https://…)` link in its table. The same host
   is also `previewUrl` in the base64 JSON after `[vc]: #…:` on its first line.
   If the comment isn't there yet, wait for its event rather than guessing.
3. **Update the PR body** (`update_pull_request`) with
   `https://<that host>` plus the route the change touches
   (e.g. `/winrate-matrix`), so reviewers land on the right page.

The host is stable for the life of the branch: later pushes redeploy to the
same alias, so this is needed once per PR. A second PR from the same branch
reuses the same host.
