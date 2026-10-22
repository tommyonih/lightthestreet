/* Our products' ads, drawn on a canvas so the same artwork goes on 3D billboards (as a texture), the city map and
   the product sheet (as an image). Copy lives in ADS (data/content.ts); this file only lays it out. */
import { ADS, PARTNERS, type PartnerId } from '../data/content';

const HEAD = '800 {s}px Outfit, "Plus Jakarta Sans", system-ui, sans-serif';
const BODY = '600 {s}px "Plus Jakarta Sans", system-ui, sans-serif';
const font = (f: string, s: number) => f.replace('{s}', String(Math.round(s)));

/** Every [partner, variant] pair, for spreading different ads around the city. */
export const AD_SLOTS: [PartnerId, number][] = (Object.keys(ADS) as PartnerId[]).flatMap((id) => ADS[id].map((_, i) => [id, i] as [PartnerId, number]));

/** Break `text` into lines no wider than `w`. */
function wrap(x: CanvasRenderingContext2D, text: string, w: number): string[] {
  const out: string[] = []; let line = '';
  for (const word of text.split(' ')) {
    const t = line ? line + ' ' + word : word;
    if (x.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

function rounded(x: CanvasRenderingContext2D, l: number, t: number, w: number, h: number, r: number): void {
  x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r);
  x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
}

/** One ad, `w`×`h` pixels (2:1 suits a billboard). */
export function drawAd(id: PartnerId, variant = 0, w = 512, h = 256): HTMLCanvasElement {
  const ad = ADS[id][variant % ADS[id].length], p = PARTNERS[id];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); if (!x) return c;
  const u = h / 256; // design units: everything below is laid out on a 512×256 board

  // backdrop: a diagonal gradient, a soft glow, and a few light stripes for depth
  const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, ad.bg[0]); g.addColorStop(1, ad.bg[1]);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const glow = x.createRadialGradient(w * .82, h * .2, 0, w * .82, h * .2, h * .9);
  glow.addColorStop(0, 'rgba(255,255,255,.28)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = glow; x.fillRect(0, 0, w, h);
  x.save(); x.globalAlpha = .08; x.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(w * .55 + i * 46 * u, h); x.lineTo(w * .55 + i * 46 * u + 22 * u, h); x.lineTo(w * .55 + i * 46 * u + 22 * u + h * .6, 0); x.lineTo(w * .55 + i * 46 * u + h * .6, 0); x.fill(); }
  x.restore();

  // the product mark: a white disc with the emoji, then the name
  const cx = 62 * u, cy = 62 * u, r = 34 * u;
  x.fillStyle = 'rgba(255,255,255,.95)'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  x.font = font(BODY, 34 * u); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ad.emoji, cx, cy + 2 * u);
  x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillStyle = ad.ink;
  x.font = font(HEAD, 26 * u); x.fillText(p.name, 108 * u, 58 * u);
  x.globalAlpha = .75; x.font = font(BODY, 13 * u); x.fillText('Sponsored', 108 * u, 78 * u); x.globalAlpha = 1;

  // headline and the line under it
  x.font = font(HEAD, 46 * u);
  const lines = wrap(x, ad.headline, w - 56 * u).slice(0, 2);
  lines.forEach((l, i) => x.fillText(l, 28 * u, 140 * u + i * 46 * u));
  const subY = 140 * u + lines.length * 46 * u - 12 * u;
  x.font = font(BODY, 18 * u); x.globalAlpha = .9;
  x.fillText(wrap(x, ad.sub, w - 56 * u)[0], 28 * u, subY + 8 * u); x.globalAlpha = 1;

  // call to action: a pill, bottom right
  x.font = font(HEAD, 16 * u);
  const tw = x.measureText(ad.cta).width, pw = tw + 32 * u, ph = 34 * u, px = w - pw - 20 * u, py = h - ph - 18 * u;
  rounded(x, px, py, pw, ph, ph / 2);
  const light = ad.ink !== '#ffffff';
  x.fillStyle = light ? p.color : '#ffffff'; x.fill();
  x.fillStyle = light ? '#ffffff' : (p.color === '#ffffff' ? '#111' : p.color);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ad.cta, px + pw / 2, py + ph / 2 + 1 * u);
  return c;
}

/** The same ad as a data URL, for <img> tags. Cached: the artwork never changes during a session. */
const urls = new Map<string, string>();
export function adUrl(id: PartnerId, variant = 0): string {
  const k = id + variant;
  if (!urls.has(k)) { try { urls.set(k, drawAd(id, variant).toDataURL('image/png')); } catch { urls.set(k, ''); } }
  return urls.get(k)!;
}
