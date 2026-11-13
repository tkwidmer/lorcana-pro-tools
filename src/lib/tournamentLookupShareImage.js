// Social-media PNGs of Tournament Lookup's Metagame, Matchups, Best Of and
// Teams tabs, in the site's brand (ink black, forge gold, Oswald + Source
// Sans 3) with the InkbornForge mark and URL. Data comes from
// tournamentInks.js and teams.js; the pure helpers are exported for tests,
// the draw functions need a browser canvas.
import { inkPairMeta, inkPairMatrix, winRate, playerInks, bestOfLeaders, bestRankByPair } from './tournamentInks'
import { ordinal } from './resultsArchive'
import { teamInitials } from './teams'
import { INK_2, LINE, PAPER, MUTED, FORGE, WIN, LOSS, DISPLAY, SANS, INK_FILL, layout, loadImage, loadAssets, newCanvas, text, fitText, drawHeader as brandHeader, drawFooter as brandFooter, drawInks, roundRect } from './shareBrand'

const URL_TEXT = 'inkbornforge.com/tournament-lookup'
const FEW = 5 // cells under this many matches are drawn faded

const abbr = (ink) => ink.slice(0, 3).toUpperCase()
export const pairAbbr = (inks) => inks.map(abbr).join('/')
export const pairName = (inks) => inks.map((i) => i.toUpperCase()).join(' / ')

export function shareFilename(structure, name) {
  const slug = structure.eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug}-${name}.png`
}

// Subtitle shared by the images: format, players, how far the data runs.
// Match data runs through the round in progress; Best Of, read from the
// standings, passes its own `progress` ("Standings after Round 6").
export function eventLine(structure, progress) {
  const round = structure.activePhaseType === 'RANKED_SINGLE_ELIMINATION'
    ? structure.activePhaseName
    : structure.activeRoundNumber ? `Round ${structure.activeRoundNumber}` : null
  return [
    structure.gameplayFormat,
    structure.startingPlayerCount ? `${structure.startingPlayerCount.toLocaleString('en-US')} players` : null,
    progress ?? (round ? `Through ${round}` : null),
  ].filter(Boolean).join(' · ')
}

// Win-rate cell fill: red under 50, green over, gray at even, saturating at
// 25 points either side.
export function cellFill(wr) {
  const t = Math.max(-1, Math.min(1, (wr - 50) / 25))
  const [r, g, b] = t < 0 ? [196, 58, 58] : [46, 158, 96]
  const k = Math.abs(t)
  const mix = (c, base) => Math.round(base + (c - base) * (0.25 + 0.75 * k))
  return `rgb(${mix(r, 52)}, ${mix(g, 52)}, ${mix(b, 59)})`
}

function drawHeader(ctx, w, pad, { mark, title, structure, progress }) {
  brandHeader(ctx, w, pad, { mark, title, name: structure.eventName, line: eventLine(structure, progress) })
}

function drawFooter(ctx, w, h, pad, note, cam) {
  brandFooter(ctx, w, h, pad, { note, url: URL_TEXT, cam })
}

const pct = (v, digits = 1) => (v == null ? '—' : `${v.toFixed(digits)}%`)
// Lift: a pair's conversion over the field's (1.25× = 25% better).
const liftText = (lift) => (lift == null ? '—' : `${lift.toFixed(2)}×`)
const liftFill = (lift) => (lift == null ? MUTED : lift >= 1.1 ? WIN : lift <= 0.9 ? LOSS : PAPER)

// The field by ink pair: one row per pair with a bar painted half in each ink.
// `firstCut` (the Metagame tab's { label, field, byKey }) adds the pair's
// conversion through the first decided cut, colored by its lift.
export async function renderMetaShareImage({ matches, structure, standings, firstCut, video }) {
  const rows = inkPairMeta(matches)
  const bestRank = bestRankByPair(standings, playerInks(matches))
  const rankCol = (standings ? 100 : 0) + (firstCut ? 110 : 0)
  const { icons, mark } = await loadAssets(rows.map((r) => r.inks))
  const PAD = 56
  const TOP = 236
  const { W, H, ROW, dpr, cam } = layout({ video, w: 1200, top: TOP, bottom: 110, n: rows.length, row: 58 })
  const { canvas, ctx } = newCanvas(W, H, dpr)
  drawHeader(ctx, W, PAD, { mark, title: 'METAGAME', structure })

  const players = rows.reduce((s, r) => s + r.players, 0)
  const NAME_X = PAD + 82
  const BAR_X = PAD + 400
  const BAR_W = W - PAD - BAR_X - 300 - rankCol
  const COLS = { players: W - PAD - 210 - rankCol, share: W - PAD - 110 - rankCol, win: W - PAD - rankCol, cut: W - PAD - (standings ? 100 : 0), best: W - PAD }
  const head = { font: `500 17px ${DISPLAY}`, color: MUTED, align: 'right' }
  text(ctx, 'INK PAIR', NAME_X, TOP - 20, { ...head, align: 'left' })
  text(ctx, 'PLAYERS', COLS.players, TOP - 20, head)
  text(ctx, 'SHARE', COLS.share, TOP - 20, head)
  text(ctx, 'WIN %', COLS.win, TOP - 20, head)
  if (firstCut) text(ctx, `${firstCut.label.toUpperCase()} %`, COLS.cut, TOP - 20, head)
  if (standings) text(ctx, 'BEST RANK', COLS.best, TOP - 20, head)

  const maxShare = Math.max(...rows.map((r) => r.share))
  rows.forEach((r, i) => {
    const y = TOP + i * ROW
    const mid = y + ROW / 2
    if (i % 2 === 0) { ctx.fillStyle = INK_2; ctx.fillRect(PAD, y, W - PAD * 2, ROW) }
    drawInks(ctx, icons, r.inks, PAD + 10, mid, 30)
    text(ctx, pairName(r.inks), NAME_X, mid, { font: `600 24px ${DISPLAY}`, baseline: 'middle' })
    const len = Math.max(4, (r.share / maxShare) * BAR_W)
    r.inks.forEach((ink, k) => {
      ctx.fillStyle = INK_FILL[ink]
      ctx.fillRect(BAR_X + (len / r.inks.length) * k, mid - 9, len / r.inks.length, 18)
    })
    text(ctx, String(r.players), COLS.players, mid, { font: `600 24px ${DISPLAY}`, align: 'right', baseline: 'middle' })
    text(ctx, pct(r.share), COLS.share, mid, { font: `600 24px ${DISPLAY}`, color: FORGE, align: 'right', baseline: 'middle' })
    const wr = r.winRate
    const color = wr == null ? MUTED : wr >= 52 ? '#6fd39a' : wr <= 48 ? '#f08a8a' : PAPER
    text(ctx, pct(wr), COLS.win, mid, { font: `600 24px ${DISPLAY}`, color, align: 'right', baseline: 'middle' })
    if (firstCut) {
      const cut = firstCut.byKey.get(r.key)
      text(ctx, pct(cut?.conversion), COLS.cut, mid, { font: `600 24px ${DISPLAY}`, color: liftFill(cut?.lift), align: 'right', baseline: 'middle' })
    }
    if (standings) text(ctx, bestRank.has(r.key) ? `#${bestRank.get(r.key)}` : '—', COLS.best, mid, { font: `600 24px ${DISPLAY}`, align: 'right', baseline: 'middle' })
  })

  const note = firstCut
    ? `${players.toLocaleString('en-US')} decks · win % vs other pairs, mirrors out · ${firstCut.label} %: made ${firstCut.label} (field ${pct(firstCut.field)})`
    : `${players.toLocaleString('en-US')} players with a submitted deck · win % vs other pairs, draws as half, mirrors left out`
  drawFooter(ctx, W, H, PAD, note, cam)
  return canvas
}

// Row pair's match win rate against each column pair, beside its overall
// win rate and record vs the field and (with standings) its best rank;
// sized to the number of pairs.
export async function renderMatchupShareImage({ matches, structure, standings, video }) {
  const pairs = inkPairMeta(matches)
  const cells = inkPairMatrix(matches)
  const bestRank = bestRankByPair(standings, playerInks(matches))
  const { icons, mark } = await loadAssets(pairs.map((p) => p.inks))
  const PAD = 48
  const LABEL_W = 270
  const FIELD_W = 150
  const BEST_W = standings ? 84 : 0
  const GAP = 6
  const LEFT = PAD + LABEL_W + GAP + FIELD_W + GAP + (BEST_W && BEST_W + GAP)
  const HEAD_TOP = 196
  const TOP = HEAD_TOP + 96
  const { W, H, ROW, dpr, cam } = layout({ video, w: Math.max(1400, LEFT + PAD + pairs.length * (96 + GAP)), top: TOP, bottom: 100, n: pairs.length, row: 74, gap: GAP })
  // A video frame is wider than the matrix needs: the cells take the slack.
  const CELL = video ? (W - LEFT - PAD) / pairs.length - GAP : 96
  const { canvas, ctx } = newCanvas(W, H, dpr)
  drawHeader(ctx, W, PAD, { mark, title: 'MATCHUPS', structure })

  const fieldX = PAD + LABEL_W + GAP
  const bestX = fieldX + FIELD_W + GAP
  const colX = (j) => bestX + (BEST_W && BEST_W + GAP) + j * (CELL + GAP)
  text(ctx, 'VS FIELD', fieldX + FIELD_W / 2, HEAD_TOP + 62, { font: `600 18px ${DISPLAY}`, color: FORGE, align: 'center' })
  text(ctx, 'win % · record', fieldX + FIELD_W / 2, HEAD_TOP + 84, { font: `400 15px ${SANS}`, color: MUTED, align: 'center' })
  if (BEST_W) {
    text(ctx, 'BEST', bestX + BEST_W / 2, HEAD_TOP + 62, { font: `600 18px ${DISPLAY}`, color: FORGE, align: 'center' })
    text(ctx, 'rank', bestX + BEST_W / 2, HEAD_TOP + 84, { font: `400 15px ${SANS}`, color: MUTED, align: 'center' })
  }
  pairs.forEach((p, j) => {
    const cx = colX(j) + CELL / 2
    drawInks(ctx, icons, p.inks, cx - 29, HEAD_TOP + 28, 26)
    text(ctx, pairAbbr(p.inks), cx, HEAD_TOP + 66, { font: `600 18px ${DISPLAY}`, align: 'center' })
    text(ctx, p.share < 1 ? '<1%' : `${Math.round(p.share)}%`, cx, HEAD_TOP + 86, { font: `400 15px ${SANS}`, color: MUTED, align: 'center' })
  })

  let decided = 0
  pairs.forEach((row, i) => {
    const y = TOP + i * (ROW + GAP)
    const mid = y + ROW / 2
    ctx.fillStyle = INK_2
    roundRect(ctx, PAD, y, LABEL_W, ROW, 4); ctx.fill()
    drawInks(ctx, icons, row.inks, PAD + 10, mid, 26)
    text(ctx, fitText(ctx, pairName(row.inks), LABEL_W - 82, `600 21px ${DISPLAY}`), PAD + 74, mid - 4, { font: `600 21px ${DISPLAY}` })
    text(ctx, `${row.players} players · ${row.share < 1 ? '<1' : Math.round(row.share)}%`, PAD + 74, mid + 20, { font: `400 15px ${SANS}`, color: MUTED })

    ctx.strokeStyle = FORGE
    ctx.lineWidth = 1.5
    roundRect(ctx, fieldX, y, FIELD_W, ROW, 4); ctx.stroke()
    text(ctx, pct(row.winRate), fieldX + FIELD_W / 2, mid - 2, { font: `700 26px ${DISPLAY}`, color: FORGE, align: 'center' })
    text(ctx, `${row.wins}-${row.losses}${row.draws ? `-${row.draws}` : ''}`, fieldX + FIELD_W / 2, mid + 22, { font: `400 15px ${SANS}`, color: MUTED, align: 'center' })
    if (BEST_W) {
      ctx.fillStyle = INK_2
      roundRect(ctx, bestX, y, BEST_W, ROW, 4); ctx.fill()
      text(ctx, bestRank.has(row.key) ? `#${bestRank.get(row.key)}` : '—', bestX + BEST_W / 2, mid, { font: `600 24px ${DISPLAY}`, align: 'center', baseline: 'middle' })
    }

    pairs.forEach((col, j) => {
      const x = colX(j)
      const rec = cells.get(`${row.key}|${col.key}`)
      if (row.key === col.key) {
        ctx.setLineDash([4, 4]); ctx.strokeStyle = LINE; ctx.lineWidth = 1.5
        roundRect(ctx, x, y, CELL, ROW, 4); ctx.stroke(); ctx.setLineDash([])
        text(ctx, 'MIRROR', x + CELL / 2, mid, { font: `500 16px ${DISPLAY}`, color: MUTED, align: 'center', baseline: 'middle' })
        return
      }
      if (!rec) {
        ctx.fillStyle = INK_2
        roundRect(ctx, x, y, CELL, ROW, 4); ctx.fill()
        text(ctx, '–', x + CELL / 2, mid, { font: `500 20px ${DISPLAY}`, color: MUTED, align: 'center', baseline: 'middle' })
        return
      }
      const n = rec.wins + rec.losses + rec.draws
      if (i < j) decided += n
      const wr = winRate(rec)
      const alpha = n < FEW ? 0.45 : 1
      ctx.globalAlpha = alpha
      ctx.fillStyle = cellFill(wr)
      roundRect(ctx, x, y, CELL, ROW, 4); ctx.fill()
      ctx.globalAlpha = 1
      text(ctx, `${Math.round(wr)}%`, x + CELL / 2, mid - 2, { font: `700 26px ${DISPLAY}`, align: 'center', alpha: n < FEW ? 0.7 : 1 })
      text(ctx, `${n}m`, x + CELL / 2, mid + 22, { font: `400 15px ${SANS}`, color: '#e6e4df', align: 'center', alpha: n < FEW ? 0.7 : 1 })
    })
  })

  drawFooter(ctx, W, H, PAD, `Row deck's match win % vs column deck · draws count as half · small number = matches · faded = under ${FEW} matches · ${decided.toLocaleString('en-US')} matches between different pairs`, cam)
  return canvas
}

// Top teams by their best individual placement: logo, name, the player who
// holds that placement, combined record and members playing / in the cut.
// `rows` come from topTeamsByBestPlacement().
export async function renderTeamsShareImage({ rows, structure, video }) {
  const { mark } = await loadAssets([])
  const logos = await Promise.all(rows.map((r) => (r.logoUrl ? loadImage(r.logoUrl) : null)))
  const PAD = 56
  const GAP = 12
  const TOP = 236
  const { W, H, ROW, dpr, cam } = layout({ video, w: 1200, top: TOP, bottom: 100, n: rows.length, row: 128, gap: GAP })
  const { canvas, ctx } = newCanvas(W, H, dpr)
  drawHeader(ctx, W, PAD, { mark, title: 'TEAMS', structure })

  const cut = structure.topCutSize
  const COLS = { record: W - PAD - 250, members: W - PAD - 24 }
  const head = { font: `500 17px ${DISPLAY}`, color: MUTED, align: 'right' }
  text(ctx, 'TEAM · TOP PLAYER', PAD + 214, TOP - 20, { ...head, align: 'left' })
  text(ctx, 'COMBINED RECORD', COLS.record, TOP - 20, head)
  text(ctx, 'PLAYING', COLS.members, TOP - 20, head)

  rows.forEach((r, i) => {
    const y = TOP + i * (ROW + GAP)
    const mid = y + ROW / 2
    ctx.fillStyle = INK_2
    roundRect(ctx, PAD, y, W - PAD * 2, ROW, 4); ctx.fill()
    if (i === 0) { ctx.fillStyle = FORGE; ctx.fillRect(PAD, y, 6, ROW) }
    text(ctx, String(i + 1), PAD + 52, mid, { font: `700 56px ${DISPLAY}`, color: i === 0 ? FORGE : PAPER, align: 'center', baseline: 'middle' })

    const LOGO = 92
    const lx = PAD + 100
    const ly = mid - LOGO / 2
    ctx.save()
    roundRect(ctx, lx, ly, LOGO, LOGO, 4); ctx.clip()
    if (logos[i]) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(lx, ly, LOGO, LOGO)
      const k = Math.min(LOGO / logos[i].width, LOGO / logos[i].height)
      const w = logos[i].width * k
      const h = logos[i].height * k
      ctx.drawImage(logos[i], lx + (LOGO - w) / 2, ly + (LOGO - h) / 2, w, h)
    } else {
      ctx.fillStyle = '#34343b'
      ctx.fillRect(lx, ly, LOGO, LOGO)
      text(ctx, teamInitials(r.name), lx + LOGO / 2, mid, { font: `600 34px ${DISPLAY}`, align: 'center', baseline: 'middle' })
    }
    ctx.restore()

    const nameX = PAD + 214
    const nameW = COLS.record - 230 - nameX
    text(ctx, fitText(ctx, r.name.toUpperCase(), nameW, `600 34px ${DISPLAY}`), nameX, mid - 10, { font: `600 34px ${DISPLAY}` })
    const top = r.topPlayer
    text(ctx, fitText(ctx, `#${top.rank}  ${top.name}  ·  ${top.record}`, nameW, `600 22px ${SANS}`), nameX, mid + 26, { font: `600 22px ${SANS}`, color: FORGE })

    const { wins, losses, draws } = r.summary
    text(ctx, `${wins}-${losses}-${draws}`, COLS.record, mid - 4, { font: `600 36px ${DISPLAY}`, align: 'right', baseline: 'middle' })
    text(ctx, `${r.points} pts`, COLS.record, mid + 28, { font: `400 18px ${SANS}`, color: MUTED, align: 'right', baseline: 'middle' })
    text(ctx, String(r.inEvent), COLS.members, mid - 4, { font: `600 36px ${DISPLAY}`, align: 'right', baseline: 'middle' })
    text(ctx, `of ${r.rosterSize}${cut ? ` · ${r.summary.inCut} in top ${cut}` : ''}`, COLS.members, mid + 28, { font: `400 18px ${SANS}`, color: MUTED, align: 'right', baseline: 'middle' })
  })

  drawFooter(ctx, W, H, PAD, 'Ranked by each team\'s best individual placement · record is every member in the event combined', cam)
  return canvas
}

// Best Of promo leaders: the best-ranked player on each of the 15 ink pairs.
export async function renderBestOfShareImage({ matches, structure, standings, standingsLabel, video }) {
  const rows = bestOfLeaders(standings, playerInks(matches))
  const { icons, mark } = await loadAssets(rows.map((r) => r.inks))
  const PAD = 56
  const TOP = 236
  const { W, H, ROW, dpr, cam } = layout({ video, w: 1200, top: TOP, bottom: 110, n: rows.length, row: 58 })
  const { canvas, ctx } = newCanvas(W, H, dpr)
  drawHeader(ctx, W, PAD, { mark, title: 'BEST OF', structure, progress: standingsLabel })

  const NAME_X = PAD + 100
  const COLS = { standing: W - PAD - 180, record: W - PAD - 10 }
  const head = { font: `500 17px ${DISPLAY}`, color: MUTED, align: 'right' }
  text(ctx, 'INKS', PAD + 10, TOP - 20, { ...head, align: 'left' })
  text(ctx, 'PLAYER', NAME_X, TOP - 20, { ...head, align: 'left' })
  text(ctx, 'STANDING', COLS.standing, TOP - 20, head)
  text(ctx, 'RECORD', COLS.record, TOP - 20, head)

  rows.forEach((r, i) => {
    const y = TOP + i * ROW
    const mid = y + ROW / 2
    if (i % 2 === 0) { ctx.fillStyle = INK_2; ctx.fillRect(PAD, y, W - PAD * 2, ROW) }
    drawInks(ctx, icons, r.inks, PAD + 10, mid, 30)
    const name = r.entry ? r.entry.user_event_status.best_identifier : 'No player yet'
    const others = r.tied.length ? `(and ${r.tied.length} other${r.tied.length === 1 ? '' : 's'})` : ''
    ctx.font = `400 20px ${SANS}`
    const othersW = others ? ctx.measureText(others).width + 12 : 0
    const shown = fitText(ctx, name, COLS.standing - NAME_X - 140 - othersW, `600 26px ${SANS}`)
    text(ctx, shown, NAME_X, mid, { font: `600 26px ${SANS}`, color: r.entry ? PAPER : MUTED, baseline: 'middle' })
    if (others) text(ctx, others, NAME_X + ctx.measureText(shown).width + 12, mid + 1, { font: `400 20px ${SANS}`, color: MUTED, baseline: 'middle' })
    if (!r.entry) return
    text(ctx, ordinal(r.entry.rank), COLS.standing, mid, { font: `600 24px ${DISPLAY}`, align: 'right', baseline: 'middle' })
    text(ctx, r.entry.match_record, COLS.record, mid, { font: `600 24px ${DISPLAY}`, color: FORGE, align: 'right', baseline: 'middle' })
  })

  drawFooter(ctx, W, H, PAD, 'Highest standing on each ink pair wins its Best Of promo · others = tied with them on points', cam)
  return canvas
}


// Conversion through each cut: Day 1 players, then per cut its players, the
// conversion from the stage before and the lift over the field's.
// `funnel` is conversionFunnel()'s result, `labels` the cut labels in order.
export async function renderConversionShareImage({ funnel, labels, structure, video }) {
  const { rows, field } = funnel
  const { icons, mark } = await loadAssets(rows.map((r) => r.inks))
  const PAD = 56
  const TOP = 266
  const STAGE_W = 330
  const NAME_W = 420
  const { W, H, ROW, dpr, cam } = layout({ video, w: PAD * 2 + NAME_W + 130 + labels.length * STAGE_W, top: TOP, bottom: 110, n: rows.length, row: 58 })
  const { canvas, ctx } = newCanvas(W, H, dpr)
  drawHeader(ctx, W, PAD, { mark, title: 'CONVERSION', structure })

  const NAME_X = PAD + 82
  // Columns hang from the right edge, so a wide video frame widens the name column.
  const DAY1_X = W - PAD - labels.length * STAGE_W
  const stageX = (i) => DAY1_X + (i + 1) * STAGE_W // right edge of the stage's block
  const head = { font: `500 17px ${DISPLAY}`, color: MUTED, align: 'right' }
  text(ctx, 'INK PAIR', NAME_X, TOP - 20, { ...head, align: 'left' })
  text(ctx, 'DAY 1', DAY1_X, TOP - 20, head)
  labels.forEach((label, i) => {
    const x = stageX(i)
    text(ctx, label.toUpperCase(), x - STAGE_W / 2 + 40, TOP - 52, { font: `600 20px ${DISPLAY}`, color: FORGE, align: 'center' })
    text(ctx, 'PLAYERS', x - 220, TOP - 20, head)
    text(ctx, 'CONV.', x - 110, TOP - 20, head)
    text(ctx, 'VS FIELD', x, TOP - 20, head)
  })

  rows.forEach((r, i) => {
    const y = TOP + i * ROW
    const mid = y + ROW / 2
    if (i % 2 === 0) { ctx.fillStyle = INK_2; ctx.fillRect(PAD, y, W - PAD * 2, ROW) }
    drawInks(ctx, icons, r.inks, PAD + 10, mid, 30)
    text(ctx, pairName(r.inks), NAME_X, mid, { font: `600 24px ${DISPLAY}`, baseline: 'middle' })
    const cell = { font: `600 24px ${DISPLAY}`, align: 'right', baseline: 'middle' }
    text(ctx, String(r.players), DAY1_X, mid, cell)
    r.stages.forEach((s, k) => {
      const x = stageX(k)
      text(ctx, String(s.count), x - 220, mid, cell)
      text(ctx, pct(s.conversion), x - 110, mid, { ...cell, color: MUTED })
      text(ctx, liftText(s.lift), x, mid, { ...cell, color: liftFill(s.lift) })
    })
  })

  const fieldNote = labels.map((label, i) => `${label} ${field.stages[i].count.toLocaleString('en-US')} (${pct(field.stages[i].conversion)})`).join(' · ')
  drawFooter(ctx, W, H, PAD, `${field.players.toLocaleString('en-US')} decks · ${fieldNote} · 1.25× = 25% better than the field`, cam)
  return canvas
}
