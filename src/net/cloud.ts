/* Cloud save and street reports for signed-in players. localStorage stays the source of truth while playing;
   the cloud copy is pushed a few seconds after saves and pulled at sign-in. The furthest-along save wins. */
import { G, T, gameTime, hasGame, loadSave, migrate, onSave, storeSave } from '../core/state';
import type { Stats } from '../core/types';
import type { User } from '@supabase/supabase-js';
import { onWeekEnd } from '../game/challenges';
import { renderShareCard, type CardKind } from '../render/shareCard';
import { currentUser, initAuth, onAuth } from './auth';
import { cloudEnabled, sb } from './supabase';

/** Saves happen every few seconds while playing; batch them into one upload. */
const PUSH_DELAY_MS = 10_000;
const CARD_URL_TTL_S = 60 * 60;

let timer = 0;
let syncedName = '';

async function ensureProfile(u: User): Promise<void> {
  const s = await sb();
  const { data, error } = await s.from('profiles').select('id').eq('id', u.id).maybeSingle();
  if (error) { console.warn('profile lookup failed:', error.message); return; }
  if (data) return;

  const meta = u.user_metadata ?? {};
  const metaString = (key: string): string => typeof meta[key] === 'string' ? meta[key] : '';
  const displayName = (metaString('display_name') || metaString('full_name') || metaString('name') || u.email?.split('@')[0] || 'Resident').slice(0, 40);
  const { error: insertError } = await s.from('profiles').insert({
    id: u.id,
    display_name: displayName,
    full_name: metaString('full_name') || metaString('name') || displayName,
    email: u.email ?? '',
    phone: metaString('phone'),
  });
  if (insertError) console.warn('profile creation failed:', insertError.message);
}

async function push(): Promise<void> {
  timer = 0;
  const u = currentUser(); if (!u || !hasGame()) return;
  const s = await sb();
  const { error } = await s.from('saves').upsert({ user_id: u.id, ver: G.ver, game_time: T(), data: G });
  if (error) { console.warn('cloud save failed:', error.message); return; }
  if (G.name !== syncedName) {
    const { error: e } = await s.from('profiles').update({ display_name: G.name.slice(0, 40) || 'Resident' }).eq('id', u.id);
    if (!e) syncedName = G.name;
  }
}

function schedulePush(): void { if (!timer && currentUser()) timer = window.setTimeout(() => void push(), PUSH_DELAY_MS); }
/** Push now instead of waiting (app going to the background). */
function flush(): void { if (timer) { clearTimeout(timer); void push(); } }

/** Bring the cloud save down if it's further along than this device's. True if the local save changed. */
export async function pullSave(): Promise<boolean> {
  const u = currentUser(); if (!u || hasGame()) return false; // never swap a save out from under a running game
  const { data, error } = await (await sb()).from('saves').select('data, game_time').eq('user_id', u.id).maybeSingle();
  if (error || !data) return false;
  const local = loadSave();
  if (local && gameTime(local) >= data.game_time) return false;
  storeSave(migrate(data.data));
  return true;
}

/** "Start fresh" wipes the cloud copy too, or the next sign-in would bring the old street back. */
export async function deleteCloudSave(): Promise<void> {
  const u = currentUser(); if (!u) return;
  await (await sb()).from('saves').delete().eq('user_id', u.id);
}

/** Upload the share card and file a report row. Quietly does nothing when signed out. */
export async function fileReport(card: CardKind): Promise<boolean> {
  const u = currentUser(); if (!u || !hasGame()) return false;
  const s = await sb();
  const blob = await new Promise<Blob | null>((res) => renderShareCard(card).toBlob(res, 'image/png'));
  let cardPath: string | null = null;
  if (blob) {
    const path = `${u.id}/${card.kind}-${Date.now()}.png`;
    const { error } = await s.storage.from('cards').upload(path, blob, { contentType: 'image/png' });
    if (!error) cardPath = path;
  }
  const { error } = await s.from('reports').insert({
    kind: card.kind, day: G.day, week: card.kind === 'week' ? card.week.n : G.week.n, card_path: cardPath,
    cash: Math.round(G.cash), blackouts: G.stats.blackouts, happiness: Math.round(G.happiness), trust: Math.round(G.trust),
    stats: G.stats,
  });
  if (error) console.warn('report failed:', error.message);
  return !error;
}

export interface Report {
  id: string; kind: 'session' | 'week'; day: number; week: number | null;
  cash: number; blackouts: number; happiness: number; trust: number; stats: Stats; created_at: string;
  /** Signed link to the share card (the bucket is private), valid for an hour. */
  cardUrl: string | null;
}

/** The player's reports, newest first. */
export async function listReports(limit = 20): Promise<Report[]> {
  if (!currentUser()) return [];
  const s = await sb();
  const { data, error } = await s.from('reports').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error || !data) return [];
  const paths = data.map((r) => r.card_path).filter((p): p is string => !!p);
  const signed = paths.length ? (await s.storage.from('cards').createSignedUrls(paths, CARD_URL_TTL_S)).data ?? [] : [];
  const urls = new Map(signed.map((x) => [x.path, x.signedUrl]));
  return data.map(({ card_path, user_id: _u, ...r }) => ({ ...r, cardUrl: (card_path && urls.get(card_path)) || null }));
}

/** Wire sync into the game. `onPulled` runs when a newer cloud save landed in localStorage. */
export function initCloud(onPulled: () => void): void {
  if (!cloudEnabled()) return;
  onSave(schedulePush);
  onWeekEnd((week) => { void fileReport({ kind: 'week', week }); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  onAuth((u) => {
    if (u) void ensureProfile(u).then(() => pullSave()).then((changed) => { if (changed) onPulled(); })
      .catch((e: unknown) => console.warn('account setup failed:', e));
  });
  initAuth().catch((e) => console.warn('auth unavailable:', e));
}
