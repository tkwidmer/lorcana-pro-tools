# InkbornForge Chrome Extension

One extension, two jobs:

- **Game Scraper** — captures live duels.ink games from spectate pages and hands them to InkbornForge's Game Scraper.
- **inkDecks pull** — one-click JSON export from any inkDecks.com page, running in your own browser.

## Install

1. Download `lorcana-extension.zip` from https://www.inkbornforge.com/extension
2. Extract it to a folder
3. Open `chrome://extensions`
4. Turn on **Developer mode** (top right)
5. Click **Load unpacked** and select the extracted folder
6. Pin the extension to the toolbar

## Game Scraper

Automatic: open a `duels.ink/spectate/*` link and the game is captured, then shown on `/game-scraper`.

- `patch.js` (MAIN world) intercepts the spectate WebSocket
- `relay.js` (ISOLATED world) forwards it to `background.js`
- `background.js` stores games in `chrome.storage.local` (`lorcana_active_games`, 2-hour TTL)
- `bridge.js` posts the stored games to InkbornForge pages

## inkDecks pull

Open any inkDecks page and click the extension. The URL is picked up automatically (or paste one).

- **Fetch all pages** — requests every page itself. Use this for a tournament deck list; it walks the pagination with `sort=id`, then merges, dedupes and coverage-checks the result.
- **Parse this page** — no network. Reads the page you already have open. The fallback when fetching is refused from your network, but it covers one page only.

Then **Download JSON** or **Copy**.

| Link | Result |
|---|---|
| `/lorcana-tournaments/<slug>` | full deck list, paginated, coverage-checked |
| `…/matchups-analysis?group_by=inks` | ink-pair matchup matrix |
| `…/matchups-analysis?group_by=archetypes` | archetype matrix |
| `…/winrates` or `/performance` | mapped to the matchups matrix |
| `/lorcana-metagame/core?metagame_id=NN` | shares, win rate, tier, field conversion |
| `/lorcana-tournaments/core` | tournament index |
| `/cards/autocomplete` | full card database |

Why an extension: inkDecks sends no `Access-Control-Allow-Origin`, so a web page can't read its responses. An extension with `host_permissions` can, and its requests carry your browser's own session.

Pitfalls:

- **`sort=id` is mandatory when paginating.** The default ordering is not id-stable; a page can repeat another page's slice and silently drop decks while the row count looks right. The popup stops and warns if a page yields no new decks.
- **Coverage OK ≠ every player.** It means the published list is complete; events often list fewer decks than players.
- **Archetype names are not unique.** Join on `url`, not `archetype`.

inkDecks' `robots.txt` disallows scraping by competing sites, and its footer permits only brief quotations. Keep volume low, attribute inkDecks, and don't republish their tables wholesale.

## Permissions

- `tabs` — read the active tab's URL
- `storage` — hold captured games
- `scripting` — read the open inkDecks page's DOM for **Parse this page**
- `host_permissions` — duels.ink (capture), inkdecks.com (fetch), inkbornforge.com and localhost (deliver games to the site)

Nothing is sent anywhere except duels.ink, inkDecks and InkbornForge.
