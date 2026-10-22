/* The account screens: create account / log in (email or Google), date of birth, forgot and reset password.
   Signing up is required to play when Supabase is configured; main.ts decides what happens once someone is in. */
import type { User } from '@supabase/supabase-js';
import { $, esc } from '../core/util';
import {
  currentUser, doneRecovering, friendly, handle, onAuth, recovering, sendReset, setPassword, signInEmail, signInGoogle,
  signOut, signUpEmail, type AuthResult,
} from '../net/auth';
import { cloudEnabled } from '../net/supabase';
import { icon } from './icons';
import { openModal } from './modal';
import { show } from './screens';
import { toast } from './toast';

const MIN_PASSWORD = 8;
export const MIN_AGE = 18;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface AccountHooks {
  /** A session exists: restored at boot, or just signed in. */
  onSignedIn: (u: User) => void;
  /** Signed out (or never signed in) once the session is known. */
  onSignedOut: () => void;
}

/* ---------- date of birth: three selects ---------- */

/** Fill `box` with day / month / year selects. Returns a reader: an ISO date, or '' if incomplete. */
export function buildDob(box: HTMLElement): () => string {
  const year = new Date().getFullYear();
  const opt = (v: string | number, t: string | number) => `<option value="${v}">${t}</option>`;
  box.innerHTML = `<select aria-label="Day"><option value="">Day</option>${Array.from({ length: 31 }, (_, i) => opt(i + 1, i + 1)).join('')}</select>
    <select aria-label="Month"><option value="">Month</option>${MONTHS.map((m, i) => opt(i + 1, m.slice(0, 3))).join('')}</select>
    <select aria-label="Year"><option value="">Year</option>${Array.from({ length: 90 }, (_, i) => opt(year - 13 - i, year - 13 - i)).join('')}</select>`;
  const [d, m, y] = [...box.querySelectorAll('select')];
  return () => {
    if (!d.value || !m.value || !y.value) return '';
    const date = new Date(Date.UTC(+y.value, +m.value - 1, +d.value));
    if (date.getUTCDate() !== +d.value) return ''; // 31 February and friends
    return date.toISOString().slice(0, 10);
  };
}
export function ageOf(dob: string, now = new Date()): number {
  const [y, m, d] = dob.split('-').map(Number);
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
  return a;
}
export const prettyDate = (dob: string): string => { const [y, m, d] = dob.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

/** Ask once: "you're confirming you were born on …". */
export function confirmDob(dob: string, yes: () => void): void {
  openModal('Are you sure?', `<div class="bigEmoji">🗓️</div>You're confirming you were born on <b>${prettyDate(dob)}</b> and are 18 or older.`, [
    { t: 'Yes, that\'s right', fn: yes }, { t: 'Go back' },
  ]);
}

/* ---------- create account / log in ---------- */

let mode: 'up' | 'in' = 'up';
let readDob: () => string = () => '';

function setMode(m: 'up' | 'in'): void {
  mode = m;
  const f = $('#scr-auth');
  f.classList.toggle('modeIn', m === 'in');
  $('#tabUp').classList.toggle('sel', m === 'up'); $('#tabIn').classList.toggle('sel', m === 'in');
  $('#authSubmit').textContent = m === 'up' ? 'Sign up · it\'s free' : 'Log in';
  $('#authFoot').textContent = m === 'up' ? 'Your character lives in the same Lagos as everyone who signs up.' : 'Welcome back.';
  $<HTMLInputElement>('#fPass').autocomplete = m === 'up' ? 'new-password' : 'current-password';
  err('');
}
const err = (t: string) => { $('#authErr').textContent = t; };
const busyBtn = (on: boolean) => { const b = $<HTMLButtonElement>('#authSubmit'); b.disabled = on; if (on) b.textContent = 'Please wait…'; else setMode(mode); };

/** Show the account screen on a tab. */
export function openAuth(m: 'up' | 'in'): void { setMode(m); show('scr-auth'); }

async function submit(): Promise<void> {
  const v = (id: string) => $<HTMLInputElement>(id).value.trim();
  const email = v('#fEmail'), pass = $<HTMLInputElement>('#fPass').value;
  if (!/^\S+@\S+\.\S+$/.test(email)) return err('Enter a valid email address.');
  if (mode === 'in') {
    if (!pass) return err('Enter your password.');
    return run(() => signInEmail(email, pass), email);
  }
  const name = v('#fName'), username = v('#fUser').replace(/^@/, ''), dob = readDob();
  if (name.length < 2) return err('Enter your name.');
  if (!/^[A-Za-z0-9_.]{3,14}$/.test(username)) return err('Username: 3 to 14 letters, numbers, dots or underscores.');
  if (pass.length < MIN_PASSWORD) return err(`Password: at least ${MIN_PASSWORD} characters.`);
  if (/^(\d)\1+$|^12345/.test(pass)) return err('That password is too easy to guess. Try another.');
  if (!dob) return err('Enter your date of birth.');
  if (ageOf(dob) < MIN_AGE) return err('Sorry, this game is for players aged 18 and over.');
  if (!$<HTMLInputElement>('#fAgree').checked) return err('Tick the box to confirm you\'re 18+ and agree to the terms.');
  confirmDob(dob, () => { void run(() => signUpEmail(email, pass, { name, username, dob }), email); });
}

async function run(fn: () => Promise<AuthResult>, email: string): Promise<void> {
  err(''); busyBtn(true);
  let r: AuthResult;
  try { r = await fn(); } catch (e) { r = { error: friendly(String((e as Error)?.message ?? e)) }; }
  busyBtn(false);
  if (r === 'ok') return; // onAuth takes it from here
  if (r === 'check-email') {
    openModal('Check your email', `<div class="bigEmoji">📧</div>We sent a link to <b>${esc(email)}</b>. Open it to finish signing up, then come back here.`, [{ t: 'OK' }]);
    setMode('in'); return;
  }
  err(r.error);
}

function forgot(): void {
  const email = $<HTMLInputElement>('#fEmail').value.trim();
  openModal('Reset your password', `Enter your email and we'll send you a link to set a new password.
    <input class="txt" id="resetEmail" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(email)}" style="margin-top:12px">`, [
    { t: 'Send reset link', fn: () => {
      const e = $<HTMLInputElement>('#resetEmail').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(e)) { toast('Enter a valid email address.', 'bad'); return; }
      void sendReset(e).then((r) => toast(r === 'ok' ? `📧 Reset link sent to <b>${esc(e)}</b>.` : (r as { error: string }).error, r === 'ok' ? 'sys' : 'bad'));
    } },
    { t: 'Cancel' },
  ]);
}

/** Opened from a reset email: ask for the new password. */
function newPassword(note = ''): void {
  openModal('Set a new password', `${note ? `<p class="formErr">${esc(note)}</p>` : ''}
    <input class="txt" id="newPass" type="password" autocomplete="new-password" placeholder="New password (8+ characters)">`, [
    { t: 'Save password', fn: () => {
      const p = $<HTMLInputElement>('#newPass').value;
      if (p.length < MIN_PASSWORD) { newPassword(`At least ${MIN_PASSWORD} characters.`); return; }
      void setPassword(p).then((r) => { if (r === 'ok') { doneRecovering(); toast('🔒 Password updated.', 'sys'); } else newPassword(typeof r === 'string' ? '' : r.error); });
    } },
  ]);
}

/** The "signed in as" line and the Google button label. */
function paint(u: User | null): void {
  const line = $('#signedAs'); if (line) line.hidden = !u;
  const state = $('#accountState'); if (state) state.innerHTML = u ? `Signed in as <b>@${esc(handle(u))}</b>` : '';
}

export function initAccountUI(hooks: AccountHooks): void {
  readDob = buildDob($('#dobUp'));
  $('#tabUp').onclick = () => setMode('up');
  $('#tabIn').onclick = () => setMode('in');
  $('#authBack').onclick = () => show('scr-welcome');
  $('#lnkForgot').onclick = forgot;
  $<HTMLFormElement>('#authForm').onsubmit = (e) => { e.preventDefault(); void submit(); };
  const eye = $('#fEye'), pass = $<HTMLInputElement>('#fPass');
  const paintEye = () => { eye.innerHTML = icon(pass.type === 'password' ? 'eye' : 'eyeOff', 20); };
  eye.onclick = () => { pass.type = pass.type === 'password' ? 'text' : 'password'; paintEye(); };
  paintEye();
  $<HTMLInputElement>('#fUser').addEventListener('input', (e) => { const i = e.target as HTMLInputElement; i.value = i.value.replace(/[^A-Za-z0-9_.]/g, ''); });
  $('#btnGoogle').onclick = () => { if (!cloudEnabled()) { err('Accounts are not set up on this copy of the game.'); return; } signInGoogle(); };
  $('#btnLogout').onclick = () => { void signOut().then(() => toast('👋 Logged out.', 'sys')); };

  setMode('up'); paint(currentUser());
  if (!cloudEnabled()) { hooks.onSignedOut(); return; }
  onAuth((u) => {
    paint(u);
    if (u) { hooks.onSignedIn(u); if (recovering) newPassword(); } else hooks.onSignedOut();
  });
}
