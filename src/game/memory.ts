/* Neighbours remember what you did. Memories fade; strong feelings turn into favours or grudges. */
import { G, T, save } from '../core/state';
import { clamp, fmt, pick } from '../core/util';
import { sfx } from '../core/audio';
import { MEMORY, type MemKind } from '../data/content';
import { openModal } from '../ui/modal';
import { toast } from '../ui/toast';
import { updHUD } from '../ui/hud';
import { addCash } from './economy';
import { addFund, SHARE } from './fund';
import { mood, npcDef, npcState, rel, trust } from './helpers';

/** Each day a memory counts this much less (≈ half-life of 5–6 days). */
export const DECAY = .88;
export const FAVOUR = 3, GRUDGE = -3;
const MAX_MEMORIES = 8;
const FORGET_BELOW = .25;
export const PEACE_OFFERING = 500;

const strength = (kind: MemKind, day: number) => MEMORY[kind].w * DECAY ** Math.max(0, G.day - day);

export function remember(id: string, kind: MemKind): void {
  const n = npcState(id); if (!n) return;
  n.mem.unshift({ kind, day: G.day });
  if (n.mem.length > MAX_MEMORIES) n.mem.pop();
}

/** Net feeling about you from memories: ≥ FAVOUR wants to help, ≤ GRUDGE wants payback. */
export function opinion(id: string): number {
  const n = npcState(id);
  return n ? n.mem.reduce((s, m) => s + strength(m.kind, m.day), 0) : 0;
}

/** The memory weighing most on them right now, if any is strong enough to mention. */
export function salient(id: string): { kind: MemKind; day: number } | null {
  let best: { kind: MemKind; day: number } | null = null, bestS = .9;
  for (const m of npcState(id).mem) { const s = Math.abs(strength(m.kind, m.day)); if (s > bestS) { best = m; bestS = s; } }
  return best;
}

export function recallLine(id: string): string | null {
  const m = salient(id); return m ? pick(MEMORY[m.kind].said) : null;
}

/** Called once per new day: faded memories are forgotten. */
export function forgetFaded(): void {
  G.npcs.forEach((n) => { n.mem = n.mem.filter((m) => Math.abs(strength(m.kind, m.day)) >= FORGET_BELOW); });
}

export function moodLabel(id: string): string {
  const o = opinion(id);
  return o >= FAVOUR ? '💚 owes you one' : o <= GRUDGE ? '😠 holding a grudge' : o >= 1 ? '🙂 warm' : o <= -1 ? '😒 cold' : '';
}

/* ---------- favours and grudges, per neighbour ---------- */
interface Deed { text: string; act: () => string }

function nextFlipHint(): string {
  const at = G.nextFlip - T(); const hh = Math.floor(((G.minute + at) % 1440) / 60);
  return `around ${String(hh).padStart(2, '0')}:00`;
}

export const FAVOURS: Record<string, Deed> = {
  landlord: { text: 'Baba Landlord stop by: <i>"You be correct tenant. Your dues fit wait three more days."</i>',
    act: () => { G.flags.rentNext = Math.max(G.flags.rentNext, G.day) + 3; return 'Dues pushed back 3 days.'; } },
  broke: { text: 'Emeka come with a jerrycan: <i>"My guy for filling station dash me. Na your own — you help me before."</i>',
    act: () => { if (G.gen > 0) { G.fuel += 2; return '+2L fuel.'; } addCash(600, 'Emeka paid you back'); return 'Emeka pay you back ₦600!'; } },
  gist: { text: 'Aunty Caro lean close: <i>"My cousin for NEPA office talk am — no tell anybody…"</i>',
    act: () => `Light go ${G.gridOn ? 'go' : 'come back'} ${nextFlipHint()}. (Her cousin is never wrong. Mostly.)` },
  remote: { text: 'Tunde knock: <i>"Bro, my company need small help with one gig. I put your name forward."</i>',
    act: () => { addCash(1500, 'Gig referral from Tunde'); return '+₦1,500 from a referral gig.'; } },
  barber: { text: 'Barber Skippo wave you in: <i>"Sit down. This one na on the house — you be my person."</i>',
    act: () => { mood(8); return 'Free fresh cut. You look like ₦1m. (+8 mood)'; } },
  elder: { text: 'Papa Nnanna call you: <i>"Come, make I show you how we dey service generator for our time."</i>',
    act: () => { if (G.gen > 0) { G.genCond = clamp(G.genCond + 25, 0, 100); return 'Gen condition +25%.'; } mood(5); trust(2); return 'Pure wisdom. (+5 mood, +2 trust)'; } },
  chairman: { text: 'Chairman Dele pull you aside: <i>"You don do well for this street. I go handle your matter."</i>',
    act: () => { if (!G.youPaid && !G.streetlightFixed) { G.youPaid = true; addFund(SHARE); return 'He covered your fund share!'; } trust(5); return 'He praise you for meeting. (+5 trust)'; } },
  solar: { text: 'Aunty Solar call you over: <i>"Bring everything wey need charge. My battery full today."</i>',
    act: () => { G.phone = 100; if (G.fanRecharge) G.fanBat = 100; return 'Phone (and fan) fully charged!'; } },
  student: { text: 'Chidera show you her laptop: <i>"I edit your skit small… e don dey trend!"</i>',
    act: () => { addCash(1200, 'Skit went viral (Chidera edit)'); return '+₦1,200 from a viral skit.'; } },
  helpful: { text: 'Mama K bring covered plate: <i>"I know say you dey hustle. Chop this one."</i>',
    act: () => { G.hunger = clamp(G.hunger - 40, 0, 100); mood(4); return 'Hot soup & swallow. (−40 hunger)'; } },
};

export const GRUDGES: Record<string, Deed> = {
  landlord: { text: 'Baba Landlord bang your door: <i>"Your dues don due — TODAY. I no dey wait for anybody again."</i>',
    act: () => { G.flags.rentNext = G.day; return 'Dues are due now.'; } },
  broke: { text: 'You hear Emeka for corridor: <i>"That one? Stingy like closed shop."</i>',
    act: () => { trust(-3); return 'Street trust −3.'; } },
  gist: { text: 'Aunty Caro don start broadcast about you for the whole street…',
    act: () => { trust(-5); return 'Gossip everywhere. Street trust −5.'; } },
  remote: { text: 'Tunde don report you to the chairman: <i>"This person dey disturb my work."</i>',
    act: () => { trust(-3); rel('chairman', -3); return 'Trust −3, Chairman not impressed.'; } },
  barber: { text: 'Barber Skippo shake head: <i>"Go barb for next street. I no get time for you."</i>',
    act: () => { mood(-4); return '−4 mood.'; } },
  elder: { text: 'Papa Nnanna speak against you for the elders’ gathering.',
    act: () => { trust(-4); return 'Street trust −4.'; } },
  chairman: { text: 'Chairman Dele fine you for "anti-street behaviour".',
    act: () => { addCash(-Math.min(500, G.cash), 'Chairman fine'); return '−₦500.'; } },
  solar: { text: 'Aunty Solar: <i>"My charging point no dey open for you for now."</i>',
    act: () => { npcState('solar').coldUntil = G.day + 3; return 'No charging at Aunty Solar’s for 3 days.'; } },
  student: { text: 'Chidera tell all her course mates say you wicked.',
    act: () => { trust(-2); mood(-2); return 'Trust −2, mood −2.'; } },
  helpful: { text: 'Mama K pass you without greeting. That one pain pass abuse.',
    act: () => { mood(-5); return '−5 mood.'; } },
};

const FAVOUR_GAP = 4, GRUDGE_GAP = 3; // days between deeds from the same neighbour

export function favourCandidate(isPresent: (id: string) => boolean): string | null {
  return G.npcs.find((n) => opinion(n.id) >= FAVOUR && G.day - n.favourDay >= FAVOUR_GAP && isPresent(n.id))?.id ?? null;
}
export function grudgeCandidate(): string | null {
  return G.npcs.find((n) => opinion(n.id) <= GRUDGE && G.day - n.grudgeDay >= GRUDGE_GAP)?.id ?? null;
}

export function doFavour(id: string): void {
  const n = npcState(id), d = npcDef(id), f = FAVOURS[id]; n.favourDay = G.day; G.week.c.peace++;
  openModal(`💚 ${d.name} remember you`, f.text, [
    { t: '🙏 Accept with thanks', fn: () => { const r = f.act(); rel(id, 3); sfx.cheer(); toast(`💚 ${d.name}: ${r}`, 'sys'); save(); updHUD(); } },
    { t: '“No worry, keep am for yourself”', sub: 'Their respect for you go up even more', fn: () => { rel(id, 6); trust(2); toast(`💚 ${d.name} smile: “You too much.”`, 'npc'); save(); } },
  ]);
}

export function doGrudge(id: string): void {
  const n = npcState(id), d = npcDef(id), g = GRUDGES[id]; n.grudgeDay = G.day;
  openModal(`😠 ${d.name} never forget`, `${g.text}<br><br><span style="color:var(--dim)">They remember: ${npcState(id).mem.filter((m) => MEMORY[m.kind].w < 0).map((m) => MEMORY[m.kind].note).slice(0, 2).join('; ') || 'something you did'}.</span>`, [
    { t: `🕊️ Go settle am — ₦${fmt(PEACE_OFFERING)} peace offering`, dis: G.cash < PEACE_OFFERING, sub: 'Clears the bad blood', fn: () => {
      addCash(-PEACE_OFFERING, `Peace offering to ${d.name}`); remember(id, 'settled'); G.week.c.peace++; rel(id, 8); sfx.cash();
      toast(`🕊️ You and ${d.name} settle am over malt and chin-chin. “Clean slate.”`, 'sys'); save(); updHUD();
    } },
    { t: 'Ignore am', fn: () => { const r = g.act(); sfx.bad(); toast(`😠 ${d.name}: ${r}`, 'bad'); save(); updHUD(); } },
  ]);
}
