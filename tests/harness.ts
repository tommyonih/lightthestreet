/* Shared headless test setup: real markup in jsdom, no toasts/HUD redraws, modals answered by a picker. */
import html from '../index.html?raw';
import { beforeAll, beforeEach } from 'vitest';
import { G, T, freshState, setG } from '../src/core/state';
import type { Choice } from '../src/core/types';
import { HUSTLES } from '../src/data/content';
import { eatAction, sleepAction } from '../src/game/actions';
import { UNIT_PRICE } from '../src/game/economy';
import { busy, doHustle } from '../src/game/jobs';
import { INTRO_DONE } from '../src/game/intro';
import { powered } from '../src/game/helpers';
import { setupObjectives } from '../src/game/progress';
import { setScreenGate, STEP, tick } from '../src/game/sim';
import { C, applyCreator } from '../src/ui/creator';
import { setModalDriver } from '../src/ui/modal';
import { setHeadless } from '../src/ui/toast';

export const TICKS_PER_DAY = 1440 / STEP;

export type Picker = (c: Choice[]) => Choice | undefined;
export const randomPick: Picker = (c) => { const ok = c.filter((x) => !x.dis && x.fn); return ok[Math.floor(Math.random() * ok.length)]; };
export const firstPick: Picker = (c) => c.find((x) => !x.dis && x.fn);
export const lastPick: Picker = (c) => c[c.length - 1];
/** Picks the first enabled choice whose label contains `text`. */
export const pickLabel = (text: string): Picker => (c) => c.find((x) => !x.dis && x.t.includes(text));

let picker: Picker = randomPick;
export function setPicker(p: Picker): void { picker = p; }
/** Run fn with a different modal-answering strategy. */
export function answering(p: Picker, fn: () => void): void { const prev = picker; picker = p; try { fn(); } finally { picker = prev; } }

export function useHeadlessGame(): void {
  beforeAll(() => {
    document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script'));
    document.querySelector('#scr-game')!.classList.add('active');
    setHeadless(true);
    setScreenGate(() => true);
  });
  // reinstalled every test, so a test that swaps the driver can't leak into the next one
  beforeEach(() => { picker = randomPick; setModalDriver((_t, _d, choices) => picker(choices)?.fn?.()); });
}

export function newGame(bg = 'hustler', traits: string[] = []): void {
  C.bg = bg; C.traits = traits;
  setG(freshState()); applyCreator(); setupObjectives();
  G.intro = INTRO_DONE; G.nextFlip = T() + 60;
}

/** A diligent player: keeps the meter topped up, eats when hungry, hustles whenever possible, sleeps at 22:00. */
export function playDays(days: number) {
  let gridOnTicks = 0, zeroTicks = 0, total = 0;
  for (let i = 0; i < days * TICKS_PER_DAY; i++) {
    tick();
    if (G.meterUnits < 3 && G.cash >= 5 * UNIT_PRICE + 800) { G.cash -= 5 * UNIT_PRICE; G.meterUnits += 5; }
    // tops up data (NextPawa 1.5GB) too — but light first: only when units are still affordable afterwards
    if (G.dataMB < 300 && G.cash >= 700 + 5 * UNIT_PRICE + 800) { G.cash -= 700; G.dataMB += 1500; }
    if (G.hunger > 70 && G.cash >= 300) eatAction();
    const h = HUSTLES.find((x) => (G.hustleCd[x.id] ?? -1) <= T() && (x.need !== 'any' || powered()) && (!x.phone || G.phone >= 5));
    if (h && G.hunger <= 90 && !busy()) doHustle(h);
    if (G.minute >= 22 * 60 && G.minute < 22 * 60 + STEP) answering(firstPick, sleepAction);
    total++; if (G.gridOn) gridOnTicks++; if (G.meterUnits <= 0) zeroTicks++;
  }
  return { gridUp: gridOnTicks / total, meterZeroShare: zeroTicks / total };
}
