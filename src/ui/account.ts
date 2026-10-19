/* The account sheet on the welcome screen: sign in, sign up, Google, sign out. Hidden when Supabase isn't configured. */
import type { User } from '@supabase/supabase-js';
import { $, esc } from '../core/util';
import { currentUser, onAuth, signInEmail, signInGoogle, signOut, signUpEmail, type AuthResult } from '../net/auth';
import { cloudEnabled } from '../net/supabase';
import { openModal } from './modal';
import { toast } from './toast';

const MIN_PASSWORD = 6; // Supabase's default minimum

function paint(u: User | null): void {
  $('#accountState').textContent = u ? `Signed in • ${u.email ?? 'Google'}` : 'Sign in to save online';
}

function signedIn(u: User): void {
  openModal('☁️ Your account', `Signed in as <b>${esc(u.email ?? 'Google user')}</b>.<br>Your save dey sync online by itself, so you fit continue on any phone.`, [
    { t: 'Sign out', fn: () => { void signOut().then(() => toast('👋 You don sign out. Your save still dey this phone.', 'sys')); } },
    { t: 'Close' },
  ]);
}

function signedOut(err = '', email = '', name = ''): void {
  const form = `<p style="margin:0 0 10px;line-height:1.5">Sign in to keep your street safe online and continue on any device. You can still play without an account.</p>
    <input class="txt" id="accEmail" type="email" autocomplete="email" placeholder="Email" value="${esc(email)}" style="margin-bottom:8px">
    <input class="txt" id="accPass" type="password" autocomplete="current-password" placeholder="Password (6+ characters)" style="margin-bottom:8px">
    <input class="txt" id="accName" type="text" maxlength="40" autocomplete="nickname" placeholder="Nickname (new accounts only)" value="${esc(name)}">
    ${err ? `<p class="note" style="color:var(--red)">${esc(err)}</p>` : ''}`;
  openModal('☁️ Save your street online', form, [
    { t: 'Sign in', fn: () => { void submit('in'); } },
    { t: 'Create account', fn: () => { void submit('up'); } },
    { t: 'Continue with Google', fn: () => { void signInGoogle().then((r) => { if (r !== 'ok') signedOut(r === 'check-email' ? '' : r.error); }); } },
    { t: 'Not now' },
  ]);
}

// the modal closes before a choice runs, but its inputs are still in the DOM
async function submit(mode: 'in' | 'up'): Promise<void> {
  const val = (id: string) => $<HTMLInputElement>(id).value.trim();
  const email = val('#accEmail'), pass = $<HTMLInputElement>('#accPass').value, name = val('#accName');
  if (!email.includes('@') || pass.length < MIN_PASSWORD) { signedOut(`Enter your email and a password of at least ${MIN_PASSWORD} characters.`, email, name); return; }
  let r: AuthResult;
  try { r = mode === 'in' ? await signInEmail(email, pass) : await signUpEmail(email, pass, name || 'Resident'); }
  catch { r = { error: 'Network don cut. Try again when data dey.' }; }
  if (r === 'ok') toast('☁️ You don enter! Your save go follow you to any phone.', 'sys');
  else if (r === 'check-email') toast(`📧 We send confirmation link to <b>${esc(email)}</b>. Click am, then sign in.`, 'sys');
  else signedOut(r.error, email, name);
}

export function initAccountUI(): void {
  if (!cloudEnabled()) return;
  const btn = $('#btnAccount');
  btn.style.display = '';
  btn.onclick = () => { const u = currentUser(); if (u) signedIn(u); else signedOut(); };
  paint(currentUser());
  onAuth(paint);
}
