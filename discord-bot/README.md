# Discord Bot — Command Registration

The actual bot logic (both commands below) runs as a Vercel serverless
function, `api/discord-interactions.ts` in the main app — it's deployed
automatically with every push, no separate process to keep running. This
folder just holds the one-time (or on-change) script that registers the
bot's commands with Discord.

## Commands

- **Apps → Decode Deck QR** (message context menu) — reads the QR code
  embedded in a duels.ink deck list image and replies with the decoded
  `duels.ink` URL.
- **`/tournament url:<event url> [player:<name>]`** (slash command) — looks
  up a live Ravensburger tournament. Without `player` it posts a summary
  (round, cut size, top standings); with `player:<name>` it looks up that
  competitor's rank, record, and ID (intentional draw) recommendation.

See `api/discord-interactions.ts` and `api/_lib/` in the repo root for the
implementation.

## How interactions reach the bot

Discord calls a URL you configure once in the Developer Portal (the
**Interactions Endpoint URL**) with a signed HTTP request for every
slash command / context menu invocation — there's no gateway connection to
keep alive. The Vercel function verifies the request signature, immediately
acknowledges it, then edits in the real reply once it's done the work
(QR decode, tournament API calls).

## Setup

### 1. Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   and create a new application.
2. Under **Bot**, add a bot user and copy the token — this is `DISCORD_TOKEN`
   (only needed locally, to run the registration script below; it's never
   deployed anywhere).
3. Under **General Information**:
   - Copy the **Application ID** — this is `DISCORD_CLIENT_ID` (also used as
     `VITE_DISCORD_CLIENT_ID` for the web app's "Add to Discord" button).
   - Copy the **Public Key** — this is `DISCORD_PUBLIC_KEY`, needed by the
     Vercel function to verify request signatures.
4. Under **OAuth2 → URL Generator**, check the `bot` and `applications.commands`
   scopes. Under bot permissions, `Send Messages` and `Read Message History`
   are enough. Use the generated URL to invite the bot to your server.

### 2. Register the commands

```bash
cd discord-bot
cp .env.example .env
# fill in DISCORD_TOKEN and DISCORD_CLIENT_ID
# optionally set DISCORD_GUILD_ID to a test server's ID while developing —
# guild-scoped commands show up instantly, global ones can take up to an hour
npm install
npm run register
```

Re-run `npm run register` any time the command definitions in
`src/deployCommands.js` change. This only needs to run once per environment
(or whenever commands change) — it does not need to stay running.

### 3. Configure Vercel

1. In the Vercel project settings, add an environment variable
   `DISCORD_PUBLIC_KEY` (from step 1) — this is the only server-side secret
   the interactions endpoint needs.
2. Deploy (or redeploy) the app so `api/discord-interactions.ts` goes live at
   `https://<your-domain>/api/discord-interactions`.
3. Back in the Discord Developer Portal, set that URL as the application's
   **Interactions Endpoint URL**. Discord immediately sends a test PING to
   verify it — if `DISCORD_PUBLIC_KEY` is set correctly, it'll succeed right
   away.

## Notes

- Large deck images are downscaled before scanning (see `MAX_DIMENSION` in
  `api/_lib/discordQr.ts`) to keep decoding fast; this doesn't affect the QR
  code's readability in practice. Image decoding uses `jimp` (pure JS)
  rather than `sharp`, since `sharp`'s native binaries are a portability
  risk in a serverless function bundle.
- `/tournament` only looks at the current round's standings (same as the web
  tool) — it doesn't paginate historical rounds or match-by-match data.
- If more than one standings entry matches the `player` name, the bot lists
  the matches instead of guessing; pass a more specific name to disambiguate.
- Vercel functions have a max execution duration (`maxDuration: 60` is set in
  `api/discord-interactions.ts`, but Hobby-tier accounts are capped at 10s
  regardless). A `/tournament` lookup against a very large event's standings
  could theoretically exceed that on Hobby — if so, the deferred reply will
  never get its follow-up edit and Discord will eventually show the
  interaction as failed.
