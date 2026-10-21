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
    name: 'NextPawa', tagline: 'Electricity units & data — instant, with receipt',
    url: 'https://nextpawa.com/',
    electricityUrl: 'https://nextpawa.com/electricity',
    dataUrl: 'https://nextpawa.com/data',
    ref: '', color: '#f2a21b',
  },
  verispon: { name: 'Verispon', tagline: 'Escrow: pay safe, release when e land', url: '', ref: '', color: '#2f9e5a' },
  tapmonie: { name: 'Tapmonie', tagline: 'Coming to your street soon', url: '', ref: '', color: '#5a6cf0' },
  pressmonie: { name: 'Pressmonie', tagline: 'Coming to your street soon', url: '', ref: '', color: '#d04a7a' },
};

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
  { id: 'genking', n: 'Generator King', d: 'Gen uses 30% less fuel, but noise +50%.' },
  { id: 'solar', n: 'Solar Dreamer', d: '25% discount on inverter & solar.' },
  { id: 'quiet', n: 'Quiet Neighbour', d: 'Half the noise-complaint penalties.' },
  { id: 'chairman', n: 'Street Chairman Material', d: 'Contributions from you count double.' },
  { id: 'nepafight', n: 'NEPA Fighter', d: 'Blackouts hurt your mood half as much.' },
  { id: 'party', n: 'Party When Light Comes', d: '+12 joy (not 6) whenever light returns.' },
];

export const BGS: Background[] = [
  { id: 'hustler', n: 'Street Hustler', d: 'Modest room, ₦15,000, small gen (rough). 12u.', cash: 15000, units: 12, gen: 1, genCond: 55, fuel: 3 },
  { id: 'faceme', n: 'Face-Me-I-Face-You', d: 'Cheap room, ₦15,000, tight-knit compound. 10u.', cash: 15000, units: 10, gen: 0, genCond: 0, fuel: 0, relBonus: 8 },
  { id: 'business', n: 'Small Business Owner', d: 'Shop owner. ₦15,000, 20u — but stock needs power.', cash: 15000, units: 20, gen: 0, genCond: 0, fuel: 0 },
  { id: 'student', n: 'Student', d: '₦15,000, 8u. Laptop must stay alive for exams.', cash: 15000, units: 8, gen: 0, genCond: 0, fuel: 0 },
  { id: 'estate', n: 'Estate Boy/Girl', d: 'Comfortable crib: ₦15,000, 35u — but bills dey.', cash: 15000, units: 35, gen: 0, genCond: 0, fuel: 0 },
];

/** What kind of street you live on — decides how often NEPA takes light. */
export interface StreetTypeDef {
  id: StreetType;
  n: string;
  d: string;
}
export const STREET_TYPES: StreetTypeDef[] = [
  { id: 'regular', n: 'Regular Street', d: 'Normal NEPA wahala — light come, light go. Nobody dey special.' },
  { id: 'nepo', n: 'Nepo Baby Street', d: 'Money talk. Light almost always dey — this one na Lekki level. NEPA no fit touch here.' },
  { id: 'lapo', n: 'Lapo Baby Street', d: 'Family money for background. Light dey constant, outages short. You stay near the distribution station.' },
  { id: 'midnight', n: 'Midnight Street', d: 'Light only come night time. Day time na darkness — you go need generator for day hustle.' },
  { id: 'daytime', n: 'Daytime Street', d: 'Light come during the day. Night time na generator time — no light for sleep.' },
];

export const NPCDEF: NpcDef[] = [
  { id: 'landlord', name: 'Baba Landlord', role: 'The Landlord', skin: 1, hair: 'lowcut', outfit: 'asooke', x: .13, broke: 0,
    greet: ['Rent go soon due o.', 'This compound no be charity.', 'I built these rooms with my own hands.'],
    off: ['If NEPA no bring light, still pay rent!', 'Darkness no excuse for owing rent.'],
    on: ['At least light dey. For now.'], contrib: ['I collect contribution with receipt. Always.'] },
  { id: 'broke', name: 'Emeka', role: 'Always-Broke Tenant', skin: 3, hair: 'lowcut', outfit: 'casual', x: .27, broke: 1,
    greet: ['Bros, hunger hold me o.', 'I go pay you next week, I swear.', 'Na condition make crayfish bend.'],
    off: ['NEPA no even pity poor man.', 'If I get money, I for buy inverter since.'],
    on: ['Light dey! Quick, charge everything!'], contrib: ['I go pay my share… next month, abeg.'] },
  { id: 'gist', name: 'Aunty Caro', role: 'Compound Gist Expert', skin: 5, hair: 'braids', outfit: 'ankara', x: .40,
    greet: ['You hear wetin happen for Street B?', 'I heard say transformer get spiritual problem.', 'Na my cousin work for the distribution company.'],
    off: ['I tell una! Nepa oga wife travel, so dem take light.', 'This blackout get spiritual backing.'],
    on: ['Up NEPA! I talk am say light go come!'], contrib: ['Who never pay? Make we name names o!'] },
  { id: 'remote', name: 'Tunde', role: 'Remote Worker', skin: 2, hair: 'lowcut', outfit: 'casual', x: .53,
    greet: ['My oga dey watch my green dot.', 'If light go during standup, I go explain tire.'],
    off: ['Abeg! I dey meeting! Anybody get hotspot?!', 'This blackout wan cost me my job.'],
    on: ['Thank God. VPN don reconnect.'], contrib: ['I go pay, but I need receipt o.'] },
  { id: 'barber', name: 'Barber Skippo', role: 'Neighbourhood Barber', skin: 1, hair: 'afro', outfit: 'street', x: .66,
    greet: ['Fresh cut? Sit down, make I arrange you.', 'My clipper dey hungry for light.'],
    off: ['Customers dey run go next street! See wahala.', 'Clipper no gree work without light!'],
    on: ['Light don come — my shop dey open again!'], contrib: ['Sales drop when light go, but I go try contribute.'] },
  { id: 'elder', name: 'Papa Nnanna', role: 'Experienced Elder', skin: 0, hair: 'locs', outfit: 'adire', x: .79,
    greet: ['For our time, we dey use lantern, we still survive.', 'Generator wey you no fit maintain, no buy am.', 'Unity na the fuel of every street.'],
    off: ['Calm down. Darkness never kill anybody before.', 'Rain wey fall, e go still stop.'],
    on: ['Light dey like old friend — e come, e go.'], contrib: ['I go contribute my widow’s mite.'] },
  { id: 'chairman', name: 'Chairman Dele', role: 'Street Chairman', skin: 2, hair: 'lowcut', outfit: 'asooke', x: .90,
    greet: ['Our street must get light, by fire by force.', 'Meeting go hold 6PM sharp. Bring your chair, bring your vote.'],
    off: ['This transformer matter don pass be careful.', 'We need contribute for fuel/ repairs o!'],
    on: ['Good. Let’s plan while light dey.'], contrib: ['Oya! Everybody contribute! Street no build itself.'] },
  { id: 'solar', name: 'Aunty Solar', role: 'Solar Neighbour', skin: 4, hair: 'straight', outfit: 'adire', x: .58, dy: .5,
    greet: ['My solar dey charge since morning. No shaking.', 'Sun no dey send anybody excuse.'],
    off: ['Sorry o. My light still dey — no noise, no fuel.', 'You fit come charge small, no wahala.'],
    on: ['Grid or no grid, my freezer dey cold.'], contrib: ['I go pay my share — solar savings cover am.'] },
  { id: 'student', name: 'Chidera', role: 'Student', skin: 3, hair: 'braids', outfit: 'casual', x: .34, dy: .5,
    greet: ['Exam na next week o. My laptop must survive.', 'Candlelight reading no be my portion!'],
    off: ['My laptop don die! Na so I go fail? God abeg!', 'Who get power bank? I go pay!'],
    on: ['Yes! Light dey! Library mode activated!'], contrib: ['I never see allowance o… small time, abeg.'] },
  { id: 'helpful', name: 'Mama K', role: 'Helpful Neighbour', skin: 5, hair: 'natural', outfit: 'ankara', x: .72, dy: .5,
    greet: ['You don chop? Come, take small soup.', 'Na together together we go survive this street.'],
    off: ['Bring your phone, charge am for my inverter small.', 'No vex, make we share the little we get.'],
    on: ['Light don come! Thank God!'], contrib: ['I don drop my own for the fund already.'] },
];

/** Daily routines. Sunday = every 7th day. */
export const ROUTINES: Record<string, Routine> = {
  landlord: {
    day: [{ from: 6, to: 9, at: 'porch', act: 'Sweeping the compound' }, { from: 9, to: 13, at: 'out', act: 'Collecting rent for his other house' }, { from: 13, to: 22, at: 'porch', act: 'Watching who dey enter compound' }],
    sunday: [{ from: 6, to: 8, at: 'porch', act: 'Dressing for church' }, { from: 8, to: 12, at: 'out', act: 'At church', place: 'church' }, { from: 12, to: 22, at: 'porch', act: 'Resting after church' }] },
  broke: {
    day: [{ from: 6, to: 11, at: 'in', act: 'Sleeping late' }, { from: 11, to: 16, at: 'out', act: 'Looking for work (or so he say)', place: 'junction' }, { from: 16, to: 23, at: 'porch', act: 'Gisting & begging small' }] },
  gist: {
    day: [{ from: 7, to: 10, at: 'out', act: 'At the market — collecting gist', place: 'market' }, { from: 10, to: 21, at: 'porch', act: 'Broadcasting gist' }],
    sunday: [{ from: 8, to: 12, at: 'out', act: 'At church (front row)', place: 'church' }, { from: 12, to: 21, at: 'porch', act: 'Reviewing who wear wetin for church' }] },
  remote: {
    day: [{ from: 8, to: 12, at: 'in', act: 'On work calls' }, { from: 12, to: 13, at: 'porch', act: 'Lunch break' }, { from: 13, to: 18, at: 'in', act: 'On work calls' }, { from: 18, to: 22, at: 'porch', act: 'Logged off, finally' }],
    sunday: [{ from: 10, to: 22, at: 'porch', act: 'Weekend mode' }] },
  barber: {
    day: [{ from: 9, to: 20, at: 'porch', act: 'Cutting hair at the shop' }],
    sunday: [{ from: 14, to: 20, at: 'porch', act: 'Sunday cuts' }] },
  elder: {
    day: [{ from: 6, to: 8, at: 'porch', act: 'Morning walk & radio news' }, { from: 8, to: 12, at: 'in', act: 'Resting' }, { from: 12, to: 21, at: 'porch', act: 'Sitting under the tree, giving advice' }],
    sunday: [{ from: 7, to: 11, at: 'out', act: 'At church', place: 'church' }, { from: 11, to: 21, at: 'porch', act: 'Sunday stories' }] },
  chairman: {
    day: [{ from: 7, to: 17, at: 'out', act: 'At the office' }, { from: 17, to: 22, at: 'porch', act: 'Doing street politics' }],
    sunday: [{ from: 8, to: 12, at: 'out', act: 'At church, greeting everybody', place: 'church' }, { from: 12, to: 22, at: 'porch', act: 'Planning the next meeting' }] },
  solar: {
    day: [{ from: 7, to: 21, at: 'porch', act: 'Watching her solar panels charge' }] },
  student: {
    day: [{ from: 7, to: 14, at: 'out', act: 'At lectures', place: 'campus' }, { from: 14, to: 23, at: 'porch', act: 'Reading for exams' }],
    sunday: [{ from: 9, to: 23, at: 'porch', act: 'Reading — exams no dey rest' }] },
  helpful: {
    day: [{ from: 6, to: 20, at: 'porch', act: 'Cooking at her food stand' }, { from: 20, to: 22, at: 'porch', act: 'Sharing leftover soup' }],
    sunday: [{ from: 7, to: 11, at: 'out', act: 'At church', place: 'church' }, { from: 11, to: 21, at: 'porch', act: 'Cooking Sunday rice' }] },
};

/** The neighbourhood. Your street is home; the rest are errands, hustles and people to find. */
export const PLACES: Place[] = [
  { id: 'street', n: 'Your Street', emoji: '🏠', blurb: 'Home. Your meter, your gen, your wahala.', unlockDay: 1, power: 'home', mx: .3, my: .78 },
  { id: 'junction', n: 'The Junction', emoji: '🛵', blurb: 'Okada rank, POS stands, and people wey dey "look for work".', unlockDay: 1, power: 'grid', mx: .5, my: .5 },
  { id: 'market', n: 'Market', emoji: '🧺', blurb: 'Buka food, tailors, and the shop wey sell everything. Gist free.', open: { from: 7, to: 19 }, unlockDay: 1, power: 'grid', mx: .13, my: .42 },
  { id: 'fuel', n: 'Fuel Station', emoji: '⛽', blurb: 'Fuel for your gen. Queue na free, patience no free.', open: { from: 6, to: 22 }, unlockDay: 1, power: 'gen', mx: .87, my: .44 },
  { id: 'campus', n: 'Campus & Cyber Café', emoji: '🎓', blurb: 'The cyber café get gen and fast-ish wifi. Students everywhere.', open: { from: 7, to: 22 }, unlockDay: 2, power: 'gen', mx: .76, my: .14 },
  { id: 'disco', n: 'DisCo Office', emoji: '🏢', blurb: 'Fictional power company. Customer care go "escalate am".', open: { from: 9, to: 16, days: 'weekdays' }, unlockDay: 2, power: 'gen', mx: .72, my: .8 },
  { id: 'church', n: 'Church', emoji: '⛪', blurb: 'Sunday morning service. Everybody for street dey here, dressed to kill.', open: { from: 7, to: 12, days: 'sunday' }, unlockDay: 6, power: 'grid', mx: .3, my: .13 },
];

/** Walking routes between places, in game minutes. Everything goes through the junction. */
export const PATHS: [PlaceId, PlaceId, number][] = [
  ['street', 'junction', 10], ['junction', 'market', 12], ['junction', 'fuel', 8],
  ['junction', 'campus', 14], ['junction', 'disco', 12], ['junction', 'church', 10],
];

/** What neighbours remember about you. Positive = goodwill, negative = grudge. */
export const MEMORY: Record<MemKind, MemoryDef> = {
  covered: { w: 3, note: 'you covered their fund share', said: ['I never forget the day you cover my fund share. You be correct person.', 'That fund money wey you pay for me — God go pay you back.'] },
  dashed: { w: 2, note: 'you dashed them money', said: ['That ₦500 wey you dash me that day? E save my life. I dey owe you.', 'You get good heart. I no go forget.'] },
  lentUnits: { w: 2, note: 'you lent them units', said: ['Na you lend me units when my meter finish. I dey remember o.'] },
  lentPowerbank: { w: 2, note: 'you lent them your power bank', said: ['Your power bank save my exam! Anything you need, just call me.'] },
  genForCompound: { w: 2, note: 'you ran your gen for the compound', said: ['That night wey you on gen for everybody — respect. Real neighbour.'] },
  gisted: { w: .5, note: 'you sat outside together', said: ['That afternoon gist wey we do for corridor sweet me die.'] },
  paidRent: { w: 1, note: 'you paid dues on time', said: ['You dey pay your dues sharp-sharp. I like tenant like you.'] },
  votedWith: { w: .5, note: 'you voted their way', said: ['You vote the correct side for meeting. We dey together.'] },
  settled: { w: 4, note: 'you made peace with them', said: ['We don settle that matter. Clean slate, my neighbour.'] },
  refused: { w: -1.5, note: 'you refused to help them', said: ['Hmm. Na you refuse me that day. I dey look you.', 'When I need you, you no dey. I don hear.'] },
  nagged: { w: -1, note: 'you pressured them about money', said: ['Abeg no come disturb me about money again today.'] },
  exposed: { w: -3, note: 'you exposed them at a meeting', said: ['You disgrace me for meeting. I no go forget that one.', 'After you expose me for everybody front, you still dey greet me?'] },
  noise: { w: -1, note: 'your gen noise kept them up', said: ['Your generator no let me sleep. Every night: GBRRRR.'] },
  excuse: { w: -1, note: 'you gave excuses about dues', said: ['Na you dey give me NEPA excuse for dues. I hear you.'] },
  votedAgainst: { w: -.5, note: 'you voted against them', said: ['You vote against me for meeting. Politics na politics, but I see you.'] },
  shamed: { w: -2, note: 'their name went on the owing list', said: ['My name dey that gate list. You think say I no know who support am?'] },
};

export const HUSTLES: Hustle[] = [
  { id: 'pos', n: 'POS / Transfer stand', pay: [350, 900], cd: 240, need: null, phone: true, d: 'Collect small change for people. Phone must get battery and data.', mins: 120, verb: '🏧 Running POS', place: 'junction', mb: 40 },
  { id: 'deliver', n: 'Delivery runs', pay: [300, 700], cd: 180, need: null, phone: true, d: 'Bike errands around the junction. Customers call and WhatsApp you.', mins: 90, verb: '🛵 Out on delivery', place: 'junction', mb: 30 },
  { id: 'barb', n: 'Barbing (borrow Skippo’s shop)', pay: [600, 1400], cd: 360, need: 'any', d: 'Needs light — grid or generator.', mins: 120, verb: '💈 Barbing', place: 'street' },
  { id: 'tailor', n: 'Sewing & adjustments', pay: [500, 1100], cd: 300, need: 'any', d: 'Market stall. The machine needs NEPA light — your gen no reach market.', mins: 150, verb: '🧵 Sewing', place: 'market' },
  { id: 'content', n: 'Content creation', pay: [800, 2000], cd: 480, need: 'any', phone: true, d: 'Shoot skits and upload. Light = camera = action, data = upload.', mins: 180, verb: '🎬 Shooting skit', place: 'street', mb: 350 },
  { id: 'remote', n: 'Freelance gig online', pay: [1000, 2500], cd: 600, need: 'any', phone: true, d: 'Cyber café get gen. Laptop + hotspot = dollars, sorry, naira.', mins: 240, verb: '💻 Freelance gig', place: 'campus', mb: 450 },
];

export const SHOP: ShopItem[] = [
  { id: 'lamp', n: 'Rechargeable Lamp', p: 1500, d: 'Never sit in darkness again.' },
  { id: 'powerbank', n: 'Power Bank', p: 3000, d: 'Emergency phone charge, 2 uses per day.' },
  { id: 'fuel3', n: 'Fuel ⛽ 3 litres', p: 1800, d: 'For your generator. Price is fictional!' },
  { id: 'fan', n: 'Rechargeable Fan', p: 5000, d: 'Cool air during blackouts. Charges itself whenever you get power.' },
  { id: 'gen2', n: 'Big Generator 🔌', p: 18000, d: 'Runs ALL appliances incl. fridge & AC loads.' },
  { id: 'inverter', n: 'Inverter System', p: 35000, d: 'Silent backup power. Charges when grid is on.' },
  { id: 'solar', n: 'Solar Panels ☀️', p: 90000, d: 'Daytime power from the sun + battery for night. The dream!' },
  { id: 'fridge', n: 'Efficient Fridge', p: 12000, d: 'Cuts appliance unit drain by 40%.' },
];

export const ACH: Achievement[] = [
  { id: 'good', n: '🤝 Good Neighbour', d: 'Help 5 neighbours.', ck: (G) => G.stats.helped >= 5 },
  { id: 'meter', n: '🔋 Meter Manager', d: '7 days in a row without meter hitting 0.', ck: (G) => G.stats.noMeterFailDays >= 7 },
  { id: 'quiet', n: '🤫 Quiet Operator', d: 'Survive 5 blackouts with <3 noise complaints.', ck: (G) => G.stats.quietBlackouts >= 5 },
  { id: 'chair', n: '🎖️ Chairman Material', d: 'Complete a community fund goal.', ck: (G) => G.streetlightFixed },
  { id: 'solar', n: '☀️ Solar Dreamer', d: 'Install solar power.', ck: (G) => G.solar > 0 },
  { id: 'legend', n: '⭐ Street Legend', d: 'Happiness & trust both above 80.', ck: (G) => G.happiness >= 80 && G.trust >= 80 },
  { id: 'democracy', n: '🏛️ Democracy Dey', d: 'Be on the winning side of 3 street votes.', ck: (G) => G.stats.votesWon >= 3 },
  { id: 'champion', n: '🏆 Weekly Champion', d: 'Complete all 3 challenges in one week.', ck: (G) => G.weekHistory.some((w) => w.total > 0 && w.done === w.total) },
  { id: 'elected', n: '🗳️ People’s Choice', d: 'Get elected street chairman.', ck: (G) => !!G.policies.youChair },
  { id: 'escrow', n: '🛡️ No Scam Zone', d: 'Finish 3 online deals safely with Verispon.', ck: (G) => G.stats.escrowDeals >= 3 },
];

export const NEWS = [
  'BREAKING: Transformer for Street B dey on strike. Union no comment.',
  'Weather: Sun dey show off today. Heat go test everybody.',
  'Jollof Index: Price of tomatoes rise again. Pockets dey bleed.',
  'NEPA officials promise "improved supply". Street residents laugh small.',
  'Traffic report: Go-slow hold Third Mainland since morning. Shine your eye.',
  'Tech gist: New inverter enter market — "silence wey dey powerful".',
  'Street survey: Residents wey buy units for NextPawa say "token land before I drop phone". Roadside vendor no comment.',
  'Scam alert: "Half-price inverter" sellers dey everywhere online. Smart people dey pay with Verispon escrow.',
];
