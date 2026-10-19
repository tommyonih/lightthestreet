/* 2D or 3D street. The 3D renderer is a separate chunk loaded only when wanted; if WebGL is missing, the chunk can't
   load (offline before it was ever cached), or frames are too slow, we stay on (or drop back to) the 2D street. */
import { SET, hasGame, saveSettings } from '../core/state';
import { $ } from '../core/util';
import type { View3D } from '../render3d/scene';
import { streetHit } from './interact';
import { toast } from './toast';

let view3d: View3D | null = null;
let loading: Promise<void> | null = null;

export function webglOk(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
const wants3D = (): boolean => SET.view === '3d' || (SET.view === 'auto' && webglOk());
export const is3D = (): boolean => view3d != null;

function show(three: boolean): void {
  $('#street').classList.toggle('off', three); // the 2D loop skips frames while its canvas is off
  $('#street3d').classList.toggle('off', !three);
  document.body.classList.toggle('v3d', three); // the place card can fold away in 3D, where the place itself is drawn
  const b = $('#btnView'); b.textContent = three ? '3D' : '2D'; b.setAttribute('aria-label', three ? 'Switch to 2D street' : 'Switch to 3D street');
}

/** Bring the street view in line with the setting. Safe to call any time. */
export function applyView(): Promise<void> {
  if (loading) return loading;
  if (!wants3D()) { view3d?.stop(); view3d = null; show(false); return Promise.resolve(); }
  if (view3d) { show(true); return Promise.resolve(); }
  loading = import('../render3d/scene')
    .then((m) => {
      view3d = m.start($<HTMLCanvasElement>('#street3d'), {
        onHit: streetHit,
        onSlow: () => {
          if (SET.view !== 'auto') return; // they chose 3D on purpose; respect it
          SET.view = '2d'; saveSettings(); void applyView();
          toast('📉 3D dey drag for this phone — we switch you to <b>2D Classic</b>. Tap 2D/3D for top to try again.', 'sys');
        },
      });
      show(true);
    })
    .catch(() => { show(false); if (hasGame()) toast('🧱 3D street no fit load now — 2D Classic for now.', 'bad'); })
    .finally(() => { loading = null; });
  return loading;
}

/** The HUD 2D/3D button. */
export function toggleView(): void {
  SET.view = is3D() ? '2d' : '3d'; saveSettings(); void applyView();
}
