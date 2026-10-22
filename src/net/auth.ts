/* Accounts: email/password and Google. Required to play when Supabase is configured (see main.ts).
   Inside nextpawa.com the game runs in an iframe on the same origin and the same Supabase project, so it shares
   the site's session: sign in on either and you're signed in on both. Google won't load in an iframe, so its
   sign-in navigates the top window, and comes back through the site's /auth/callback when VITE_AUTH_RETURN is set. */
import type { User } from '@supabase/supabase-js';
import { cloudEnabled, sb } from './supabase';

export type AuthResult = 'ok' | 'check-email' | { error: string };

let user: User | null = null;
const listeners: ((u: User | null) => void)[] = [];
export const currentUser = (): User | null => user;
/** Called on sign-in, sign-out and once at boot with the restored session (or null). Returns an unsubscribe. */
export function onAuth(fn: (u: User | null) => void): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

/** The host page's own auth callback (e.g. "/auth/callback"), when the game is embedded in a site that has one. */
const HOST_RETURN = import.meta.env.VITE_AUTH_RETURN as string | undefined;
/** Where the host's callback sends people once they're in. It reads this from localStorage (same origin). */
const NEXT_KEY = 'nextpawa_auth_next';
/** The host page the game lives on, e.g. "/game". */
const HOST_PAGE = (import.meta.env.VITE_HOST_PAGE as string | undefined) || '/game';

let topWin: Window = window;
try { if (window.top && window.top.location.origin === location.origin) topWin = window.top; } catch { /* cross-origin parent: stay in the frame */ }
const embedded = topWin !== window;

/** Where Supabase sends people back after Google or an email link. Must be in the project's redirect URLs. */
function returnUrl(next: string): string {
  if (HOST_RETURN) {
    try { localStorage.setItem(NEXT_KEY, next); } catch { /* storage blocked: the callback falls back to its default */ }
    return location.origin + HOST_RETURN;
  }
  return location.origin + location.pathname + (next.includes('?') ? next.slice(next.indexOf('?')) : '');
}

/** Resolves once the session is known: the user, or null when signed out. Never hangs on a dead network. */
export function whenAuthReady(): Promise<User | null> {
  if (!cloudEnabled()) return Promise.resolve(null);
  if (ready) return Promise.resolve(user);
  return new Promise((res) => {
    const stop = onAuth((u) => { stop(); res(u); });
    setTimeout(() => { stop(); res(user); }, 4000);
  });
}

let ready = false;
/** Set when the page was opened from a password-reset email: the UI asks for a new password. */
export let recovering = new URLSearchParams(location.search).has('reset');
export const doneRecovering = (): void => { recovering = false; };

export async function initAuth(): Promise<void> {
  if (!cloudEnabled()) return;
  const s = await sb();
  s.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') recovering = true;
    const u = session?.user ?? null;
    if (ready && u?.id === user?.id) { user = u; return; } // token refresh, same person
    user = u; ready = true;
    // Supabase warns against awaiting its own calls inside this callback, and listeners do, so hop out first
    setTimeout(() => listeners.forEach((f) => f(u)), 0);
  });
  // the hash from an email link or Google is consumed by now; tidy the address bar
  if (location.hash.includes('access_token') || location.search.includes('reset')) history.replaceState(null, '', location.pathname);
}

const fail = (e: { message: string }): AuthResult => ({ error: friendly(e.message) });
export function friendly(msg: string): string {
  if (/invalid login/i.test(msg)) return 'That email and password don\'t match.';
  if (/already registered|already been registered/i.test(msg)) return 'This email already has an account. Log in instead.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first. Check your inbox.';
  if (/rate limit|too many/i.test(msg)) return 'Too many tries. Wait a minute and try again.';
  if (/password.*(short|least|weak)/i.test(msg)) return 'Pick a longer password (at least 8 characters).';
  if (/fetch|network/i.test(msg)) return 'No connection. Check your internet and try again.';
  return msg;
}

export async function signInEmail(email: string, password: string): Promise<AuthResult> {
  const { error } = await (await sb()).auth.signInWithPassword({ email, password });
  return error ? fail(error) : 'ok';
}

export interface Profile { name: string; username: string; dob: string }
/** With "Confirm email" on in Supabase (the default) there's no session until they click the link. */
export async function signUpEmail(email: string, password: string, p: Profile): Promise<AuthResult> {
  const { data, error } = await (await sb()).auth.signUp({
    email, password,
    options: { data: { display_name: p.username, full_name: p.name, username: p.username, dob: p.dob }, emailRedirectTo: returnUrl(HOST_PAGE) },
  });
  if (error) return fail(error);
  return data.session ? 'ok' : 'check-email';
}

/** Leaves the page for Google. Built synchronously so the navigation keeps the tap's user activation,
    which a sandboxed iframe needs to move the top window. Implicit flow: no code verifier to carry across. */
export function signInGoogle(): AuthResult {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const to = returnUrl(HOST_PAGE);
  const href = `${url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(to)}`;
  try { (embedded ? topWin : window).location.href = href; } catch { window.open(href, '_top'); }
  return 'ok';
}

export async function sendReset(email: string): Promise<AuthResult> {
  const { error } = await (await sb()).auth.resetPasswordForEmail(email, { redirectTo: returnUrl(HOST_PAGE + '?reset=1') });
  return error ? fail(error) : 'ok';
}

export async function setPassword(password: string): Promise<AuthResult> {
  const { error } = await (await sb()).auth.updateUser({ password });
  return error ? fail(error) : 'ok';
}

/** Save the date of birth on the account (Google sign-ups don't come with one). */
export async function saveDob(dob: string): Promise<void> {
  const { data } = await (await sb()).auth.updateUser({ data: { dob } });
  if (data.user) user = data.user;
}

export async function signOut(): Promise<void> { await (await sb()).auth.signOut(); }

/** The player's handle: their username, else the start of their email. */
export function handle(u: User | null): string {
  const m = u?.user_metadata ?? {};
  return String(m.username || m.display_name || u?.email?.split('@')[0] || '').replace(/[^\w.]/g, '').slice(0, 20);
}
