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
    toast('🏘️ You walk into the compound. The fan is spinning, the TV is on, the neighbours are chatting. Life is good.', 'sys');
  } else if (G.intro === 1 && t > 10) {
    G.intro = 2;
    G.gridOn = false; G.nextFlip = T() + rnd(90, 150); blackoutFX();
    setTimeout(showDecision, 2500);
  } else if (G.intro === 2 && t > 24) {
    G.intro = 3;
    toast('🗣️ A shout from the next street: <b>“UP NEPA!”</b> Their power is back. Yours is still off. 😭', 'npc');
  } else if (G.intro === 3 && t > 34) {
    G.intro = INTRO_DONE;
    toast('🎯 <b>Your street, your story.</b> Keep your meter topped up, earn some cash, and look after your neighbours.', 'sys');
    save();
  }
}

function showDecision(): void {
  if (!G || G.intro >= INTRO_DONE) return;
  const canGen = G.gen > 0 && G.fuel > 0;
  const cost = 5 * UNIT_PRICE;
  openModal('⚡ Power Cut! What Do You Do?',
    `Everything just went dark. Meter: <b>${G.meterUnits.toFixed(1)} units</b>. Phone: <b>${Math.round(G.phone)}%</b>. Cash: <b>₦${fmt(G.cash)}</b>.

Power can go at <i>any time</i> here. What's your move?`, [
      { t: `Buy 5 units on NextPawa: ₦${fmt(cost)}`, dis: G.cash < cost, sub: 'Units only work when the grid is on', fn: () => {
        addCash(-cost, '5 electricity units (virtual)'); sfx.cash(); loadToken(5);
        toast('💡 Done. Remember: units only work when the grid is on.', 'sys');
      } },
      { t: 'Start the generator', dis: !canGen, sub: canGen ? 'Burns fuel, and the neighbours may complain' : 'You don’t have a generator (yet)', fn: () => startGen() },
      { t: 'Switch on your rechargeable lamp', dis: !G.lamp, sub: G.lamp ? '' : 'You can buy one in the Shop', fn: () => { toast('🔦 Lamp on. A little light, a lot of peace of mind.', 'sys'); } },
      { t: 'Sit outside and watch the drama', fn: () => { fun(6); toast('🪑 You sit outside. Someone is already blaming the new tenant.', 'sys'); } },
    ]);
}
