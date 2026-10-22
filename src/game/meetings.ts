/* Street meetings: the chairman puts motions to a vote; neighbours vote by their own stance, swayed by you.
   Add a motion by appending to MOTIONS. */
import { G, save } from '../core/state';
import { clamp, esc, fmt, rnd } from '../core/util';
import { sfx } from '../core/audio';
import type { Vote } from '../core/types';
import { NPCDEF } from '../data/content';
import { openModal } from '../ui/modal';
import { toast } from '../ui/toast';
import { updHUD } from '../ui/hud';
import { addCash } from './economy';
import { addFund } from './fund';
import { hasTrait, npcDef, npcState, rel, trust } from './helpers';
import { checkAch } from './progress';
import { GRUDGE, opinion, remember } from './memory';
import { atHome, comeHome, place } from './world';

export const MEETING_EVERY = 4; // game days between meetings
export const MEETING_START = 18 * 60, MEETING_END = 21 * 60;
export const LEVY = 500, GUARD_FEE = 300, HUB_FEE = 1000, CURFEW_FINE = 500;

export interface Motion {
  id: string;
  title: string;
  /** What passing it does, shown before the vote. */
  desc: string;
  eligible: () => boolean;
  /** Each neighbour's lean, -1 (against) … +1 (for). Missing = 0. */
  stance: Record<string, number>;
  /** Optional per-neighbour adjustment on top of `stance`. */
  adjust?: (npcId: string) => number;
  onPass: () => string;
  failMsg: string;
}

const owes = (id: string) => G.owing.includes(id);

export const MOTIONS: Motion[] = [
  { id: 'curfew', title: '🔇 Generator curfew after 10PM',
    desc: `No generators from 10PM to 6AM. Anyone caught pays ₦${fmt(CURFEW_FINE)}. Fewer noise complaints.`,
    eligible: () => !G.policies.genCurfew,
    stance: { landlord: .4, broke: .3, gist: .5, remote: -.3, barber: -.2, elder: .6, chairman: .2, solar: .5, student: -.4, helpful: .3 },
    onPass: () => { G.policies.genCurfew = true; return 'The generator curfew has started. Nights will be quiet, so plan ahead if you rely on a generator.'; },
    failMsg: 'The generator owners won this one. The night noise continues.' },
  { id: 'levy', title: '🔧 Transformer maintenance levy',
    desc: `Every house pays ₦${fmt(LEVY)} once. Before the streetlight is fixed, it goes into the fund. After, it pays for regular transformer service, so outages get shorter.`,
    eligible: () => !G.policies.maintained,
    stance: { landlord: .3, broke: -.8, gist: 0, remote: .3, barber: .2, elder: .3, chairman: .7, solar: -.1, student: -.5, helpful: .2 },
    onPass: () => {
      addCash(-Math.min(LEVY, Math.max(0, G.cash)), 'Maintenance levy');
      if (!G.streetlightFixed) { addFund(LEVY * G.npcs.filter((n) => npcDef(n.id).broke !== 1).length + LEVY); return 'The levy went straight into the street fund!'; }
      G.policies.maintained = true; return 'An electrician will service the transformer regularly. Outages will be a little shorter.';
    },
    failMsg: '"There is no money" won the day. The transformer is on its own.' },
  { id: 'security', title: '🛡️ Hire night guard (Mallam Sule)',
    desc: `₦${fmt(GUARD_FEE)} per house every week. No more fuel or gadget theft at night.`,
    eligible: () => !G.policies.security,
    stance: { landlord: .6, broke: -.5, gist: .2, remote: .1, barber: .3, elder: .4, chairman: .4, solar: .2, student: -.3, helpful: .1 },
    onPass: () => { G.policies.security = true; return 'Mallam Sule has started, with his torch and whistle. Thieves, you have been warned.'; },
    failMsg: 'No guard. Everyone lock your doors.' },
  { id: 'hub', title: '🔌 Community charging hub at Aunty Solar’s',
    desc: `₦${fmt(HUB_FEE)} per house, once. Anyone can charge their phone at Aunty Solar’s, any time, for free.`,
    eligible: () => !G.policies.solarHub,
    stance: { landlord: -.2, broke: .1, gist: .2, remote: .5, barber: .3, elder: 0, chairman: .2, solar: .6, student: .7, helpful: .4 },
    onPass: () => { addCash(-Math.min(HUB_FEE, Math.max(0, G.cash)), 'Charging hub levy'); G.policies.solarHub = true; return 'The charging hub is open! Dead phones are less of a problem now.'; },
    failMsg: 'No hub. Phone charging is still every person for themselves.' },
  { id: 'petition', title: '✍️ Petition the power company together',
    desc: 'Everyone signs one letter to the power company. It’s free. They might answer… or ignore it.',
    eligible: () => !(G.policies.petitionDay && G.policies.petitionDay > G.day) && !((G.policies.betterSupplyUntil ?? 0) >= G.day),
    stance: { landlord: 0, broke: .3, gist: .6, remote: .4, barber: .4, elder: -.1, chairman: .3, solar: 0, student: .3, helpful: .2 },
    onPass: () => { G.policies.petitionDay = G.day + 2; return 'The petition has been sent. Let’s see if they answer in two days.'; },
    failMsg: '"They never read letters anyway." The motion failed.' },
  { id: 'shame', title: '📜 Publish owing list on the gate',
    desc: 'The names of houses that haven’t paid into the street fund go up on the gate. The pressure will make them pay, but it will cause bad blood.',
    eligible: () => !G.policies.shameList && !G.streetlightFixed && G.owing.length >= 2,
    stance: { landlord: .4, broke: -.4, gist: .8, remote: 0, barber: -.1, elder: -.4, chairman: .2, solar: -.2, student: -.3, helpful: -.5 },
    adjust: (id) => (owes(id) ? -.6 : 0),
    onPass: () => {
      G.policies.shameList = true;
      G.owing.forEach((id) => { rel(id, -4); remember(id, 'shamed'); });
      return 'The list is on the gate. Some people are angry; some are suddenly finding money.';
    },
    failMsg: 'The elders said "don’t shame anyone". The list stays down.' },
  { id: 'newchair', title: '🗳️ Elect you as street chairman',
    desc: 'Someone nominated you to replace Chairman Dele. If it passes, you run the meetings and break ties.',
    eligible: () => !G.policies.youChair && G.trust >= 70 && G.day >= 6,
    stance: { chairman: -1 },
    adjust: (id) => (id === 'chairman' ? 0 : (npcState(id).rel - 55) / 40),
    onPass: () => {
      G.policies.youChair = true; trust(10); rel('chairman', -10);
      return `${esc(G.name)} is the new street chairman! Chairman Dele hands over the register… reluctantly.`;
    },
    failMsg: 'Chairman Dele survived the vote. "You see? Experience counts."' },
];

export function chairName(): string { return G.policies.youChair ? 'You' : 'Chairman Dele'; }

export interface Tally { yes: string[]; no: string[]; abstain: string[]; passed: boolean; tieBreak: boolean }

/** How a neighbour leans before you say anything: their stance plus relationship to the room. */
export function lean(m: Motion, id: string): number { return (m.stance[id] ?? 0) + (m.adjust?.(id) ?? 0); }

/** How much your speech moves one neighbour: closeness × street trust. */
function sway(id: string): number {
  const closeness = clamp((npcState(id).rel - 35) / 65, 0, 1);
  return closeness * (0.4 + G.trust / 250) * (hasTrait('chairman') ? 1.4 : 1);
}

/** Count the votes. `speech` is -1/0/+1 (spoke against / kept quiet / spoke for). `you` is null if you skipped. */
export function tallyVotes(m: Motion, speech: number, you: Vote | null): Tally {
  const t: Tally = { yes: [], no: [], abstain: [], passed: false, tieBreak: false };
  for (const n of NPCDEF) {
    if (Math.random() < .12) { t.abstain.push(n.id); continue; } // absent: at work, at church, asleep
    // a neighbour holding a grudge votes against whatever you push
    const push = opinion(n.id) <= GRUDGE ? -.5 * speech : speech * sway(n.id);
    const score = lean(m, n.id) + push + rnd(-.25, .25);
    (score > .15 ? t.yes : score < -.15 ? t.no : t.abstain).push(n.id);
  }
  if (you === 'yes') t.yes.push('you'); else if (you === 'no') t.no.push('you'); else if (you) t.abstain.push('you');
  if (t.yes.length !== t.no.length) t.passed = t.yes.length > t.no.length;
  else { // chair's casting vote
    t.tieBreak = true;
    t.passed = G.policies.youChair ? you === 'yes' : lean(m, 'chairman') > 0;
  }
  return t;
}

/** Rough read of the room, shown before you choose. */
function roomMood(m: Motion): string {
  const avg = NPCDEF.reduce((s, n) => s + lean(m, n.id), 0) / NPCDEF.length;
  return avg > .2 ? '🟢 Most people lean YES' : avg < -.2 ? '🔴 Most people lean NO' : '🟡 The room is divided';
}

export function meetingDue(): boolean {
  return G.day >= G.nextMeetingDay && G.minute >= MEETING_START && G.minute < MEETING_END;
}

export function agenda(): Motion[] {
  return MOTIONS.filter((m) => m.eligible()).sort(() => Math.random() - .5).slice(0, 2);
}

export function callMeeting(): void {
  G.nextMeetingDay = G.day + MEETING_EVERY;
  const items = agenda();
  if (!items.length) {
    trust(1); toast('🗳️ The street meeting happened, but there was nothing to vote on. Just chat and chin-chin.', 'sys'); save();
    return;
  }
  sfx.knock();
  const host = G.policies.youChair ? 'You call the street together' : 'Chairman Dele bangs the table';
  openModal('🗳️ Street Meeting', `${host}: <i>"The meeting is starting! Bring your chair."</i><br><br>On the agenda:<br>${items.map((m) => '• ' + m.title).join('<br>')}`, [
    atHome()
      ? { t: '🪑 Attend the meeting', sub: 'Your voice could change the vote', fn: () => { trust(2); chooseMotion(items); } }
      : { t: '🏃 Run home and attend', sub: `You’re ${G.trip ? 'on the road' : 'at ' + place(G.loc).n}. You’ll arrive late and sweaty.`, fn: () => { comeHome(); trust(1); chooseMotion(items); } },
    { t: 'Skip it, I’m tired', sub: 'Trust −4. They’ll decide without you.', fn: () => { trust(-4); resolve(items[0], 0, null); } },
  ]);
}

function chooseMotion(items: Motion[]): void {
  if (items.length === 1) { debate(items[0]); return; }
  openModal('📋 Which matter first?', `${G.policies.youChair ? 'You’re the chairman. You pick.' : 'Chairman Dele: <i>"We don’t have time for everything. Which one first?"</i>'}`,
    items.map((m) => ({ t: m.title, sub: m.desc, fn: () => debate(m) })));
}

function debate(m: Motion): void {
  openModal(m.title, `${m.desc}<br><br><b>${roomMood(m)}</b><br><span style="color:var(--dim);font-size:12px">Speaking up sways neighbours who are close to you. Lose loudly, and people will remember.</span>`, [
    { t: '📣 Speak for it and vote YES', fn: () => resolve(m, 1, 'yes') },
    { t: '✅ Vote YES quietly', fn: () => resolve(m, 0, 'yes') },
    { t: '😶 Abstain', fn: () => resolve(m, 0, 'abstain') },
    { t: '❌ Vote NO quietly', fn: () => resolve(m, 0, 'no') },
    { t: '📣 Speak against it and vote NO', fn: () => resolve(m, -1, 'no') },
  ]);
}

const names = (ids: string[]) => ids.map((id) => (id === 'you' ? '<b>You</b>' : npcDef(id).name)).join(', ') || '—';

export function resolve(m: Motion, speech: number, you: Vote | null): Tally {
  const t = tallyVotes(m, speech, you);
  const outcome = t.passed ? m.onPass() : m.failMsg;
  // neighbours remember which side you took
  if (you === 'yes' || you === 'no') {
    const mine = you === 'yes' ? t.yes : t.no, theirs = you === 'yes' ? t.no : t.yes;
    mine.forEach((id) => { if (id !== 'you') { rel(id, 2); remember(id, 'votedWith'); } });
    theirs.forEach((id) => { if (id !== 'you') { rel(id, -1); remember(id, 'votedAgainst'); } });
    const won = (you === 'yes') === t.passed;
    if (won) G.stats.votesWon++;
    if (speech) trust(won ? 3 : -2);
  }
  G.meetings.unshift({ day: G.day, motion: m.id, title: m.title, passed: t.passed, yes: t.yes.length, no: t.no.length, you: you ?? 'absent' });
  if (G.meetings.length > 10) G.meetings.pop();
  const verdict = t.passed ? '✅ MOTION PASSED' : '❌ MOTION FAILED';
  if (you) {
    if (t.passed) sfx.cheer(); else sfx.bad();
    openModal(`${verdict}`, `<b>${m.title}</b><br><br>✅ YES (${t.yes.length}): ${names(t.yes)}<br>❌ NO (${t.no.length}): ${names(t.no)}<br>😶 Abstain/absent: ${names(t.abstain)}${t.tieBreak ? `<br><br><i>A tie! ${chairName()} cast the deciding vote.</i>` : ''}<br><br>${outcome}`,
      [{ t: 'Take your chair home' }]);
  } else {
    toast(`🗳️ The meeting you skipped: <b>${m.title}</b>: ${t.passed ? 'PASSED' : 'FAILED'} (${t.yes.length}–${t.no.length}). ${outcome}`, t.passed ? 'sys' : 'bad');
  }
  checkAch(); save(); updHUD();
  return t;
}

/** Daily consequences of standing policies. Called from newDay(). */
export function policiesNewDay(): void {
  const p = G.policies;
  if (p.security && G.day % 7 === 0) { addCash(-Math.min(GUARD_FEE, Math.max(0, G.cash)), 'Night guard (weekly)'); toast(`🛡️ Mallam Sule’s weekly fee: ₦${fmt(GUARD_FEE)}. Peace of mind isn’t free.`, 'sys'); }
  if (p.petitionDay && G.day >= p.petitionDay) {
    p.petitionDay = undefined;
    if (Math.random() < .5) { p.betterSupplyUntil = G.day + 5; toast('📨 The power company answered the petition! Better supply for the next 5 days.', 'sys'); sfx.cheer(); }
    else toast('📨 The power company ignored the petition. As usual.', 'bad');
  }
}

/** Grid-duration multipliers from policies. */
export function supplyMods(): { on: number; off: number } {
  const better = (G.policies.betterSupplyUntil ?? 0) >= G.day;
  return { on: better ? 1.3 : 1, off: (G.policies.maintained ? .85 : 1) * (better ? .7 : 1) };
}
