/* Where each neighbour is right now: their routine, bent by what's happening on the street. */
import { G } from '../core/state';
import { ROUTINES, type Spot } from '../data/content';
import { hourNow, streetLit } from './helpers';
import { opinion, GRUDGE } from './memory';

/** 'outside' = chairs pulled out near the road (heat, streetlight). */
export type Place = Spot | 'outside';
export interface Whereabouts { at: Place; act: string }

export function isSunday(): boolean { return G.day % 7 === 0; }

function routineSlot(id: string, h: number): Whereabouts {
  const r = ROUTINES[id];
  const slots = (isSunday() && r?.sunday) || r?.day || [];
  const s = slots.find((x) => h >= x.from && h < x.to);
  if (s) return { at: s.at, act: s.act };
  return { at: 'in', act: h < 6 || h >= 21 ? 'Sleeping' : 'Indoors' };
}

export function whereabouts(id: string): Whereabouts {
  const h = hourNow();
  const w = routineSlot(id, h);
  const evening = h >= 19 || h < 1;
  if (w.at === 'in' && evening) {
    if (!G.gridOn && G.temp >= 28) return { at: 'outside', act: 'Sitting outside — heat no gree sleep' };
    if (streetLit() && h < 23) return { at: 'outside', act: 'Enjoying the streetlight 💡' };
  }
  if (id === 'remote' && w.at === 'in' && w.act === 'On work calls' && !G.gridOn) return { at: 'porch', act: 'Hunting for hotspot! 📶' };
  if (id === 'barber' && w.at === 'porch' && !G.gridOn) return { at: 'porch', act: 'Waiting for light — clipper no dey work' };
  if (w.at !== 'in' && w.at !== 'out' && opinion(id) <= GRUDGE) return { at: w.at, act: '😒 ' + w.act + ' (avoiding you)' };
  return w;
}

/** On the street and reachable (porch or sitting outside). */
export function present(id: string): boolean { const a = whereabouts(id).at; return a === 'porch' || a === 'outside'; }
