import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { decodeQrFromImageUrl } from './qrDecode.js';

const { DISCORD_TOKEN } = process.env;

if (!DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN must be set (see .env.example).');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isMessageContextMenuCommand()) return;
  if (interaction.commandName !== 'Decode Deck QR') return;

  await interaction.deferReply();

  const images = [...interaction.targetMessage.attachments.values()].filter((attachment) =>
    attachment.contentType?.startsWith('image/')
  );

  if (images.length === 0) {
    await interaction.editReply('That message has no image attachments to scan.');
    return;
  }

  const results = await Promise.all(
    images.map(async (image) => {
      try {
        return { name: image.name, decoded: await decodeQrFromImageUrl(image.url) };
      } catch (error) {
        console.error(`Failed to decode ${image.name}:`, error);
        return { name: image.name, decoded: null };
      }
    })
  );

  const found = results.filter((result) => result.decoded);
  if (found.length === 0) {
    await interaction.editReply("Couldn't find a QR code in that image.");
    return;
  }

  const lines = found.map((result) =>
    results.length > 1 ? `**${result.name}**: ${result.decoded}` : result.decoded
  );
  await interaction.editReply(lines.join('\n'));
});

client.login(DISCORD_TOKEN);
