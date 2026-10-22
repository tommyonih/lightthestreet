/* Our products, up close: what opens when you tap a billboard, a headquarters on the city map, or a chip on the
   welcome screen. In a game, it offers the in-game version (game money); the real site is a separate, optional link. */
import { G, hasGame } from '../core/state';
import { esc } from '../core/util';
import { ADS, PARTNERS, type PartnerId } from '../data/content';
import { partnerLink } from '../game/economy';
import { adUrl } from '../render/ads';
import { openModal } from './modal';
import type { Choice } from '../core/types';

/** What each product does in the game, and where in the phone it lives. */
const IN_GAME: Partial<Record<PartnerId, { what: string; tab: string; t: string }>> = {
  nextpawa: { what: 'In the game, NextPawa sells electricity units and mobile data. Tokens land instantly, with a receipt.', tab: 'meter', t: '⚡ Buy units in the game' },
  verispon: { what: 'In the game, Verispon holds your money on online deals until your item arrives. No item, full refund.', tab: 'shop', t: '🛡️ See today\'s online deals' },
};

let openTab: (tab: string) => void = () => {};
/** The phone lives higher up in ui/; main.ts hands it over. */
export function initProducts(open: (tab: string) => void): void { openTab = open; }

export function openProduct(id: PartnerId, variant = 0): void {
  const p = PARTNERS[id], ad = ADS[id][variant % ADS[id].length], game = IN_GAME[id], img = adUrl(id, variant);
  const real = partnerLink(id, `Visit ${p.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}`);
  const desc = `${img ? `<img class="adImg" src="${img}" alt="${esc(p.name)}: ${esc(ad.headline)}">` : ''}
    <p class="adLine"><b>${esc(p.tagline)}</b></p>
    ${game ? `<p class="adWhat">${game.what}</p>` : `<p class="adWhat">${esc(p.name)} is coming to the game soon.</p>`}
    ${real ? `<p class="adReal">${real}<br><span>The real ${esc(p.name)} is separate and optional. You never need it to play.</span></p>` : ''}`;
  const choices: Choice[] = [];
  if (game && hasGame() && G.intro >= 99) choices.push({ t: game.t, fn: () => openTab(game.tab) });
  choices.push({ t: 'Close' });
  openModal(`${p.name}`, desc, choices);
}
