import sharp from 'sharp';
import jsQR from 'jsqr';

// Deck share images can be large; downscaling keeps decoding fast without
// losing enough resolution to read the QR code.
const MAX_DIMENSION = 1600;

export async function decodeQrFromBuffer(buffer) {
  const { data, info } = await sharp(buffer)
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
  const result = jsQR(pixels, info.width, info.height);
  return result ? result.data : null;
}

export async function decodeQrFromImageUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image (HTTP ${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return decodeQrFromBuffer(buffer);
}
