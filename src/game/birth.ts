/* Net Babies and Local Babies. A new life starts with a random roll: a few are born into money and connections,
   most start at the bottom, some of them already owing. Debt grows a little every morning until it's paid. */
import { G } from '../core/state';
import { clamp, fmt } from '../core/util';
import { BGS, BIRTHS, DEBT_RATE, STREET_TYPES, type Birth } from '../data/content';
import type { StreetType } from '../core/types';
import { toast } from '../ui/toast';
import { updHUD } from '../ui/hud';
import { addCash } from './economy';
import { checkAch } from './progress';

/** Everything the roll decides, before it's applied to a fresh game. */
export interface BirthPack {
  birth: Birth; bg: string; streetType: StreetType;
  cash: number; units: number; debt: number;
  gen: number; genCond: number; fuel: number; inverter: number;
  relBonus: number; trust: number;
}

/** Round money to the nearest ₦100 so the numbers read cleanly. */
const money = (n: number): number => Math.round(n / 100) * 100;

/** Roll a birth. `r` is injectable so tests can force either side. */
export function rollBirth(r: () => number = Math.random): BirthPack {
  const b = BIRTHS[r() < BIRTHS.net.odds ? 'net' : 'local'];
  const span = ([lo, hi]: [number, number]) => lo + r() * (hi - lo);
  const of = <T>(a: T[]): T => a[Math.min(a.length - 1, Math.floor(r() * a.length))];
  const debt = r() < b.debtChance ? money(span(b.debt)) : 0;
  return {
    birth: b.id, bg: of(b.bgs), streetType: of(b.streets),
    cash: money(span(b.cash)), units: Math.round(span(b.units)), debt,
    gen: b.gen, genCond: b.genCond, fuel: b.fuel, inverter: b.inverter, relBonus: b.relBonus, trust: b.trust,
  };
}

/** Put a rolled birth onto the fresh game state (after the look and traits are copied over). */
export function applyBirth(p: BirthPack): void {
  G.birth = p.birth; G.bg = p.bg; G.streetType = p.streetType;
  G.streetName = STREET_TYPES.find((s) => s.id === p.streetType)?.n ?? 'Your Street';
  G.cash = p.cash; G.meterUnits = p.units; G.debt = p.debt;
  G.gen = p.gen; G.genCond = p.genCond; G.fuel = p.fuel; G.genOn = false;
  G.inverter = p.inverter; if (p.inverter) G.invCharge = 80;
  G.trust = p.trust;
  if (p.relBonus) G.npcs.forEach((n) => { n.rel = clamp(n.rel + p.relBonus, 0, 100); });
  G.week.startCash = G.cash;
}

/** The background the roll landed on, for the reveal card. */
export const bgName = (id: string): string => BGS.find((b) => b.id === id)?.n ?? '';

/** Every morning: interest on what you owe. */
export function debtNewDay(): void {
  if (G.debt <= 0) return;
  const add = Math.max(50, Math.round(G.debt * DEBT_RATE));
  G.debt += add;
  toast(`💳 Your debt grew by ₦${fmt(add)} to <b>₦${fmt(G.debt)}</b>. Pay it off in the Wallet app.`, 'bad');
}

/** Pay back up to `amount` (or all of it). Returns what was paid. */
export function payDebt(amount = Infinity): number {
  const pay = Math.floor(Math.min(amount, G.debt, Math.max(0, G.cash)));
  if (pay <= 0) { toast(G.debt <= 0 ? 'You don\'t owe anything.' : 'Not enough cash to pay right now.', 'bad'); return 0; }
  addCash(-pay, 'Debt repayment'); G.debt -= pay;
  if (G.debt <= 0) G.flags.debtCleared = true;
  toast(G.debt <= 0 ? '🎉 <b>Debt cleared!</b> You owe nobody now.' : `💳 Paid ₦${fmt(pay)}. Still owing ₦${fmt(G.debt)}.`, 'sys');
  checkAch(); updHUD();
  return pay;
}
