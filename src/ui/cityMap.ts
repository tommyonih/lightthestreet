/* The city map on screen: drifting behind the welcome screen, and full screen from the Map tab. The 3D city loads
   lazily; without WebGL the welcome screen keeps a plain sky and the Map tab falls back to the 2D map in the phone. */
import { G, hasGame } from '../core/state';
import { $ } from '../core/util';
import type { PlaceId } from '../data/content';
import type { CityView } from '../render3d/city';
import { place } from '../game/world';
import { placeRow, wireMap } from './map';
import { openProduct } from './products';
import { onScreen } from './screens';
import { toast } from './toast';
import { webglOk } from './view';

let view: CityView | null = null;
let loading: Promise<CityView | null> | null = null;
let mapIsOpen = false, timer = 0, onClose: () => void = () => {};

const state = () => (hasGame() ? { unlocked: G.unlocked, here: G.trip ? null : G.loc } : { unlocked: null, here: null });

function ensure(): Promise<CityView | null> {
  if (view) return Promise.resolve(view);
  if (!webglOk()) return Promise.resolve(null);
  return loading ??= Promise.all([import('../render3d/city'), import('../render3d/scene')])
    .then(([city, scene]) => {
      view = city.startCity($<HTMLCanvasElement>('#cityCv'), {
        onPlace: (id) => { if (mapIsOpen) showCard(id); else toast(`${place(id).emoji} <b>${place(id).n}</b>: ${place(id).blurb}`, 'sys'); },
        onProduct: (id, v) => openProduct(id, v),
        state,
      }, scene.pickTier());
      document.body.classList.add('city3d');
      return view;
    })
    .catch(() => null);
}

/** The card at the bottom of the full-screen map: the place you tapped, and how to get there. */
function showCard(id: PlaceId): void {
  const card = $('#mapCard');
  card.innerHTML = placeRow(id);
  card.classList.add('show');
  wireMap(card, () => { if (G.trip) closeMap(); else showCard(id); });
  view?.focus(id);
}

function paintWhere(): void {
  $('#mapWhere').textContent = !hasGame() ? '' : G.trip ? `On the way to ${place(G.trip.to).n}` : `You're at ${place(G.loc).n}`;
}

/** Open the full-screen map. False when the device can't draw it (the caller shows the 2D map instead). */
export function openMap(): boolean {
  if (!webglOk()) return false;
  mapIsOpen = true;
  document.body.classList.add('mapOpen');
  $('#mapLayer').setAttribute('aria-hidden', 'false');
  paintWhere();
  showCard(G.trip ? G.trip.to : G.loc);
  void ensure().then((v) => { if (!v) { closeMap(); return; } v.mode('map'); v.refresh(); v.focus(G.trip ? G.trip.to : G.loc); });
  clearInterval(timer);
  timer = window.setInterval(() => { view?.refresh(); paintWhere(); }, 1000);
  return true;
}
export function closeMap(): void {
  if (!mapIsOpen) return;
  mapIsOpen = false; clearInterval(timer);
  document.body.classList.remove('mapOpen');
  $('#mapLayer').setAttribute('aria-hidden', 'true');
  $('#mapCard').classList.remove('show');
  onClose();
}
export const mapOpen = (): boolean => mapIsOpen;

export function initCityMap(closed: () => void): void {
  onClose = closed;
  $('#mapClose').onclick = closeMap;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMap(); });
  onScreen((id) => {
    const behind = id === 'scr-welcome';
    document.body.classList.toggle('cityOn', behind);
    if (id !== 'scr-game') closeMap();
    if (behind) void ensure().then((v) => { v?.mode('ambient'); v?.refresh(); });
  });
}
