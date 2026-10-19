/* The shareable image: a 1080×1350 portrait card (fits Instagram/WhatsApp/X feeds). */
import { G } from '../core/state';
import { fmt } from '../core/util';
import type { WeekState } from '../core/types';
import { ACH, BGS } from '../data/content';
import { challenge } from '../game/challenges';
import { drawPreview } from './preview';

export const CARD_W = 1080, CARD_H = 1350;

export type CardKind = { kind: 'session' } | { kind: 'week'; week: WeekState };

export function statusLine(): string {
  return G.streetlightFixed ? '💡 LIGHT UP THE STREET — MISSION COMPLETE!'
    : G.happiness >= 60 ? '⚡ LIGHT DON COME… FOR NOW.' : '😩 THE STREET DEY TEST YOU.';
}

/** The card's banner (the title already says "Light Up the Street"). */
function bannerLine(): string {
  return G.streetlightFixed ? 'MISSION COMPLETE — THE STREET DON LIGHT!'
    : G.happiness >= 60 ? 'LIGHT DON COME… FOR NOW.' : 'THE STREET DEY TEST ME.';
}

/* Score marks are drawn as shapes, so they never depend on the device having a symbol font. */
function star(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, filled: boolean): void {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r;
    x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.closePath();
  if (filled) { x.fillStyle = '#ffd97a'; x.fill(); } else { x.strokeStyle = '#ffd97a'; x.lineWidth = 4; x.stroke(); }
}

function mark(x: CanvasRenderingContext2D, cx: number, cy: number, ok: boolean): void {
  x.strokeStyle = ok ? '#5fd068' : '#ff6b6b'; x.lineWidth = 8; x.lineCap = 'round'; x.beginPath();
  if (ok) { x.moveTo(cx - 16, cy); x.lineTo(cx - 4, cy + 13); x.lineTo(cx + 18, cy - 14); }
  else { x.moveTo(cx - 13, cy - 13); x.lineTo(cx + 13, cy + 13); x.moveTo(cx + 13, cy - 13); x.lineTo(cx - 13, cy + 13); }
  x.stroke();
}

/** `avatar`: a portrait of the player to use instead of the 2D drawing (the 3D view passes one). */
export function renderShareCard(card: CardKind, canvas: HTMLCanvasElement = document.createElement('canvas'), avatar?: HTMLCanvasElement): HTMLCanvasElement {
  canvas.width = CARD_W; canvas.height = CARD_H;
  const x = canvas.getContext('2d')!;
  const font = (w: number, px: number) => `${w} ${px}px "Segoe UI", system-ui, sans-serif`;

  // night sky
  const sky = x.createLinearGradient(0, 0, 0, CARD_H);
  sky.addColorStop(0, '#0b1026'); sky.addColorStop(.6, '#1e2433'); sky.addColorStop(1, '#2a1a10');
  x.fillStyle = sky; x.fillRect(0, 0, CARD_W, CARD_H);
  x.fillStyle = 'rgba(255,255,255,.7)';
  for (let i = 0; i < 60; i++) x.fillRect((i * 173) % CARD_W, (i * 97) % 420, 3, 3);

  // title
  x.textAlign = 'center';
  x.fillStyle = '#ffb347'; x.font = font(900, 76); x.fillText('LIGHT UP THE STREET', CARD_W / 2, 120);
  x.fillStyle = '#b9b2a0'; x.font = font(600, 34);
  x.fillText(card.kind === 'week' ? `Week ${card.week.n} challenge card` : `My street report — Day ${G.day}`, CARD_W / 2, 172);

  // player
  const pic = avatar ?? document.createElement('canvas');
  if (!avatar) { pic.width = 140; pic.height = 190; drawPreview(pic, { name: null, skin: G.skin, hair: G.hair, outfit: G.outfit }); }
  x.save(); x.beginPath();
  if (x.roundRect) x.roundRect(80, 220, 280, 380, 28); else x.rect(80, 220, 280, 380); // older browsers
  x.clip();
  if (avatar) { // the 3D portrait is transparent: give it the preview's backdrop
    const g = x.createLinearGradient(0, 220, 0, 600); g.addColorStop(0, '#25304d'); g.addColorStop(1, '#141a2c');
    x.fillStyle = g; x.fillRect(80, 220, 280, 380);
  }
  x.drawImage(pic, 80, 220, 280, 380); x.restore();
  x.textAlign = 'left';
  x.fillStyle = '#f5eeda'; x.font = font(800, 64); x.fillText(G.name, 400, 300);
  x.fillStyle = '#b9b2a0'; x.font = font(600, 32); x.fillText(BGS.find((b) => b.id === G.bg)?.n ?? '', 400, 350);
  const badges = [
    G.policies.youChair ? '🎖️ Street Chairman' : '',
    G.streetlightFixed ? '💡 Lit the streetlight' : '',
    G.solar > 0 ? '☀️ Solar power' : '',
    `🏆 ${G.ach.length}/${ACH.length} achievements`,
  ].filter(Boolean);
  x.font = font(700, 34); x.fillStyle = '#ffd97a';
  badges.slice(0, 4).forEach((b, i) => x.fillText(b, 400, 420 + i * 50));

  // body: stats or this week's challenges
  const top = 650;
  if (card.kind === 'session') {
    const s = G.stats;
    const tiles: [string, string][] = [
      [String(s.blackouts), 'blackouts survived'], [String(s.restores), 'times “UP NEPA!”'],
      [String(s.helped), 'neighbours helped'], [String(s.votesWon), 'street votes won'],
      ['₦' + fmt(s.spent), 'spent (virtual)'], [String(s.challengesDone), 'challenges done'],
    ];
    tiles.forEach(([big, small], i) => {
      const cx = 80 + (i % 2) * 470, cy = top + Math.floor(i / 2) * 150;
      x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(cx, cy, 450, 130);
      x.fillStyle = '#ffb347'; x.font = font(900, 58); x.fillText(big, cx + 28, cy + 70);
      x.fillStyle = '#b9b2a0'; x.font = font(600, 28); x.fillText(small, cx + 28, cy + 110);
    });
  } else {
    const w = card.week, done = w.list.filter((i) => i.state === 'done').length;
    w.list.forEach((_, i) => star(x, 115 + i * 78, top + 30, 32, i < done));
    x.fillStyle = '#ffd97a'; x.font = font(900, 56); x.fillText(`${done}/${w.list.length}`, 80 + w.list.length * 78 + 20, top + 50);
    w.list.forEach((item, i) => {
      const cy = top + 90 + i * 120, ok = item.state === 'done';
      x.fillStyle = ok ? 'rgba(95,208,104,.15)' : 'rgba(255,107,107,.12)'; x.fillRect(80, cy, 920, 100);
      mark(x, 125, cy + 50, ok);
      x.fillStyle = '#f5eeda'; x.font = font(700, 38); x.fillText(challenge(item.id).title, 170, cy + 62);
    });
  }

  // status banner
  x.textAlign = 'center';
  x.fillStyle = 'rgba(255,179,71,.15)'; x.fillRect(0, 1105, CARD_W, 80);
  x.fillStyle = '#5fd068'; x.font = font(900, 38);
  x.fillText(bannerLine(), CARD_W / 2, 1158);

  // street skyline: windows lit if the street got its light, plus festive bulbs once the streetlight is fixed
  const lit = G.streetlightFixed || G.gridOn;
  for (let i = 0; i < 6; i++) {
    const hx = 20 + i * 180, hw = 160;
    x.fillStyle = ['#c98f5f', '#d9b380', '#e0c084', '#caa06a', '#d4a76a', '#c98f5f'][i]; x.fillRect(hx, 1225, hw, 125);
    x.fillStyle = lit ? '#ffdf8e' : '#24304a'; x.fillRect(hx + 22, 1250, 40, 34); x.fillRect(hx + hw - 62, 1250, 40, 34);
  }
  if (G.streetlightFixed) {
    x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 1200);
    for (let px = 0; px <= CARD_W; px += 20) x.lineTo(px, 1200 + Math.sin(px / CARD_W * Math.PI * 6) * 8);
    x.stroke();
    ['#ffdf8e', '#ff8c42', '#5fd068', '#5aa9ff'].forEach((c, k) => {
      x.fillStyle = c;
      for (let px = 30 + k * 30; px < CARD_W; px += 120) { x.beginPath(); x.arc(px, 1208 + Math.sin(px / CARD_W * Math.PI * 6) * 8, 7, 0, 7); x.fill(); }
    });
  }
  x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, 1305, CARD_W, 45);
  x.fillStyle = '#f5eeda'; x.font = font(600, 24);
  x.fillText('All money & units are fictional • Free to play • #LightUpTheStreet', CARD_W / 2, 1336);
  return canvas;
}
