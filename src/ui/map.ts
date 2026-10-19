/* The Map app and the place card. The map is SVG drawn from PLACES/PATHS, so new places show up by adding data.
   The place card covers the street view while you're out, so the street can't be tapped from across town. */
import { G, T, hasGame } from '../core/state';
import { fmt } from '../core/util';
import { PATHS, PLACES, type PlaceId } from '../data/content';
import { commuting, currentHustle, jobProgress, jobStalled } from '../game/jobs';
import { npcDef } from '../game/helpers';
import {
  PLACE_ACTIONS, actionReady, atHome, cantTravel, doPlaceAction, goToWaypoint, isOpen, okadaFare, openLabel, peopleAt, place,
  setWaypoint, startTrip, tripMins, tripProgress, walkMins, waypointLabel, waypointPlace,
} from '../game/world';
import { isHeadless } from './toast';

const W = 320, H = 220;
const pt = (id: PlaceId): [number, number] => { const p = place(id); return [p.mx * W, p.my * H]; };

/** Where the "you" marker sits: at your place, or part-way along the road while travelling. */
function youAt(): [number, number] {
  if (!G.trip) return pt(G.loc);
  const [ax, ay] = pt(G.trip.from), [bx, by] = pt(G.trip.to), [jx, jy] = pt('junction'), f = tripProgress();
  // routes run through the junction; split the trip into its two legs
  const via = G.trip.from !== 'junction' && G.trip.to !== 'junction';
  if (!via) return [ax + (bx - ax) * f, ay + (by - ay) * f];
  return f < .5 ? [ax + (jx - ax) * f * 2, ay + (jy - ay) * f * 2] : [jx + (bx - jx) * (f - .5) * 2, jy + (by - jy) * (f - .5) * 2];
}

/** The neighbourhood as SVG. `mini` drops names and badges for the corner minimap. */
function svgMap(mini = false): string {
  const known = (id: PlaceId) => G.unlocked.includes(id);
  const wp = waypointPlace(), [yx, yy] = youAt();
  // the guide line: from you to the waypoint, through the junction like the roads do
  let guide = '';
  if (wp && !(wp === G.loc && !G.trip)) {
    const [wx, wy] = pt(wp), [jx, jy] = pt('junction');
    const via = wp !== 'junction' && (G.trip ? G.trip.to : G.loc) !== 'junction';
    guide = `<polyline class="guide" points="${yx},${yy} ${via ? `${jx},${jy} ` : ''}${wx},${wy}"/>`;
  }
  const roads = PATHS.map(([a, b]) => {
    const [x1, y1] = pt(a), [x2, y2] = pt(b);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="road${known(a) && known(b) ? '' : ' fog'}"/>`;
  }).join('');
  const dest = G.trip?.to;
  const nodes = PLACES.map((p) => {
    const [x, y] = pt(p.id), k = known(p.id), people = k && !mini ? peopleAt(p.id).length : 0;
    if (mini && !k) return '';
    return `<g class="node${k ? '' : ' locked'}${p.id === dest ? ' dest' : ''}${p.id === wp ? ' wp' : ''}" data-place="${k ? p.id : ''}" transform="translate(${x},${y})">
      <circle r="17"/><text class="em" y="6">${k ? p.emoji : '?'}</text>
      ${mini ? '' : `<text class="nm" y="31">${k ? p.n : '???'}</text>`}
      ${people ? `<circle class="badge" cx="13" cy="-13" r="7"/><text class="bn" x="13" y="-9.5">${people}</text>` : ''}
      ${p.id === wp ? `<text class="pinmark" y="-21">📌</text>` : ''}
    </g>`;
  }).join('');
  return `<svg class="map${mini ? ' mini' : ''}" viewBox="-10 -12 ${W + 20} ${H + 40}" role="img" aria-label="Map of the neighbourhood">
    ${roads}${guide}${nodes}<g class="you" transform="translate(${yx},${yy - 20})"><circle r="${mini ? 11 : 6}"/></g></svg>`;
}

/** One place row in the Map app: status, who's there, and how to get there. */
function placeRow(id: PlaceId): string {
  const p = place(id), ppl = peopleAt(id).map((n) => npcDef(n).name);
  const status = `<span style="color:${isOpen(id) ? 'var(--green)' : 'var(--dim)'}">${openLabel(id)}</span>`;
  let go: string;
  if (G.loc === id && !G.trip) go = `<div class="okbox" style="margin:6px 0 0">📍 You dey here</div>`;
  else if (G.trip?.to === id) go = `<div class="okbox" style="margin:6px 0 0">🚶 On your way…</div>`;
  else {
    const w = cantTravel(id, 'walk'), o = cantTravel(id, 'okada');
    go = `<div class="row" style="margin-top:6px">
      <button class="btn small" data-walk="${id}" ${w ? 'disabled' : ''}>🚶 Walk · ${tripMins(G.loc, id, 'walk')} min</button>
      <button class="btn small" data-okada="${id}" ${o ? 'disabled' : ''}>🛵 Okada · ₦${fmt(okadaFare(G.loc, id))}</button></div>`;
  }
  const pinned = G.waypoint === id;
  const pin = G.loc === id && !G.trip ? '' : `<button class="pinBtn${pinned ? ' on' : ''}" data-pin="${id}" aria-label="${pinned ? 'Clear waypoint' : 'Set waypoint'}">📌</button>`;
  return `<div class="placeRow" id="pr-${id}"><div class="stat" style="border:0;padding-bottom:2px"><span><b>${p.emoji} ${p.n}</b> ${pin}</span><span style="font-size:12px">${status}</span></div>
    <div style="font-size:12px;color:var(--dim);padding:0 4px">${p.blurb}${ppl.length ? `<br>👥 ${ppl.join(', ')} dey here now` : ''}</div>${go}</div>`;
}

export function mapView(): [string, string] {
  const locked = PLACES.filter((p) => !G.unlocked.includes(p.id)).length;
  const why = G.job ? 'You dey work — finish before you waka.' : G.intro < 99 ? 'Settle into your house first.' : '';
  return ['🗺️ Map', `${svgMap()}
    ${why ? `<div class="warnbox">${why}</div>` : ''}
    ${G.unlocked.map(placeRow).join('')}
    ${locked ? `<p class="note">${locked} more place(s) never show for map. Keep living — you go hear about them.</p>` : ''}
    <p class="note">Gen, fan and TV only work when you dey house. Phone apps (units, shop) work anywhere — shop go charge delivery.</p>`];
}

/** Hooks up the Map app's buttons; called by the phone after rendering. `after` re-renders the phone. */
export function wireMap(root: HTMLElement, after: () => void): void {
  root.querySelectorAll<HTMLElement>('[data-walk]').forEach((e) => { e.onclick = () => { startTrip(e.dataset.walk as PlaceId, 'walk'); after(); }; });
  root.querySelectorAll<HTMLElement>('[data-okada]').forEach((e) => { e.onclick = () => { startTrip(e.dataset.okada as PlaceId, 'okada'); after(); }; });
  root.querySelectorAll<HTMLElement>('[data-pin]').forEach((e) => {
    e.onclick = () => { const id = e.dataset.pin as PlaceId; setWaypoint(G.waypoint === id ? null : id); after(); };
  });
  root.querySelectorAll<SVGGElement>('.node[data-place]').forEach((g) => {
    const id = g.dataset.place; if (!id) return;
    g.addEventListener('click', () => root.querySelector('#pr-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  });
}

/* ---------- the place card over the street view ---------- */

let cardKey = '';
/** The player folded the card to look around this place (3D only); unfolds when they move on. */
let folded = false, foldedAt = '';
let onNpc: (id: string) => void = () => {};
let onMap: () => void = () => {};
/** The card needs the neighbour panel and the phone, which live higher up in ui/. */
export function initPlaceCard(npc: (id: string) => void, map: () => void): void { onNpc = npc; onMap = map; }

export function updPlaceCard(): void {
  const el = document.getElementById('placeCard');
  if (!el || !hasGame() || isHeadless()) return;
  document.getElementById('stage')?.classList.toggle('away', !atHome()); // 2D Classic dims the street behind the card
  if (atHome()) { if (cardKey !== 'home') { el.classList.remove('show'); cardKey = 'home'; } return; }
  const job = currentHustle(), ppl = G.trip ? [] : peopleAt(G.loc);
  // in 3D the place is on screen, so the card can fold to its header; the ride itself is always just a strip
  const v3d = document.body.classList.contains('v3d');
  if (G.loc !== foldedAt) { folded = false; foldedAt = G.loc; }
  const mini = v3d && (!!G.trip || folded);
  el.classList.toggle('mini', mini);
  const key = [G.loc, G.trip?.to, Math.round(tripProgress() * 20), job?.id, Math.round(jobProgress() * 20), jobStalled(), ppl.join(), Math.floor(G.minute / 60), G.cash, G.phone > 94, G.hunger < 15, mini, v3d].join('|');
  if (key === cardKey) return;
  cardKey = key; el.classList.add('show');

  if (G.trip) {
    const t = G.trip, to = place(t.to), left = Math.max(0, Math.ceil(t.until - T()));
    el.innerHTML = `<div class="pcIn travel"><div class="pcEm">${t.mode === 'okada' ? '🛵' : '🚶'}</div>
      <b>On the way to ${to.emoji} ${to.n}</b><span>${commuting() ? 'Going to work · ' : ''}${left} min left</span>
      <div class="tb"><i style="width:${Math.round(tripProgress() * 100)}%"></i></div></div>`;
    return;
  }
  const p = place(G.loc);
  const acts = PLACE_ACTIONS.filter((a) => a.at === G.loc);
  const work = job ? `<div class="pcJob">${jobStalled() ? '⏳ Waiting for light…' : job.verb} · ${Math.round(jobProgress() * 100)}%
    <div class="tb"><i style="width:${Math.round(jobProgress() * 100)}%"></i></div></div>` : '';
  const homeWalk = tripMins(G.loc, 'street', 'walk'), fare = okadaFare(G.loc, 'street');
  const fold = v3d ? `<button class="iconbtn flat pcFold" data-pc="fold" aria-label="${mini ? 'Show actions' : 'Fold card to look around'}">${mini ? '▾' : '▴'}</button>` : '';
  el.innerHTML = mini ? `<div class="pcIn">
    <div class="pcHead"><div class="pcEm">${p.emoji}</div><div><b>${p.n}</b><span>${ppl.length ? `👥 ${ppl.length} neighbour(s) here · ` : ''}tap ▾ for actions</span></div>${fold}</div>
    ${work}</div>` : `<div class="pcIn">
    <div class="pcHead"><div class="pcEm">${p.emoji}</div><div><b>${p.n}</b><span>${openLabel(G.loc)}</span></div>${fold}</div>
    ${work}
    ${job ? '' : `<div class="row"><button class="btn small primary" data-pc="walk">🏠 Walk home · ${homeWalk} min</button>
      <button class="btn small" data-pc="okada" ${G.cash < fare ? 'disabled' : ''}>🛵 Okada · ₦${fmt(fare)}</button></div>`}
    ${ppl.length ? `<div class="pcPpl">${ppl.map((id) => `<button class="chip" data-npc="${id}">👤 ${npcDef(id).name}</button>`).join('')}</div>` : `<div class="pcNone">${p.blurb}</div>`}
    ${job ? '' : `<div class="pcActs">${acts.map((a) => { const why = actionReady(a); return `<button class="btn small" data-act="${a.id}" ${why ? 'disabled' : ''}>${a.t}<div class="evSub">${why ?? a.sub}</div></button>`; }).join('')}</div>`}
  </div>`;
  const redraw = () => { cardKey = ''; updPlaceCard(); };
  el.querySelector<HTMLElement>('[data-pc="fold"]')?.addEventListener('click', () => { folded = !folded; redraw(); });
  el.querySelectorAll<HTMLElement>('[data-npc]').forEach((b) => { b.onclick = () => onNpc(b.dataset.npc!); });
  el.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => { b.onclick = () => { doPlaceAction(b.dataset.act!); redraw(); }; });
  const home = (mode: 'walk' | 'okada') => () => { startTrip('street', mode); redraw(); };
  el.querySelector<HTMLElement>('[data-pc="walk"]')?.addEventListener('click', home('walk'));
  el.querySelector<HTMLElement>('[data-pc="okada"]')?.addEventListener('click', home('okada'));
}

/* ---------- minimap (corner of the street view) and the waypoint bar ---------- */

let miniKey = '', wpKey = '';
export function updGuide(): void {
  if (!hasGame() || isHeadless()) return;
  const mini = document.getElementById('minimap'), bar = document.getElementById('wpBar');
  if (mini) {
    const k = [G.loc, G.trip?.to, Math.round(tripProgress() * 10), G.waypoint, waypointPlace(), G.unlocked.length].join('|');
    if (k !== miniKey) { miniKey = k; mini.innerHTML = svgMap(true); }
  }
  if (!bar) return;
  const p = waypointPlace(), show = !!G.waypoint && !(G.trip && G.trip.to === p);
  const k = [show, G.waypoint, p, G.loc, !!G.trip, !!G.job, G.cash >= (p ? okadaFare(G.loc, p) : 0)].join('|');
  if (k === wpKey) return;
  wpKey = k; bar.classList.toggle('show', show);
  document.getElementById('placeCard')?.classList.toggle('withWp', show);
  if (!show) return;
  const blocked = !p || !!G.trip || !!G.job;
  bar.innerHTML = `<span class="wpTxt">📌 <b>${waypointLabel()}</b>${p ? ` · ${walkMins(G.loc, p)} min` : ''}</span>
    ${p ? `<button class="btn small primary" data-wp="walk" ${blocked ? 'disabled' : ''}>🚶 Go</button>
    <button class="btn small" data-wp="okada" ${blocked || G.cash < okadaFare(G.loc, p) ? 'disabled' : ''}>🛵 ₦${fmt(okadaFare(G.loc, p))}</button>` : ''}
    <button class="iconbtn flat" data-wp="clear" aria-label="Clear waypoint">✕</button>`;
  bar.querySelectorAll<HTMLElement>('[data-wp]').forEach((b) => {
    b.onclick = () => { const a = b.dataset.wp; if (a === 'clear') setWaypoint(null); else goToWaypoint(a as 'walk' | 'okada'); wpKey = ''; updGuide(); };
  });
}
/** The minimap opens the full map. */
export function initGuide(): void { document.getElementById('minimap')?.addEventListener('click', () => onMap()); }

/** HUD chip: where you are. */
export function placeChip(): string {
  if (G.trip) return `🚶 → ${place(G.trip.to).n}`;
  return `📍 ${place(G.loc).n} · Map`;
}
