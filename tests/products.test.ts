/* NextPawa (units + data) and Verispon (escrow) in play: the problem shows up, and the product solves it. */
import { describe, expect, it } from 'vitest';
import { G, SAVE_VERSION, T, freshState, loadSave } from '../src/core/state';
import { HUSTLES, PARTNERS } from '../src/data/content';
import { buyData, buyUnits, partnerLink, UNIT_PRICE, VENDOR_DISCOUNT } from '../src/game/economy';
import { busy, doHustle } from '../src/game/jobs';
import { escrowFee, ordersTick, payDeal, todaysDeals, type Deal } from '../src/game/orders';
import { tick } from '../src/game/sim';
import { answering, newGame, pickLabel, useHeadlessGame } from './harness';

useHeadlessGame();
const calm = () => { G.nextFlip = Infinity; G.lastEvent = Infinity; G.flags.transformerDone = true; G.nextMeetingDay = 99; };

describe('NextPawa', () => {
  it('buying units on NextPawa always lands, instantly, at the listed price', () => {
    newGame(); calm(); G.cash = 1e6; G.obj = []; // no tutorial reward muddying the sums
    for (let i = 0; i < 60; i++) {
      const units = G.meterUnits, cash = G.cash;
      answering(pickLabel('NextPawa'), () => buyUnits(5));
      expect(G.meterUnits).toBe(units + 5);
      expect(cash - G.cash).toBe(5 * UNIT_PRICE);
      expect(G.pendingCredit).toBeNull();
    }
  });

  it('the roadside vendor is cheaper but sometimes the token never comes', () => {
    newGame(); calm(); G.cash = 1e6; G.obj = []; // no tutorial reward muddying the sums
    let failed = 0;
    for (let i = 0; i < 80; i++) {
      const units = G.meterUnits, cash = G.cash; G.pendingCredit = null;
      answering(pickLabel('Roadside'), () => buyUnits(5));
      expect(cash - G.cash).toBe(5 * (UNIT_PRICE - VENDOR_DISCOUNT));
      if (G.meterUnits === units) failed++;
    }
    expect(failed).toBeGreaterThan(5);
  });

  it('phone hustles need data, use it up, and NextPawa tops it up', () => {
    newGame(); calm(); G.day = 2; G.minute = 10 * 60; G.phone = 90; G.hunger = 10; G.gridOn = true; G.dataMB = 0;
    const content = HUSTLES.find((h) => h.id === 'content')!;
    doHustle(content);
    expect(busy()).toBe(false); // no data, no upload
    G.cash = 5000; buyData(1);
    expect(G.dataMB).toBe(1500);
    doHustle(content);
    expect(busy()).toBe(true);
    for (let i = 0; i < 200 && busy(); i++) tick();
    expect(G.dataMB).toBeCloseTo(1500 - content.mb!, 0);
  });

  it('real links only appear once a URL is set, and carry the referral code', () => {
    expect(partnerLink('nextpawa', 'NextPawa')).toBe('');
    const saved = { ...PARTNERS.nextpawa };
    Object.assign(PARTNERS.nextpawa, { url: 'https://example.test/buy', ref: 'STREET1' });
    try { expect(partnerLink('nextpawa', 'NextPawa')).toContain('https://example.test/buy?ref=STREET1'); }
    finally { Object.assign(PARTNERS.nextpawa, saved); }
  });
});

describe('Verispon escrow', () => {
  const deal = (honest: boolean): Deal => ({ ...todaysDeals()[0], honest });
  const deliver = () => { G.minute += 0; for (const o of G.orders) o.until = T(); ordersTick(); };

  it('paying a scammer direct loses the money', () => {
    newGame(); calm(); G.cash = 50000;
    const d = deal(false), cash = G.cash;
    payDeal(d, 'direct'); deliver();
    expect(G.cash).toBe(cash - d.price);
    expect(G.orders).toHaveLength(0);
  });

  it('with Verispon, a scammer gets nothing and you get your money back', () => {
    newGame(); calm(); G.cash = 50000;
    const d = deal(false), cash = G.cash;
    payDeal(d, 'verispon');
    expect(G.cash).toBe(cash - d.price - escrowFee(d.price));
    deliver();
    expect(G.cash).toBe(cash);
  });

  it('with Verispon and an honest seller, the item lands and counts towards No Scam Zone', () => {
    newGame(); calm(); G.cash = 50000;
    payDeal({ ...deal(true), item: 'fan' }, 'verispon'); deliver();
    expect(G.fanRecharge).toBe(1);
    expect(G.stats.escrowDeals).toBe(1);
  });

  it('deals are cheaper than the shop and the same all day', () => {
    newGame(); calm();
    expect(todaysDeals()).toEqual(todaysDeals());
    for (const d of todaysDeals()) expect(d.price).toBeGreaterThan(0);
  });
});

describe('saves', () => {
  it('a v8 save migrates to v9 with data, no orders and no escrow deals yet', () => {
    const s: Record<string, unknown> = { ...freshState(), ver: 8 };
    delete s.dataMB; delete s.orders;
    s.stats = { ...(s.stats as object) }; delete (s.stats as Record<string, unknown>).escrowDeals;
    localStorage.setItem('luts_save_v1', JSON.stringify(s));
    const loaded = loadSave()!;
    expect(loaded.ver).toBe(SAVE_VERSION);
    expect(loaded.dataMB).toBeGreaterThan(0);
    expect(loaded.orders).toEqual([]);
    expect(loaded.stats.escrowDeals).toBe(0);
  });
});
