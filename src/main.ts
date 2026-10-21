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
import { C, applyCreator, buildCreator, redrawPreview, stopPreview3d } from './ui/creator';
import { updHUD, updSoundBtns } from './ui/hud';
import { genPanel, initStreetClicks, npcClick } from './ui/interact';
import { initGuide, initPlaceCard } from './ui/map';
import { applyView, toggleView } from './ui/view';
import { openModal } from './ui/modal';
import { closePhone, navTo, openPhone, renderPhone } from './ui/phone';
import { hydrateIcons } from './ui/icons';
import { initAppShell } from './ui/shell';
import { copySummary, endSession } from './ui/results';
import { show, showBlank, type ScreenId } from './ui/screens';
import { toast } from './ui/toast';
import { initShare, openShareSheet } from './ui/share';
import { initAccountUI } from './ui/account';
import { deleteCloudSave, fileReport, initCloud } from './net/cloud';
import { busy } from './game/jobs';
import { comeHome } from './game/world';
import { powered, hourNow } from './game/helpers';

const TICK_MS = 800;
const INTRO_POLL_MS = 500;

function startGame(fresh: boolean): void {
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
  if (fresh) toast(`🎯 Welcome to the street, <b>${esc(G.name)}</b>! Meter: ${G.meterUnits}u • ₦${fmt(G.cash)} (virtual). Light fit go anytime — stay ready!`, 'sys');
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
  if (G.hunger > 80) { $('#roomMsg').textContent = 'Hunger no gree sleep. Chop small first!'; return; }
  if (busy()) { $('#roomMsg').textContent = 'You still dey work — finish first!'; return; }
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
  $('#roomMsg').textContent = `🌅 Woke up Day ${G.day}. Slept well.`;
}

function roomTv(): void {
  if (!powered()) { $('#roomMsg').textContent = 'No power for TV. Gen or NEPA needed!'; return; }
  G.tvOn = true;
  G.fun = clamp(G.fun + 6, 0, 100);
  G.happiness = clamp(G.happiness + 3, 0, 100);
  G.meterUnits = Math.max(0, G.meterUnits - 0.5);
  save(); updHUD(); updateRoomStats();
  $('#roomMsg').textContent = '📺 TV don dey run. Fun +6.';
}

function roomCharge(): void {
  if (!powered()) { $('#roomMsg').textContent = 'No power to charge phone. Gen or NEPA needed!'; return; }
  G.phone = 100;
  save(); updHUD(); updateRoomStats();
  $('#roomMsg').textContent = '🔋 Phone don charge to 100%.';
}

function roomRest(): void {
  G.fun = clamp(G.fun + 4, 0, 100);
  G.happiness = clamp(G.happiness + 4, 0, 100);
  G.hunger = clamp(G.hunger + 5, 0, 100);
  save(); updHUD(); updateRoomStats();
  $('#roomMsg').textContent = '💆 You rest small. Body dey recover.';
}

function wire(): void {
  let rulesFrom: ScreenId = 'scr-welcome';
  const click = (sel: string, fn: () => void) => { $(sel).onclick = fn; };
  click('#btnPlay', () => show('scr-age'));
  click('#btnContinue', () => {
    ac(); const s = loadSave(); if (!s) return;
    setG(s); startGame(false); toast('💾 Save loaded. Welcome back, ' + esc(G.name) + '!', 'sys');
  });
  click('#btnRules', () => { rulesFrom = 'scr-welcome'; show('scr-rules'); });
  click('#btnRulesBack', () => show(rulesFrom));
  click('#btnSoundW', toggleSound);
  click('#btnAgeYes', () => { buildCreator(); redrawPreview(); show('scr-create'); });
  click('#btnAgeNo', () => { $('#ageNote').textContent = 'No wahala — this one na for 18+. Come back when you don reach! 👋'; });
  $<HTMLInputElement>('#inpName').addEventListener('input', (e) => { C.name = (e.target as HTMLInputElement).value; redrawPreview(); });
  click('#btnEnter', () => { ac(); startGame(true); });
  click('#btnSoundG', toggleSound);
  document.querySelectorAll<HTMLElement>('#tabbar .tbi').forEach((b) => { b.onclick = () => navTo(b.dataset.nav!); });
  click('#phoneBack', () => openPhone('apps'));
  click('#phoneScrim', closePhone);
  click('#btnPhoneClose', closePhone);
  click('#btnBuy', () => buyUnits(5));
  click('#btnGen', genPanel);
  click('#btnEat', eatAction);
  click('#btnHustle', () => openPhone('hustle'));
  click('#btnSleep', sleepAction);
  click('#pillPlace', () => openPhone('map'));
  click('#btnView', toggleView);
  click('#btnEnd', () => openModal('🏁 End this session?', 'Your progress dey saved automatically. You fit continue anytime.', [
    { t: 'Show my Street Report', fn: () => { endSession(); void fileReport({ kind: 'session' }).then((ok) => { if (ok) toast('☁️ Street Report saved to your account.', 'sys'); }); } }, { t: 'Continue playing' }]));
  click('#btnCopy', copySummary);
  click('#btnShareImg', () => openShareSheet({ kind: 'session' }));
  click('#btnResume', () => show('scr-game'));
  click('#btnNewGame', () => openModal('🔄 Start fresh?', 'This go ERASE your current save. Sure sure?', [
    { t: 'Yes, erase & start new', fn: () => { clearSave(); void deleteCloudSave().catch(() => {}).finally(() => location.reload()); } }, { t: 'Cancel' }]));
  click('#btnEnterRoom', () => { updateRoomStats(); show('scr-room'); });
  click('#roomLeave', () => show('scr-game'));
  click('#roomSleep', () => roomSleep());
  click('#roomEat', () => { eatAction(); updateRoomStats(); });
  click('#roomTv', () => roomTv());
  click('#roomCharge', () => roomCharge());
  click('#roomRest', () => roomRest());
}

// boot
hydrateIcons();
wire();
const street = $<HTMLCanvasElement>('#street');
initRenderer(street);
initStreetClicks(street);
initPlaceCard(npcClick, () => openPhone('map'));
initGuide();
updSoundBtns();
initShare();
initAppShell();
initCloud(() => { $('#btnContinue').style.display = 'block'; toast('☁️ Your online save don land. Tap Continue.', 'sys'); });
initAccountUI();
window.addEventListener('beforeunload', () => { if (hasGame() && G.intro >= INTRO_DONE) save(); });
setInterval(tick, TICK_MS);
setInterval(introStep, INTRO_POLL_MS);

const path = window.location.pathname;
if (path === '/game') {
  const s = loadSave();
  if (s) { setG(s); startGame(false); toast('💾 Save loaded. Welcome back, ' + esc(G.name) + '!', 'sys'); }
  else { startGame(true); }
} else {
  showBlank();
}
