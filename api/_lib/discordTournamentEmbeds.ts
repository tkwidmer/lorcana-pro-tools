// Builds plain Discord embed objects (the raw JSON shape, not a client
// library wrapper) for the /tournament command's HTTP interaction replies.
const ID_RECOMMENDATION_LABELS: Record<string, string> = {
  safe: '✅ Safe to ID',
  borderline: '⚠️ Borderline — check tiebreakers',
  danger: '❌ Do not ID — you need the win',
}

const ADVANCEMENT_LABELS: Record<string, (a: any) => string> = {
  secured: (a) => `✅ Secured advancement to ${a.nextPhaseName}`,
  possible: (a) =>
    a.type === 'points'
      ? `⏳ Need ${a.winsNeeded} more win${a.winsNeeded !== 1 ? 's' : ''} (${a.pointsNeeded} pts) for ${a.nextPhaseName}`
      : `⏳ Currently outside top ${a.value} for ${a.nextPhaseName}`,
  eliminated: (a) => `❌ Eliminated from ${a.nextPhaseName} contention`,
  in_cut: (a) => `✅ Currently in top ${a.value} → ${a.nextPhaseName}`,
  outside_cut: (a) => `⚠️ Currently outside top ${a.value} → ${a.nextPhaseName}`,
}

function roundLabel(structure: any): string {
  if (structure.isElimination) {
    return `${structure.currentPhaseName || 'Elimination'} · Round ${structure.currentRoundNumber}`
  }
  const total = structure.totalSwissRounds > 0 ? ` of ${structure.totalSwissRounds}` : ''
  return `Round ${structure.currentRoundNumber}${total}`
}

export function buildSummaryEmbed(structure: any, standings: any[], eventUrl: string) {
  const infoLines = [roundLabel(structure)]
  if (!structure.isElimination && structure.swissRoundsRemaining > 0) {
    infoLines.push(`${structure.swissRoundsRemaining} round(s) remaining`)
  }
  if (structure.topCutSize) infoLines.push(`Top ${structure.topCutSize} cut`)
  infoLines.push(`${standings.length} player(s)`)

  const fields = [{ name: 'Status', value: infoLines.join(' · ') }]

  if (structure.advancementRequirement) {
    const req = structure.advancementRequirement
    const value =
      req.type === 'points'
        ? `Need ${req.value} pts → ${req.nextPhaseName}`
        : `Need top ${req.value} → ${req.nextPhaseName}`
    fields.push({ name: 'Advancement', value })
  }

  const top = [...standings].sort((a, b) => a.rank - b.rank).slice(0, 10)
  if (top.length > 0) {
    const lines = top.map(
      (e) => `**${e.rank}.** ${e.user_event_status.best_identifier} — ${e.record} (${e.match_points} pts)`
    )
    fields.push({ name: 'Top Standings', value: lines.join('\n') })
  }

  return {
    title: structure.eventName || 'Tournament',
    url: eventUrl,
    color: 0x2563eb,
    fields,
    footer: { text: 'Use the player option to look up a specific competitor.' },
  }
}

export function buildPlayerEmbed(
  structure: any,
  entry: any,
  idAnalysis: any,
  advancementAnalysis: any,
  eventUrl: string
) {
  const color =
    idAnalysis?.recommendation === 'danger'
      ? 0xdc2626
      : idAnalysis?.recommendation === 'borderline'
      ? 0xd97706
      : 0x16a34a

  const fields = [
    { name: 'Rank', value: `#${entry.rank} of ${structure.startingPlayerCount ?? '—'}`, inline: true },
    { name: 'Record', value: entry.record, inline: true },
    { name: 'Match Points', value: String(entry.match_points), inline: true },
  ]

  if (advancementAnalysis) {
    fields.push({
      name: 'Advancement',
      value: ADVANCEMENT_LABELS[advancementAnalysis.status]?.(advancementAnalysis) ?? '—',
      inline: false,
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

    fields.push({
      name: ID_RECOMMENDATION_LABELS[idAnalysis.recommendation] ?? 'ID Analysis',
      value: details.join('\n'),
      inline: false,
    })
  }

  return {
    title: entry.user_event_status.best_identifier,
    url: eventUrl,
    color,
    description: `${structure.eventName || ''} · ${roundLabel(structure)}`,
    fields,
  }
}
