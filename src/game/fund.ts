import { G, save } from '../core/state';
import { chance, clamp, fmt } from '../core/util';
import { sfx } from '../core/audio';
import { closeModal, openModal } from '../ui/modal';
import { toast } from '../ui/toast';
import { updHUD } from '../ui/hud';
import { addCash } from './economy';
import { hasTrait, mood, npcDef, npcState, trust } from './helpers';
import { checkAch, checkObj } from './progress';

export const SHARE = 1000;

/** Every fund change goes through here so the goal can never be passed silently. */
export function addFund(n: number): void { G.fund += n; if (!G.streetlightFixed && G.fund >= G.fundGoal) completeFund(); }

export function npcPays(id: string): void {
  const n = npcState(id); n.paid = true; n.owing = false; G.week.c.fundPaid++; G.owing = G.owing.filter((x) => x !== id); addFund(SHARE);
}

/** Your own share. Chairman trait counts double. */
export function payOwnShare(): number {
  const eff = hasTrait('chairman') ? SHARE * 2 : SHARE; G.youPaid = true;
  addCash(-SHARE, 'Street fund'); trust(8); sfx.cash(); checkObj('fund');
  return eff;
}

export function startFundDrive(): void {
  // Each neighbour pays their share once; anyone who hasn't paid yet gets another chance per drive.
  let payers = 0;
  G.npcs.filter((n) => !n.paid).forEach((n) => {
    const d = npcDef(n.id);
    const p = (d.broke ? .25 : .55 + (n.rel - 50) / 200) + (G.policies.shameList && n.owing ? .2 : 0);
    if (chance(p)) { n.paid = true; n.owing = false; G.fund += SHARE; n.rel = clamp(n.rel + 3, 0, 100); payers++; } else n.owing = true;
  });
  G.owing = G.npcs.filter((n) => n.owing).map((n) => n.id);
  const paidAll = G.npcs.filter((n) => n.paid).length;
  openModal('🏘️ Save the Street!',
    `Chairman Dele: <i>"Oya everybody! Transformer need repairs & streetlight don die. Fund goal: <b>₦${fmt(G.fundGoal)}</b>. Each house: ₦${fmt(SHARE)}."</i><br><br>${payers} house(s) drop money this round. Fund: <b>₦${fmt(G.fund)}</b>. ${paidAll}/${G.npcs.length} neighbours don pay. <b>${G.owing.length} house(s) never pay.</b>${G.youPaid ? '<br><span style="color:var(--green)">You don pay your own share ✓</span>' : ''}`, [
      { t: `Pay your share — ₦${fmt(SHARE)}`, dis: G.cash < SHARE || G.youPaid, sub: G.youPaid ? 'Already paid' : hasTrait('chairman') ? 'Chairman trait: counts double' : '', fn: () => {
        const eff = payOwnShare();
        toast(`🏘️ ₦${fmt(eff)} counted! Fund: ₦${fmt(G.fund + eff)} / ₦${fmt(G.fundGoal)}`, 'sys');
        addFund(eff); save(); updHUD();
      } },
      { t: 'Pay extra — ₦2,000 (big man move)', dis: G.cash < 2000, fn: () => {
        const eff = hasTrait('chairman') ? 3000 : 2000; G.youPaid = true;
        addCash(-2000, 'Street fund (extra)'); trust(12); sfx.cheer();
        checkObj('fund'); toast(`🎖️ Extra dropped! ₦${fmt(eff)} counted. Street dey hail you!`, 'sys');
        addFund(eff); save(); updHUD();
      } },
      { t: G.youPaid ? 'Close' : '"I go pay later" (−trust)', fn: () => {
        if (G.youPaid) return; trust(-10);
        toast('😬 Aunty Caro side-eye you. "I go pay later" — who never hear that before?', 'bad'); save(); updHUD();
      } },
    ]);
  if (G.fund >= G.fundGoal && !G.streetlightFixed) { closeModal(); completeFund(); }
}

export function completeFund(): void {
  if (G.streetlightFixed) return;
  G.streetlightFixed = true; G.owing = []; trust(20); mood(12); sfx.cheer();
  openModal('💡 LIGHT UP THE STREET!', 'The fund complete! Electrician fix the streetlight and service the transformer.<br><br>🌟 Night never dark again for this street. <b>Achievement unlocked: Chairman Material!</b>',
    [{ t: 'Celebrate with the street! 🎉', fn: () => { toast('🎉 Whole compound dey jubilate! Chairman Dele dey hail you by name!', 'sys'); } }]);
  checkAch(); save();
}
