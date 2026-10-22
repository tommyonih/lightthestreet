/* Online deals and Verispon escrow. Sellers on WhatsApp/Instagram are cheaper than the shop, but some never deliver.
   Pay direct and a scammer keeps your money; pay with Verispon and the money waits in escrow — released to the seller
   when your item lands, refunded to you if it never does. All game money, like everything else. */
import { G, T, save } from '../core/state';
import { fmt, seededRng } from '../core/util';
import { sfx } from '../core/audio';
import type { Order } from '../core/types';
import { SELLERS, SHOP } from '../data/content';
import { openModal } from '../ui/modal';
import { toast } from '../ui/toast';
import { updHUD } from '../ui/hud';
import { addCash, grantItem, itemPrice, partnerLink } from './economy';
import { mood } from './helpers';
import { checkAch } from './progress';

/** Verispon's fee in the game: 2%, at least ₦100. */
export const escrowFee = (price: number): number => Math.max(100, Math.round(price * .02 / 50) * 50);
/** Items sellers offer online (not fuel: nobody DMs you petrol… hopefully). */
const DEAL_ITEMS = ['lamp', 'powerbank', 'fan', 'fridge', 'gen2', 'inverter'];

export interface Deal { key: string; item: string; price: number; seller: string; honest: boolean; blurb: string }

/** Today's two online deals: the same all day, different tomorrow. About 4 in 10 sellers are scammers. */
export function todaysDeals(day = G.day): Deal[] {
  const rng = seededRng('deals' + day);
  return [0, 1].map((k) => {
    const item = DEAL_ITEMS[Math.floor(rng() * DEAL_ITEMS.length)];
    const price = Math.round(itemPrice(item) * (.62 + rng() * .1) / 50) * 50;
    return { key: `deal${day}-${k}`, item, price, seller: SELLERS[Math.floor(rng() * SELLERS.length)], honest: rng() > .4,
      blurb: rng() < .5 ? '"Brand new, still in the box. Pay first, I ship today."' : '"Last one left! Send the money now and I’ll hold it for you."' };
  });
}
/** Each deal can be taken once (it's gone from the seller's page after). */
export const dealTaken = (d: Deal): boolean => (G.flags.did?.[d.key] ?? -1) === G.day;

/** Delivery takes 3–6 game hours. */
const DELIVERY = [180, 360];

/** Buy a deal: straight to the seller, or through Verispon escrow. */
export function payDeal(d: Deal, via: 'direct' | 'verispon'): boolean {
  const fee = via === 'verispon' ? escrowFee(d.price) : 0, total = d.price + fee;
  if (G.cash < total) { toast(`💸 You don’t have ₦${fmt(total)}.`, 'bad'); return false; }
  const name = SHOP.find((s) => s.id === d.item)!.n;
  addCash(-total, via === 'verispon' ? `${name} — held in Verispon escrow` : `${name} — paid ${d.seller} direct`);
  (G.flags.did ??= {})[d.key] = G.day;
  const until = T() + DELIVERY[0] + Math.random() * (DELIVERY[1] - DELIVERY[0]);
  const o: Order = { item: d.item, price: d.price, fee, seller: d.seller, via, honest: d.honest, until };
  G.orders.push(o); sfx.cash();
  toast(via === 'verispon'
    ? `🛡️ Verispon is holding your ₦${fmt(d.price)}. ${d.seller} only gets paid when your ${name} arrives.`
    : `📲 You sent ₦${fmt(d.price)} to ${d.seller}. "Thanks dear, it will reach you today." Hmm.`, 'sys');
  save(); updHUD(); return true;
}

/** The deal sheet: the same choice the street event offers. */
export function dealModal(d: Deal, title = `📦 ${d.seller}`): void {
  const it = SHOP.find((s) => s.id === d.item)!, fee = escrowFee(d.price), real = partnerLink('verispon', 'Verispon for real deals');
  openModal(title, `<b>${it.n}</b> for <b>₦${fmt(d.price)}</b> <span style="color:var(--dim)">(shop price ₦${fmt(itemPrice(d.item))})</span><br><i>${d.blurb}</i><br><br><span style="font-size:12px;color:var(--dim)">You can’t see the seller. Pay them directly and hope, or pay with Verispon: your money waits in escrow until the item arrives, and you get a refund if it doesn’t.</span>${real ? `<br><span style="font-size:12px;color:var(--dim)">${real}. Separate and optional, not part of the game.</span>` : ''}`, [
    { t: `🛡️ Pay with Verispon: ₦${fmt(d.price + fee)}`, sub: `₦${fmt(fee)} escrow fee. Your money is safe until delivery.`, dis: G.cash < d.price + fee, fn: () => { payDeal(d, 'verispon'); } },
    { t: `📲 Pay the seller directly: ₦${fmt(d.price)}`, sub: 'Cheaper… if the seller is real.', dis: G.cash < d.price, fn: () => { payDeal(d, 'direct'); } },
    { t: 'Leave it' },
  ]);
}

/** Called every sim tick: orders that are due either land or reveal a scammer. */
export function ordersTick(): void {
  if (!G.orders.length) return;
  const now = T(), due = G.orders.filter((o) => now >= o.until);
  if (!due.length) return;
  G.orders = G.orders.filter((o) => now < o.until);
  for (const o of due) {
    const name = SHOP.find((s) => s.id === o.item)!.n;
    if (o.honest) {
      if (o.via === 'verispon') { G.stats.escrowDeals++; toast(`📦 Your ${name} arrived! You confirmed it on Verispon and ${o.seller} got paid. A clean deal.`, 'sys'); }
      else toast(`📦 ${o.seller} actually delivered your ${name}! A real seller. You got lucky.`, 'sys');
      grantItem(o.item);
    } else if (o.via === 'verispon') {
      addCash(o.price + o.fee, `Verispon refund: ${o.seller} never delivered`); sfx.cash();
      toast(`🛡️ ${o.seller} never delivered and blocked you. <b>Verispon refunded your ₦${fmt(o.price + o.fee)}</b>. The scammer got nothing.`, 'sys');
    } else {
      sfx.bad(); mood(-10);
      toast(`🚫 ${o.seller} blocked you. Your ₦${fmt(o.price)} for the ${name} is gone. With Verispon, you’d have been refunded.`, 'bad');
    }
  }
  checkAch(); save(); updHUD();
}
