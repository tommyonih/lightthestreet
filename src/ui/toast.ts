import { $ } from '../core/util';

export type ToastKind = 'sys' | 'npc' | 'bad' | '';

let headless = false;
/** Tests and simulations turn off toasts and HUD/phone redraws. */
export function setHeadless(on: boolean): void { headless = on; }
export function isHeadless(): boolean { return headless; }

export function toast(txt: string, cls: ToastKind = ''): void {
  if (headless) return;
  const d = document.createElement('div'); d.className = 'msg ' + cls;
  d.innerHTML = txt; $('#toast').appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; d.style.transition = 'opacity .4s'; }, 3600);
  setTimeout(() => d.remove(), 4100);
}
