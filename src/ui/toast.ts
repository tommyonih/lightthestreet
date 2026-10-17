import { G, hasGame } from '../core/state';
import { $ } from '../core/util';
import { buzz } from '../core/haptics';

export type ToastKind = 'sys' | 'npc' | 'bad' | '';

let headless = false;
/** Tests and simulations turn off toasts and HUD/phone redraws. */
export function setHeadless(on: boolean): void { headless = on; }
export function isHeadless(): boolean { return headless; }

/** Everything the street told you this session, newest first — shown in the feed under the scene. */
export interface FeedItem { txt: string; cls: ToastKind; t: string; n: number }
export const feed: FeedItem[] = [];
let feedN = 0;
const FEED_MAX = 60;

function clock(): string {
  if (!hasGame()) return '';
  const h = Math.floor(G.minute / 60) % 24, m = G.minute % 60;
  return `Day ${G.day}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** The street screen is up with nothing covering the feed. */
function feedInView(): boolean {
  return !!document.querySelector('#scr-game.active') && !document.querySelector('#phone.open, #modal.open');
}

export function toast(txt: string, cls: ToastKind = ''): void {
  if (headless) return;
  feed.unshift({ txt, cls, t: clock(), n: ++feedN }); if (feed.length > FEED_MAX) feed.pop();
  if (cls === 'bad') buzz([25, 40, 25]);
  const box = $('#toast'); if (!box) return;
  if ((cls === 'npc' || cls === '') && feedInView()) return; // the feed already shows chatter

  while (box.children.length >= 3) box.firstElementChild!.remove(); // never stack more than three
  const d = document.createElement('div'); d.className = 'msg ' + cls;
  d.innerHTML = txt; box.appendChild(d);
  setTimeout(() => d.classList.add('out'), 3600);
  setTimeout(() => d.remove(), 4000);
}
