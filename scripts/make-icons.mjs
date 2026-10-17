/* Renders the app icons (glowing bulb + lightning bolt) to PNG with no dependencies.
   Run: node scripts/make-icons.mjs  → writes public/icons/*.png */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const BOLT = [[.585, .19], [.355, .54], [.49, .54], [.435, .82], [.665, .45], [.525, .45], [.62, .19]];
function inPoly(x, y, p) {
  let ins = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

/** Colour at unit point (x,y). `scale` shrinks the artwork toward the centre (maskable safe zone). */
function shade(x, y, scale) {
  const bg = mix(hex('#222a42'), hex('#0f121b'), y);
  const cx = (x - .5) / scale + .5, cy = (y - .5) / scale + .5;
  const d = Math.hypot(cx - .5, cy - .5);
  let c = bg;
  const halo = Math.max(0, 1 - d / .46); c = mix(c, hex('#ff9d3c'), halo * halo * .55);
  if (d < .3) {
    c = mix(hex('#ffd27a'), hex('#ff8c42'), Math.min(1, d / .3 + (cy - .5) * .6));
    if (inPoly(cx, cy, BOLT)) c = hex('#3a2205');
  }
  return c;
}

function render(size, scale) {
  const px = Buffer.alloc(size * size * 4), SS = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const [cr, cg, cb] = shade((x + (sx + .5) / SS) / size, (y + (sy + .5) / SS) / size, scale);
      r += cr; g += cg; b += cb;
    }
    const o = (y * size + x) * 4, n = SS * SS;
    px[o] = r / n; px[o + 1] = g / n; px[o + 2] = b / n; px[o + 3] = 255;
  }
  return png(size, px);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192, 1));
writeFileSync('public/icons/icon-512.png', render(512, 1));
writeFileSync('public/icons/icon-maskable-512.png', render(512, .78));
writeFileSync('public/icons/apple-touch-icon.png', render(180, .9));
console.log('icons written to public/icons/');
