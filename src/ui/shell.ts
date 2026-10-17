/* Native-app behaviour: splash, offline service worker, install prompt, tap haptics, sheet gestures. */
import { $ } from '../core/util';
import { buzz } from '../core/haptics';
import { closePhone, phoneOpen } from './phone';

const SPLASH_MIN_MS = 700;

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

function hideSplash(): void {
  const s = $('#splash'); if (!s) return;
  s.classList.add('gone'); setTimeout(() => s.remove(), 500);
}

function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* offline mode is a bonus */ }); });
}

const standalone = (): boolean => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

function setupInstall(): void {
  if (standalone()) return;
  const btn = $('#btnInstall'); if (!btn) return;
  let deferred: InstallPrompt | null = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallPrompt; btn.style.display = 'flex'; });
  window.addEventListener('appinstalled', () => { btn.style.display = 'none'; deferred = null; });
  btn.onclick = async () => {
    if (!deferred) return;
    await deferred.prompt(); await deferred.userChoice; deferred = null; btn.style.display = 'none';
  };
  // iPhone Safari has no install prompt; tell people where the menu item is.
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) $('#iosHint').style.display = 'block';
}

/** A light tick under the finger for every button, like a native app. */
function setupHaptics(): void {
  document.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button:not(:disabled), .chip, .swatch')) buzz(6);
  }, { capture: true });
}

/** Drag the sheet down by its handle or header to close it; Escape closes it too. */
function setupSheetGestures(): void {
  const sheet = $('#phone'); if (!sheet) return;
  let y0 = -1;
  const handle = (t: EventTarget | null) => !!(t as HTMLElement).closest('.grab, #phoneHead');
  sheet.addEventListener('touchstart', (e) => { y0 = handle(e.target) ? e.touches[0].clientY : -1; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 < 0) return;
    const dy = Math.max(0, e.touches[0].clientY - y0);
    sheet.style.transition = 'none'; sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', (e) => {
    if (y0 < 0) return;
    const dy = e.changedTouches[0].clientY - y0; y0 = -1;
    sheet.style.transition = ''; sheet.style.transform = '';
    if (dy > 70) closePhone();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && phoneOpen()) closePhone(); });
}

export function initAppShell(): void {
  const t0 = performance.now();
  const done = () => setTimeout(hideSplash, Math.max(0, SPLASH_MIN_MS - (performance.now() - t0)));
  if (document.fonts?.ready) document.fonts.ready.then(done, done); else done();
  setTimeout(hideSplash, 2500); // never let a slow font keep the splash up
  registerServiceWorker();
  setupInstall();
  setupHaptics();
  setupSheetGestures();
}
