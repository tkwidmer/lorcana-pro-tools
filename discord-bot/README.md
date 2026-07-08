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
- **`/favorite url:<event url> player:<name>`** — tracks a player in the
  channel it's run from. Every 30 minutes, a scheduled tick checks all
  tracked players and posts an update here whenever one's rank or record
  changes (silent otherwise, so it doesn't spam the channel during byes or
  downtime).
- **`/unfavorite player:<name>`** — stops tracking a player in this channel.
- **`/favorites`** — lists players currently tracked in this channel.

See `api/discord-interactions.ts` and `api/_lib/` in the repo root for the
implementation, and `api/discord-tournament-tick.ts` for the scheduled
update job.

## How interactions reach the bot

Discord calls a URL you configure once in the Developer Portal (the
**Interactions Endpoint URL**) with a signed HTTP request for every
slash command / context menu invocation — there's no gateway connection to
keep alive. The Vercel function verifies the request signature, immediately
acknowledges it, then edits in the real reply once it's done the work
(QR decode, tournament API calls).

## How player tracking reaches the bot

`/favorite` writes a row to the `discord_favorite_players` Supabase table
(guild/channel, event, player, and a snapshot of their last-seen rank/record).
Vercel's Hobby plan only runs Cron Jobs once a day, which can't drive a
30-minute cadence, so a GitHub Actions workflow
(`.github/workflows/tournament-tracker-tick.yml`, this repo is public so it's
free) calls a separate endpoint, `/api/discord-tournament-tick`, on that
schedule instead. The tick endpoint isn't a Discord interaction — it's a
plain HTTP endpoint protected by a shared secret (`CRON_SECRET`) — that reads
all active favorites, groups them by event to minimize API calls, and posts
an update via the Discord **Bot API** (not the interaction-reply webhook,
since this isn't responding to an interaction) whenever a tracked player's
rank or record changed since the last check. A favorite auto-deactivates
once its event's current round can no longer be resolved (the tournament
finished).

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

1. In the Vercel project settings, add these environment variables:
   - `DISCORD_PUBLIC_KEY` (from step 1) — verifies interaction request signatures.
   - `DISCORD_BOT_TOKEN` (from step 1's Bot tab — the same token you put in
     `discord-bot/.env`) — needed so the scheduled tick can post proactive
     channel messages via the Discord Bot API, which the interaction-reply
     webhook can't do.
   - `SUPABASE_SERVICE_ROLE_KEY` — from the Supabase project's API settings
     (Project Settings → API → service_role key). Used by
     `api/_lib/discordSupabase.ts` for server-side access to the favorites
     table, bypassing RLS (there's no end-user Supabase session for a
     Discord command). This is a highly privileged secret — never expose it
     client-side.
   - `CRON_SECRET` — any random string; protects `/api/discord-tournament-tick`
     from being triggered by anyone who finds the URL. Generate one with
     `openssl rand -hex 32`.
2. Deploy (or redeploy) the app so `api/discord-interactions.ts` and
   `api/discord-tournament-tick.ts` go live.
3. Back in the Discord Developer Portal, set
   `https://<your-domain>/api/discord-interactions` as the application's
   **Interactions Endpoint URL**. Discord immediately sends a test PING to
   verify it — if `DISCORD_PUBLIC_KEY` is set correctly, it'll succeed right
   away.

### 4. Configure the GitHub Actions secret

Add a repository secret named `CRON_SECRET` (Settings → Secrets and
variables → Actions → New repository secret) with the **same value** you
set in Vercel in step 3. `.github/workflows/tournament-tracker-tick.yml`
uses it to authenticate its call to `/api/discord-tournament-tick` every 30
minutes. You can trigger it manually from the Actions tab
(`workflow_dispatch`) to test without waiting for the schedule.

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
  regardless). Standings are fetched with a large `page_size` to keep this to
  one request for most events, and an internal ~8s timeout sends an explicit
  "took too long" reply instead of leaving an interaction stuck on "thinking"
  if something is still slow.
- `/favorite` resolves the player once at favoriting time and stores their
  stable Ravensburger player ID — later ticks match on that ID, not the name,
  so it keeps tracking correctly even if a display name changes mid-event.
- Multiple channels/servers can each favorite the same player independently;
  favorites are scoped per-channel (`UNIQUE (channel_id, event_id, player_id)`
  in the migration), so removing one channel's favorite doesn't affect others.
