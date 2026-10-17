/* Headless play-throughs: a scripted player runs the real simulation with every modal answered automatically. */
import { describe, expect, it, vi } from 'vitest';
import { G, SAVE_VERSION, T, freshState, loadSave, setG } from '../src/core/state';
import { UNIT_PRICE } from '../src/game/economy';
import { startFundDrive } from '../src/game/fund';
import { startGen, stopGen } from '../src/game/generator';
import { introStep, INTRO_DONE, resetIntroClock } from '../src/game/intro';
import { setupObjectives } from '../src/game/progress';
import { applianceDrain, STEP, tick } from '../src/game/sim';
import { C, applyCreator } from '../src/ui/creator';
import { closeModal } from '../src/ui/modal';
import { answering, firstPick, lastPick, newGame, playDays, setPicker, TICKS_PER_DAY, useHeadlessGame } from './harness';

const FUEL_PRICE_PER_L = 1800 / 3;

useHeadlessGame();

describe('balance', () => {
  for (const bg of ['hustler', 'faceme', 'business', 'student', 'estate']) {
    it(`${bg}: a week plays without errors and stays within balance targets`, () => {
      for (let run = 0; run < 4; run++) {
        newGame(bg);
        const { gridUp, meterZeroShare } = playDays(7);
        expect(gridUp).toBeGreaterThan(0.45);
        expect(gridUp).toBeLessThan(0.8);
        expect(meterZeroShare).toBeLessThan(0.05);
        const blackoutsPerDay = G.stats.blackouts / G.day;
        expect(blackoutsPerDay).toBeGreaterThan(1.5);
        expect(blackoutsPerDay).toBeLessThan(5);
        expect(G.stats.events).toBeGreaterThan(G.day); // more than one street event per day
        expect(Number.isFinite(G.cash)).toBe(true);
      }
    });
  }

  it('an hour of small-gen power costs well over an hour of grid power', () => {
    newGame('hustler');
    G.fanOn = true; G.tvOn = false; G.fridgeOn = false; // what a small gen can carry
    let fuelUsed = 0, genTicks = 0;
    for (let i = 0; i < 3 * TICKS_PER_DAY; i++) {
      const before = G.fuel; const wasOn = G.genOn;
      tick();
      if (wasOn) { fuelUsed += before - G.fuel; genTicks++; }
      if (!G.gridOn && !G.genOn) { G.fuel = Math.max(G.fuel, 3); G.genCond = 100; answering(firstPick, () => startGen()); }
      if (G.gridOn && G.genOn) stopGen(true);
    }
    expect(genTicks).toBeGreaterThan(50);
    const hours = genTicks * STEP / 60;
    const genCostPerHour = fuelUsed / hours * FUEL_PRICE_PER_L;
    const gridCostPerHour = applianceDrain() * 60 * UNIT_PRICE;
    expect(genCostPerHour).toBeGreaterThan(gridCostPerHour * 2);
  });
});

describe('regressions', () => {
  it('intro: one blackout, the "buy units" option charges money, then the random engine takes over', () => {
    vi.useFakeTimers();
    try {
      C.bg = 'student'; C.traits = [];
      setG(freshState()); applyCreator(); setupObjectives(); resetIntroClock();
      setPicker(firstPick); // "Buy 5 units now"
      const cash0 = G.cash, units0 = G.meterUnits;
      // stop as soon as the intro hands over, so the random grid engine can't add its own blackout
      for (let s = 0; s < 40 && G.intro < INTRO_DONE; s += 0.5) { vi.advanceTimersByTime(500); introStep(); tick(); }
      expect(G.intro).toBe(INTRO_DONE);
      expect(G.stats.blackouts).toBe(1);
      // −₦1,750 for units, +₦500 "buy" objective, +₦500 "blackout" objective
      expect(G.cash).toBe(cash0 - 5 * UNIT_PRICE + 1000);
      expect(G.meterUnits).toBeGreaterThan(units0);
    } finally { vi.useRealTimers(); closeModal(); }
  });

  it('an outage scheduled past midnight still ends', () => {
    newGame('hustler');
    G.day = 2; G.minute = 23 * 60; G.gridOn = false; G.nextFlip = T() + 120;
    G.flags.transformerDone = true; // a transformer fault right after restore would legitimately cut it again
    let restored = false;
    for (let i = 0; i < 60 && !restored; i++) { tick(); restored = G.gridOn; }
    expect(restored).toBe(true);
    expect(G.day).toBe(3);
  });

  it('a v1 save migrates and keeps playing', () => {
    const s: Record<string, unknown> = { ...freshState() };
    Object.assign(s, { ver: 1, owing: ['landlord', 'you'], fund: 7000, fundGoal: 5000, nextFlip: 900, settings: { sound: true, motion: true } });
    localStorage.setItem('luts_save_v1', JSON.stringify(s));
    const loaded = loadSave()!;
    expect(loaded.ver).toBe(SAVE_VERSION);
    expect(loaded.fundGoal).toBe(12000);
    expect(loaded.owing).toEqual(['landlord']);
    expect(loaded.youPaid).toBe(false);
    setG(loaded);
    expect(G.nextFlip).toBeGreaterThan(T());
    expect(() => playDays(3)).not.toThrow();
  });

  it('refusing to pay ("I go pay later") never puts the player in the owing list', () => {
    newGame('hustler');
    for (let i = 0; i < 20; i++) answering(lastPick, startFundDrive);
    expect(G.owing).not.toContain('you');
    expect(G.youPaid).toBe(false);
  });

  it('the street fund only completes once neighbours and you have actually paid', () => {
    newGame('hustler');
    answering(lastPick, startFundDrive); // first drive, you refuse
    expect(G.fund).toBeLessThan(G.fundGoal);
    expect(G.streetlightFixed).toBe(false);
  });
});
