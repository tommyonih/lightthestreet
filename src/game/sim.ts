/* Clock, NEPA engine, meter, generator, batteries and needs. tick() advances the world by one step. */
import { G, T, save } from '../core/state';
import { $, chance, clamp, esc, pick, rnd } from '../core/util';
import { sfx } from '../core/audio';
import { NPCDEF } from '../data/content';
import { modalOpen } from '../ui/modal';
import { toast } from '../ui/toast';
import { updHUD } from '../ui/hud';
import { addCash, loadToken } from './economy';
import { debtNewDay } from './birth';
import { rollEvent } from './events';
import { DRAIN_GEN, genCapacity, loadLevel, stopGen } from './generator';
import { cooling, fun, hasTrait, hourNow, isNight, mood, powered, rel, streetLit, sunUp, trust } from './helpers';
import { forgetFaded, remember } from './memory';
import { checkChallenges, weekRollover } from './challenges';
import { jobTick } from './jobs';
import { callMeeting, CURFEW_FINE, meetingDue, policiesNewDay, supplyMods } from './meetings';
import { checkAch, checkObj } from './progress';
import { atHome, place, suggest, worldTick } from './world';
import { ordersTick } from './orders';

/** Game minutes advanced per tick. One tick runs every 800ms, so a game hour is ~12s and a day ~4.8 min. */
export const STEP = 4;
/** Grid timing knobs (game minutes). */
export const GRID = { onMin: 120, onMax: 420, offMin: 40, offMax: 200, blinkP: .12, flashP: .13 };
/** Chance per tick of rolling a street event (after the intro). */
export const EVENT_CHANCE = .025;

export function updateWeather(): void {
  const r = Math.random();
  if (r < .42) { G.weather = 'sunny'; G.temp = Math.round(rnd(30, 35)); }
  else if (r < .62) { G.weather = 'hot'; G.temp = Math.round(rnd(35, 39)); }
  else if (r < .85) { G.weather = 'rain'; G.temp = Math.round(rnd(24, 28)); }
  else { G.weather = 'storm'; G.temp = Math.round(rnd(23, 26)); }
}

export function blackoutFX(): void {
  G.stats.blackouts++; G.stats.noiseThisBlackout = 0;
  sfx.off(); toast('⚡ <b>Power cut!</b> Everything has gone dark…', 'bad');
  const shouts = ['Not again!', 'Who turned off the light?!', 'Seriously? Again?!', 'Up NEPA… wait, never mind!'];
  setTimeout(() => toast('🗣️ ' + pick(NPCDEF).name + ': “' + pick(shouts) + '”', 'npc'), 1200);
  setTimeout(() => { if (G && !G.gridOn) toast('🗣️ ' + pick(NPCDEF).name + ': “' + pick(['My fan just stopped! This heat!', 'Who has an extension cable?!', 'Let’s all shout, maybe they’ll hear us!']) + '”', 'npc'); }, 4200);
  mood(hasTrait('nepafight') ? -3 : -6);
  if (G.tvOn && G.minute > 17 * 60 && G.minute < 23 * 60) fun(-6);
  if (!atHome() && G.intro >= 99 && (G.gen > 0 || G.fridgeOn)) {
    setTimeout(() => toast(`🏃 And you’re ${G.trip ? 'on the road' : 'at ' + place(G.loc).n}! ${G.gen > 0 ? 'Your generator can’t start itself.' : 'Your fridge is suffering.'}`, 'bad'), 2600);
  }
  checkObj('blackout');
}

export function restoreFX(flash: boolean): void {
  G.stats.restores++;
  if (!flash) {
    sfx.on(); toast('💡 <b>POWER IS BACK!</b> “UP NEPA!” the whole street shouts!', 'sys');
    mood(hasTrait('party') ? 12 : 6); fun(4);
    setTimeout(() => { if (G && G.gridOn) toast('🗣️ ' + pick(NPCDEF).name + ': “' + pick(['Up NEPA! I told you!', 'Charge your phones, quick!', 'Iron your clothes before it goes again!']) + '”', 'npc'); }, 1500);
    if (G.stats.noiseThisBlackout < 3) G.stats.quietBlackouts++;
  } else {
    toast('💡 The power flickered on… <b>and went off again!</b> “Up NE—” 😭', 'bad'); sfx.bad(); mood(-4);
  }
}

export function flipGrid(): void {
  const mods = supplyMods();
  const h = hourNow();

  // ── Nepo Baby street: light almost always on, rare brief outages ────
  if (G.streetType === 'nepo') {
    if (G.gridOn && chance(.003)) {
      G.gridOn = false; blackoutFX();
      G.nextFlip = T() + rnd(5, 15);
    } else if (!G.gridOn) {
      G.gridOn = true; restoreFX(false);
      G.nextFlip = T() + rnd(240, 480);
    } else {
      G.nextFlip = T() + 60;
    }
    return;
  }
  // ── Lapo Baby / near distribution station: constant light, short outages ─
  if (G.streetType === 'lapo' || G.streetType === 'station') {
    if (G.gridOn) {
      G.gridOn = false; blackoutFX();
      G.nextFlip = T() + rnd(GRID.offMin, GRID.offMax) * mods.off * 0.35;
    } else {
      G.gridOn = true; restoreFX(false);
      G.nextFlip = T() + rnd(GRID.onMin, GRID.onMax) * mods.on * 2;
    }
    return;
  }
  // ── Midnight street: light only at night (6PM–6AM) ─────────────────
  if (G.streetType === 'midnight') {
    const shouldBeOn = !(h >= 6 && h < 18);
    if (G.gridOn !== shouldBeOn) {
      if (shouldBeOn) { G.gridOn = true; restoreFX(false); }
      else { G.gridOn = false; blackoutFX(); }
    }
    G.nextFlip = T() + 60;
    return;
  }
  // ── Daytime street: light only during the day (6AM–6PM) ─────────────
  if (G.streetType === 'daytime') {
    const shouldBeOn = h >= 6 && h < 18;
    if (G.gridOn !== shouldBeOn) {
      if (shouldBeOn) { G.gridOn = true; restoreFX(false); }
      else { G.gridOn = false; blackoutFX(); }
    }
    G.nextFlip = T() + 60;
    return;
  }

  // ── Regular street: normal NEPA wahala ──────────────────────────────
  if (G.gridOn) {
    G.gridOn = false; blackoutFX();
    let dur = rnd(GRID.offMin, GRID.offMax) * mods.off;
    if (G.weather === 'storm') dur *= 1.5; else if (G.weather === 'rain') dur *= 1.2;
    if (chance(GRID.blinkP)) dur = rnd(6, 14);
    G.nextFlip = T() + dur;
  } else {
    G.gridOn = true;
    if (chance(GRID.flashP)) { G.flashUntil = T() + rnd(5, 12); restoreFX(true); }
    else restoreFX(false);
    let dur = rnd(GRID.onMin, GRID.onMax) * mods.on; if (G.weather === 'rain' || G.weather === 'storm') dur *= .75;
    G.nextFlip = T() + dur;
  }
}

/** Units per game-minute. A "unit" is ~1 kWh: all-on is ~0.6u/hour, ~9u per day at typical grid uptime. */
export function applianceDrain(): number {
  let d = 0.0012; // lights baseline
  if (G.fanOn) d += 0.0022;
  if (G.tvOn) d += 0.003;
  if (G.fridgeOn) d += 0.0035 * (G.fridgeEff ? 0.6 : 1);
  return d;
}

export function meterEmpty(): void {
  G.meterUnits = 0; G.stats.noMeterFailDays = 0; G.week.c.meterZero = true; sfx.alarm();
  toast('🔋 <b>Your meter ran out!</b> Your house is dark even though the street has power. Buy units on NextPawa.', 'bad');
  if (chance(.5)) setTimeout(() => toast('🗣️ Aunty Caro: “Whose house just went dark? Someone’s meter ran out!”', 'npc'), 2000);
}

export function newDay(): void {
  G.day++; G.pbankCharges = G.powerbank > 0 ? 2 : G.pbankCharges;
  weekRollover();
  if (G.meterUnits > 0) G.stats.noMeterFailDays++;
  if (G.bg === 'estate' && G.day % 7 === 0) { addCash(-1500, 'Estate weekly bills'); toast('🏘️ Estate dues collected: ₦1,500. Comfort costs money.', 'sys'); }
  if (G.flags.emekaUnits && chance(.35)) {
    G.meterUnits += G.flags.emekaUnits; G.flags.emekaUnits = 0; rel('broke', 5);
    toast('🙏 Emeka knocks: “Here are your 3 units back. I didn’t forget!”', 'npc');
  }
  debtNewDay();
  policiesNewDay();
  forgetFaded();
  checkAch();
}

let tickCount = 0;
/** Whether the game screen is showing. Tests run headless and skip the DOM check. */
let screenGate: () => boolean = () => $('#scr-game').classList.contains('active');
export function setScreenGate(fn: () => boolean): void { screenGate = fn; }

export function tick(): void {
  if (!G || modalOpen || !screenGate()) return;
  G.minute += STEP;
  if (G.minute >= 1440) { G.minute -= 1440; newDay(); toast(`🌅 <b>Day ${G.day}</b> for ${esc(G.name)}. A new day.`, 'sys'); }
  // daily food from 06:00
  if (G.lastFoodDay < G.day && G.minute >= 360) {
    G.lastFoodDay = G.day;
    if (G.cash >= 400) { addCash(-400, 'Daily food'); G.hunger = clamp(G.hunger - 30, 0, 100); toast('🍲 You cooked some soup. Daily food: ₦400.', 'sys'); }
    else { G.hunger = clamp(G.hunger + 15, 0, 100); mood(-8); toast('🥺 No money for proper food. Noodles again.', 'bad'); }
  }
  // weather drift every ~3 game-hours
  if (chance(.02)) updateWeather();
  // pending token credit
  if (G.pendingCredit && T() >= G.pendingCredit.at) {
    const u = G.pendingCredit.units; G.pendingCredit = null; loadToken(u);
    toast('⏳ The delayed token finally arrived.', 'sys');
  }
  // electricity engine (paused during the scripted intro)
  if (G.intro >= 99 && T() >= G.nextFlip) flipGrid();
  if (G.gridOn && G.flashUntil && T() >= G.flashUntil) { G.gridOn = false; G.flashUntil = 0; blackoutFX(); G.nextFlip = T() + rnd(20, 90); }
  const gridPow = G.gridOn && G.meterUnits > 0;
  const load = loadLevel();
  // generator overload
  if (G.genOn && load > genCapacity()) {
    stopGen(true); G.genCond = clamp(G.genCond - 4, 5, 100); sfx.bad();
    toast('⚠️ <b>Generator tripped!</b> A small generator can’t run everything. Turn some appliances off.', 'bad');
  }
  // meter consumption (changeover: gen carries the house while it runs)
  if (gridPow && !G.genOn) { G.meterUnits = Math.max(0, G.meterUnits - applianceDrain() * STEP); if (G.meterUnits <= 0) meterEmpty(); }
  if (gridPow && G.meterUnits < 4 && G.meterUnits > 0 && chance(.01)) toast('🔋 Low credit: only <b>' + G.meterUnits.toFixed(1) + ' units</b> left. Top up on NextPawa.', 'bad');
  // generator
  if (G.genOn) {
    const lateNight = G.minute >= 22 * 60 || G.minute < 6 * 60;
    G.fuel -= DRAIN_GEN[G.gen] * STEP * (hasTrait('genking') ? 0.7 : 1);
    G.noise = clamp(G.noise + (G.gen === 2 ? 1.1 : 0.8) * (hasTrait('genking') ? 1.5 : 1), 0, 100);
    G.genCond = clamp(G.genCond - 0.15, 5, 100);
    G.week.c.genMin += STEP;
    if (G.fuel <= 0) { G.fuel = 0; stopGen(true); toast('⛽ <b>Out of fuel!</b> The generator coughed and died.', 'bad'); sfx.bad(); suggest('fuel'); }
    if (G.policies.genCurfew && lateNight && chance(.04)) {
      addCash(-Math.min(CURFEW_FINE, G.cash), 'Gen curfew fine'); trust(-3); mood(-2);
      toast(`🔇 The curfew patrol caught your generator! <b>₦${CURFEW_FINE} fine</b>. "Rules are rules."`, 'bad'); sfx.bad();
    }
    const complainP = lateNight ? .03 : G.policies.genCurfew ? .009 : .015; // daytime gen is tolerated once there's a curfew
    if (G.noise > 30 && chance(complainP)) {
      const n = pick(NPCDEF.filter((x) => x.id !== 'helpful'));
      G.stats.complaints++; G.stats.noiseThisBlackout++;
      const pen = hasTrait('quiet') ? 2 : 5;
      rel(n.id, -pen); mood(-3); remember(n.id, 'noise');
      toast('🗣️ ' + n.name + ': <b>“Please, turn off that generator!”</b> The noise fills the compound. (Rel −' + pen + ')', 'bad');
      if (chance(.4)) G.noise = 15;
    }
  } else G.noise = clamp(G.noise - 0.5, 0, 100);
  // inverter / solar battery
  if (G.inverter > 0) {
    if (gridPow || G.genOn) G.invCharge = clamp(G.invCharge + 0.8, 0, 100);
    else if (G.solar > 0 && sunUp()) G.invCharge = clamp(G.invCharge + 0.6, 0, 100);
    else if (G.invCharge > 0) G.invCharge = clamp(G.invCharge - (0.08 + 0.22 * load), 0, 100);
  }
  // rechargeable fan battery
  if (G.fanRecharge > 0) {
    if (powered()) G.fanBat = clamp(G.fanBat + 1.5, 0, 100);
    else if (G.fanBat > 0 && (isNight() || G.temp >= 33)) G.fanBat = clamp(G.fanBat - 0.6, 0, 100);
  }
  // phone
  G.phone = clamp(G.phone + (powered() ? 2.2 : -0.35), 0, 100);
  if (G.phone < 20) G.week.c.phoneLow = true;
  // business owner: shop sells while there's power
  if (G.bg === 'business' && powered() && G.minute > 8 * 60 && G.minute < 21 * 60) G.cash += 4;
  // needs
  G.hunger = clamp(G.hunger + 0.14, 0, 100);
  if (G.hunger > 85) { mood(-0.4); if (chance(.01)) toast('🍲 You’re very hungry. Go and eat!', 'bad'); }
  if (isNight() && !cooling() && G.temp >= 30) { mood(-0.35); if (chance(.008)) toast('🥵 Too hot to sleep. The fan needs power.', 'bad'); }
  if (isNight() && !powered() && !G.lamp && !streetLit()) { mood(-0.12); if (chance(.006)) toast('🌑 Pitch dark. You can’t see your own hand. A rechargeable lamp from the Shop would help.', 'bad'); }
  if (G.tvOn && powered() && hourNow() > 17) fun(0.25); else fun(-0.12);
  if (G.fun < 25) mood(-0.15);
  // happiness drifts toward an equilibrium set by power, noise and community trust
  const eq = 55 + (powered() ? 8 : 0) - (G.genOn && G.noise > 40 ? 6 : 0) + G.trust / 20;
  G.happiness += (eq - G.happiness) * 0.004;
  // scheduled street meeting, otherwise random events
  if (G.intro >= 99 && meetingDue()) callMeeting();
  else if (G.intro >= 99 && chance(EVENT_CHANCE)) rollEvent();
  worldTick(); // before jobTick, so work starts the tick you arrive
  jobTick(STEP);
  ordersTick();
  checkChallenges();
  checkAch();
  if (++tickCount % 15 === 0) save();
  updHUD();
}
