---
name: discord-interactions-docs
description: Check Discord's official Interactions/API docs before building or modifying anything in api/discord-interactions.ts, api/_lib/discordQr.ts, api/_lib/discordTournamentEmbeds.ts, discord-bot/, or anything involving slash commands, message components, embeds, signature verification, or the Discord Bot API. Use whenever an interaction payload shape, response type, embed field limit, or signature-verification detail is unclear.
---

# Discord Developer Docs

Unlike LorcanaJSON, Discord actually publishes a real, versioned, official API
reference — use it instead of guessing interaction/embed shapes from memory,
since Discord's API evolves (new interaction types, component types, etc.)
and this repo's Discord surface is a hand-rolled HTTP Interactions endpoint,
not the discord.js/discord-interactions-py SDK layer that would otherwise
absorb those changes for you.

## When to use

Before implementing or debugging anything involving:
- `api/discord-interactions.ts` — the Vercel function receiving Discord's
  HTTP Interactions webhook (PING/PONG, slash commands, message commands,
  deferred responses, follow-up edits via
  `PATCH /webhooks/{app_id}/{token}/messages/@original`)
- `api/_lib/discordQr.ts`, `api/_lib/discordTournamentEmbeds.ts`,
  `api/_lib/discordFavorites.ts` — embed building, image attachment handling
- `api/discord-tournament-tick.ts` — proactive channel messages via the
  Discord Bot API (`DISCORD_BOT_TOKEN`, different from the interactions
  webhook's `DISCORD_PUBLIC_KEY`)
- `discord-bot/` — the one-time command-registration script
- Anything involving Ed25519 signature verification (`verifyKey` from the
  `discord-interactions` npm package), interaction response types, embed
  field/character limits, or rate limits on the Bot API

## Key URLs

- `https://discord.com/developers/docs/interactions/receiving-and-responding`
  — interaction types, response types (PONG, `CHANNEL_MESSAGE_WITH_SOURCE`,
  `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`, etc.), the 3-second ack window and
  why deferred responses + follow-up PATCH exist
- `https://discord.com/developers/docs/interactions/application-commands`
  — slash command and message command (context menu) structure/options
- `https://discord.com/developers/docs/resources/message#embed-object`
  — embed object shape and field limits (title/description/field-count
  caps) relevant to `discordTournamentEmbeds.ts`
- `https://discord.com/developers/docs/topics/rate-limits` — Bot API rate
  limits relevant to `discord-tournament-tick.ts`'s proactive messages
- `https://discord.com/developers/docs/interactions/overview#security-and-authorization`
  — Ed25519 request signing/verification this repo implements via
  `DISCORD_PUBLIC_KEY`

## Steps

1. Identify which part of the Discord surface the task touches (interactions
   webhook vs. Bot API vs. embed formatting vs. signature verification) and
   fetch the matching doc page above.
2. Cross-check against the current implementation in `api/discord-interactions.ts`
   and the relevant `api/_lib/discord*.ts` file — note any drift (new
   interaction/component types, changed response codes, new embed limits).
3. Remember the two distinct credentials this repo uses and don't confuse
   them: `DISCORD_PUBLIC_KEY` verifies inbound interaction signatures;
   `DISCORD_BOT_TOKEN` authenticates outbound Bot API calls (proactive
   messages). See `discord-bot/README.md` for the full setup story.
4. Implement using the confirmed current API behavior, not assumptions from
   prior sessions.
