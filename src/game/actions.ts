import { G, T, save } from '../core/state';
import { chance, clamp, rnd } from '../core/util';
import { sfx } from '../core/audio';
import { openModal } from '../ui/modal';
import { toast } from '../ui/toast';
import { updHUD } from '../ui/hud';
import { addCash } from './economy';
import { stopGen } from './generator';
import { fun, hourNow, mood } from './helpers';
import { busy, currentHustle } from './jobs';
import { applianceDrain, newDay } from './sim';
import { atHome, comeHome, place } from './world';

export function eatAction(): void {
  if (G.cash < 300) { toast('💸 ₦300 no dey your pocket. Hunger go hear word today.', 'bad'); return; }
  if (G.hunger < 15) { toast('🍲 You never even hungry. Save your money!', 'bad'); return; }
  addCash(-300, 'Food'); G.hunger = clamp(G.hunger - 45, 0, 100); mood(3);
  toast('🍲 You chop well. Body dey cooperate again.', 'sys'); sfx.cash(); save(); updHUD();
}

const WAKE = 6.5 * 60;

export function sleepAction(): void {
  const h = hourNow();
  if (h >= 6.5 && h < 20) { toast('😴 Day never finish! Sleep only dey allowed from 8PM.', 'bad'); return; }
  if (busy()) { toast(`😴 You still dey work — finish ${currentHustle()?.n} first!`, 'bad'); return; }
  const away = atHome() ? '' : `<br>You dey ${G.trip ? 'road' : place(G.loc).n} — <b>you go trek go house first.</b>`;
  openModal('😴 Sleep till morning?', `You go rest well, save progress — and wake up 6:30AM.${away}${G.genOn ? '<br><b>Your gen go off first</b> — nobody sleep with gen running. Safety!' : ''} <span style="color:var(--dim)">Small gist: if meter low, e fit beep for midnight o…</span>`, [
    { t: 'Sleep 🌙', fn: sleepThroughNight },
    { t: 'Not yet' },
  ]);
}

function sleepThroughNight(): void {
  comeHome();
  if (G.genOn) stopGen(true);
  const before = T();
  if (G.minute >= WAKE) { G.minute = 0; newDay(); }
  G.minute = WAKE;
  const slept = T() - before;
  // overnight: grid is on for roughly half the night; fridge/fan/lights keep pulling units (TV is off)
  const gridShare = rnd(.35, .7);
  const used = slept * gridShare * (applianceDrain() - (G.tvOn ? 0.003 : 0));
  const hadUnits = G.meterUnits > 0;
  G.meterUnits = Math.max(0, G.meterUnits - used);
  if (hadUnits && G.meterUnits <= 0) {
    G.stats.noMeterFailDays = 0; G.week.c.meterZero = true;
    setTimeout(() => toast('🔋 Meter finish for night. You wake up inside heat & silence.', 'bad'), 1200);
  }
  if (G.meterUnits > 0) G.phone = clamp(G.phone + 40, 0, 100);
  if (G.inverter > 0) G.invCharge = clamp(G.invCharge + (G.meterUnits > 0 ? 30 : -30), 0, 100);
  G.hunger = clamp(G.hunger + 25, 0, 100); fun(10);
  const hot = G.temp >= 30 && !(G.fanRecharge && G.fanBat > 0) && G.meterUnits <= 0;
  mood(10 - (hot ? 8 : 0));
  G.gridOn = chance(.55); G.flashUntil = 0; G.nextFlip = T() + rnd(30, 150);
  if (G.meterUnits > 0 && G.meterUnits < 4) {
    sfx.alarm();
    setTimeout(() => toast('🔔 12AM sharp: meter alarm beep like say na party! Low credit — you no sleep well.', 'bad'), 800);
    mood(-5);
  }
  toast(`🌅 Day ${G.day}. NEPA status this morning: <b>${G.gridOn ? 'light dey' : 'no light'}</b>.`, 'sys');
  save(); updHUD();
}
