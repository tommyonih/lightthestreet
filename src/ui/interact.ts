/* Clicking things on the street: neighbours, your house, the meter box and the gen shed. */
import { G, hasGame, save } from '../core/state';
import { chance, clamp, fmt, pick } from '../core/util';
import { sfx } from '../core/audio';
import type { Choice } from '../core/types';
import { addCash } from '../game/economy';
import { addFund, payOwnShare, SHARE } from '../game/fund';
import { genLabel, repairGen, startGen, stopGen } from '../game/generator';
import { fun, npcDef, npcState, powered, rel } from '../game/helpers';
import { checkAch, checkObj } from '../game/progress';
import { moodLabel, recallLine, remember } from '../game/memory';
import { whereabouts } from '../game/schedule';
import { atHome, doPlaceAction, needHome } from '../game/world';
import type { Hit } from '../render3d/space';
import { HOUSE_Y, LH, PLAYER_HOUSE, npcAt, toStreet } from '../render/street';
import { modalOpen, openModal } from './modal';
import { openPhone, type Tab } from './phone';
import { toast } from './toast';
import { updHUD } from './hud';

export function initStreetClicks(canvas: HTMLCanvasElement): void {
  canvas.addEventListener('click', (e) => {
    if (!hasGame() || modalOpen || !atHome()) return; // away: the place card covers the street
    const { x, y } = toStreet(e);
    const px = PLAYER_HOUSE.x + PLAYER_HOUSE.w;
    const hit = npcAt(x, y); // where neighbours are actually drawn, including while walking
    if (hit) { npcClick(hit); return; }
    if (x > px - 8 && x < px + 12 && y > HOUSE_Y + 48 && y < HOUSE_Y + 80) { openPhone('meter'); return; }
    if (G.gen > 0 && x > px + 6 && x < px + 62 && y > LH - 212 && y < LH - 160) { genPanel(); return; }
    if (x > PLAYER_HOUSE.x && x < px + 64 && y > LH - 306 && y < LH - 160) housePanel();
  });
}

/** A tap on the 3D street: the same panels as the 2D street. */
export function streetHit(h: Hit): void {
  if (!hasGame() || modalOpen) return;
  if (h.kind === 'npc') npcClick(h.id);
  else if (h.kind === 'act') doPlaceAction(h.id); // a stall, a door, the okada park: the place card's own actions
  else if (h.kind === 'app') openPhone(h.tab as Tab);
  else if (h.kind === 'meter') openPhone('meter');
  else if (h.kind === 'gen') genPanel();
  else housePanel();
}

const GIST: Record<string, string> = {
  gist: 'Aunty Caro don hear say the NEPA oga for this area dey plan "load shedding premium". Her source? "My cousin cousin."',
  chairman: '"Meeting go hold soon. Bring your own chair — and your own opinion."',
  solar: '"Sun na free fuel o. The day I buy solar, wahala reduce by 70%."',
  elder: '"For 1987, we dey take lantern read. Una dey enjoy o — even blackout get backup!"',
  barber: '"My clipper, my fan, my TV — all of dem dey cry for light. Barber wey no get light na hairdresser."',
};

let talking: string | null = null;
/** Whose panel is open right now (the 3D view turns them to face you and moves their mouth). */
export const talkingTo = (): string | null => (modalOpen ? talking : null);

export function npcClick(id: string): void {
  const d = npcDef(id), st = npcState(id); st.met = true; checkObj('greet'); talking = id;
  const memory = chance(.6) ? recallLine(id) : null;
  const line = memory ?? (!G.gridOn ? pick(d.off) : (G.meterUnits < 4 ? pick(['Your meter dey cry o. I hear am beep.', 'Buy units before NEPA shame you!']) : pick(chance(.4) ? d.on : d.greet)));
  const greeted = st.greetDay === G.day;
  const choices: Choice[] = [
    { t: '🤝 Greet am well', sub: greeted ? 'You don greet am today' : '', fn: () => {
      if (greeted) { toast(`💬 ${d.name}: “We don greet today na. You wan borrow something?”`, 'npc'); return; }
      st.greetDay = G.day; rel(id, 4); if (!G.week.c.greeted.includes(id)) G.week.c.greeted.push(id); toast(`💬 ${d.name}: “${pick(d.greet)}” <span style="color:var(--green)">(Rel +4)</span>`, 'npc'); save();
    } },
    { t: '🗣️ Ask for street gist', fn: () => {
      fun(4); toast(`🗣️ ${d.name}: ${GIST[id] || '"Wahala no dey finish for this street. But we dey survive."'}`, 'npc');
    } },
  ];
  if (id === 'broke' && G.cash >= 500 && st.dashDay !== G.day) choices.push({ t: '💸 Dash am ₦500 (help)', fn: () => {
    addCash(-500, 'Helped Emeka'); st.dashDay = G.day; rel(id, 12); G.stats.helped++; remember(id, 'dashed');
    toast('🙏 Emeka nearly hug you: “Bros! You be the real MVP! I go stand for you anytime!”', 'npc'); sfx.cash(); checkAch();
  } });
  if (id === 'solar' && G.policies.solarHub && G.phone < 80) choices.push({ t: '🔌 Use the community charging hub', sub: 'Free — the street voted for am', fn: () => {
    G.phone = clamp(G.phone + 40, 0, 100); toast('🔌 Hub dey work! Phone dey rise. "Na una money build am o," Aunty Solar remind you.', 'npc');
  } });
  else if (id === 'solar' && st.coldUntil > G.day && G.phone < 35) choices.push({ t: '📱 Charge your phone small', dis: true, sub: `She no dey charge for you till Day ${st.coldUntil}` });
  else if ((id === 'helpful' || id === 'solar') && G.phone < 35 && st.rel >= 40) choices.push({ t: '📱 Charge your phone small', fn: () => {
    G.phone = clamp(G.phone + 35, 0, 100); rel(id, -1); toast(`🔋 ${d.name} plug you. Phone dey rise! (Na favour o — Rel −1)`, 'npc');
  } });
  if (id === 'chairman') choices.push({ t: '🗳️ When be the next meeting?', fn: () => {
    const last = G.meetings[0];
    toast(`🗳️ ${d.name}: “Next meeting na Day ${G.nextMeetingDay}, 6PM.${last ? ` Last one, “${last.title}” ${last.passed ? 'pass' : 'fail'}.` : ''}${G.policies.youChair ? ' But na you be oga now…' : ''}”`, 'npc');
  } });
  if (id === 'chairman' && !G.streetlightFixed && !G.youPaid && G.cash >= SHARE) choices.push({ t: `🏘️ Pay your fund share — ₦${fmt(SHARE)}`, fn: () => {
    const eff = payOwnShare(); rel(id, 5);
    toast(`🏘️ Chairman: “Correct person!” ₦${fmt(eff)} counted.`, 'npc'); addFund(eff); save(); updHUD();
  } });
  if (id === 'chairman' && G.fund < G.fundGoal) choices.push({ t: '🏘️ Ask about street fund', fn: () => {
    toast(`🏘️ Chairman: “Fund na ₦${fmt(G.fund)} / ₦${fmt(G.fundGoal)}. ${G.owing.length ? G.owing.length + ' house(s) never pay — wahala!' : 'Everybody don try!'}"`, 'npc');
  } });
  if (id === 'student' && G.powerbank > 0 && G.pbankCharges > 0) choices.push({ t: '📚 Lend power bank to Chidera', fn: () => {
    G.pbankCharges--; rel(id, 12); G.stats.helped++; remember(id, 'lentPowerbank'); toast('📚 Chidera: “Senior! You just save my GPA!”', 'npc'); checkAch();
  } });
  choices.push({ t: '👋 Waka pass' });
  const role = id === 'chairman' && G.policies.youChair ? 'Former Chairman (still vexing)' : d.role;
  const feel = moodLabel(id);
  openModal('👤 ' + d.name + ' <span style="font-size:12px;color:var(--dim)">— ' + role + ' • Rel ♥' + Math.round(st.rel) + '</span>',
    `<span style="font-size:12px;color:var(--dim)">📍 ${whereabouts(id).act}${feel ? ' • ' + feel : ''}</span><br><i>“${line}”</i>`, choices);
}

function toggle(key: 'fanOn' | 'tvOn' | 'fridgeOn', label: string): void {
  if (!needHome('Your switches')) return;
  G[key] = !G[key]; toast(`${label} ${G[key] ? 'on' : 'off'}.`, 'sys'); save(); updHUD();
}

export function housePanel(): void {
  openModal('🏠 Your House', `Meter: <b>${G.meterUnits.toFixed(1)}u</b> • ${powered() ? '<span style="color:var(--green)">Power dey flow</span>' : '<span style="color:var(--red)">No power</span>'} • Noise: ${Math.round(G.noise)}%`, [
    { t: G.fanOn ? '🌀 Fan: ON — tap to off' : '🌀 Fan: OFF — tap to on', sub: 'Saves units when off', fn: () => toggle('fanOn', '🌀 Fan') },
    { t: G.tvOn ? '📺 TV: ON — tap to off' : '📺 TV: OFF — tap to on', sub: 'Fun + but units dey burn', fn: () => toggle('tvOn', '📺 TV') },
    { t: G.fridgeOn ? '🧊 Fridge: ON — tap to off' : '🧊 Fridge: OFF — tap to on', sub: 'Protect food, costs units', fn: () => toggle('fridgeOn', '🧊 Fridge') },
    { t: '📱 Open phone meter app', fn: () => openPhone('meter') },
    { t: 'Close' },
  ]);
}

export function genPanel(): void {
  const noFuel = !G.genOn && G.fuel <= 0, home = atHome();
  openModal('🔌 ' + genLabel(), `Fuel: <b>${G.fuel.toFixed(1)}L</b> • Condition: <b>${Math.round(G.genCond)}%</b> • Status: ${G.genOn ? '<span style="color:var(--green)">RUNNING (outdoor ✓)</span>' : '<span style="color:var(--dim)">Off</span>'}<br><span style="font-size:12px;color:var(--dim)">Small gen carries fan+lights only. Big gen carries everything. Keep outdoors, away from windows!</span>`, [
    { t: G.genOn ? '⏹ Stop generator' : '▶ Start generator', dis: noFuel || !home, sub: !home ? 'Your gen dey house — go home first' : noFuel ? 'Need fuel — buy from Shop' : G.genOn ? 'Quiet for the compound' : 'Uses fuel over time', fn: () => { if (G.genOn) stopGen(); else startGen(); } },
    { t: '🔧 Service gen — ₦1,500', dis: G.cash < 1500 || G.gen === 0, fn: repairGen },
    { t: 'Buy fuel (opens shop)', fn: () => openPhone('shop') },
    { t: 'Close' },
  ]);
}
