import { G, SET, hasGame } from '../core/state';
import { $, esc, fmt } from '../core/util';
import { NEWS } from '../data/content';
import { hourNow } from '../game/helpers';
import { jobProgress, jobStalled } from '../game/jobs';
import { atHome } from '../game/world';
import { icon } from './icons';
import { placeChip, updGuide, updPlaceCard } from './map';
import { flyCoins, rollCash, updAmbience } from './juice';
import { feed, isHeadless } from './toast';

const WEATHER_ICON = { sunny: '☀️', hot: '🔥', rain: '🌧️', storm: '⛈️' } as const;
const METER_FULL = 40; // units that read as a full bar

function tile(id: string, ico: string, label: string, value: string, pct: number | null, cls: string): void {
  const el = $('#' + id);
  el.className = 'tile ' + cls;
  const bar = pct == null ? '' : `<div class="tb"><i style="width:${Math.max(3, Math.min(100, pct))}%"></i></div>`;
  el.innerHTML = `<span class="th">${icon(ico, 12)}${label}</span><b class="tv">${value}</b>${bar}`;
}

function setLabel(sel: string, txt: string): void {
  const l = $(sel).querySelector('.al'); if (l && l.textContent !== txt) l.textContent = txt;
}

let lastCash = NaN;
export function updHUD(): void {
  if (!hasGame() || isHeadless() || !$('#pillTime')) return;
  const h = Math.floor(hourNow()), m = G.minute % 60;
  $('#pillTime').textContent = `Day ${G.day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const mood = G.happiness >= 65 ? ['😊', 'Happy', 'good'] : G.happiness >= 40 ? ['😐', 'Fine', 'ok'] : ['😩', 'Low', 'low'];
  const mt = $('#pillMoodTxt'); if (mt) { mt.textContent = `${mood[0]} ${mood[1]}`; mt.className = 'hp mood ' + mood[2]; }
  const debt = $('#pillDebt'); if (debt) { debt.hidden = G.debt <= 0; debt.textContent = `Owes ₦${fmt(G.debt)}`; }
  $('#pillWeather').textContent = `${WEATHER_ICON[G.weather]} ${G.temp}°C`;
  const chip = $('#pillPlace'); chip.textContent = placeChip(); chip.hidden = !atHome(); // away, the place card says where you are
  updPlaceCard(); updGuide();
  $('#hudName').textContent = G.name;
  $('#hudAva').textContent = (G.name.trim()[0] || '?').toUpperCase();

  const cash = $('#pillCash');
  rollCash(cash, Math.round(G.cash));
  if (!Number.isNaN(lastCash) && Math.round(lastCash) !== Math.round(G.cash)) {
    cash.classList.add('bump'); setTimeout(() => cash.classList.remove('bump'), 220);
    flyCoins(G.cash - lastCash); // only gains, and only meaningful ones
  }
  lastCash = G.cash;
  updAmbience();

  tile('pillGrid', 'zap', 'NEPA', G.gridOn ? 'ON' : 'OFF', null, G.gridOn ? 'on' : 'off');
  const mu = G.meterUnits;
  tile('pillMeter', 'gauge', 'Meter', mu.toFixed(1) + 'u', mu / METER_FULL * 100, mu < 2 ? 'warn crit' : mu < 4 ? 'warn' : '');
  tile('pillPhone', 'phone', 'Phone', Math.round(G.phone) + '%', G.phone, G.phone < 8 ? 'warn crit' : G.phone < 15 ? 'warn' : '');
  const face = G.happiness >= 65 ? '😊' : G.happiness >= 40 ? '😐' : '😩';
  tile('pillMood', 'smile', 'Mood', `${face} ${Math.round(G.happiness)}%`, G.happiness, G.happiness < 25 ? 'warn crit' : G.happiness < 40 ? 'warn' : '');

  setLabel('#btnGen', G.genOn ? 'Gen: ON' : 'Gen: OFF');
  $('#btnGen').classList.toggle('live', G.genOn);
  setLabel('#btnHustle', G.job ? (jobStalled() ? 'Waiting…' : Math.round(jobProgress() * 100) + '%') : 'Hustle');
  $('#btnHustle').classList.toggle('live', !!G.job);
  updFeed();
  updSoundBtns();
}

const FEED_FROM = { sys: 'You', npc: 'Neighbour', bad: 'Trouble', '': 'Street' } as const;
let feedKey = '';
/** The street feed under the scene: everything the street told you this session, newest first. */
function updFeed(): void {
  const list = $('#feedList'); if (!list) return;
  const key = `${feed[0]?.n ?? 0}|${G.day}`;
  if (key === feedKey) return;
  feedKey = key;
  $('#feedNews').textContent = '📰 ' + NEWS[G.day % NEWS.length].replace(/<[^>]+>/g, '');
  if (!feed.length) { list.innerHTML = '<div class="fi empty">All quiet on the street. For now.</div>'; return; }
  list.innerHTML = feed.map((f) => {
    const lead = f.txt.match(/^\s*(\p{Extended_Pictographic}\uFE0F?)\s*/u);
    const body = lead ? f.txt.slice(lead[0].length) : f.txt;
    return `<div class="fi ${f.cls}"><div class="fw">${lead?.[1] ?? '💬'}</div><div class="fc"><div class="fm">${FEED_FROM[f.cls]} · ${esc(f.t)}</div>${body}</div></div>`;
  }).join('');
}

export function updSoundBtns(): void {
  const w = $('#btnSoundW'); if (w) w.innerHTML = `Sound: <span id="soundStateW">${SET.sound ? 'On' : 'Off'}</span>`;
  const g = $('#btnSoundG'); if (g) g.innerHTML = icon(SET.sound ? 'sound' : 'mute', 18);
}
