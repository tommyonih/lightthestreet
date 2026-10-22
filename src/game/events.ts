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
import { dealModal, dealTaken, todaysDeals } from './orders';
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
      openModal('🗣️ Who Hasn\'t Paid?', `Aunty Caro: <i>"${d.id === 'gist' ? 'Me? I\'ll pay, don\'t look at me like that! Anyway, ' : ''}${esc(d.name)} still hasn't paid into the street fund! ${broke ? 'He keeps saying next week.' : 'We need transparency!'}"</i><br><br>Fund: ₦${fmt(G.fund)}/₦${fmt(G.fundGoal)}. What do you do?`, [
        { t: `Cover their share: ₦${fmt(SHARE)}`, dis: G.cash < SHARE, sub: broke ? `${d.name} will be very grateful` : '', fn: () => {
          addCash(-SHARE, 'Covered ' + d.name + '’s share');
          G.stats.helped++; rel(id, 12); trust(5); remember(id, 'covered');
          toast(`🤝 You covered ${d.name}. "${broke ? 'God bless you! I won\'t forget this!' : 'Wow, thank you. I\'ll pay you back.'}"`, 'sys'); sfx.cash();
          npcPays(id); checkAch(); save(); updHUD();
        } },
        { t: 'Remind them privately', sub: 'Works better if you\'re close', fn: () => {
          const ok = chance((broke ? .3 : .55) + (npcState(id).rel - 50) / 150);
          if (ok) { rel(id, 4); toast(`✅ ${d.name} paid after your chat. Fund: ₦${fmt(G.fund + SHARE)}`, 'sys'); sfx.cash(); npcPays(id); }
          else { rel(id, -8); trust(-3); remember(id, 'nagged'); toast(`😒 ${d.name}: "Stop pressuring me. I\'ll pay." (You\'re not so sure.)`, 'bad'); }
          save(); updHUD();
        } },
        { t: 'Call them out at the compound meeting', sub: 'Needs street trust. Damages the relationship.', fn: () => {
          const hi = G.trust > 60; trust(hi ? 6 : -6); rel(id, -15); remember(id, 'exposed');
          if (chance(hi ? .75 : .4)) { toast(`📢 A bit of drama, but ${d.name} paid after the meeting.`, 'sys'); npcPays(id); }
          else toast('📢 The meeting turned into a shouting match. Nothing was resolved.', 'bad');
          save(); updHUD();
        } },
        { t: 'Mind your business' },
      ]);
    } },
  { id: 'heat', cd: 300, w: 3, cond: () => G.temp >= 34 && !cooling(),
    run() {
      openModal('🥵 The Heat Is On', 'The afternoon sun is cooking everyone. No power, so no fan.', [
        { t: 'Sit outside with the neighbours', fn: () => {
          fun(8); mood(5); const d = pick(NPCDEF); rel(d.id, 3); remember(d.id, 'gisted');
          toast(`🪑 You chat with ${d.name} in the corridor. "${pick(d.greet)}" The laughs help with the heat.`, 'sys');
        } },
        { t: 'Buy a cold drink: ₦300', dis: G.cash < 300, fn: () => { addCash(-300, 'Cold drink'); mood(7); G.hunger = clamp(G.hunger - 8, 0, 100); toast('🥤 An ice-cold drink. Perfect in this heat.', 'sys'); sfx.cash(); } },
        { t: 'Just endure it', fn: () => { mood(-6); toast('🥵 You lie still and sweat. Not easy.', 'bad'); } },
      ]);
    } },
  { id: 'phone1', cd: 350, w: 4, cond: () => G.phone <= 10 && !powered(),
    run() {
      openModal('📱 Phone Dying!', 'Your phone is blinking red, in the middle of a blackout. Your contacts, your hustle, everything is about to go dark.', [
        { t: 'Use your power bank', dis: !(G.powerbank > 0 && G.pbankCharges > 0), fn: () => { G.pbankCharges--; G.phone = 45; toast('🔋 Power bank to the rescue. Phone at 45%.', 'sys'); sfx.on(); } },
        ...(G.policies.solarHub ? [{ t: 'Go to the street charging hub (free)', sub: 'The street vote paid off!', fn: () => { G.phone = 55; toast('🔌 The charging hub at Aunty Solar\'s is free, as the street agreed. 55%!', 'sys'); } }] : []),
        { t: 'Pay ₦200 at a charging kiosk', dis: G.cash < 200, fn: () => { addCash(-200, 'Charging kiosk'); G.phone = 60; toast('📱 You charged at the junction kiosk. 60%.', 'sys'); } },
        { t: 'Risk it', fn: () => {
          if (chance(.5)) { G.phone = Math.max(G.phone, 1); toast('📱 It hangs on. Respect.', 'sys'); }
          else { G.phone = 0; mood(-8); toast('📵 Your phone died. You stare at the ceiling.', 'bad'); sfx.bad(); }
        } },
      ]);
    } },
  { id: 'landlord', cd: 600, w: 3, cond: () => G.day >= (G.flags.rentNext || 3) && G.minute > 8 * 60 && G.minute < 20 * 60,
    run() {
      const due = 1500;
      openModal('🏠 The Landlord Knocks', `Baba Landlord at your door: <i>"${esc(G.name)}! Weekly compound dues: ₦${fmt(due)}. No excuses this month."</i>`, [
        { t: `Pay ₦${fmt(due)} now`, dis: G.cash < due, fn: () => {
          addCash(-due, 'Compound dues'); G.flags.rentNext = G.day + 7; trust(4); rel('landlord', 10); remember('landlord', 'paidRent');
          toast('🏠 "Good tenant!" Baba Landlord is pleased with you.', 'sys'); sfx.cash();
        } },
        { t: 'Pay ₦800 now, the rest later', dis: G.cash < 800, sub: 'He\'ll come back in 3 days', fn: () => {
          addCash(-800, 'Partial dues'); G.flags.rentNext = G.day + 3; rel('landlord', 1);
          toast('🏠 "Hm. Fine. But don\'t make it a habit."', 'sys');
        } },
        { t: '"Sir, we haven\'t even had power…"', fn: () => {
          remember('landlord', 'excuse');
          if (chance(.5)) { G.flags.rentNext = G.day + 2; rel('landlord', -6); toast('🏠 After a long lecture, he leaves. You bought some time, but not much.', 'sys'); }
          else { mood(-6); G.flags.rentNext = G.day + 4; rel('landlord', -3); toast('🏠 "No power means no rent? Give me ₦800 for now."', 'bad'); addCash(-Math.min(800, Math.max(0, G.cash)), 'Landlord pressure payment'); }
        } },
      ]);
    } },
  { id: 'rain', cd: 500, w: 2, cond: () => !G.gridOn && (G.minute > 19 * 60 || G.minute < 5 * 60) && (G.weather === 'rain' || G.weather === 'storm'),
    run() {
      openModal('🌧️ Rain in the Dark', 'Heavy rain, and a blackout. The generator shed is leaking, and your fuel can is outside.', [
        { t: 'Rush out and cover the shed', fn: () => {
          if (G.gen > 0) G.genCond = clamp(G.genCond + 5, 0, 100); trust(4); G.stats.helped++;
          toast('🏃‍♂️ You blocked the leak with old roofing sheet. The neighbours noticed.', 'sys'); checkAch();
        } },
        { t: 'Leave it', fn: () => {
          if (G.gen > 0 && chance(.6)) { G.genCond = clamp(G.genCond - 15, 5, 100); toast('🔌 By morning your generator is soaked and in worse shape. Generators must stay outside, but covered.', 'bad'); }
          else toast('🌧️ Lucky. The rain didn\'t damage anything.', 'sys');
        } },
      ]);
    } },
  { id: 'fund', cd: 900, w: 2, cond: () => !G.streetlightFixed && (G.npcs.some((n) => !n.paid) || !G.youPaid),
    run() { startFundDrive(); } },
  { id: 'fridge', cd: 400, w: 2, cond: () => G.fridgeOn && G.stats.blackouts > 0 && G.minute > 11 * 60 && G.minute < 22 * 60 && !powered(),
    run() {
      openModal('🧊 Freezer Trouble', 'Your freezer is dripping. All that meat and fish could spoil by morning if power doesn\'t come back.', [
        { t: 'Take it to Aunty Solar', sub: npcState('solar').rel < 40 ? 'She doesn\'t like you much…' : '', fn: () => {
          if (npcState('solar').rel < 40 && chance(.5)) { toast('☀️ Aunty Solar: "Sorry, my freezer is full." (You\'re not close enough.)', 'bad'); rel('solar', 2); return; }
          rel('solar', 8); G.stats.helped++;
          toast('☀️ Aunty Solar makes room in her solar freezer. "No problem, mine never goes off."', 'sys'); checkAch();
        } },
        { t: 'Cook everything tonight: ₦500', dis: G.cash < 500, fn: () => {
          addCash(-500, 'Emergency cooking gas'); G.hunger = 0; mood(8);
          toast('🍲 You cooked all the meat and ate like it was a wedding. Zero waste!', 'sys');
        } },
        { t: 'Hope for the best', fn: () => {
          if (chance(.4)) { toast('🙏 By morning the freezer is still cold. A small miracle.', 'sys'); return; }
          const loss = Math.min(1200, Math.max(0, G.cash)); if (loss > 0) addCash(-loss, 'Replacing spoiled food');
          mood(loss < 1200 ? -12 : -8);
          toast(`🤢 The fish has gone off.${loss > 0 ? ' ₦' + fmt(loss) + ' to restock. Ouch.' : ' And you can\'t afford to replace it.'}`, 'bad'); sfx.bad();
        } },
      ]);
    } },
  { id: 'football', cd: 700, w: 2, cond: () => !G.gridOn && !G.genOn && G.minute > 15 * 60 && G.minute < 21 * 60,
    run() {
      openModal('⚽ Power Cut at the Match', 'Champions League semi-final, 70th minute, 1-1, and the power goes! The whole street screams at once.', [
        { t: 'Start the generator now!', dis: !(G.gen > 0 && G.fuel > 0) || !atHome(), sub: atHome() ? '' : 'Your generator is at home and you\'re not', fn: () => {
          G.tvOn = true; startGen();
          if (G.genOn) { fun(12); mood(8); toast('⚽ You saw the winning goal live!', 'sys'); }
          updHUD();
        } },
        { t: 'Run to the viewing centre: ₦300', dis: G.cash < 300, fn: () => { addCash(-300, 'Viewing centre'); fun(10); toast('📺 The viewing centre is as loud as a stadium. Worth it!', 'sys'); } },
        { t: 'Follow the live score on your phone', dis: G.phone <= 1, fn: () => { G.phone = Math.max(0, G.phone - 4); fun(3); toast('📱 You refresh and refresh. Finally: 2-1!', 'sys'); } },
      ]);
    } },
  { id: 'exam', cd: 800, w: 2, cond: () => (G.bg === 'student' || G.day >= 3) && G.minute > 18 * 60 && !G.gridOn && present('student'),
    run() {
      openModal('📚 Exam Panic', 'Chidera knocks: <i>"Please! My laptop is dead and my exam is at 8am tomorrow! Is there any power anywhere?"</i>', [
        { t: 'Lend her your power bank', dis: !(G.powerbank > 0 && G.pbankCharges > 0), fn: () => {
          G.pbankCharges--; rel('student', 15); G.stats.helped++; remember('student', 'lentPowerbank');
          toast('📚 Chidera can\'t stop thanking you. "I\'ll pass this exam because of you!"', 'sys'); sfx.cheer(); checkAch();
        } },
        { t: 'Run your generator for the compound tonight', dis: !(G.gen > 0 && G.fuel >= 1) || !atHome(), sub: atHome() ? '1L of fuel, lots of goodwill' : 'Your generator is at home and you\'re not', fn: () => {
          startGen(); if (!G.genOn) return;
          G.fuel = Math.max(0, G.fuel - 1); rel('student', 12); trust(8); G.stats.helped++; remember('student', 'genForCompound'); remember('remote', 'genForCompound');
          toast('🌙 Your generator powers the whole compound. Chidera studies, Tunde works, and everyone thanks you.', 'sys'); checkAch();
        } },
        { t: '"Sorry, you\'ll have to manage"', fn: () => { rel('student', -10); remember('student', 'refused'); toast('📚 Chidera leaves to look for power somewhere else. She\'s upset.', 'bad'); } },
      ]);
    } },
  { id: 'transformer', cd: 1200, w: 1, cond: () => G.gridOn && G.day >= 2 && !G.flags.transformerDone,
    run() {
      G.flags.transformerDone = true;
      G.gridOn = false; blackoutFX();
      G.nextFlip = T() + rnd(360, 720); // long outage: 6–12 game hours
      openModal('🔥 Transformer Blown!', 'BANG! The street\'s transformer just blew. Blue sparks, smoke, and total darkness. This could take a while.', [
        { t: 'Join the emergency street meeting', fn: () => {
          if (hasTrait('chairman') || G.trust > 60) { trust(10); addFund(1500); toast('🎖️ You lead the meeting! People contribute ₦1,500 on the spot.', 'sys'); sfx.cheer(); }
          else { toast('🗣️ Lots of talk, little action, but the street is pulling together.', 'sys'); trust(5); }
        } },
        { t: 'Watch from your window', fn: () => { toast('🪟 You watch the drama. Someone is already blaming witchcraft.', 'sys'); } },
      ]);
    } },
  { id: 'theft', cd: 900, w: 2, cond: () => !G.policies.security && G.day >= 2 && (G.minute >= 23 * 60 || G.minute < 4 * 60) && (G.fuel >= 1 || G.powerbank > 0),
    run() {
      const fuelGone = G.fuel >= 1;
      openModal('🕵️ Thief in the Night!', `In the morning, ${fuelGone ? 'your fuel can is gone from the generator shed!' : 'your power bank is missing!'} Someone climbed the fence overnight.<br><br><span style="color:var(--dim)">The street meeting could vote for a night guard…</span>`, [
        { t: 'Report it to the chairman', fn: () => {
          if (fuelGone) G.fuel = 0; else { G.powerbank = 0; G.pbankCharges = 0; }
          trust(2); toast(`🗣️ ${G.policies.youChair ? 'You put security on the next meeting\'s agenda.' : 'Chairman Dele: "I\'ll raise it at the meeting."'}`, 'sys');
        } },
        { t: 'Search the compound yourself', fn: () => {
          if (chance(.3)) toast(`🔦 Found it behind the borehole! ${fuelGone ? 'Fuel' : 'Power bank'} recovered.`, 'sys');
          else { if (fuelGone) G.fuel = 0; else { G.powerbank = 0; G.pbankCharges = 0; } mood(-5); toast('🔦 You searched everywhere. Nothing.', 'bad'); }
        } },
      ]);
    } },
  { id: 'favour', cd: 240, w: 3, cond: () => favourCandidate(present) !== null,
    run() { doFavour(favourCandidate(present)!); } },
  { id: 'grudge', cd: 300, w: 3, cond: () => grudgeCandidate() !== null,
    run() { doGrudge(grudgeCandidate()!); } },
  { id: 'borrowunits', cd: 600, w: 2, cond: () => G.gridOn && G.meterUnits > 6 && !G.flags.emekaUnits && present('broke'),
    run() {
      openModal('🙏 Can I Borrow Some Units?', 'Emeka at your door: <i>"Please, my meter is empty and I have a job interview call at 5. Can I borrow 3 units? I\'ll pay you back, I swear."</i>', [
        { t: 'Lend 3 units', fn: () => {
          G.meterUnits -= 3; G.flags.emekaUnits = 3; rel('broke', 15); G.stats.helped++; remember('broke', 'lentUnits');
          toast('🤝 "You\'re the best!" Emeka dances off. (Whether he pays you back is another story.)', 'sys'); checkAch();
        } },
        { t: '"Sorry, I\'m running low myself"', fn: () => { rel('broke', -4); remember('broke', 'refused'); toast('🙏 Emeka nods slowly. "No problem… no problem."', 'bad'); } },
      ]);
    } },
  // Verispon: a too-good deal lands in your DMs
  { id: 'dmseller', cd: 1100, w: 2, cond: () => G.day >= 2 && G.cash >= 1500,
    run() {
      const d = todaysDeals()[0];
      if (dealTaken(d)) return;
      dealModal(d, `📲 New message from ${d.seller}`);
    } },
  // NextPawa: the roadside vendor's token trouble reaches your neighbour
  { id: 'vendortoken', cd: 1300, w: 2, cond: () => G.day >= 2 && present('broke'),
    run() {
      openModal('🧾 Emeka and the Fake Token', 'Emeka is shouting: <i>"A roadside vendor sold me a token this morning and it says \'Invalid token\'! His phone is off. My ₦2,000 is gone!"</i><br><br>Aunty Caro: <i>"Who still buys from the roadside? Everyone uses NextPawa now. The token arrives fast and you get a receipt."</i>', [
        { t: '📲 Show Emeka how to buy on NextPawa', sub: 'Trust +2 · Emeka likes you more', fn: () => {
          trust(2); rel('broke', 6); fun(3); toast('📲 Emeka buys 5 units on NextPawa and the token arrives before he puts his phone down. "Why did nobody tell me?"', 'sys');
        } },
        { t: 'Laugh and walk away', fn: () => { fun(2); toast('😅 Emeka is still looking for the vendor.', 'sys'); } },
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
