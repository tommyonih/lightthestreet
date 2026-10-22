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
  gist: 'Aunty Caro heard the power boss is planning a "load shedding premium". Her source? "My cousin’s cousin."',
  chairman: '"There’s a meeting soon. Bring your own chair, and your own opinion."',
  solar: '"The sun is free fuel. The day I went solar, my problems dropped by 70%."',
  elder: '"In 1987 we read by lantern. You young people have it easy: even your blackouts have backup!"',
  barber: '"My clippers, my fan, my TV: all of them need power. A barber without power is just a man with scissors."',
};

let talking: string | null = null;
/** Whose panel is open right now (the 3D view turns them to face you and moves their mouth). */
export const talkingTo = (): string | null => (modalOpen ? talking : null);

export function npcClick(id: string): void {
  const d = npcDef(id), st = npcState(id); st.met = true; checkObj('greet'); talking = id;
  const memory = chance(.6) ? recallLine(id) : null;
  const line = memory ?? (!G.gridOn ? pick(d.off) : (G.meterUnits < 4 ? pick(['Your meter is beeping. I can hear it.', 'Buy some units before you get caught in the dark!']) : pick(chance(.4) ? d.on : d.greet)));
  const greeted = st.greetDay === G.day;
  const choices: Choice[] = [
    { t: '🤝 Say hello', sub: greeted ? 'You already said hello today' : '', fn: () => {
      if (greeted) { toast(`💬 ${d.name}: “We already said hello today. Do you need something?”`, 'npc'); return; }
      st.greetDay = G.day; rel(id, 4); if (!G.week.c.greeted.includes(id)) G.week.c.greeted.push(id); toast(`💬 ${d.name}: “${pick(d.greet)}” <span style="color:var(--green)">(Rel +4)</span>`, 'npc'); save();
    } },
    { t: '🗣️ Ask for the street news', fn: () => {
      fun(4); toast(`🗣️ ${d.name}: ${GIST[id] || '"There’s always something on this street. But we survive."'}`, 'npc');
    } },
  ];
  if (id === 'broke' && G.cash >= 500 && st.dashDay !== G.day) choices.push({ t: '💸 Give him ₦500', fn: () => {
    addCash(-500, 'Helped Emeka'); st.dashDay = G.day; rel(id, 12); G.stats.helped++; remember(id, 'dashed');
    toast('🙏 Emeka almost hugs you: “You’re the real MVP! I’ve got your back anytime!”', 'npc'); sfx.cash(); checkAch();
  } });
  if (id === 'solar' && G.policies.solarHub && G.phone < 80) choices.push({ t: '🔌 Use the community charging hub', sub: 'Free. The street voted for it.', fn: () => {
    G.phone = clamp(G.phone + 40, 0, 100); toast('🔌 The hub works! Phone charging. "Your money built this," Aunty Solar reminds you.', 'npc');
  } });
  else if (id === 'solar' && st.coldUntil > G.day && G.phone < 35) choices.push({ t: '📱 Charge your phone', dis: true, sub: `She won’t charge for you until day ${st.coldUntil}` });
  else if ((id === 'helpful' || id === 'solar') && G.phone < 35 && st.rel >= 40) choices.push({ t: '📱 Charge your phone', fn: () => {
    G.phone = clamp(G.phone + 35, 0, 100); rel(id, -1); toast(`🔋 ${d.name} lets you plug in. Phone charging! (It’s a favour: Rel −1)`, 'npc');
  } });
  if (id === 'chairman') choices.push({ t: '🗳️ When is the next meeting?', fn: () => {
    const last = G.meetings[0];
    toast(`🗳️ ${d.name}: “Next meeting is day ${G.nextMeetingDay}, 6PM.${last ? ` Last time, “${last.title}” ${last.passed ? 'passed' : 'failed'}.` : ''}${G.policies.youChair ? ' But you’re the boss now…' : ''}”`, 'npc');
  } });
  if (id === 'chairman' && !G.streetlightFixed && !G.youPaid && G.cash >= SHARE) choices.push({ t: `🏘️ Pay your fund share: ₦${fmt(SHARE)}`, fn: () => {
    const eff = payOwnShare(); rel(id, 5);
    toast(`🏘️ Chairman: “Good person!” ₦${fmt(eff)} counted.`, 'npc'); addFund(eff); save(); updHUD();
  } });
  if (id === 'chairman' && G.fund < G.fundGoal) choices.push({ t: '🏘️ Ask about the street fund', fn: () => {
    toast(`🏘️ Chairman: “The fund is at ₦${fmt(G.fund)} / ₦${fmt(G.fundGoal)}. ${G.owing.length ? G.owing.length + ' house(s) still haven’t paid.' : 'Everyone has paid!'}”`, 'npc');
  } });
  if (id === 'student' && G.powerbank > 0 && G.pbankCharges > 0) choices.push({ t: '📚 Lend power bank to Chidera', fn: () => {
    G.pbankCharges--; rel(id, 12); G.stats.helped++; remember(id, 'lentPowerbank'); toast('📚 Chidera: “You just saved my GPA!”', 'npc'); checkAch();
  } });
  choices.push({ t: '👋 Walk on' });
  const role = id === 'chairman' && G.policies.youChair ? 'Former chairman (still upset)' : d.role;
  const feel = moodLabel(id);
  openModal('👤 ' + d.name + ' <span style="font-size:12px;color:var(--dim)">— ' + role + ' • Rel ♥' + Math.round(st.rel) + '</span>',
    `<span style="font-size:12px;color:var(--dim)">📍 ${whereabouts(id).act}${feel ? ' • ' + feel : ''}</span><br><i>“${line}”</i>`, choices);
}

function toggle(key: 'fanOn' | 'tvOn' | 'fridgeOn', label: string): void {
  if (!needHome('Your switches')) return;
  G[key] = !G[key]; toast(`${label} ${G[key] ? 'on' : 'off'}.`, 'sys'); save(); updHUD();
}

export function housePanel(): void {
  openModal('🏠 Your House', `Meter: <b>${G.meterUnits.toFixed(1)}u</b> • ${powered() ? '<span style="color:var(--green)">Power on</span>' : '<span style="color:var(--red)">No power</span>'} • Noise: ${Math.round(G.noise)}%`, [
    { t: G.fanOn ? '🌀 Fan: on (tap to turn off)' : '🌀 Fan: off (tap to turn on)', sub: 'Saves units when off', fn: () => toggle('fanOn', '🌀 Fan') },
    { t: G.tvOn ? '📺 TV: on (tap to turn off)' : '📺 TV: off (tap to turn on)', sub: 'More fun, but uses units', fn: () => toggle('tvOn', '📺 TV') },
    { t: G.fridgeOn ? '🧊 Fridge: on (tap to turn off)' : '🧊 Fridge: off (tap to turn on)', sub: 'Keeps food fresh, uses units', fn: () => toggle('fridgeOn', '🧊 Fridge') },
    { t: '⚡ Open NextPawa (buy units)', fn: () => openPhone('meter') },
    { t: 'Close' },
  ]);
}

export function genPanel(): void {
  const noFuel = !G.genOn && G.fuel <= 0, home = atHome();
  openModal('🔌 ' + genLabel(), `Fuel: <b>${G.fuel.toFixed(1)}L</b> • Condition: <b>${Math.round(G.genCond)}%</b> • Status: ${G.genOn ? '<span style="color:var(--green)">RUNNING (outdoor ✓)</span>' : '<span style="color:var(--dim)">Off</span>'}<br><span style="font-size:12px;color:var(--dim)">A small generator runs the lights and one appliance. A big one runs everything. Keep it outdoors, away from windows.</span><br><span style="font-size:12px;color:var(--amber2)">⚠️ Generator fumes can kill. They contain carbon monoxide, which you can’t see or smell. Never run one indoors or near doors and windows.</span>`, [
    { t: G.genOn ? '⏹ Stop generator' : '▶ Start generator', dis: noFuel || !home, sub: !home ? 'Your generator is at home. Go home first.' : noFuel ? 'Needs fuel: buy some in the Shop' : G.genOn ? 'Some quiet for the compound' : 'Uses fuel over time', fn: () => { if (G.genOn) stopGen(); else startGen(); } },
    { t: '🔧 Service the generator: ₦1,500', dis: G.cash < 1500 || G.gen === 0, fn: repairGen },
    { t: 'Buy fuel (opens the Shop)', fn: () => openPhone('shop') },
    { t: 'Close' },
  ]);
}
