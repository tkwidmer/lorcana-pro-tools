# duels.ink MCP server

A local (stdio) [MCP](https://modelcontextprotocol.io) server that lets Claude, or any MCP client, read your own duels.ink games with your personal API token, and look up cards in [LorcanaJSON](https://lorcanajson.org). The token stays on your machine: the server talks to `https://duels.ink` and `https://lorcanajson.org` directly, not through InkbornForge.

## Tools

| Tool | What it returns |
|---|---|
| `whoami` | The account behind the token |
| `get_match_history` | Your finished games, newest first, with filters (`from`, `to`, `source`, `queue`) and `next_cursor` paging |
| `get_game` | One game parsed from its gamelog by `src/lib/parseGamelog.js`: turns, plays, challenges, lore curve, mulligans, per-card stats for both players (the opponent's only covers cards they revealed: the log is your perspective), and `inferredOppDecklist`, a minimum copy count per revealed opponent card |
| `get_replay` | Any game from its public replay link (`duels.ink/replay/<id>`), a teammate's included: the same parse as `get_game` from the saving player's perspective, plus both player names, the ink pairs and that player's full decklist. Replays are public, so this one needs no token |
| `list_my_decks`, `get_deck` | Your saved decks; one deck's card list |
| `get_meta_stats` | Community ink-pair win rates and matchups (the documented fields of `/api/stats/meta`) |
| `get_cards` | LorcanaJSON details for duels.ink card ids (`14-222`, promo `12-P3-51`): cost, inkwell, stats, rules text, Core/Infinity legality, and every id that prints the same card |
| `search_cards` | The LorcanaJSON card pool filtered by deck inks, format, type, subtype, cost, inkwell, willpower, lore and rules text; one row per card name |

The card tools fetch `allCards.json` once per server process (about 10 MB) and filter it with `src/lib/cardSearch.js`.

## Setup

1. Mint a token: https://duels.ink/account → API Tokens.
2. Install dependencies (it imports the parser from this repo, so run it from a checkout):

```bash
cd mcp-server && npm install
```

3. Register it with your client. Inside this repo, `.mcp.json` already registers it for Claude Code (local and cloud sessions) with `DUELS_TOKEN` from the environment; in a cloud environment, add `cd mcp-server && npm install` to its setup script. Elsewhere:

Claude Code:

```bash
claude mcp add duels-ink -e DUELS_TOKEN=<your-token> -- node /absolute/path/to/lorcana-pro-tools/mcp-server/index.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "duels-ink": {
      "command": "node",
      "args": ["/absolute/path/to/lorcana-pro-tools/mcp-server/index.js"],
      "env": { "DUELS_TOKEN": "<your-token>" }
    }
  }
}
```

The server exits at startup if `DUELS_TOKEN` is not set. duels.ink errors (401 bad token, 429 with its `Retry-After`) come back as tool errors. API reference: https://duels.ink/api-docs.md
