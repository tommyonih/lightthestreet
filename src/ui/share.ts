/* Share sheet: preview the card, then download it or hand it to the device's share menu. */
import { G } from '../core/state';
import type { WeekState } from '../core/types';
import { onShareWeek } from '../game/challenges';
import { renderShareCard, type CardKind } from '../render/shareCard';
import { openModal } from './modal';
import { toast } from './toast';

function fileName(card: CardKind): string {
  const who = G.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'resident';
  return card.kind === 'week' ? `light-up-the-street-${who}-week-${card.week.n}.png` : `light-up-the-street-${who}-day-${G.day}.png`;
}

function download(canvas: HTMLCanvasElement, name: string): void {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png'); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  toast('🖼️ Card saved! Go post am for your people.', 'sys');
}

async function share(canvas: HTMLCanvasElement, name: string): Promise<void> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  const file = blob && new File([blob], name, { type: 'image/png' });
  if (file && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text: 'My street don dey test me 😂 #LightUpTheStreet' }); return; }
    catch { return; } // user closed the share sheet
  }
  download(canvas, name);
}

export const canNativeShare = (): boolean => typeof navigator.share === 'function';

/** In 3D mode the card carries a 3D portrait of you; otherwise (or if 3D can't load) the 2D drawing. */
async function portrait(): Promise<HTMLCanvasElement | undefined> {
  if (!document.body.classList.contains('v3d')) return undefined;
  try {
    const m = await import('../render3d/portrait');
    return m.snapshot({ skin: G.skin, hair: G.hair, outfit: G.outfit, gender: G.gender }, 560, 760, G.happiness >= 50 ? 'happy' : 'neutral');
  } catch { return undefined; }
}

export function openShareSheet(card: CardKind): void { void portrait().then((pic) => showSheet(card, pic)); }

function showSheet(card: CardKind, pic?: HTMLCanvasElement): void {
  const canvas = renderShareCard(card, undefined, pic), name = fileName(card);
  const preview = `<img src="${canvas.toDataURL('image/png')}" alt="Your share card" style="width:100%;border-radius:12px;border:1px solid var(--line)">`;
  openModal(card.kind === 'week' ? `🖼️ Week ${card.week.n} card` : '🖼️ Your street card', preview, [
    ...(canNativeShare() ? [{ t: '📤 Share', fn: () => { void share(canvas, name); } }] : []),
    { t: '⬇️ Download PNG', fn: () => download(canvas, name) },
    { t: 'Close' },
  ]);
}

/** Wire the weekly summary's "Make my week card" button. */
export function initShare(): void { onShareWeek((week: WeekState) => openShareSheet({ kind: 'week', week })); }
