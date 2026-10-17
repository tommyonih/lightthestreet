import { describe, expect, it } from 'vitest';
import { G, SAVE_VERSION, freshState, loadSave } from '../src/core/state';
import { ALL_DONE_BONUS, CHALLENGES, challenge, checkChallenges, ensureWeek, weekOf, weekRollover } from '../src/game/challenges';
import { meterEmpty, newDay } from '../src/game/sim';
import { renderShareCard } from '../src/render/shareCard';
import { setModalDriver } from '../src/ui/modal';
import { newGame, playDays, useHeadlessGame } from './harness';

useHeadlessGame();

/** Force this week's challenges, for deterministic tests. */
function setWeek(...ids: string[]): void { ensureWeek(); G.week.list = ids.map((id) => ({ id, state: 'active' })); }
/** Jump to the first day of next week through the real day rollover. */
function finishWeek(): void { while (G.day % 7 !== 0) G.day++; newDay(); }

describe('drawing challenges', () => {
  it('a week gets three different, eligible challenges — the same ones every reload', () => {
    newGame('student'); // no generator → no gen challenge
    ensureWeek();
    const ids = G.week.list.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).not.toContain('gendiet');
    G.week.list = []; ensureWeek();
    expect(G.week.list.map((c) => c.id)).toEqual(ids);
  });

  it('the starting cash baseline is the background’s cash, not the default', () => {
    newGame('estate'); ensureWeek();
    expect(G.week.startCash).toBe(9000);
  });
});

describe('progress', () => {
  it('a count challenge pays out the moment it is done — once', () => {
    newGame(); setWeek('helper');
    const cash0 = G.cash;
    G.stats.helped += 3; checkChallenges();
    expect(G.week.list[0].state).toBe('done');
    expect(G.cash).toBe(cash0 + challenge('helper').reward);
    checkChallenges();
    expect(G.cash).toBe(cash0 + challenge('helper').reward);
    expect(G.stats.challengesDone).toBe(1);
  });

  it('breaking a rule fails the challenge straight away', () => {
    newGame(); setWeek('quiet');
    G.stats.complaints++; checkChallenges();
    expect(G.week.list[0].state).toBe('failed');
  });

  it('week-long challenges are judged when the week ends', () => {
    setModalDriver(() => {});
    newGame(); setWeek('meter', 'phone', 'saver');
    G.cash += 6000; meterEmpty();
    finishWeek();
    const last = G.weekHistory[0];
    expect(last).toEqual({ n: 1, done: 2, total: 3 }); // meter hit zero; phone and savings fine
    expect(G.week.n).toBe(2);
    expect(G.week.list).toHaveLength(3);
  });

  it('all three in a week pays the bonus, earns the badge and offers a week card', () => {
    let title = '';
    setModalDriver((t) => { title = t; });
    newGame(); setWeek('helper', 'social', 'meter');
    G.stats.helped += 3; G.week.c.greeted = ['a', 'b', 'c', 'd', 'e', 'f']; checkChallenges();
    const cash0 = G.cash;
    finishWeek();
    expect(G.cash).toBeGreaterThanOrEqual(cash0 + challenge('meter').reward + ALL_DONE_BONUS);
    expect(G.ach).toContain('champion');
    expect(title).toContain('Week 1 don finish');
  });

  it('rollover only happens once per week', () => {
    setModalDriver(() => {});
    newGame(); setWeek('helper');
    G.day = 8; weekRollover(); weekRollover();
    expect(G.weekHistory).toHaveLength(1);
  });

  it('every challenge can be evaluated without errors', () => {
    newGame(); ensureWeek();
    for (const c of CHALLENGES) { expect(Number.isFinite(c.value(G.week))).toBe(true); c.broken?.(G.week); }
  });

  it('three weeks of play roll over cleanly', () => {
    newGame();
    while (G.day < 22) playDays(1); // sleeping skips nights, so count game days, not ticks
    expect(G.week.n).toBe(weekOf(G.day));
    expect(G.weekHistory.map((w) => w.n)).toEqual(Array.from({ length: G.week.n - 1 }, (_, i) => G.week.n - 1 - i));
  });
});

describe('share card', () => {
  function recordingCanvas() {
    const text: string[] = [];
    const noop = () => {};
    const ctx = new Proxy({}, {
      get: (_t, k) => k === 'fillText' ? (s: string) => text.push(s)
        : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : noop,
      set: () => true,
    });
    HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
    return text;
  }

  it('the session card carries your name and real stats', () => {
    const text = recordingCanvas();
    newGame(); G.name = 'Smallie'; G.stats.blackouts = 17; G.stats.helped = 4;
    const c = renderShareCard({ kind: 'session' });
    expect([c.width, c.height]).toEqual([1080, 1350]);
    expect(text).toContain('Smallie');
    expect(text).toContain('17');
    expect(text).toContain('blackouts survived');
    expect(text.some((t) => t.includes('fictional'))).toBe(true);
  });

  it('the week card lists that week’s challenges and the score', () => {
    const text = recordingCanvas();
    newGame(); setWeek('helper', 'meter', 'voice');
    G.week.list[0].state = 'done';
    renderShareCard({ kind: 'week', week: G.week });
    expect(text).toContain(challenge('helper').title);
    expect(text).toContain(challenge('voice').title);
    expect(text).toContain('1/3');
  });
});

it('a v4 save gains weekly challenges on load', () => {
  const s = { ...freshState(), ver: 4, day: 10 } as unknown as Record<string, unknown>;
  delete s.week; delete s.weekHistory;
  localStorage.setItem('luts_save_v1', JSON.stringify(s));
  const g = loadSave()!;
  expect(g.ver).toBe(SAVE_VERSION);
  expect(g.week.n).toBe(2);
  expect(g.weekHistory).toEqual([]);
});
