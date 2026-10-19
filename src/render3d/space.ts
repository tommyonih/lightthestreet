/* Where things stand in the 3D street, derived from the same layout as the 2D street so both agree.
   No three.js here: pure numbers, so it's unit-testable and the UI can import the Hit type cheaply.
   World axes: x along the street (left → right), y up, z towards the camera (houses at the back, road at the front). */
import { HOUSES, LW, PLAYER_HOUSE } from '../render/layout';
import type { Place } from '../game/schedule';
import type { PlaceId } from '../data/content';

/** Logical 2D pixels per world unit. */
export const PX = 20;
export const toX = (px: number): number => (px - LW / 2) / PX;

/** Depths (z) of the street's bands. */
export const Z = {
  houseBack: -6.2, houseFront: -1.2, porch: -0.5, porchBack: .3, outside: 2.4, drain: 4.6, roadNear: 5, roadFar: 9.5,
};
export const HOUSE_H = 4.2;
/** Neighbours leave the street at these x's (left goes to the junction). */
export const EDGE = toX(-60), EDGE_R = toX(LW + 60);

/** What a tap landed on. The UI turns these into the same panels as the 2D street (or runs a place action / opens an app). */
export type Hit = { kind: 'npc'; id: string } | { kind: 'meter' } | { kind: 'gen' } | { kind: 'house' }
  | { kind: 'act'; id: string } | { kind: 'app'; tab: string };

export interface Spot { x: number; z: number; show: boolean }

/** Where a neighbour stands for each kind of whereabouts. `n.x` is their house's place along the street (0..1). */
export function npcSpot(nx: number, back: boolean, at: Place): Spot {
  const x = toX(nx * LW);
  switch (at) {
    case 'porch': return { x, z: back ? Z.porchBack + .7 : Z.porch + .2, show: true };
    case 'outside': return { x: x + (back ? .7 : -.5), z: Z.outside, show: true };
    case 'in': return { x, z: Z.houseFront + .1, show: false };
    case 'out': return { x: nx < .5 ? EDGE : EDGE_R, z: Z.outside + .6, show: false };
  }
}

/** Your front door, where you stand when home and idle. */
export const HOME_SPOT = { x: toX(PLAYER_HOUSE.x + PLAYER_HOUSE.w / 2), z: Z.porch + .9 };
/** Street hustles keep their 2D stall positions. */
export const STALL: Record<string, { x: number; z: number }> = { content: { x: toX(390), z: Z.outside + .4 }, barb: { x: toX(650), z: Z.outside + .4 } };
/** Your gen sits outdoors to the right of your house, away from the windows. */
export const GEN_SPOT = { x: toX(PLAYER_HOUSE.x + PLAYER_HOUSE.w) + 1.4, z: Z.houseFront + 1.3 };

/** Where tap-to-walk can take you: the yard between the houses and the drain, inside the street. */
export const WALK = { x0: toX(10), x1: toX(LW - 10), z0: Z.porch, z1: Z.drain - .3 };
export function clampWalk(x: number, z: number): { x: number; z: number } {
  return { x: Math.min(WALK.x1, Math.max(WALK.x0, x)), z: Math.min(WALK.z1, Math.max(WALK.z0, z)) };
}

/** Step `p` towards `to` by at most `step`; true when it arrives. */
export function stepToward(p: { x: number; z: number }, to: { x: number; z: number }, step: number): boolean {
  const dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz);
  if (d <= step) { p.x = to.x; p.z = to.z; return true; }
  p.x += dx / d * step; p.z += dz / d * step; return false;
}

/** House boxes in world units. */
export const HOUSE_BOXES = HOUSES.map((h) => ({ ...h, cx: toX(h.x + h.w / 2), width: h.w / PX }));

/* ---------- the other places: one set each, in the same world frame as the street ---------- */

export interface P { x: number; z: number }
export interface SetLayout {
  /** Where you (and neighbours) come in from: the road to the junction, on the left. */
  entry: P;
  /** Where you stop when you arrive. */
  arrive: P;
  /** Where visiting neighbours stand, in NPCDEF order of arrival. */
  slots: P[];
  /** Where background people stand or stroll. */
  crowd: P[];
  /** Hustles done here: where you work. */
  jobs: Record<string, P>;
  walk: { x0: number; x1: number; z0: number; z1: number };
}
const WALK_SET = { x0: -20, x1: 20, z0: -.3, z1: 4.4 };
const IN = { x: -24, z: 3 };
export const SETS: Record<Exclude<PlaceId, 'street'>, SetLayout> = {
  junction: { entry: IN, arrive: { x: -2.5, z: 3.4 }, walk: WALK_SET,
    slots: [{ x: .6, z: 1.9 }, { x: 2, z: 2.6 }, { x: -11.5, z: 1.4 }],
    crowd: [{ x: -10.6, z: 2.4 }, { x: -5.4, z: 2.2 }, { x: 8.5, z: 2.6 }, { x: 11, z: .8 }, { x: 14.5, z: 2.2 }],
    jobs: { pos: { x: 4.6, z: 1.9 }, deliver: { x: -8.1, z: 2.4 } } },
  market: { entry: IN, arrive: { x: -8, z: 3.2 }, walk: WALK_SET,
    slots: [{ x: -3.5, z: 1.6 }, { x: .5, z: 2.2 }, { x: 9, z: 1.7 }],
    crowd: [{ x: -14, z: 1.2 }, { x: -6, z: 1 }, { x: 2.5, z: 1.1 }, { x: 5, z: 2.8 }, { x: 12, z: 1.2 }, { x: 15.5, z: 2.6 }],
    jobs: { tailor: { x: 7, z: 1.1 } } },
  fuel: { entry: IN, arrive: { x: -7, z: 3.2 }, walk: WALK_SET,
    slots: [{ x: -2, z: 2.4 }, { x: 2, z: 2.6 }, { x: 9, z: 2.2 }],
    crowd: [{ x: -1, z: 1.4 }, { x: 4.2, z: 1.4 }, { x: 5.4, z: 1.5 }],
    jobs: {} },
  campus: { entry: IN, arrive: { x: -7, z: 3 }, walk: WALK_SET,
    slots: [{ x: -1.5, z: 1.6 }, { x: 2.2, z: 2.2 }, { x: 10, z: 1.6 }],
    crowd: [{ x: -12, z: 1.8 }, { x: -10.6, z: 1.4 }, { x: 4, z: 2.8 }, { x: 13, z: 1.5 }],
    jobs: { remote: { x: 7.4, z: 1.2 } } },
  disco: { entry: IN, arrive: { x: -7, z: 3 }, walk: WALK_SET,
    slots: [{ x: -2.5, z: 1.9 }, { x: 1, z: 2.3 }, { x: 8, z: 2.4 }],
    crowd: [{ x: 1.4, z: .6 }, { x: 2.6, z: .7 }, { x: 3.8, z: .8 }, { x: 5, z: .9 }],
    jobs: {} },
  church: { entry: IN, arrive: { x: -8, z: 3.2 }, walk: WALK_SET,
    slots: [{ x: -3, z: 2 }, { x: -1, z: 2.4 }, { x: 1, z: 2 }, { x: 3, z: 2.4 }, { x: 5, z: 2 }, { x: 7, z: 2.4 }],
    crowd: [{ x: -12, z: 1.6 }, { x: -10, z: 2.2 }, { x: 10, z: 1.8 }, { x: 12, z: 2.4 }, { x: 14, z: 1.6 }],
    jobs: {} },
};
export const setWalk = (id: PlaceId) => (id === 'street' ? WALK : SETS[id].walk);
export function clampIn(id: PlaceId, x: number, z: number): P {
  const w = setWalk(id);
  return { x: Math.min(w.x1, Math.max(w.x0, x)), z: Math.min(w.z1, Math.max(w.z0, z)) };
}
/** Where a trip has got to inside the destination's set: walking (or riding) in from the left. */
export function arriving(id: PlaceId, f: number): P {
  const from = id === 'street' ? { x: EDGE, z: Z.outside + .6 } : SETS[id].entry, to = id === 'street' ? HOME_SPOT : SETS[id].arrive;
  const k = Math.min(1, Math.max(0, f));
  if (k === 1) return { x: to.x, z: to.z }; // exactly there, no rounding drift
  return { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k };
}

/** The camera follows you along the street but never shows past its ends. */
export const CAM_X = { min: toX(220), max: toX(LW - 220) };
export const followX = (x: number): number => Math.min(CAM_X.max, Math.max(CAM_X.min, x));
