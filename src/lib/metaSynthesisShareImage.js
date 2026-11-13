// MetaSynthesisPage's summary (prose blocks + the Most Played Archetypes
// table) as a share image in the InkbornForge brand. Social (4:5): one
// column. Video (16:9): prose left, the table right above the webcam corner.
import { INK_2, PAPER, MUTED, FORGE, WIN, LOSS, DISPLAY, SANS, frame, loadAssets, newCanvas, text, fitText, wrapText, drawHeader, drawFooter } from './shareBrand'

const PAD = 56
const TOP = 200
const BODY = `400 22px ${SANS}`
const INTRO = `600 22px ${SANS}`
const ITEM = `400 20px ${SANS}`
const BULLET = 26
const TABLE_ROW = 46

// Every line of the prose wrapped to `width`: [{ str, x, y, font, color }]
// with y relative to the top, and the total height.
function bodyLines(ctx, blocks, width) {
  const out = []
  let y = 0
  const add = (lines, x, font, color, lineH) => lines.forEach((str) => { y += lineH; out.push({ str, x, y, font, color }) })
  for (const b of blocks) {
    if (b.type === 'text') add(wrapText(ctx, b.text, width, BODY), 0, BODY, PAPER, 32)
    else {
      add(wrapText(ctx, b.intro, width, INTRO), 0, INTRO, PAPER, 32)
      b.items.forEach((item) => add(wrapText(ctx, item, width - BULLET, ITEM).map((l, i) => (i ? l : `•  ${l}`)), BULLET, ITEM, MUTED, 30))
    }
    y += 14
  }
  return { lines: out, height: y }
}

function drawTable(ctx, rows, x, y, w) {
  text(ctx, 'MOST PLAYED ARCHETYPES', x, y + 24, { font: `500 17px ${DISPLAY}`, color: MUTED })
  rows.forEach((a, i) => {
    const ry = y + 40 + i * TABLE_ROW
    const mid = ry + TABLE_ROW / 2
    if (i % 2 === 0) { ctx.fillStyle = INK_2; ctx.fillRect(x, ry, w, TABLE_ROW) }
    text(ctx, fitText(ctx, a.name, w - 260, `600 22px ${SANS}`), x + 12, mid, { font: `600 22px ${SANS}`, baseline: 'middle' })
    text(ctx, `${a.metaShare.toFixed(1)}%`, x + w - 130, mid, { font: `600 22px ${DISPLAY}`, color: FORGE, align: 'right', baseline: 'middle' })
    const color = a.winRate >= 52 ? WIN : a.winRate <= 48 ? LOSS : PAPER
    text(ctx, `${a.winRate.toFixed(1)}% WIN`, x + w - 12, mid, { font: `600 22px ${DISPLAY}`, color, align: 'right', baseline: 'middle' })
  })
  return rows.length ? 40 + rows.length * TABLE_ROW : 0
}

// `blocks`: the { type: 'text' | 'list', ... } sequence from metaSynthesis.js
// (whatever is rendered on the page); `topPlayed`: synthesis.topPlayed.
export async function generateMetaSynthesisImage({ title, subtitle, blocks, topPlayed, video }) {
  const { mark } = await loadAssets([])
  const tableRows = (topPlayed ?? []).slice(0, 5)
  const mctx = document.createElement('canvas').getContext('2d')

  // Prose width follows the frame. The narrowest frame the prose fits in
  // draws it largest; past the widest, the frame grows taller instead, and
  // widening it only shortens the prose, so a re-wrap at its width fits.
  const colW = (w) => (video ? w * 0.6 - PAD : w - PAD * 2)
  const tableH = tableRows.length ? 24 + 40 + tableRows.length * TABLE_ROW : 0
  const need = (w) => TOP + bodyLines(mctx, blocks, colW(w)).height + (video ? 24 : tableH + 110)
  const maxW = video ? 1920 : 1200
  let w = video ? 1400 : 960
  while (w < maxW && frame(video, w, need(w)).W > w) w += 20
  const { W, H, dpr, cam } = frame(video, w, need(w))
  const body = bodyLines(mctx, blocks, colW(W))

  const { canvas, ctx } = newCanvas(W, H, dpr)
  drawHeader(ctx, W, PAD, { mark, title: title.toUpperCase(), name: subtitle })
  body.lines.forEach((l) => text(ctx, l.str, PAD + l.x, TOP + l.y, { font: l.font, color: l.color }))
  if (video) drawTable(ctx, tableRows, W * 0.6 + 24, TOP, W * 0.4 - PAD - 24)
  else drawTable(ctx, tableRows, PAD, TOP + body.height + 24, W - PAD * 2)

  drawFooter(ctx, W, H, PAD, { note: 'Meta share and win rate from duels.ink games', url: 'inkbornforge.com/meta-synthesis', cam })
  return canvas
}
