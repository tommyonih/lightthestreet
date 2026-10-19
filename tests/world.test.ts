/* Places and travel: trips, home-only actions, hustle commutes, unlocks, and old saves landing somewhere sensible. */
import { describe, expect, it } from 'vitest';
import { G, SAVE_VERSION, T, freshState, loadSave, setG } from '../src/core/state';
import { HUSTLES, PLACES } from '../src/data/content';
import { eatAction, sleepAction } from '../src/game/actions';
import { buyItem, itemPrice } from '../src/game/economy';
import { startGen } from '../src/game/generator';
import { busy, commuting, doHustle } from '../src/game/jobs';
import { callMeeting } from '../src/game/meetings';
import { UNIT_PRICE } from '../src/game/economy';
import {
  DELIVERY_FEE, atHome, doPlaceAction, goToWaypoint, here, isOpen, npcPlace, okadaFare, peopleAt, setWaypoint, startTrip,
  tripMins, walkMins, waypointPlace,
} from '../src/game/world';
import { tick } from '../src/game/sim';
import { STEP } from '../src/game/sim';
import { answering, firstPick, newGame, pickLabel, TICKS_PER_DAY, useHeadlessGame } from './harness';

useHeadlessGame();

/** Tick until `done` or a game-time budget runs out. */
function tickUntil(done: () => boolean, mins = 600): void {
  for (let i = 0; i < mins / STEP && !done(); i++) tick();
}
const calm = () => { G.nextFlip = Infinity; G.lastEvent = Infinity; G.flags.transformerDone = true; G.nextMeetingDay = 99; };

describe('map data', () => {
  it('every place is reachable, walking is symmetric, and okada is faster but costs money', () => {
    for (const a of PLACES) for (const b of PLACES) {
      expect(walkMins(a.id, b.id)).toBe(walkMins(b.id, a.id));
      expect(Number.isFinite(walkMins(a.id, b.id))).toBe(true);
    }
    expect(walkMins('street', 'market')).toBe(22); // via the junction
    newGame();
    expect(tripMins('street', 'market', 'okada')).toBeLessThan(tripMins('street', 'market', 'walk'));
    expect(okadaFare('street', 'market')).toBeGreaterThan(0);
  });

  it('every hustle and routine place exists', () => {
    const ids = PLACES.map((p) => p.id);
    for (const h of HUSTLES) expect(ids).toContain(h.place);
  });
});

describe('travel', () => {
  it('walking takes game time, and you are on the road until you arrive', () => {
    newGame(); calm(); G.day = 2; G.minute = 9 * 60;
    expect(startTrip('market', 'walk')).toBe(true);
    expect(here('street')).toBe(false); expect(here('market')).toBe(false);
    const start = T();
    tickUntil(() => here('market'));
    expect(here('market')).toBe(true);
    expect(T() - start).toBeGreaterThanOrEqual(22);
    expect(T() - start).toBeLessThan(22 + 2 * STEP);
    expect(G.visited).toContain('market');
  });

  it('okada charges the fare and gets there faster', () => {
    newGame(); calm(); G.day = 2; G.minute = 9 * 60; tick(); // campus unlocks on day 2's first tick
    const cash = G.cash, fare = okadaFare('street', 'campus');
    startTrip('campus', 'okada');
    expect(G.cash).toBe(cash - fare);
    const start = T();
    tickUntil(() => here('campus'));
    expect(T() - start).toBeLessThan(walkMins('street', 'campus'));
  });

  it("you can't travel to a place you haven't heard of, or with no money for okada", () => {
    newGame(); calm();
    expect(G.unlocked).not.toContain('church');
    expect(startTrip('church')).toBe(false);
    G.cash = 0;
    expect(startTrip('market', 'okada')).toBe(false);
    expect(atHome()).toBe(true);
  });

  it('new places unlock as the days pass', () => {
    newGame(); calm();
    expect(G.unlocked).not.toContain('campus');
    G.day = 2; tick();
    expect(G.unlocked).toContain('campus');
  });
});

describe('home-only actions', () => {
  it("away from home you can't start the gen, but you can still eat and buy units", () => {
    newGame(); calm(); G.gridOn = false; G.fuel = 3; G.genCond = 100; G.fanOn = true; G.tvOn = false; G.fridgeOn = false;
    startTrip('junction'); tickUntil(() => here('junction'));
    answering(firstPick, () => startGen());
    expect(G.genOn).toBe(false);
    G.hunger = 60; eatAction();
    expect(G.hunger).toBeLessThan(60);
    // back home, it works
    startTrip('street'); tickUntil(() => atHome());
    for (let i = 0; i < 20 && !G.genOn; i++) answering(firstPick, () => startGen(true));
    expect(G.genOn).toBe(true);
  });

  it('sleeping from anywhere takes you home', () => {
    newGame(); calm(); G.minute = 21 * 60;
    startTrip('market'); tickUntil(() => here('market'));
    answering(firstPick, sleepAction);
    expect(atHome()).toBe(true);
    expect(G.minute).toBe(6.5 * 60);
  });

  it('a meeting while you are out lets you run home and vote', () => {
    newGame(); calm(); G.day = 3;
    startTrip('junction'); tickUntil(() => here('junction'));
    answering(pickLabel('Run home'), callMeeting);
    expect(atHome()).toBe(true);
  });

  it('shop items cost a delivery fee unless you buy them where they are sold', () => {
    newGame(); calm(); G.cash = 50000;
    let cash = G.cash; answering(firstPick, () => buyItem('lamp'));
    expect(cash - G.cash).toBe(itemPrice('lamp') + DELIVERY_FEE);
    G.day = 2; G.minute = 9 * 60;
    startTrip('market'); tickUntil(() => here('market'));
    cash = G.cash; answering(firstPick, () => buyItem('powerbank'));
    expect(cash - G.cash).toBe(itemPrice('powerbank'));
  });
});

describe('hustles at places', () => {
  it('a hustle somewhere else walks you there first, then work starts', () => {
    newGame(); calm(); G.day = 2; G.minute = 10 * 60; G.gridOn = true; G.phone = 90; G.hunger = 10;
    const tailor = HUSTLES.find((h) => h.id === 'tailor')!;
    doHustle(tailor);
    expect(busy()).toBe(true);
    expect(commuting()).toBe(true);
    tick(); tick();
    expect(G.job!.worked).toBe(0);
    tickUntil(() => here('market'));
    tick();
    expect(G.job!.worked).toBeGreaterThan(0);
    tickUntil(() => !busy(), 400);
    expect(here('market')).toBe(true); // you stay where the work was
  });

  it('market work needs the area grid; your gen at home does not reach', () => {
    newGame(); calm(); G.day = 2; G.minute = 10 * 60; G.gridOn = false; G.genOn = true; G.phone = 90; G.hunger = 10;
    doHustle(HUSTLES.find((h) => h.id === 'tailor')!);
    expect(busy()).toBe(false);
  });

  it('the cyber café has its own gen, so freelancing works in a blackout', () => {
    newGame(); calm(); G.day = 2; G.minute = 9 * 60; G.gridOn = false; G.phone = 90; G.hunger = 10;
    doHustle(HUSTLES.find((h) => h.id === 'remote')!);
    expect(busy()).toBe(true);
  });
});

describe('neighbours and place actions', () => {
  it('neighbours who are out at a place can be found there', () => {
    newGame(); calm(); G.day = 2; G.minute = 8 * 60;
    expect(npcPlace('gist')).toBe('market');
    expect(peopleAt('market')).toContain('gist');
    G.minute = 12 * 60;
    expect(npcPlace('gist')).toBe('street');
  });

  it('church is only open on Sunday morning; the service works once that day', () => {
    newGame(); calm(); G.day = 6; G.minute = 9 * 60;
    expect(isOpen('church')).toBe(false);
    G.day = 7; tick();
    expect(isOpen('church')).toBe(true);
    startTrip('church'); tickUntil(() => here('church'));
    const mood = G.happiness;
    doPlaceAction('service');
    expect(G.happiness).toBeGreaterThan(mood);
    const again = G.happiness; doPlaceAction('service');
    expect(G.happiness).toBe(again);
  });
});

describe('waypoints', () => {
  it('a place waypoint guides you there and clears when you arrive', () => {
    newGame(); calm(); G.day = 2; G.minute = 9 * 60;
    setWaypoint('fuel');
    expect(waypointPlace()).toBe('fuel');
    goToWaypoint();
    expect(G.trip?.to).toBe('fuel');
    tickUntil(() => here('fuel'));
    tick();
    expect(G.waypoint).toBeNull();
  });

  it("a neighbour's waypoint follows them, and clears when you find them", () => {
    newGame(); calm(); G.day = 2; G.minute = 7 * 60 + 30;
    setWaypoint('npc:gist');
    expect(waypointPlace()).toBe('market');
    goToWaypoint('okada');
    tickUntil(() => here('market'));
    tick();
    expect(G.waypoint).toBeNull();
    // later she's gone home; a fresh waypoint points at the street instead
    G.minute = 12 * 60;
    setWaypoint('npc:gist');
    expect(waypointPlace()).toBe('street');
  });

  it('running out of fuel points you to the fuel station, without overriding your own waypoint', () => {
    newGame(); calm(); G.gridOn = false; G.fuel = .01; G.genCond = 100; G.fanOn = true; G.tvOn = false; G.fridgeOn = false;
    for (let i = 0; i < 20 && !G.genOn; i++) answering(firstPick, () => startGen(true));
    tick();
    expect(G.waypoint).toBe('fuel');
    setWaypoint('market', true); G.fuel = .01;
    for (let i = 0; i < 20 && !G.genOn; i++) answering(firstPick, () => startGen(true));
    tick();
    expect(G.waypoint).toBe('market');
  });

  it('the meeting reminder points you home', () => {
    newGame(); calm(); G.day = 3; G.nextMeetingDay = 3; G.minute = 16 * 60;
    startTrip('junction'); tickUntil(() => here('junction'));
    G.minute = 17 * 60 + 28; tick();
    expect(G.waypoint).toBe('street');
  });
});

describe('saves', () => {
  it('a v6 save saved mid-hustle migrates to v7 at the workplace', () => {
    const s: Record<string, unknown> = { ...freshState(), ver: 6, job: { id: 'pos', worked: 30, paused: 0 }, day: 4 };
    for (const k of ['loc', 'trip', 'visited', 'unlocked']) delete s[k];
    localStorage.setItem('luts_save_v1', JSON.stringify(s));
    const loaded = loadSave()!;
    expect(loaded.ver).toBe(SAVE_VERSION);
    expect(loaded.loc).toBe('junction');
    expect(loaded.trip).toBeNull();
    expect(loaded.waypoint).toBeNull();
    expect(loaded.visited).toEqual(['street', 'junction']);
    expect(loaded.unlocked).toContain('campus');
    expect(loaded.unlocked).not.toContain('church');
    setG(loaded); calm();
    tickUntil(() => !busy(), 300);
    expect(busy()).toBe(false);
  });
});

describe('balance', () => {
  it('a player who never leaves home can still get through a week', () => {
    for (let run = 0; run < 3; run++) {
      newGame('hustler');
      for (let i = 0; i < 7 * TICKS_PER_DAY; i++) {
        tick();
        if (G.meterUnits < 3 && G.cash >= 5 * UNIT_PRICE + 800) { G.cash -= 5 * UNIT_PRICE; G.meterUnits += 5; }
        if (G.hunger > 70 && G.cash >= 300) eatAction();
        const h = HUSTLES.find((x) => x.place === 'street' && (G.hustleCd[x.id] ?? -1) <= T());
        if (h && !busy() && G.hunger <= 90) doHustle(h);
        if (G.minute >= 22 * 60 && G.minute < 22 * 60 + STEP) answering(firstPick, sleepAction);
        expect(atHome()).toBe(true);
      }
      expect(G.day).toBeGreaterThanOrEqual(7);
      expect(Number.isFinite(G.cash)).toBe(true);
    }
  });
});
