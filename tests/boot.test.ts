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

  window.history.replaceState({}, '', '/game'); // the app's entry route; the root is a blank landing page
  await import('../src/main');
  const state = await import('../src/core/state');
  const click = (sel: string) => (document.querySelector(sel) as HTMLElement).click();
  const active = () => document.querySelector('.screen.active')!.id;

  expect(active()).toBe('scr-welcome');
  click('#btnSoundW'); // menu sound toggle must not create or save a game
  expect(localStorage.getItem('luts_save_v1')).toBeNull();
  // no Supabase in tests, so no account: "Play free" goes straight to the age check
  click('#btnPlay'); expect(active()).toBe('scr-age');
  const dob = [...document.querySelectorAll<HTMLSelectElement>('#dobAge select')];
  click('#btnAgeYes'); expect(active()).toBe('scr-age'); // nothing picked yet
  [dob[0].value, dob[1].value, dob[2].value] = ['12', '2', String(new Date().getFullYear() - 16)];
  click('#btnAgeYes'); expect(document.querySelector('#ageNote')!.textContent).toContain('18');
  dob[2].value = '2000';
  click('#btnAgeYes'); expect(document.querySelector('#evTitle')!.textContent).toBe('Are you sure?');
  (document.querySelector('#evChoices button') as HTMLElement).click();
  expect(active()).toBe('scr-create');
  expect(document.querySelectorAll('#crGrid .tileOpt').length).toBeGreaterThan(1);
  click('#crRandom'); click('#crUndo');
  click('#btnEnter'); // look → about you
  const name = document.querySelector('#inpName') as HTMLInputElement;
  name.value = 'Smallie'; name.dispatchEvent(new Event('input'));
  click('#btnEnter'); expect(active()).toBe('scr-birth');
  vi.advanceTimersByTime(2000); // the dice roll
  click('#btnBirthGo'); expect(active()).toBe('scr-game');
  expect(state.G.name).toBe('Smallie');
  expect(['net', 'local']).toContain(state.G.birth);

  vi.advanceTimersByTime(15_000); // through the scripted blackout
  expect(state.G.stats.blackouts).toBe(1);
  expect(document.querySelector('#modal')!.classList.contains('open')).toBe(true);
  expect(document.querySelector('#evTitle')!.textContent).toContain('Power');
  (document.querySelector('#evChoices button:last-child') as HTMLElement).click(); // sit outside
  vi.advanceTimersByTime(40_000);
  expect(state.G.intro).toBe(99);
  expect(document.querySelector('#pillTime')!.textContent).toContain('Day 1');

  click('#btnPhoneHud');
  expect(document.querySelector('#phone')!.classList.contains('open')).toBe(true);
  expect(state.G.obj.find((o) => o.id === 'meter')!.done).toBe(true);
  vi.useRealTimers();
});
