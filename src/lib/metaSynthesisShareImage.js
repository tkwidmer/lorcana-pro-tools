// Renders MetaSynthesisPage's summary (prose blocks + a Most Played
// Archetypes mini-table) as a shareable canvas card. Follows the same
// visual language as tournamentShareImage.js — this repo's other
// canvas-card generator — so `ShareCardModal` and the copy/download/native-
// share flow can be reused as-is.

const FONT = 'ui-sans-serif, system-ui, sans-serif'

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word
    if (current && ctx.measureText(attempt).width > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = attempt
    }
  }
  if (current) lines.push(current)
  return lines
}

// `blocks`: the { type: 'text' | 'list', ... } sequence from metaSynthesis.js
// (synthesis.blocks, optionally concatenated with a comparison/weekTrend's
// blocks — whatever's currently rendered on the page).
// `topPlayed`: synthesis.topPlayed, for the mini reference table.
export async function generateMetaSynthesisImage({ title, subtitle, blocks, topPlayed }) {
  const DPR = 4
  const W = 640
  const PAD = 40
  const CW = W - PAD * 2
  const LINE_H = 20
  const BULLET_INDENT = 16

  // Text measurement needs a live 2D context before the real canvas (whose
  // size depends on the measured line counts) can be created.
  const measureCanvas = document.createElement('canvas')
  const mctx = measureCanvas.getContext('2d')

  const wrappedBlocks = blocks.map(b => {
    if (b.type === 'text') {
      mctx.font = `14px ${FONT}`
      return { type: 'text', lines: wrapText(mctx, b.text, CW) }
    }
    mctx.font = `bold 14px ${FONT}`
    const introLines = wrapText(mctx, b.intro, CW)
    mctx.font = `13px ${FONT}`
    const itemLines = b.items.map(item => wrapText(mctx, `•  ${item}`, CW - BULLET_INDENT))
    return { type: 'list', introLines, itemLines }
  })

  let bodyH = 0
  for (const b of wrappedBlocks) {
    if (b.type === 'text') {
      bodyH += b.lines.length * LINE_H + 6
    } else {
      bodyH += b.introLines.length * LINE_H
      bodyH += b.itemLines.reduce((sum, lines) => sum + lines.length * LINE_H, 0)
      bodyH += 6
    }
  }

  const TABLE_ROW_H = 26
  const tableRows = (topPlayed ?? []).slice(0, 5)
  const tableH = tableRows.length > 0 ? 44 + tableRows.length * TABLE_ROW_H : 0

  const HEADER_H = 56
  const TITLE_H = 60
  const FOOTER_H = 40
  const H = HEADER_H + TITLE_H + bodyH + tableH + FOOTER_H + 10

  const canvas = document.createElement('canvas')
  canvas.width = W * DPR
  canvas.height = H * DPR
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`
  const ctx = canvas.getContext('2d')
  ctx.scale(DPR, DPR)

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#0F172A')
  bg.addColorStop(1, '#1E1B4B')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#6366F1'
  ctx.fillRect(0, 0, 5, H)

  ctx.textBaseline = 'middle'
  ctx.font = `bold 13px ${FONT}`
  ctx.fillStyle = '#818CF8'
  ctx.textAlign = 'left'
  ctx.fillText('LORCANA PRO TOOLS', PAD + 6, HEADER_H / 2)

  ctx.strokeStyle = '#1E293B'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, HEADER_H)
  ctx.lineTo(W - PAD, HEADER_H)
  ctx.stroke()

  ctx.textBaseline = 'alphabetic'
  let y = HEADER_H + 30
  ctx.font = `bold 22px ${FONT}`
  ctx.fillStyle = '#F1F5F9'
  ctx.fillText(title, PAD + 6, y)
  y += 24
  ctx.font = `13px ${FONT}`
  ctx.fillStyle = '#94A3B8'
  ctx.fillText(subtitle, PAD + 6, y)
  y += 22

  for (const b of wrappedBlocks) {
    if (b.type === 'text') {
      ctx.font = `14px ${FONT}`
      ctx.fillStyle = '#E2E8F0'
      for (const line of b.lines) {
        y += LINE_H
        ctx.fillText(line, PAD + 6, y)
      }
      y += 6
    } else {
      ctx.font = `bold 14px ${FONT}`
      ctx.fillStyle = '#CBD5E1'
      for (const line of b.introLines) {
        y += LINE_H
        ctx.fillText(line, PAD + 6, y)
      }
      ctx.font = `13px ${FONT}`
      ctx.fillStyle = '#94A3B8'
      for (const itemLines of b.itemLines) {
        for (const line of itemLines) {
          y += LINE_H
          ctx.fillText(line, PAD + 6 + BULLET_INDENT, y)
        }
      }
      y += 6
    }
  }

  if (tableRows.length > 0) {
    y += 8
    ctx.strokeStyle = '#1E293B'
    ctx.beginPath()
    ctx.moveTo(PAD, y)
    ctx.lineTo(W - PAD, y)
    ctx.stroke()
    y += 26
    ctx.font = `bold 11px ${FONT}`
    ctx.fillStyle = '#475569'
    ctx.textAlign = 'left'
    ctx.fillText('MOST PLAYED ARCHETYPES', PAD + 6, y)

    for (const a of tableRows) {
      y += TABLE_ROW_H
      ctx.font = `13px ${FONT}`
      ctx.fillStyle = '#E2E8F0'
      ctx.textAlign = 'left'
      ctx.fillText(a.name, PAD + 6, y)
      ctx.font = `12px ui-monospace, monospace`
      ctx.fillStyle = '#94A3B8'
      ctx.textAlign = 'right'
      ctx.fillText(`${a.playRate.toFixed(1)}% play · ${a.winRate.toFixed(1)}% win`, W - PAD - 6, y)
      ctx.textAlign = 'left'
    }
  }

  ctx.font = `12px ${FONT}`
  ctx.fillStyle = '#1E293B'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('lorcana-pro-tools.vercel.app', W / 2, H - FOOTER_H / 2)

  return canvas
}
