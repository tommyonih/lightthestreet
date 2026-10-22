/* Character creator, in two steps: the look (a category rail and a grid of picture tiles), then nickname and traits.
   Where you're born isn't picked here: it's a random roll when you finish (game/birth.ts). */
import { G } from '../core/state';
import { $, clamp } from '../core/util';
import { BGS, HAIRS, OUTFITS, SKINS, STREET_TYPES, TRAITS } from '../data/content';
import type { StreetType } from '../core/types';
import { applyBirth, type BirthPack } from '../game/birth';
import { PREVIEW_BG, drawPreview } from '../render/preview';
import { toast } from './toast';
import { wants3D } from './view';

export const C = {
  name: '', gender: 0, skin: 2, hair: 0, outfit: 0, bg: 'hustler', streetType: 'regular' as StreetType, traits: [] as string[],
  /** The birth roll, once made. Without one (tests, old flows) the background picks the start. */
  pack: null as BirthPack | null,
};
type LookKey = 'gender' | 'skin' | 'hair' | 'outfit';
type Look = Pick<typeof C, LookKey>;

/** The rail: [id, label, icon, what it changes, how many options, how the tile is framed, option names]. */
const CATS: { id: string; n: string; ico: string; key: LookKey; count: number; framing: 'head' | 'full'; label: (i: number) => string }[] = [
  { id: 'body', n: 'Body', ico: '🧍', key: 'gender', count: 2, framing: 'full', label: (i) => ['Male', 'Female'][i] },
  { id: 'skin', n: 'Skin', ico: '🎨', key: 'skin', count: SKINS.length, framing: 'head', label: (i) => ['Deep', 'Rich', 'Warm', 'Brown', 'Honey', 'Light'][i] ?? `Tone ${i + 1}` },
  { id: 'hair', n: 'Hair', ico: '💇', key: 'hair', count: HAIRS.length, framing: 'head', label: (i) => HAIRS[i].n },
  { id: 'style', n: 'Style', ico: '👕', key: 'outfit', count: OUTFITS.length, framing: 'full', label: (i) => OUTFITS[i].n },
];

let cat = CATS[0];
let step = 0;
let history: Look[] = [];
let hooks: { onDone: () => void; onBack: () => void } = { onDone: () => {}, onBack: () => {} };
const look = (): Look => ({ gender: C.gender, skin: C.skin, hair: C.hair, outfit: C.outfit });

/* ---------- the big preview: 2D drawing, swapped for a 3D turntable when the device can ---------- */

let stop3d: (() => void) | null = null, loading3d = false;
export function redrawPreview(): void {
  drawPreview($<HTMLCanvasElement>('#preview'), C, PREVIEW_BG.light);
  $('#crName').textContent = '@' + (C.name.trim() || 'you');
  if (stop3d || loading3d || !wants3D()) return;
  loading3d = true;
  import('../render3d/portrait')
    .then((m) => { stop3d = m.startPreview($<HTMLCanvasElement>('#preview3d'), () => C); $('#preview').classList.add('off'); $('#preview3d').classList.remove('off'); })
    .catch(() => { /* offline before the 3D chunk was cached: the 2D drawing stays */ })
    .finally(() => { loading3d = false; });
}
/** Free the turntable's GPU context once the game starts. */
export function stopPreview3d(): void {
  stop3d?.(); stop3d = null;
  if (thumbsUsed) { thumbsUsed = false; import('../render3d/portrait').then((m) => m.freeThumbs()).catch(() => {}); }
  $('#preview3d')?.classList.add('off'); $('#preview')?.classList.remove('off');
}

/* ---------- step 1: the look ---------- */

let thumbKey = '', thumbsUsed = false;
/** Paint the tiles: 2D straight away, then real 3D stills of your character when the 3D chunk is available. */
function paintThumbs(): void {
  const tiles = [...document.querySelectorAll<HTMLCanvasElement>('#crGrid canvas')];
  const looks = tiles.map((_, i) => ({ ...look(), [cat.key]: i }));
  // the 2D drawing ignores gender, so body tiles get a small label instead of a difference you can't see
  looks.forEach((l, i) => drawPreview(tiles[i], { name: null, ...l }, PREVIEW_BG.light));
  if (!wants3D()) return;
  const key = cat.id + JSON.stringify(look());
  thumbKey = key; thumbsUsed = true;
  import('../render3d/portrait').then((m) => {
    if (thumbKey !== key) return; // they moved on before the chunk arrived
    m.thumbs(looks, 140, 190, cat.framing).forEach((c, i) => {
      const x = tiles[i]?.getContext('2d'); if (!x) return;
      x.clearRect(0, 0, 140, 190);
      const g = x.createLinearGradient(0, 0, 0, 190); g.addColorStop(0, PREVIEW_BG.light[0]); g.addColorStop(1, PREVIEW_BG.light[1]);
      x.fillStyle = g; x.fillRect(0, 0, 140, 190); x.drawImage(c, 0, 0);
    });
  }).catch(() => { /* keep the 2D tiles */ });
}

function buildLook(): void {
  $('#crRail').innerHTML = CATS.map((c) => `<button class="railBtn${c === cat ? ' sel' : ''}" data-cat="${c.id}"><span>${c.ico}</span>${c.n}</button>`).join('');
  $('#crRail').querySelectorAll<HTMLElement>('[data-cat]').forEach((b) => { b.onclick = () => { cat = CATS.find((c) => c.id === b.dataset.cat)!; buildLook(); }; });
  $('#crGrid').innerHTML = Array.from({ length: cat.count }, (_, i) =>
    `<button class="tileOpt${C[cat.key] === i ? ' sel' : ''}" data-opt="${i}"><canvas width="140" height="190"></canvas><span>${cat.label(i)}</span></button>`).join('');
  $('#crGrid').querySelectorAll<HTMLElement>('[data-opt]').forEach((b) => { b.onclick = () => setLook({ [cat.key]: Number(b.dataset.opt) }); });
  paintThumbs();
}

function setLook(change: Partial<Look>, record = true): void {
  if (record) history.push(look());
  Object.assign(C, change);
  $<HTMLButtonElement>('#crUndo').disabled = !history.length;
  buildLook(); redrawPreview();
}

const randomLook = (): Look => ({
  gender: Math.random() < .5 ? 0 : 1, skin: Math.floor(Math.random() * SKINS.length),
  hair: Math.floor(Math.random() * HAIRS.length), outfit: Math.floor(Math.random() * OUTFITS.length),
});

/* ---------- step 2: nickname and traits ---------- */

function buildTraits(): void {
  const box = $('#optTraits'); box.innerHTML = '';
  TRAITS.forEach((t) => {
    const d = document.createElement('button'); d.className = 'chip trait' + (C.traits.includes(t.id) ? ' sel' : '');
    d.innerHTML = `<b>${t.n}</b><span>${t.d}</span>`;
    d.onclick = () => {
      if (C.traits.includes(t.id)) C.traits = C.traits.filter((x) => x !== t.id);
      else if (C.traits.length < 2) C.traits.push(t.id);
      else { toast('You can pick up to 2 traits.', 'bad'); return; }
      buildTraits();
    };
    box.appendChild(d);
  });
}

function goStep(n: number): void {
  step = n;
  $('#crLook').hidden = n !== 0; $('#crAbout').hidden = n !== 1;
  $('#crTitle').textContent = n === 0 ? 'Create your character' : 'About you';
  $('#btnEnter').textContent = n === 0 ? 'Next' : 'Complete character';
  $('#crSteps').querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i <= n));
  $('#crUndo').style.visibility = $('#crRandom').style.visibility = n === 0 ? '' : 'hidden';
  if (n === 1) { $<HTMLInputElement>('#inpName').value = C.name; buildTraits(); }
}

/** Show the creator. `name` pre-fills the nickname (the account's username). */
export function openCreator(name: string, h: typeof hooks): void {
  hooks = h; C.name = name.slice(0, 14); C.pack = null; history = [];
  $<HTMLButtonElement>('#crUndo').disabled = true;
  goStep(0); buildLook(); redrawPreview();
}

/** Wire the creator's buttons once at boot. */
export function initCreator(): void {
  $('#btnEnter').onclick = () => {
    if (step === 0) { goStep(1); return; }
    if (!C.name.trim()) { toast('Pick a nickname first.', 'bad'); $<HTMLInputElement>('#inpName').focus(); return; }
    hooks.onDone();
  };
  $('#crBack').onclick = () => { if (step === 1) goStep(0); else hooks.onBack(); };
  $('#crUndo').onclick = () => { const prev = history.pop(); if (prev) setLook(prev, false); };
  $('#crRandom').onclick = () => setLook(randomLook());
  $<HTMLInputElement>('#inpName').addEventListener('input', (e) => { C.name = (e.target as HTMLInputElement).value; redrawPreview(); });
}

/** Copy the creator choices onto a fresh game state, then the birth roll (or, without one, the background). */
export function applyCreator(): void {
  G.name = (C.name || 'Resident').trim() || 'Resident';
  G.gender = C.gender; G.skin = C.skin; G.hair = C.hair; G.outfit = C.outfit;
  G.traits = [...C.traits];
  if (C.pack) { applyBirth(C.pack); return; }
  G.bg = C.bg; G.streetType = C.streetType;
  const b = BGS.find((x) => x.id === C.bg)!;
  const st = STREET_TYPES.find((x) => x.id === C.streetType)!;
  G.streetName = st.n;
  G.cash = b.cash; G.meterUnits = b.units; G.gen = b.gen; G.genCond = b.genCond; G.fuel = b.fuel;
  if (b.relBonus) G.npcs.forEach((n) => { n.rel = clamp(n.rel + b.relBonus!, 0, 100); });
  if (b.gen === 0) G.genOn = false;
}

/** The welcome card's little portrait of a saved character. */
export function drawSaved(c: HTMLCanvasElement, s: { skin: number; hair: number; outfit: number }): void {
  drawPreview(c, { name: null, ...s }, PREVIEW_BG.light);
}
