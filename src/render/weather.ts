/* Rain in two depths, splashes, a street that gets wet and dries, puddles, and lightning. */
import { SET } from '../core/state';
import { rnd, seededRng } from '../core/util';
import type { Weather } from '../core/types';
import { LH, LW, PEOPLE_Y, ROAD_Y } from './layout';
import type { Light } from './lights';
import { rgba, type RGB } from './paint';

/** 0 dry .. 1 soaked. Builds up over ~12s of rain, dries over ~40s. */
let wet = 0;
export const wetness = (): number => wet;
const splashes: { x: number; y: number; t0: number }[] = [];
let nextBolt = 0, boltAt = -99, bolt: [number, number][] = [];

const rng = seededRng('lights-puddles');
const PUDDLES = Array.from({ length: 7 }, (_, i) => ({
  x: 40 + rng() * (LW - 80), y: i < 4 ? ROAD_Y + 10 + rng() * 40 : PEOPLE_Y + 28 + rng() * 30, w: 18 + rng() * 26, h: 3 + rng() * 3,
}));

const raining = (w: Weather): boolean => w === 'rain' || w === 'storm';

export function stepWeather(w: Weather, t: number, dt: number): void {
  wet = Math.max(0, Math.min(1, wet + dt * (raining(w) ? 1 / 12 : -1 / 40)));
  if (w === 'storm' && SET.motion && t > nextBolt) {
    boltAt = t; nextBolt = t + rnd(5, 13);
    let x = rnd(80, LW - 80), y = 0; bolt = [[x, y]];
    while (y < 150) { y += rnd(12, 26); x += rnd(-18, 18); bolt.push([x, y]); }
  }
  if (raining(w) && SET.motion) {
    const n = Math.round(dt * (w === 'storm' ? 70 : 35));
    for (let i = 0; i < n; i++) splashes.push({ x: rnd(0, LW), y: rnd(PEOPLE_Y - 12, LH - 4), t0: t });
  }
  while (splashes.length && t - splashes[0].t0 > .35) splashes.shift();
}

/** Darken the ground and road as they soak, and lay puddles that mirror the sky. */
export function drawWet(ctx: CanvasRenderingContext2D, sky: RGB): void {
  if (wet <= .01) return;
  ctx.fillStyle = `rgba(10,12,20,${.28 * wet})`; ctx.fillRect(0, ROAD_Y, LW, LH - ROAD_Y);
  ctx.fillStyle = `rgba(30,15,10,${.18 * wet})`; ctx.fillRect(0, PEOPLE_Y - 18, LW, ROAD_Y - PEOPLE_Y + 18);
  for (const p of PUDDLES) {
    ctx.fillStyle = rgba(sky, .55 * wet); ctx.beginPath(); ctx.ellipse(p.x, p.y, p.w * wet, p.h, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${.18 * wet})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(p.x, p.y - .5, p.w * wet * .8, p.h * .6, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  }
}

/** Wet asphalt mirrors every light above it as a long smear. Call once all the frame's lights are in. */
export function reflect(lights: Light[]): void {
  if (wet <= .01) return;
  for (const l of lights.slice()) {
    if (l.a <= .05 || l.y > ROAD_Y || l.sy || l.noGlow) continue;
    lights.push({ x: l.x, y: ROAD_Y + 26, r: Math.min(60, l.r * .55), a: l.a * wet * .55, color: l.color, sx: .22, sy: 1 });
  }
}

export function drawRain(ctx: CanvasRenderingContext2D, w: Weather, t: number, layer: 'far' | 'near'): void {
  if (!raining(w) || !SET.motion) return;
  const storm = w === 'storm', far = layer === 'far';
  const n = (far ? 50 : 34) * (storm ? 1.8 : 1), len = far ? 9 : 19, speed = far ? 430 : 760, slant = len * (storm ? .5 : .25);
  ctx.strokeStyle = far ? 'rgba(175,195,230,.28)' : 'rgba(200,215,245,.5)'; ctx.lineWidth = far ? 1 : 1.5;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const rx = ((i * (far ? 113 : 97) + t * speed * slant / len) % (LW + 60)) - 30, ry = ((i * (far ? 71 : 61)) + t * speed) % (LH + 40) - 20;
    ctx.moveTo(rx, ry); ctx.lineTo(rx - slant, ry + len);
  }
  ctx.stroke();
  if (far) return;
  ctx.strokeStyle = 'rgba(210,225,255,.55)'; ctx.lineWidth = 1;
  for (const s of splashes) {
    const f = (t - s.t0) / .35;
    ctx.globalAlpha = 1 - f; ctx.beginPath(); ctx.ellipse(s.x, s.y, 1 + f * 6, .5 + f * 2, 0, Math.PI, 0); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Lightning flash strength right now, 0..1. Off with reduced motion (it's a flashing light). */
export function flashLevel(t: number): number {
  const since = t - boltAt;
  if (since > .7 || !SET.motion) return 0;
  return since < .07 ? 1 : since < .14 ? .15 : since < .22 ? .7 : Math.max(0, .7 - (since - .22) * 1.5);
}

export function drawBolt(ctx: CanvasRenderingContext2D, t: number): void {
  if (t - boltAt > .22 || !SET.motion) return;
  ctx.beginPath(); bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = 'rgba(160,180,255,.35)'; ctx.lineWidth = 7; ctx.stroke();
  ctx.strokeStyle = 'rgba(240,244,255,.95)'; ctx.lineWidth = 2.2; ctx.stroke();
}
