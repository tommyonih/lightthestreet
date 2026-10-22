import './styles.css';
import { G, SET, T, clearSave, freshState, hasGame, loadSave, save, saveSettings, setG } from './core/state';
import { $, clamp, chance, esc, fmt, rnd } from './core/util';
import { ac, genHum, tone } from './core/audio';
import { buyUnits } from './game/economy';
import { eatAction, sleepAction } from './game/actions';
import { stopGen } from './game/generator';
import { INTRO_DONE, introStep, resetIntroClock } from './game/intro';
import { setupObjectives } from './game/progress';
import { ensureWeek } from './game/challenges';
import { tick, applianceDrain, newDay } from './game/sim';
import { initRenderer } from './render/street';
import { C, applyCreator, drawSaved, initCreator, openCreator, stopPreview3d } from './ui/creator';
import { updHUD, updSoundBtns } from './ui/hud';
import { genPanel, initStreetClicks, npcClick } from './ui/interact';
import { initGuide, initPlaceCard } from './ui/map';
import { applyView, toggleView } from './ui/view';
import { openModal } from './ui/modal';
import { closePhone, markTabbar, navTo, openPhone, renderPhone, type Tab } from './ui/phone';
import { hydrateIcons } from './ui/icons';
import { initAppShell } from './ui/shell';
import { copySummary, endSession } from './ui/results';
import { screenNow, show, showBlank, type ScreenId } from './ui/screens';
import { toast } from './ui/toast';
import { initShare, openShareSheet } from './ui/share';
import { MIN_AGE, ageOf, buildDob, confirmDob, initAccountUI, openAuth } from './ui/account';
import { revealBirth } from './ui/birthReveal';
import { initCityMap } from './ui/cityMap';
import { initProducts, openProduct } from './ui/products';
import { currentUser, handle, saveDob } from './net/auth';
import { cloudEnabled } from './net/supabase';
import { BIRTHS, PARTNERS, type PartnerId } from './data/content';
import { deleteCloudSave, fileReport, initCloud } from './net/cloud';
import { busy } from './game/jobs';
import { comeHome } from './game/world';
import { powered, hourNow } from './game/helpers';

const TICK_MS = 800;
const INTRO_POLL_MS = 500;

/** The game is running (or has run) — guards against starting it twice from an auth callback. */
let started = false;
/** The player is on the age gate or the creator screen. */
let onboarding = false;

function startGame(fresh: boolean): void {
  if (started) return;
  started = true;
  if (fresh) {
    setG(freshState());
    applyCreator(); setupObjectives();
    resetIntroClock(); // the scripted blackout hits ~10s in; introStep owns the grid until then
    G.gridOn = true;
    save();
  } else {
    G.intro = INTRO_DONE; G.introT = 0;
  }
  ensureWeek();
  genHum(false); stopPreview3d(); show('scr-game'); updHUD(); renderPhone('meter'); void applyView();
  if (fresh) {
    onboarding = false;
    toast(`🎯 Welcome to ${esc(G.streetName)}, <b>${esc(G.name)}</b>. Meter: ${G.meterUnits} units · Cash: ₦${fmt(G.cash)}. Power can go at any time.`, 'sys');
    if (G.debt > 0) setTimeout(() => toast(`💳 You owe <b>₦${fmt(G.debt)}</b>. It grows 2% a day. Pay it off in the Wallet app.`, 'bad'), 2500);
  }
}

function toggleSound(): void {
  SET.sound = !SET.sound; saveSettings(); genHum(SET.sound && hasGame() && G.genOn);
  if (SET.sound) tone(660, .1, 'sine', .1);
  updSoundBtns();
}

function updateRoomStats(): void {
  $('#roomCash').textContent = fmt(G.cash);
  $('#roomHappiness').textContent = Math.round(G.happiness).toString();
  $('#roomPower').textContent = powered() ? 'ON' : 'OFF';
}

function roomSleep(): void {
  const h = hourNow();
  if (G.hunger > 80) { $('#roomMsg').textContent = 'Too hungry to sleep. Eat something first.'; return; }
  if (busy()) { $('#roomMsg').textContent = 'You\'re still working. Finish first.'; return; }
  comeHome();
  if (G.genOn) stopGen(true);
  const before = T();
  G.minute = 0; newDay(); G.minute = 6.5 * 60;
  const slept = T() - before;
  const gridShare = rnd(.35, .7);
  const used = slept * gridShare * applianceDrain();
  G.meterUnits = Math.max(0, G.meterUnits - used);
  G.hunger = clamp(G.hunger + 25, 0, 100);
  G.fun = clamp(G.fun + 10, 0, 100);
  G.happiness = clamp(G.happiness + 8, 0, 100);
  if (G.inverter > 0) G.invCharge = clamp(G.invCharge + (G.meterUnits > 0 ? 30 : -20), 0, 100);
  G.gridOn = chance(.55); G.flashUntil = 0; G.nextFlip = T() + rnd(30, 150);
  save(); updHUD(); updateRoomStats();
  $('#roomMsg').textContent = `🌅 Woke up on day ${G.day}. Slept well.`;
}

function roomTv(): void {
  if (!powered()) { $('#roomMsg').textContent = 'No power for the TV. You need NEPA or a generator.'; return; }
  G.tvOn = true;
  G.fun = clamp(G.fun + 6, 0, 100);
  G.happiness = clamp(G.happiness + 3, 0, 100);
  G.meterUnits = Math.max(0, G.meterUnits - 0.5);
  save(); updHUD(); updateRoomStats();
  $('#roomMsg').textContent = '📺 TV is on. Fun +6.';
}

function roomCharge(): void {
  if (!powered()) { $('#roomMsg').textContent = 'No power to charge your phone. You need NEPA or a generator.'; return; }
  G.phone = 100;
  save(); updHUD(); updateRoomStats();
  $('#roomMsg').textContent = '🔋 Phone charged to 100%.';
}

function roomRest(): void {
  G.fun = clamp(G.fun + 4, 0, 100);
  G.happiness = clamp(G.happiness + 4, 0, 100);
  G.hunger = clamp(G.hunger + 5, 0, 100);
  save(); updHUD(); updateRoomStats();
  $('#roomMsg').textContent = '💆 You rest a little and feel better.';
}

/* ---------- getting in: welcome → account → age → creator → birth roll → the street ---------- */

/** Accounts are required to play whenever they're configured. Without Supabase (local dev, tests) anyone can play. */
const needsAccount = (): boolean => cloudEnabled();
let readAgeDob: () => string = () => '';

/** Paint the welcome card for who's here: signed out, signed in with a save, or signed in without one. */
function paintWelcome(): void {
  const u = currentUser(), s = loadSave(), inside = !needsAccount() || !!u;
  $('#wOut').hidden = inside && !!(s || u);
  $('#wIn').hidden = !$('#wOut').hidden;
  $('#topActs').hidden = !needsAccount() || !!u;
  $('#btnLogin').hidden = !needsAccount();
  $('#btnPlay').textContent = needsAccount() ? 'Sign up free' : 'Play free';
  if ($('#wIn').hidden) return;
  if (s) {
    $('#wName').textContent = s.name;
    $('#wMeta').textContent = `Day ${s.day} · ₦${fmtShort(s.cash)}${s.birth ? ' · ' + BIRTHS[s.birth].n : ''}`;
    drawSaved($<HTMLCanvasElement>('#wAva'), s);
    $('#btnContinue').textContent = 'Continue';
    $('#btnNewLife').hidden = false;
  } else {
    $('#wName').textContent = '@' + (handle(u) || 'you');
    $('#wMeta').textContent = 'No character yet';
    drawSaved($<HTMLCanvasElement>('#wAva'), { skin: 2, hair: 0, outfit: 3 });
    $('#btnContinue').textContent = 'Create your character';
    $('#btnNewLife').hidden = true;
  }
}
const fmtShort = (n: number): string => (Math.abs(n) >= 1000 ? Math.round(n / 1000) + 'k' : String(Math.round(n)));

/** A new life: age check if the account has no date of birth yet, then the creator. */
function startOnboarding(): void {
  onboarding = true;
  const dob = currentUser()?.user_metadata?.dob as string | undefined;
  if (needsAccount() && dob && ageOf(dob) >= MIN_AGE) { openCreatorNow(); return; }
  show('scr-age');
}
function openCreatorNow(): void {
  openCreator(handle(currentUser()), {
    onBack: () => { onboarding = false; show('scr-welcome'); paintWelcome(); },
    onDone: () => revealBirth((pack) => { C.pack = pack; ac(); startGame(true); }),
  });
  show('scr-create');
}

function continueGame(): void {
  if (needsAccount() && !currentUser()) { openAuth('in'); return; }
  const s = loadSave();
  if (!s) { startOnboarding(); return; }
  ac(); setG(s); startGame(false);
  toast(`💾 Welcome back, <b>${esc(G.name)}</b>!`, 'sys');
}

function newLife(): void {
  openModal('Start a new life?', 'This erases your character and save. Your next birth is a new random roll.', [
    { t: 'Yes, start a new life', fn: () => { clearSave(); void deleteCloudSave().catch(() => {}); paintWelcome(); startOnboarding(); } },
    { t: 'Cancel' },
  ]);
}

/** Someone just signed in (or was already). From the account screen, carry straight on. */
function signedIn(): void {
  paintWelcome();
  if (started || onboarding) return;
  if (screenNow() === 'scr-auth') { if (loadSave()) { show('scr-welcome'); paintWelcome(); } else startOnboarding(); }
}

function wire(): void {
  let rulesFrom: ScreenId = 'scr-welcome';
  const click = (sel: string, fn: () => void) => { $(sel).onclick = fn; };
  const signup = () => { if (needsAccount()) openAuth('up'); else startOnboarding(); };
  click('#btnPlay', signup);
  click('#btnTopSignup', signup);
  click('#btnLogin', () => openAuth('in'));
  click('#btnTopLogin', () => openAuth('in'));
  click('#btnContinue', continueGame);
  click('#btnNewLife', newLife);
  click('#btnRules', () => { rulesFrom = screenNow(); show('scr-rules'); });
  click('#btnRulesBack', () => show(rulesFrom));
  click('#btnSoundW', toggleSound);
  readAgeDob = buildDob($('#dobAge'));
  click('#btnAgeYes', () => {
    const dob = readAgeDob(), note = $('#ageNote');
    if (!dob) { note.textContent = 'Pick your full date of birth.'; return; }
    if (ageOf(dob) < MIN_AGE) { note.textContent = 'Sorry, this game is for players aged 18 and over.'; return; }
    note.textContent = '';
    confirmDob(dob, () => { if (currentUser()) void saveDob(dob).catch(() => {}); openCreatorNow(); });
  });
  initCreator();
  click('#btnSoundG', toggleSound);
  click('#pillCash', () => openPhone('hustle'));
  document.querySelectorAll<HTMLElement>('#tabbar .tbi').forEach((b) => { b.onclick = () => navTo(b.dataset.nav!); });
  click('#phoneBack', () => openPhone('apps'));
  click('#phoneScrim', closePhone);
  click('#btnPhoneClose', closePhone);
  click('#btnBuy', () => buyUnits(5));
  click('#btnGen', genPanel);
  click('#btnEat', eatAction);
  click('#btnHustle', () => openPhone('hustle'));
  click('#btnSleep', sleepAction);
  click('#pillPlace', () => navTo('map'));
  click('#btnView', toggleView);
  click('#btnEnd', () => openModal('🏁 End this session?', 'Your progress saves automatically. You can come back anytime.', [
    { t: 'Show my street report', fn: () => { endSession(); void fileReport({ kind: 'session' }).then((ok) => { if (ok) toast('☁️ Street report saved to your account.', 'sys'); }); } }, { t: 'Keep playing' }]));
  click('#btnCopy', copySummary);
  click('#btnShareImg', () => openShareSheet({ kind: 'session' }));
  click('#btnResume', () => show('scr-game'));
  click('#btnNewGame', () => openModal('🔄 Start a new life?', 'This erases your current save. Are you sure?', [
    { t: 'Yes, erase and start again', fn: () => { clearSave(); void deleteCloudSave().catch(() => {}).finally(() => location.reload()); } }, { t: 'Cancel' }]));
  click('#btnEnterRoom', () => { updateRoomStats(); show('scr-room'); });
  click('#roomLeave', () => show('scr-game'));
  click('#roomSleep', () => roomSleep());
  click('#roomEat', () => { eatAction(); updateRoomStats(); });
  click('#roomTv', () => roomTv());
  click('#roomCharge', () => roomCharge());
  click('#roomRest', () => roomRest());
}

/** Product chips under the welcome bar: a quick way into each product sheet. */
function paintAdChips(): void {
  const chips: [PartnerId, string][] = [['nextpawa', '⚡ NextPawa · light in seconds'], ['verispon', '🛡️ Verispon · safe online deals'], ['tapmonie', '📲 Tapmonie · soon'], ['pressmonie', '💸 Pressmonie · soon']];
  $('#adChips').innerHTML = chips.map(([id, t]) => `<button class="chip ad" data-ad="${id}" style="--brand:${PARTNERS[id].color}">${t}</button>`).join('');
  $('#adChips').querySelectorAll<HTMLElement>('[data-ad]').forEach((b) => { b.onclick = () => openProduct(b.dataset.ad as PartnerId); });
}

// boot
hydrateIcons();
wire();
const street = $<HTMLCanvasElement>('#street');
initRenderer(street);
initStreetClicks(street);
initPlaceCard(npcClick, () => navTo('map'));
initGuide();
updSoundBtns();
initShare();
initAppShell();
initProducts((tab) => openPhone(tab as Tab));
initCityMap(markTabbar);
paintAdChips();
initCloud(() => { if (!started) paintWelcome(); });
initAccountUI({ onSignedIn: signedIn, onSignedOut: paintWelcome });
window.addEventListener('beforeunload', () => { if (hasGame() && G.intro >= INTRO_DONE) save(); });
setInterval(tick, TICK_MS);
setInterval(introStep, INTRO_POLL_MS);

// the bare root of the standalone site is a blank page; everywhere else (/game, /game/app/ inside nextpawa.com) is the game
if (window.location.pathname === '/' && !import.meta.env.VITE_AUTH_RETURN) showBlank();
else { show('scr-welcome'); paintWelcome(); }
