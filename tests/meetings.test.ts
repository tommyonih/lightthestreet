import { afterEach, describe, expect, it, vi } from 'vitest';
import { G, SAVE_VERSION, loadSave, freshState } from '../src/core/state';
import { EVENTS } from '../src/game/events';
import { MOTIONS, MEETING_EVERY, callMeeting, meetingDue, policiesNewDay, resolve, supplyMods, tallyVotes, type Motion } from '../src/game/meetings';
import { startGen } from '../src/game/generator';
import { tick } from '../src/game/sim';
import { answering, firstPick, newGame, pickLabel, playDays, useHeadlessGame } from './harness';

useHeadlessGame();
afterEach(() => { vi.restoreAllMocks(); });

const motion = (id: string) => MOTIONS.find((m) => m.id === id)!;

describe('scheduling', () => {
  it('the first meeting is called on day 3 at 6PM and the next one is booked', () => {
    newGame();
    G.day = 3; G.minute = 17 * 60 + 56;
    expect(meetingDue()).toBe(false);
    answering((c) => pickLabel('Attend')(c) ?? firstPick(c), () => { tick(); });
    expect(G.meetings).toHaveLength(1);
    expect(G.meetings[0].you).not.toBe('absent');
    expect(G.nextMeetingDay).toBe(3 + MEETING_EVERY);
    expect(meetingDue()).toBe(false);
  });

  it('skipping costs trust and the street votes without you', () => {
    newGame(); G.day = 3; G.minute = 18 * 60;
    const trust0 = G.trust;
    answering(pickLabel('Skip'), callMeeting);
    expect(G.trust).toBe(trust0 - 4);
    expect(G.meetings[0].you).toBe('absent');
  });

  it('a long game holds meetings regularly without errors', () => {
    newGame();
    playDays(12); // random answers, including random motions and votes
    expect(G.meetings.length).toBeGreaterThanOrEqual(2);
  });
});

describe('voting', () => {
  it('speaking moves neighbours you are close to', () => {
    const m = motion('curfew');
    let forWins = 0, againstWins = 0;
    for (let i = 0; i < 300; i++) {
      newGame(); G.trust = 80; G.npcs.forEach((n) => { n.rel = 90; });
      if (tallyVotes(m, 1, 'yes').passed) forWins++;
      if (tallyVotes(m, -1, 'no').passed) againstWins++;
    }
    expect(forWins / 300).toBeGreaterThan(.9);
    expect(againstWins / 300).toBeLessThan(.1);
  });

  it('speech barely moves strangers', () => {
    const m = motion('levy');
    let swing = 0;
    for (let i = 0; i < 300; i++) {
      newGame(); G.trust = 20; G.npcs.forEach((n) => { n.rel = 30; });
      swing += Number(tallyVotes(m, 1, 'abstain').passed) - Number(tallyVotes(m, -1, 'abstain').passed);
    }
    expect(Math.abs(swing / 300)).toBeLessThan(.15);
  });

  it('ties go to the chair: Dele by his own lean, you by your vote', () => {
    vi.spyOn(Math, 'random').mockReturnValue(.5); // nobody absent, no noise → everyone at |lean| < .15 abstains
    const quiet: Motion = { ...motion('petition'), stance: { chairman: .1 }, adjust: undefined };
    newGame();
    const dele = tallyVotes(quiet, 0, 'abstain');
    expect(dele.tieBreak).toBe(true);
    expect(dele.passed).toBe(true);
    G.policies.youChair = true;
    expect(tallyVotes(quiet, 0, 'abstain').passed).toBe(false);
    expect(tallyVotes({ ...quiet, stance: {} }, 0, 'yes').passed).toBe(true); // 1–0, not even a tie
  });

  it('neighbours on your side warm to you; winning votes are counted', () => {
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    newGame();
    const m = motion('petition'); // gist, remote, barber lean YES strongly
    const before = G.npcs.find((n) => n.id === 'gist')!.rel;
    const t = resolve(m, 0, 'yes');
    expect(t.passed).toBe(true);
    expect(G.stats.votesWon).toBe(1);
    expect(G.npcs.find((n) => n.id === 'gist')!.rel).toBe(before + 2);
  });
});

describe('policies', () => {
  it('every motion can pass without errors and changes the street', () => {
    for (const m of MOTIONS) {
      newGame(); G.trust = 80; G.day = 8; G.owing = ['broke', 'student']; G.cash = 5000;
      const fund0 = G.fund;
      expect(typeof m.onPass()).toBe('string');
      const changed = JSON.stringify(G.policies) !== '{}' || G.fund > fund0;
      expect(changed, m.id).toBe(true);
    }
  });

  it('curfew fines a generator running late at night', () => {
    newGame(); G.policies.genCurfew = true;
    G.fanOn = true; G.tvOn = false; G.fridgeOn = false; G.genCond = 100; G.fuel = 50;
    G.minute = 23 * 60; G.cash = 10_000; G.nextFlip = Infinity; G.gridOn = false;
    vi.spyOn(Math, 'random').mockReturnValue(.01); // gen always starts, fine always lands
    answering(firstPick, () => startGen());
    expect(G.genOn).toBe(true);
    tick();
    expect(G.cash).toBeLessThan(10_000);
  });

  it('a night guard stops the theft event', () => {
    newGame(); G.day = 3; G.minute = 23 * 60 + 30; G.fuel = 3;
    const theft = EVENTS.find((e) => e.id === 'theft')!;
    expect(theft.cond()).toBe(true);
    G.policies.security = true;
    expect(theft.cond()).toBe(false);
  });

  it('a petition gets answered on its day, and better supply shortens outages', () => {
    newGame();
    G.policies.petitionDay = G.day;
    vi.spyOn(Math, 'random').mockReturnValue(.1); // DisCo answers
    policiesNewDay();
    expect(G.policies.petitionDay).toBeUndefined();
    expect(G.policies.betterSupplyUntil).toBe(G.day + 5);
    const mods = supplyMods();
    expect(mods.off).toBeLessThan(1);
    expect(mods.on).toBeGreaterThan(1);
  });

  it('you can only be nominated chairman once the street trusts you', () => {
    newGame(); G.day = 8; G.trust = 50;
    expect(motion('newchair').eligible()).toBe(false);
    G.trust = 75;
    expect(motion('newchair').eligible()).toBe(true);
  });
});

it('a v2 save gains meetings on load', () => {
  const s: Record<string, unknown> = { ...freshState(), ver: 2, day: 5 };
  delete s.policies; delete s.meetings; delete s.nextMeetingDay;
  (s.stats as Record<string, unknown>).votesWon = undefined;
  localStorage.setItem('luts_save_v1', JSON.stringify(s));
  const g = loadSave()!;
  expect(g.ver).toBe(SAVE_VERSION);
  expect(g.policies).toEqual({});
  expect(g.nextMeetingDay).toBe(6);
  expect(g.stats.votesWon).toBe(0);
});
