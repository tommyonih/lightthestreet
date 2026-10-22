/* The in-game phone: meter, power, street, wallet, shop, hustle, gist and tasks apps. */
import { G, T, hasGame } from '../core/state';
import { $, clamp, fmt } from '../core/util';
import { sfx } from '../core/audio';
import { ACH, BIRTHS, DATA_BUNDLES, DEBT_RATE, HUSTLES, MEMORY, NEWS, SHOP } from '../data/content';
import { payDebt } from '../game/birth';
import { moodLabel, salient } from '../game/memory';
import { whereabouts } from '../game/schedule';
import { ALL_DONE_BONUS, challenge, ensureWeek, progressShare, progressText, weekEndDay } from '../game/challenges';
import { openShareSheet } from './share';
import { buyData, buyItem, buyUnits, dataLabel, itemPrice, loadToken, partnerLink, UNIT_PRICE } from '../game/economy';
import { dealModal, dealTaken, todaysDeals } from '../game/orders';
import { busy, commuting, currentHustle, doHustle, jobProgress, jobStalled } from '../game/jobs';
import { atHome, deliveryFee, npcPlace, place, setWaypoint, travelling, tripMins } from '../game/world';
import { mapView, wireMap } from './map';
import { closeMap, mapOpen, openMap } from './cityMap';
import { genLabel, repairGen, startGen, stopGen } from '../game/generator';
import { npcDef, sunUp } from '../game/helpers';
import { checkObj } from '../game/progress';
import { applianceDrain } from '../game/sim';
import { isHeadless, toast } from './toast';
import { updHUD } from './hud';
import { icon } from './icons';

export type Tab = 'apps' | 'meter' | 'power' | 'street' | 'map' | 'week' | 'wallet' | 'shop' | 'hustle' | 'gist' | 'tasks';
/** The home-screen grid: [tab, label, icon, tile colour]. */
const APPS: [Exclude<Tab, 'apps'>, string, string, string][] = [
  ['meter', 'NextPawa', 'zap', '#ac4fde'], ['power', 'Power', 'plug', '#3f7fd8'], ['street', 'People', 'users', '#8a5cd0'],
  ['map', 'Map', 'map', '#c0612f'], ['week', 'Week', 'trophy', '#d0a52a'], ['wallet', 'Wallet', 'wallet', '#2f9e5a'],
  ['shop', 'Shop', 'cart', '#d0503f'], ['hustle', 'Hustle', 'briefcase', '#4a6a8a'], ['gist', 'News', 'chat', '#2a9ab0'],
  ['tasks', 'Tasks', 'check', '#6a8a3a'],
];
/** Apps with their own slot on the tab bar; the rest light up "Phone". */
const ON_TABBAR: Tab[] = ['meter', 'map', 'apps'];

let curTab: Tab = 'meter';

/** Tutorial objectives with a shortcut to the app that does them: [tab, button label]. */
const TASK_GO: Record<string, [Tab, string]> = {
  meter: ['meter', '⚡ Open'], buy: ['meter', '⚡ Open'], greet: ['street', '👥 People'], visit: ['map', '🗺️ Map'], gen: ['power', '🔌 Power'],
};

function policyList(): string[] {
  const p = G.policies, out: string[] = [];
  if (p.genCurfew) out.push('🔇 Gen curfew 10PM–6AM');
  if (p.maintained) out.push('🔧 Transformer maintenance');
  if (p.security) out.push('🛡️ Night guard');
  if (p.solarHub) out.push('🔌 Charging hub');
  if (p.shameList) out.push('📜 Owing list on gate');
  if (p.petitionDay) out.push(`✍️ Petition pending (Day ${p.petitionDay})`);
  if ((p.betterSupplyUntil ?? 0) >= G.day) out.push(`📨 Better supply till Day ${p.betterSupplyUntil}`);
  return out;
}

export const phoneOpen = (): boolean => !!$('#phone')?.classList.contains('open');

export function openPhone(tab?: Tab): void {
  $('#phone').classList.add('open'); $('#phoneScrim')?.classList.add('open');
  renderPhone(tab || curTab);
  if (curTab === 'meter') checkObj('meter');
}
export function closePhone(): void {
  $('#phone').classList.remove('open'); $('#phoneScrim')?.classList.remove('open'); markTabbar();
}
export function togglePhone(): void { if (phoneOpen()) closePhone(); else openPhone('meter'); }

/** Light up the tab-bar slot for whatever is on screen. */
export function markTabbar(): void {
  const open = phoneOpen(), slot = mapOpen() ? 'map' : !open ? 'home' : ON_TABBAR.includes(curTab) ? curTab : 'apps';
  document.querySelectorAll<HTMLElement>('#tabbar .tbi').forEach((b) => b.classList.toggle('sel', b.dataset.nav === slot));
}

/** Tab-bar tap: "home" closes the sheet, anything else opens (or closes, if already showing) that app. */
export function navTo(slot: string): void {
  if (slot === 'home') { closePhone(); closeMap(); return; }
  if (slot === 'map') { // the 3D city map, full screen; the 2D map in the phone where it can't be drawn
    if (mapOpen()) { closeMap(); return; }
    if (openMap()) { closePhone(); markTabbar(); return; }
  }
  closeMap();
  if (phoneOpen() && curTab === slot) { closePhone(); return; }
  openPhone(slot as Tab);
}

const views: Record<Tab, () => [string, string]> = {
  apps() {
    return ['Apps', `<div class="apps">${APPS.map(([id, n, ic, c]) => `<button class="app" data-app="${id}"><span class="ai" style="background:linear-gradient(160deg,${c},${c}bb)">${icon(ic, 26)}</span>${n}</button>`).join('')}</div>
      <p class="note">Tap houses and neighbours on the street to interact with them.</p>`];
  },
  meter() {
    const drain = applianceDrain(); const minsLeft = drain > 0 ? G.meterUnits / drain : Infinity;
    let h = `<div style="text-align:center;padding:6px 0">
      <div style="font-size:34px;font-weight:800;color:${G.meterUnits < 4 ? 'var(--red)' : 'var(--green)'}">${G.meterUnits.toFixed(1)}<span style="font-size:15px"> units</span></div>
      <div style="font-size:12px;color:var(--dim)">Meter No: ${G.meterNo}</div></div>
      <div class="stat"><span>Current load</span><b>${drain.toFixed(3)}u/min</b></div>
      <div class="stat"><span>Estimated time left</span><b>${minsLeft === Infinity ? '—' : Math.floor(minsLeft / 60) + 'h ' + Math.round(minsLeft % 60) + 'm'}</b></div>
      <div class="stat"><span>Token credit status</span><b>${G.pendingCredit ? '⏳ Pending…' : '✅ Active'}</b></div>`;
    if (G.meterUnits < 4) h += `<div class="warnbox">⚠️ Low credit! Your power could cut out at any moment. Buy units now.</div>`;
    if (!G.gridOn) h += `<div class="warnbox">The grid is off. Units you buy now will work as soon as power returns.</div>`;
    h += `<div class="npBrand"><b>⚡ NextPawa</b><span>Units and data. Instant token, receipt every time.</span></div>`;
    h += [5, 10, 20].map((n, i) => `<button class="btn ${i === 0 ? 'primary ' : ''}small" data-buy="${n}">Buy ${n} units: ₦${fmt(n * UNIT_PRICE)}</button>`).join('');
    h += `<label class="lbl">Mobile data · you have ${dataLabel()}</label>`;
    if (G.dataMB < 150) h += `<div class="warnbox">📶 Low data! POS, deliveries, skits and online gigs need data. Top up here.</div>`;
    h += `<div class="row">${DATA_BUNDLES.map((b, i) => `<button class="btn small" data-data="${i}" ${G.cash < b.p ? 'disabled' : ''}>${b.n}<div class="evSub">₦${fmt(b.p)}</div></button>`).join('')}</div>`;
    h += `<label class="lbl">Load a promo token (once a day)</label>
        <input class="txt" id="tokIn" maxlength="14" placeholder="e.g. 5812-4470-9921">
        <button class="btn small" id="tokGo">Load token</button>`;
    const realPurchases = [
      partnerLink('nextpawa', 'electricity', 'electricity'),
      partnerLink('nextpawa', 'data', 'data'),
    ].filter(Boolean).join(' · ');
    h += `<p class="note">Everything here uses game money. No real payments.${realPurchases ? `<br>Buying for real? ${realPurchases}. Separate and optional.` : ''}</p>`;
    return ['⚡ NextPawa', h];
  },
  power() {
    let h = `<div class="stat"><span>Grid (NEPA)</span><b style="color:${G.gridOn ? 'var(--green)' : 'var(--red)'}">${G.gridOn ? 'ON' : 'OFF'}</b></div>
      <div class="stat"><span>Generator</span><b>${G.gen === 0 ? 'None' : genLabel() + ' • ' + Math.round(G.genCond) + '%'}</b></div>
      <div class="stat"><span>Fuel ⛽</span><b>${G.fuel.toFixed(1)}L</b></div>
      <div class="stat"><span>Status</span><b>${G.genOn ? '🔊 Running' : 'Off'}</b></div>`;
    if (G.inverter > 0) h += `<div class="stat"><span>Inverter charge 🔋</span><b>${Math.round(G.invCharge)}%</b></div>`;
    if (G.solar > 0) h += `<div class="stat"><span>Solar ☀️</span><b>${sunUp() ? 'Generating' : 'Idle (no sun)'}</b></div>`;
    if (G.fanRecharge > 0) h += `<div class="stat"><span>Rechargeable fan 🌀</span><b>${Math.round(G.fanBat)}%</b></div>`;
    if (G.powerbank > 0) h += `<div class="stat"><span>Power bank</span><b>${G.pbankCharges} charge(s) today</b></div>
      <button class="btn small" id="pBank" ${G.pbankCharges > 0 && G.phone < 90 ? '' : 'disabled'}>🔋 Charge phone from power bank (+40%)</button>`;
    if (G.lamp > 0) h += `<div class="stat"><span>Rechargeable lamp 🔦</span><b>Ready</b></div>`;
    h += `<div class="okbox">💡 Appliances: Fan ${G.fanOn ? '✅' : '❌'} · TV ${G.tvOn ? '✅' : '❌'} · Fridge ${G.fridgeOn ? '✅' : '❌'}. Tap your house on the street to switch them.</div>
      ${atHome() ? '' : '<div class="warnbox">🏠 You’re not home. The generator and appliances will wait until you are.</div>'}
      <button class="btn primary small" id="pGen" ${atHome() ? '' : 'disabled'}>${G.genOn ? '⏹ Stop generator' : '▶ Start generator'}</button>
      <button class="btn small" id="pRepair">🔧 Service the generator (₦1,500)</button>
      <p class="note">Safety: generators always stay outdoors, away from windows.<br><b>Generator fumes can kill.</b> Carbon monoxide has no colour or smell. Never run one inside a house, shop or garage.</p>`;
    return ['🔌 Power', h];
  },
  street() {
    let h = `<div class="stat"><span>Street fund 💰</span><b>₦${fmt(G.fund)} / ₦${fmt(G.fundGoal)}</b></div>
      <div class="stat"><span>Community trust</span><b>${Math.round(G.trust)}%</b></div>
      <div class="stat"><span>Streetlight</span><b>${G.streetlightFixed ? '💡 Fixed!' : '🔧 Broken'}</b></div>`;
    if (G.fund > 0 && G.fund < G.fundGoal) h += `<div class="warnbox">${G.owing.length} house(s) haven’t paid: ${G.owing.map((id) => npcDef(id).name).join(', ') || '—'}</div>`;
    if (G.streetlightFixed) h += `<div class="okbox">The streetlight shines every night. Community goal complete: Chairman Material! 🎖️</div>`;
    h += `<label class="lbl">Street meetings</label>
      <div class="stat"><span>Chairman</span><b>${G.policies.youChair ? '🎖️ You' : 'Chairman Dele'}</b></div>
      <div class="stat"><span>Next meeting</span><b>Day ${G.nextMeetingDay}, 6–9PM</b></div>`;
    const rules = policyList();
    h += rules.length ? `<div class="okbox">📜 Street rules: ${rules.join(' • ')}</div>` : `<div class="gistline"><i>No street rules passed yet.</i></div>`;
    h += G.meetings.slice(0, 5).map((r) => `<div class="gistline"><i>Day ${r.day}</i> — ${r.title}: <b style="color:${r.passed ? 'var(--green)' : 'var(--red)'}">${r.passed ? 'PASSED' : 'FAILED'}</b> ${r.yes}–${r.no} <span style="color:var(--dim)">(you: ${r.you})</span></div>`).join('');
    h += `<label class="lbl">Neighbours</label>`;
    G.npcs.forEach((n) => {
      const d = npcDef(n.id), w = whereabouts(n.id), feel = moodLabel(n.id), m = salient(n.id), at = npcPlace(n.id);
      // "Find" for anyone who's somewhere on the map other than where you are
      const find = at && !(at === G.loc && !G.trip) && w.at !== 'in' && G.unlocked.includes(at)
        ? ` <button class="pinBtn${G.waypoint === 'npc:' + n.id ? ' on' : ''}" data-find="${n.id}">📌 Find</button>` : '';
      h += `<div class="stat"><span>${d.name} <i style="color:var(--dim);font-size:11px">${d.role}</i>${n.owing ? ' <b style="color:var(--red)">OWES</b>' : ''}${find}</span><b>♥${Math.round(n.rel)}</b></div>
        <div style="font-size:11px;color:var(--dim);margin:-4px 0 6px 4px">${w.at === 'out' ? (w.place ? `📍 ${place(w.place).n} ·` : '🚶') : w.at === 'in' ? '🏠' : '📍'} ${w.act}${feel ? ' • ' + feel : ''}${m ? ` • remembers ${MEMORY[m.kind].note} (Day ${m.day})` : ''}</div>`;
    });
    h += `<p class="note">Tap neighbours on the street to chat, help them, or ask for favours.</p>`;
    return ['🏘️ People', h];
  },
  week() {
    ensureWeek();
    const w = G.week, left = weekEndDay(w.n) - G.day;
    let h = `<div style="text-align:center;padding:4px 0 8px"><div style="font-size:22px;font-weight:800;color:var(--amber)">Week ${w.n}</div>
      <div style="font-size:12px;color:var(--dim)">${left > 0 ? left + ' day(s) left' : 'Last day!'} • finish all 3 for +₦${fmt(ALL_DONE_BONUS)} bonus</div></div>`;
    w.list.forEach((item) => {
      const c = challenge(item.id), pct = Math.round(progressShare(item.id) * 100);
      const bar = item.state === 'done' ? 'var(--green)' : item.state === 'failed' ? 'var(--red)' : 'var(--amber)';
      h += `<div class="stat" style="flex-direction:column;gap:4px"><span><b>${c.title}</b> <span style="color:var(--green);font-size:12px">+₦${fmt(c.reward)}</span></span>
        <span style="font-size:12px;color:var(--dim)">${c.desc}</span>
        <div style="height:7px;background:var(--panel2);border-radius:9px;overflow:hidden"><div style="height:100%;width:${item.state === 'failed' ? 100 : pct}%;background:${bar}"></div></div>
        <span style="font-size:12px">${progressText(item.id, item.state)}</span></div>`;
    });
    if (G.weekHistory.length) {
      h += `<label class="lbl">Past weeks</label>` + G.weekHistory.slice(0, 6).map((r) => `<div class="gistline">Week ${r.n}: ${'★'.repeat(r.done)}${'☆'.repeat(r.total - r.done)} ${r.done}/${r.total}</div>`).join('');
    }
    h += `<button class="btn small" id="pShareCard">🖼️ Make my street card</button>`;
    return ['🏆 Weekly Challenges', h];
  },
  wallet() {
    let h = `<div style="text-align:center;padding:8px 0"><div style="font-size:30px;font-weight:800;color:var(--ink)">₦${fmt(G.cash)}</div>
      <div style="font-size:11.5px;color:var(--dim)">Game money. Not real naira, and it can't be cashed out.</div></div>`;
    if (G.birth) h += `<div class="stat"><span>Born</span><b>${BIRTHS[G.birth].emoji} ${BIRTHS[G.birth].n}</b></div>`;
    if (G.debt > 0) {
      h += `<div class="warnbox">💳 You owe <b>₦${fmt(G.debt)}</b>. It grows by ${Math.round(DEBT_RATE * 100)}% every morning.</div>
        <div class="row"><button class="btn small" id="payDebt1" ${G.cash < 1 ? 'disabled' : ''}>Pay ₦${fmt(Math.min(1000, G.debt))}</button>
        <button class="btn small primary" id="payDebtAll" ${G.cash < 1 ? 'disabled' : ''}>Pay ₦${fmt(Math.min(G.debt, Math.max(0, G.cash)))}${G.cash >= G.debt ? ' (all)' : ''}</button></div>`;
    } else if (G.flags.debtCleared) h += `<div class="okbox">🎉 Debt free. You owe nobody.</div>`;
    h += `<label class="lbl">Recent transactions</label>`;
    h += G.log.slice(0, 12).map((l) => `<div class="gistline"><i>${l.t}</i> — ${l.txt}</div>`).join('') || '<div class="gistline">No transactions yet.</div>';
    return ['💰 Wallet', h];
  },
  shop() {
    let h = `<p class="note" style="margin-top:0">All prices are made up. Solar Dreamers get 25% off power gear. Buy at the Market (fuel at the Fuel Station) to skip delivery.</p>`;
    SHOP.forEach((it) => {
      const p = itemPrice(it.id), fee = deliveryFee(it.id);
      h += `<button class="btn small" data-shop="${it.id}">${it.n} — ₦${fmt(p + fee)}<div class="evSub">${it.d}${p !== it.p ? ' (discount!)' : ''}${fee ? ` · incl. ₦${fee} delivery` : ' · no delivery fee'}</div></button>`;
    });
    // online deals: cheaper, riskier — Verispon escrow is the safe way to pay
    h += `<label class="lbl">📲 Online deals today</label><div class="npBrand vs"><b>🛡️ Verispon escrow</b><span>Your money waits safely until your item arrives. No delivery? Full refund.</span></div>`;
    todaysDeals().forEach((d, k) => {
      const it = SHOP.find((s) => s.id === d.item)!, taken = dealTaken(d);
      h += `<button class="btn small" data-deal="${k}" ${taken ? 'disabled' : ''}>${it.n} — ₦${fmt(d.price)} <span style="color:var(--green)">(-${Math.round((1 - d.price / itemPrice(d.item)) * 100)}%)</span><div class="evSub">${taken ? 'You already ordered this' : `${d.seller} · ${d.blurb}`}</div></button>`;
    });
    if (G.orders.length) h += `<label class="lbl">On the way</label>` + G.orders.map((o) => `<div class="gistline">📦 ${SHOP.find((s) => s.id === o.item)!.n} from ${o.seller} — ${o.via === 'verispon' ? '🛡️ Verispon holding ₦' + fmt(o.price) : '📲 paid direct'} · due in ~${Math.max(1, Math.round((o.until - T()) / 60))}h</div>`).join('');
    return ['🛒 Shop', h];
  },
  hustle() {
    let h = `<p class="note" style="margin-top:0">Earn game money. Some hustles need power (grid, generator, inverter or solar).${G.bg === 'business' ? ' Business owner: +10% pay, and your shop sells while the power is on.' : ''}</p>`;
    const job = currentHustle();
    if (job) h += `<div class="okbox"><b>${job.verb}</b> — ${commuting() ? `🚶 walking to ${place(job.place).n}…` : jobStalled() ? '⏳ waiting for power…' : Math.round(jobProgress() * 100) + '% done'}<div style="height:7px;background:var(--panel2);border-radius:9px;overflow:hidden;margin-top:6px"><div style="height:100%;width:${Math.round(jobProgress() * 100)}%;background:var(--green)"></div></div></div>`;
    HUSTLES.forEach((x) => {
      const cd = Math.max(0, (G.hustleCd[x.id] || 0) - T());
      const wait = cd >= 60 ? Math.floor(cd / 60) + 'h ' + Math.round(cd % 60) + 'm' : Math.ceil(cd) + ' min';
      const where = `📍 ${place(x.place).n}${G.loc === x.place && !G.trip ? ' (you’re here)' : ` · ${tripMins(G.loc, x.place, 'walk')} min walk`}`;
      h += `<button class="btn small" data-hustle="${x.id}" ${cd > 0 || busy() || travelling() ? 'disabled' : ''}>${x.n} — ₦${x.pay[0]}–${x.pay[1]}${x.need === 'any' ? ' ⚡needs power' : ''}${x.phone ? ' 📱' : ''}${x.mb ? ` 📶${dataLabel(x.mb)}` : ''}<div class="evSub">${cd > 0 ? 'Ready in ' + wait + ' (game time)' : x.d} • takes ~${x.mins / 60}h<br>${where}</div></button>`;
    });
    return ['💼 Hustles', h];
  },
  gist() {
    let h = `<div class="newsbox">📰 <b>Street News:</b> ${NEWS[G.day % NEWS.length]}</div>
      <label class="lbl">Around the compound</label>`;
    h += G.log.slice(0, 15).map((l) => `<div class="gistline"><i>${l.t}</i> — ${l.txt}</div>`).join('') || '<div class="gistline">All quiet on the street. For now.</div>';
    return ['💬 News', h];
  },
  map: mapView,
  tasks() {
    let h = `<label class="lbl">Getting started (with rewards)</label>`;
    G.obj.forEach((o) => {
      const go = !o.done && TASK_GO[o.id] ? ` <button class="pinBtn" data-go="${TASK_GO[o.id][0]}">${TASK_GO[o.id][1]}</button>` : '';
      h += `<div class="stat"><span>${o.done ? '✅' : '⬜'} ${o.t}${go}</span><b>₦${o.rw}</b></div>`;
    });
    h += `<label class="lbl">Achievements (${G.ach.length}/${ACH.length})</label>`;
    ACH.forEach((a) => {
      const got = G.ach.includes(a.id);
      h += `<div class="stat"><span style="${got ? '' : 'color:var(--dim)'}">${got ? a.n : '🔒 ' + a.n}</span></div><div style="font-size:11px;color:var(--dim);margin:-4px 0 6px 4px">${a.d}</div>`;
    });
    return ['✅ Tasks', h];
  },
};

export function renderPhone(tab?: Tab): void {
  if (!hasGame() || isHeadless() || !$('#phoneBody')) return;
  const prev = curTab; curTab = tab || curTab;
  markTabbar();
  $('#phoneBack').classList.toggle('show', curTab !== 'apps' && !ON_TABBAR.includes(curTab));
  const [title, html] = views[curTab]();
  $('#phoneTitle').textContent = title.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '');
  const b = $('#phoneBody'); b.innerHTML = html;
  if (prev !== curTab) { b.classList.remove('swap'); void b.offsetWidth; b.classList.add('swap'); b.scrollTop = 0; }
  const on = (sel: string, fn: () => void) => { const e = b.querySelector<HTMLElement>(sel); if (e) e.onclick = fn; };
  b.querySelectorAll<HTMLElement>('[data-app]').forEach((e) => {
    e.onclick = () => { const t = e.dataset.app as Tab; if (t === 'map') { navTo('map'); return; } renderPhone(t); if (t === 'meter') checkObj('meter'); };
  });
  b.querySelectorAll<HTMLElement>('[data-buy]').forEach((e) => { e.onclick = () => buyUnits(Number(e.dataset.buy)); });
  on('#pGen', () => { if (G.genOn) stopGen(); else startGen(); renderPhone(); });
  on('#pBank', () => {
    if (G.pbankCharges <= 0) return;
    G.pbankCharges--; G.phone = clamp(G.phone + 40, 0, 100); sfx.on(); toast('🔋 Power bank used. Phone +40%.', 'sys'); updHUD(); renderPhone();
  });
  on('#pRepair', repairGen);
  on('#payDebt1', () => { payDebt(1000); renderPhone(); });
  on('#payDebtAll', () => { payDebt(); renderPhone(); });
  on('#pShareCard', () => openShareSheet({ kind: 'session' }));
  on('#tokGo', () => {
    const v = (b.querySelector<HTMLInputElement>('#tokIn')?.value || '').replace(/\D/g, '');
    if (v.length < 10) { toast('❌ Invalid token. The meter couldn’t read it.', 'bad'); return; }
    if (G.flags.tokDay === G.day) { toast('⏳ You’ve already used a promo token today.', 'bad'); return; }
    G.flags.tokDay = G.day; loadToken(3); toast('🎟️ Promo token accepted: +3 units!', 'sys');
  });
  b.querySelectorAll<HTMLElement>('[data-shop]').forEach((e) => { e.onclick = () => buyItem(e.dataset.shop!); });
  b.querySelectorAll<HTMLElement>('[data-data]').forEach((e) => { e.onclick = () => { buyData(Number(e.dataset.data)); renderPhone(); }; });
  b.querySelectorAll<HTMLElement>('[data-deal]').forEach((e) => { e.onclick = () => dealModal(todaysDeals()[Number(e.dataset.deal)]); });
  b.querySelectorAll<HTMLElement>('[data-hustle]').forEach((e) => { e.onclick = () => doHustle(HUSTLES.find((x) => x.id === e.dataset.hustle)!); });
  if (curTab === 'map') wireMap(b, () => renderPhone());
  b.querySelectorAll<HTMLElement>('[data-find]').forEach((e) => {
    e.onclick = () => { const w = `npc:${e.dataset.find}` as const; setWaypoint(G.waypoint === w ? null : w); };
  });
  b.querySelectorAll<HTMLElement>('[data-go]').forEach((e) => { e.onclick = () => renderPhone(e.dataset.go as Tab); });
}
