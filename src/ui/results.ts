import { G, save } from '../core/state';
import { $, esc, fmt } from '../core/util';
import { ACH, BGS } from '../data/content';
import { statusLine } from '../render/shareCard';
import { show } from './screens';
import { toast } from './toast';

export function endSession(): void {
  save();
  const s = G.stats;
  const owing = G.owing.length;
  const status = statusLine();
  $('#resStats').innerHTML =
    `<b>${esc(G.name)}</b> — Day ${G.day} • ${BGS.find((b) => b.id === G.bg)!.n}<br>
    ${s.blackouts} blackouts survived.<br>
    ${s.restores} times light return (Up NEPA!).<br>
    ${s.events} street events faced.<br>
    ${s.complaints} generator noise complaints.<br>
    ₦${fmt(s.spent)} in virtual money spent.<br>
    ${s.helped} neighbours helped.<br>
    ${owing} house(s) still owing for fund.<br>
    Street fund: ₦${fmt(G.fund)} / ₦${fmt(G.fundGoal)}.<br>
    ${s.challengesDone} weekly challenge(s) done • best week ${Math.max(0, ...G.weekHistory.map((w) => w.done))}/3.<br>
    ${G.meetings.length} street meeting(s) • ${s.votesWon} vote(s) won${G.policies.youChair ? ' • <b>Street Chairman</b> 🎖️' : ''}.<br>
    Happiness: <b>${Math.round(G.happiness)}%</b> • Trust: <b>${Math.round(G.trust)}%</b><br>
    Achievements: ${G.ach.length}/${ACH.length}`;
  $('#resStatus').textContent = status;
  G.resText = `MY STREET EXPERIENCE — Light Up Your Street\n${s.blackouts} blackouts survived.\n${s.events} street events faced.\n₦${fmt(s.spent)} in virtual money spent.\n${owing} neighbour(s) still owing.\n${s.votesWon} street vote(s) won${G.policies.youChair ? ' — elected street chairman!' : ''}.\nStreet happiness: ${Math.round(G.happiness)}%.\nStatus: ${status.replace(/[^\x20-\x7E₦]/g, '').trim()}\nPlay free: https://lightupyourstreet.com`;
  show('scr-results');
}

export function copySummary(): void {
  const t = G.resText || '';
  const fallback = () => toast(t.replace(/\n/g, ' | '), 'sys');
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('📋 Summary copied! Go paste am for your people.', 'sys'), fallback);
  else fallback();
}
