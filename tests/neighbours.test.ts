import { afterEach, describe, expect, it, vi } from 'vitest';
import { G, SAVE_VERSION, freshState, loadSave } from '../src/core/state';
import { HUSTLES, MEMORY } from '../src/data/content';
import { doHustle } from '../src/game/jobs';
import { tick } from '../src/game/sim';
import { EVENTS } from '../src/game/events';
import { MOTIONS, tallyVotes } from '../src/game/meetings';
import { DECAY, GRUDGE, doFavour, doGrudge, favourCandidate, forgetFaded, grudgeCandidate, opinion, remember } from '../src/game/memory';
import { present, whereabouts } from '../src/game/schedule';
import { npcClick } from '../src/ui/interact';
import { setModalDriver } from '../src/ui/modal';
import { answering, newGame, pickLabel, playDays, useHeadlessGame } from './harness';

useHeadlessGame();
afterEach(() => { vi.restoreAllMocks(); });

const at = (day: number, hour: number) => { G.day = day; G.minute = hour * 60; };

describe('schedules', () => {
  it('a weekday morning: students and office workers are out, the barber is at his shop', () => {
    newGame(); at(2, 10); G.gridOn = true;
    expect(whereabouts('student').at).toBe('out');
    expect(whereabouts('chairman').at).toBe('out');
    expect(whereabouts('remote').at).toBe('in');
    expect(whereabouts('barber').at).toBe('porch');
    expect(present('student')).toBe(false);
  });

  it('Sunday: church-goers are out, Chidera and Tunde are home', () => {
    newGame(); at(7, 10); G.gridOn = true;
    expect(whereabouts('landlord').act).toBe('At church');
    expect(whereabouts('student').at).toBe('porch');
    expect(whereabouts('remote').at).toBe('porch');
  });

  it('everyone is indoors in the small hours when light dey', () => {
    newGame(); at(2, 2); G.gridOn = true;
    expect(G.npcs.every((n) => whereabouts(n.id).at === 'in')).toBe(true);
  });

  it('a hot blackout evening drags everybody outside', () => {
    newGame(); at(2, 21.5); G.temp = 32;
    G.gridOn = true;
    expect(whereabouts('elder').at).toBe('in');
    G.gridOn = false;
    expect(whereabouts('elder').at).toBe('outside');
  });

  it('a daytime blackout sends Tunde out hunting for hotspot', () => {
    newGame(); at(2, 10); G.gridOn = false;
    expect(whereabouts('remote')).toEqual({ at: 'porch', act: 'Hunting for hotspot! 📶' });
  });

  it('the fixed streetlight brings people out in the evening', () => {
    newGame(); at(2, 21.5); G.gridOn = true; G.streetlightFixed = true;
    expect(whereabouts('elder').at).toBe('outside');
  });

  it('you can only borrow Skippo’s shop while he is there', () => {
    newGame(); at(2, 22); G.gridOn = true; G.meterUnits = 10;
    const barb = HUSTLES.find((h) => h.id === 'barb')!;
    const cash0 = G.cash;
    doHustle(barb);
    expect(G.cash).toBe(cash0);
    expect(G.job).toBeNull();
    at(2, 11); doHustle(barb);
    expect(G.job?.id).toBe('barb');
  });
});

describe('memory', () => {
  it('memories fade day by day and are eventually forgotten', () => {
    newGame();
    remember('broke', 'dashed');
    expect(opinion('broke')).toBeCloseTo(MEMORY.dashed.w);
    G.day += 5;
    expect(opinion('broke')).toBeCloseTo(MEMORY.dashed.w * DECAY ** 5);
    G.day += 30; forgetFaded();
    expect(G.npcs.find((n) => n.id === 'broke')!.mem).toHaveLength(0);
  });

  it('covering a share is remembered', () => {
    newGame(); at(2, 12); G.owing = ['broke']; G.npcs.find((n) => n.id === 'broke')!.owing = true; G.cash = 5000;
    vi.spyOn(Math, 'random').mockReturnValue(0); // pick() → first owing household
    answering(pickLabel('Cover'), () => EVENTS.find((e) => e.id === 'whoneverpay')!.run());
    expect(G.npcs.find((n) => n.id === 'broke')!.mem[0].kind).toBe('covered');
  });

  it('neighbours bring up what they remember', () => {
    newGame(); at(2, 12); G.gridOn = true;
    remember('broke', 'covered');
    let desc = '';
    setModalDriver((_t, d) => { desc = d; });
    vi.spyOn(Math, 'random').mockReturnValue(.1);
    npcClick('broke');
    expect(desc).toContain(MEMORY.covered.said[0]);
  });

  it('goodwill turns into a favour — once, then a cooldown', () => {
    newGame(); at(2, 12); G.hunger = 80;
    remember('helpful', 'covered'); remember('helpful', 'dashed');
    expect(favourCandidate(present)).toBe('helpful');
    answering(pickLabel('Accept'), () => doFavour('helpful'));
    expect(G.hunger).toBe(40);
    expect(favourCandidate(present)).toBeNull();
  });

  it('a grudge bites unless you settle it', () => {
    newGame(); G.trust = 50;
    remember('gist', 'exposed'); remember('gist', 'refused');
    expect(grudgeCandidate()).toBe('gist');
    answering(pickLabel('Ignore'), () => doGrudge('gist'));
    expect(G.trust).toBe(45);
    G.day += 4; G.cash = 2000;
    answering(pickLabel('settle'), () => doGrudge('gist'));
    expect(opinion('gist')).toBeGreaterThan(GRUDGE);
    expect(G.cash).toBe(1500);
  });

  it('someone holding a grudge votes against whatever you push', () => {
    vi.spyOn(Math, 'random').mockReturnValue(.5); // nobody absent, no noise
    const petition = MOTIONS.find((m) => m.id === 'petition')!;
    newGame(); G.trust = 80; G.npcs.forEach((n) => { n.rel = 90; });
    expect(tallyVotes(petition, 1, 'yes').yes).toContain('elder'); // elder leans slightly NO, your speech wins them
    remember('elder', 'exposed'); remember('elder', 'refused');
    expect(tallyVotes(petition, 1, 'yes').no).toContain('elder');
  });

  it('a long game with schedules, favours and grudges runs clean', () => {
    newGame();
    expect(() => playDays(10)).not.toThrow();
    G.npcs.forEach((n) => expect(n.mem.length).toBeLessThanOrEqual(8));
  });
});

it('a v3 save gains neighbour memory on load', () => {
  const s = { ...freshState(), ver: 3 } as unknown as Record<string, unknown>;
  (s.npcs as Record<string, unknown>[]).forEach((n) => { delete n.mem; delete n.favourDay; });
  localStorage.setItem('luts_save_v1', JSON.stringify(s));
  const g = loadSave()!;
  expect(g.ver).toBe(SAVE_VERSION);
  expect(g.npcs.every((n) => Array.isArray(n.mem) && n.favourDay < 0)).toBe(true);
});
