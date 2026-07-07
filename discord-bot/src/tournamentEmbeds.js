import { EmbedBuilder } from 'discord.js'

const ID_RECOMMENDATION_LABELS = {
  safe: '✅ Safe to ID',
  borderline: '⚠️ Borderline — check tiebreakers',
  danger: '❌ Do not ID — you need the win',
}

const ADVANCEMENT_LABELS = {
  secured: (a) => `✅ Secured advancement to ${a.nextPhaseName}`,
  possible: (a) =>
    a.type === 'points'
      ? `⏳ Need ${a.winsNeeded} more win${a.winsNeeded !== 1 ? 's' : ''} (${a.pointsNeeded} pts) for ${a.nextPhaseName}`
      : `⏳ Currently outside top ${a.value} for ${a.nextPhaseName}`,
  eliminated: (a) => `❌ Eliminated from ${a.nextPhaseName} contention`,
  in_cut: (a) => `✅ Currently in top ${a.value} → ${a.nextPhaseName}`,
  outside_cut: (a) => `⚠️ Currently outside top ${a.value} → ${a.nextPhaseName}`,
}

function roundLabel(structure) {
  if (structure.isElimination) {
    return `${structure.currentPhaseName || 'Elimination'} · Round ${structure.currentRoundNumber}`
  }
  const total = structure.totalSwissRounds > 0 ? ` of ${structure.totalSwissRounds}` : ''
  return `Round ${structure.currentRoundNumber}${total}`
}

export function buildSummaryEmbed(structure, standings, eventUrl) {
  const embed = new EmbedBuilder()
    .setTitle(structure.eventName || 'Tournament')
    .setURL(eventUrl)
    .setColor(0x2563eb)

  const infoLines = [roundLabel(structure)]
  if (!structure.isElimination && structure.swissRoundsRemaining > 0) {
    infoLines.push(`${structure.swissRoundsRemaining} round(s) remaining`)
  }
  if (structure.topCutSize) infoLines.push(`Top ${structure.topCutSize} cut`)
  infoLines.push(`${standings.length} player(s)`)
  embed.addFields({ name: 'Status', value: infoLines.join(' · ') })

  if (structure.advancementRequirement) {
    const req = structure.advancementRequirement
    const value =
      req.type === 'points'
        ? `Need ${req.value} pts → ${req.nextPhaseName}`
        : `Need top ${req.value} → ${req.nextPhaseName}`
    embed.addFields({ name: 'Advancement', value })
  }

  const top = [...standings].sort((a, b) => a.rank - b.rank).slice(0, 10)
  if (top.length > 0) {
    const lines = top.map(
      (e) => `**${e.rank}.** ${e.user_event_status.best_identifier} — ${e.record} (${e.match_points} pts)`
    )
    embed.addFields({ name: 'Top Standings', value: lines.join('\n') })
  }

  embed.setFooter({ text: 'Use the player option to look up a specific competitor.' })
  return embed
}

export function buildPlayerEmbed(structure, entry, idAnalysis, advancementAnalysis, eventUrl) {
  const embed = new EmbedBuilder()
    .setTitle(entry.user_event_status.best_identifier)
    .setURL(eventUrl)
    .setColor(idAnalysis?.recommendation === 'danger' ? 0xdc2626 : idAnalysis?.recommendation === 'borderline' ? 0xd97706 : 0x16a34a)
    .setDescription(`${structure.eventName || ''} · ${roundLabel(structure)}`)
    .addFields(
      { name: 'Rank', value: `#${entry.rank} of ${structure.startingPlayerCount ?? '—'}`, inline: true },
      { name: 'Record', value: entry.record, inline: true },
      { name: 'Match Points', value: String(entry.match_points), inline: true }
    )

  if (advancementAnalysis) {
    embed.addFields({
      name: 'Advancement',
      value: ADVANCEMENT_LABELS[advancementAnalysis.status]?.(advancementAnalysis) ?? '—',
    })
  }

  if (idAnalysis) {
    const details = [
      `Cut line: rank #${idAnalysis.topCutSize}${idAnalysis.cutLinePoints !== null ? ` (${idAnalysis.cutLinePoints} pts)` : ''}`,
      idAnalysis.pointsAboveCut !== null
        ? idAnalysis.pointsAboveCut >= 0
          ? `${idAnalysis.pointsAboveCut} pt(s) above cut line`
          : `${Math.abs(idAnalysis.pointsAboveCut)} pt(s) below cut line`
        : null,
      `After ID: ${idAnalysis.afterIdPoints} pts · After win: ${idAnalysis.afterWinPoints} pts`,
    ].filter(Boolean)

    embed.addFields({
      name: ID_RECOMMENDATION_LABELS[idAnalysis.recommendation] ?? 'ID Analysis',
      value: details.join('\n'),
    })
  }

  return embed
}
