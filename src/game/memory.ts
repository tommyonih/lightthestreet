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
  landlord: { text: 'Baba Landlord stops by: <i>"You’re a good tenant. Your dues can wait three more days."</i>',
    act: () => { G.flags.rentNext = Math.max(G.flags.rentNext, G.day) + 3; return 'Dues pushed back 3 days.'; } },
  broke: { text: 'Emeka turns up with a jerrycan: <i>"My friend at the filling station gave me this. It’s yours. You helped me before."</i>',
    act: () => { if (G.gen > 0) { G.fuel += 2; return '+2L fuel.'; } addCash(600, 'Emeka paid you back'); return 'Emeka paid you back ₦600!'; } },
  gist: { text: 'Aunty Caro leans in: <i>"My cousin at the power office told me something. Don’t tell anyone…"</i>',
    act: () => `Light go ${G.gridOn ? 'go' : 'come back'} ${nextFlipHint()}. (Her cousin is never wrong. Mostly.)` },
  remote: { text: 'Tunde knocks: <i>"My company needs help with a gig. I put your name forward."</i>',
    act: () => { addCash(1500, 'Gig referral from Tunde'); return '+₦1,500 from a referral gig.'; } },
  barber: { text: 'Barber Skippo waves you in: <i>"Sit down. This one is on the house."</i>',
    act: () => { mood(8); return 'A free fresh cut. You look like a million naira. (+8 mood)'; } },
  elder: { text: 'Papa Nnanna calls you over: <i>"Come, let me show you how we serviced generators in my day."</i>',
    act: () => { if (G.gen > 0) { G.genCond = clamp(G.genCond + 25, 0, 100); return 'Gen condition +25%.'; } mood(5); trust(2); return 'Pure wisdom. (+5 mood, +2 trust)'; } },
  chairman: { text: 'Chairman Dele pulls you aside: <i>"You’ve done well for this street. I’ll take care of you."</i>',
    act: () => { if (!G.youPaid && !G.streetlightFixed) { G.youPaid = true; addFund(SHARE); return 'He covered your fund share!'; } trust(5); return 'He praised you at the meeting. (+5 trust)'; } },
  solar: { text: 'Aunty Solar calls you over: <i>"Bring everything that needs charging. My battery is full today."</i>',
    act: () => { G.phone = 100; if (G.fanRecharge) G.fanBat = 100; return 'Phone (and fan) fully charged!'; } },
  student: { text: 'Chidera shows you her laptop: <i>"I edited your skit a little… it’s trending!"</i>',
    act: () => { addCash(1200, 'Skit went viral (Chidera edit)'); return '+₦1,200 from a viral skit.'; } },
  helpful: { text: 'Mama K brings a covered plate: <i>"I know you’re working hard. Eat this."</i>',
    act: () => { G.hunger = clamp(G.hunger - 40, 0, 100); mood(4); return 'Hot soup and swallow. (−40 hunger)'; } },
};

export const GRUDGES: Record<string, Deed> = {
  landlord: { text: 'Baba Landlord bangs on your door: <i>"Your dues are due TODAY. I’m not waiting for anyone any more."</i>',
    act: () => { G.flags.rentNext = G.day; return 'Dues are due now.'; } },
  broke: { text: 'You overhear Emeka in the corridor: <i>"That one? Stingy as a closed shop."</i>',
    act: () => { trust(-3); return 'Street trust −3.'; } },
  gist: { text: 'Aunty Caro has started telling the whole street about you…',
    act: () => { trust(-5); return 'Gossip everywhere. Street trust −5.'; } },
  remote: { text: 'Tunde reported you to the chairman: <i>"This person keeps disturbing my work."</i>',
    act: () => { trust(-3); rel('chairman', -3); return 'Trust −3, Chairman not impressed.'; } },
  barber: { text: 'Barber Skippo shakes his head: <i>"Get your hair cut on the next street. I don’t have time for you."</i>',
    act: () => { mood(-4); return '−4 mood.'; } },
  elder: { text: 'Papa Nnanna spoke against you at the elders’ gathering.',
    act: () => { trust(-4); return 'Street trust −4.'; } },
  chairman: { text: 'Chairman Dele fined you for "anti-street behaviour".',
    act: () => { addCash(-Math.min(500, Math.max(0, G.cash)), 'Chairman fine'); return '−₦500.'; } },
  solar: { text: 'Aunty Solar: <i>"My charging point is closed to you for now."</i>',
    act: () => { npcState('solar').coldUntil = G.day + 3; return 'No charging at Aunty Solar’s for 3 days.'; } },
  student: { text: 'Chidera told all her classmates you’re mean.',
    act: () => { trust(-2); mood(-2); return 'Trust −2, mood −2.'; } },
  helpful: { text: 'Mama K walked past without greeting you. That hurt more than an insult.',
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
  openModal(`💚 ${d.name} remembers you`, f.text, [
    { t: '🙏 Accept with thanks', fn: () => { const r = f.act(); rel(id, 3); sfx.cheer(); toast(`💚 ${d.name}: ${r}`, 'sys'); save(); updHUD(); } },
    { t: '“No need, keep it”', sub: 'They’ll respect you even more', fn: () => { rel(id, 6); trust(2); toast(`💚 ${d.name} smiles: “You’re too kind.”`, 'npc'); save(); } },
  ]);
}

export function doGrudge(id: string): void {
  const n = npcState(id), d = npcDef(id), g = GRUDGES[id]; n.grudgeDay = G.day;
  openModal(`😠 ${d.name} hasn’t forgotten`, `${g.text}<br><br><span style="color:var(--dim)">They remember: ${npcState(id).mem.filter((m) => MEMORY[m.kind].w < 0).map((m) => MEMORY[m.kind].note).slice(0, 2).join('; ') || 'something you did'}.</span>`, [
    { t: `🕊️ Make peace and settle it: ₦${fmt(PEACE_OFFERING)} peace offering`, dis: G.cash < PEACE_OFFERING, sub: 'Clears the bad blood', fn: () => {
      addCash(-PEACE_OFFERING, `Peace offering to ${d.name}`); remember(id, 'settled'); G.week.c.peace++; rel(id, 8); sfx.cash();
      toast(`🕊️ You and ${d.name} settle things over malt and chin-chin. “Clean slate.”`, 'sys'); save(); updHUD();
    } },
    { t: 'Ignore it', fn: () => { const r = g.act(); sfx.bad(); toast(`😠 ${d.name}: ${r}`, 'bad'); save(); updHUD(); } },
  ]);
}
