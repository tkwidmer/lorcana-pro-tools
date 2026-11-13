// The InkbornForge look shared by every canvas share image: ink black,
// forge gold, Oswald + Source Sans 3, the mark top-left and the tool's URL in
// the footer. Video images are 16:9 at 3840x2160 with the bottom-right corner
// left empty for a webcam.

export const INK = '#17171a'
export const INK_2 = '#232328'
export const LINE = '#34343b'
export const PAPER = '#f2f1ee'
export const MUTED = '#a3a29d'
export const FORGE = '#d6a24a'
export const WIN = '#6fd39a'
export const LOSS = '#f08a8a'
export const DISPLAY = 'Oswald, "Arial Narrow", sans-serif'
export const SANS = '"Source Sans 3", ui-sans-serif, system-ui, sans-serif'
export const INK_FILL = {
  amber: '#f4b223', amethyst: '#7c4ea0', emerald: '#2f9e5b', ruby: '#d1323f', sapphire: '#2a8fd0', steel: '#9aa3ad',
}

export const DPR = 2
export const VIDEO_W = 3840
export const CAM = 0.25 // video frames keep this share of width and height empty bottom-right for a webcam

// Canvas size and row height. Social images grow with their rows; a video
// image is a 16:9 frame big enough for rows at 80% of their height, its rows
// stretched (up to 130%) to fill down to the webcam band, rendered 3840 wide.
export function layout({ video, w, top, bottom, n, row, gap = 0 }) {
  if (!video) return { W: w, H: top + n * (row + gap) + bottom, ROW: row, dpr: DPR }
  const { W, H, dpr, cam } = videoFrame(w, top + n * (row * 0.8 + gap) + 24)
  return { W, H, dpr, cam, ROW: Math.min(row * 1.3, (H - cam.h - 24 - top) / n - gap) }
}

// The smallest 16:9 frame at least `minW` wide whose height above the webcam
// band is at least `minH`.
export function videoFrame(minW, minH) {
  const H = Math.max((minW * 9) / 16, minH / (1 - CAM))
  const W = (H * 16) / 9
  return { W, H, dpr: VIDEO_W / W, cam: { w: W * CAM, h: H * CAM } }
}

const imageCache = new Map()
export function loadImage(src) {
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

// Fonts, the mark and the ink icons for these ink lists.
export async function loadAssets(inkLists) {
  await Promise.all(['600 20px Oswald', '700 20px Oswald', '400 20px "Source Sans 3"', '600 20px "Source Sans 3"'].map((f) => document.fonts.load(f)))
  const inks = [...new Set(inkLists.flat())]
  const icons = Object.fromEntries(await Promise.all(inks.map(async (i) => [i, await loadImage(`/ink/${i}.png`)])))
  return { icons, mark: await loadImage('/inkborn_forge_mark.png') }
}

export function newCanvas(w, h, dpr) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  const bg = ctx.createLinearGradient(0, 0, w, h)
  bg.addColorStop(0, '#1d1d22')
  bg.addColorStop(1, INK)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = FORGE
  ctx.fillRect(0, 0, w, 6)
  return { canvas, ctx }
}

export function text(ctx, str, x, y, { font, color = PAPER, align = 'left', baseline = 'alphabetic', alpha = 1 }) {
  ctx.globalAlpha = alpha
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.fillText(str, x, y)
  ctx.globalAlpha = 1
}

export function fitText(ctx, str, maxWidth, font) {
  ctx.font = font
  if (ctx.measureText(str).width <= maxWidth) return str
  let s = str
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1)
  return `${s}…`
}

export function wrapText(ctx, str, maxWidth, font) {
  ctx.font = font
  const lines = []
  let line = ''
  for (const word of str.split(' ')) {
    const attempt = line ? `${line} ${word}` : word
    if (line && ctx.measureText(attempt).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = attempt
    }
  }
  if (line) lines.push(line)
  return lines
}

// Brand lockup top-left; title, name and an optional detail line top-right.
export function drawHeader(ctx, w, pad, { mark, title, name, line }) {
  if (mark) {
    ctx.save()
    roundRect(ctx, pad, 34, 52, 52, 3)
    ctx.clip()
    ctx.drawImage(mark, pad, 34, 52, 52)
    ctx.restore()
  }
  text(ctx, 'INKBORNFORGE', pad + 66, 70, { font: `600 30px ${DISPLAY}`, color: PAPER })
  text(ctx, title, w - pad, 76, { font: `700 56px ${DISPLAY}`, color: FORGE, align: 'right' })
  if (name) text(ctx, fitText(ctx, name.toUpperCase(), w - pad * 2 - 360, `600 28px ${DISPLAY}`), w - pad, 116, { font: `600 28px ${DISPLAY}`, align: 'right' })
  if (line) text(ctx, fitText(ctx, line.toUpperCase(), w - pad * 2 - 360, `500 20px ${DISPLAY}`), w - pad, 148, { font: `500 20px ${DISPLAY}`, color: MUTED, align: 'right' })
}

// Note left, URL right; with a webcam band, both sit in the band left of the camera.
export function drawFooter(ctx, w, h, pad, { note, url, cam }) {
  ctx.fillStyle = LINE
  if (cam) {
    const y = h - cam.h
    ctx.fillRect(pad, y, w - cam.w - pad * 2, 1)
    text(ctx, url, pad, y + 44, { font: `600 26px ${DISPLAY}`, color: FORGE })
    if (note) text(ctx, fitText(ctx, note, w - cam.w - pad * 2, `400 18px ${SANS}`), pad, y + 80, { font: `400 18px ${SANS}`, color: MUTED })
    return
  }
  ctx.fillRect(pad, h - 64, w - pad * 2, 1)
  if (note) text(ctx, fitText(ctx, note, w - pad * 2 - 420, `400 18px ${SANS}`), pad, h - 30, { font: `400 18px ${SANS}`, color: MUTED })
  text(ctx, url, w - pad, h - 30, { font: `600 22px ${DISPLAY}`, color: FORGE, align: 'right' })
}

export function drawInks(ctx, icons, inks, x, yMid, size) {
  inks.forEach((ink, i) => {
    if (icons[ink]) ctx.drawImage(icons[ink], x + i * (size + 4), yMid - size / 2, size, size)
  })
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
