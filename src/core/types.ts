import type { MemKind, PlaceId } from '../data/content';

export type Weather = 'sunny' | 'hot' | 'rain' | 'storm';
export type StreetType = 'regular' | 'nepo' | 'lapo' | 'midnight' | 'daytime' | 'station';

export interface NpcState {
  id: string;
  rel: number;
  owing: boolean;
  paid: boolean;
  met: boolean;
  greetDay: number;
  dashDay: number;
  /** What they remember about you, newest first. Weights come from MEMORY in content. */
  mem: { kind: MemKind; day: number }[];
  /** Last day they did you a favour / acted on a grudge. */
  favourDay: number;
  grudgeDay: number;
  /** Refuses to help you until this day (set by some grudges). */
  coldUntil: number;
}

export interface Objective { id: string; t: string; done: boolean; rw: number }
export interface LogEntry { who: string; txt: string; t: string }

export interface Stats {
  blackouts: number;
  restores: number;
  spent: number;
  helped: number;
  events: number;
  complaints: number;
  quietBlackouts: number;
  /** Meeting votes that went the way you voted. */
  votesWon: number;
  challengesDone: number;
  /** Online deals finished safely through Verispon escrow. */
  escrowDeals: number;
  /** Consecutive days the meter never hit zero (resets when it does). */
  noMeterFailDays: number;
  noiseThisBlackout: number;
}

export interface Flags {
  rentNext: number;
  transformerDone?: boolean;
  emekaUnits?: number;
  tokDay?: number;
  /** Last day each once-a-day place action was used, keyed by action id. */
  did?: Record<string, number>;
}

export type Waypoint = PlaceId | `npc:${string}`;

/** Something bought from an online seller, on its way. */
export interface Order {
  /** SHOP item id. */
  item: string;
  /** What you paid the seller (or Verispon is holding), and the Verispon fee. */
  price: number; fee: number;
  seller: string;
  via: 'verispon' | 'direct';
  /** Decided at purchase: a scammer never delivers. */
  honest: boolean;
  /** Absolute game minute it's due. */
  until: number;
}

/** A walk or okada ride between places. Times are absolute game minutes. */
export interface Trip {
  from: PlaceId;
  to: PlaceId;
  mode: 'walk' | 'okada';
  at: number;
  until: number;
}

/** Street rules passed at meetings. Absent = never passed. */
export interface Policies {
  genCurfew?: boolean;
  maintained?: boolean;
  security?: boolean;
  solarHub?: boolean;
  /** Day the DisCo answers a pending petition. */
  petitionDay?: number;
  /** Supply is better up to and including this day. */
  betterSupplyUntil?: number;
  shameList?: boolean;
  youChair?: boolean;
}

export type Vote = 'yes' | 'no' | 'abstain';

export interface MeetingRecord {
  day: number;
  motion: string;
  title: string;
  passed: boolean;
  yes: number;
  no: number;
  you: Vote | 'absent';
}

export type ChallengeState = 'active' | 'done' | 'failed';

/** This week's challenges plus the counters they're judged on. */
export interface WeekState {
  n: number;
  startDay: number;
  startCash: number;
  /** Stats at the start of the week, so challenges count only this week. */
  base: { helped: number; blackouts: number; complaints: number; votesWon: number };
  c: { hustle: number; fundPaid: number; genMin: number; peace: number; greeted: string[]; meterZero: boolean; phoneLow: boolean };
  list: { id: string; state: ChallengeState }[];
}

/** A hustle in progress. */
export interface Job {
  id: string;
  /** Game minutes of actual work done. */
  worked: number;
  /** Game minutes stuck waiting (e.g. for light). */
  paused: number;
}

export interface GameState {
  ver: number;
  name: string;
  gender: number;
  skin: number;
  hair: number;
  outfit: number;
  traits: string[];
  bg: string;
  day: number;
  minute: number;
  weather: Weather;
  temp: number;
  gridOn: boolean;
  /** Absolute game minute (see T()) of the next grid flip. */
  nextFlip: number;
  flashUntil: number;
  lastEvent: number;
  meterUnits: number;
  meterNo: string;
  cash: number;
  fuel: number;
  /** 0 = none, 1 = small, 2 = big */
  gen: number;
  genCond: number;
  genOn: boolean;
  phone: number;
  /** Mobile data left, in MB. Phone hustles use it; top up in the NextPawa app. */
  dataMB: number;
  lamp: number;
  powerbank: number;
  pbankCharges: number;
  solar: number;
  inverter: number;
  invCharge: number;
  fridgeEff: number;
  fanRecharge: number;
  fanBat: number;
  fanOn: boolean;
  tvOn: boolean;
  fridgeOn: boolean;
  happiness: number;
  hunger: number;
  fun: number;
  noise: number;
  trust: number;
  fund: number;
  fundGoal: number;
  owing: string[];
  youPaid: boolean;
  streetlightFixed: boolean;
  hustleCd: Record<string, number>;
  pendingCredit: { units: number; at: number } | null;
  stats: Stats;
  flags: Flags;
  evCd: Record<string, number>;
  intro: number;
  introT: number;
  lastFoodDay: number;
  obj: Objective[];
  log: LogEntry[];
  ach: string[];
  npcs: NpcState[];
  policies: Policies;
  meetings: MeetingRecord[];
  nextMeetingDay: number;
  job: Job | null;
  /** Where you are. While `trip` is set you're on the road and `loc` is where you left from. */
  loc: PlaceId;
  trip: Trip | null;
  visited: PlaceId[];
  /** Places shown on the map. */
  unlocked: PlaceId[];
  /** Online orders on their way (Verispon-protected or paid direct). */
  orders: Order[];
  /** Where the map is guiding you: a place, or `npc:<id>` to follow a neighbour. Cleared on arrival. */
  waypoint: Waypoint | null;
  week: WeekState;
  weekHistory: { n: number; done: number; total: number }[];
  /** What kind of street you live on — decides how often NEPA takes light. */
  streetType: StreetType;
  streetName: string;
  resText?: string;
}

export interface Choice {
  t: string;
  sub?: string;
  dis?: boolean;
  fn?: () => void;
}

export interface Settings {
  sound: boolean; motion: boolean;
  /** Street view: 3D when the device can (auto), or forced. Auto drops to 2D if 3D runs too slow. */
  view: 'auto' | '3d' | '2d';
}
