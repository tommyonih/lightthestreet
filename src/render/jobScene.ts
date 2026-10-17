/* You, on the street: walking to work, doing the job, riding off on deliveries, and the ₦ when you get paid. */
import { G } from '../core/state';
import { fmt } from '../core/util';
import { OUTFITS } from '../data/content';
import { currentHustle, jobProgress, jobStalled, payFx } from '../game/jobs';
import { LH, LW, PEOPLE_Y, PLAYER_HOUSE, ROAD_Y } from './layout';

export interface Pose { kind: 'work' | 'up' | 'bars'; phase: number }
export interface Painter {
  ctx: CanvasRenderingContext2D;
  rr: (x: number, y: number, w: number, h: number, r: number) => void;
  /** Draw the player. */
  person: (x: number, y: number, s: number, pose: Pose | undefined, label: string) => void;
  /** Draw an extra (customer) with a given look. */
  extra: (x: number, y: number, s: number, skin: number, outfit: string, pose?: Pose) => void;
}

const HOME = { x: PLAYER_HOUSE.x + PLAYER_HOUSE.w / 2, y: PEOPLE_Y - 6 };
const LANE_Y = LH - 30; // riding lane on the road
/** Where each job is done: roadside stalls along the open ground in front of the houses, clear of the porches.
    Delivery leaves the street to the right. */
const STALL_Y = ROAD_Y - 10;
const SPOT: Record<string, { x: number; y: number }> = {
  tailor: { x: 120, y: STALL_Y },
  pos: { x: 255, y: STALL_Y },
  content: { x: 390, y: STALL_Y },
  remote: { x: 545, y: STALL_Y },
  barb: { x: 650, y: STALL_Y },
  deliver: { x: LW + 70, y: LANE_Y },
};
const WALK = 70, RIDE = 170; // logical px per second

const me = { x: HOME.x, y: HOME.y, riding: false, placed: false };
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
    const s = job ? SPOT[job.id] : HOME; me.x = s.x; me.y = s.y; me.riding = job?.id === 'deliver'; me.placed = true;
  }
  if (job?.id === 'deliver') { // ride: down to the road, then off to the right
    me.riding = true;
    if (Math.abs(me.y - LANE_Y) > 1 && me.x < LW) { moveToward(me.x, LANE_Y, RIDE, dt); return false; }
    return moveToward(SPOT.deliver.x, LANE_Y, RIDE, dt);
  }
  if (me.riding) { // coming back from a delivery: re-enter from the left, ride home, hop off
    if (me.x > LW) { me.x = -70; me.y = LANE_Y; }
    if (Math.abs(me.x - HOME.x) > 1) { moveToward(HOME.x, LANE_Y, RIDE, dt); return false; }
    if (moveToward(HOME.x, HOME.y, RIDE * .5, dt)) me.riding = false;
    return false;
  }
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
    if (job.id === 'pos') posStand(p, t, working, 'back');
    if (job.id === 'barb') barberChair(p, t, working);
    if (job.id === 'content') contentRig(p, t, working);
  }

  // you
  if (me.x > -40 && me.x < LW + 40) {
    if (me.riding) bike(p, t);
    const seated = atWork && (job?.id === 'tailor' || job?.id === 'remote');
    if (seated) { ctx.fillStyle = '#5b3a22'; ctx.fillRect(me.x - 9, me.y - 6, 18, 8); } // stool
    const pose: Pose | undefined = me.riding ? { kind: 'bars', phase: 0 }
      : working && job?.id === 'content' ? { kind: 'up', phase: ph * .5 }
      : working ? { kind: 'work', phase: ph * (job?.id === 'remote' ? 2 : 1) } : undefined;
    const y = me.riding ? me.y - 16 : seated ? me.y + 4 : me.y;
    p.person(me.x, y, 1.05, pose, job && atWork ? '' : '⬤ ' + G.name); // the job bubble replaces your name while working
  }

  // props in front of you
  if (job && atWork) {
    if (job.id === 'pos') posStand(p, t, working, 'front');
    if (job.id === 'tailor') sewingTable(p, t, working);
    if (job.id === 'remote') laptopTable(p, t, working);
  }

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

function posStand(p: Painter, t: number, working: boolean, layer: 'back' | 'front'): void {
  const { ctx } = p, s = SPOT.pos;
  if (layer === 'back') {
    // umbrella
    ctx.strokeStyle = '#444'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s.x + 30, s.y + 8); ctx.lineTo(s.x + 30, s.y - 78); ctx.stroke();
    ['#e63946', '#ffb347', '#e63946', '#ffb347'].forEach((c, i) => {
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(s.x + 30, s.y - 86);
      ctx.lineTo(s.x - 20 + i * 25, s.y - 64); ctx.lineTo(s.x + 5 + i * 25, s.y - 64); ctx.closePath(); ctx.fill();
    });
    // customers: walk up, pay, walk away — one every 5s
    if (!working) return;
    const cycle = 5, k = Math.floor(t / cycle), f = (t % cycle) / cycle;
    const standX = s.x - 52, startX = -30;
    const cx = f < .35 ? startX + (standX - startX) * (f / .35) : f < .7 ? standX : standX - (standX - startX) * ((f - .7) / .3);
    p.extra(cx, s.y + 10, .9, k % 6, OUTFITS[(k * 7) % OUTFITS.length].id);
    if (f >= .35 && f < .7) {
      ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#7ee787';
      ctx.fillText('₦', s.x - 26, s.y - 44 - (f - .35) * 60);
    }
    return;
  }
  // counter in front, with the POS terminal
  ctx.fillStyle = '#2b6cb0'; ctx.fillRect(s.x - 28, s.y - 22, 56, 26);
  ctx.fillStyle = '#f5eeda'; ctx.font = '700 8px system-ui'; ctx.textAlign = 'center'; ctx.fillText('POS • TRANSFER', s.x, s.y - 10);
  ctx.fillStyle = '#222'; ctx.fillRect(s.x - 8, s.y - 30, 14, 9);
  ctx.fillStyle = working && Math.floor(t * 2) % 2 ? '#5fd068' : '#335'; ctx.fillRect(s.x - 6, s.y - 28, 10, 4);
}

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

function sewingTable(p: Painter, t: number, working: boolean): void {
  const { ctx } = p, s = SPOT.tailor;
  ctx.fillStyle = '#8b5a2b'; ctx.fillRect(s.x - 26, s.y - 20, 52, 6); ctx.fillRect(s.x - 22, s.y - 14, 4, 16); ctx.fillRect(s.x + 18, s.y - 14, 4, 16);
  // fabric feeding through
  const of = OUTFITS[G.outfit], shift = working ? (t * 12) % 16 : 0;
  ctx.fillStyle = of.c1; ctx.fillRect(s.x - 24, s.y - 24, 48, 4);
  ctx.fillStyle = of.c2; for (let i = -24; i < 24; i += 16) ctx.fillRect(s.x + i + shift - 8, s.y - 24, 4, 4);
  // machine
  // machine sits to your right so your face stays visible
  ctx.fillStyle = '#e8e8e8'; ctx.fillRect(s.x + 8, s.y - 34, 20, 7); ctx.fillRect(s.x + 22, s.y - 34, 6, 12);
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.beginPath();
  const needle = working ? Math.abs(Math.sin(t * 18)) * 4 : 0;
  ctx.moveTo(s.x + 11, s.y - 27); ctx.lineTo(s.x + 11, s.y - 25 + needle); ctx.stroke();
}

function laptopTable(p: Painter, t: number, working: boolean): void {
  const { ctx } = p, s = SPOT.remote;
  ctx.fillStyle = '#8b5a2b'; ctx.fillRect(s.x - 24, s.y - 20, 48, 6); ctx.fillRect(s.x - 20, s.y - 14, 4, 16); ctx.fillRect(s.x + 16, s.y - 14, 4, 16);
  // laptop facing us: screen glows, lines of "code" scroll
  ctx.fillStyle = '#333'; ctx.fillRect(s.x - 16, s.y - 23, 32, 3);
  ctx.fillStyle = '#1b2433'; ctx.fillRect(s.x - 14, s.y - 38, 28, 15); // low screen: your face shows above it
  if (!working) return;
  const g = ctx.createRadialGradient(s.x, s.y - 30, 2, s.x, s.y - 30, 30);
  g.addColorStop(0, 'rgba(90,169,255,.35)'); g.addColorStop(1, 'rgba(90,169,255,0)');
  ctx.fillStyle = g; ctx.fillRect(s.x - 30, s.y - 60, 60, 50);
  ctx.fillStyle = '#7ee787';
  for (let i = 0; i < 3; i++) { const w = 6 + ((i * 7 + Math.floor(t * 3)) % 4) * 4; ctx.fillRect(s.x - 11, s.y - 35 + i * 4, w, 2); }
}

function contentRig(p: Painter, t: number, working: boolean): void {
  const { ctx } = p, s = SPOT.content, tx = s.x + 62;
  // tripod
  ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(tx, s.y - 34); ctx.lineTo(tx - 8, s.y + 6); ctx.moveTo(tx, s.y - 34); ctx.lineTo(tx + 8, s.y + 6); ctx.moveTo(tx, s.y - 34); ctx.lineTo(tx, s.y + 6); ctx.stroke();
  // ring light behind the phone
  ctx.strokeStyle = working ? '#fff6d8' : '#777'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tx, s.y - 42, 11, 0, 7); ctx.stroke();
  if (working) {
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
