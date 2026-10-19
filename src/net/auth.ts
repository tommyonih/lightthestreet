/* Accounts: email/password and Google. Optional — the game plays the same signed out. */
import type { User } from '@supabase/supabase-js';
import { cloudEnabled, sb } from './supabase';

export type AuthResult = 'ok' | 'check-email' | { error: string };

let user: User | null = null;
const listeners: ((u: User | null) => void)[] = [];
export const currentUser = (): User | null => user;
/** Called on sign-in, sign-out and once at boot with the restored session (or null). */
export function onAuth(fn: (u: User | null) => void): void { listeners.push(fn); }

/** Where Supabase sends people back after Google or an email confirmation link. Add it to the project's redirect URLs. */
const redirectTo = (): string => location.origin + location.pathname;

export async function initAuth(): Promise<void> {
  if (!cloudEnabled()) return;
  const s = await sb();
  s.auth.onAuthStateChange((_event, session) => {
    const u = session?.user ?? null;
    if (u?.id === user?.id) { user = u; return; } // token refresh, same person
    user = u;
    // Supabase warns against awaiting its own calls inside this callback, and listeners do, so hop out first
    setTimeout(() => listeners.forEach((f) => f(u)), 0);
  });
  // the PKCE exchange is done by now; drop ?code= so a refresh doesn't try to reuse it
  const url = new URL(location.href);
  if (url.searchParams.has('code')) { url.searchParams.delete('code'); history.replaceState(null, '', url); }
}

const fail = (e: { message: string }): AuthResult => ({ error: friendly(e.message) });
function friendly(msg: string): string {
  if (/invalid login/i.test(msg)) return 'Email or password no correct.';
  if (/already registered/i.test(msg)) return 'This email get account already. Sign in instead.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first. Check your inbox.';
  if (/fetch|network/i.test(msg)) return 'Network don cut. Try again when data dey.';
  return msg;
}

export async function signInEmail(email: string, password: string): Promise<AuthResult> {
  const { error } = await (await sb()).auth.signInWithPassword({ email, password });
  return error ? fail(error) : 'ok';
}

/** With "Confirm email" on in Supabase (the default) there's no session until they click the link. */
export async function signUpEmail(email: string, password: string, displayName: string): Promise<AuthResult> {
  const { data, error } = await (await sb()).auth.signUp({
    email, password, options: { data: { display_name: displayName }, emailRedirectTo: redirectTo() },
  });
  if (error) return fail(error);
  return data.session ? 'ok' : 'check-email';
}

/** Leaves the page for Google and comes back to redirectTo(). */
export async function signInGoogle(): Promise<AuthResult> {
  const { error } = await (await sb()).auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
  return error ? fail(error) : 'ok';
}

export async function signOut(): Promise<void> { await (await sb()).auth.signOut(); }
