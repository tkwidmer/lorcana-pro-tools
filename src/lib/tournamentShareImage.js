export const INK_HEX = {
  amber:    '#F59E0B',
  amethyst: '#8B5CF6',
  emerald:  '#10B981',
  ruby:     '#EF4444',
  sapphire: '#3B82F6',
  steel:    '#9CA3AF',
}

const RESULT_STYLES = {
  WIN:  { bg: '#14532D', text: '#4ADE80' },
  LOSS: { bg: '#7F1D1D', text: '#FCA5A5' },
  DRAW: { bg: '#292524', text: '#A8A29E' },
  BYE:  { bg: '#1E3A5F', text: '#93C5FD' },
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
  if (!str) return '—'
  return str.length <= max ? str : str.slice(0, max - 1) + '…'
}

// Cached by color — the same handful of ink icons get reused across every row/regeneration.
const inkImageCache = new Map()

function loadInkImage(color) {
  if (inkImageCache.has(color)) return inkImageCache.get(color)
  const promise = new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = `/ink/${color}.png`
  })
  inkImageCache.set(color, promise)
  return promise
}

// rows: [{ round, result, score, opponent, oppColors: string[], onPlay: bool|null }]
// Renders a compact card sized to fit its content — each match is a two-line entry
// (rather than a wide table) so the card stays legible and portrait-ish for social
// media at any round count, without padding short match histories out further.
export async function generateShareImage({ playerName, rank, totalPlayers, record, matchPoints, winPct, eventName, rows }) {
  const usedColors = [...new Set(rows.flatMap((r) => r.oppColors ?? []))]
  const inkImages = Object.fromEntries(
    await Promise.all(usedColors.map(async (c) => [c, await loadInkImage(c)]))
  )

  const DPR   = 4
  // Narrow enough that a typical 5-9 round match history is naturally taller than
  // wide, without needing a fixed portrait floor that pads short histories with
  // empty space — height always tracks content directly.
  const W     = 640
  const PAD   = 40
  const CW    = W - PAD * 2

  const HEADER_H  = 56
  const PLAYER_H  = 120
  const SECTION_H = 36
  const ROW_H     = 72
  const FOOTER_H  = 44

  const H = HEADER_H + PLAYER_H + SECTION_H + rows.length * ROW_H + FOOTER_H

  const canvas = document.createElement('canvas')
  canvas.width  = W  * DPR
  canvas.height = H  * DPR
  canvas.style.width  = `${W}px`
  canvas.style.height = `${H}px`

  const ctx = canvas.getContext('2d')
  ctx.scale(DPR, DPR)

  // ── Background ──────────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#0F172A')
  bg.addColorStop(1, '#1E1B4B')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Left accent bar
  ctx.fillStyle = '#6366F1'
  ctx.fillRect(0, 0, 5, H)

  // ── Header ──────────────────────────────────────────────────────────────────
  ctx.textBaseline = 'middle'

  ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = '#818CF8'
  ctx.textAlign = 'left'
  ctx.fillText('LORCANA PRO TOOLS', PAD + 6, HEADER_H / 2)

  if (eventName) {
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = '#475569'
    ctx.textAlign = 'right'
    ctx.fillText(clip(eventName, 24), W - PAD, HEADER_H / 2)
  }

  // Divider
  ctx.strokeStyle = '#1E293B'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, HEADER_H)
  ctx.lineTo(W - PAD, HEADER_H)
  ctx.stroke()

  // ── Player / Stats ──────────────────────────────────────────────────────────
  const playerMid = HEADER_H + PLAYER_H / 2

  ctx.textAlign = 'left'
  ctx.font = 'bold 27px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = '#F1F5F9'
  ctx.fillText(clip(playerName, 19), PAD + 6, playerMid - 26)

  if (rank) {
    ctx.font = 'bold 17px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = '#818CF8'
    ctx.textAlign = 'right'
    ctx.fillText(`#${rank}` + (totalPlayers ? ` / ${totalPlayers}` : ''), W - PAD, playerMid - 26)
    ctx.textAlign = 'left'
  }

  const statsItems = [record, `${matchPoints} pts`, `${winPct}% WR`].filter(Boolean)
  ctx.font = '14px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = '#94A3B8'
  ctx.fillText(statsItems.join('   ·   '), PAD + 6, playerMid + 10)

  // Divider
  ctx.strokeStyle = '#1E293B'
  ctx.beginPath()
  ctx.moveTo(PAD, HEADER_H + PLAYER_H)
  ctx.lineTo(W - PAD, HEADER_H + PLAYER_H)
  ctx.stroke()

  // ── Section label ────────────────────────────────────────────────────────────
  const sectionTop = HEADER_H + PLAYER_H
  ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = '#475569'
  ctx.textAlign = 'left'
  ctx.fillText('MATCH HISTORY', PAD + 6, sectionTop + SECTION_H / 2)

  // ── Rows (two lines each: round/result/score + opponent, then colors + play) ──
  const tableTop = sectionTop + SECTION_H

  rows.forEach((row, i) => {
    const rowY   = tableTop + i * ROW_H
    const line1Y = rowY + ROW_H * 0.34
    const line2Y = rowY + ROW_H * 0.72

    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.025)'
      ctx.fillRect(PAD, rowY, CW, ROW_H)
    }

    ctx.textBaseline = 'middle'

    // Line 1, left: round + result badge + score
    ctx.textAlign = 'left'
    ctx.font = 'bold 14px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = '#64748B'
    ctx.fillText(`R${row.round}`, PAD + 6, line1Y)

    const rs = RESULT_STYLES[row.result] ?? RESULT_STYLES.DRAW
    ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif'
    const badgeTxt = row.result
    const badgeW    = ctx.measureText(badgeTxt).width + 18
    const badgeH    = 22
    const badgeX    = PAD + 44
    roundRect(ctx, badgeX, line1Y - badgeH / 2, badgeW, badgeH, 4)
    ctx.fillStyle = rs.bg
    ctx.fill()
    ctx.fillStyle = rs.text
    ctx.textAlign = 'center'
    ctx.fillText(badgeTxt, badgeX + badgeW / 2, line1Y)

    ctx.textAlign = 'left'
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillStyle = '#64748B'
    ctx.fillText(row.score || '—', badgeX + badgeW + 12, line1Y)

    // Line 1, right: opponent name
    ctx.font = '14px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = '#E2E8F0'
    ctx.textAlign = 'right'
    ctx.fillText(clip(row.opponent, 16), W - PAD - 6, line1Y)

    // Line 2, left: ink icons + color label
    ctx.textAlign = 'left'
    if (row.oppColors?.length) {
      const iconSize = 18
      const step = iconSize + 5
      row.oppColors.forEach((color, ci) => {
        const cx = PAD + 6 + ci * step
        const img = inkImages[color]
        if (img) {
          ctx.drawImage(img, cx, line2Y - iconSize / 2, iconSize, iconSize)
        } else {
          ctx.beginPath()
          ctx.arc(cx + iconSize / 2, line2Y, iconSize / 2, 0, Math.PI * 2)
          ctx.fillStyle = INK_HEX[color] ?? '#6B7280'
          ctx.fill()
        }
      })
      const labelX = PAD + 6 + row.oppColors.length * step + 4
      ctx.font = '12px ui-sans-serif, system-ui, sans-serif'
      ctx.fillStyle = '#475569'
      const colorLabel = row.oppColors.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(' / ')
      ctx.fillText(colorLabel, labelX, line2Y)
    } else {
      ctx.font = '12px ui-sans-serif, system-ui, sans-serif'
      ctx.fillStyle = '#334155'
      ctx.fillText('—', PAD + 6, line2Y)
    }

    // Line 2, right: play/draw
    const pd = row.onPlay === true ? 'PLAY' : row.onPlay === false ? 'DRAW' : '—'
    ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = row.onPlay === true ? '#4ADE80' : row.onPlay === false ? '#93C5FD' : '#334155'
    ctx.textAlign = 'right'
    ctx.fillText(pd, W - PAD - 6, line2Y)

    // Row divider
    ctx.strokeStyle = '#1E293B'
    ctx.lineWidth   = 0.5
    ctx.beginPath()
    ctx.moveTo(PAD, rowY + ROW_H)
    ctx.lineTo(W - PAD, rowY + ROW_H)
    ctx.stroke()
  })

  // ── Footer ───────────────────────────────────────────────────────────────────
  const footerY = H - FOOTER_H / 2
  ctx.font = '12px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = '#1E293B'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('lorcana-pro-tools.vercel.app', W / 2, footerY)

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

export async function downloadShareImage(canvas, filename = 'tournament-result.jpg') {
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.95)
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
