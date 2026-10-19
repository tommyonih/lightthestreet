/* Weighted, cooldown-based street events. Add a scenario by appending to EVENTS. */
import { G, T, save } from '../core/state';
import { chance, clamp, esc, fmt, pick, rnd } from '../core/util';
import { sfx } from '../core/audio';
import { NPCDEF } from '../data/content';
import { openModal } from '../ui/modal';
import { toast } from '../ui/toast';
import { updHUD } from '../ui/hud';
import { addCash } from './economy';
import { addFund, npcPays, SHARE, startFundDrive } from './fund';
import { startGen } from './generator';
import { atHome } from './world';
import { cooling, fun, hasTrait, mood, npcDef, npcState, powered, rel, trust } from './helpers';
import { checkAch } from './progress';
import { doFavour, doGrudge, favourCandidate, grudgeCandidate, remember } from './memory';
import { present } from './schedule';
import { blackoutFX } from './sim';

export interface GameEvent {
  id: string;
  /** Cooldown in game minutes before this event can fire again. */
  cd: number;
  /** Relative weight among eligible events. */
  w: number;
  cond: () => boolean;
  run: () => void;
}

export const EVENTS: GameEvent[] = [
  { id: 'whoneverpay', cd: 300, w: 3, cond: () => !G.streetlightFixed && G.owing.length > 0 && present('gist'),
    run() {
      const id = pick(G.owing); const d = npcDef(id); const broke = d.broke;
      openModal('🗣️ Who Never Pay?', `Aunty Caro: <i>"${d.id === 'gist' ? 'Me? I go pay o, no look me like that! But anyway — ' : ''}${esc(d.name)} never drop their own for the street fund o! ${broke ? 'E say e go pay next week — next week never end since!' : 'We need transparency!'}"</i><br><br>Fund: ₦${fmt(G.fund)}/₦${fmt(G.fundGoal)}. Wetin you wan do?`, [
        { t: `Cover their share — ₦${fmt(SHARE)}`, dis: G.cash < SHARE, sub: broke ? `${d.name} go dey grateful well-well` : '', fn: () => {
          addCash(-SHARE, 'Covered ' + d.name + '’s share');
          G.stats.helped++; rel(id, 12); trust(5); remember(id, 'covered');
          toast(`🤝 You cover ${d.name}. "${broke ? 'Bros, God go bless you! I no go forget!' : 'Wow. Thank you — I go refund you.'}"`, 'sys'); sfx.cash();
          npcPays(id); checkAch(); save(); updHUD();
        } },
        { t: 'Remind them privately', sub: 'Works better if una close', fn: () => {
          const ok = chance((broke ? .3 : .55) + (npcState(id).rel - 50) / 150);
          if (ok) { rel(id, 4); toast(`✅ ${d.name} pay after your gist! Fund: ₦${fmt(G.fund + SHARE)}`, 'sys'); sfx.cash(); npcPays(id); }
          else { rel(id, -8); trust(-3); remember(id, 'nagged'); toast(`😒 ${d.name}: "Abeg, no harass me. I go pay." (But you no sure.)`, 'bad'); }
          save(); updHUD();
        } },
        { t: 'Expose am for compound meeting', sub: 'Needs street trust. Burns the relationship.', fn: () => {
          const hi = G.trust > 60; trust(hi ? 6 : -6); rel(id, -15); remember(id, 'exposed');
          if (chance(hi ? .75 : .4)) { toast(`📢 Small drama, but ${d.name} pay after meeting pressure!`, 'sys'); npcPays(id); }
          else toast('📢 Meeting turn to full gist session. Everybody dey talk at once. Nothing resolved!', 'bad');
          save(); updHUD();
        } },
        { t: 'Mind your business' },
      ]);
    } },
  { id: 'heat', cd: 300, w: 3, cond: () => G.temp >= 34 && !cooling(),
    run() {
      openModal('🥵 Heat Don Start!', 'Afternoon sun dey cook everybody. Sweat full your back. Fan no dey spin because light no dey.', [
        { t: 'Carry chair outside with neighbours (free gist)', fn: () => {
          fun(8); mood(5); const d = pick(NPCDEF); rel(d.id, 3); remember(d.id, 'gisted');
          toast(`🪑 You gist with ${d.name} for corridor. "${pick(d.greet)}" Laugh small — heat reduce.`, 'sys');
        } },
        { t: 'Buy cold drink — ₦300', dis: G.cash < 300, fn: () => { addCash(-300, 'Cold drink'); mood(7); G.hunger = clamp(G.hunger - 8, 0, 100); toast('🥤 Ice-cold Coke hit different for afternoon heat!', 'sys'); sfx.cash(); } },
        { t: 'Endure am (prayer & patience)', fn: () => { mood(-6); toast('🥵 You lie down like roast plantain. E no easy.', 'bad'); } },
      ]);
    } },
  { id: 'phone1', cd: 350, w: 4, cond: () => G.phone <= 10 && !powered(),
    run() {
      openModal('📱 Phone dey die!', 'Your phone dey blink red. During blackout! All your gist, your hustle contacts, everything — about to vanish.', [
        { t: 'Use power bank', dis: !(G.powerbank > 0 && G.pbankCharges > 0), fn: () => { G.pbankCharges--; G.phone = 45; toast('🔋 Power bank gbedu! Phone don rise to 45%.', 'sys'); sfx.on(); } },
        ...(G.policies.solarHub ? [{ t: 'Run go the community charging hub (free)', sub: 'Street vote pay off!', fn: () => { G.phone = 55; toast('🔌 Charging hub for Aunty Solar’s place — free, as the street agree. 55%!', 'sys'); } }] : []),
        { t: 'Pay ₦200 for charging kiosk', dis: G.cash < 200, fn: () => { addCash(-200, 'Charging kiosk'); G.phone = 60; toast('📱 You carry phone go the junction charging kiosk. Small time, e don reach 60%.', 'sys'); } },
        { t: 'Risk am — "e no go die"', fn: () => {
          if (chance(.5)) { G.phone = Math.max(G.phone, 1); toast('📱 E hang on like government promise. Respect.', 'sys'); }
          else { G.phone = 0; mood(-8); toast('📵 Phone DON DIE. You dey look ceiling dey think about life.', 'bad'); sfx.bad(); }
        } },
      ]);
    } },
  { id: 'landlord', cd: 600, w: 3, cond: () => G.day >= (G.flags.rentNext || 3) && G.minute > 8 * 60 && G.minute < 20 * 60,
    run() {
      const due = 1500;
      openModal('🏠 Landlord’s Announcement', `Baba Landlord knock your door: <i>"${esc(G.name)}! Weekly compound dues don due. ₦${fmt(due)}. I no dey do shishi this month."</i>`, [
        { t: `Pay ₦${fmt(due)} sharp-sharp`, dis: G.cash < due, fn: () => {
          addCash(-due, 'Compound dues'); G.flags.rentNext = G.day + 7; trust(4); rel('landlord', 10); remember('landlord', 'paidRent');
          toast('🏠 "Good tenant!" Baba Landlord dey hail you. "Your light matter go dey my prayer point."', 'sys'); sfx.cash();
        } },
        { t: 'Negotiate: pay ₦800 now, rest later', dis: G.cash < 800, sub: 'He go come back in 3 days', fn: () => {
          addCash(-800, 'Partial dues'); G.flags.rentNext = G.day + 3; rel('landlord', 1);
          toast('🏠 "Hm. I go manage am. But no let am repeat o."', 'sys');
        } },
        { t: '"Sir, NEPA never even give us light…"', fn: () => {
          remember('landlord', 'excuse');
          if (chance(.5)) { G.flags.rentNext = G.day + 2; rel('landlord', -6); toast('🏠 After long speech, e waka go. You don buy time — no be free time o.', 'sys'); }
          else { mood(-6); G.flags.rentNext = G.day + 4; rel('landlord', -3); toast('🏠 "Light no dey, rent no dey too abi? Drop ₦800 make I see road."', 'bad'); addCash(-Math.min(800, G.cash), 'Landlord pressure payment'); }
        } },
      ]);
    } },
  { id: 'rain', cd: 500, w: 2, cond: () => !G.gridOn && (G.minute > 19 * 60 || G.minute < 5 * 60) && (G.weather === 'rain' || G.weather === 'storm'),
    run() {
      openModal('🌧️ Rain & Darkness', 'Rain dey fall heavy! Plus blackout! Generator shed dey leak small — and your fuel keg dey outside.', [
        { t: 'Rush secure the gen shed (small hustle)', fn: () => {
          if (G.gen > 0) G.genCond = clamp(G.genCond + 5, 0, 100); trust(4); G.stats.helped++;
          toast('🏃‍♂️ You block the leak with old zinc. Gen safe. Neighbours see you — respect.', 'sys'); checkAch();
        } },
        { t: 'Leave am — rain na rain', fn: () => {
          if (G.gen > 0 && chance(.6)) { G.genCond = clamp(G.genCond - 15, 5, 100); toast('🔌 Morning come: gen soak small. Condition drop! "I for just carry am inside" — no be so e dey work o! Gen must stay outside, but covered.', 'bad'); }
          else toast('🌧️ Lucky you. Rain no touch anything.', 'sys');
        } },
      ]);
    } },
  { id: 'fund', cd: 900, w: 2, cond: () => !G.streetlightFixed && (G.npcs.some((n) => !n.paid) || !G.youPaid),
    run() { startFundDrive(); } },
  { id: 'fridge', cd: 400, w: 2, cond: () => G.fridgeOn && G.stats.blackouts > 0 && G.minute > 11 * 60 && G.minute < 22 * 60 && !powered(),
    run() {
      openModal('🧊 Freezer Wahala', 'Your freezer don dey drip. All that meat and fish from the market… e fit spoil by morning if power no return.', [
        { t: 'Carry am go Aunty Solar (solar neighbour)', sub: npcState('solar').rel < 40 ? 'She no too like you…' : '', fn: () => {
          if (npcState('solar').rel < 40 && chance(.5)) { toast('☀️ Aunty Solar: "My freezer full, sorry." (Una relationship no reach.)', 'bad'); rel('solar', 2); return; }
          rel('solar', 8); G.stats.helped++;
          toast('☀️ Aunty Solar plug you for her solar freezer. "No shaking, my own no dey take light."', 'sys'); checkAch();
        } },
        { t: 'Cook everything tonight (owambe for one) — ₦500', dis: G.cash < 500, fn: () => {
          addCash(-500, 'Emergency cooking gas'); G.hunger = 0; mood(8);
          toast('🍲 You cook all the meat. You chop like village wedding. Zero waste!', 'sys');
        } },
        { t: 'Pray & hope', fn: () => {
          if (chance(.4)) { toast('🙏 Morning come, freezer still cold! Miracle no dey tire Jesus.', 'sys'); return; }
          const loss = Math.min(1200, G.cash); if (loss > 0) addCash(-loss, 'Replacing spoiled food');
          mood(loss < 1200 ? -12 : -8);
          toast(`🤢 The fish don turn science experiment.${loss > 0 ? ' ₦' + fmt(loss) + ' for new market. Ouch.' : ' And you no get money to replace am.'}`, 'bad'); sfx.bad();
        } },
      ]);
    } },
  { id: 'football', cd: 700, w: 2, cond: () => !G.gridOn && !G.genOn && G.minute > 15 * 60 && G.minute < 21 * 60,
    run() {
      openModal('⚽ Football Wahala', 'Champions League semi-final, 70th minute, score 1-1 — NEPA take light! The whole street shout at once!', [
        { t: 'Fire gen now! (Football no get duplicate)', dis: !(G.gen > 0 && G.fuel > 0) || !atHome(), sub: atHome() ? '' : 'Your gen dey house — you no dey', fn: () => {
          G.tvOn = true; startGen();
          if (G.genOn) { fun(12); mood(8); toast('⚽ You see the winning goal LIVE. History!', 'sys'); }
          updHUD();
        } },
        { t: 'Run go viewing centre — ₦300', dis: G.cash < 300, fn: () => { addCash(-300, 'Viewing centre'); fun(10); toast('📺 Viewing centre loud like stadium. You see everything. Worth it!', 'sys'); } },
        { t: 'Check live score on your phone', dis: G.phone <= 1, fn: () => { G.phone = Math.max(0, G.phone - 4); fun(3); toast('📱 You refresh score page like say e owe you money. E finally load: 2-1!', 'sys'); } },
      ]);
    } },
  { id: 'exam', cd: 800, w: 2, cond: () => (G.bg === 'student' || G.day >= 3) && G.minute > 18 * 60 && !G.gridOn && present('student'),
    run() {
      openModal('📚 Exam Panic', 'Chidera dey knock: <i>"Abeg! My laptop don die and CBT exam na 8am tomorrow! Any light? Any?!"</i>', [
        { t: 'Lend her your power bank', dis: !(G.powerbank > 0 && G.pbankCharges > 0), fn: () => {
          G.pbankCharges--; rel('student', 15); G.stats.helped++; remember('student', 'lentPowerbank');
          toast('📚 Chidera dey hail your name like national anthem. "I go pass this exam because of you!"', 'sys'); sfx.cheer(); checkAch();
        } },
        { t: 'Start gen for the compound tonight', dis: !(G.gen > 0 && G.fuel >= 1) || !atHome(), sub: atHome() ? '1L fuel, big karma' : 'Your gen dey house — you no dey', fn: () => {
          startGen(); if (!G.genOn) return;
          G.fuel = Math.max(0, G.fuel - 1); rel('student', 12); trust(8); G.stats.helped++; remember('student', 'genForCompound'); remember('remote', 'genForCompound');
          toast('🌙 Gen dey run for the whole compound. Chidera dey read, Tunde dey work, everybody hail you!', 'sys'); checkAch();
        } },
        { t: '"Manage am, na so e be"', fn: () => { rel('student', -10); remember('student', 'refused'); toast('📚 Chidera waka go dey find light upandan. Her eye red.', 'bad'); } },
      ]);
    } },
  { id: 'transformer', cd: 1200, w: 1, cond: () => G.gridOn && G.day >= 2 && !G.flags.transformerDone,
    run() {
      G.flags.transformerDone = true;
      G.gridOn = false; blackoutFX();
      G.nextFlip = T() + rnd(360, 720); // long outage: 6–12 game hours
      openModal('🔥 Transformer Fault!', 'KPA-KPA-POOM! The transformer for your street blow! Blue spark, small smoke, everywhere dark — and this one no be small matter. E fit take long…', [
        { t: 'Join emergency street meeting', fn: () => {
          if (hasTrait('chairman') || G.trust > 60) { trust(10); addFund(1500); toast('🎖️ You address the meeting! People contribute ₦1,500 on the spot. Leadership!', 'sys'); sfx.cheer(); }
          else { toast('🗣️ You attend the meeting. Plenty talk, small action — but unity dey grow.', 'sys'); trust(5); }
        } },
        { t: 'Just dey observe from your window', fn: () => { toast('🪟 You watch the drama like seasonal film. Somebody don already blame spiritual attack.', 'sys'); } },
      ]);
    } },
  { id: 'theft', cd: 900, w: 2, cond: () => !G.policies.security && G.day >= 2 && (G.minute >= 23 * 60 || G.minute < 4 * 60) && (G.fuel >= 1 || G.powerbank > 0),
    run() {
      const fuelGone = G.fuel >= 1;
      openModal('🕵️ Thief Visit!', `Morning come: ${fuelGone ? 'your fuel keg don waka comot from the gen shed!' : 'your power bank no dey where you keep am!'} Somebody climb the fence for night.<br><br><span style="color:var(--dim)">Street meetings fit vote for a night guard…</span>`, [
        { t: 'Report to Chairman — "we need security!"', fn: () => {
          if (fuelGone) G.fuel = 0; else { G.powerbank = 0; G.pbankCharges = 0; }
          trust(2); toast(`🗣️ ${G.policies.youChair ? 'You put am for next meeting agenda' : 'Chairman Dele: "I go raise am for meeting."'} Security matter don enter people mind.`, 'sys');
        } },
        { t: 'Search the compound yourself', fn: () => {
          if (chance(.3)) toast(`🔦 You find am behind the borehole! ${fuelGone ? 'Fuel' : 'Power bank'} recovered. Thief run comot.`, 'sys');
          else { if (fuelGone) G.fuel = 0; else { G.powerbank = 0; G.pbankCharges = 0; } mood(-5); toast('🔦 You search tire. Nothing. Na so the thing go.', 'bad'); }
        } },
      ]);
    } },
  { id: 'favour', cd: 240, w: 3, cond: () => favourCandidate(present) !== null,
    run() { doFavour(favourCandidate(present)!); } },
  { id: 'grudge', cd: 300, w: 3, cond: () => grudgeCandidate() !== null,
    run() { doGrudge(grudgeCandidate()!); } },
  { id: 'borrowunits', cd: 600, w: 2, cond: () => G.gridOn && G.meterUnits > 6 && !G.flags.emekaUnits && present('broke'),
    run() {
      openModal('🙏 Borrow Me Small Units', 'Emeka come your door, head bow: <i>"Bros, abeg — my meter don finish and I get interview call by 5. Borrow me 3 units? I go pay you back, I swear on my mother."</i>', [
        { t: 'Lend 3 units', fn: () => {
          G.meterUnits -= 3; G.flags.emekaUnits = 3; rel('broke', 15); G.stats.helped++; remember('broke', 'lentUnits');
          toast('🤝 "Bros!! You too much!" Emeka dey dance. (Whether e go pay back… na story for another day.)', 'sys'); checkAch();
        } },
        { t: '"Omo, my own sef dey cry"', fn: () => { rel('broke', -4); remember('broke', 'refused'); toast('🙏 Emeka nod slow-slow. "No wahala… no wahala." Guilt small, but survival first.', 'bad'); } },
      ]);
    } },
];

/** Minimum game minutes between any two events. */
const EVENT_GAP = 90;

export function rollEvent(): void {
  const now = T();
  if (now - (G.lastEvent || 0) < EVENT_GAP) return;
  const ok = EVENTS.filter((e) => (G.evCd[e.id] || 0) < now && e.cond());
  if (!ok.length) return;
  const tot = ok.reduce((s, e) => s + e.w, 0); let r = Math.random() * tot;
  for (const e of ok) {
    r -= e.w;
    if (r <= 0) { G.evCd[e.id] = now + e.cd; G.lastEvent = now; G.stats.events++; e.run(); return; }
  }
}
