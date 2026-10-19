// Scratch: render fixed street scenes to PNGs for before/after comparison. Delete after use.
import { it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { G } from '../src/core/state';
import * as street from '../src/render/street';
import { newGame, useHeadlessGame } from './harness';

const LIB = 'C:/Users/MARVEL~1/AppData/Local/Temp/claude/c--Users-Marvellous-Ogunleke-Desktop-lightthestreat/bbc82c86-45b6-4674-9d1c-6b1b41e4c476/scratchpad/canvaslib/';
const OUT = process.env.SHOTS_OUT!;
const { createCanvas } = createRequire(LIB)('@napi-rs/canvas');
useHeadlessGame();

it('shots', async () => {
  let frame: FrameRequestCallback | null = null, now = 1000;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frame = cb; return 1; });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  try { (await import('../src/render/paint')).setCanvasFactory((w: number, h: number) => createCanvas(w, h)); } catch { /* before: no paint.ts */ }
  const cv = createCanvas(1, 1);
  cv.clientWidth = 860; cv.clientHeight = 470;
  cv.getBoundingClientRect = () => ({ width: 860, height: 470, left: 0, top: 0 });
  newGame(); G.name = 'Smallie';
  street.initRenderer(cv as unknown as HTMLCanvasElement);
  const run = (secs: number) => { for (let i = 0; i < secs * 20; i++) { now += 50; frame?.(now); } };
  const snap = (name: string) => writeFileSync(OUT + '/' + name + '.png', cv.toBuffer('image/png'));
  const set = (min: number, weather: typeof G.weather, grid: boolean, extra: Partial<typeof G> = {}) => {
    Object.assign(G, { day: 2, minute: min, weather, gridOn: grid, meterUnits: 30, genOn: false, lamp: 0, streetlightFixed: true, job: null }, extra);
  };
  set(11 * 60, 'sunny', true); run(2); snap('1-day');
  set(18 * 60 + 40, 'sunny', true); run(1); snap('2-dusk');
  set(21 * 60 + 30, 'sunny', true); run(1); snap('3-night-light');
  set(21 * 60 + 30, 'sunny', false); run(1.5); snap('4-night-blackout');
  set(21 * 60 + 30, 'sunny', false, { genOn: true, lamp: 1 }); run(1.5); snap('5-night-gen');
  set(14 * 60, 'rain', true); run(4); snap('6-rain-day');
  set(22 * 60, 'storm', true); run(4); snap('7-storm-night');
  set(6 * 60 + 20, 'hot', true); run(1); snap('8-dawn');
  set(21 * 60 + 30, 'sunny', true); run(1); G.gridOn = false; now += 140; frame?.(now); snap('9-flicker');
});
