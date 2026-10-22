import { describe, expect, it } from 'vitest';
import { G, SAVE_VERSION, freshState, migrate, setG } from '../src/core/state';
import { BIRTHS } from '../src/data/content';
import { applyBirth, payDebt, rollBirth } from '../src/game/birth';
import { newDay } from '../src/game/sim';
import { newGame, useHeadlessGame } from './harness';

useHeadlessGame();

/** A fixed sequence of "random" numbers, then .5 forever. */
const seq = (...xs: number[]) => () => (xs.length ? xs.shift()! : .5);

describe('birth roll', () => {
  it('lands on Net Baby below the odds and Local Baby above them', () => {
    expect(rollBirth(seq(0)).birth).toBe('net');
    expect(rollBirth(seq(.99)).birth).toBe('local');
  });

  it('keeps every roll inside its birth\'s ranges', () => {
    for (let i = 0; i < 300; i++) {
      const p = rollBirth(), b = BIRTHS[p.birth];
      expect(p.cash).toBeGreaterThanOrEqual(b.cash[0]); expect(p.cash).toBeLessThanOrEqual(b.cash[1]);
      expect(p.units).toBeGreaterThanOrEqual(b.units[0]); expect(p.units).toBeLessThanOrEqual(b.units[1]);
      expect(b.bgs).toContain(p.bg); expect(b.streets).toContain(p.streetType);
      if (p.birth === 'net') expect(p.debt).toBe(0);
      else if (p.debt) { expect(p.debt).toBeGreaterThanOrEqual(b.debt[0]); expect(p.debt).toBeLessThanOrEqual(b.debt[1]); }
    }
  });

  it('a Net Baby starts rich and well connected, a Local Baby poor', () => {
    newGame(); const base = G.npcs[0].rel;
    applyBirth(rollBirth(seq(0)));
    expect(G.birth).toBe('net'); expect(G.cash).toBeGreaterThanOrEqual(100000); expect(G.gen).toBe(2); expect(G.inverter).toBe(1);
    expect(G.npcs[0].rel).toBeGreaterThan(base); expect(G.week.startCash).toBe(G.cash);
    newGame(); applyBirth(rollBirth(seq(.99, .5, .5, .5, .5, 0)));
    expect(G.birth).toBe('local'); expect(G.cash).toBeLessThan(5000); expect(G.debt).toBeGreaterThan(0);
  });
});

describe('debt', () => {
  it('grows every morning and can be paid down to zero', () => {
    newGame(); G.debt = 10000; G.cash = 50000;
    newDay(); expect(G.debt).toBe(10200);
    expect(payDebt(1000)).toBe(1000); expect(G.debt).toBe(9200);
    payDebt(); expect(G.debt).toBe(0); expect(G.flags.debtCleared).toBe(true);
    expect(G.ach).toContain('debtfree');
    newDay(); expect(G.debt).toBe(0);
  });

  it('never pays more than the cash you have', () => {
    newGame(); G.debt = 10000; G.cash = 300;
    expect(payDebt()).toBe(300); expect(G.cash).toBe(0); expect(G.debt).toBe(9700);
    expect(payDebt()).toBe(0);
  });

  it('old saves load with no birth and no debt', () => {
    setG(freshState()); const old = JSON.parse(JSON.stringify(G)); old.ver = 9; delete old.birth; delete old.debt;
    const s = migrate(old);
    expect(s.ver).toBe(SAVE_VERSION); expect(s.birth).toBeNull(); expect(s.debt).toBe(0);
  });
});
