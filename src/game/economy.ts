import { G, T, save } from '../core/state';
import { chance, fmt } from '../core/util';
import { sfx } from '../core/audio';
import { DATA_BUNDLES, PARTNERS, SHOP, type PartnerId } from '../data/content';
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

/** The roadside vendor knocks a little off — and sometimes the token "no gree enter". NextPawa never does. */
export const VENDOR_DISCOUNT = 20;

/** A real, optional link to one of our products (with the referral code), or '' if its URL isn't set yet. */
export function partnerLink(id: PartnerId, text: string, destination?: 'electricity' | 'data'): string {
  const p = PARTNERS[id];
  const baseUrl = destination === 'electricity' ? p.electricityUrl
    : destination === 'data' ? p.dataUrl
      : p.url;
  if (!baseUrl) return '';
  const url = p.ref ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}ref=${encodeURIComponent(p.ref)}` : baseUrl;
  return `<a class="realLink" href="${url}" target="_blank" rel="noopener">${text} ↗</a>`;
}
/** The line under every in-game NextPawa purchase: the real thing, separate and optional. */
const realNextPawa = (): string => {
  const a = partnerLink('nextpawa', 'Buy electricity on NextPawa', 'electricity');
  return a ? `<br><span style="font-size:12px;color:var(--dim)">Need power in real life too? ${a}. Separate and optional, not part of the game.</span>` : '';
};

export function buyUnits(n: number): void {
  const cost = n * UNIT_PRICE, vendor = n * (UNIT_PRICE - VENDOR_DISCOUNT);
  openModal('⚡ Buy Units',
    `Meter: <b>${G.meterNo}</b> · ${n} units (game money)<br><span style="color:var(--dim);font-size:12px">You have ₦${fmt(G.cash)}. All prices are made up.</span>${realNextPawa()}`, [
      { t: `⚡ Pay with NextPawa: ₦${fmt(cost)}`, sub: 'Instant token, receipt on your phone.', dis: G.cash < cost, fn: () => {
        addCash(-cost, `${n} units via NextPawa`); sfx.cash(); loadToken(n);
        toast(`🧾 NextPawa receipt: ${n} units → meter ${G.meterNo.slice(-4).padStart(G.meterNo.length, '•')}. Done in seconds.`, 'sys');
      } },
      { t: `🧍 Roadside vendor: ₦${fmt(vendor)}`, sub: 'A little cheaper. It might not work.', dis: G.cash < vendor, fn: () => {
        addCash(-vendor, `${n} units from roadside vendor`); sfx.cash();
        if (chance(.18)) { sfx.bad(); toast('❌ Token rejected: "Invalid token." The vendor blames your meter. Your money is gone. Next time, use NextPawa.', 'bad'); }
        else if (chance(.2)) { G.pendingCredit = { units: n, at: T() + 60 }; toast('⏳ Vendor: "It has gone through, just wait." The credit hasn’t arrived… "The network is slow."', 'bad'); }
        else loadToken(n);
      } },
      { t: 'Cancel' },
    ]);
}

/** Mobile data on NextPawa: instant, like the units. */
export function buyData(i: number): void {
  const b = DATA_BUNDLES[i]; if (!b) return;
  if (G.cash < b.p) { toast(`💸 You need ₦${fmt(b.p)} for ${b.n} of data.`, 'bad'); return; }
  addCash(-b.p, `${b.n} data via NextPawa`); G.dataMB += b.mb; sfx.on();
  toast(`📶 NextPawa: ${b.n} of data added. Your phone hustles can run again.`, 'sys'); save(); updHUD();
}
export const dataLabel = (mb = G.dataMB): string => (mb >= 1000 ? (mb / 1000).toFixed(1) + 'GB' : Math.max(0, Math.round(mb)) + 'MB');

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
  openModal('🛒 ' + it.n, `${it.d}<br><br>Price: <b>₦${fmt(p)}</b> (made-up price) ${itemPrice(id) !== it.p ? '<span style="color:var(--green)">Solar Dreamer discount!</span>' : ''}<br><span style="font-size:12px;color:var(--dim)">${feeNote(id)}</span><br>You have ₦${fmt(G.cash)}.`, [
    { t: `Buy: ₦${fmt(p)}`, dis: G.cash < p, fn: () => { addCash(-p, it.n + (fee ? ' + delivery' : '')); sfx.cash(); grantItem(id); } },
    { t: 'Later' },
  ]);
}

/** What having an item does. Used by the shop and by online orders when they arrive. */
export function grantItem(id: string): void {
  if (id === 'fuel3') { G.fuel += 3; toast('⛽ 3 litres of fuel added. Keep the generator outdoors!', 'sys'); }
  if (id === 'lamp') { G.lamp = 1; toast('🔦 Rechargeable lamp bought. No more sitting in the dark.', 'sys'); }
  if (id === 'powerbank') { G.powerbank = 1; G.pbankCharges = 2; toast('🔋 Power bank bought! 2 emergency charges a day.', 'sys'); }
  if (id === 'fan') { G.fanRecharge = 1; G.fanBat = 100; toast('🌀 Rechargeable fan bought! Take that, heat.', 'sys'); }
  if (id === 'gen2') { G.gen = 2; G.genCond = Math.max(G.genCond, 80); toast('🔌 Big generator bought! It runs everything.', 'sys'); }
  if (id === 'inverter') { G.inverter = 1; toast('🔋 Inverter installed. Silent backup power, no noise.', 'sys'); }
  if (id === 'solar') { G.solar = 1; G.inverter = 1; toast('☀️ Solar installed! You’re free from the grid in the daytime. Congratulations!', 'sys'); sfx.cheer(); }
  if (id === 'fridge') { G.fridgeEff = 1; toast('🧊 Efficient fridge installed. Your appliances use 40% less.', 'sys'); }
  save(); updHUD(); checkAch();
}
