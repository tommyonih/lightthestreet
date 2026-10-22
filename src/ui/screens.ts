import { $ } from '../core/util';
import { setAmbience } from '../core/audio';
import { resize } from '../render/street';
import { updHUD } from './hud';

export type ScreenId = 'scr-welcome' | 'scr-auth' | 'scr-age' | 'scr-rules' | 'scr-create' | 'scr-birth' | 'scr-game' | 'scr-results' | 'scr-blank' | 'scr-room';

let onShow: ((id: ScreenId) => void) | null = null;
/** The city map listens here: it sits behind the welcome screen and sleeps everywhere else. */
export function onScreen(fn: (id: ScreenId) => void): void { onShow = fn; }

let current: ScreenId = 'scr-blank';
export const screenNow = (): ScreenId => current;

export function show(id: ScreenId): void {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $('#' + id).classList.add('active');
  current = id;
  if (id === 'scr-game') { setTimeout(resize, 30); updHUD(); }
  else setAmbience([]); // the market noise shouldn't follow you onto the results screen
  onShow?.(id);
}

export function showBlank(): void {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  current = 'scr-blank';
  setAmbience([]);
  onShow?.('scr-blank');
}
