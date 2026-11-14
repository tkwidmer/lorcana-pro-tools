// A player's tournament result (Tournament Lookup's match history) as a
// share image in the InkbornForge brand, plus the download / copy / native
// share helpers every share image uses.
import { INK_2, LINE, PAPER, MUTED, FORGE, WIN, LOSS, DISPLAY, SANS, layout, loadAssets, newCanvas, text, fitText, drawHeader, drawFooter, drawInks, roundRect } from './shareBrand'

const RESULT_STYLES = {
  WIN: { bg: '#1f4d33', color: WIN },
  LOSS: { bg: '#5c2626', color: LOSS },
  DRAW: { bg: LINE, color: PAPER },
  BYE: { bg: LINE, color: MUTED },
}

const inkLabel = (inks) => inks.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(' / ')

// rows: [{ round, result, score, opponent, oppColors: string[], onPlay: bool|null }]
// One row per match under a strip of the player's rank, record, points and
// win rate; `video` lays it out 16:9 with the webcam corner.
export async function generateShareImage({ playerName, rank, totalPlayers, record, matchPoints, winPct, eventName, rows, video }) {
  const { icons, mark } = await loadAssets(rows.map((r) => r.oppColors ?? []))
  const PAD = 56
  const TOP = 340
  const { W, H, ROW, dpr, cam } = layout({ video, w: 1060, top: TOP, bottom: 110, n: rows.length, row: 58, maxRow: 1.8 })
  const { canvas, ctx } = newCanvas(W, H, dpr)
  drawHeader(ctx, W, PAD, { mark, title: 'RESULT', name: playerName, line: eventName })

  const stats = [
    ['STANDING', rank ? `#${rank}${totalPlayers ? ` / ${totalPlayers}` : ''}` : '—'],
    ['RECORD', record],
    ['POINTS', String(matchPoints)],
    ['WIN %', `${winPct}%`],
  ]
  const chipW = (W - PAD * 2) / stats.length
  stats.forEach(([label, value], i) => {
    const x = PAD + i * chipW
    ctx.fillStyle = INK_2
    roundRect(ctx, x, 180, chipW - 12, 92, 4); ctx.fill()
    text(ctx, value, x + 20, 236, { font: `700 44px ${DISPLAY}`, color: i === 0 ? FORGE : PAPER })
    text(ctx, label, x + 20, 262, { font: `500 16px ${DISPLAY}`, color: MUTED })
  })

  const COLS = { round: PAD + 10, result: PAD + 76, score: PAD + 186, name: PAD + 280, deck: W - PAD - 380, play: W - PAD - 10 }
  const head = { font: `500 17px ${DISPLAY}`, color: MUTED }
  text(ctx, 'ROUND', COLS.round, TOP - 20, head)
  text(ctx, 'RESULT', COLS.result, TOP - 20, head)
  text(ctx, 'SCORE', COLS.score, TOP - 20, head)
  text(ctx, 'OPPONENT', COLS.name, TOP - 20, head)
  text(ctx, 'DECK', COLS.deck, TOP - 20, head)
  text(ctx, 'PLAY / DRAW', COLS.play, TOP - 20, { ...head, align: 'right' })

  rows.forEach((r, i) => {
    const y = TOP + i * ROW
    const mid = y + ROW / 2
    if (i % 2 === 0) { ctx.fillStyle = INK_2; ctx.fillRect(PAD, y, W - PAD * 2, ROW) }
    const mono = { font: `600 24px ${DISPLAY}`, baseline: 'middle' }
    text(ctx, `R${r.round}`, COLS.round, mid, { ...mono, color: MUTED })
    const rs = RESULT_STYLES[r.result] ?? RESULT_STYLES.DRAW
    ctx.fillStyle = rs.bg
    roundRect(ctx, COLS.result, mid - 16, 84, 32, 3); ctx.fill()
    text(ctx, r.result, COLS.result + 42, mid + 1, { font: `600 18px ${DISPLAY}`, color: rs.color, align: 'center', baseline: 'middle' })
    text(ctx, r.score || '—', COLS.score, mid, mono)
    text(ctx, fitText(ctx, r.opponent || '—', COLS.deck - COLS.name - 24, `600 24px ${SANS}`), COLS.name, mid, { font: `600 24px ${SANS}`, baseline: 'middle' })
    if (r.oppColors?.length) {
      drawInks(ctx, icons, r.oppColors, COLS.deck, mid, 30)
      text(ctx, inkLabel(r.oppColors), COLS.deck + r.oppColors.length * 34 + 8, mid, { font: `400 20px ${SANS}`, color: MUTED, baseline: 'middle' })
    } else {
      text(ctx, '—', COLS.deck, mid, { font: `400 20px ${SANS}`, color: MUTED, baseline: 'middle' })
    }
    const pd = r.onPlay === true ? 'PLAY' : r.onPlay === false ? 'DRAW' : '—'
    text(ctx, pd, COLS.play, mid, { ...mono, color: r.onPlay == null ? MUTED : FORGE, align: 'right' })
  })

  drawFooter(ctx, W, H, PAD, { note: 'Match history from the Ravensburger Play Hub', url: 'inkbornforge.com/tournament-lookup', cam })
  return canvas
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to render share image'))
    }, type, quality)
  })
}

export function videoFilename(filename) {
  return filename.replace(/(\.\w+)?$/, '-16x9.png')
}

export async function downloadShareImage(canvas, filename = 'tournament-result.jpg', type = 'image/jpeg') {
  const blob = await canvasToBlob(canvas, type, 0.95)
  // Phones: the share sheet has "Save Image" (iOS) / save to Photos (Android);
  // an anchor download lands in Files/Downloads instead.
  const file = new File([blob], filename, { type })
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] })
    return
  }
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function copyShareImageToClipboard(canvas) {
  const blob = await canvasToBlob(canvas, 'image/png')
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

// Native share sheet (iOS/Android) — the only reliable way to "share" an
// image on mobile, where clipboard image writes and anchor downloads are
// inconsistently supported across browsers.
export async function canNativeShareImage() {
  if (!navigator.canShare) return false
  const probe = new File([new Uint8Array([0])], 'probe.jpg', { type: 'image/jpeg' })
  try {
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

export async function nativeShareImage(canvas, filename, title) {
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.95)
  const file = new File([blob], filename, { type: 'image/jpeg' })
  await navigator.share({ files: [file], title })
}
