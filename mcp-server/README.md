# duels.ink MCP server

A local (stdio) [MCP](https://modelcontextprotocol.io) server that lets Claude, or any MCP client, read your own duels.ink games with your personal API token. The token stays on your machine: the server talks to `https://duels.ink` directly, not through InkbornForge.

## Tools

| Tool | What it returns |
|---|---|
| `whoami` | The account behind the token |
| `get_match_history` | Your finished games, newest first, with filters (`from`, `to`, `source`, `queue`) and `next_cursor` paging |
| `get_game` | One game parsed from its gamelog by `src/lib/parseGamelog.js`: turns, plays, challenges, lore curve, mulligans, per-card stats, the opponent's inferred decklist |
| `list_my_decks`, `get_deck` | Your saved decks; one deck's card list |
| `get_meta_stats` | Community ink-pair win rates and matchups (the documented fields of `/api/stats/meta`) |

## Setup

1. Mint a token: https://duels.ink/account → API Tokens.
2. Install dependencies (it imports the parser from this repo, so run it from a checkout):

```bash
cd mcp-server && npm install
```

3. Register it with your client.

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
