import { SET } from './state';

/** A short vibration on devices that support it (Android). Silent when sound & vibration is off. */
export function buzz(pattern: number | number[] = 8): void {
  if (!SET.sound || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(pattern); } catch { /* some browsers throw without a user gesture */ }
}
