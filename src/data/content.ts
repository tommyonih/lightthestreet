/* All game content is data-driven: add hairstyles, outfits, neighbours, hustles or shop items here. */
import type { GameState, StreetType } from '../core/types';

export interface Outfit { id: string; n: string; c1: string; c2: string; pat: 'tri' | 'dots' | 'stripes' | 'plain' }
export interface Trait { id: string; n: string; d: string }
export interface Background {
  id: string; n: string; d: string;
  cash: number; units: number; gen: number; genCond: number; fuel: number;
  relBonus?: number;
}
export interface NpcDef {
  id: string; name: string; role: string;
  skin: number; hair: string; outfit: string;
  /** Horizontal position as a fraction of the street width. */
  x: number;
  /** Set for the back row of neighbours. */
  dy?: number;
  broke?: number;
  greet: string[]; off: string[]; on: string[]; contrib: string[];
}
/** Where a neighbour is: on their porch, out of the street, or indoors. */
export type Spot = 'porch' | 'out' | 'in';
/** One block of a daily routine, in whole hours [from, to). Hours not covered are spent indoors.
    `place` says where an `out` slot happens, so you can go and find them; absent = somewhere off the map. */
export interface Slot { from: number; to: number; at: Spot; act: string; place?: PlaceId }
export interface Routine { day: Slot[]; sunday?: Slot[] }

export type MemKind =
  | 'covered' | 'dashed' | 'lentUnits' | 'lentPowerbank' | 'genForCompound' | 'gisted' | 'paidRent' | 'votedWith' | 'settled'
  | 'refused' | 'nagged' | 'exposed' | 'noise' | 'excuse' | 'votedAgainst' | 'shamed';
export interface MemoryDef {
  /** How much one such memory moves their opinion of you. */
  w: number;
  /** Shown on the phone: what they remember. */
  note: string;
  /** What they might say about it. */
  said: string[];
}
export interface Hustle {
  id: string; n: string; pay: [number, number];
  /** Cooldown in game minutes. */
  cd: number;
  need: 'any' | null;
  phone?: boolean;
  d: string;
  /** How long the job takes, in game minutes of actual work. */
  mins: number;
  /** Shown over your head while you work. */
  verb: string;
  /** Where the work happens; starting the hustle walks you there. */
  place: PlaceId;
  /** Mobile data the job uses (MB), for hustles that run on your phone. */
  mb?: number;
}

/* ---------- Netsible products in the game ----------
   NextPawa (units + data) and Verispon (escrow) are part of play: you meet the problem in the game and the product
   solves it — with game money, like everything else. `url`/`ref` are the REAL sites, shown only as clearly separate,
   optional links; leave `url` empty and no link appears. Tapmonie and Pressmonie are ad slots until their stories land. */
export interface Partner {
  name: string; tagline: string;
  /** Real-world site. Empty = no link shown anywhere. */
  url: string;
  /** Live NextPawa purchase pages. Empty destinations are intentionally not linked. */
  electricityUrl?: string;
  dataUrl?: string;
  /** Referral code appended to real links as ?ref= (empty = none). */
  ref: string;
  color: string;
}
export type PartnerId = 'nextpawa' | 'verispon' | 'tapmonie' | 'pressmonie';
export const PARTNERS: Record<PartnerId, Partner> = {
  nextpawa: {
    name: 'NextPawa', tagline: 'Electricity, data and airtime. Instant, with a receipt.',
    url: 'https://nextpawa.com/',
    electricityUrl: 'https://nextpawa.com/electricity',
    dataUrl: 'https://nextpawa.com/data',
    ref: '', color: '#ac4fde',
  },
  verispon: { name: 'Verispon', tagline: 'Escrow for online deals. Pay safely, release when it arrives.', url: '', ref: '', color: '#2f9e5a' },
  tapmonie: { name: 'Tapmonie', tagline: 'Tap to pay. Coming soon.', url: '', ref: '', color: '#5a6cf0' },
  pressmonie: { name: 'Pressmonie', tagline: 'Send money with one press. Coming soon.', url: '', ref: '', color: '#d04a7a' },
};

/** Billboard and banner copy for each product. Short: it has to read from across a street. */
export interface Ad { headline: string; sub: string; cta: string; emoji: string; bg: [string, string]; ink: string }
export const ADS: Record<PartnerId, Ad[]> = {
  nextpawa: [
    { headline: 'Light in seconds', sub: 'Buy electricity units anytime', cta: 'nextpawa.com', emoji: '⚡', bg: ['#ac4fde', '#360673'], ink: '#ffffff' },
    { headline: 'Data that lands', sub: 'All networks. Instant top-up.', cta: 'nextpawa.com/data', emoji: '📶', bg: ['#16092b', '#ac4fde'], ink: '#ffffff' },
    { headline: 'Never run out', sub: 'Token on your phone, receipt in your mail', cta: 'Get NextPawa', emoji: '💡', bg: ['#fbbf24', '#ac4fde'], ink: '#16092b' },
  ],
  verispon: [
    { headline: 'Buying online?', sub: 'Pay with escrow. Get it or get refunded.', cta: 'Pay safe with Verispon', emoji: '🛡️', bg: ['#2f9e5a', '#0f4d2a'], ink: '#ffffff' },
    { headline: 'No more scams', sub: 'Your money waits until the item arrives', cta: 'Verispon escrow', emoji: '📦', bg: ['#eafbe7', '#2f9e5a'], ink: '#0f3d22' },
  ],
  tapmonie: [{ headline: 'Tap. Paid.', sub: 'Contactless payments for every shop', cta: 'Tapmonie · coming soon', emoji: '📲', bg: ['#5a6cf0', '#1d2470'], ink: '#ffffff' }],
  pressmonie: [{ headline: 'Press to send', sub: 'Money to anyone, in one press', cta: 'Pressmonie · coming soon', emoji: '💸', bg: ['#d04a7a', '#5a1532'], ink: '#ffffff' }],
};

/* ---------- Net Babies and Local Babies: where a new life is born is a random roll ---------- */
export type Birth = 'net' | 'local';
export interface BirthDef {
  id: Birth; n: string; emoji: string;
  /** One line on the reveal card. */
  d: string;
  /** Chance of being born here; the two add up to 1. */
  odds: number;
  /** Ranges are [min, max], picked at random. */
  cash: [number, number]; units: [number, number];
  /** Chance of starting in debt, and how much. */
  debtChance: number; debt: [number, number];
  gen: number; genCond: number; fuel: number; inverter: number;
  /** Connections: how much the neighbours like you from day one, and street trust. */
  relBonus: number; trust: number;
  /** Backgrounds and streets this birth can land on. */
  bgs: string[]; streets: StreetType[];
}
export const BIRTHS: Record<Birth, BirthDef> = {
  net: {
    id: 'net', n: 'Net Baby', emoji: '👶', odds: .25,
    d: 'You were born into money. Big savings, a quiet generator, and neighbours who already know your family.',
    cash: [120000, 200000], units: [50, 70], debtChance: 0, debt: [0, 0],
    gen: 2, genCond: 95, fuel: 10, inverter: 1, relBonus: 15, trust: 65,
    bgs: ['estate', 'business'], streets: ['nepo', 'lapo'],
  },
  local: {
    id: 'local', n: 'Local Baby', emoji: '🏚️', odds: .75,
    d: 'You start at the bottom. Little cash, few units, and maybe a debt to clear. Every naira is earned.',
    cash: [500, 4000], units: [3, 8], debtChance: .6, debt: [5000, 20000],
    gen: 0, genCond: 0, fuel: 0, inverter: 0, relBonus: 0, trust: 45,
    bgs: ['faceme', 'hustler', 'student'], streets: ['regular', 'midnight', 'daytime'],
  },
};
/** Interest added to a debt every morning. */
export const DEBT_RATE = .02;

/** Mobile data bundles in the NextPawa app (game money). */
export const DATA_BUNDLES: { mb: number; p: number; n: string }[] = [
  { mb: 500, p: 300, n: '500MB' }, { mb: 1500, p: 700, n: '1.5GB' }, { mb: 4000, p: 1500, n: '4GB' },
];

/** Online sellers in the Shop's deals: some are legit, some are not. Honesty is decided per deal. */
export const SELLERS = ['@BigDealsNG', '@GenPlug_Lagos', '@SolarKing_Ikeja', '@ChargeAm_Fast', '@MamaGadget', '@NoShakingStores'];

export type PlaceId = 'street' | 'junction' | 'market' | 'fuel' | 'disco' | 'campus' | 'church';
export interface Place {
  id: PlaceId; n: string; emoji: string; blurb: string;
  /** Opening hours [from, to) in whole hours, optionally only on some days. Absent = always open. */
  open?: { from: number; to: number; days?: 'weekdays' | 'sunday' };
  /** Game day it appears on the map. */
  unlockDay: number;
  /** What powers work done here: your own supply, the area grid, or the place's own generator. */
  power: 'home' | 'grid' | 'gen';
  /** Position on the map, as fractions of its width and height. */
  mx: number; my: number;
}
export interface ShopItem { id: string; n: string; p: number; d: string }
export interface Achievement { id: string; n: string; d: string; ck: (G: GameState) => boolean }

export const SKINS = ['#5a3a22', '#6b4423', '#7a4a2b', '#8d5524', '#a06a35', '#c68642'];

export const HAIRS = [
  { id: 'lowcut', n: 'Low Cut' }, { id: 'afro', n: 'Afro' }, { id: 'braids', n: 'Braids' },
  { id: 'locs', n: 'Locs' }, { id: 'natural', n: 'Natural' }, { id: 'straight', n: 'Straight' },
];

export const OUTFITS: Outfit[] = [
  { id: 'ankara', n: 'Ankara', c1: '#e63946', c2: '#ffb347', pat: 'tri' },
  { id: 'adire', n: 'Adire', c1: '#1d3557', c2: '#a8dadc', pat: 'dots' },
  { id: 'asooke', n: 'Aso-Oke', c1: '#9b2226', c2: '#e9d8a6', pat: 'stripes' },
  { id: 'casual', n: 'Casual Wear', c1: '#457b9d', c2: '#f1faee', pat: 'plain' },
  { id: 'owambe', n: 'Owambe Party', c1: '#ffb703', c2: '#8ecae6', pat: 'stripes' },
  { id: 'street', n: 'Street Hustle', c1: '#2b2d42', c2: '#8d99ae', pat: 'plain' },
];

export const TRAITS: Trait[] = [
  { id: 'genking', n: 'Generator King', d: 'Your generator uses 30% less fuel, but it is 50% louder.' },
  { id: 'solar', n: 'Solar Dreamer', d: '25% off inverters and solar.' },
  { id: 'quiet', n: 'Quiet Neighbour', d: 'Half the noise-complaint penalties.' },
  { id: 'chairman', n: 'Street Chairman Material', d: 'Contributions from you count double.' },
  { id: 'nepafight', n: 'NEPA Fighter', d: 'Blackouts hurt your mood half as much.' },
  { id: 'party', n: 'Party When Power Returns', d: '+12 joy (not 6) whenever power comes back.' },
];

export const BGS: Background[] = [
  { id: 'hustler', n: 'Street Hustler', d: 'A small room, ₦15,000, an old small generator and 12 units.', cash: 15000, units: 12, gen: 1, genCond: 55, fuel: 3 },
  { id: 'faceme', n: 'Face-Me-I-Face-You', d: 'A cheap room in a close-knit compound. ₦15,000 and 10 units.', cash: 15000, units: 10, gen: 0, genCond: 0, fuel: 0, relBonus: 8 },
  { id: 'business', n: 'Small Business Owner', d: 'You run a shop. ₦15,000 and 20 units, but your stock needs power.', cash: 15000, units: 20, gen: 0, genCond: 0, fuel: 0 },
  { id: 'student', n: 'Student', d: '₦15,000 and 8 units. Your laptop must stay alive for exams.', cash: 15000, units: 8, gen: 0, genCond: 0, fuel: 0 },
  { id: 'estate', n: 'Estate Kid', d: 'A comfortable flat: ₦15,000 and 35 units, but estate bills come every week.', cash: 15000, units: 35, gen: 0, genCond: 0, fuel: 0 },
];

/** What kind of street you live on — decides how often NEPA takes light. */
export interface StreetTypeDef {
  id: StreetType;
  n: string;
  d: string;
}
export const STREET_TYPES: StreetTypeDef[] = [
  { id: 'regular', n: 'Regular Street', d: 'Normal supply. Power comes and goes.' },
  { id: 'nepo', n: 'Nepo Baby Street', d: 'Money talks here. Power is almost always on.' },
  { id: 'lapo', n: 'Lapo Baby Street', d: 'Close to the substation. Steady power, short outages.' },
  { id: 'midnight', n: 'Midnight Street', d: 'Power only comes at night. Days need a generator.' },
  { id: 'daytime', n: 'Daytime Street', d: 'Power comes in the day. Nights are generator time.' },
];

export const NPCDEF: NpcDef[] = [
  { id: 'landlord', name: 'Baba Landlord', role: 'The landlord', skin: 1, hair: 'lowcut', outfit: 'asooke', x: .13, broke: 0,
    greet: ['Rent is due soon.', 'This compound is not a charity.', 'I built these rooms with my own hands.'],
    off: ['No power is no excuse. Rent is still rent.', 'Darkness doesn\'t cancel what you owe.'],
    on: ['At least the power is on. For now.'], contrib: ['I collect contributions with a receipt. Always.'] },
  { id: 'broke', name: 'Emeka', role: 'Always-broke tenant', skin: 3, hair: 'lowcut', outfit: 'casual', x: .27, broke: 1,
    greet: ['I\'m so hungry today.', 'I\'ll pay you back next week, I promise.', 'Times are hard, my friend.'],
    off: ['Power cuts never pity the poor man.', 'If I had money, I\'d have bought an inverter long ago.'],
    on: ['Power is back! Quick, charge everything!'], contrib: ['I\'ll pay my share… next month, please.'] },
  { id: 'gist', name: 'Aunty Caro', role: 'Knows everyone\'s business', skin: 5, hair: 'braids', outfit: 'ankara', x: .40,
    greet: ['Did you hear what happened on Street B?', 'They say the transformer has a curse on it.', 'My cousin works at the power company, you know.'],
    off: ['I told you! The boss at the power office travelled, so they cut us off.', 'This blackout is not normal, I\'m telling you.'],
    on: ['I said it would come back!'], contrib: ['Who hasn\'t paid? Let\'s name names!'] },
  { id: 'remote', name: 'Tunde', role: 'Remote worker', skin: 2, hair: 'lowcut', outfit: 'casual', x: .53,
    greet: ['My boss is watching my green dot.', 'If power goes during standup, I\'ll be explaining for days.'],
    off: ['Not now! I\'m in a meeting! Anyone have a hotspot?', 'This blackout is going to cost me my job.'],
    on: ['Thank God. VPN is back.'], contrib: ['I\'ll pay, but I need a receipt.'] },
  { id: 'barber', name: 'Barber Skippo', role: 'Neighbourhood barber', skin: 1, hair: 'afro', outfit: 'street', x: .66,
    greet: ['Fresh cut? Sit down, I\'ll sort you out.', 'My clippers are hungry for power.'],
    off: ['Customers are running to the next street!', 'My clippers won\'t work without power!'],
    on: ['Power\'s back. The shop is open again!'], contrib: ['Sales drop when power goes, but I\'ll try.'] },
  { id: 'elder', name: 'Papa Nnanna', role: 'The wise elder', skin: 0, hair: 'locs', outfit: 'adire', x: .79,
    greet: ['In our time we used lanterns, and we survived.', 'Don\'t buy a generator you can\'t maintain.', 'Unity is the fuel of every street.'],
    off: ['Calm down. Darkness never killed anybody.', 'Every rain stops eventually.'],
    on: ['Power is like an old friend. It comes, it goes.'], contrib: ['I\'ll give what I can.'] },
  { id: 'chairman', name: 'Chairman Dele', role: 'Street chairman', skin: 2, hair: 'lowcut', outfit: 'asooke', x: .90,
    greet: ['This street will get light, one way or another.', 'Meeting is at 6PM sharp. Bring your chair and your vote.'],
    off: ['This transformer problem has gone too far.', 'We need contributions for fuel and repairs!'],
    on: ['Good. Let\'s plan while the power is on.'], contrib: ['Everyone, contribute! The street won\'t build itself.'] },
  { id: 'solar', name: 'Aunty Solar', role: 'Solar neighbour', skin: 4, hair: 'straight', outfit: 'adire', x: .58, dy: .5,
    greet: ['My panels have been charging since morning.', 'The sun never makes excuses.'],
    off: ['Sorry. My lights are still on: no noise, no fuel.', 'You can come and charge your phone if you like.'],
    on: ['Grid or no grid, my freezer stays cold.'], contrib: ['I\'ll pay my share. Solar savings cover it.'] },
  { id: 'student', name: 'Chidera', role: 'Student', skin: 3, hair: 'braids', outfit: 'casual', x: .34, dy: .5,
    greet: ['Exams are next week. My laptop must survive.', 'I refuse to read by candlelight.'],
    off: ['My laptop just died! How will I pass?', 'Who has a power bank? I\'ll pay!'],
    on: ['Yes! Power! Study mode on!'], contrib: ['My allowance hasn\'t come yet… soon, I promise.'] },
  { id: 'helpful', name: 'Mama K', role: 'Helpful neighbour', skin: 5, hair: 'natural', outfit: 'ankara', x: .72, dy: .5,
    greet: ['Have you eaten? Come and take some soup.', 'We survive this street together.'],
    off: ['Bring your phone, charge it on my inverter.', 'Don\'t worry, we\'ll share what we have.'],
    on: ['Power is back! Thank God!'], contrib: ['I\'ve already paid my share into the fund.'] },
];

/** Daily routines. Sunday = every 7th day. */
export const ROUTINES: Record<string, Routine> = {
  landlord: {
    day: [{ from: 6, to: 9, at: 'porch', act: 'Sweeping the compound' }, { from: 9, to: 13, at: 'out', act: 'Collecting rent at his other house' }, { from: 13, to: 22, at: 'porch', act: 'Watching who comes in and out' }],
    sunday: [{ from: 6, to: 8, at: 'porch', act: 'Dressing for church' }, { from: 8, to: 12, at: 'out', act: 'At church', place: 'church' }, { from: 12, to: 22, at: 'porch', act: 'Resting after church' }] },
  broke: {
    day: [{ from: 6, to: 11, at: 'in', act: 'Sleeping in' }, { from: 11, to: 16, at: 'out', act: 'Looking for work (he says)', place: 'junction' }, { from: 16, to: 23, at: 'porch', act: 'Chatting and borrowing' }] },
  gist: {
    day: [{ from: 7, to: 10, at: 'out', act: 'At the market, collecting gossip', place: 'market' }, { from: 10, to: 21, at: 'porch', act: 'Sharing the gossip' }],
    sunday: [{ from: 8, to: 12, at: 'out', act: 'At church (front row)', place: 'church' }, { from: 12, to: 21, at: 'porch', act: 'Reviewing everyone\'s church outfits' }] },
  remote: {
    day: [{ from: 8, to: 12, at: 'in', act: 'On work calls' }, { from: 12, to: 13, at: 'porch', act: 'Lunch break' }, { from: 13, to: 18, at: 'in', act: 'On work calls' }, { from: 18, to: 22, at: 'porch', act: 'Logged off, finally' }],
    sunday: [{ from: 10, to: 22, at: 'porch', act: 'Weekend mode' }] },
  barber: {
    day: [{ from: 9, to: 20, at: 'porch', act: 'Cutting hair at the shop' }],
    sunday: [{ from: 14, to: 20, at: 'porch', act: 'Sunday cuts' }] },
  elder: {
    day: [{ from: 6, to: 8, at: 'porch', act: 'Morning walk and radio news' }, { from: 8, to: 12, at: 'in', act: 'Resting' }, { from: 12, to: 21, at: 'porch', act: 'Under the tree, giving advice' }],
    sunday: [{ from: 7, to: 11, at: 'out', act: 'At church', place: 'church' }, { from: 11, to: 21, at: 'porch', act: 'Sunday stories' }] },
  chairman: {
    day: [{ from: 7, to: 17, at: 'out', act: 'At the office' }, { from: 17, to: 22, at: 'porch', act: 'Doing street politics' }],
    sunday: [{ from: 8, to: 12, at: 'out', act: 'At church, greeting everybody', place: 'church' }, { from: 12, to: 22, at: 'porch', act: 'Planning the next meeting' }] },
  solar: {
    day: [{ from: 7, to: 21, at: 'porch', act: 'Watching her solar panels charge' }] },
  student: {
    day: [{ from: 7, to: 14, at: 'out', act: 'At lectures', place: 'campus' }, { from: 14, to: 23, at: 'porch', act: 'Reading for exams' }],
    sunday: [{ from: 9, to: 23, at: 'porch', act: 'Reading. Exams don\'t rest.' }] },
  helpful: {
    day: [{ from: 6, to: 20, at: 'porch', act: 'Cooking at her food stand' }, { from: 20, to: 22, at: 'porch', act: 'Sharing leftover soup' }],
    sunday: [{ from: 7, to: 11, at: 'out', act: 'At church', place: 'church' }, { from: 11, to: 21, at: 'porch', act: 'Cooking Sunday rice' }] },
};

/** The neighbourhood. Your street is home; the rest are errands, hustles and people to find. */
export const PLACES: Place[] = [
  { id: 'street', n: 'Your Street', emoji: '🏠', blurb: 'Home. Your meter, your generator, your neighbours.', unlockDay: 1, power: 'home', mx: .3, my: .78 },
  { id: 'junction', n: 'The Junction', emoji: '🛵', blurb: 'Okada park, POS stands, and people "looking for work".', unlockDay: 1, power: 'grid', mx: .5, my: .5 },
  { id: 'market', n: 'Market', emoji: '🧺', blurb: 'Food stalls, tailors, and a shop that sells everything. Gossip is free.', open: { from: 7, to: 19 }, unlockDay: 1, power: 'grid', mx: .13, my: .42 },
  { id: 'fuel', n: 'Fuel Station', emoji: '⛽', blurb: 'Fuel for your generator. The queue is free; patience is not.', open: { from: 6, to: 22 }, unlockDay: 1, power: 'gen', mx: .87, my: .44 },
  { id: 'campus', n: 'Campus & Cyber Café', emoji: '🎓', blurb: 'The café has a generator and fairly fast wifi. Students everywhere.', open: { from: 7, to: 22 }, unlockDay: 2, power: 'gen', mx: .76, my: .14 },
  { id: 'disco', n: 'Power Company Office', emoji: '🏢', blurb: 'A made-up power company. Customer care will "escalate it".', open: { from: 9, to: 16, days: 'weekdays' }, unlockDay: 2, power: 'gen', mx: .72, my: .8 },
  { id: 'church', n: 'Church', emoji: '⛪', blurb: 'Sunday morning service. The whole street is here, dressed to impress.', open: { from: 7, to: 12, days: 'sunday' }, unlockDay: 6, power: 'grid', mx: .3, my: .13 },
];

/** Walking routes between places, in game minutes. Everything goes through the junction. */
export const PATHS: [PlaceId, PlaceId, number][] = [
  ['street', 'junction', 10], ['junction', 'market', 12], ['junction', 'fuel', 8],
  ['junction', 'campus', 14], ['junction', 'disco', 12], ['junction', 'church', 10],
];

/** What neighbours remember about you. Positive = goodwill, negative = grudge. */
export const MEMORY: Record<MemKind, MemoryDef> = {
  covered: { w: 3, note: 'you covered their fund share', said: ['I won\'t forget the day you paid my share of the fund.', 'That fund money you paid for me? God will pay you back.'] },
  dashed: { w: 2, note: 'you gave them money', said: ['That ₦500 you gave me saved my life. I owe you.', 'You have a good heart. I won\'t forget.'] },
  lentUnits: { w: 2, note: 'you lent them units', said: ['You lent me units when my meter ran out. I remember.'] },
  lentPowerbank: { w: 2, note: 'you lent them your power bank', said: ['Your power bank saved my exam! Call me if you ever need anything.'] },
  genForCompound: { w: 2, note: 'you ran your generator for the compound', said: ['That night you ran your generator for everyone? Respect.'] },
  gisted: { w: .5, note: 'you sat outside together', said: ['That afternoon chat we had was lovely.'] },
  paidRent: { w: 1, note: 'you paid dues on time', said: ['You always pay your dues on time. I like that.'] },
  votedWith: { w: .5, note: 'you voted their way', said: ['You voted the right way at the meeting. We\'re together.'] },
  settled: { w: 4, note: 'you made peace with them', said: ['We\'ve settled that matter. Clean slate.'] },
  refused: { w: -1.5, note: 'you refused to help them', said: ['You refused me that day. I\'m watching you.', 'When I needed you, you weren\'t there.'] },
  nagged: { w: -1, note: 'you pressured them about money', said: ['Please don\'t talk to me about money again today.'] },
  exposed: { w: -3, note: 'you exposed them at a meeting', said: ['You embarrassed me at the meeting. I won\'t forget that.', 'You shamed me in front of everyone, and now you greet me?'] },
  noise: { w: -1, note: 'your generator noise kept them up', said: ['Your generator kept me up all night.'] },
  excuse: { w: -1, note: 'you gave excuses about dues', said: ['You keep blaming the power cuts for not paying dues. I hear you.'] },
  votedAgainst: { w: -.5, note: 'you voted against them', said: ['You voted against me. Politics is politics, but I saw it.'] },
  shamed: { w: -2, note: 'their name went on the owing list', said: ['My name is on that list at the gate. You think I don\'t know who supported it?'] },
};

export const HUSTLES: Hustle[] = [
  { id: 'pos', n: 'POS / transfer stand', pay: [350, 900], cd: 240, need: null, phone: true, d: 'Help people send money for a fee. Needs phone battery and data.', mins: 120, verb: '🏧 Running a POS stand', place: 'junction', mb: 40 },
  { id: 'deliver', n: 'Delivery runs', pay: [300, 700], cd: 180, need: null, phone: true, d: 'Bike errands around the junction. Customers call and message you.', mins: 90, verb: '🛵 Out on delivery', place: 'junction', mb: 30 },
  { id: 'barb', n: 'Barbing (in Skippo\'s shop)', pay: [600, 1400], cd: 360, need: 'any', d: 'Needs power: grid or generator.', mins: 120, verb: '💈 Cutting hair', place: 'street' },
  { id: 'tailor', n: 'Sewing and alterations', pay: [500, 1100], cd: 300, need: 'any', d: 'A market stall. The machine needs grid power; your generator can\'t reach the market.', mins: 150, verb: '🧵 Sewing', place: 'market' },
  { id: 'content', n: 'Content creation', pay: [800, 2000], cd: 480, need: 'any', phone: true, d: 'Film skits and upload them. Needs power for the camera and data to upload.', mins: 180, verb: '🎬 Filming a skit', place: 'street', mb: 350 },
  { id: 'remote', n: 'Freelance gig online', pay: [1000, 2500], cd: 600, need: 'any', phone: true, d: 'The cyber café has a generator. Laptop plus hotspot equals money.', mins: 240, verb: '💻 Freelance gig', place: 'campus', mb: 450 },
];

export const SHOP: ShopItem[] = [
  { id: 'lamp', n: 'Rechargeable Lamp', p: 1500, d: 'Never sit in darkness again.' },
  { id: 'powerbank', n: 'Power Bank', p: 3000, d: 'Emergency phone charge, 2 uses a day.' },
  { id: 'fuel3', n: 'Fuel ⛽ 3 litres', p: 1800, d: 'For your generator. Made-up price.' },
  { id: 'fan', n: 'Rechargeable Fan', p: 5000, d: 'Cool air during blackouts. Charges whenever you have power.' },
  { id: 'gen2', n: 'Big Generator 🔌', p: 18000, d: 'Runs everything, fridge included.' },
  { id: 'inverter', n: 'Inverter System', p: 35000, d: 'Silent backup power. Charges when the grid is on.' },
  { id: 'solar', n: 'Solar Panels ☀️', p: 90000, d: 'Daytime power from the sun, plus a battery for night. The dream.' },
  { id: 'fridge', n: 'Efficient Fridge', p: 12000, d: 'Cuts your appliance drain by 40%.' },
];

export const ACH: Achievement[] = [
  { id: 'good', n: '🤝 Good Neighbour', d: 'Help 5 neighbours.', ck: (G) => G.stats.helped >= 5 },
  { id: 'meter', n: '🔋 Meter Manager', d: '7 days in a row without your meter hitting 0.', ck: (G) => G.stats.noMeterFailDays >= 7 },
  { id: 'quiet', n: '🤫 Quiet Operator', d: 'Get through 5 blackouts with fewer than 3 noise complaints.', ck: (G) => G.stats.quietBlackouts >= 5 },
  { id: 'chair', n: '🎖️ Chairman Material', d: 'Complete a community fund goal.', ck: (G) => G.streetlightFixed },
  { id: 'solar', n: '☀️ Solar Dreamer', d: 'Install solar power.', ck: (G) => G.solar > 0 },
  { id: 'legend', n: '⭐ Street Legend', d: 'Happiness and trust both above 80.', ck: (G) => G.happiness >= 80 && G.trust >= 80 },
  { id: 'democracy', n: '🏛️ Democracy', d: 'Be on the winning side of 3 street votes.', ck: (G) => G.stats.votesWon >= 3 },
  { id: 'champion', n: '🏆 Weekly Champion', d: 'Complete all 3 challenges in one week.', ck: (G) => G.weekHistory.some((w) => w.total > 0 && w.done === w.total) },
  { id: 'elected', n: '🗳️ People\'s Choice', d: 'Get elected street chairman.', ck: (G) => !!G.policies.youChair },
  { id: 'escrow', n: '🛡️ No Scam Zone', d: 'Finish 3 online deals safely with Verispon.', ck: (G) => G.stats.escrowDeals >= 3 },
  { id: 'debtfree', n: '💳 Debt Free', d: 'Pay off the debt you were born with.', ck: (G) => !!G.flags.debtCleared },
];

export const NEWS = [
  'Breaking: Street B\'s transformer has stopped working. No comment from the power company.',
  'Weather: a very hot day ahead. Stay hydrated.',
  'Food prices: tomatoes went up again this week.',
  'The power company promises "improved supply". Residents are not convinced.',
  'Traffic: heavy go-slow on Third Mainland Bridge since morning.',
  'Tech: a new silent inverter is in the market.',
  'Survey: people who buy units on NextPawa say the token arrives before they put their phone down.',
  'Scam alert: "half-price inverter" sellers are everywhere online. Smart buyers pay with Verispon escrow.',
];
