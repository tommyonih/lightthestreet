/* Boots the real entry point and clicks through onboarding into a running game. */
import html from '../index.html?raw';
import { expect, it, vi } from 'vitest';

it('boots, walks through onboarding, and the street comes alive', async () => {
  vi.useFakeTimers();
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script'));
  // jsdom has no canvas; hand the renderer a context that accepts every call.
  const noop = () => {};
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : noop });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];

  await import('../src/main');
  const state = await import('../src/core/state');
  const click = (sel: string) => (document.querySelector(sel) as HTMLElement).click();
  const active = () => document.querySelector('.screen.active')!.id;

  expect(active()).toBe('scr-welcome');
  click('#btnSoundW'); // menu sound toggle must not create or save a game
  expect(localStorage.getItem('luts_save_v1')).toBeNull();
  click('#btnPlay'); expect(active()).toBe('scr-age');
  click('#btnAgeYes'); expect(active()).toBe('scr-create');
  const name = document.querySelector('#inpName') as HTMLInputElement;
  name.value = 'Smallie'; name.dispatchEvent(new Event('input'));
  click('#btnEnter'); expect(active()).toBe('scr-game');
  expect(state.G.name).toBe('Smallie');

  vi.advanceTimersByTime(15_000); // through the scripted blackout
  expect(state.G.stats.blackouts).toBe(1);
  expect(document.querySelector('#modal')!.classList.contains('open')).toBe(true);
  expect(document.querySelector('#evTitle')!.textContent).toContain('Light Don Go');
  (document.querySelector('#evChoices button:last-child') as HTMLElement).click(); // sit outside
  vi.advanceTimersByTime(40_000);
  expect(state.G.intro).toBe(99);
  expect(document.querySelector('#pillTime')!.textContent).toContain('Day 1');

  click('#btnPhoneHud');
  expect(document.querySelector('#phone')!.classList.contains('open')).toBe(true);
  expect(state.G.obj.find((o) => o.id === 'meter')!.done).toBe(true);
  vi.useRealTimers();
});
