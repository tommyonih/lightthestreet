/* Large character preview on the creator screen. */
import { HAIRS, OUTFITS, SKINS } from '../data/content';

/** `name: null` draws the character without a name label. */
export interface Look { name: string | null; skin: number; hair: number; outfit: number }

/** Backdrops: dark for the share card, light sky for the creator. */
export const PREVIEW_BG = { dark: ['#25304d', '#141a2c'], light: ['#e6f3fd', '#c3def3'] } as const;

export function drawPreview(c: HTMLCanvasElement, look: Look, bg: readonly [string, string] = PREVIEW_BG.dark): void {
  const x = c.getContext('2d'); if (!x) return;
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, 140, 190);
  const g = x.createLinearGradient(0, 0, 0, 190); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
  x.fillStyle = g; x.fillRect(0, 0, 140, 190);
  x.save(); x.translate(70, 128); const s = 1.35;
  const of = OUTFITS[look.outfit], skin = SKINS[look.skin];
  x.fillStyle = 'rgba(0,0,0,.3)'; x.beginPath(); x.ellipse(0, 4, 17 * s / 1.35, 5, 0, 0, 7); x.fill();
  x.fillStyle = of.c1; x.beginPath(); x.moveTo(-13 * s, 0); x.lineTo(-11 * s, -40 * s); x.quadraticCurveTo(0, -48 * s, 11 * s, -40 * s); x.lineTo(13 * s, 0); x.closePath(); x.fill();
  x.save(); x.clip();
  x.fillStyle = of.c2;
  if (of.pat === 'stripes') for (let i = 0; i < 4; i++) x.fillRect(-14 * s, -40 * s + i * 10 * s, 28 * s, 4 * s);
  if (of.pat === 'dots') for (let i = 0; i < 7; i++) { x.beginPath(); x.arc(-8 * s + (i % 3) * 8 * s, -34 * s + Math.floor(i / 3) * 13 * s, 2.2 * s, 0, 7); x.fill(); }
  if (of.pat === 'tri') for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(-10 * s + i * 9 * s, -6 * s); x.lineTo(-5 * s + i * 9 * s, -18 * s); x.lineTo(0 + i * 9 * s, -6 * s); x.fill(); }
  x.restore();
  x.strokeStyle = skin; x.lineWidth = 5 * s; x.lineCap = 'round';
  x.beginPath(); x.moveTo(-11 * s, -36 * s); x.lineTo(-17 * s, -14 * s); x.moveTo(11 * s, -36 * s); x.lineTo(17 * s, -14 * s); x.stroke();
  x.fillStyle = skin; x.beginPath(); x.arc(0, -54 * s, 12 * s, 0, 7); x.fill();
  x.fillStyle = '#191410'; const h = HAIRS[look.hair].id;
  if (h === 'lowcut') { x.beginPath(); x.arc(0, -56 * s, 11 * s, Math.PI, 0); x.fill(); }
  if (h === 'afro') { x.beginPath(); x.arc(0, -59 * s, 15 * s, 0, 7); x.fill(); x.fillStyle = skin; x.beginPath(); x.arc(0, -52 * s, 10 * s, 0, 7); x.fill(); }
  if (h === 'braids') { x.fillRect(-11 * s, -66 * s, 22 * s, 7 * s); for (const dx of [-10, -5, 0, 5, 10]) { x.beginPath(); x.arc(dx * s, -58 * s, 3 * s, 0, 7); x.fill(); } }
  if (h === 'locs') { x.beginPath(); x.arc(0, -56 * s, 12 * s, Math.PI, 0); x.fill(); for (const dx of [-9, -4, 1, 6, 11]) x.fillRect(dx * s, -54 * s, 3 * s, 20 * s); }
  if (h === 'natural') { x.beginPath(); x.arc(0, -57 * s, 14 * s, Math.PI * 1.05, -.05); x.fill(); }
  if (h === 'straight') { x.beginPath(); x.arc(0, -56 * s, 12 * s, Math.PI, 0); x.fill(); x.fillRect(-13 * s, -56 * s, 4.5 * s, 26 * s); x.fillRect(8.5 * s, -56 * s, 4.5 * s, 26 * s); }
  x.fillStyle = '#1a1210'; x.beginPath(); x.arc(-4 * s, -54 * s, 1.5 * s, 0, 7); x.arc(4 * s, -54 * s, 1.5 * s, 0, 7); x.fill();
  x.strokeStyle = '#1a1210'; x.lineWidth = 1.4 * s; x.beginPath(); x.arc(0, -49 * s, 3.6 * s, .15 * Math.PI, .85 * Math.PI); x.stroke();
  x.restore();
  if (look.name === null) return;
  x.fillStyle = bg === PREVIEW_BG.dark ? 'rgba(255,255,255,.85)' : '#1b2238'; x.font = '700 13px system-ui'; x.textAlign = 'center';
  x.fillText(look.name || 'Your Name', 70, 178);
}
