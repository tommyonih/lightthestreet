/* Sky, time-of-day colour, and the far skyline. Colours are interpolated by the minute, not stepped. */
import { seededRng } from '../core/util';
import type { Weather } from '../core/types';
import { HOUSE_Y, LW } from './layout';
import { lampLevel, type Light } from './lights';
import { blob, hex, mix, rgba, type RGB } from './paint';

interface Key { h: number; top: string; bot: string; dark: number; grade: string; ga: number }
/** Sky top/bottom, darkness of the unlit street, and a colour grade (multiplied over the scene at strength ga). */
const KEYS: Key[] = [
  { h: 0, top: '#050918', bot: '#111834', dark: .72, grade: '#5468b8', ga: .3 },
  { h: 4.8, top: '#070c22', bot: '#1a1f45', dark: .7, grade: '#5468b8', ga: .3 },
  { h: 6, top: '#30305f', bot: '#ef8f5b', dark: .36, grade: '#ff9a66', ga: .24 },
  { h: 7.2, top: '#78b2de', bot: '#f6d6a6', dark: .06, grade: '#ffcf96', ga: .16 },
  { h: 9.5, top: '#4ea4e2', bot: '#c4e7fa', dark: 0, grade: '#ffffff', ga: 0 },
  { h: 15.5, top: '#56a8e1', bot: '#d0ebfa', dark: 0, grade: '#fff4e0', ga: .06 },
  { h: 17.4, top: '#d98c56', bot: '#ffd093', dark: .05, grade: '#ffad6a', ga: .22 },
  { h: 18.5, top: '#593a72', bot: '#ec7855', dark: .28, grade: '#ff7d5c', ga: .26 },
  { h: 19.4, top: '#1a1c44', bot: '#3b2c5b', dark: .54, grade: '#6a58a8', ga: .28 },
  { h: 20.6, top: '#050918', bot: '#111834', dark: .72, grade: '#5468b8', ga: .3 },
  { h: 24, top: '#050918', bot: '#111834', dark: .72, grade: '#5468b8', ga: .3 },
];

export interface TimeLook {
  top: RGB; bot: RGB;
  /** How dark the unlit street is, 0..~.85. */
  dark: number;
  /** Colour of the darkness: deep blue at night. */
  darkColor: RGB;
  grade: RGB; ga: number;
  /** 0 clear .. 1 fully overcast. */
  cloud: number;
}

export function timeLook(h: number, weather: Weather): TimeLook {
  const i = Math.max(1, KEYS.findIndex((k) => k.h > h)), a = KEYS[i - 1], b = KEYS[i];
  const f = (h - a.h) / (b.h - a.h);
  let top = mix(hex(a.top), hex(b.top), f), bot = mix(hex(a.bot), hex(b.bot), f);
  let dark = a.dark + (b.dark - a.dark) * f, grade = mix(hex(a.grade), hex(b.grade), f), ga = a.ga + (b.ga - a.ga) * f;
  const cloud = weather === 'storm' ? 1 : weather === 'rain' ? .75 : 0;
  if (cloud) { // overcast: grey sky, flatter light, darker day
    const day = 1 - Math.min(1, dark / .5);
    top = mix(top, hex(weather === 'storm' ? '#3c4352' : '#56606f'), .7 * day + .25);
    bot = mix(bot, hex(weather === 'storm' ? '#5d6573' : '#8a939f'), .7 * day + .2);
    dark = Math.min(.85, dark + (weather === 'storm' ? .2 : .1) * day + .05);
    grade = mix(grade, hex('#8a98b0'), .6); ga = Math.max(ga, .22);
  } else if (weather === 'hot') { grade = mix(grade, hex('#ffcc80'), .5); ga += .08 * (1 - dark); }
  return { top, bot, dark, darkColor: mix(hex('#020414'), hex('#0a1030'), .5), grade, ga, cloud };
}

const HORIZON = HOUSE_Y + 70;

/* ---------- fixed scenery, generated once from a seed ---------- */
const rng = seededRng('lights-sky');
const STARS = Array.from({ length: 70 }, () => ({ x: rng() * LW, y: rng() * 190, r: .6 + rng() * 1.1, ph: rng() * 7, sp: .8 + rng() * 2 }));
const CLOUDS = Array.from({ length: 9 }, (_, i) => ({
  x: rng() * (LW + 300), y: 34 + rng() * 90, sp: 4 + rng() * 7, s: .7 + rng() * .7, heavy: i >= 4,
  puffs: Array.from({ length: 5 + Math.floor(rng() * 3) }, (_, k) => ({ dx: k * 17 - 40 + rng() * 8, dy: -Math.sin(k / 6 * Math.PI) * (8 + rng() * 10), r: 12 + rng() * 12 })),
}));
interface Far { x: number; w: number; h: number; kind: 'block' | 'palm' | 'dome' | 'mast' | 'tank'; wins: { x: number; y: number; d: number }[] }
const FAR: Far[] = (() => {
  const out: Far[] = []; let x = -10;
  while (x < LW + 20) {
    const roll = rng(), w = 34 + rng() * 46, h = 26 + rng() * 64;
    const kind: Far['kind'] = roll < .12 ? 'palm' : roll < .17 ? 'dome' : roll < .21 ? 'mast' : roll < .26 ? 'tank' : 'block';
    const wins: Far['wins'] = [];
    if (kind === 'block') for (let wy = HORIZON - h + 8; wy < HORIZON - 8; wy += 11) for (let wx = x + 6; wx < x + w - 6; wx += 10) if (rng() < .28) wins.push({ x: wx, y: wy, d: rng() * 1.2 });
    out.push({ x, w: kind === 'palm' ? 30 : kind === 'mast' ? 14 : w, h: kind === 'mast' ? 120 : kind === 'palm' ? 70 : h, kind, wins });
    x += (kind === 'palm' || kind === 'mast' ? 18 : w) + rng() * 6;
  }
  return out;
})();

export function drawSky(ctx: CanvasRenderingContext2D, L: TimeLook, h: number, t: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON);
  g.addColorStop(0, rgba(L.top)); g.addColorStop(1, rgba(L.bot));
  ctx.fillStyle = g; ctx.fillRect(0, 0, LW, HORIZON + 40);

  // stars fade in as it gets dark, hidden by cloud
  const starVis = Math.max(0, Math.min(1, (L.dark - .3) / .3)) * (1 - L.cloud * .9);
  if (starVis > 0) for (const s of STARS) {
    ctx.globalAlpha = starVis * (.45 + .55 * Math.sin(t * s.sp + s.ph) ** 2);
    ctx.fillStyle = '#fff6e0'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // sun: an arc from 6:00 to 19:00, low and orange at the ends
  if (h > 5.6 && h < 19.3) {
    const f = (h - 5.6) / 13.7, sx = 40 + (LW - 80) * f, sy = HORIZON - 10 - Math.sin(f * Math.PI) * 170;
    const low = 1 - Math.sin(f * Math.PI), vis = 1 - L.cloud * .85;
    const col = mix(hex('#fff2b8'), hex('#ff8a4a'), low * .9);
    ctx.globalAlpha = vis * .55; const halo = 90 + low * 50; ctx.drawImage(blob('#ffd9a0'), sx - halo, sy - halo, halo * 2, halo * 2);
    ctx.globalAlpha = vis; ctx.fillStyle = rgba(col); ctx.beginPath(); ctx.arc(sx, sy, 20 + low * 6, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // moon: 19:00 to 6:00
  const mh = (h + 24 - 19) % 24;
  if (mh < 11) {
    const f = mh / 11, mx = LW - 60 - (LW - 160) * f, my = HORIZON - 20 - Math.sin(f * Math.PI) * 160, vis = 1 - L.cloud * .8;
    ctx.globalAlpha = vis * .35; ctx.drawImage(blob('#c8d4ff'), mx - 70, my - 70, 140, 140);
    ctx.globalAlpha = vis; ctx.fillStyle = '#f2ecd8'; ctx.beginPath(); ctx.arc(mx, my, 15, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(150,140,120,.35)';
    for (const [dx, dy, r] of [[-5, -3, 3.5], [4, 4, 2.6], [5, -6, 1.8], [-2, 7, 2]]) { ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  // clouds: a darker underside, a lit top, tinted by the sky
  const n = L.cloud > .5 ? CLOUDS.length : 4;
  const lit = mix(mix(L.bot, [255, 255, 255], .55), L.top, L.dark * .6), under = mix(lit, L.top, .45 + L.cloud * .2);
  for (let i = 0; i < n; i++) {
    const c = CLOUDS[i], cx = ((c.x + t * c.sp * (1 + L.cloud)) % (LW + 300)) - 150, cy = c.y - (c.heavy ? 20 : 0);
    const s = c.s * (c.heavy ? 1.5 : 1);
    ctx.globalAlpha = (c.heavy ? .85 : .7) * (L.dark > .5 ? .55 : 1);
    ctx.fillStyle = rgba(under); for (const p of c.puffs) { ctx.beginPath(); ctx.arc(cx + p.dx * s, cy + p.dy * s + 4 * s, p.r * s, 0, 7); ctx.fill(); }
    ctx.fillStyle = rgba(lit); for (const p of c.puffs) { ctx.beginPath(); ctx.arc(cx + p.dx * s, cy + p.dy * s, p.r * s * .86, 0, 7); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

/** Skyline silhouettes behind the street. Their windows share the area's grid, so a blackout darkens the whole town. */
export function drawSkyline(ctx: CanvasRenderingContext2D, L: TimeLook, gridOn: boolean, t: number, lights: Light[]): void {
  const col = mix(mix(L.bot, L.top, .35), [20, 24, 40], .35 + L.dark * .3);
  ctx.fillStyle = rgba(col);
  for (const f of FAR) {
    const b = HORIZON;
    if (f.kind === 'block') { ctx.fillRect(f.x, b - f.h, f.w, f.h + 40); ctx.fillRect(f.x + f.w * .2, b - f.h - 4, f.w * .25, 4); }
    else if (f.kind === 'tank') { ctx.fillRect(f.x + 10, b - 46, 3, 46); ctx.fillRect(f.x + f.w - 13, b - 46, 3, 46); ctx.fillRect(f.x + 4, b - 70, f.w - 8, 26); }
    else if (f.kind === 'dome') { ctx.fillRect(f.x, b - 40, f.w, 80); ctx.beginPath(); ctx.arc(f.x + f.w / 2, b - 40, f.w * .32, Math.PI, 0); ctx.fill(); ctx.fillRect(f.x + f.w - 8, b - 86, 5, 50); }
    else if (f.kind === 'mast') {
      ctx.strokeStyle = rgba(col); ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(f.x, b); ctx.lineTo(f.x + 7, b - f.h); ctx.lineTo(f.x + 14, b); ctx.moveTo(f.x + 3, b - 40); ctx.lineTo(f.x + 11, b - 40); ctx.moveTo(f.x + 5, b - 80); ctx.lineTo(f.x + 9, b - 80); ctx.stroke();
      // aviation light: telecom masts run on their own generator, so it blinks through every blackout
      if (Math.floor(t * 1.2) % 2) { ctx.fillStyle = '#ff4a3a'; ctx.beginPath(); ctx.arc(f.x + 7, b - f.h - 2, 2, 0, 7); ctx.fill(); ctx.fillStyle = rgba(col); lights.push({ x: f.x + 7, y: b - f.h, r: 14, a: .9, color: '#ff4a3a' }); }
    } else { // palm
      const px = f.x + 15; ctx.strokeStyle = rgba(col); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(px - 4, b); ctx.quadraticCurveTo(px - 6, b - 40, px + 2, b - f.h); ctx.stroke(); ctx.lineWidth = 2.5;
      for (let k = 0; k < 7; k++) { const a = -Math.PI + k * Math.PI / 6, sw = Math.sin(t * .8 + k) * 1.5; ctx.beginPath(); ctx.moveTo(px + 2, b - f.h); ctx.quadraticCurveTo(px + 2 + Math.cos(a) * 14, b - f.h - 8 + sw, px + 2 + Math.cos(a) * 24, b - f.h + 6 + Math.abs(Math.cos(a)) * 6 + sw); ctx.stroke(); }
    }
  }
  // far windows (only worth drawing once it's dim)
  if (L.dark > .15) {
    for (const f of FAR) for (const w of f.wins) {
      const lv = lampLevel('far' + w.x + w.y, gridOn, t, w.d) * Math.min(1, (L.dark - .15) * 3);
      if (lv <= .02) continue;
      ctx.globalAlpha = Math.min(1, lv); ctx.fillStyle = '#ffcf7a'; ctx.fillRect(w.x, w.y, 3, 4);
    }
    ctx.globalAlpha = 1;
  }
  // haze where the skyline meets the street, so it sits far back
  const hz = ctx.createLinearGradient(0, HORIZON - 60, 0, HORIZON + 10);
  hz.addColorStop(0, rgba(L.bot, 0)); hz.addColorStop(1, rgba(L.bot, .55));
  ctx.fillStyle = hz; ctx.fillRect(0, HORIZON - 60, LW, 80);
}
