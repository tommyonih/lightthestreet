import { G, save } from '../core/state';
import { chance, clamp } from '../core/util';
import { genHum, sfx } from '../core/audio';
import { openModal } from '../ui/modal';
import { toast } from '../ui/toast';
import { updHUD } from '../ui/hud';
import { addCash } from './economy';
import { checkObj } from './progress';
import { needHome } from './world';

/** Litres per game-minute (small ≈0.75 L/h, big ≈1.5 L/h). */
export const DRAIN_GEN: Record<number, number> = { 1: 0.75 / 60, 2: 1.5 / 60 };

export function genLabel(): string {
  return G.gen === 0 ? 'No generator' : G.gen === 1 ? 'Small generator' : 'Big generator';
}
/** Small gen: lights + one appliance. Big gen: everything. */
export function genCapacity(): number { return G.gen === 1 ? 1 : G.gen === 2 ? 3 : 0; }
export function loadLevel(): number { return (G.fanOn ? 1 : 0) + (G.tvOn ? 1 : 0) + (G.fridgeOn ? 1 : 0); }

export function startGen(force = false): void {
  if (G.gen === 0) { toast('🔌 You don’t have a generator. Check the Shop.', 'bad'); return; }
  if (!needHome('Your gen')) return;
  if (G.fuel <= 0) {
    toast('⛽ The fuel tank is empty. Buy fuel first.', 'bad'); sfx.bad();
    if (G.lamp > 0) toast('🔦 You switch on your rechargeable lamp instead.', 'sys'); return;
  }
  if (G.genOn) return;
  if (!force && loadLevel() > genCapacity()) {
    const only = (f: boolean, t: boolean, r: boolean) => () => { G.fanOn = f; G.tvOn = t; G.fridgeOn = r; startGen(true); };
    openModal('🔌 Small Generator, Big Load', 'A small generator can’t run everything. Lights plus <b>one</b> appliance. Which one?', [
      { t: '🌀 Fan only', sub: 'Sleep cool', fn: only(true, false, false) },
      { t: '📺 TV only', sub: 'Don’t miss the match', fn: only(false, true, false) },
      { t: '🧊 Fridge only', sub: 'Save the meat', fn: only(false, false, true) },
      { t: 'Run everything anyway', sub: 'It will trip. Guaranteed.', fn: () => startGen(true) },
      { t: 'Cancel' },
    ]);
    return;
  }
  const failP = G.genCond < 40 ? .35 : .12;
  if (chance(failP)) {
    G.genCond = clamp(G.genCond - 3, 5, 100); sfx.bad();
    openModal('🔌 Generator Won’t Start', 'You pull the cord. <i>Brr… brr…</i> nothing.', [
      { t: 'Try again (−2 condition)', fn: () => {
        if (chance(.5)) { G.genOn = true; genHum(true); checkObj('gen'); toast('🔌 It started! The generator is running.', 'sys'); sfx.genStart(); }
        else { G.genCond = clamp(G.genCond - 2, 5, 100); toast('Still won’t start. It may need a service soon.', 'bad'); }
        updHUD();
      } },
      { t: 'Leave it (use a lamp or endure)', fn: () => { if (G.lamp > 0) toast('🔦 Lamp on.', 'sys'); } },
    ]);
    updHUD(); return;
  }
  G.genOn = true; sfx.genStart(); genHum(true); checkObj('gen');
  if (G.gridOn) toast('🔌 Generator running, though the grid is still on. A bit wasteful.', 'sys');
  else toast('🔌 Generator on! Let there be light. <span style="color:var(--dim)">(Outdoors, away from windows: safety first.)</span>', 'sys');
  updHUD();
}

export function stopGen(silent = false): void {
  if (!G.genOn) return;
  if (!silent && !needHome('Your gen')) return; // the sim stops it silently (trips, fuel, sleep) wherever you are
  G.genOn = false; genHum(false);
  if (!silent) toast('🔌 Generator off. The compound is quieter.', 'sys');
  updHUD();
}

export function repairGen(): void {
  if (G.gen === 0) return;
  openModal('🔧 Service Generator', `Condition: <b>${Math.round(G.genCond)}%</b>. A full service costs ₦1,500 (made-up price).`, [
    { t: 'Service it: ₦1,500', dis: G.cash < 1500, fn: () => {
      addCash(-1500, 'Generator service'); G.genCond = 100; sfx.cash(); toast('🔧 Generator serviced. It purrs like new.', 'sys'); save(); updHUD();
    } },
    { t: 'Leave it as it is' },
  ]);
}
