/* The birth roll on screen: a short dice shake, then the card that says where you were born and what you start with. */
import { SET } from '../core/state';
import { $, fmt } from '../core/util';
import { BIRTHS, STREET_TYPES } from '../data/content';
import { bgName, rollBirth, type BirthPack } from '../game/birth';
import { sfx } from '../core/audio';
import { show } from './screens';

const ROLL_MS = 1400;

/** Roll, reveal, and hand the pack to `go` when the player taps "Start my life". */
export function revealBirth(go: (p: BirthPack) => void): void {
  const p = rollBirth(), b = BIRTHS[p.birth];
  const card = $('#birthCard'), btn = $<HTMLButtonElement>('#btnBirthGo');
  card.className = 'card birthCard rolling';
  $('#birthDice').textContent = '🎲'; $('#birthTitle').textContent = 'Rolling your birth…';
  $('#birthDesc').textContent = 'Net Baby or Local Baby? Nobody chooses where they are born.';
  $('#birthStats').innerHTML = ''; btn.hidden = true;
  show('scr-birth');
  setTimeout(() => {
    card.className = `card birthCard ${p.birth}`;
    $('#birthDice').textContent = b.emoji;
    $('#birthTitle').textContent = `You were born a ${b.n}`;
    $('#birthDesc').textContent = b.d;
    const street = STREET_TYPES.find((s) => s.id === p.streetType)?.n ?? '';
    const rows: [string, string, string?][] = [
      ['Cash', '₦' + fmt(p.cash)],
      ['Meter', p.units + ' units'],
      ['Life', bgName(p.bg)],
      ['Street', street],
      ['Generator', p.gen === 2 ? 'Big, quiet' : p.gen === 1 ? 'Small' : 'None'],
    ];
    if (p.inverter) rows.push(['Backup', 'Inverter']);
    if (p.debt) rows.push(['Debt', '₦' + fmt(p.debt), 'bad']);
    $('#birthStats').innerHTML = rows.map(([k, v, cls]) => `<div class="bs${cls ? ' ' + cls : ''}"><span>${k}</span><b>${v}</b></div>`).join('');
    btn.hidden = false; btn.onclick = () => go(p);
    if (p.birth === 'net') sfx.cheer(); else sfx.bad();
  }, SET.motion ? ROLL_MS : 0);
}
