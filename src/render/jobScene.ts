/* You, on the street: walking to work, doing the job, riding off on deliveries, and the ₦ when you get paid.
   Jobs at other places (and any trip) walk you off the left edge, towards the junction. */
import { G } from '../core/state';
import { fmt } from '../core/util';
import { currentHustle, jobProgress, jobStalled, payFx } from '../game/jobs';
import { here } from '../game/world';
import { LH, LW, PEOPLE_Y, PLAYER_HOUSE, ROAD_Y } from './layout';
import type { Light } from './lights';

export interface Pose { kind: 'work' | 'up' | 'bars'; phase: number }
export interface Painter {
  ctx: CanvasRenderingContext2D;
  rr: (x: number, y: number, w: number, h: number, r: number) => void;
  /** Draw the player. */
  person: (x: number, y: number, s: number, pose: Pose | undefined, label: string) => void;
  /** Draw an extra (customer) with a given look. */
  extra: (x: number, y: number, s: number, skin: number, outfit: string, pose?: Pose) => void;
  /** Add a light source to this frame (screens, ring lights). */
  light: (l: Light) => void;
}

const HOME = { x: PLAYER_HOUSE.x + PLAYER_HOUSE.w / 2, y: PEOPLE_Y - 6 };
const LANE_Y = LH - 30; // riding lane on the road
/** Where street jobs are done: roadside stalls in front of the houses, clear of the porches.
    Delivery leaves to the right; everything else away from the street leaves to the left. */
const STALL_Y = ROAD_Y - 10;
const SPOT: Record<string, { x: number; y: number }> = {
  content: { x: 390, y: STALL_Y },
  barb: { x: 650, y: STALL_Y },
  deliver: { x: LW + 70, y: LANE_Y },
};
const OFF = { x: -60, y: PEOPLE_Y + 30 };
const WALK = 70, RIDE = 170; // logical px per second

const me = { x: HOME.x, y: HOME.y, riding: false, placed: false };
/** Off the street: on a trip, at another place, or working somewhere else. */
const away = (): boolean => !here('street') && currentHustle()?.id !== 'deliver';
const pops: { x: number; y: number; text: string; good: boolean; t0: number }[] = [];

function moveToward(tx: number, ty: number, speed: number, dt: number): boolean {
  const dx = tx - me.x, dy = ty - me.y, d = Math.hypot(dx, dy), step = speed * dt;
  if (d <= step) { me.x = tx; me.y = ty; return true; }
  me.x += dx / d * step; me.y += dy / d * step; return false;
}

/** Advance the player's position. Returns true once they're at the workplace. */
function stepMe(dt: number): boolean {
  const job = currentHustle();
  if (!me.placed) { // first frame (or after loading mid-job): appear in place
    const s = job?.id === 'deliver' ? SPOT.deliver : away() ? OFF : job ? SPOT[job.id] : HOME;
    me.x = s.x; me.y = s.y; me.riding = job?.id === 'deliver'; me.placed = true;
  }
  if (job?.id === 'deliver') { // ride: down to the road, then off to the right
    me.riding = true;
    if (Math.abs(me.y - LANE_Y) > 1 && me.x < LW) { moveToward(me.x, LANE_Y, RIDE, dt); return false; }
    return moveToward(SPOT.deliver.x, LANE_Y, RIDE, dt);
  }
  if (me.riding) me.riding = false; // after a delivery you're at the junction; you walk home from there
  if (away()) {
    if (me.x > LW) { me.x = OFF.x; me.y = OFF.y; } // rode off right on a delivery: stay out of sight
    moveToward(OFF.x, OFF.y, WALK, dt); return false;
  }
  if (me.x < 0 || me.x > LW) { me.x = OFF.x; me.y = OFF.y; } // coming home: walk in from the junction side
  const s = job ? SPOT[job.id] : HOME;
  return moveToward(s.x, s.y, WALK, dt) && !!job;
}

export function drawJobScene(p: Painter, t: number, dt: number): void {
  const { ctx } = p;
  const job = currentHustle(), atWork = stepMe(dt), stalled = jobStalled();
  const working = atWork && !stalled;
  const ph = t * 10;

  // props behind you
  if (job && atWork) {
    if (job.id === 'barb') barberChair(p, t, working);
    if (job.id === 'content') contentRig(p, t, working);
  }

  // you
  if (me.x > -40 && me.x < LW + 40) {
    if (me.riding) bike(p, t);
    const pose: Pose | undefined = me.riding ? { kind: 'bars', phase: 0 }
      : working && job?.id === 'content' ? { kind: 'up', phase: ph * .5 }
      : working ? { kind: 'work', phase: ph } : undefined;
    p.person(me.x, me.riding ? me.y - 16 : me.y, 1.05, pose, job && atWork ? '' : '⬤ ' + G.name); // the job bubble replaces your name while working
  }

  shown = { atWork, stalled };
}

/** What drawJobScene saw this frame, for the overlay drawn after lighting. */
let shown = { atWork: false, stalled: false };

/** Bubbles and pay pops: drawn after the lighting so they stay readable in the dark. */
export function drawJobOverlay(p: Painter, t: number): void {
  const { ctx } = p, job = currentHustle(), { atWork, stalled } = shown;
  // status bubble over your head, or a note on your house while you're off delivering
  if (job) {
    const label = stalled ? '⏳ Waiting for light…' : job.verb;
    if (me.x > LW - 10) bubble(p, HOME.x, HOME.y - 74, `${label} — back soon`, jobProgress(), stalled); // pinned to your house
    else if (atWork) bubble(p, me.x, me.y - (me.riding ? 84 : 66), label, jobProgress(), stalled);
  }

  // ₦ floating up when you get paid
  while (payFx.length) {
    const f = payFx.shift()!;
    pops.push({ x: Math.min(LW - 40, Math.max(40, me.x)), y: Math.min(me.y, ROAD_Y) - 70, text: `+₦${fmt(f.amount)}`, good: f.full, t0: t });
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const q = pops[i], age = t - q.t0;
    if (age > 1.8) { pops.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - age / 1.8; ctx.font = '800 16px system-ui'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillText(q.text, q.x + 1, q.y - age * 30 + 1);
    ctx.fillStyle = q.good ? '#7ee787' : '#ffd97a'; ctx.fillText(q.text, q.x, q.y - age * 30);
    ctx.globalAlpha = 1;
  }
}

function bubble(p: Painter, x: number, y: number, text: string, progress: number, stalled: boolean): void {
  const { ctx } = p;
  ctx.font = '700 10px system-ui'; ctx.textAlign = 'center';
  const w = Math.max(70, ctx.measureText(text).width + 16);
  const bx = Math.min(LW - w / 2 - 4, Math.max(w / 2 + 4, x));
  ctx.fillStyle = 'rgba(20,24,36,.88)'; p.rr(bx - w / 2, y - 24, w, 26, 7); ctx.fill();
  ctx.fillStyle = stalled ? '#ffd97a' : '#f5eeda'; ctx.fillText(text, bx, y - 12);
  ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(bx - w / 2 + 8, y - 6, w - 16, 4);
  ctx.fillStyle = stalled ? '#ff8c42' : '#5fd068'; ctx.fillRect(bx - w / 2 + 8, y - 6, (w - 16) * progress, 4);
}

/* ---------- the workplaces ---------- */

function barberChair(p: Painter, t: number, working: boolean): void {
  const { ctx } = p, s = SPOT.barb, cx = s.x + 32;
  // pole sign
  ctx.fillStyle = '#fff'; ctx.fillRect(s.x + 62, s.y - 52, 8, 40);
  ctx.fillStyle = '#e63946'; for (let i = 0; i < 4; i++) ctx.fillRect(s.x + 62, s.y - 52 + ((i * 10 + t * 20) % 40), 8, 4);
  // chair + seated customer in a cape
  ctx.fillStyle = '#222'; ctx.fillRect(cx - 12, s.y - 12, 24, 14);
  p.extra(cx, s.y - 4, .85, 2, 'street');
  ctx.fillStyle = '#f1faee'; ctx.beginPath(); ctx.moveTo(cx - 12, s.y - 30); ctx.lineTo(cx + 12, s.y - 30); ctx.lineTo(cx + 15, s.y - 2); ctx.lineTo(cx - 15, s.y - 2); ctx.closePath(); ctx.fill();
  if (!working) return;
  // clipper buzzing at the customer's head, hair falling
  ctx.fillStyle = '#333'; ctx.fillRect(cx - 18 + Math.sin(t * 20) * 2, s.y - 42, 8, 4);
  ctx.fillStyle = '#191410';
  for (let i = 0; i < 6; i++) { const f = (t * .9 + i / 6) % 1; ctx.fillRect(cx - 8 + i * 3, s.y - 40 + f * 36, 2, 2); }
}

function contentRig(p: Painter, t: number, working: boolean): void {
  const { ctx } = p, s = SPOT.content, tx = s.x + 62;
  // tripod
  ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(tx, s.y - 34); ctx.lineTo(tx - 8, s.y + 6); ctx.moveTo(tx, s.y - 34); ctx.lineTo(tx + 8, s.y + 6); ctx.moveTo(tx, s.y - 34); ctx.lineTo(tx, s.y + 6); ctx.stroke();
  // ring light behind the phone
  ctx.strokeStyle = working ? '#fff6d8' : '#777'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tx, s.y - 42, 11, 0, 7); ctx.stroke();
  if (working) {
    p.light({ x: tx, y: s.y - 42, r: 70, a: .9, color: '#fff6d8' });
    const g = ctx.createRadialGradient(tx, s.y - 42, 4, tx, s.y - 42, 46);
    g.addColorStop(0, 'rgba(255,246,216,.35)'); g.addColorStop(1, 'rgba(255,246,216,0)');
    ctx.fillStyle = g; ctx.fillRect(tx - 50, s.y - 90, 100, 96);
  }
  ctx.fillStyle = '#111'; ctx.fillRect(tx - 4, s.y - 49, 8, 14); // phone
  if (!working) return;
  if (t % 2.5 < .12) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(tx, s.y - 42, 22, 0, 7); ctx.fill(); } // flash
  ctx.font = '700 12px system-ui'; ctx.textAlign = 'center';
  for (let i = 0; i < 3; i++) { // likes floating up
    const f = (t * .5 + i / 3) % 1;
    ctx.globalAlpha = 1 - f; ctx.fillStyle = '#ff6b8b'; ctx.fillText('♥', tx + 14 + Math.sin(f * 6 + i) * 6, s.y - 50 - f * 50);
  }
  ctx.globalAlpha = 1;
}

function bike(p: Painter, t: number): void {
  const { ctx } = p, x = me.x, y = me.y;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 2.5;
  for (const wx of [x - 16, x + 16]) {
    ctx.beginPath(); ctx.arc(wx, y - 2, 9, 0, 7); ctx.stroke();
    const a = t * 14; ctx.beginPath(); ctx.moveTo(wx + Math.cos(a) * 9, y - 2 + Math.sin(a) * 9); ctx.lineTo(wx - Math.cos(a) * 9, y - 2 - Math.sin(a) * 9); ctx.stroke();
  }
  ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3; ctx.beginPath();
  ctx.moveTo(x - 16, y - 2); ctx.lineTo(x - 2, y - 14); ctx.lineTo(x + 12, y - 14); ctx.lineTo(x + 16, y - 2);
  ctx.moveTo(x + 12, y - 14); ctx.lineTo(x + 14, y - 24); ctx.stroke();
  // parcel box on the rack (only on the way out)
  if (currentHustle()?.id === 'deliver') {
    ctx.fillStyle = '#c98f5f'; ctx.fillRect(x - 26, y - 26, 16, 13);
    ctx.strokeStyle = '#7a4a2b'; ctx.lineWidth = 1; ctx.strokeRect(x - 26, y - 26, 16, 13);
  }
}
