import { $ } from '../core/util';
import { setAmbience } from '../core/audio';
import { resize } from '../render/street';
import { updHUD } from './hud';

export type ScreenId = 'scr-welcome' | 'scr-age' | 'scr-rules' | 'scr-create' | 'scr-game' | 'scr-results' | 'scr-blank';

export function show(id: ScreenId): void {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $('#' + id).classList.add('active');
  if (id === 'scr-game') { setTimeout(resize, 30); updHUD(); }
  else setAmbience([]); // the market noise shouldn't follow you onto the results screen
}

export function showBlank(): void {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  setAmbience([]);
}
