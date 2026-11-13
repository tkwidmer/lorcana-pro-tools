// Social-media PNGs of Tournament Lookup's Metagame, Matchups, Best Of and
// Teams tabs, in the site's brand (ink black, forge gold, Oswald + Source
// Sans 3) with the InkbornForge mark and URL. Data comes from
// tournamentInks.js and teams.js; the pure helpers are exported for tests,
// the draw functions need a browser canvas.
import { inkPairMeta, inkPairMatrix, winRate, playerInks, bestOfLeaders } from './tournamentInks'
import { ordinal } from './resultsArchive'
import { teamInitials } from './teams'

const INK = '#17171a'
const INK_2 = '#232328'
const LINE = '#34343b'
const PAPER = '#f2f1ee'
const MUTED = '#a3a29d'
const FORGE = '#d6a24a'
const DISPLAY = 'Oswald, "Arial Narrow", sans-serif'
const SANS = '"Source Sans 3", ui-sans-serif, system-ui, sans-serif'
const URL_TEXT = 'inkbornforge.com/tournament-lookup'
const DPR = 2
const FEW = 5 // cells under this many matches are drawn faded

export const INK_FILL = {
  amber: '#f4b223', amethyst: '#7c4ea0', emerald: '#2f9e5b', ruby: '#d1323f', sapphire: '#2a8fd0', steel: '#9aa3ad',
}

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

const imageCache = new Map()
function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve) => {
      const img = new Image()
      // Team logos live on Supabase storage; without CORS a cross-origin
      // image would taint the canvas, so a logo that refuses fails to load
      // and the team gets its initials instead.
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = src
    }))
  }
  return imageCache.get(src)
}

async function loadAssets(inkLists) {
  await Promise.all(['600 20px Oswald', '700 20px Oswald', '400 20px "Source Sans 3"', '600 20px "Source Sans 3"'].map((f) => document.fonts.load(f)))
  const inks = [...new Set(inkLists.flat())]
  const icons = Object.fromEntries(await Promise.all(inks.map(async (i) => [i, await loadImage(`/ink/${i}.png`)])))
  return { icons, mark: await loadImage('/inkborn_forge_mark.png') }
}

function newCanvas(w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w * DPR
  canvas.height = h * DPR
  const ctx = canvas.getContext('2d')
  ctx.scale(DPR, DPR)
  const bg = ctx.createLinearGradient(0, 0, w, h)
  bg.addColorStop(0, '#1d1d22')
  bg.addColorStop(1, INK)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = FORGE
  ctx.fillRect(0, 0, w, 6)
  return { canvas, ctx }
}

function text(ctx, str, x, y, { font, color = PAPER, align = 'left', baseline = 'alphabetic', alpha = 1 }) {
  ctx.globalAlpha = alpha
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.fillText(str, x, y)
  ctx.globalAlpha = 1
}

function fitText(ctx, str, maxWidth, font) {
  ctx.font = font
  if (ctx.measureText(str).width <= maxWidth) return str
  let s = str
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1)
  return `${s}…`
}

// Brand lockup top-left; title, event name and the event line top-right.
function drawHeader(ctx, w, pad, { mark, title, structure, progress }) {
  if (mark) {
    ctx.save()
    roundRect(ctx, pad, 34, 52, 52, 3)
    ctx.clip()
    ctx.drawImage(mark, pad, 34, 52, 52)
    ctx.restore()
  }
  text(ctx, 'INKBORNFORGE', pad + 66, 70, { font: `600 30px ${DISPLAY}`, color: PAPER })
  text(ctx, title, w - pad, 76, { font: `700 56px ${DISPLAY}`, color: FORGE, align: 'right' })
  const name = fitText(ctx, structure.eventName.toUpperCase(), w - pad * 2 - 360, `600 28px ${DISPLAY}`)
  text(ctx, name, w - pad, 116, { font: `600 28px ${DISPLAY}`, align: 'right' })
  text(ctx, eventLine(structure, progress).toUpperCase(), w - pad, 148, { font: `500 20px ${DISPLAY}`, color: MUTED, align: 'right' })
}

function drawFooter(ctx, w, h, pad, note) {
  ctx.fillStyle = LINE
  ctx.fillRect(pad, h - 64, w - pad * 2, 1)
  text(ctx, note, pad, h - 30, { font: `400 18px ${SANS}`, color: MUTED })
  text(ctx, URL_TEXT, w - pad, h - 30, { font: `600 22px ${DISPLAY}`, color: FORGE, align: 'right' })
}

function drawInks(ctx, icons, inks, x, yMid, size) {
  inks.forEach((ink, i) => {
    if (icons[ink]) ctx.drawImage(icons[ink], x + i * (size + 4), yMid - size / 2, size, size)
  })
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

const pct = (v, digits = 1) => (v == null ? '—' : `${v.toFixed(digits)}%`)

// The field by ink pair: one row per pair with a bar painted half in each ink.
export async function renderMetaShareImage({ matches, structure }) {
  const rows = inkPairMeta(matches)
  const { icons, mark } = await loadAssets(rows.map((r) => r.inks))
  const W = 1200
  const PAD = 56
  const ROW = 58
  const TOP = 236
  const H = TOP + rows.length * ROW + 110
  const { canvas, ctx } = newCanvas(W, H)
  drawHeader(ctx, W, PAD, { mark, title: 'METAGAME', structure })

  const players = rows.reduce((s, r) => s + r.players, 0)
  const NAME_X = PAD + 82
  const BAR_X = PAD + 400
  const BAR_W = W - PAD - BAR_X - 300
  const COLS = { players: W - PAD - 210, share: W - PAD - 110, win: W - PAD }
  const head = { font: `500 17px ${DISPLAY}`, color: MUTED, align: 'right' }
  text(ctx, 'INK PAIR', NAME_X, TOP - 20, { ...head, align: 'left' })
  text(ctx, 'PLAYERS', COLS.players, TOP - 20, head)
  text(ctx, 'SHARE', COLS.share, TOP - 20, head)
  text(ctx, 'WIN %', COLS.win, TOP - 20, head)

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
  })

  drawFooter(ctx, W, H, PAD, `${players.toLocaleString('en-US')} players with a submitted deck · win % vs other pairs, draws as half, mirrors left out`)
  return canvas
}

// Row pair's match win rate against each column pair, with an overall
// "vs field" column, sized to the number of pairs.
export async function renderMatchupShareImage({ matches, structure }) {
  const pairs = inkPairMeta(matches)
  const cells = inkPairMatrix(matches)
  const { icons, mark } = await loadAssets(pairs.map((p) => p.inks))
  const PAD = 48
  const LABEL_W = 270
  const FIELD_W = 112
  const CELL = 96
  const GAP = 6
  const ROW = 74
  const W = Math.max(1400, PAD * 2 + LABEL_W + FIELD_W + GAP + pairs.length * (CELL + GAP))
  const HEAD_TOP = 196
  const TOP = HEAD_TOP + 96
  const H = TOP + pairs.length * (ROW + GAP) + 100
  const { canvas, ctx } = newCanvas(W, H)
  drawHeader(ctx, W, PAD, { mark, title: 'MATCHUPS', structure })

  const fieldX = PAD + LABEL_W + GAP
  const colX = (j) => fieldX + FIELD_W + GAP + j * (CELL + GAP)
  text(ctx, 'VS FIELD', fieldX + FIELD_W / 2, HEAD_TOP + 62, { font: `600 18px ${DISPLAY}`, color: FORGE, align: 'center' })
  text(ctx, 'overall', fieldX + FIELD_W / 2, HEAD_TOP + 84, { font: `400 15px ${SANS}`, color: MUTED, align: 'center' })
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
    const fieldN = row.wins + row.losses + row.draws
    text(ctx, pct(row.winRate), fieldX + FIELD_W / 2, mid - 2, { font: `700 26px ${DISPLAY}`, color: FORGE, align: 'center' })
    text(ctx, `${fieldN}m`, fieldX + FIELD_W / 2, mid + 22, { font: `400 15px ${SANS}`, color: MUTED, align: 'center' })

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

  drawFooter(ctx, W, H, PAD, `Row deck's match win % vs column deck · draws count as half · small number = matches · faded = under ${FEW} matches · ${decided.toLocaleString('en-US')} matches between different pairs`)
  return canvas
}

// Top teams by their best individual placement: logo, name, the player who
// holds that placement, combined record and members playing / in the cut.
// `rows` come from topTeamsByBestPlacement().
export async function renderTeamsShareImage({ rows, structure }) {
  const { mark } = await loadAssets([])
  const logos = await Promise.all(rows.map((r) => (r.logoUrl ? loadImage(r.logoUrl) : null)))
  const W = 1200
  const PAD = 56
  const ROW = 128
  const GAP = 12
  const TOP = 236
  const H = TOP + rows.length * (ROW + GAP) + 100
  const { canvas, ctx } = newCanvas(W, H)
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

  drawFooter(ctx, W, H, PAD, 'Ranked by each team\'s best individual placement · record is every member in the event combined')
  return canvas
}

// Best Of promo leaders: the best-ranked player on each of the 15 ink pairs.
export async function renderBestOfShareImage({ matches, structure, standings, standingsLabel }) {
  const rows = bestOfLeaders(standings, playerInks(matches))
  const { icons, mark } = await loadAssets(rows.map((r) => r.inks))
  const W = 1200
  const PAD = 56
  const ROW = 58
  const TOP = 236
  const H = TOP + rows.length * ROW + 110
  const { canvas, ctx } = newCanvas(W, H)
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
    text(ctx, fitText(ctx, name, COLS.standing - NAME_X - 140, `600 26px ${SANS}`), NAME_X, mid, {
      font: `600 26px ${SANS}`, color: r.entry ? PAPER : MUTED, baseline: 'middle',
    })
    if (!r.entry) return
    text(ctx, ordinal(r.entry.rank), COLS.standing, mid, { font: `600 24px ${DISPLAY}`, align: 'right', baseline: 'middle' })
    text(ctx, r.entry.match_record, COLS.record, mid, { font: `600 24px ${DISPLAY}`, color: FORGE, align: 'right', baseline: 'middle' })
  })

  drawFooter(ctx, W, H, PAD, 'Highest standing on each ink pair wins its Best Of promo')
  return canvas
}
