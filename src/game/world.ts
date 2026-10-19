/* The neighbourhood: where you are, getting between places, opening hours, unlocks and who's where.
   Pure game state, so the headless tests can roam a whole week. Renderers read it; they never own it. */
import { G, T, save } from '../core/state';
import { fmt } from '../core/util';
import { sfx } from '../core/audio';
import { NPCDEF, PATHS, PLACES, type Place, type PlaceId } from '../data/content';
import type { Waypoint } from '../core/types';
import { toast } from '../ui/toast';
import { updHUD } from '../ui/hud';
import { renderPhone } from '../ui/phone';
import { addCash } from './economy';
import { fun, hourNow, npcDef, powered } from './helpers';
import { checkObj } from './progress';
import { isSunday, whereabouts } from './schedule';
import { MEETING_START } from './meetings';

/** Okada: about 3× faster than walking; the fare grows with distance and rain. */
export const OKADA = { speed: 3, base: 100, perMin: 12, rain: 1.5 };

export const place = (id: PlaceId): Place => PLACES.find((p) => p.id === id)!;
export const travelling = (): boolean => G.trip != null;
/** Standing at a place (not on the road). */
export const here = (id: PlaceId): boolean => G.loc === id && !G.trip;
export const atHome = (): boolean => here('street');

/** Shortest walk between two places in game minutes (Dijkstra over PATHS; the graph is tiny). */
export function walkMins(a: PlaceId, b: PlaceId): number {
  const dist = new Map<PlaceId, number>([[a, 0]]), done = new Set<PlaceId>();
  while (done.size < PLACES.length) {
    let cur: PlaceId | null = null;
    for (const [id, d] of dist) if (!done.has(id) && (cur == null || d < dist.get(cur)!)) cur = id;
    if (cur == null) break;
    if (cur === b) return dist.get(b)!;
    done.add(cur);
    for (const [x, y, m] of PATHS) {
      const next = x === cur ? y : y === cur ? x : null;
      if (next && dist.get(cur)! + m < (dist.get(next) ?? Infinity)) dist.set(next, dist.get(cur)! + m);
    }
  }
  return dist.get(b) ?? Infinity;
}

export function tripMins(a: PlaceId, b: PlaceId, mode: 'walk' | 'okada'): number {
  const w = walkMins(a, b);
  return mode === 'walk' ? w : Math.max(3, Math.round(w / OKADA.speed));
}

export function okadaFare(a: PlaceId, b: PlaceId): number {
  const wet = G.weather === 'rain' || G.weather === 'storm' ? OKADA.rain : 1;
  return Math.round((OKADA.base + OKADA.perMin * walkMins(a, b)) * wet / 50) * 50;
}

export function isOpen(id: PlaceId, h = hourNow()): boolean {
  const o = place(id).open; if (!o) return true;
  if (o.days === 'sunday' && !isSunday()) return false;
  if (o.days === 'weekdays' && (isSunday() || G.day % 7 === 6)) return false; // day 6, 13… is Saturday
  return h >= o.from && h < o.to;
}

const hh = (h: number): string => `${h % 12 || 12}${h < 12 ? 'AM' : 'PM'}`;
export function openLabel(id: PlaceId): string {
  const o = place(id).open; if (!o) return 'Always open';
  const days = o.days === 'sunday' ? 'Sundays ' : o.days === 'weekdays' ? 'Mon–Fri ' : '';
  return isOpen(id) ? `Open till ${hh(o.to)}` : `Closed · ${days}${hh(o.from)}–${hh(o.to)}`;
}

/** Whether work at this place has light: your own supply at home, the area grid, or the place's own gen. */
export function placePowered(id: PlaceId): boolean {
  const p = place(id).power;
  return p === 'gen' || (p === 'grid' ? G.gridOn : powered());
}

/** Where a neighbour is on the map right now, or null if off it (at the office, at their other house). */
export function npcPlace(id: string): PlaceId | null {
  const w = whereabouts(id);
  return w.at === 'out' ? w.place ?? null : 'street';
}
/** Neighbours you can meet at a place away from home. */
export const peopleAt = (id: PlaceId): string[] => NPCDEF.filter((n) => whereabouts(n.id).at === 'out' && whereabouts(n.id).place === id).map((n) => n.id);

const placeName = (): string => place(G.loc).n;

/** Why you can't set off right now, or null if you can. */
export function cantTravel(to: PlaceId, mode: 'walk' | 'okada'): string | null {
  if (G.intro < 99) return 'Settle into your house first!';
  if (G.job) return 'You still dey work — finish first.';
  if (G.trip) return `You dey road already, going ${place(G.trip.to).n}.`;
  if (G.loc === to) return 'You dey here already.';
  if (!G.unlocked.includes(to)) return 'You never hear of that place.';
  if (mode === 'okada' && G.cash < okadaFare(G.loc, to)) return 'Okada money no dey your pocket.';
  return null;
}

/** Leave for a place. Returns false (with a toast) if you can't. */
export function startTrip(to: PlaceId, mode: 'walk' | 'okada' = 'walk'): boolean {
  const why = cantTravel(to, mode);
  if (why) { toast('🚫 ' + why, 'bad'); return false; }
  if (mode === 'okada') addCash(-okadaFare(G.loc, to), `Okada to ${place(to).n}`);
  if (G.loc === 'street' && G.genOn) setTimeout(() => toast('🔌 Your gen still dey run for house o. Fuel dey burn while you waka.', 'bad'), 900);
  setOff(to, mode);
  const mins = tripMins(G.loc, to, mode);
  toast(`${mode === 'okada' ? '🛵 Okada carry you' : '🚶 You don waka'} go ${place(to).n} — ~${mins} min.`, 'sys');
  save(); updHUD();
  return true;
}

/** Start moving with no checks (hustles commute this way). */
export function setOff(to: PlaceId, mode: 'walk' | 'okada'): void {
  G.trip = { from: G.loc, to, mode, at: T(), until: T() + tripMins(G.loc, to, mode) };
}

/** Fraction of the current trip done, 0..1. */
export function tripProgress(): number {
  const t = G.trip; if (!t) return 0;
  return Math.min(1, (T() - t.at) / Math.max(1, t.until - t.at));
}

/** Be at home right now, wherever you were (sleeping, rushing to a meeting). */
export function comeHome(): void { G.trip = null; G.loc = 'street'; }

function arrive(): void {
  const to = G.trip!.to; G.trip = null; G.loc = to;
  const p = place(to);
  renderPhone(); // the Map and Hustle apps show where you are
  if (to === 'street') { toast('🏠 You don reach house.', 'sys'); return; }
  if (!G.visited.includes(to)) {
    G.visited.push(to); fun(5); sfx.cash();
    toast(`📍 First time for <b>${p.n}</b>! ${p.blurb}`, 'sys'); checkObj('visit');
  } else toast(`📍 You don reach ${p.n}.${isOpen(to) ? '' : ' E don close sha — ' + openLabel(to) + '.'}`, 'sys');
}

/* ---------- waypoints: where the map is guiding you ---------- */

const wpNpc = (w = G.waypoint): string | null => (w?.startsWith('npc:') ? w.slice(4) : null);
/** Where the waypoint is right now (a neighbour's waypoint moves with them), or null if they're off the map. */
export function waypointPlace(): PlaceId | null {
  const w = G.waypoint; if (!w) return null;
  const npc = wpNpc(w);
  return npc ? npcPlace(npc) : (w as PlaceId);
}
/** "Aunty Caro · Market" or "Market". */
export function waypointLabel(): string {
  const npc = wpNpc(), p = waypointPlace();
  if (npc) return `${npcDef(npc).name} · ${p ? place(p).n : 'not around'}`;
  return p ? place(p).n : '';
}

export function setWaypoint(w: Waypoint | null, quiet = false): void {
  G.waypoint = w;
  if (w && !quiet) {
    const p = waypointPlace();
    toast(p ? `📌 Map don mark <b>${waypointLabel()}</b>${p === G.loc && !G.trip ? ' — you dey there already!' : ` · ${walkMins(G.loc, p)} min waka`}.`
      : `📌 ${waypointLabel()} — dem no dey anywhere for map now. Check back later.`, 'sys');
  }
  updHUD(); renderPhone();
}

/** Point the player somewhere unless they're already being guided (events use this). */
export function suggest(id: PlaceId): void {
  if (G.waypoint || here(id) || !G.unlocked.includes(id)) return;
  setWaypoint(id, true);
}

/** Head for the waypoint. */
export function goToWaypoint(mode: 'walk' | 'okada' = 'walk'): void {
  const p = waypointPlace(); if (p) startTrip(p, mode);
}

/** Clear the waypoint once you're standing where it points. */
function reachedWaypoint(): void {
  const p = waypointPlace(); if (!p || G.trip || p !== G.loc) return;
  const npc = wpNpc();
  if (npc) toast(`📌 ${npcDef(npc).name} dey here! Tap am for the card to talk.`, 'sys');
  G.waypoint = null;
}

/** Called every sim tick. */
export function worldTick(): void {
  if (G.trip && T() >= G.trip.until) arrive();
  reachedWaypoint();
  for (const p of PLACES) {
    if (p.unlockDay > G.day || G.unlocked.includes(p.id)) continue;
    G.unlocked.push(p.id);
    if (G.intro >= 99) toast(`🗺️ New place on your map: <b>${p.emoji} ${p.n}</b>. ${p.blurb}`, 'sys');
  }
  // the meeting starts at 6PM at home; a nudge half an hour before if you're out
  if (G.day >= G.nextMeetingDay && !atHome() && G.minute >= MEETING_START - 30 && G.minute < MEETING_START - 26) {
    toast(`🗳️ Street meeting go start 6PM and you dey ${G.trip ? 'road' : placeName()}. Waka home!`, 'bad');
    if (G.trip?.to !== 'street') setWaypoint('street', true);
  }
}

/** For actions that need you at home: true if you're there, otherwise a toast and false. */
export function needHome(what: string): boolean {
  if (atHome()) return true;
  toast(`🏠 ${what} dey house — you dey ${G.trip ? 'road' : placeName()}. Go home first!`, 'bad');
  return false;
}

/* ---------- things to do at each place ---------- */

export interface PlaceAction {
  id: string; at: PlaceId; t: string; sub: string;
  /** Once per game day. */
  daily?: boolean;
  /** Why it can't be done right now, or null. */
  blocked?: () => string | null;
  fn: () => void;
}

const didToday = (id: string): boolean => (G.flags.did?.[id] ?? -1) === G.day;
const markDone = (id: string): void => { (G.flags.did ??= {})[id] = G.day; };

export const PLACE_ACTIONS: PlaceAction[] = [
  { id: 'buka', at: 'market', t: '🍲 Chop for buka — ₦200', sub: 'Cheaper than cooking. Hunger −40',
    blocked: () => (G.cash < 200 ? 'No ₦200' : G.hunger < 15 ? 'You never hungry' : null),
    fn: () => { addCash(-200, 'Buka food'); G.hunger = Math.max(0, G.hunger - 40); fun(2); toast('🍲 Mama Put serve you correct amala. Belle don sweet.', 'sys'); } },
  { id: 'marketGist', at: 'market', t: '🗣️ Collect market gist', sub: 'Fun +5', daily: true,
    fn: () => { fun(5); toast('🗣️ Market women say NEPA oga don buy new jeep. "Na our money o!" Fun +5', 'npc'); } },
  { id: 'okadaGist', at: 'junction', t: '🛵 Gist with the okada men', sub: 'Fun +4 · dem know every road', daily: true,
    fn: () => { fun(4); toast('🛵 Okada man: "Light for that side? E don go since Tuesday. Una own better."', 'npc'); } },
  { id: 'cafeCharge', at: 'campus', t: '🔌 Charge phone at the cyber café — ₦200', sub: 'Dem get gen. Phone +50%',
    blocked: () => (G.cash < 200 ? 'No ₦200' : G.phone >= 95 ? 'Phone full already' : !isOpen('campus') ? 'Café don close' : null),
    fn: () => { addCash(-200, 'Cyber café charging'); G.phone = Math.min(100, G.phone + 50); toast('🔌 Café gen dey hum. Your phone don rise +50%.', 'sys'); } },
  { id: 'complain', at: 'disco', t: '📝 Complain about estimated billing', sub: 'Small chance of free units', daily: true,
    blocked: () => (!isOpen('disco') ? 'Office don close' : null),
    fn: () => {
      if (Math.random() < .3) { G.meterUnits += 3; toast('📝 Miracle! Customer care credit you <b>3 units</b> "as goodwill". Frame this day.', 'sys'); sfx.cheer(); }
      else toast('📝 Customer care: "We go escalate am." You fill form in triplicate. Nothing happen.', 'npc');
    } },
  { id: 'service', at: 'church', t: '🙏 Attend the service', sub: 'Mood +6 · trust +2 · neighbours wey dey here like you more', daily: true,
    blocked: () => (!isOpen('church') ? 'Service na Sunday morning' : null),
    fn: () => {
      G.happiness = Math.min(100, G.happiness + 6); G.trust = Math.min(100, G.trust + 2);
      for (const id of peopleAt('church')) { const s = G.npcs.find((n) => n.id === id)!; s.rel = Math.min(100, s.rel + 2); }
      toast('🙏 Pastor pray say "every transformer for this area go stand firm!" Everybody shout AMEN.', 'sys');
    } },
];

/** Run a place action if you're there and it's allowed. */
export function doPlaceAction(id: string): void {
  const a = PLACE_ACTIONS.find((x) => x.id === id); if (!a || !here(a.at)) return;
  if (a.daily && didToday(id)) { toast('⏳ You don do that one today.', 'bad'); return; }
  const why = a.blocked?.(); if (why) { toast('🚫 ' + why, 'bad'); return; }
  if (a.daily) markDone(id);
  a.fn(); save(); updHUD();
}
export const actionReady = (a: PlaceAction): string | null => (a.daily && didToday(a.id) ? 'Done today' : a.blocked?.() ?? null);

/** Shop items come from a place; buy anywhere else and you pay for delivery. */
export const DELIVERY_FEE = 300;
export const shopPlace = (itemId: string): PlaceId => (itemId === 'fuel3' ? 'fuel' : 'market');
export const deliveryFee = (itemId: string): number => (here(shopPlace(itemId)) ? 0 : DELIVERY_FEE);
export const feeNote = (itemId: string): string => {
  const f = deliveryFee(itemId);
  return f ? `+₦${fmt(f)} delivery (₦0 if you buy am for ${place(shopPlace(itemId)).n})` : 'No delivery fee — you dey here';
};
