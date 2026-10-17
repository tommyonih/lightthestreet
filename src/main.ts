import './styles.css';
import { G, SET, clearSave, freshState, hasGame, loadSave, save, saveSettings, setG } from './core/state';
import { $, esc, fmt } from './core/util';
import { ac, genHum, tone } from './core/audio';
import { buyUnits } from './game/economy';
import { eatAction, sleepAction } from './game/actions';
import { INTRO_DONE, introStep, resetIntroClock } from './game/intro';
import { setupObjectives } from './game/progress';
import { ensureWeek } from './game/challenges';
import { tick } from './game/sim';
import { initRenderer } from './render/street';
import { C, applyCreator, buildCreator, redrawPreview } from './ui/creator';
import { updHUD, updSoundBtns } from './ui/hud';
import { genPanel, initStreetClicks } from './ui/interact';
import { openModal } from './ui/modal';
import { closePhone, navTo, openPhone, renderPhone } from './ui/phone';
import { hydrateIcons } from './ui/icons';
import { initAppShell } from './ui/shell';
import { copySummary, endSession } from './ui/results';
import { show, type ScreenId } from './ui/screens';
import { toast } from './ui/toast';
import { initShare, openShareSheet } from './ui/share';

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
  genHum(false); show('scr-game'); updHUD(); renderPhone('meter');
  if (fresh) toast(`🎯 Welcome to the street, <b>${esc(G.name)}</b>! Meter: ${G.meterUnits}u • ₦${fmt(G.cash)} (virtual). Light fit go anytime — stay ready!`, 'sys');
}

function toggleSound(): void {
  SET.sound = !SET.sound; saveSettings(); genHum(SET.sound && hasGame() && G.genOn);
  if (SET.sound) tone(660, .1, 'sine', .1);
  updSoundBtns();
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
  click('#btnEnd', () => openModal('🏁 End this session?', 'Your progress dey saved automatically. You fit continue anytime.', [
    { t: 'Show my Street Report', fn: endSession }, { t: 'Continue playing' }]));
  click('#btnCopy', copySummary);
  click('#btnShareImg', () => openShareSheet({ kind: 'session' }));
  click('#btnResume', () => show('scr-game'));
  click('#btnNewGame', () => openModal('🔄 Start fresh?', 'This go ERASE your current save. Sure sure?', [
    { t: 'Yes, erase & start new', fn: () => { clearSave(); location.reload(); } }, { t: 'Cancel' }]));
}

// boot
hydrateIcons();
if (loadSave()) $('#btnContinue').style.display = 'block';
wire();
const street = $<HTMLCanvasElement>('#street');
initRenderer(street);
initStreetClicks(street);
updSoundBtns();
initShare();
initAppShell();
window.addEventListener('beforeunload', () => { if (hasGame() && G.intro >= INTRO_DONE) save(); });
setInterval(tick, TICK_MS);
setInterval(introStep, INTRO_POLL_MS);
