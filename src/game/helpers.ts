import { G } from '../core/state';
import { clamp } from '../core/util';
import { NPCDEF, type NpcDef } from '../data/content';
import type { NpcState } from '../core/types';

export function hourNow(): number { return G.minute / 60; }
export function isNight(): boolean { const h = hourNow(); return h >= 19.2 || h < 6; }
export function dayTime(): string {
  const h = Math.floor(G.minute / 60), m = G.minute % 60;
  return `Day ${G.day} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function npcDef(id: string): NpcDef { return NPCDEF.find((n) => n.id === id)!; }
export function npcState(id: string): NpcState { return G.npcs.find((n) => n.id === id)!; }
export function rel(id: string, n: number): void { const s = npcState(id); s.rel = clamp(s.rel + n, 0, 100); }
export function hasTrait(t: string): boolean { return G.traits.includes(t); }

export function sunUp(): boolean { const h = hourNow(); return h >= 7 && h < 17.5 && (G.weather === 'sunny' || G.weather === 'hot'); }
/** Any usable power source for appliances? */
export function powered(): boolean {
  return (G.gridOn && G.meterUnits > 0) || G.genOn || (G.inverter > 0 && G.invCharge > 0) || (G.solar > 0 && sunUp());
}
export function cooling(): boolean { return (powered() && G.fanOn) || (G.fanRecharge > 0 && G.fanBat > 0); }
export function streetLit(): boolean { return G.streetlightFixed && isNight(); }

export const mood = (n: number): void => { G.happiness = clamp(G.happiness + n, 0, 100); };
export const fun = (n: number): void => { G.fun = clamp(G.fun + n, 0, 100); };
export const trust = (n: number): void => { G.trust = clamp(G.trust + n, 0, 100); };
