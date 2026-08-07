---
name: chrome-extension-mv3
description: Load this before reading, modifying, or debugging anything in chrome-extension/ (manifest.json, patch.js, relay.js, background.js, bridge.js, popup.html/css) or GameScraperPage.jsx's message-listening side. Covers both the official Manifest V3 API docs and this repo's specific 4-script message-relay chain, which is easy to break silently by editing the wrong script or the wrong JS "world".
---

# Chrome Extension (Manifest V3)

`/chrome-extension/` is a separate artifact from the main React app — no
shared source, built by `build-extension.js` into
`/public/lorcana-extension.zip`. It has a real external spec (Chrome's MV3
docs) plus repo-specific data-flow tribal knowledge that isn't written down
anywhere except CLAUDE.md and the code itself.

## When to use

Before touching:
- `chrome-extension/manifest.json` — permissions, host_permissions, content
  script `matches`/`run_at`/`world` declarations
- `chrome-extension/patch.js` — MAIN-world `WebSocket.prototype` patch,
  `document_start`
- `chrome-extension/relay.js` — ISOLATED-world `postMessage` bridge
- `chrome-extension/background.js` — MV3 service worker, `chrome.storage.local`
- `chrome-extension/bridge.js` — injected into lorcana-pro-tools pages, polls
  storage and posts to the page
- `src/pages/GameScraperPage.jsx`'s message-listening side (the consumer of
  what `bridge.js` posts)
- `chrome-extension/README.md` (repo-specific setup/load-unpacked notes)

## Official MV3 reference (fetch when the detail isn't repo-specific)

- `https://developer.chrome.com/docs/extensions/mv3/intro/` — MV3 overview,
  what changed from MV2 (relevant since a service worker has no persistent
  background page — it can be killed and restarted at any time)
- `https://developer.chrome.com/docs/extensions/reference/manifest` —
  manifest key reference (`content_scripts`, `host_permissions`, `world`,
  `run_at`)
- `https://developer.chrome.com/docs/extensions/develop/concepts/service-workers`
  — service worker lifecycle specifics relevant to `background.js` (no
  persistent state between wake-ups except what's explicitly persisted, e.g.
  to `chrome.storage.local`)
- `https://developer.chrome.com/docs/extensions/reference/api/storage` —
  `chrome.storage.local` API used to hold `lorcana_active_games`

## This repo's message chain — read before editing any single script

The 5-step flow (from CLAUDE.md) when spectating a duels.ink game:

1. User visits `duels.ink/spectate/{uuid}`
2. `patch.js` (**MAIN world**, `document_start`) patches
   `WebSocket.prototype` to intercept all game messages. MAIN world means it
   runs in the page's own JS context — necessary to patch a prototype the
   page itself will use, but it means `patch.js` **cannot** use
   `chrome.*` APIs directly (those are isolated-world/extension-only).
3. `relay.js` (**ISOLATED world**, same `document_start` timing) receives
   `postMessage` from `patch.js` and forwards it into the extension's
   message-passing system, to `background.js`. This is the bridge between
   "has access to the patched WebSocket data" and "has access to
   `chrome.*` APIs" — the split exists *because* MAIN and ISOLATED worlds
   can't call each other's APIs directly, only `postMessage`.
4. `background.js` (service worker) stores game state in
   `chrome.storage.local` under `lorcana_active_games`, keyed by UUID;
   prunes entries older than 2 hours. Being a service worker, it can be
   killed and restarted between messages — don't assume in-memory state
   here survives across events; persisted state must go through
   `chrome.storage.local`.
5. `bridge.js` (injected only on lorcana-pro-tools pages per
   `host_permissions`/`matches`, `document_idle`) polls
   `chrome.storage.local` and `postMessage`s a `lorcana_active_games`
   message to the page.
6. `GameScraperPage` listens for that `postMessage` and renders the live
   game state.

Extra behavior to know: the extension **merges** incoming `spectator_update`
payloads — any field that has ever appeared in a game's `meta` is retained
across updates, not overwritten by a payload that omits it. A change that
naively replaces `meta` instead of merging will silently drop previously-seen
fields.

## Steps

1. Identify which of the 4 scripts (plus manifest) the task touches, and
   which JS "world" it runs in — that determines what APIs are even
   reachable from it.
2. If the change is about a manifest capability (new host, new API,
   permission), fetch the matching MV3 reference page above rather than
   assuming MV2-era behavior.
3. If the change is about the data flow itself (new message type, new
   stored field), trace it through all 5 steps above — a field added in
   `patch.js` needs to survive the `postMessage` → `relay.js` →
   `background.js` storage → `bridge.js` → page `postMessage` chain intact,
   including the merge behavior in step 4.
4. Test by loading the unpacked extension (see `chrome-extension/README.md`)
   against a real or recorded `duels.ink/spectate/*` page — this data flow
   is not covered by the Vitest unit suite.
