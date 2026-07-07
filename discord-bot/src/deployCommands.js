import 'dotenv/config';
import { REST, Routes, ApplicationCommandType, ApplicationCommandOptionType } from 'discord.js';

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('DISCORD_TOKEN and DISCORD_CLIENT_ID must be set (see .env.example).');
  process.exit(1);
}

const commands = [
  {
    name: 'Decode Deck QR',
    type: ApplicationCommandType.Message,
  },
  {
    name: 'tournament',
    description: 'Look up a Ravensburger Lorcana tournament',
    type: ApplicationCommandType.ChatInput,
    options: [
      {
        name: 'url',
        description: 'Tournament event URL, e.g. https://tcg.ravensburgerplay.com/events/12345',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'player',
        description: 'Player name to look up (partial match) instead of the full standings',
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

const route = DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID)
  : Routes.applicationCommands(DISCORD_CLIENT_ID);

await rest.put(route, { body: commands });

console.log(
  DISCORD_GUILD_ID
    ? `Registered "Decode Deck QR" command for guild ${DISCORD_GUILD_ID}.`
    : 'Registered "Decode Deck QR" command globally (may take up to an hour to show up).'
);
