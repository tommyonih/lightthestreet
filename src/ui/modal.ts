import { $ } from '../core/util';
import type { Choice } from '../core/types';

/** True while a decision is on screen — the simulation pauses so every event is a real choice. */
export let modalOpen = false;

type Driver = (title: string, desc: string, choices: Choice[]) => void;
let driver: Driver | null = null;
/** Tests install a driver that answers modals automatically instead of rendering them. */
export function setModalDriver(d: Driver | null): void { driver = d; }

export function openModal(title: string, desc: string, choices: Choice[]): void {
  if (driver) { driver(title, desc, choices); return; }
  modalOpen = true; $('#evTitle').innerHTML = title; $('#evDesc').innerHTML = desc;
  const box = $('#evChoices'); box.innerHTML = '';
  choices.forEach((c) => {
    const b = document.createElement('button'); b.className = 'btn small';
    b.innerHTML = c.t + (c.sub ? `<div class="evSub">${c.sub}</div>` : '');
    if (c.dis) b.disabled = true;
    b.onclick = () => { closeModal(); c.fn?.(); };
    box.appendChild(b);
  });
  $('#modal').classList.add('open');
}

export function closeModal(): void { modalOpen = false; $('#modal')?.classList.remove('open'); }
