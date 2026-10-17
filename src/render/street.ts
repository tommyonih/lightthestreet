/* Canvas street scene. Everything is drawn in a fixed LW×LH logical space and scaled to the canvas. */
import { G, SET, hasGame } from '../core/state';
import { $, chance, rnd } from '../core/util';
import { HAIRS, NPCDEF, OUTFITS, SKINS, type NpcDef, type Outfit } from '../data/content';
import { whereabouts } from '../game/schedule';
import { hourNow, isNight, powered, streetLit } from '../game/helpers';
import { HOUSE_Y, HOUSES, LH, LW, PEOPLE_Y, PLAYER_HOUSE, type House } from './layout';
import { drawJobScene, type Pose } from './jobScene';

export { HOUSE_Y, HOUSES, LH, LW, PEOPLE_Y, PLAYER_HOUSE };
const houseGen = [false, false, false, true, false]; // who has a gen running during outages

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
  resize();
  requestAnimationFrame(render);
}

export function resize(): void {
  if (!cv) return;
  const r = cv.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = r.width * d; cv.height = r.height * d; ctx.setTransform(cv.width / LW, 0, 0, cv.height / LH, 0, 0);
}

/** Convert a mouse event to logical street coordinates. */
export function toStreet(e: MouseEvent): { x: number; y: number } {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * LW, y: (e.clientY - r.top) / r.height * LH };
}

function skyColors(): [string, string] {
  const h = hourNow();
  if (h < 5.5) return ['#0b1026', '#141a36']; if (h < 6.5) return ['#2a2a55', '#e8935a'];
  if (h < 9) return ['#7ec8e3', '#bfe8f5']; if (h < 16) return ['#6db9e8', '#cfeeff'];
  if (h < 18) return ['#f2a65e', '#ffd9a0']; if (h < 19.2) return ['#7a4a7e', '#e8765a'];
  return ['#141a36', '#0b1026'];
}

function roundRect(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawHouse(hx: number, hy: number, hw: number, hh: number, o: House & { lit: boolean; solar: boolean }): void {
  ctx.fillStyle = o.wall; ctx.fillRect(hx, hy, hw, hh);
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.strokeRect(hx, hy, hw, hh);
  // roof
  ctx.fillStyle = o.roof; ctx.beginPath(); ctx.moveTo(hx - 8, hy); ctx.lineTo(hx + hw / 2, hy - 34); ctx.lineTo(hx + hw + 8, hy); ctx.closePath(); ctx.fill();
  if (o.solar) {
    ctx.fillStyle = '#22406e'; for (let i = 0; i < 3; i++) ctx.fillRect(hx + 14 + i * 34, hy - 26, 28, 16);
    ctx.strokeStyle = '#5aa9ff'; for (let i = 0; i < 3; i++) ctx.strokeRect(hx + 14 + i * 34, hy - 26, 28, 16);
  }
  // door
  ctx.fillStyle = '#5b3a22'; ctx.fillRect(hx + hw / 2 - 13, hy + hh - 38, 26, 38);
  ctx.fillStyle = '#ffd97a'; ctx.fillRect(hx + hw / 2 + 6, hy + hh - 20, 3, 3);
  // windows
  for (const wx of [hx + 12, hx + hw - 40]) {
    ctx.fillStyle = o.lit ? '#ffdf8e' : '#24304a'; ctx.fillRect(wx, hy + 14, 28, 26);
    ctx.strokeStyle = '#4a3220'; ctx.strokeRect(wx, hy + 14, 28, 26);
    if (o.lit) {
      const g = ctx.createRadialGradient(wx + 14, hy + 27, 2, wx + 14, hy + 27, 40);
      g.addColorStop(0, 'rgba(255,215,120,.5)'); g.addColorStop(1, 'rgba(255,215,120,0)');
      ctx.fillStyle = g; ctx.fillRect(wx - 30, hy - 16, 88, 86);
    } else { ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.beginPath(); ctx.moveTo(wx + 14, hy + 14); ctx.lineTo(wx + 14, hy + 40); ctx.stroke(); }
  }
  if (o.player) { // meter box
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(hx + hw - 6, hy + 52, 12, 20);
    ctx.fillStyle = G.meterUnits < 4 ? (Math.floor(performance.now() / 400) % 2 ? '#ff4040' : '#802020') : '#40d060';
    ctx.fillRect(hx + hw - 3, hy + 55, 6, 5);
    ctx.strokeStyle = '#222'; ctx.strokeRect(hx + hw - 6, hy + 52, 12, 20);
  }
}

function drawPerson(x: number, y: number, s: number, skin: number, hairId: string, outfit: string | Outfit,
  gender: number, t: number, name: string, rel: number | null, pose?: Pose): void {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 2 + x) * 1.5);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 2, 13 * s, 4 * s, 0, 0, 7); ctx.fill();
  const of = typeof outfit === 'string' ? (OUTFITS.find((o) => o.id === outfit) || OUTFITS[3]) : outfit;
  // body
  ctx.fillStyle = of.c1; roundRect(-11 * s, -34 * s, 22 * s, 34 * s, 6 * s); ctx.fill();
  ctx.save(); roundRect(-11 * s, -34 * s, 22 * s, 34 * s, 6 * s); ctx.clip();
  ctx.fillStyle = of.c2;
  if (of.pat === 'stripes') { for (let i = 0; i < 4; i++) ctx.fillRect(-11 * s, -34 * s + i * 9 * s, 22 * s, 3.5 * s); }
  if (of.pat === 'dots') { for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-7 * s + (i % 3) * 7 * s, -28 * s + Math.floor(i / 3) * 14 * s, 2 * s, 0, 7); ctx.fill(); } }
  if (of.pat === 'tri') { for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-9 * s + i * 9 * s, -8 * s); ctx.lineTo(-4.5 * s + i * 9 * s, -18 * s); ctx.lineTo(0 * s + i * 9 * s, -8 * s); ctx.fill(); } }
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
  ctx.stroke();
  // head
  ctx.fillStyle = SKINS[skin]; ctx.beginPath(); ctx.arc(0, -43 * s, 10 * s, 0, 7); ctx.fill();
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
  if (name) {
    ctx.font = '600 10px system-ui'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillText(name, x + 1, y - 58 * s + 1);
    ctx.fillStyle = rel == null ? '#fff' : (rel >= 65 ? '#7ee787' : rel >= 40 ? '#ffd97a' : '#ff9d9d'); ctx.fillText(name, x, y - 58 * s);
    if (rel != null) { ctx.font = '9px system-ui'; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText('♥' + Math.round(rel), x, y - 48 * s); }
  }
}

let lastFrame = 0;
function render(): void {
  requestAnimationFrame(render);
  if (!hasGame() || !$('#scr-game').classList.contains('active')) return;
  const t = performance.now() / 1000;
  const dt = Math.min(.1, lastFrame ? t - lastFrame : 0); lastFrame = t;
  const h = hourNow();
  const [c1, c2] = skyColors();
  const g = ctx.createLinearGradient(0, 0, 0, LH * .65); g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
  // sun / moon
  const night = isNight();
  if (!night) { ctx.fillStyle = '#ffe89a'; ctx.beginPath(); ctx.arc(120 + 600 * ((h - 6) / 13), 70, 26, 0, 7); ctx.fill(); }
  else {
    ctx.fillStyle = '#f0ead6'; ctx.beginPath(); ctx.arc(200 + 380 * (((h + 24) % 24 - 19) / 9), 70, 18, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 28; i++) { const sx = (i * 137) % LW, sy = (i * 89) % 180; if ((i + Math.floor(t / 2)) % 3) ctx.fillRect(sx, sy, 1.6, 1.6); }
  }
  // clouds
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  for (let i = 0; i < 3; i++) { const cx = ((t * 8 + i * 300) % (LW + 200)) - 100; ctx.beginPath(); ctx.ellipse(cx, 50 + i * 26, 46, 13, 0, 0, 7); ctx.fill(); }
  if (G.weather === 'rain' || G.weather === 'storm') {
    ctx.fillStyle = 'rgba(60,70,90,.8)';
    for (let i = 0; i < 3; i++) { const cx = ((t * 30 + i * 300) % (LW + 240)) - 120; ctx.beginPath(); ctx.ellipse(cx, 60 + i * 24, 70, 18, 0, 0, 7); ctx.fill(); }
  }
  // ground
  ctx.fillStyle = '#8a9a5b'; ctx.fillRect(0, LH - 170, LW, 170);
  ctx.fillStyle = '#7c8b4e'; for (let i = 0; i < 40; i++) ctx.fillRect((i * 173) % LW, LH - 170 + (i * 67) % 150, 3, 3);
  // road
  ctx.fillStyle = '#4b4b55'; ctx.fillRect(0, LH - 58, LW, 58);
  ctx.fillStyle = '#e8c860'; for (let x = 10; x < LW; x += 56) ctx.fillRect(x, LH - 31, 26, 4);
  // houses
  const hy = HOUSE_Y;
  HOUSES.forEach((hh, i) => {
    const lit = hh.player ? powered() : (G.gridOn || houseGen[i]);
    drawHouse(hh.x, hy, hh.w, 100, { ...hh, lit, solar: !!hh.player && G.solar > 0 });
  });
  if (!powered() && G.lamp > 0 && (night || h > 18)) { // rechargeable lamp: dim glow in your window
    const lx = PLAYER_HOUSE.x + 26, ly = hy + 27, gl = ctx.createRadialGradient(lx, ly, 2, lx, ly, 34);
    gl.addColorStop(0, 'rgba(255,240,200,.55)'); gl.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = gl; ctx.fillRect(lx - 34, ly - 34, 68, 68);
  }
  // pole + wires + transformer
  ctx.strokeStyle = '#3a2e22'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(18, 60); ctx.lineTo(18, LH - 160); ctx.stroke();
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-6, 92); ctx.lineTo(42, 92); ctx.stroke();
  ctx.fillStyle = '#555'; ctx.fillRect(4, 96, 28, 34);
  ctx.strokeStyle = 'rgba(30,30,30,.8)'; ctx.lineWidth = 2;
  for (const yy of [78, 86]) {
    ctx.beginPath(); ctx.moveTo(0, yy);
    for (const hh of HOUSES) ctx.quadraticCurveTo(hh.x + hh.w / 2, yy + 26, hh.x + hh.w / 2, hy + 34);
    ctx.stroke();
  }
  // streetlight
  ctx.strokeStyle = '#333'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(806, 200); ctx.lineTo(806, LH - 160); ctx.stroke();
  ctx.fillStyle = streetLit() ? '#ffe89a' : '#666'; ctx.beginPath(); ctx.arc(806, 196, 7, 0, 7); ctx.fill();
  if (streetLit()) {
    const gl = ctx.createRadialGradient(806, 200, 4, 806, 200, 110);
    gl.addColorStop(0, 'rgba(255,230,140,.45)'); gl.addColorStop(1, 'rgba(255,230,140,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(806, 200, 110, 0, 7); ctx.fill();
  }
  // generator shed (player) — always outdoors
  if (G.gen > 0) {
    const gx = PLAYER_HOUSE.x + PLAYER_HOUSE.w + 10, gy = hy + 56;
    const vib = G.genOn ? Math.sin(t * 40) * 1 : 0;
    ctx.fillStyle = '#6b7a8d'; ctx.fillRect(gx + vib, gy, 44, 44);
    ctx.fillStyle = '#54606f'; ctx.fillRect(gx + vib, gy, 44, 10);
    ctx.fillStyle = '#222'; ctx.fillRect(gx + 8 + vib, gy + 18, 28, 16);
    ctx.font = '8px system-ui'; ctx.fillStyle = '#ffd97a'; ctx.textAlign = 'center';
    ctx.fillText('GEN', gx + 22 + vib, gy + 30);
    if (G.genOn) { // smoke + glow
      if (SET.motion && chance(.3)) smoke.push({ x: gx + 22, y: gy, vx: rnd(-.2, .5), vy: rnd(-1.2, -.6), a: .5 });
      const gl = ctx.createRadialGradient(gx + 22, gy + 22, 4, gx + 22, gy + 22, 60);
      gl.addColorStop(0, 'rgba(255,190,90,.28)'); gl.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = gl; ctx.fillRect(gx - 40, gy - 40, 124, 124);
    }
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '8.5px system-ui';
    ctx.fillText('outdoor ✓ safe', gx + 22, gy + 54);
  }
  // rain particles
  if (SET.motion && (G.weather === 'rain' || G.weather === 'storm')) {
    ctx.strokeStyle = 'rgba(160,200,255,.55)'; ctx.lineWidth = 1.4;
    for (let i = 0; i < (G.weather === 'storm' ? 90 : 45); i++) {
      const rx = (i * 97 + t * 380) % LW, ry = (i * 61 + t * 560) % LH;
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 13); ctx.stroke();
    }
  }
  // smoke particles
  if (SET.motion) {
    ctx.fillStyle = 'rgba(120,120,125,.4)';
    smoke = smoke.filter((s) => s.a > 0);
    smoke.forEach((s) => { s.x += s.vx; s.y += s.vy; s.a -= .008; ctx.globalAlpha = s.a; ctx.beginPath(); ctx.arc(s.x, s.y, 4 + s.a * 6, 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1; if (smoke.length > 60) smoke.shift();
  }
  // night overlay
  const dark = night ? .42 : (h > 18 ? .2 : 0);
  if (dark > 0) { ctx.fillStyle = `rgba(8,12,40,${dark})`; ctx.fillRect(0, 0, LW, LH); }
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
  // player: at home, or at work (see jobScene)
  drawJobScene({
    ctx, rr: roundRect,
    person: (x, y, s, pose, label) => drawPerson(x, y, s, G.skin, HAIRS[G.hair].id, OUTFITS[G.outfit], G.gender, t, label, null, pose),
    extra: (x, y, s, skin, outfit, pose) => drawPerson(x, y, s, skin, 'lowcut', outfit, 0, t, '', null, pose),
  }, t, dt);
  // player house outline
  ctx.strokeStyle = 'rgba(255,179,71,.8)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
  ctx.strokeRect(PLAYER_HOUSE.x - 4, hy - 38, PLAYER_HOUSE.w + 8, 142); ctx.setLineDash([]);
  ctx.font = '10px system-ui'; ctx.fillStyle = '#ffb347'; ctx.textAlign = 'center';
  ctx.fillText('YOUR HOUSE', PLAYER_HOUSE.x + PLAYER_HOUSE.w / 2, hy - 44);
  // vignette at night
  if (night) {
    const v = ctx.createRadialGradient(LW / 2, LH / 2, 150, LW / 2, LH / 2, 520);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,20,.5)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, LW, LH);
  }
}
