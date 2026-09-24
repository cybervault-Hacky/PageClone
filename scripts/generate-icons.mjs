/**
 * Generates the PageClone extension icons as PNGs (no image dependencies).
 *
 * The mark is a dark rounded square containing two overlapping outlined
 * cards (page + clone). Shapes are drawn with signed-distance-field coverage
 * so edges stay antialiased at every size.
 *
 * Usage: npm run icons
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../extension/public/icons',
);
const SIZES = [16, 32, 48, 128];

// --- PNG encoding -------------------------------------------------------------

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- drawing -----------------------------------------------------------------

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** Signed distance to a rounded rectangle centred at (cx, cy). */
function sdRoundRect(x, y, cx, cy, width, height, radius) {
  const qx = Math.abs(x - cx) - width / 2 + radius;
  const qy = Math.abs(y - cy) - height / 2 + radius;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius;
}

const BG = [21, 23, 27]; // #15171b
const FRONT = [242, 244, 247]; // #f2f4f7
const BACK = [139, 147, 158]; // #8b939e

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const s = size;

  const inset = s * 0.04;
  const bgSize = s - inset * 2;
  const bgRadius = bgSize * 0.235;

  const cardSize = s * 0.5;
  const cardRadius = s * 0.11;
  const stroke = Math.max(1, s * 0.075);
  const frontCenter = { x: s * 0.42, y: s * 0.42 };
  const backCenter = { x: s * 0.58, y: s * 0.58 };

  const paint = (state, color, coverage) => {
    state.a = coverage + state.a * (1 - coverage);
    state.r = color[0] * coverage + state.r * (1 - coverage);
    state.g = color[1] * coverage + state.g * (1 - coverage);
    state.b = color[2] * coverage + state.b * (1 - coverage);
  };

  for (let y = 0; y < s; y += 1) {
    for (let x = 0; x < s; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const state = { r: 0, g: 0, b: 0, a: 0 };

      // Background plate
      const bgDistance = sdRoundRect(px, py, s / 2, s / 2, bgSize, bgSize, bgRadius);
      paint(state, BG, clamp01(0.5 - bgDistance));

      // Back card stroke
      const backDistance = sdRoundRect(
        px,
        py,
        backCenter.x,
        backCenter.y,
        cardSize,
        cardSize,
        cardRadius,
      );
      paint(state, BACK, clamp01(0.5 - (Math.abs(backDistance) - stroke / 2)));

      // Front card stroke
      const frontDistance = sdRoundRect(
        px,
        py,
        frontCenter.x,
        frontCenter.y,
        cardSize,
        cardSize,
        cardRadius,
      );
      paint(state, FRONT, clamp01(0.5 - (Math.abs(frontDistance) - stroke / 2)));

      // Un-premultiply and write
      const offset = (y * s + x) * 4;
      const alpha = state.a;
      rgba[offset] = alpha > 0 ? Math.min(255, Math.round(state.r / alpha)) : 0;
      rgba[offset + 1] = alpha > 0 ? Math.min(255, Math.round(state.g / alpha)) : 0;
      rgba[offset + 2] = alpha > 0 ? Math.min(255, Math.round(state.b / alpha)) : 0;
      rgba[offset + 3] = Math.round(alpha * 255);
    }
  }

  return rgba;
}

// --- main ----------------------------------------------------------------------

mkdirSync(outDir, { recursive: true });

for (const size of SIZES) {
  const file = path.join(outDir, `icon${size}.png`);
  writeFileSync(file, encodePng(size, renderIcon(size)));
  console.log(`icons: wrote ${path.basename(file)}`);
}
