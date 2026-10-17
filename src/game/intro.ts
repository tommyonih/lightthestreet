/* The scripted first 30 seconds: lively compound → NEPA takes light → forced decision → "UP NEPA!" false hope. */
import { G, T, save } from '../core/state';
import { $, fmt, rnd } from '../core/util';
import { sfx } from '../core/audio';
import { modalOpen, openModal } from '../ui/modal';
import { toast } from '../ui/toast';
import { addCash, loadToken, UNIT_PRICE } from './economy';
import { startGen } from './generator';
import { fun } from './helpers';
import { blackoutFX } from './sim';

/** G.intro reaches this value once the intro is over and the random engine takes over. */
export const INTRO_DONE = 99;

let introLast = 0;
export function resetIntroClock(): void { G.introT = Date.now(); introLast = Date.now(); }

export function introStep(): void {
  if (!G || G.intro >= INTRO_DONE || !$('#scr-game').classList.contains('active')) { introLast = Date.now(); return; }
  const nowMs = Date.now();
  if (modalOpen) { G.introT += nowMs - introLast; introLast = nowMs; return; } // intro clock pauses with the sim
  introLast = nowMs;
  const t = (nowMs - G.introT) / 1000;
  if (G.intro === 0 && t > 3) {
    G.intro = 1;
    toast('🏘️ You enter the compound. Fan dey spin, TV dey show match, neighbours dey gist. Life good.', 'sys');
  } else if (G.intro === 1 && t > 10) {
    G.intro = 2;
    G.gridOn = false; G.nextFlip = T() + rnd(90, 150); blackoutFX();
    setTimeout(showDecision, 2500);
  } else if (G.intro === 2 && t > 24) {
    G.intro = 3;
    toast('🗣️ Voice from next street: <b>“UP NEPA!!”</b> …but na their street get light. Your own? Still dark. 😭', 'npc');
  } else if (G.intro === 3 && t > 34) {
    G.intro = INTRO_DONE;
    toast('🎯 <b>Your street, your rules.</b> Keep meter loaded, hustle cash, mind your neighbours — and may NEPA favour you.', 'sys');
    save();
  }
}

function showDecision(): void {
  if (!G || G.intro >= INTRO_DONE) return;
  const canGen = G.gen > 0 && G.fuel > 0;
  const cost = 5 * UNIT_PRICE;
  openModal('⚡ Light Don Go — Wetin You Wan Do?',
    `Everywhere don dark! Your meter: <b>${G.meterUnits.toFixed(1)} units</b>. Phone: <b>${Math.round(G.phone)}%</b>. Cash: <b>₦${fmt(G.cash)}</b> (virtual). Heat dey rise.

This na the street life: NEPA fit take light <i>anytime</i>. Make your move.`, [
      { t: `Buy 5 units now — ₦${fmt(cost)}`, dis: G.cash < cost, sub: 'Units only work when NEPA light dey', fn: () => {
        addCash(-cost, '5 electricity units (virtual)'); sfx.cash(); loadToken(5);
        toast('💡 Sharp! But remember: if NEPA light no dey, units no dey work. Double wahala!', 'sys');
      } },
      { t: 'Start generator', dis: !canGen, sub: canGen ? 'Fuel dey burn, neighbours fit complain' : 'You no get generator (yet)', fn: () => startGen() },
      { t: 'On your rechargeable lamp', dis: !G.lamp, sub: G.lamp ? '' : 'Buy one for the Shop later', fn: () => { toast('🔦 Lamp on. Small light, big peace of mind.', 'sys'); } },
      { t: 'Carry chair outside, observe the drama', fn: () => { fun(6); toast('🪑 You sit outside. Somebody don already blame the new tenant. Classic.', 'sys'); } },
    ]);
}
