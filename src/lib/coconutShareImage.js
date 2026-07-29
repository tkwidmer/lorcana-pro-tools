import { INK_HEX } from './tournamentShareImage'

// Cost 7+ all bucket together, matching the mana-curve convention used
// elsewhere in the app (DrawOddsPage's quest-pressure curves, etc.).
const CURVE_BUCKETS = [1, 2, 3, 4, 5, 6, 7]

function costBucket(cost) {
  const c = Math.max(1, cost ?? 1)
  return c >= 7 ? 7 : c
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function clip(str, max) {
  if (!str) return ''
  return str.length <= max ? str : str.slice(0, max - 1) + '…'
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = word
      if (lines.length === maxLines - 1) break
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) lines.length = maxLines
  return lines
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

function darken(hex, amount) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 0xff) * (1 - amount))
  const g = Math.round(((n >> 8) & 0xff) * (1 - amount))
  const b = Math.round((n & 0xff) * (1 - amount))
  return `rgb(${r}, ${g}, ${b})`
}

function drawBackground(ctx, W, H, inks) {
  const colors = (inks.length ? inks : ['steel']).map(i => INK_HEX[i] ?? '#6B7280')
  const grad = ctx.createLinearGradient(0, 0, W, H)
  if (colors.length === 1) {
    grad.addColorStop(0, darken(colors[0], 0.15))
    grad.addColorStop(1, darken(colors[0], 0.55))
  } else {
    colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), darken(c, 0.35)))
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)
}

function drawStatChip(ctx, x, y, w, value, label) {
  ctx.textAlign = 'center'
  ctx.font = 'bold 26px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(String(value), x + w / 2, y)
  ctx.font = '12px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillText(label, x + w / 2, y + 22)
}

function drawMiniCurve(ctx, x, y, w, h, curve) {
  const max = Math.max(1, ...CURVE_BUCKETS.map(b => curve[b]))
  const barW = w / CURVE_BUCKETS.length
  CURVE_BUCKETS.forEach((b, i) => {
    const barH = (curve[b] / max) * (h - 16)
    const bx = x + i * barW
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    roundRect(ctx, bx + barW * 0.15, y + (h - 16) - barH, barW * 0.7, barH || 1, 2)
    ctx.fill()
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.textAlign = 'center'
    ctx.fillText(b === 7 ? '7+' : String(b), bx + barW / 2, y + h)
  })
}

// showBadges is off for the featured Coconut card — it isn't "in the deck"
// at some cost/quantity in the traditional sense, it's the format anchor
// that's always in effect, so it gets pure art with no cost pip or count.
function drawCard(ctx, img, entry, x, y, w, h, showBadges = true) {
  roundRect(ctx, x, y, w, h, Math.max(4, w * 0.06))
  ctx.save()
  ctx.clip()
  if (img) {
    ctx.drawImage(img, x, y, w, h)
  } else {
    const ink = entry.color
    ctx.fillStyle = ink ? (INK_HEX[ink] ?? '#374151') : '#374151'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.textAlign = 'center'
    ctx.font = `bold ${Math.max(9, w * 0.09)}px ui-sans-serif, system-ui, sans-serif`
    const lines = wrapText(ctx, entry.name, w * 0.85, 4)
    const lineH = Math.max(11, w * 0.11)
    const startY = y + h / 2 - (lines.length - 1) * lineH / 2
    lines.forEach((line, i) => ctx.fillText(line, x + w / 2, startY + i * lineH))
  }
  ctx.restore()
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1
  roundRect(ctx, x, y, w, h, Math.max(4, w * 0.06))
  ctx.stroke()

  if (!showBadges) return

  // Cost pip (top-left)
  const pipR = Math.max(9, w * 0.11)
  ctx.beginPath()
  ctx.arc(x + pipR + 4, y + pipR + 4, pipR, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(15,15,20,0.85)'
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold ${Math.max(9, pipR)}px ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(entry.cost ?? '?'), x + pipR + 4, y + pipR + 5)

  // Quantity badge (top-right)
  const badgeText = `${entry.qty}x`
  ctx.font = `bold ${Math.max(9, w * 0.1)}px ui-sans-serif, system-ui, sans-serif`
  const badgeW = ctx.measureText(badgeText).width + w * 0.1
  const badgeH = Math.max(16, w * 0.16)
  roundRect(ctx, x + w - badgeW - 4, y + 4, badgeW, badgeH, 4)
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
// above the grid is a separate, badge-free "built around this" header, not a
// stand-in for that card's normal grid slot.
export async function generateCoconutDeckShareImage({ deckName, coconutName, coconutImageUrl, inks, entries }) {
  const sorted = [...entries].sort((a, b) => (a.cost - b.cost) || a.fullName.localeCompare(b.fullName))

  let totalCards = 0
  let uninkable = 0
  const typeCounts = {}
  const curveAll = Object.fromEntries(CURVE_BUCKETS.map(b => [b, 0]))
  for (const e of sorted) {
    totalCards += e.qty
    typeCounts[e.type] = (typeCounts[e.type] ?? 0) + e.qty
    if (e.inkwell === false) uninkable += e.qty
    curveAll[costBucket(e.cost)] += e.qty
  }

  const [coconutImg, ...cardImages] = await Promise.all([
    loadImage(coconutImageUrl),
    ...sorted.map(e => loadImage(e.imageUrl)),
  ])

  const DPR = 2
  const W = 1080
  const PAD = 44
  const FOOTER_H = 36

  // Header height is fixed content (title, subtitle, stats, mini curve); the
  // grid below it is sized to the deck's actual card count rather than a
  // worst-case, so a half-built deck doesn't render with a huge empty gap —
  // canvas height is the header + that grid + footer, not a fixed portrait
  // constant. A finished ~60-card deck naturally lands close to portrait.
  const headerTop = PAD + 34
  const statsY = headerTop + 26 + 40
  const curveY = statsY + 34
  const dividerY = curveY + 56 + 16
  const gridTop = dividerY + 20

  const gridW = W - PAD * 2
  const cols = 8
  const gap = 8
  const cellW = (gridW - gap * (cols - 1)) / cols
  const cellH = cellW * 1.4
  const cellStepX = cellW + gap
  const cellStepY = cellH + gap

  const totalCells = sorted.length + 4 // featured Coconut art reserves an extra 2x2 block
  const rows = Math.ceil(totalCells / cols)
  const gridH = rows * cellH + (rows - 1) * gap

  const H = gridTop + gridH + 24 + FOOTER_H

  const canvas = document.createElement('canvas')
  canvas.width = W * DPR
  canvas.height = H * DPR
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`
  const ctx = canvas.getContext('2d')
  ctx.scale(DPR, DPR)

  drawBackground(ctx, W, H, inks)

  // ── Header ──────────────────────────────────────────────────────────────
  ctx.textAlign = 'left'
  ctx.font = 'bold 34px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(clip(deckName, 26), PAD, headerTop)

  ctx.font = '15px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillText(`[Format Coconut] · Built around ${clip(coconutName, 30)}`, PAD, headerTop + 26)

  const statOrder = ['Character', 'Action', 'Song', 'Item', 'Location']
  const stats = [['Cards', totalCards], ...statOrder.filter(t => typeCounts[t]).map(t => [`${t}${typeCounts[t] === 1 ? '' : 's'}`, typeCounts[t]])]
  if (uninkable) stats.push(['Uninkable', uninkable])
  const chipW = (W - PAD * 2) / stats.length
  stats.forEach(([label, value], i) => drawStatChip(ctx, PAD + i * chipW, statsY, chipW, value, label))

  drawMiniCurve(ctx, PAD, curveY, W - PAD * 2, 56, curveAll)

  ctx.strokeStyle = 'rgba(255,255,255,0.2)'
  ctx.beginPath()
  ctx.moveTo(PAD, dividerY)
  ctx.lineTo(W - PAD, dividerY)
  ctx.stroke()

  // ── Card grid ───────────────────────────────────────────────────────────

  drawCard(ctx, coconutImg, { name: coconutName, color: null }, PAD, gridTop, cellW * 2 + gap, cellH * 2 + gap, false)

  let idx = 0
  for (let cellIdx = 0; cellIdx < rows * cols && idx < sorted.length; cellIdx++) {
    const col = cellIdx % cols
    const row = Math.floor(cellIdx / cols)
    if (row < 2 && col < 2) continue // reserved for the featured Coconut art
    const entry = sorted[idx]
    const img = cardImages[idx]
    const x = PAD + col * cellStepX
    const y = gridTop + row * cellStepY
    drawCard(ctx, img, entry, x, y, cellW, cellH)
    idx++
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  ctx.font = '13px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.textAlign = 'center'
  ctx.fillText('lorcana-pro-tools.vercel.app', W / 2, H - FOOTER_H / 2 + 4)

  return canvas
}
