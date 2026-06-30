const INK_HEX = {
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

// rows: [{ round, result, score, opponent, oppColors: string[], onPlay: bool|null }]
export function generateShareImage({ playerName, rank, totalPlayers, record, matchPoints, winPct, eventName, rows }) {
  const DPR   = 2
  const W     = 1200
  const PAD   = 52
  const CW    = W - PAD * 2

  const HEADER_H     = 64
  const PLAYER_H     = 96
  const TABLE_HDR_H  = 40
  const ROW_H        = 54
  const FOOTER_H     = 52
  const DIVIDER      = 1

  const H = HEADER_H + PLAYER_H + TABLE_HDR_H + rows.length * ROW_H + FOOTER_H + 20

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
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = '#475569'
    ctx.textAlign = 'right'
    ctx.fillText(clip(eventName, 60), W - PAD, HEADER_H / 2)
  }

  // Divider
  ctx.strokeStyle = '#1E293B'
  ctx.lineWidth = DIVIDER
  ctx.beginPath()
  ctx.moveTo(PAD, HEADER_H)
  ctx.lineTo(W - PAD, HEADER_H)
  ctx.stroke()

  // ── Player / Stats ──────────────────────────────────────────────────────────
  const playerMid = HEADER_H + PLAYER_H / 2

  ctx.textAlign = 'left'
  ctx.font = 'bold 30px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = '#F1F5F9'
  ctx.fillText(clip(playerName, 30), PAD + 6, playerMid - 16)

  const statsItems = [
    record,
    `${matchPoints} pts`,
    `${winPct}% WR`,
    rank ? `Rank #${rank}` + (totalPlayers ? ` of ${totalPlayers}` : '') : null,
  ].filter(Boolean)

  ctx.font = '16px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = '#94A3B8'
  ctx.fillText(statsItems.join('  ·  '), PAD + 6, playerMid + 16)

  // Divider
  ctx.strokeStyle = '#1E293B'
  ctx.beginPath()
  ctx.moveTo(PAD, HEADER_H + PLAYER_H)
  ctx.lineTo(W - PAD, HEADER_H + PLAYER_H)
  ctx.stroke()

  // ── Column layout ────────────────────────────────────────────────────────────
  //   Rnd  Result  Score  Opponent       OppColors        Play
  const col = {
    rnd:    PAD + 6,
    result: PAD + 72,
    score:  PAD + 196,
    opp:    PAD + 300,
    colors: PAD + 720,
    play:   PAD + 900,
  }

  // Table header
  const tblHdrY = HEADER_H + PLAYER_H + TABLE_HDR_H / 2
  ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = '#334155'
  ctx.textAlign = 'left'
  ;[
    [col.rnd,    'RND'],
    [col.result, 'RESULT'],
    [col.score,  'SCORE'],
    [col.opp,    'OPPONENT'],
    [col.colors, 'OPP COLORS'],
    [col.play,   'PLAY / DRAW'],
  ].forEach(([x, label]) => ctx.fillText(label, x, tblHdrY))

  // ── Rows ─────────────────────────────────────────────────────────────────────
  const tableTop = HEADER_H + PLAYER_H + TABLE_HDR_H

  rows.forEach((row, i) => {
    const rowY  = tableTop + i * ROW_H
    const midY  = rowY + ROW_H / 2

    // Alternating stripe
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.025)'
      ctx.fillRect(PAD, rowY, CW, ROW_H)
    }

    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    // Round
    ctx.font = 'bold 14px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = '#64748B'
    ctx.fillText(`R${row.round}`, col.rnd, midY)

    // Result badge
    const rs = RESULT_STYLES[row.result] ?? RESULT_STYLES.DRAW
    ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif'
    const badgeTxt = row.result
    const badgeW   = ctx.measureText(badgeTxt).width + 20
    const badgeH   = 24
    roundRect(ctx, col.result, midY - badgeH / 2, badgeW, badgeH, 4)
    ctx.fillStyle = rs.bg
    ctx.fill()
    ctx.fillStyle = rs.text
    ctx.textAlign = 'center'
    ctx.fillText(badgeTxt, col.result + badgeW / 2, midY)
    ctx.textAlign = 'left'

    // Score
    ctx.font = '14px ui-monospace, monospace'
    ctx.fillStyle = '#64748B'
    ctx.fillText(row.score || '—', col.score, midY)

    // Opponent
    ctx.font = '15px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = '#CBD5E1'
    ctx.fillText(clip(row.opponent, 26), col.opp, midY)

    // Opp colors — dots + names
    if (row.oppColors?.length) {
      const dotR = 9
      row.oppColors.forEach((color, ci) => {
        const cx = col.colors + ci * (dotR * 2 + 8) + dotR
        ctx.beginPath()
        ctx.arc(cx, midY, dotR, 0, Math.PI * 2)
        ctx.fillStyle = INK_HEX[color] ?? '#6B7280'
        ctx.fill()
      })
      const labelX = col.colors + row.oppColors.length * (dotR * 2 + 8) + 6
      ctx.font = '12px ui-sans-serif, system-ui, sans-serif'
      ctx.fillStyle = '#475569'
      const colorLabel = row.oppColors.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(' / ')
      ctx.fillText(colorLabel, labelX, midY)
    } else {
      ctx.font = '13px ui-sans-serif, system-ui, sans-serif'
      ctx.fillStyle = '#1E293B'
      ctx.fillText('—', col.colors, midY)
    }

    // Play / Draw
    const pd = row.onPlay === true ? 'PLAY' : row.onPlay === false ? 'DRAW' : '—'
    ctx.font = `bold 13px ui-sans-serif, system-ui, sans-serif`
    ctx.fillStyle = row.onPlay === true ? '#4ADE80' : row.onPlay === false ? '#93C5FD' : '#1E293B'
    ctx.fillText(pd, col.play, midY)

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
