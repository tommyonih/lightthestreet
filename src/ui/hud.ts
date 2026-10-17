import { G, SET, hasGame } from '../core/state';
import { $, fmt } from '../core/util';
import { hourNow } from '../game/helpers';
import { jobProgress, jobStalled } from '../game/jobs';
import { isHeadless } from './toast';

const WEATHER_ICON = { sunny: '☀️', hot: '🔥', rain: '🌧️', storm: '⛈️' } as const;

export function updHUD(): void {
  if (!hasGame() || isHeadless() || !$('#pillTime')) return;
  const h = Math.floor(hourNow()), m = G.minute % 60;
  const ic = h < 6 ? '🌙' : h < 8 ? '🌅' : h < 17 ? '☀️' : h < 19 ? '🌇' : '🌙';
  $('#pillTime').innerHTML = `${ic} Day ${G.day} • ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  $('#pillWeather').textContent = `${WEATHER_ICON[G.weather]} ${G.temp}°C`;
  const pg = $('#pillGrid');
  pg.className = 'pill ' + (G.gridOn ? 'on' : 'off');
  pg.innerHTML = G.gridOn ? '⚡ NEPA: ON' : '⚡ NEPA: OFF';
  const pm = $('#pillMeter');
  pm.className = 'pill ' + (G.meterUnits < 4 ? 'warn' : '');
  pm.innerHTML = `🔋 <b>${G.meterUnits.toFixed(1)}</b>u`;
  $('#pillCash').innerHTML = `💰 ₦<b>${fmt(G.cash)}</b>`;
  const pp = $('#pillPhone'); pp.className = 'pill ' + (G.phone < 15 ? 'warn' : '');
  pp.innerHTML = `📱 <b>${Math.round(G.phone)}</b>%`;
  const face = G.happiness >= 65 ? '😊' : G.happiness >= 40 ? '😐' : '😩';
  $('#pillMood').innerHTML = `${face} <b>${Math.round(G.happiness)}</b>%`;
  $('#btnGen').textContent = G.genOn ? '⏹ Gen: ON' : '🔌 Gen: OFF';
  $('#btnHustle').textContent = G.job ? `💼 ${jobStalled() ? 'Waiting…' : Math.round(jobProgress() * 100) + '%'}` : '💼 Hustle';
  updSoundBtns();
}

export function updSoundBtns(): void {
  $('#btnSoundW').innerHTML = '🔊 Sound: <span id="soundStateW">' + (SET.sound ? 'On' : 'Off') + '</span>';
  $('#btnSoundG').textContent = SET.sound ? '🔊' : '🔇';
}
