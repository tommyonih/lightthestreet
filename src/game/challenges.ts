/* Weekly challenges: three per 7-day week, drawn per save so a week's challenges never reshuffle.
   Add one by appending to CHALLENGES. */
import { G, emptyWeek, save } from '../core/state';
import { fmt, seededRng } from '../core/util';
import { sfx } from '../core/audio';
import type { WeekState } from '../core/types';
import { openModal } from '../ui/modal';
import { toast } from '../ui/toast';
import { updHUD } from '../ui/hud';
import { addCash } from './economy';
import { trust } from './helpers';
import { checkAch } from './progress';

export const WEEK_DAYS = 7;
export const PER_WEEK = 3;
export const ALL_DONE_BONUS = 3000;

export interface Challenge {
  id: string;
  title: string;
  desc: string;
  /** 'count': done the moment value reaches target. 'end': judged when the week ends. */
  kind: 'count' | 'end';
  target: number;
  value: (w: WeekState) => number;
  /** Once true, the challenge fails for the week. */
  broken?: (w: WeekState) => boolean;
  eligible?: () => boolean;
  reward: number;
  /** How to show progress, e.g. ₦ amounts. */
  unit?: '₦';
}

export const CHALLENGES: Challenge[] = [
  { id: 'hustle', title: '💼 Hustle Week', desc: 'Make ₦12,000 from hustles this week.', kind: 'count', target: 12000, unit: '₦',
    value: (w) => w.c.hustle, reward: 1500 },
  { id: 'helper', title: '🤝 Good Neighbour Week', desc: 'Help 3 neighbours.', kind: 'count', target: 3,
    value: (w) => G.stats.helped - w.base.helped, reward: 1500 },
  { id: 'quiet', title: '🤫 Quiet Street', desc: 'Survive 3 blackouts with zero gen complaints.', kind: 'count', target: 3,
    value: (w) => G.stats.blackouts - w.base.blackouts, broken: (w) => G.stats.complaints > w.base.complaints, reward: 1500 },
  { id: 'voice', title: '🗳️ Voice of the Street', desc: 'Be on the winning side of a meeting vote.', kind: 'count', target: 1,
    value: (w) => G.stats.votesWon - w.base.votesWon, reward: 1200 },
  { id: 'social', title: '👋 Social Butterfly', desc: 'Greet 6 different neighbours.', kind: 'count', target: 6,
    value: (w) => w.c.greeted.length, reward: 1000 },
  { id: 'collector', title: '🏘️ Fund Pusher', desc: 'Get 2 owing houses to pay their fund share.', kind: 'count', target: 2,
    value: (w) => w.c.fundPaid, eligible: () => !G.streetlightFixed && G.owing.length >= 2, reward: 1500 },
  { id: 'peace', title: '🕊️ Make Peace or Make Friends', desc: 'Receive a favour or settle a grudge.', kind: 'count', target: 1,
    value: (w) => w.c.peace, reward: 1200 },
  { id: 'meter', title: '🔋 Meter No Go Zero', desc: 'Your meter never hits 0 all week.', kind: 'end', target: 0,
    value: () => 0, broken: (w) => w.c.meterZero, reward: 2000 },
  { id: 'phone', title: '📱 Battery Boss', desc: 'Never let your phone drop below 20%.', kind: 'end', target: 0,
    value: () => 0, broken: (w) => w.c.phoneLow, reward: 1500 },
  { id: 'saver', title: '🐷 Save Small', desc: 'End the week with ₦5,000 more than you started.', kind: 'end', target: 5000, unit: '₦',
    value: (w) => G.cash - w.startCash, reward: 1500 },
  { id: 'gendiet', title: '⛽ Gen Diet', desc: 'Run your generator less than 3 hours all week.', kind: 'end', target: 0,
    value: () => 0, broken: (w) => w.c.genMin > 180, eligible: () => G.gen > 0, reward: 1500 },
];

export const challenge = (id: string): Challenge => CHALLENGES.find((c) => c.id === id)!;
export const weekOf = (day: number): number => Math.floor((day - 1) / WEEK_DAYS) + 1;
export const weekEndDay = (n: number): number => n * WEEK_DAYS; // last day of week n

/** Draw this week's challenges if not drawn yet. Seeded by meter number + week, so reloading never reshuffles. */
export function ensureWeek(): void {
  const w = G.week;
  if (w.list.length) return;
  const rng = seededRng(G.meterNo + ':' + w.n);
  const pool = CHALLENGES.filter((c) => !c.eligible || c.eligible());
  const picked: string[] = [];
  while (picked.length < PER_WEEK && picked.length < pool.length) {
    const c = pool[Math.floor(rng() * pool.length)];
    if (!picked.includes(c.id)) picked.push(c.id);
  }
  w.list = picked.map((id) => ({ id, state: 'active' }));
  w.startCash = G.cash;
}

/** Progress text for the phone. */
export function progressText(id: string, state: string): string {
  if (state === 'done') return '✅ Done!';
  if (state === 'failed') return '❌ Failed this week';
  const c = challenge(id), v = Math.max(0, c.value(G.week));
  if (c.kind === 'end' && c.target === 0) return '🟢 On track — judged at week end';
  const f = (n: number) => (c.unit ? '₦' + fmt(n) : String(n));
  return `${f(Math.min(v, c.target))} / ${f(c.target)}${c.kind === 'end' ? ' — judged at week end' : ''}`;
}

export function progressShare(id: string): number {
  const c = challenge(id); if (c.kind === 'end' && c.target === 0) return 1;
  return Math.max(0, Math.min(1, c.value(G.week) / c.target));
}

function complete(item: WeekState['list'][number], silent = false): void {
  const c = challenge(item.id); item.state = 'done';
  addCash(c.reward, 'Weekly challenge: ' + c.title); trust(2); G.stats.challengesDone++;
  if (!silent) { toast(`🏆 <b>Challenge done:</b> ${c.title} — +₦${fmt(c.reward)}!`, 'sys'); sfx.cheer(); }
}

/** Called every tick: finish count challenges, fail broken ones. */
export function checkChallenges(): void {
  ensureWeek();
  for (const item of G.week.list) {
    if (item.state !== 'active') continue;
    const c = challenge(item.id);
    if (c.broken?.(G.week)) { item.state = 'failed'; toast(`❌ Challenge failed: ${c.title}`, 'bad'); continue; }
    if (c.kind === 'count' && c.value(G.week) >= c.target) complete(item);
  }
}

/** Called from newDay(): when a new week begins, judge the old one and draw fresh challenges. */
export function weekRollover(): void {
  const n = weekOf(G.day);
  if (n <= G.week.n) return;
  const old = G.week;
  for (const item of old.list) {
    if (item.state !== 'active') continue;
    const c = challenge(item.id);
    if (c.kind === 'end' && !c.broken?.(old) && c.value(old) >= c.target) complete(item, true); else item.state = 'failed';
  }
  const done = old.list.filter((i) => i.state === 'done').length;
  if (done === old.list.length && done > 0) { addCash(ALL_DONE_BONUS, `Week ${old.n} — all challenges`); trust(3); }
  G.weekHistory.unshift({ n: old.n, done, total: old.list.length });
  if (G.weekHistory.length > 12) G.weekHistory.pop();
  G.week = emptyWeek(n, G.day, G.cash, G.stats);
  ensureWeek();
  checkAch(); save(); updHUD();
  weekEnd?.(old);
  showWeekSummary(old, done);
}

let weekEnd: ((w: WeekState) => void) | null = null;
/** Cloud sync registers here to file a week report. */
export function onWeekEnd(fn: (w: WeekState) => void): void { weekEnd = fn; }

let shareWeek: ((w: WeekState) => void) | null = null;
/** The share sheet registers itself here, so this module stays free of rendering code. */
export function onShareWeek(fn: (w: WeekState) => void): void { shareWeek = fn; }

function showWeekSummary(old: WeekState, done: number): void {
  const rows = old.list.map((i) => `${i.state === 'done' ? '✅' : '❌'} ${challenge(i.id).title}${i.state === 'done' ? ` <span style="color:var(--green)">+₦${fmt(challenge(i.id).reward)}</span>` : ''}`).join('<br>');
  const all = done === old.list.length && done > 0;
  if (all) sfx.cheer();
  openModal(`📅 Week ${old.n} don finish!`, `${rows}<br><br><b>${'★'.repeat(done)}${'☆'.repeat(old.list.length - done)}</b> ${done}/${old.list.length} challenges${all ? `<br><span style="color:var(--green)">All three! Bonus +₦${fmt(ALL_DONE_BONUS)} 🎉</span>` : ''}<br><br>New week, new wahala: ${G.week.list.map((i) => challenge(i.id).title).join(', ')}.`, [
    { t: '🖼️ Make my week card', fn: () => shareWeek?.(old) },
    { t: 'Continue' },
  ]);
}
