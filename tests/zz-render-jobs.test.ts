// Scratch: render street frames of each hustle with a real canvas so they can be looked at. Deleted after use.
import { it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { G } from '../src/core/state';
import { HUSTLES } from '../src/data/content';
import { doHustle } from '../src/game/jobs';
import { tick } from '../src/game/sim';
import { initRenderer } from '../src/render/street';
import { newGame, useHeadlessGame } from './harness';

const SP = 'C:/Users/MARVEL~1/AppData/Local/Temp/claude/c--Users-Marvellous-Ogunleke-Desktop-lightthestreat/bbc82c86-45b6-4674-9d1c-6b1b41e4c476/scratchpad/';
const { createCanvas } = createRequire(SP + 'canvaslib/')('@napi-rs/canvas');
useHeadlessGame();

it('render jobs', () => {
  let frame: FrameRequestCallback | null = null, now = 1000;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frame = cb; return 1; });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const cv = createCanvas(1, 1);
  cv.getBoundingClientRect = () => ({ width: 860, height: 470, left: 0, top: 0 });
  newGame(); G.name = 'Smallie';
  initRenderer(cv as unknown as HTMLCanvasElement);
  const run = (secs: number) => { for (let i = 0; i < secs * 10; i++) { now += 100; frame?.(now); } };
  const snap = (name: string) => writeFileSync(SP + 'job-' + name + '.png', cv.toBuffer('image/png'));

  for (const h of HUSTLES) {
    G.day = 2; G.minute = 11 * 60; G.gridOn = true; G.meterUnits = 30; G.phone = 90; G.hunger = 10; G.nextFlip = Infinity;
    G.hustleCd = {}; G.job = null; G.weather = 'sunny'; G.flags.transformerDone = true; G.lastEvent = Infinity;
    run(1);
    doHustle(h);
    if (h.id === 'deliver') { run(1.2); snap('deliver-leaving'); }
    run(7);
    for (let i = 0; i < 8; i++) tick();
    run(0.6);
    snap(h.id);
    if (h.id === 'deliver') { G.job!.worked = h.mins; tick(); run(2.5); snap('deliver-back'); run(4); }
    G.job = null; run(6);
  }
  // waiting for light
  G.hustleCd = {}; G.gridOn = true; doHustle(HUSTLES.find((h) => h.id === 'tailor')!); run(4); G.gridOn = false; G.genOn = false; tick(); run(.5); snap('tailor-no-light');
});
