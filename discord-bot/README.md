# Lorcana Pro Tools Discord Bot

A small standalone Discord bot for the Lorcana Pro Tools community server.
It currently provides two commands:

- **Apps → Decode Deck QR** (message context menu) — reads the QR code
  embedded in a duels.ink deck list image and replies with the decoded
  `duels.ink` URL, so anyone in the channel can jump straight to the deck
  instead of retyping it.
- **`/tournament`** (slash command) — looks up a live Ravensburger tournament
  by event URL. Without a `player` option it posts a summary embed (round,
  cut size, top standings); with `player:<name>` it looks up that
  competitor's rank, record, and whether it's safe to intentional draw.

This is a separate Node.js project from the main Vite app in this repo (like
`chrome-extension/`) and runs as its own always-on process — it is **not**
deployed to Vercel.

## How it works

**Decode Deck QR:**
1. A user posts a deck list image (the one with the QR code in the corner)
   in a channel.
2. Anyone right-clicks (or long-presses on mobile) that message, opens
   **Apps**, and picks **Decode Deck QR**.
3. The bot downloads the image attachment(s) on that message, decodes the QR
   code with [`jsqr`](https://www.npmjs.com/package/jsqr) (pixels extracted
   via `sharp`), and replies in the channel with the decoded URL.

No message content is read or stored — the bot only ever looks at the
attachments on the specific message a user invokes the command on.

**`/tournament url:<event url> [player:<name>]`:**
1. The bot extracts the event ID from the URL and calls the public
   Ravensburger tournament API directly (`src/tournamentApi.js` — a
   standalone port of `src/lib/tournamentApi.js` from the main app, since
   this process isn't behind the app's `/api/tournament` Vercel proxy).
2. It resolves the current round, fetches full standings, and either posts a
   tournament summary or — if `player` is given — that player's rank,
   record, and ID (intentional draw) recommendation, matching the logic in
   `TournamentLookupPage`.

## Setup

### 1. Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   and create a new application.
2. Under **Bot**, add a bot user and copy the token — this is `DISCORD_TOKEN`.
3. Under **General Information**, copy the **Application ID** — this is
   `DISCORD_CLIENT_ID`.
4. Under **OAuth2 → URL Generator**, check the `bot` and `applications.commands`
   scopes. Under bot permissions, `Send Messages` and `Read Message History`
   are enough. Use the generated URL to invite the bot to your server.

### 2. Configure environment

```bash
cd discord-bot
cp .env.example .env
# fill in DISCORD_TOKEN and DISCORD_CLIENT_ID
# optionally set DISCORD_GUILD_ID to a test server's ID while developing —
# guild-scoped commands show up instantly, global ones can take up to an hour
```

### 3. Install and register the command

```bash
npm install
npm run register
```

Re-run `npm run register` any time the command definition changes.

### 4. Run the bot

```bash
npm start
```

The bot needs to stay running to receive interactions (it uses the Discord
gateway, not a public webhook). For always-on hosting, run it under a process
manager or a small always-on host, e.g.:

- `pm2 start src/index.js --name lorcana-qr-bot`
- a systemd service
- a Railway/Fly.io/Render worker process

## Notes

- Large deck images are downscaled before scanning (see `MAX_DIMENSION` in
  `src/qrDecode.js`) to keep decoding fast; this doesn't affect the QR code's
  readability in practice.
- If a message has multiple image attachments, each is scanned independently
  and every successfully decoded result is included in the reply.
- `/tournament` only looks at the current round's standings (same as the web
  tool) — it doesn't paginate historical rounds or match-by-match data.
- If more than one standings entry matches the `player` name, the bot lists
  the matches instead of guessing; pass a more specific name to disambiguate.
