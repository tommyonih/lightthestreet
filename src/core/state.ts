import type { GameState, Settings, Stats, WeekState } from './types';
import { HUSTLES, NPCDEF, PLACES, type PlaceId } from '../data/content';

const SAVE_KEY = 'luts_save_v1';
const SETTINGS_KEY = 'luts_settings';
export const FIRST_MEETING_DAY = 3;
export const SAVE_VERSION = 9;

/** Mobile data every new (or upgraded) player starts with, in MB. */
export const STARTING_DATA = 800;

/** Places on the map by a given day. */
export const unlockedBy = (day: number): PlaceId[] => PLACES.filter((p) => p.unlockDay <= day).map((p) => p.id);
/** "Never happened" for day stamps — far enough back that every cooldown has passed. */
const NEVER = -99;

/** The live game state. ES module exports are live bindings, so importers always see the current object. */
export let G: GameState = null as unknown as GameState;
export function setG(s: GameState | null): void { G = s as GameState; }
export function hasGame(): boolean { return G != null; }

/** Absolute game time in minutes (day*1440+minute). All scheduled times use this so they survive midnight. */
export function T(): number { return G.day * 1440 + G.minute; }

/** Settings live outside the save so the menu sound toggle never touches game state. */
export const SET: Settings = (() => {
  const d: Settings = { sound: true, motion: true, view: 'auto' };
  try { return Object.assign(d, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { return d; }
})();
export function saveSettings(): void { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SET)); } catch { /* storage blocked */ } }

/** A week with no challenges drawn yet — the challenge module fills `list` on first use. */
export function emptyWeek(n: number, day: number, cash: number, st: Stats): WeekState {
  return {
    n, startDay: day, startCash: cash,
    base: { helped: st.helped, blackouts: st.blackouts, complaints: st.complaints, votesWon: st.votesWon },
    c: { hustle: 0, fundPaid: 0, genMin: 0, peace: 0, greeted: [], meterZero: false, phoneLow: false },
    list: [],
  };
}

export function freshState(): GameState {
  const stats: Stats = { blackouts: 0, restores: 0, spent: 0, helped: 0, events: 0, complaints: 0, quietBlackouts: 0, votesWon: 0, challengesDone: 0, escrowDeals: 0, noMeterFailDays: 0, noiseThisBlackout: 0 };
  return {
    ver: SAVE_VERSION, name: 'Resident', gender: 0, skin: 2, hair: 0, outfit: 0, traits: [], bg: 'hustler',
    day: 1, minute: 7 * 60, weather: 'sunny', temp: 31,
    gridOn: true, nextFlip: 1440 + 7 * 60 + 18, flashUntil: 0, lastEvent: 0,
    meterUnits: 12, meterNo: '0452' + String(Math.floor(10000000 + Math.random() * 89999999)),
    cash: 3000, fuel: 3, gen: 1, genCond: 55, genOn: false,
    phone: 68, dataMB: STARTING_DATA, lamp: 0, powerbank: 0, pbankCharges: 0, solar: 0, inverter: 0, invCharge: 50,
    fridgeEff: 0, fanRecharge: 0, fanBat: 0,
    fanOn: true, tvOn: true, fridgeOn: true,
    happiness: 70, hunger: 25, fun: 55, noise: 0,
    trust: 50, fund: 0, fundGoal: 12000, owing: [], youPaid: false, streetlightFixed: false,
    hustleCd: {}, pendingCredit: null,
    stats,
    flags: { rentNext: 3 }, evCd: {}, intro: 0, introT: 0, lastFoodDay: 1,
    obj: [], log: [], ach: [],
    npcs: NPCDEF.map((n) => ({ id: n.id, rel: 50, owing: false, paid: false, met: false, greetDay: 0, dashDay: 0, mem: [], favourDay: NEVER, grudgeDay: NEVER, coldUntil: 0 })),
    policies: {}, meetings: [], nextMeetingDay: FIRST_MEETING_DAY,
    job: null, loc: 'street', trip: null, visited: ['street'], unlocked: unlockedBy(1), waypoint: null, orders: [],
    week: emptyWeek(1, 1, 3000, stats), weekHistory: [],
  };
}

let saveHook: (() => void) | null = null;
/** Cloud sync registers here, so core never imports network code. */
export function onSave(fn: () => void): void { saveHook = fn; }

export function save(): void { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch { /* storage blocked */ } saveHook?.(); }
/** Replace the local save with one from elsewhere (the cloud) without touching the live game. */
export function storeSave(s: GameState): void { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage blocked */ } }
export function clearSave(): void { try { localStorage.removeItem(SAVE_KEY); } catch { /* storage blocked */ } }
/** How far a save has played, in absolute game minutes. */
export const gameTime = (s: Pick<GameState, 'day' | 'minute'>): number => s.day * 1440 + s.minute;
export function loadSave(): GameState | null {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? migrate(JSON.parse(s)) : null; } catch { return null; }
}

/** Upgrade older saves in place. v1 stored scheduled times as minute-of-day and settings inside the save. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw JSON of unknown version
export function migrate(s: any): GameState {
  if ((s.ver || 1) < 2) {
    const now = s.day * 1440 + s.minute;
    s.nextFlip = now + 30 + Math.random() * 90; s.flashUntil = 0; s.lastEvent = 0;
    if (s.pendingCredit) s.pendingCredit.at = now + 10;
    s.fundGoal = Math.max(12000, s.fundGoal || 0); s.youPaid = !(s.owing || []).includes('you');
    s.owing = (s.owing || []).filter((x: string) => x !== 'you');
    s.npcs.forEach((n: { paid: boolean; owing: boolean; greetDay: number; dashDay: number }) => {
      n.paid = s.fund > 0 && !n.owing; n.greetDay = 0; n.dashDay = 0;
    });
    s.flags = s.flags || {}; s.flags.rentNext = s.day + 2; s.fanBat = s.fanRecharge ? 100 : 0;
    if (s.solar > 0) s.inverter = 1;
    delete s.settings; s.ver = 2;
  }
  if (s.ver < 3) {
    s.policies = {}; s.meetings = []; s.nextMeetingDay = Math.max(FIRST_MEETING_DAY, s.day + 1);
    s.stats.votesWon = 0; s.ver = 3;
  }
  if (s.ver < 4) {
    s.npcs.forEach((n: Record<string, unknown>) => { n.mem = []; n.favourDay = NEVER; n.grudgeDay = NEVER; n.coldUntil = 0; });
    s.ver = 4;
  }
  if (s.ver < 5) {
    s.stats.challengesDone = 0; s.weekHistory = [];
    s.week = emptyWeek(Math.floor((s.day - 1) / 7) + 1, s.day, s.cash, s.stats);
    s.ver = 5;
  }
  if (s.ver < 6) { s.job = null; s.ver = 6; }
  if (s.ver < 7) {
    // someone saved mid-hustle was already "at work", so they wake up at the workplace
    s.loc = (s.job && HUSTLES.find((h) => h.id === s.job.id)?.place) || 'street';
    s.trip = null; s.visited = [...new Set(['street', s.loc])]; s.unlocked = unlockedBy(s.day);
    s.ver = 7;
  }
  if (s.ver < 8) { s.waypoint = null; s.ver = 8; }
  if (s.ver < 9) { s.dataMB = STARTING_DATA; s.orders = []; s.stats.escrowDeals = 0; s.ver = 9; }
  s.genOn = false; // nobody leaves a gen running while they're away
  return s as GameState;
}
