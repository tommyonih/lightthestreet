/* Hustles as real jobs: you go to the workplace, work for a stretch of game time, and get paid at the end.
   The street renderer reads G.job to show where you are and what you're doing. */
import { G, T, save } from '../core/state';
import { clamp, fmt, rnd } from '../core/util';
import { sfx } from '../core/audio';
import { HUSTLES, type Hustle } from '../data/content';
import { toast } from '../ui/toast';
import { updHUD } from '../ui/hud';
import { renderPhone } from '../ui/phone';
import { addCash } from './economy';
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
  if (busy()) { toast(`💼 You never finish ${currentHustle()?.n ?? 'your work'} yet!`, 'bad'); return; }
  if (G.trip) { toast(`🚶 You dey road to ${place(G.trip.to).n}. Reach first, then hustle.`, 'bad'); return; }
  if ((G.hustleCd[h.id] ?? -9999) > T()) { toast('⏳ This hustle still dey cool down. Try another one.', 'bad'); return; }
  if (h.need === 'any' && !placePowered(h.place)) {
    toast(h.place === 'street' ? `🔌 ${h.n} needs light! NEPA off, gen off — how you wan work?` : `🔌 No NEPA light for ${place(h.place).n} — ${h.n} no fit work now.`, 'bad'); sfx.bad(); return;
  }
  if (h.id === 'barb' && !present('barber')) { toast('💈 Skippo don lock shop. Come back when e dey around (9AM–8PM).', 'bad'); return; }
  if (h.phone && G.phone < 5) { toast(`📵 Your phone don die — no customer fit reach you for ${h.n}. Charge am first!`, 'bad'); sfx.bad(); return; }
  if (G.hunger > 90) { toast('🍲 Hunger don weak your body. Chop something before you hustle!', 'bad'); return; }
  G.hustleCd[h.id] = T() + h.cd;
  G.job = { id: h.id, worked: 0, paused: 0 };
  const walk = G.loc === h.place ? 0 : tripMins(G.loc, h.place, 'walk');
  if (walk) setOff(h.place, 'walk');
  toast(`${h.verb} — ${walk ? `you don waka go ${place(h.place).n} (~${walk} min)` : 'you don start'}. Work na ~${Math.round(h.mins / 60 * 10) / 10}h (game time).`, 'sys');
  save(); updHUD(); renderPhone();
}

/** Called every sim tick with the game minutes that passed. */
export function jobTick(mins: number): void {
  const h = currentHustle(); if (!h || !G.job || commuting()) return;
  if (jobStalled()) {
    if (G.job.paused === 0) toast(`⏳ Light don go — ${h.n} don stop. Waiting for light…`, 'bad');
    G.job.paused += mins;
    if (G.job.paused >= GIVE_UP_AFTER) finishJob(false);
    return;
  }
  G.job.worked += mins;
  if (h.phone) G.phone = clamp(G.phone - 3 * mins / h.mins, 0, 100); // the job uses your phone
  if (G.job.worked >= h.mins) finishJob(true);
}

function finishJob(full: boolean): void {
  const h = currentHustle()!; G.job = null;
  let pay = Math.round(rnd(h.pay[0], h.pay[1])); if (G.bg === 'business') pay = Math.round(pay * 1.1);
  if (!full) pay = Math.round(pay * ABANDON_PAY);
  addCash(pay, full ? h.n : `${h.n} (customer left)`); G.week.c.hustle += pay; sfx.cash();
  payFx.push({ amount: pay, full });
  toast(full
    ? `💼 ${h.n} done! You make <b>₦${fmt(pay)}</b>${G.bg === 'business' ? ' (business owner bonus)' : ''}.`
    : `😩 Light no come back — customer waka. You only collect <b>₦${fmt(pay)}</b>.`, full ? 'sys' : 'bad');
  fun(3); G.hunger = clamp(G.hunger + 5, 0, 100);
  save(); updHUD(); renderPhone();
}
