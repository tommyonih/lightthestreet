import { G, T, save } from '../core/state';
import { chance, fmt } from '../core/util';
import { sfx } from '../core/audio';
import { SHOP } from '../data/content';
import { openModal } from '../ui/modal';
import { toast } from '../ui/toast';
import { updHUD } from '../ui/hud';
import { dayTime, hasTrait } from './helpers';
import { checkAch, checkObj } from './progress';
import { deliveryFee, feeNote } from './world';

export const UNIT_PRICE = 350;

export function addCash(n: number, why: string): void {
  G.cash += n; if (n < 0) G.stats.spent += -n;
  G.log.unshift({ who: '💰 Wallet', txt: `${n >= 0 ? '+' : ''}₦${fmt(n)} — ${why}`, t: dayTime() });
  if (G.log.length > 40) G.log.pop();
}

export function buyUnits(n: number): void {
  const cost = n * UNIT_PRICE;
  openModal('⚡ Buy Virtual Units',
    `Meter: <b>${G.meterNo}</b><br>${n} units × ₦${UNIT_PRICE} (fictional price) = <b>₦${fmt(cost)}</b><br><span style="color:var(--dim);font-size:12px">You have ₦${fmt(G.cash)}. Real NEPA tariffs no concern this game 😄</span>`, [
      { t: `Pay ₦${fmt(cost)}`, dis: G.cash < cost, fn: () => {
        addCash(-cost, `${n} electricity units (virtual)`); sfx.cash();
        if (chance(.08)) { sfx.bad(); toast('❌ Token rejected! "Invalid token." Your money don return sha.', 'bad'); addCash(cost, 'refund — rejected token'); }
        else if (chance(.07)) { G.pendingCredit = { units: n, at: T() + 25 }; toast('⏳ Payment received… but credit never drop yet. "Network dey slow." Wait small!', 'bad'); }
        else loadToken(n);
      } },
      { t: 'Cancel' },
    ]);
}

export function loadToken(n: number): void {
  G.meterUnits += n; toast(`✅ ${n} units loaded! Meter now <b>${G.meterUnits.toFixed(1)}u</b>`, 'sys'); sfx.on(); updHUD();
  if (n >= 5) checkObj('buy');
}

export function itemPrice(id: string): number {
  const it = SHOP.find((s) => s.id === id)!;
  return (id === 'inverter' || id === 'solar') && hasTrait('solar') ? Math.round(it.p * .75) : it.p;
}

export function buyItem(id: string): void {
  const it = SHOP.find((s) => s.id === id)!, fee = deliveryFee(id), p = itemPrice(id) + fee;
  openModal('🛒 ' + it.n, `${it.d}<br><br>Price: <b>₦${fmt(p)}</b> (fictional) ${itemPrice(id) !== it.p ? '<span style="color:var(--green)">— Solar Dreamer discount!</span>' : ''}<br><span style="font-size:12px;color:var(--dim)">${feeNote(id)}</span><br>You have ₦${fmt(G.cash)}.`, [
    { t: `Buy — ₦${fmt(p)}`, dis: G.cash < p, fn: () => {
      addCash(-p, it.n + (fee ? ' + delivery' : '')); sfx.cash();
      if (id === 'fuel3') { G.fuel += 3; toast('⛽ 3 litres fuel added. Keep gen outdoors o!', 'sys'); }
      if (id === 'lamp') { G.lamp = 1; toast('🔦 Rechargeable lamp acquired. Darkness no be your mate again.', 'sys'); }
      if (id === 'powerbank') { G.powerbank = 1; G.pbankCharges = 2; toast('🔋 Power bank! 2 emergency charges per day.', 'sys'); }
      if (id === 'fan') { G.fanRecharge = 1; G.fanBat = 100; toast('🌀 Rechargeable fan! Heat go hear am.', 'sys'); }
      if (id === 'gen2') { G.gen = 2; G.genCond = Math.max(G.genCond, 80); toast('🔌 BIG generator! AC sef fit run… small.', 'sys'); }
      if (id === 'inverter') { G.inverter = 1; toast('🔋 Inverter installed. Silent power, no noise wahala!', 'sys'); }
      if (id === 'solar') { G.solar = 1; G.inverter = 1; toast('☀️ SOLAR INSTALLED! You don escape NEPA premium. Congratulations!!', 'sys'); sfx.cheer(); }
      if (id === 'fridge') { G.fridgeEff = 1; toast('🧊 Efficient fridge — units drain reduce by 40%.', 'sys'); }
      save(); updHUD(); checkAch();
    } },
    { t: 'Later' },
  ]);
}
