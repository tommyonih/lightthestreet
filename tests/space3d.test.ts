/* The 3D street's layout maths (no WebGL needed): it must agree with the 2D street and keep people inside the street. */
import { describe, expect, it } from 'vitest';
import { NPCDEF } from '../src/data/content';
import { HOUSES, LW } from '../src/render/layout';
import {
  CAM_X, EDGE, EDGE_R, HOME_SPOT, HOUSE_BOXES, WALK, Z, clampWalk, followX, npcSpot, stepToward, toX,
} from '../src/render3d/space';

describe('3D street layout', () => {
  it('maps the 2D street onto x symmetrically around the middle', () => {
    expect(toX(LW / 2)).toBe(0);
    expect(toX(0)).toBe(-toX(LW));
  });

  it('keeps the houses in the same order and size as the 2D street', () => {
    for (let i = 1; i < HOUSE_BOXES.length; i++) expect(HOUSE_BOXES[i].cx).toBeGreaterThan(HOUSE_BOXES[i - 1].cx);
    HOUSE_BOXES.forEach((h, i) => expect(h.width).toBeCloseTo(HOUSES[i].w / 20));
    const home = HOUSE_BOXES.find((h) => h.player)!;
    expect(HOME_SPOT.x).toBeCloseTo(home.cx);
  });

  it('puts neighbours on their porch, by the road outside, at their door, or off the street', () => {
    for (const n of NPCDEF) {
      const porch = npcSpot(n.x, !!n.dy, 'porch'), out = npcSpot(n.x, !!n.dy, 'out');
      expect(porch.show).toBe(true);
      expect(porch.z).toBeGreaterThan(Z.houseFront); // in front of the wall, not inside it
      expect(npcSpot(n.x, !!n.dy, 'outside').z).toBeGreaterThan(porch.z);
      expect(npcSpot(n.x, !!n.dy, 'in').show).toBe(false);
      expect(out.show).toBe(false);
      expect([EDGE, EDGE_R]).toContain(out.x);
    }
  });

  it('tap-to-walk never leaves the yard', () => {
    const a = clampWalk(-999, 999), b = clampWalk(999, -999), c = clampWalk(1, 1);
    expect(a).toEqual({ x: WALK.x0, z: WALK.z1 });
    expect(b).toEqual({ x: WALK.x1, z: WALK.z0 });
    expect(c).toEqual({ x: 1, z: 1 });
  });

  it('steps towards a target without overshooting', () => {
    const p = { x: 0, z: 0 };
    expect(stepToward(p, { x: 3, z: 4 }, 1)).toBe(false);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(1);
    expect(stepToward(p, { x: 3, z: 4 }, 10)).toBe(true);
    expect(p).toEqual({ x: 3, z: 4 });
  });

  it('the camera follows you but stops at the ends of the street', () => {
    expect(followX(0)).toBe(0);
    expect(followX(-100)).toBe(CAM_X.min);
    expect(followX(100)).toBe(CAM_X.max);
  });
});
