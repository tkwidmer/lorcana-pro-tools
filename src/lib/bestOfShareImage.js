// Tournament Lookup's Best Of tab as a branded PNG: the best-ranked player on
// each ink pair, in InkbornForge's ink-black and forge-gold.
import { ordinal } from './resultsArchive'

const INK = '#17171a'
const ROW_ALT = '#1f1f23'
const PAPER = '#f2f1ee'
const MUTED = '#9a9893'
const FORGE = '#d6a24a'
const LINE = '#2c2c31'
const SANS = '"Source Sans 3", ui-sans-serif, system-ui, sans-serif'
const DISPLAY = '"Oswald", "Arial Narrow", ui-sans-serif, sans-serif'

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load ${src}`))
    img.src = src
  })
}

function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1)
  return `${s}…`
}

// rows: bestOfLeaders() output. subtitle: event name and round.
export async function generateBestOfImage({ rows, eventName, subtitle }) {
  const inks = [...new Set(rows.flatMap((r) => r.inks))]
  const [logo, ...inkImgs] = await Promise.all([
    loadImage('/inkborn_forge_mark.png'),
    ...inks.map((c) => loadImage(`/ink/${c}.png`)),
    document.fonts.load(`500 28px ${DISPLAY}`),
    document.fonts.load(`600 18px ${SANS}`),
  ])
  const inkImg = Object.fromEntries(inks.map((c, i) => [c, inkImgs[i]]))

  const DPR = 3
  const W = 720
  const PAD = 36
  const BRAND_H = 64
  const TITLE_H = 92
  const HEAD_H = 36
  const ROW_H = 44
  const FOOTER_H = 52
  const H = BRAND_H + TITLE_H + HEAD_H + rows.length * ROW_H + FOOTER_H

  const canvas = document.createElement('canvas')
  canvas.width = W * DPR
  canvas.height = H * DPR
  const ctx = canvas.getContext('2d')
  ctx.scale(DPR, DPR)
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'middle'

  // Brand bar: logo tile, wordmark, url.
  ctx.drawImage(logo, PAD, (BRAND_H - 32) / 2, 32, 32)
  ctx.font = `500 18px ${DISPLAY}`
  ctx.fillStyle = PAPER
  ctx.textAlign = 'left'
  ctx.letterSpacing = '2px'
  ctx.fillText('INKBORNFORGE', PAD + 44, BRAND_H / 2)
  ctx.letterSpacing = '0px'
  ctx.font = `600 14px ${SANS}`
  ctx.fillStyle = FORGE
  ctx.textAlign = 'right'
  ctx.fillText('inkbornforge.com', W - PAD, BRAND_H / 2)
  ctx.fillRect(0, BRAND_H - 3, W, 3)

  // Title.
  ctx.textAlign = 'left'
  ctx.font = `500 28px ${DISPLAY}`
  ctx.fillStyle = PAPER
  ctx.letterSpacing = '1px'
  ctx.fillText('BEST OF: TOP PLAYER ON EACH INK PAIR', PAD, BRAND_H + 36)
  ctx.letterSpacing = '0px'
  ctx.font = `15px ${SANS}`
  ctx.fillStyle = MUTED
  ctx.fillText(fit(ctx, [eventName, subtitle].filter(Boolean).join(' · '), W - PAD * 2), PAD, BRAND_H + 68)

  // Column headings.
  const X_INKS = PAD + 12
  const X_PLAYER = PAD + 96
  const X_STANDING = W - PAD - 120
  const X_RECORD = W - PAD - 12
  let y = BRAND_H + TITLE_H
  ctx.font = `600 12px ${SANS}`
  ctx.fillStyle = MUTED
  ctx.letterSpacing = '1.5px'
  ctx.fillText('INKS', X_INKS, y + HEAD_H / 2)
  ctx.fillText('PLAYER', X_PLAYER, y + HEAD_H / 2)
  ctx.textAlign = 'right'
  ctx.fillText('STANDING', X_STANDING, y + HEAD_H / 2)
  ctx.fillText('RECORD', X_RECORD, y + HEAD_H / 2)
  ctx.letterSpacing = '0px'
  y += HEAD_H
  ctx.fillStyle = LINE
  ctx.fillRect(PAD, y - 1, W - PAD * 2, 1)

  rows.forEach((row, i) => {
    const mid = y + ROW_H / 2
    if (i % 2 === 1) {
      ctx.fillStyle = ROW_ALT
      ctx.fillRect(PAD, y, W - PAD * 2, ROW_H)
    }
    row.inks.forEach((c, ci) => ctx.drawImage(inkImg[c], X_INKS + ci * 28, mid - 13, 26, 26))
    ctx.textAlign = 'left'
    ctx.font = `600 18px ${SANS}`
    ctx.fillStyle = row.entry ? PAPER : MUTED
    const name = row.entry ? row.entry.user_event_status.best_identifier : 'No player yet'
    ctx.fillText(fit(ctx, name, X_STANDING - X_PLAYER - 90), X_PLAYER, mid)
    if (row.entry) {
      ctx.textAlign = 'right'
      ctx.font = `18px ${SANS}`
      ctx.fillStyle = PAPER
      ctx.fillText(ordinal(row.entry.rank), X_STANDING, mid)
      ctx.font = `600 18px ${SANS}`
      ctx.fillStyle = FORGE
      ctx.fillText(row.entry.match_record, X_RECORD, mid)
    }
    y += ROW_H
  })

  ctx.fillStyle = LINE
  ctx.fillRect(PAD, y, W - PAD * 2, 1)
  ctx.textAlign = 'left'
  ctx.font = `13px ${SANS}`
  ctx.fillStyle = MUTED
  ctx.fillText('Source: Ravensburger Play Hub standings · inkbornforge.com/tournament-lookup', PAD, y + FOOTER_H / 2)

  return canvas
}

export function downloadBestOfImage(canvas, filename) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}
