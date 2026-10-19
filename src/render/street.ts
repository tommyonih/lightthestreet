/* Canvas street scene. Everything is drawn in a fixed LW×LH logical space and scaled to the canvas.
   Draw order: sky → skyline → trees → ground → wires → houses → street furniture → people → rain → colour grade
   → lighting (darkness with holes + glow) → labels. Anything drawn before lighting is lit by it. */
import { G, SET, hasGame } from '../core/state';
import { $, chance, rnd, seededRng } from '../core/util';
import { HAIRS, NPCDEF, OUTFITS, SKINS, type NpcDef, type Outfit } from '../data/content';
import { whereabouts } from '../game/schedule';
import { hourNow, powered, streetLit } from '../game/helpers';
import { HOUSE_Y, HOUSES, LH, LW, PEOPLE_Y, PLAYER_HOUSE, ROAD_Y, type House } from './layout';
import { drawJobOverlay, drawJobScene, type Painter, type Pose } from './jobScene';
import { drawLighting, lampLevel, type Light } from './lights';
import { grainRect, hex, mix, rgba, shade } from './paint';
import { drawSky, drawSkyline, timeLook, type TimeLook } from './sky';
import { drawBolt, drawRain, drawWet, flashLevel, reflect, stepWeather } from './weather';

export { HOUSE_Y, HOUSES, LH, LW, PEOPLE_Y, PLAYER_HOUSE };
const houseGen = [false, false, false, true, false]; // who has a gen running during outages
const HOUSE_H = 100;
const GROUND_Y = HOUSE_Y + HOUSE_H;
/** Streetlight: pole and lamp head. */
const SL_POLE = 806, SL_X = 784, SL_Y = 182;

/* ---------- neighbours walking to where their schedule puts them ---------- */
const WALK_SPEED = 70; // logical px per second
interface Body { x: number; y: number; a: number }
const bodies = new Map<string, Body>();

/** Where a neighbour wants to be: porch, chairs out by the road, their door (going in), or off the edge (going out). */
function target(n: NpcDef): Body {
  const homeX = n.x * LW, porchY = PEOPLE_Y + (n.dy ? 16 : 0);
  switch (whereabouts(n.id).at) {
    case 'porch': return { x: homeX, y: porchY, a: 1 };
    case 'outside': return { x: homeX + (n.dy ? 14 : -10), y: PEOPLE_Y + 44, a: 1 };
    case 'in': return { x: homeX, y: porchY - 12, a: 0 };
    case 'out': return { x: n.x < .5 ? -40 : LW + 40, y: PEOPLE_Y + 40, a: 1 };
  }
}

function stepBodies(dt: number): void {
  for (const n of NPCDEF) {
    const to = target(n); let b = bodies.get(n.id);
    if (!b) { bodies.set(n.id, { ...to }); continue; } // first frame: place directly
    if (b.a === 0 && to.a > 0 && to.x >= 0 && to.x <= LW) { b.x = to.x; b.y = to.y - 12; } // stepping out of their door
    const dx = to.x - b.x, dy = to.y - b.y, dist = Math.hypot(dx, dy), step = WALK_SPEED * dt;
    if (dist <= step) { b.x = to.x; b.y = to.y; } else { b.x += dx / dist * step; b.y += dy / dist * step; }
    b.a += Math.sign(to.a - b.a) * Math.min(Math.abs(to.a - b.a), dt * 2.5); // fade through the door
  }
}

/** The neighbour drawn under a street point, if any. */
export function npcAt(x: number, y: number): string | null {
  for (const n of NPCDEF) {
    const b = bodies.get(n.id);
    if (!b || b.a < .5 || b.x < 0 || b.x > LW) continue;
    if (Math.abs(x - b.x) < 24 && Math.abs(y - b.y + 34) < 52) return n.id;
  }
  return null;
}

let cv: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let smoke: { x: number; y: number; vx: number; vy: number; a: number }[] = [];

export function initRenderer(canvas: HTMLCanvasElement): void {
  cv = canvas; ctx = canvas.getContext('2d')!;
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(canvas);
  resize();
  requestAnimationFrame(render);
}

export function resize(): void {
  if (!cv || !ctx) return;
  // clientWidth ignores CSS transforms, so a screen's slide-in animation can't skew the canvas size
  const d = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d; ctx.setTransform(cv.width / LW, 0, 0, cv.height / LH, 0, 0);
}

/** Convert a mouse event to logical street coordinates. */
export function toStreet(e: MouseEvent): { x: number; y: number } {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * LW, y: (e.clientY - r.top) / r.height * LH };
}

function roundRect(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/* ---------- fixed details, seeded so they're the same every frame and every visit ---------- */
const rng = seededRng('lights-street');
const LOOK = HOUSES.map((hh, i) => ({
  curtain: ['#b5462f', '#2f6db5', '#c9a227', '#3c8a4a', '#8a3c7a'][i],
  cracks: Array.from({ length: 2 }, () => {
    let x = hh.x + 10 + rng() * (hh.w - 20), y = HOUSE_Y + 8 + rng() * 40; const pts: [number, number][] = [[x, y]];
    for (let k = 0; k < 4; k++) { x += rnd(-5, 5) * (rng() + .5); y += 4 + rng() * 5; pts.push([x, y]); }
    return pts;
  }),
  rust: Array.from({ length: 4 }, () => ({ x: hh.x + rng() * hh.w, y: HOUSE_Y - 4 - rng() * 24, r: 3 + rng() * 7 })),
  dish: i === 1 || i === 4,
}));
const TUFTS = Array.from({ length: 46 }, (_, i) => ({ x: rng() * LW, y: i % 2 ? GROUND_Y + 1 + rng() * 6 : ROAD_Y - 11 - rng() * 5, s: .7 + rng() * .6 }));
const PEBBLES = Array.from({ length: 40 }, () => ({ x: rng() * LW, y: GROUND_Y + 6 + rng() * (ROAD_Y - GROUND_Y - 20), r: .8 + rng() * 1.4 }));
const HOLES = [{ x: 150, y: ROAD_Y + 38, w: 16 }, { x: 470, y: ROAD_Y + 18, w: 11 }, { x: 700, y: ROAD_Y + 44, w: 20 }];
const SLABS = Array.from({ length: Math.ceil(LW / 38) + 1 }, (_, i) => ({ x: i * 38 - 6, cracked: rng() < .25 }));
const MOTHS = Array.from({ length: 7 }, () => ({ r: 6 + rng() * 14, sp: 2 + rng() * 3, ph: rng() * 7 }));

/* ---------- scenery ---------- */

function drawTrees(t: number, L: TimeLook): void {
  const leaf = mix(hex('#2f5a2a'), L.top, .15), hi = mix(hex('#4f8a3a'), L.bot, .15);
  // mango tree between the first two houses, showing over the roofs
  const sway = Math.sin(t * .7) * 1.5;
  ctx.fillStyle = '#4a3324'; ctx.fillRect(169, HOUSE_Y - 10, 8, HOUSE_H + 12);
  for (const [dx, dy, r] of [[-26, -18, 22], [0, -34, 26], [24, -16, 22], [-10, -2, 20], [14, -2, 18]]) {
    ctx.fillStyle = rgba(leaf); ctx.beginPath(); ctx.arc(173 + dx + sway, HOUSE_Y + dy, r, 0, 7); ctx.fill();
    ctx.fillStyle = rgba(hi, .55); ctx.beginPath(); ctx.arc(173 + dx + sway - 4, HOUSE_Y + dy - 5, r * .55, 0, 7); ctx.fill();
  }
  // palm between the last two houses
  const px = 655, top = HOUSE_Y - 74;
  ctx.strokeStyle = '#6a5440'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(652, GROUND_Y); ctx.quadraticCurveTo(648, HOUSE_Y, px, top); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1;
  for (let y = top + 8; y < GROUND_Y; y += 7) { ctx.beginPath(); ctx.moveTo(px - 4, y); ctx.lineTo(px + 3, y + 2); ctx.stroke(); }
  ctx.strokeStyle = rgba(leaf); ctx.lineWidth = 4; ctx.lineCap = 'round';
  for (let k = 0; k < 8; k++) {
    const a = -Math.PI * .95 + k * Math.PI * .27, s = Math.sin(t * 1.1 + k) * 2;
    ctx.beginPath(); ctx.moveTo(px, top);
    ctx.quadraticCurveTo(px + Math.cos(a) * 22, top - 14 + s, px + Math.cos(a) * 40, top + 8 + Math.abs(Math.cos(a)) * 12 + s); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function drawGround(): void {
  // red laterite earth, packed lighter where people walk
  const g = ctx.createLinearGradient(0, GROUND_Y - 4, 0, ROAD_Y);
  g.addColorStop(0, '#9c6a4c'); g.addColorStop(1, '#86553a');
  ctx.fillStyle = g; ctx.fillRect(0, GROUND_Y - 4, LW, ROAD_Y - GROUND_Y + 4);
  grainRect(ctx, 'soil', 0, GROUND_Y - 4, LW, ROAD_Y - GROUND_Y + 4, .3, .1);
  ctx.fillStyle = 'rgba(255,225,190,.07)'; ctx.fillRect(0, PEOPLE_Y + 22, LW, 20);
  for (const p of PEBBLES) { ctx.fillStyle = 'rgba(60,40,30,.35)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
  ctx.lineWidth = 1.3;
  for (const f of TUFTS) {
    ctx.strokeStyle = '#5b7a33'; ctx.beginPath();
    for (const a of [-.5, 0, .45]) { ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + a * 7 * f.s, f.y - 7 * f.s); }
    ctx.stroke();
  }
  // covered drain: concrete slabs over a dark channel
  ctx.fillStyle = '#211d1a'; ctx.fillRect(0, ROAD_Y - 9, LW, 9);
  for (const s of SLABS) {
    ctx.fillStyle = '#8c877d'; ctx.fillRect(s.x, ROAD_Y - 9, 35, 8);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(s.x, ROAD_Y - 9, 35, 1.5);
    if (s.cracked) { ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(s.x + 12, ROAD_Y - 9); ctx.lineTo(s.x + 17, ROAD_Y - 5); ctx.lineTo(s.x + 14, ROAD_Y - 1); ctx.stroke(); }
  }
  grainRect(ctx, 'concrete', 0, ROAD_Y - 9, LW, 8, .25, .1);
  // asphalt with a crumbling edge, potholes and a faded centre line
  ctx.fillStyle = '#3c3d44'; ctx.fillRect(0, ROAD_Y, LW, LH - ROAD_Y);
  grainRect(ctx, 'asphalt', 0, ROAD_Y, LW, LH - ROAD_Y, .35, .1);
  ctx.fillStyle = 'rgba(0,0,0,.1)'; ctx.fillRect(0, ROAD_Y + 12, LW, 8); ctx.fillRect(0, ROAD_Y + 38, LW, 8);
  ctx.fillStyle = '#56575d';
  for (let x = 0; x < LW; x += 7) ctx.fillRect(x, ROAD_Y, 7, 1 + ((x * 7919) % 5) * .6);
  for (const p of HOLES) {
    ctx.fillStyle = '#26272c'; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.w, p.w * .3, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, p.w, p.w * .3, 0, .1, Math.PI - .1); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(222,196,104,.55)';
  for (let x = 10; x < LW; x += 56) ctx.fillRect(x, LH - 31, 26, 3);
}

/** A point on a quadratic curve from a to b with control c, at fraction f. */
function onCurve(a: number[], c: number[], b: number[], f: number): [number, number] {
  const u = 1 - f;
  return [u * u * a[0] + 2 * u * f * c[0] + f * f * b[0], u * u * a[1] + 2 * u * f * c[1] + f * f * b[1]];
}

function drawPoleAndWires(t: number): void {
  const sway = G.weather === 'storm' ? 5 : G.weather === 'rain' ? 2 : .6;
  // three mains from the pole to the streetlight, with a drop to every house
  ctx.strokeStyle = 'rgba(18,18,22,.85)'; ctx.lineWidth = 1.3;
  [[2, 84], [18, 84], [34, 84]].forEach(([x0, y0], i) => {
    const a = [x0, y0], b = [SL_POLE + 4 + i * 3, 152 + i * 4], c = [(a[0] + b[0]) / 2, 150 + i * 6 + Math.sin(t * 2.2 + i) * sway];
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]); ctx.stroke();
    if (i !== 1) return;
    for (const hh of HOUSES) {
      const hx = hh.x + hh.w - 16, [px, py] = onCurve(a, c, b, (hx - a[0]) / (b[0] - a[0]));
      ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(hx + 4, (py + HOUSE_Y) / 2 + 8 + Math.sin(t * 2 + hx) * sway * .5, hx, HOUSE_Y + 4); ctx.stroke();
    }
  });
  // wooden pole, crossarm, insulators
  const pg = ctx.createLinearGradient(14, 0, 22, 0); pg.addColorStop(0, '#6a5038'); pg.addColorStop(1, '#3c2c1e');
  ctx.fillStyle = pg; ctx.fillRect(14, 60, 8, GROUND_Y - 52);
  ctx.fillStyle = '#4a3828'; ctx.fillRect(-4, 88, 48, 5);
  ctx.fillStyle = '#c9d2d6'; for (const x of [1, 17, 33]) ctx.fillRect(x - 1, 82, 4, 6);
  // transformer: finned tank, rust streak, warning plate
  ctx.fillStyle = '#69717a'; roundRect(3, 98, 30, 38, 3); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let x = 6; x < 32; x += 4) ctx.fillRect(x, 104, 1.5, 28);
  ctx.fillStyle = '#7d8690'; ctx.fillRect(1, 95, 34, 5);
  ctx.fillStyle = 'rgba(120,60,25,.45)'; ctx.fillRect(9, 100, 3, 22);
  ctx.fillStyle = '#c0392b'; ctx.fillRect(20, 112, 9, 7); ctx.fillStyle = '#f5f5f5'; ctx.fillRect(22, 114, 5, 1.5);
}

function drawRoof(o: House, k: typeof LOOK[number]): void {
  const hx = o.x, hw = o.w, hy = HOUSE_Y, l = hx - 10, r = hx + hw + 10, top = hy - 32, il = hx + 22, ir = hx + hw - 22;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(l, hy + 2); ctx.lineTo(il, top); ctx.lineTo(ir, top); ctx.lineTo(r, hy + 2); ctx.closePath();
  ctx.fillStyle = o.roof; ctx.fill(); ctx.clip();
  // corrugated zinc: ridges catch light, troughs fall dark
  for (let x = l; x < r; x += 5) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x, top, 1.4, 36); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x + 2.6, top, 1.4, 36); }
  const g = ctx.createLinearGradient(0, top, 0, hy + 2); g.addColorStop(0, 'rgba(255,255,255,.14)'); g.addColorStop(1, 'rgba(0,0,0,.28)');
  ctx.fillStyle = g; ctx.fillRect(l, top, r - l, 36);
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(l, top + 15, r - l, 1.2);
  for (const p of k.rust) { ctx.fillStyle = 'rgba(115,52,18,.4)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * .55, 0, 0, 7); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = shade(o.roof, -.35); ctx.fillRect(il - 2, top - 2, ir - il + 4, 4);
  ctx.fillStyle = '#4b3526'; ctx.fillRect(l, hy, r - l, 4);
  if (o.player && G.solar > 0) { // solar panels with cells and a glint
    for (let i = 0; i < 3; i++) {
      const x = hx + 26 + i * 33, y = top + 8;
      ctx.fillStyle = '#1d3560'; ctx.fillRect(x, y, 29, 17);
      ctx.strokeStyle = 'rgba(150,190,255,.35)'; ctx.lineWidth = .6; ctx.beginPath();
      for (let cx = x + 7; cx < x + 29; cx += 7) { ctx.moveTo(cx, y); ctx.lineTo(cx, y + 17); }
      ctx.moveTo(x, y + 8.5); ctx.lineTo(x + 29, y + 8.5); ctx.stroke();
      ctx.strokeStyle = '#b8c4d0'; ctx.lineWidth = 1; ctx.strokeRect(x, y, 29, 17);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.moveTo(x + 4, y); ctx.lineTo(x + 12, y); ctx.lineTo(x + 6, y + 17); ctx.lineTo(x - 2 + 1, y + 17); ctx.closePath(); ctx.fill();
    }
  }
  if (k.dish) {
    const dx = hx + hw - 10, dy = hy - 6;
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(dx, dy + 8); ctx.lineTo(dx, dy + 14); ctx.stroke();
    ctx.fillStyle = '#d6d6d2'; ctx.beginPath(); ctx.ellipse(dx, dy, 6, 9, -.5, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(dx + 1.5, dy + 1, 4, 7, -.5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#666'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx - 9, dy + 2); ctx.stroke();
  }
}

function drawWindow(wx: number, wy: number, lv: number, curtain: string, lights: Light[]): void {
  const W = 28, H = 28, on = Math.min(1, lv);
  ctx.fillStyle = '#cdc4b0'; ctx.fillRect(wx - 3, wy + H, W + 6, 4);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(wx - 3, wy + H + 4, W + 6, 3);
  const g = ctx.createLinearGradient(0, wy, 0, wy + H);
  g.addColorStop(0, rgba(mix(hex('#1e2739'), hex('#ffe6a6'), on))); g.addColorStop(1, rgba(mix(hex('#121a2a'), hex('#ffaa52'), on)));
  ctx.fillStyle = g; ctx.fillRect(wx, wy, W, H);
  ctx.fillStyle = rgba(mix(hex(curtain), [16, 18, 28], .6 - on * .35));
  ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + 9, wy); ctx.quadraticCurveTo(wx + 4, wy + H * .5, wx + 7, wy + H); ctx.lineTo(wx, wy + H); ctx.fill();
  ctx.beginPath(); ctx.moveTo(wx + W, wy); ctx.lineTo(wx + W - 9, wy); ctx.quadraticCurveTo(wx + W - 4, wy + H * .5, wx + W - 7, wy + H); ctx.lineTo(wx + W, wy + H); ctx.fill();
  if (on < .5) { ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.moveTo(wx + 6, wy); ctx.lineTo(wx + 13, wy); ctx.lineTo(wx + 4, wy + H); ctx.lineTo(wx, wy + H); ctx.lineTo(wx, wy + 8); ctx.fill(); }
  // burglar-proof bars
  ctx.strokeStyle = '#211e1a'; ctx.lineWidth = 1.6; ctx.beginPath();
  for (const bx of [7, 14, 21]) { ctx.moveTo(wx + bx, wy); ctx.lineTo(wx + bx, wy + H); }
  ctx.moveTo(wx, wy + H / 2); ctx.lineTo(wx + W, wy + H / 2); ctx.stroke();
  ctx.strokeStyle = '#4a3423'; ctx.lineWidth = 2; ctx.strokeRect(wx, wy, W, H);
  if (lv > .02) lights.push({ x: wx + W / 2, y: wy + H / 2, r: 54, a: .85 * lv, color: '#ffc46b' });
}

function drawHouse(i: number, lv: number, lights: Light[]): void {
  const o = HOUSES[i], k = LOOK[i], hx = o.x, hy = HOUSE_Y, hw = o.w, cx = hx + hw / 2, base = hy + HOUSE_H;
  // contact shadow on the ground
  const sh = ctx.createLinearGradient(0, base - 2, 0, base + 16); sh.addColorStop(0, 'rgba(0,0,0,.35)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh; ctx.fillRect(hx - 12, base - 2, hw + 24, 18);
  // plastered walls: grain, light from the left, damp rising from the ground, cracks
  ctx.fillStyle = o.wall; ctx.fillRect(hx, hy, hw, HOUSE_H);
  grainRect(ctx, 'plaster', hx, hy, hw, HOUSE_H, .22, .1);
  const side = ctx.createLinearGradient(hx, 0, hx + hw, 0); side.addColorStop(0, 'rgba(255,240,220,.08)'); side.addColorStop(1, 'rgba(0,0,0,.2)');
  ctx.fillStyle = side; ctx.fillRect(hx, hy, hw, HOUSE_H);
  const damp = ctx.createLinearGradient(0, base - 30, 0, base - 12); damp.addColorStop(0, 'rgba(70,45,25,0)'); damp.addColorStop(1, 'rgba(70,45,25,.38)');
  ctx.fillStyle = damp; ctx.fillRect(hx, base - 30, hw, 18);
  ctx.strokeStyle = 'rgba(45,28,16,.4)'; ctx.lineWidth = .8;
  for (const c of k.cracks) { ctx.beginPath(); c.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
  ctx.fillStyle = '#7b756a'; ctx.fillRect(hx - 2, base - 12, hw + 4, 12);
  grainRect(ctx, 'concrete', hx - 2, base - 12, hw + 4, 12, .25, .1);
  ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(hx - 2, base - 12, hw + 4, 1.5);
  // shade under the eaves
  const eave = ctx.createLinearGradient(0, hy + 3, 0, hy + 16); eave.addColorStop(0, 'rgba(0,0,0,.35)'); eave.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = eave; ctx.fillRect(hx, hy + 3, hw, 13);
  for (const wx of [hx + 12, hx + hw - 40]) drawWindow(wx, hy + 16, lv, k.curtain, lights);
  // panel door, frame, step, and the bulb above it
  const dw = 28, dh = 46, dx = cx - dw / 2, dy = base - 6 - dh;
  ctx.fillStyle = '#3b2618'; ctx.fillRect(dx - 3, dy - 3, dw + 6, dh + 3);
  ctx.fillStyle = '#6b4426'; ctx.fillRect(dx, dy, dw, dh);
  ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1; ctx.strokeRect(dx + 4, dy + 5, dw - 8, dh * .38); ctx.strokeRect(dx + 4, dy + dh * .5, dw - 8, dh * .42);
  ctx.fillStyle = '#d9b45a'; ctx.fillRect(dx + dw - 7, dy + dh * .52, 3, 3);
  ctx.fillStyle = '#9a9488'; ctx.fillRect(dx - 8, base - 6, dw + 16, 6); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(dx - 8, base - 6, dw + 16, 1.2);
  const by = dy - 9, on = Math.min(1, lv);
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(cx - 1, by - 6, 2, 4);
  ctx.fillStyle = rgba(mix(hex('#5d5d5d'), hex('#fff6d0'), on)); ctx.beginPath(); ctx.arc(cx, by, 3, 0, 7); ctx.fill();
  if (lv > .02) {
    lights.push({ x: cx, y: by, r: 82, a: .85 * lv, color: '#ffd27a' });
    lights.push({ x: cx, y: base + 12, r: 74, a: .55 * lv, color: '#ffcf7a', sy: .32 });
  }
  if (o.player) { // prepaid meter, blinking red when units are low
    ctx.fillStyle = '#e9e9e4'; roundRect(hx + hw - 6, hy + 52, 12, 20, 2); ctx.fill();
    ctx.fillStyle = G.meterUnits < 4 ? (Math.floor(performance.now() / 400) % 2 ? '#ff4040' : '#802020') : '#40d060';
    ctx.fillRect(hx + hw - 3, hy + 55, 6, 5);
    ctx.fillStyle = '#9a9a94'; for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) ctx.fillRect(hx + hw - 4 + c * 3, hy + 62 + r * 3, 2, 2);
    if (G.meterUnits < 4) lights.push({ x: hx + hw, y: hy + 57, r: 10, a: .8, color: '#ff4040' });
    ctx.fillStyle = '#b8862e'; ctx.fillRect(dx - 4, base - 2, dw + 8, 3); // doormat
  }
  drawRoof(o, k);
}

function drawStreetlight(t: number, L: TimeLook, lights: Light[]): void {
  const lv = lampLevel('street', streetLit(), t), on = Math.min(1, lv);
  const pg = ctx.createLinearGradient(SL_POLE - 3, 0, SL_POLE + 3, 0); pg.addColorStop(0, '#5a5f68'); pg.addColorStop(1, '#2c2f35');
  ctx.fillStyle = pg; ctx.fillRect(SL_POLE - 3, 148, 6, GROUND_Y + 8 - 148);
  ctx.strokeStyle = '#3a3e45'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(SL_POLE, 168); ctx.quadraticCurveTo(SL_POLE - 4, SL_Y - 8, SL_X + 6, SL_Y - 4); ctx.stroke();
  ctx.fillStyle = '#2a2d33'; ctx.beginPath(); ctx.ellipse(SL_X, SL_Y - 2, 13, 5, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = rgba(mix(hex('#4c4c4c'), hex('#fff3c8'), on)); ctx.beginPath(); ctx.ellipse(SL_X, SL_Y, 9, 2.5, 0, 0, 7); ctx.fill();
  if (lv <= .02) return;
  // a cone of light down to the ground, then the pool it makes
  const ground = PEOPLE_Y + 30, cone = ctx.createLinearGradient(0, SL_Y, 0, ground);
  cone.addColorStop(0, `rgba(255,236,170,${.16 * on * L.dark})`); cone.addColorStop(1, 'rgba(255,236,170,0)');
  ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(SL_X - 8, SL_Y); ctx.lineTo(SL_X + 8, SL_Y); ctx.lineTo(SL_X + 70, ground); ctx.lineTo(SL_X - 70, ground); ctx.closePath(); ctx.fill();
  lights.push({ x: SL_X, y: SL_Y + 6, r: 150, a: lv, color: '#ffe2a0' });
  lights.push({ x: SL_X, y: ground, r: 130, a: .7 * lv, color: '#ffe2a0', sy: .3 });
  if (SET.motion && L.dark > .3) {
    ctx.fillStyle = 'rgba(255,245,215,.85)';
    for (const m of MOTHS) { const a = t * m.sp + m.ph; ctx.fillRect(SL_X + Math.cos(a) * m.r, SL_Y + 10 + Math.sin(a * 1.3) * m.r * .6, 1.6, 1.6); }
  }
}

/** Your generator: open frame, fuel tank, engine, alternator and a muffler that smokes. Always outdoors, away from windows. */
function drawGen(t: number, lights: Light[]): void {
  const gx = PLAYER_HOUSE.x + PLAYER_HOUSE.w + 10, gy = HOUSE_Y + 56, on = G.genOn, x = gx + (on ? Math.sin(t * 40) * .8 : 0);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(gx + 22, gy + 44, 26, 5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#3d4249'; ctx.fillRect(x + 6, gy + 20, 21, 20); grainRect(ctx, 'concrete', x + 6, gy + 20, 21, 20, .3, .1);
  ctx.fillStyle = '#8a929c'; roundRect(x + 26, gy + 22, 14, 16, 3); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.35)'; for (let k = 0; k < 4; k++) ctx.fillRect(x + 28 + k * 3, gy + 25, 1.2, 10);
  ctx.fillStyle = G.gen === 2 ? '#d4a017' : '#c0392b'; roundRect(x + 5, gy + 5, 33, 14, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x + 10, gy + 7, 20, 2);
  ctx.fillStyle = '#1d1d1d'; ctx.beginPath(); ctx.arc(x + 31, gy + 5, 3, 0, 7); ctx.fill();
  ctx.fillStyle = '#5a5f66'; roundRect(x - 4, gy + 24, 9, 13, 3); ctx.fill();
  ctx.strokeStyle = '#262626'; ctx.lineWidth = 3; roundRect(x + 2, gy + 9, 40, 34, 5); ctx.stroke();
  ctx.fillStyle = on ? '#5fd068' : '#3a3a3a'; ctx.fillRect(x + 9, gy + 24, 3, 3);
  if (on) {
    lights.push({ x: x + 10, y: gy + 26, r: 12, a: .8, color: '#5fd068' });
    lights.push({ x: x + 22, y: gy + 30, r: 46, a: .3 + .06 * Math.sin(t * 31), color: '#ff9a40' });
    if (SET.motion && chance(.35)) smoke.push({ x: x - 4, y: gy + 24, vx: rnd(-.5, .1), vy: rnd(-1.1, -.6), a: .5 });
  }
}

/* ---------- people ---------- */

interface Label { x: number; y: number; text: string; color: string; sub?: string }
let labels: Label[] = [];

function drawPerson(x: number, y: number, s: number, skin: number, hairId: string, outfit: string | Outfit,
  gender: number, t: number, name: string, rel: number | null, pose?: Pose): void {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 2 + x) * 1.5);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 13 * s, 4 * s, 0, 0, 7); ctx.fill();
  const of = typeof outfit === 'string' ? (OUTFITS.find((o) => o.id === outfit) || OUTFITS[3]) : outfit;
  // body
  ctx.fillStyle = of.c1; roundRect(-11 * s, -34 * s, 22 * s, 34 * s, 6 * s); ctx.fill();
  ctx.save(); roundRect(-11 * s, -34 * s, 22 * s, 34 * s, 6 * s); ctx.clip();
  ctx.fillStyle = of.c2;
  if (of.pat === 'stripes') { for (let i = 0; i < 4; i++) ctx.fillRect(-11 * s, -34 * s + i * 9 * s, 22 * s, 3.5 * s); }
  if (of.pat === 'dots') { for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-7 * s + (i % 3) * 7 * s, -28 * s + Math.floor(i / 3) * 14 * s, 2 * s, 0, 7); ctx.fill(); } }
  if (of.pat === 'tri') { for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-9 * s + i * 9 * s, -8 * s); ctx.lineTo(-4.5 * s + i * 9 * s, -18 * s); ctx.lineTo(0 * s + i * 9 * s, -8 * s); ctx.fill(); } }
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(3 * s, -34 * s, 8 * s, 34 * s); // shaded side
  ctx.restore();
  // arms
  ctx.strokeStyle = SKINS[skin]; ctx.lineWidth = 4.5 * s; ctx.lineCap = 'round';
  ctx.beginPath();
  if (!pose) { ctx.moveTo(-10 * s, -28 * s); ctx.lineTo(-14 * s, -12 * s); ctx.moveTo(10 * s, -28 * s); ctx.lineTo(14 * s, -12 * s); }
  else if (pose.kind === 'work') { // hands busy in front: typing, sewing, clipping
    const a = Math.sin(pose.phase) * 3 * s;
    ctx.moveTo(-10 * s, -28 * s); ctx.lineTo(-5 * s + a, -17 * s); ctx.moveTo(10 * s, -28 * s); ctx.lineTo(5 * s - a, -17 * s);
  } else if (pose.kind === 'up') { // posing for the camera
    const a = Math.sin(pose.phase) * 5 * s;
    ctx.moveTo(-10 * s, -28 * s); ctx.lineTo(-17 * s, -42 * s + a); ctx.moveTo(10 * s, -28 * s); ctx.lineTo(17 * s, -42 * s - a);
  } else { // both hands forward on handlebars
    ctx.moveTo(-10 * s, -28 * s); ctx.lineTo(12 * s, -22 * s); ctx.moveTo(10 * s, -28 * s); ctx.lineTo(16 * s, -22 * s);
  }
  ctx.stroke(); ctx.lineCap = 'butt';
  // head, with the far side in shade
  ctx.fillStyle = SKINS[skin]; ctx.beginPath(); ctx.arc(0, -43 * s, 10 * s, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.beginPath(); ctx.arc(0, -43 * s, 10 * s, -Math.PI * .4, Math.PI * .4); ctx.fill();
  // hair
  ctx.fillStyle = '#191410';
  const h = hairId;
  if (h === 'lowcut') { ctx.beginPath(); ctx.arc(0, -45 * s, 9.5 * s, Math.PI, 0); ctx.fill(); }
  if (h === 'afro') { ctx.beginPath(); ctx.arc(0, -47 * s, 12.5 * s, 0, 7); ctx.fill(); ctx.fillStyle = SKINS[skin]; ctx.beginPath(); ctx.arc(0, -42 * s, 8.5 * s, 0, 7); ctx.fill(); }
  if (h === 'braids') { for (const dx of [-9, -4, 1, 6]) { ctx.beginPath(); ctx.arc(dx * s, -50 * s, 3 * s, 0, 7); ctx.fill(); } ctx.fillRect(-9 * s, -52 * s, 18 * s, 5 * s); }
  if (h === 'locs') { ctx.beginPath(); ctx.arc(0, -45 * s, 10 * s, Math.PI, 0); ctx.fill(); for (const dx of [-8, -3, 2, 7]) ctx.fillRect(dx * s, -44 * s, 2.6 * s, 14 * s); }
  if (h === 'natural') { ctx.beginPath(); ctx.arc(0, -46 * s, 11.5 * s, Math.PI * 1.05, -.05); ctx.fill(); }
  if (h === 'straight') { ctx.beginPath(); ctx.arc(0, -45 * s, 10 * s, Math.PI, 0); ctx.fill(); ctx.fillRect(-11 * s, -45 * s, 4 * s, 20 * s); ctx.fillRect(7 * s, -45 * s, 4 * s, 20 * s); }
  if (gender === 1 && (h === 'braids' || h === 'straight')) { ctx.fillStyle = '#e63946'; ctx.fillRect(-12 * s, -48 * s, 4 * s, 3 * s); ctx.fillRect(8 * s, -48 * s, 4 * s, 3 * s); }
  // face
  ctx.fillStyle = '#1a1210'; ctx.beginPath(); ctx.arc(-3.4 * s, -43 * s, 1.3 * s, 0, 7); ctx.arc(3.4 * s, -43 * s, 1.3 * s, 0, 7); ctx.fill();
  ctx.strokeStyle = '#1a1210'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.arc(0, -39.5 * s, 3 * s, .15 * Math.PI, .85 * Math.PI); ctx.stroke();
  ctx.restore();
  if (name) labels.push({
    x, y: y - 58 * s, text: name,
    color: rel == null ? '#ffffff' : (rel >= 65 ? '#7ee787' : rel >= 40 ? '#ffd97a' : '#ff9d9d'),
    sub: rel == null ? undefined : '♥' + Math.round(rel),
  });
}

/** Names go on top of everything, on a small dark pill, so they read in any light. */
function drawLabels(): void {
  ctx.textAlign = 'center';
  for (const l of labels) {
    const w = l.text.length * 5.6 + 12, top = l.y - 10, hgt = l.sub ? 22 : 13;
    ctx.fillStyle = 'rgba(10,12,22,.5)'; roundRect(l.x - w / 2, top, w, hgt, 6); ctx.fill();
    ctx.font = '700 10px system-ui'; ctx.fillStyle = l.color; ctx.fillText(l.text, l.x, l.y);
    if (l.sub) { ctx.font = '600 8.5px system-ui'; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText(l.sub, l.x, l.y + 9); }
  }
  labels = [];
}

/** A small amber pin over your roof instead of a dashed box. */
function drawHomePin(t: number): void {
  const x = PLAYER_HOUSE.x + PLAYER_HOUSE.w / 2, y = HOUSE_Y - 58 + (SET.motion ? Math.sin(t * 2.2) * 2.5 : 0);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, HOUSE_Y - 36, 5, 1.6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(x, y, 10, Math.PI * .8, Math.PI * .2); ctx.lineTo(x, y + 16); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a2205'; ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.closePath(); ctx.fill(); ctx.fillRect(x - 4, y, 8, 5);
}

let lastFrame = 0;
function render(): void {
  requestAnimationFrame(render);
  if (!ctx || !hasGame() || !$('#scr-game').classList.contains('active') || cv.classList.contains('off')) return; // 'off' = 3D view is on
  const t = performance.now() / 1000;
  const dt = Math.min(.1, lastFrame ? t - lastFrame : 0); lastFrame = t;
  const h = hourNow(), L = timeLook(h, G.weather), lights: Light[] = [];
  stepWeather(G.weather, t, dt);

  drawSky(ctx, L, h, t);
  drawSkyline(ctx, L, G.gridOn, t, lights);
  drawRain(ctx, G.weather, t, 'far');
  drawTrees(t, L);
  drawGround();
  drawWet(ctx, L.bot);
  drawPoleAndWires(t);
  HOUSES.forEach((hh, i) => drawHouse(i, lampLevel('house' + i, hh.player ? powered() : (G.gridOn || houseGen[i]), t), lights));
  if (!powered() && G.lamp > 0 && L.dark > .2) lights.push({ x: PLAYER_HOUSE.x + 26, y: HOUSE_Y + 30, r: 44, a: .75, color: '#fff0c8' }); // rechargeable lamp
  drawStreetlight(t, L, lights);
  if (G.gen > 0) drawGen(t, lights);
  if (SET.motion) {
    smoke = smoke.filter((s) => s.a > 0);
    for (const s of smoke) { s.x += s.vx; s.y += s.vy; s.a -= .008; ctx.globalAlpha = s.a; ctx.fillStyle = 'rgba(120,120,125,.5)'; ctx.beginPath(); ctx.arc(s.x, s.y, 4 + (.5 - s.a) * 14, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1; if (smoke.length > 60) smoke.shift();
  }

  // characters
  stepBodies(dt);
  NPCDEF.forEach((n, i) => {
    const st = G.npcs.find((x) => x.id === n.id)!, b = bodies.get(n.id)!;
    if (b.a <= 0) return;
    const to = target(n), walking = Math.hypot(to.x - b.x, to.y - b.y) > 1;
    const y = b.y + (walking ? -Math.abs(Math.sin(t * 9 + i)) * 3 : Math.sin(t + i) * 2);
    const bob = G.genOn && n.id !== 'helpful' ? Math.sin(t * 3 + i) * 1 : 0;
    ctx.globalAlpha = b.a;
    drawPerson(b.x + bob, y, 0.95, n.skin, n.hair, n.outfit, i % 2, t * 0.5 + i, n.name, Math.round(st.rel));
    ctx.globalAlpha = 1;
  });
  const painter: Painter = {
    ctx, rr: roundRect, light: (l) => lights.push(l),
    person: (x, y, s, pose, label) => drawPerson(x, y, s, G.skin, HAIRS[G.hair].id, OUTFITS[G.outfit], G.gender, t, label, null, pose),
    extra: (x, y, s, skin, outfit, pose) => drawPerson(x, y, s, skin, 'lowcut', outfit, 0, t, '', null, pose),
  };
  drawJobScene(painter, t, dt); // you: at home, or at work
  drawRain(ctx, G.weather, t, 'near');

  // colour grade, then light: darkness with holes where light falls, and its glow
  if (L.ga > .01) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = rgba(L.grade, L.ga); ctx.fillRect(0, 0, LW, LH); ctx.globalCompositeOperation = 'source-over'; }
  const flash = flashLevel(t);
  reflect(lights);
  drawLighting(ctx, lights, L.dark * (1 - flash * .85), L.darkColor);
  if (flash > 0) { ctx.fillStyle = `rgba(205,218,255,${flash * .22})`; ctx.fillRect(0, 0, LW, LH); }
  drawBolt(ctx, t);
  const v = ctx.createRadialGradient(LW / 2, LH * .55, 180, LW / 2, LH * .55, 560);
  v.addColorStop(0, 'rgba(0,0,10,0)'); v.addColorStop(1, `rgba(0,0,12,${.2 + L.dark * .45})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, LW, LH);

  // UI on top: names, your pin, job bubbles
  drawLabels();
  drawHomePin(t);
  drawJobOverlay(painter, t);
}
