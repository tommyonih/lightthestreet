/* Small touches that make the HUD feel alive: cash that rolls to its new value, ₦ coins that fly to it when you
   get paid, and the background sound for wherever you are. All respect SET.motion / SET.sound. */
import { G, SET } from '../core/state';
import { fmt } from '../core/util';
import { setAmbience, type Bed } from '../core/audio';
import { isOpen } from '../game/world';

let shown = NaN, target = NaN, raf = 0;
/** Cash text rolls from what it showed to the new amount over ~0.5s (or jumps, with motion off). */
export function rollCash(el: HTMLElement, cash: number): void {
  if (Number.isNaN(shown) || !SET.motion) { shown = target = cash; el.textContent = '₦' + fmt(cash); return; }
  if (cash === target) return;
  const from = shown, t0 = performance.now(); target = cash;
  cancelAnimationFrame(raf);
  const step = () => {
    const f = Math.min(1, (performance.now() - t0) / 500), e = 1 - (1 - f) ** 3;
    shown = Math.round(from + (target - from) * e); el.textContent = '₦' + fmt(shown);
    if (f < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

/** A little shower of ₦ coins from the street view to the cash pill. */
export function flyCoins(amount: number): void {
  if (!SET.motion || amount < 50) return;
  const from = document.getElementById('stage')?.getBoundingClientRect(), to = document.getElementById('pillCash')?.getBoundingClientRect();
  if (!from || !to || !from.width) return;
  const n = Math.min(7, 2 + Math.floor(amount / 300));
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div'); c.className = 'coin'; c.textContent = '₦';
    const x0 = from.left + from.width * (.4 + Math.random() * .2), y0 = from.top + from.height * (.45 + Math.random() * .2);
    c.style.left = x0 + 'px'; c.style.top = y0 + 'px';
    document.body.appendChild(c);
    const dx = to.left + to.width / 2 - x0, dy = to.top + to.height / 2 - y0;
    c.animate([
      { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
      { transform: `translate(calc(-50% + ${dx * .3}px), calc(-50% + ${dy * .3 - 60}px)) scale(1.1)`, opacity: 1, offset: .35 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)`, opacity: .9 },
    ], { duration: 700 + i * 70, delay: i * 60, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' }).onfinish = () => c.remove();
  }
}

/** Which background beds fit where you are (or where you're heading) and the weather. */
export function updAmbience(): void {
  const at = G.trip ? G.trip.to : G.loc, want: Bed[] = [];
  if (G.weather === 'storm') want.push('storm'); else if (G.weather === 'rain') want.push('rain');
  if (at === 'market' && isOpen('market')) want.push('market');
  if (at === 'junction') want.push('junction');
  if (at === 'fuel') want.push('fuel');
  if (at === 'campus' && isOpen('campus')) want.push('campus');
  if (at === 'church' && isOpen('church')) want.push('church');
  setAmbience(want);
}
