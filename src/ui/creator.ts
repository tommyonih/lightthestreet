/* Character creator: look, background and traits. */
import { G } from '../core/state';
import { $, clamp } from '../core/util';
import { BGS, HAIRS, OUTFITS, SKINS, TRAITS } from '../data/content';
import { drawPreview } from '../render/preview';
import { toast } from './toast';

export const C = { name: '', gender: 0, skin: 2, hair: 0, outfit: 0, bg: 'hustler', traits: [] as string[] };

export function redrawPreview(): void { drawPreview($<HTMLCanvasElement>('#preview'), C); }

/** Render one row of selectable chips/swatches. */
function options<T>(sel: string, items: T[], render: (d: HTMLDivElement, it: T, i: number) => boolean, onPick: (it: T, i: number) => void): void {
  const box = $(sel); box.innerHTML = '';
  items.forEach((it, i) => {
    const d = document.createElement('div');
    const selected = render(d, it, i);
    d.classList.toggle('sel', selected);
    d.onclick = () => onPick(it, i);
    box.appendChild(d);
  });
}

export function buildCreator(): void {
  const look = () => { buildCreator(); redrawPreview(); };
  options('#optGender', [['👨 Male', 0], ['👩 Female', 1]] as [string, number][],
    (d, [t, v]) => { d.className = 'chip'; d.textContent = t; return C.gender === v; }, ([, v]) => { C.gender = v; look(); });
  options('#optSkin', SKINS, (d, c, i) => { d.className = 'swatch'; d.style.background = c; return C.skin === i; }, (_, i) => { C.skin = i; look(); });
  options('#optHair', HAIRS, (d, h, i) => { d.className = 'chip'; d.textContent = h.n; return C.hair === i; }, (_, i) => { C.hair = i; look(); });
  options('#optOutfit', OUTFITS, (d, o, i) => { d.className = 'chip'; d.textContent = o.n; return C.outfit === i; }, (_, i) => { C.outfit = i; look(); });
  options('#optBg', BGS, (d, b) => { d.className = 'chip'; d.textContent = b.n; d.title = b.d; return C.bg === b.id; }, (b) => { C.bg = b.id; buildCreator(); });
  options('#optTraits', TRAITS, (d, t) => { d.className = 'chip'; d.textContent = t.n; d.title = t.d; return C.traits.includes(t.id); }, (t) => {
    if (C.traits.includes(t.id)) C.traits = C.traits.filter((x) => x !== t.id);
    else if (C.traits.length < 2) C.traits.push(t.id);
    else { toast('Max 2 traits o!', 'bad'); return; }
    buildCreator();
  });
}

/** Copy the creator choices and starting background onto a fresh game state. */
export function applyCreator(): void {
  G.name = (C.name || 'Resident').trim() || 'Resident';
  G.gender = C.gender; G.skin = C.skin; G.hair = C.hair; G.outfit = C.outfit;
  G.traits = [...C.traits]; G.bg = C.bg;
  const b = BGS.find((x) => x.id === C.bg)!;
  G.cash = b.cash; G.meterUnits = b.units; G.gen = b.gen; G.genCond = b.genCond; G.fuel = b.fuel;
  if (b.relBonus) G.npcs.forEach((n) => { n.rel = clamp(n.rel + b.relBonus!, 0, 100); });
  if (b.gen === 0) G.genOn = false;
}
