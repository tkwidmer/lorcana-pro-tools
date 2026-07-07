import 'dotenv/config';

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('DISCORD_TOKEN and DISCORD_CLIENT_ID must be set (see .env.example).');
  process.exit(1);
}

// Discord application command types: 1 = CHAT_INPUT, 3 = MESSAGE (context menu)
// https://discord.com/developers/docs/interactions/application-commands
const commands = [
  {
    name: 'Decode Deck QR',
    type: 3,
  },
  {
    name: 'tournament',
    description: 'Look up a Ravensburger Lorcana tournament',
    type: 1,
    options: [
      {
        name: 'url',
        description: 'Tournament event URL, e.g. https://tcg.ravensburgerplay.com/events/12345',
        type: 3, // STRING
        required: true,
      },
      {
        name: 'player',
        description: 'Player name to look up (partial match) instead of the full standings',
        type: 3, // STRING
        required: false,
      },
    ],
  },
];

const route = DISCORD_GUILD_ID
  ? `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/guilds/${DISCORD_GUILD_ID}/commands`
  : `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/commands`;

const response = await fetch(route, {
  method: 'PUT',
  headers: {
    Authorization: `Bot ${DISCORD_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(commands),
});

if (!response.ok) {
  console.error(`Failed to register commands (HTTP ${response.status}):`, await response.text());
  process.exit(1);
}

console.log(
  DISCORD_GUILD_ID
    ? `Registered commands for guild ${DISCORD_GUILD_ID}.`
    : 'Registered commands globally (may take up to an hour to show up).'
);
