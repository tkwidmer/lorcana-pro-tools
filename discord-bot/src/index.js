import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { decodeQrFromImageUrl } from './qrDecode.js';
import {
  extractEventId,
  fetchEventDetails,
  fetchAllStandings,
  getTournamentStructure,
  analyzeId,
  analyzeAdvancement,
} from './tournamentApi.js';
import { buildSummaryEmbed, buildPlayerEmbed } from './tournamentEmbeds.js';

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
  if (interaction.isChatInputCommand() && interaction.commandName === 'tournament') {
    await handleTournamentCommand(interaction);
    return;
  }

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

async function handleTournamentCommand(interaction) {
  await interaction.deferReply();

  const url = interaction.options.getString('url', true);
  const playerQuery = interaction.options.getString('player');

  const eventId = extractEventId(url);
  if (!eventId) {
    await interaction.editReply(
      'That doesn\'t look like a Ravensburger event URL. Expected something like `https://tcg.ravensburgerplay.com/events/12345`.'
    );
    return;
  }

  try {
    const eventDetails = await fetchEventDetails(eventId);
    const structure = getTournamentStructure(eventDetails);

    if (!structure?.currentRoundId) {
      await interaction.editReply('Could not find an active round for this event.');
      return;
    }

    const standings = await fetchAllStandings(structure.currentRoundId);

    if (!playerQuery) {
      await interaction.editReply({ embeds: [buildSummaryEmbed(structure, standings, url)] });
      return;
    }

    const query = playerQuery.toLowerCase();
    const matches = standings.filter(
      (entry) =>
        entry.user_event_status.best_identifier.toLowerCase().includes(query) ||
        entry.player.best_identifier.toLowerCase().includes(query)
    );

    if (matches.length === 0) {
      await interaction.editReply(`No player matching "${playerQuery}" found in the current standings.`);
      return;
    }

    if (matches.length > 1) {
      const names = matches
        .slice(0, 10)
        .map((entry) => `${entry.user_event_status.best_identifier} (#${entry.rank})`)
        .join(', ');
      await interaction.editReply(`Multiple players match "${playerQuery}": ${names}. Try a more specific name.`);
      return;
    }

    const entry = matches[0];
    const idAnalysis = analyzeId(entry, standings, structure);
    const advancementAnalysis = analyzeAdvancement(entry, structure);
    await interaction.editReply({
      embeds: [buildPlayerEmbed(structure, entry, idAnalysis, advancementAnalysis, url)],
    });
  } catch (error) {
    console.error('Tournament lookup failed:', error);
    await interaction.editReply('Failed to look up that tournament. Double-check the URL and try again.');
  }
}

client.login(DISCORD_TOKEN);
