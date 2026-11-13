// A [Format Coconut] deck as a share image in the InkbornForge brand: the
// featured Coconut art, deck stats, cost curve and every card. Social (4:5):
// art with stats and curve beside it, the grid below. Video (16:9): art +
// stats + curve on the left, the grid on the right above the webcam band.
// The grid is sized to fit either way.
import { INK_2, PAPER, MUTED, FORGE, DISPLAY, SANS, INK_FILL, frame, loadAssets, newCanvas, text, wrapText, drawHeader, drawFooter, roundRect } from './shareBrand'

// Cost 7+ all bucket together, matching the mana-curve convention used
// elsewhere in the app (DrawOddsPage's quest-pressure curves, etc.).
const CURVE_BUCKETS = [1, 2, 3, 4, 5, 6, 7]
const PAD = 56
const CARD = 1.4 // card height / width

function costBucket(cost) {
  const c = Math.max(1, cost ?? 1)
  return c >= 7 ? 7 : c
}

// The column count that gives n cells of the given aspect the biggest size
// inside w x h.
export function gridFit(n, w, h, gap, aspect) {
  let best = null
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const rows = Math.ceil(Math.max(1, n) / cols)
    const cellW = Math.min((w - gap * (cols - 1)) / cols, (h - gap * (rows - 1)) / rows / aspect)
    if (!best || cellW > best.cellW) best = { cols, rows, cellW, cellH: cellW * aspect }
  }
  return best
}

// Card images come from LorcanaJSON's CDN, which doesn't send CORS headers —
// drawing a cross-origin image without them taints the canvas and breaks
// toBlob/toDataURL for the whole export. /api/card-image re-serves the same
// bytes from our own origin (allow-listed to that one host server-side) so
// the browser sees a same-origin image instead; local (non-Vercel) URLs like
// the bundled Coconut card art pass through unchanged.
function proxiedImageUrl(url) {
  return url.startsWith('/') ? url : `/api/card-image?url=${encodeURIComponent(url)}`
}

const IMAGE_TIMEOUT_MS = 8000
const imageCache = new Map()
function loadImage(url) {
  if (!url) return Promise.resolve(null)
  if (imageCache.has(url)) return imageCache.get(url)
  const promise = new Promise((resolve) => {
    const img = new Image()
    const timer = setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS)
    img.onload = () => { clearTimeout(timer); resolve(img) }
    img.onerror = () => { clearTimeout(timer); resolve(null) }
    img.src = proxiedImageUrl(url)
  })
  imageCache.set(url, promise)
  return promise
}

function drawStat(ctx, x, y, value, label) {
  text(ctx, String(value), x, y, { font: `700 36px ${DISPLAY}`, color: PAPER })
  text(ctx, label.toUpperCase(), x, y + 22, { font: `500 15px ${DISPLAY}`, color: MUTED })
}

function drawCurve(ctx, x, y, w, h, curve) {
  const max = Math.max(1, ...CURVE_BUCKETS.map(b => curve[b]))
  const barW = w / CURVE_BUCKETS.length
  CURVE_BUCKETS.forEach((b, i) => {
    const barH = (curve[b] / max) * (h - 22)
    const bx = x + i * barW
    ctx.fillStyle = FORGE
    roundRect(ctx, bx + barW * 0.15, y + (h - 22) - barH, barW * 0.7, barH || 1, 2)
    ctx.fill()
    text(ctx, b === 7 ? '7+' : String(b), bx + barW / 2, y + h, { font: `500 15px ${DISPLAY}`, color: MUTED, align: 'center' })
  })
}

// showBadges is off for the featured Coconut card — it isn't "in the deck"
// at some cost/quantity in the traditional sense, it's the format anchor
// that's always in effect, so it gets pure art with no cost pip or count.
function drawCard(ctx, img, entry, x, y, w, h, showBadges = true) {
  roundRect(ctx, x, y, w, h, Math.max(3, w * 0.05))
  ctx.save()
  ctx.clip()
  if (img) {
    ctx.drawImage(img, x, y, w, h)
  } else {
    const ink = entry.color
    ctx.fillStyle = ink ? (INK_FILL[ink] ?? INK_2) : INK_2
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.textAlign = 'center'
    ctx.font = `bold ${Math.max(9, w * 0.09)}px ${SANS}`
    const lines = wrapText(ctx, entry.name, w * 0.85, ctx.font).slice(0, 4)
    const lineH = Math.max(11, w * 0.11)
    const startY = y + h / 2 - (lines.length - 1) * lineH / 2
    lines.forEach((line, i) => ctx.fillText(line, x + w / 2, startY + i * lineH))
  }
  ctx.restore()
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1
  roundRect(ctx, x, y, w, h, Math.max(3, w * 0.05))
  ctx.stroke()

  if (!showBadges) return

  // Cost pip (top-left)
  const pipR = Math.max(9, w * 0.11)
  ctx.beginPath()
  ctx.arc(x + pipR + 4, y + pipR + 4, pipR, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(15,15,20,0.85)'
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold ${Math.max(9, pipR)}px ${SANS}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(entry.cost ?? '?'), x + pipR + 4, y + pipR + 5)

  // Quantity badge (top-right)
  const badgeText = `${entry.qty}x`
  ctx.font = `bold ${Math.max(9, w * 0.1)}px ${SANS}`
  const badgeW = ctx.measureText(badgeText).width + w * 0.1
  const badgeH = Math.max(16, w * 0.16)
  roundRect(ctx, x + w - badgeW - 4, y + 4, badgeW, badgeH, 3)
  ctx.fillStyle = 'rgba(15,15,20,0.85)'
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'center'
  ctx.fillText(badgeText, x + w - badgeW / 2 - 4, y + 4 + badgeH / 2 + 1)
  ctx.textBaseline = 'alphabetic'
}

// entries: [{ fullName, name, cost, type, color, qty, imageUrl, inkwell }] — the
// Coconut card's linked base card stays in this list like any other card (it's
// still part of the 60, at its real cost and quantity); the featured artwork
// is a separate, badge-free "built around this" image, not a stand-in for
// that card's normal grid slot.
export async function generateCoconutDeckShareImage({ deckName, coconutName, coconutImageUrl, entries, video }) {
  const sorted = [...entries].sort((a, b) => (a.cost - b.cost) || a.fullName.localeCompare(b.fullName))

  let totalCards = 0
  let uninkable = 0
  const typeCounts = {}
  const curve = Object.fromEntries(CURVE_BUCKETS.map(b => [b, 0]))
  for (const e of sorted) {
    totalCards += e.qty
    typeCounts[e.type] = (typeCounts[e.type] ?? 0) + e.qty
    if (e.inkwell === false) uninkable += e.qty
    curve[costBucket(e.cost)] += e.qty
  }
  const statOrder = ['Character', 'Action', 'Song', 'Item', 'Location']
  const stats = [['Cards', totalCards], ...statOrder.filter(t => typeCounts[t]).map(t => [`${t}${typeCounts[t] === 1 ? '' : 's'}`, typeCounts[t]])]
  if (uninkable) stats.push(['Uninkable', uninkable])

  const [{ mark }, coconutImg, ...cardImages] = await Promise.all([
    loadAssets([]),
    loadImage(coconutImageUrl),
    ...sorted.map(e => loadImage(e.imageUrl)),
  ])
  const header = { mark, title: 'COCONUT DECK', name: deckName, line: `[Format Coconut] · Built around ${coconutName}` }
  const footer = { note: 'Deck built in the InkbornForge Coconut Deck Builder', url: 'inkbornforge.com/coconut-deck-builder' }
  const gap = 8
  const TOP = 184

  if (video) {
    const { W, H, dpr, cam } = frame(true, 1920, 0)
    const { canvas, ctx } = newCanvas(W, H, dpr)
    drawHeader(ctx, W, PAD, header)
    const bottom = H - cam.h - 24
    const colW = W * 0.3
    const curveH = 90
    const artH = bottom - TOP - curveH - 24
    const artW = artH / CARD
    drawCard(ctx, coconutImg, { name: coconutName, color: null }, PAD, TOP, artW, artH, false)
    const step = Math.min(72, artH / stats.length)
    stats.forEach(([label, value], i) => drawStat(ctx, PAD + artW + 24, TOP + 36 + i * step, value, label))
    drawCurve(ctx, PAD, bottom - curveH, colW - PAD, curveH, curve)

    const areaX = PAD + colW
    const areaW = W - PAD - areaX
    const fit = gridFit(sorted.length, areaW, bottom - TOP, gap, CARD)
    const gx = areaX + (areaW - fit.cols * (fit.cellW + gap) + gap) / 2 // centered when height limits the cells
    sorted.forEach((entry, i) => {
      const x = gx + (i % fit.cols) * (fit.cellW + gap)
      const y = TOP + Math.floor(i / fit.cols) * (fit.cellH + gap)
      drawCard(ctx, cardImages[i], entry, x, y, fit.cellW, fit.cellH)
    })
    drawFooter(ctx, W, H, PAD, { ...footer, cam })
    return canvas
  }

  const { W, H, dpr } = frame(false, 1200, 0)
  const { canvas, ctx } = newCanvas(W, H, dpr)
  drawHeader(ctx, W, PAD, header)
  const artH = 320
  const artW = artH / CARD
  drawCard(ctx, coconutImg, { name: coconutName, color: null }, PAD, TOP, artW, artH, false)
  const sx = PAD + artW + 32
  const sw = W - PAD - sx
  stats.forEach(([label, value], i) => drawStat(ctx, sx + i * (sw / stats.length), TOP + 36, value, label))
  drawCurve(ctx, sx, TOP + 90, sw, artH - 90, curve)

  const gy = TOP + artH + 32
  const areaW = W - PAD * 2
  const fit = gridFit(sorted.length, areaW, H - 110 - gy, gap, CARD)
  const gx = PAD + (areaW - fit.cols * (fit.cellW + gap) + gap) / 2
  sorted.forEach((entry, i) => {
    drawCard(ctx, cardImages[i], entry, gx + (i % fit.cols) * (fit.cellW + gap), gy + Math.floor(i / fit.cols) * (fit.cellH + gap), fit.cellW, fit.cellH)
  })
  drawFooter(ctx, W, H, PAD, footer)
  return canvas
}
