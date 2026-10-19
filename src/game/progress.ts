import { G, save } from '../core/state';
import { sfx } from '../core/audio';
import { ACH } from '../data/content';
import { toast } from '../ui/toast';
import { updHUD } from '../ui/hud';
import { addCash } from './economy';

export function setupObjectives(): void {
  G.obj = [
    { id: 'meter', t: 'Open your phone → NextPawa app and check your units', done: false, rw: 300 },
    { id: 'buy', t: 'Buy at least 5 electricity units on NextPawa (game money)', done: false, rw: 500 },
    { id: 'blackout', t: 'Survive your first blackout', done: false, rw: 500 },
    { id: 'greet', t: 'Greet a neighbour (tap them on the street)', done: false, rw: 300 },
    { id: 'fund', t: 'Contribute to a street fund when asked', done: false, rw: 600 },
    { id: 'gen', t: 'Run your generator (if you own one)', done: false, rw: 400 },
    { id: 'visit', t: 'Visit another place (open the Map)', done: false, rw: 300 },
  ];
}

export function checkObj(id: string): void {
  const o = G.obj.find((x) => x.id === id && !x.done); if (!o) return;
  o.done = true; addCash(o.rw, 'Tutorial reward');
  toast(`✅ Objective done: <i>${o.t}</i> — +₦${o.rw}!`, 'sys'); sfx.cash(); save(); updHUD();
}

export function checkAch(): void {
  ACH.forEach((a) => {
    if (!G.ach.includes(a.id) && a.ck(G)) {
      G.ach.push(a.id);
      toast(`🏆 <b>Achievement: ${a.n}</b><br><span style="font-size:11.5px">${a.d}</span>`, 'sys'); sfx.cheer(); save();
    }
  });
}
