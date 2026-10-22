/* Hustles as real jobs: you go to the workplace, work for a stretch of game time, and get paid at the end.
   The street renderer reads G.job to show where you are and what you're doing. */
import { G, T, save } from '../core/state';
import { clamp, fmt, rnd } from '../core/util';
import { sfx } from '../core/audio';
import { HUSTLES, type Hustle } from '../data/content';
import { toast } from '../ui/toast';
import { updHUD } from '../ui/hud';
import { renderPhone } from '../ui/phone';
import { addCash, dataLabel } from './economy';
import { fun } from './helpers';
import { present } from './schedule';
import { place, placePowered, setOff, tripMins } from './world';

/** After this many game minutes stuck waiting, the customer gives up. */
export const GIVE_UP_AFTER = 120;
/** Share of the pay you still get when a job is abandoned. */
export const ABANDON_PAY = .3;

export const busy = (): boolean => G.job != null;
export const currentHustle = (): Hustle | null => (G.job ? HUSTLES.find((h) => h.id === G.job!.id) ?? null : null);
export function jobProgress(): number { const h = currentHustle(); return h && G.job ? clamp(G.job.worked / h.mins, 0, 1) : 0; }
/** True while you're still walking to work. */
export const commuting = (): boolean => G.job != null && G.trip != null;
/** True while the job is stuck (e.g. needs light and there's none at the workplace). */
export function jobStalled(): boolean { const h = currentHustle(); return !!h && !commuting() && h.need === 'any' && !placePowered(h.place); }

/** Payouts for the renderer to float above your head; it drains this queue. */
export const payFx: { amount: number; full: boolean }[] = [];

export function doHustle(h: Hustle): void {
  if (busy()) { toast(`💼 You haven’t finished ${currentHustle()?.n ?? 'your work'} yet.`, 'bad'); return; }
  if (G.trip) { toast(`🚶 You’re on your way to ${place(G.trip.to).n}. Get there first.`, 'bad'); return; }
  if ((G.hustleCd[h.id] ?? -9999) > T()) { toast('⏳ This hustle isn’t ready yet. Try another one.', 'bad'); return; }
  if (h.need === 'any' && !placePowered(h.place)) {
    toast(h.place === 'street' ? `🔌 ${h.n} needs power, and both the grid and your generator are off.` : `🔌 No grid power at ${place(h.place).n}, so ${h.n} can’t run right now.`, 'bad'); sfx.bad(); return;
  }
  if (h.id === 'barb' && !present('barber')) { toast('💈 Skippo’s shop is locked. Come back while he’s there (9AM–8PM).', 'bad'); return; }
  if (h.phone && G.phone < 5) { toast(`📵 Your phone is dead, so no customer can reach you for ${h.n}. Charge it first.`, 'bad'); sfx.bad(); return; }
  if (h.mb && G.dataMB < h.mb / 2) { toast(`📶 You’re out of data. ${h.n} needs about ${dataLabel(h.mb)}. Buy data in the NextPawa app.`, 'bad'); sfx.bad(); return; }
  if (G.hunger > 90) { toast('🍲 You’re too hungry to work. Eat something first.', 'bad'); return; }
  G.hustleCd[h.id] = T() + h.cd;
  G.job = { id: h.id, worked: 0, paused: 0 };
  const walk = G.loc === h.place ? 0 : tripMins(G.loc, h.place, 'walk');
  if (walk) setOff(h.place, 'walk');
  toast(`${h.verb}: ${walk ? `walking to ${place(h.place).n} (about ${walk} min)` : 'started'}. The job takes about ${Math.round(h.mins / 60 * 10) / 10}h of game time.`, 'sys');
  save(); updHUD(); renderPhone();
}

/** Called every sim tick with the game minutes that passed. */
export function jobTick(mins: number): void {
  const h = currentHustle(); if (!h || !G.job || commuting()) return;
  if (jobStalled()) {
    if (G.job.paused === 0) toast(`⏳ The power went off, so ${h.n} has stopped. Waiting for power…`, 'bad');
    G.job.paused += mins;
    if (G.job.paused >= GIVE_UP_AFTER) finishJob(false);
    return;
  }
  G.job.worked += mins;
  if (h.phone) G.phone = clamp(G.phone - 3 * mins / h.mins, 0, 100); // the job uses your phone
  if (h.mb) {
    const before = G.dataMB; G.dataMB = Math.max(0, G.dataMB - h.mb * mins / h.mins);
    if (before >= 100 && G.dataMB < 100) toast(`📶 Only ${dataLabel()} of data left. Top up on NextPawa before it runs out.`, 'bad');
  }
  if (G.job.worked >= h.mins) finishJob(true);
}

function finishJob(full: boolean): void {
  const h = currentHustle()!; G.job = null;
  let pay = Math.round(rnd(h.pay[0], h.pay[1])); if (G.bg === 'business') pay = Math.round(pay * 1.1);
  if (!full) pay = Math.round(pay * ABANDON_PAY);
  addCash(pay, full ? h.n : `${h.n} (customer left)`); G.week.c.hustle += pay; sfx.cash();
  payFx.push({ amount: pay, full });
  toast(full
    ? `💼 ${h.n} done! You earned <b>₦${fmt(pay)}</b>${G.bg === 'business' ? ' (business owner bonus)' : ''}.`
    : `😩 The power never came back and the customer left. You only got <b>₦${fmt(pay)}</b>.`, full ? 'sys' : 'bad');
  fun(3); G.hunger = clamp(G.hunger + 5, 0, 100);
  save(); updHUD(); renderPhone();
}
