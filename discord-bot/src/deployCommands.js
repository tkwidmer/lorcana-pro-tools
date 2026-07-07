import 'dotenv/config';
import { REST, Routes, ApplicationCommandType } from 'discord.js';

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
