/* The 3D view: your street and every place on the map, one set at a time. Loaded lazily (a separate chunk) and only
   in 3D mode. It reads game state like the 2D renderer does and never changes it, except tap-to-walk, which is purely
   visual: taps on people and things go back to the UI through hooks, so both renderers open the same panels. */
import * as THREE from 'three';
import { G, SET, T, hasGame } from '../core/state';
import { HAIRS, NPCDEF, OUTFITS, type PlaceId } from '../data/content';
import { hourNow, powered, streetLit } from '../game/helpers';
import { currentHustle, jobProgress, jobStalled, payFx } from '../game/jobs';
import { whereabouts } from '../game/schedule';
import { isOpen, place, tripProgress, walkMins, waypointLabel, waypointPlace } from '../game/world';
import { lampLevel } from '../render/lights';
import { mix, rgba } from '../render/paint';
import { timeLook } from '../render/sky';
import { fmt } from '../core/util';
import { GRUDGE, opinion } from '../game/memory';
import { CHEER_S, SHOCK_S, npcLook, playerFace, type Pose } from './mood';
import { Person } from './people';
import { Tag, glowTex, groundDisc } from './kit';
import { buildSet, okada, type PlaceSet } from './sets';
import { buildStreet } from './world3d';
import { EDGE, EDGE_R, GEN_SPOT, HOME_SPOT, SETS, STALL, Z, arriving, clampIn, followX, npcSpot, stepToward, type Hit } from './space';

export interface Hooks {
  /** A tap landed on something with a panel (a neighbour, your meter, your house, your gen). */
  onHit(h: Hit): void;
  /** Frames are too slow on this device: the UI should fall back to 2D. */
  onSlow(): void;
  /** The neighbour whose panel is open, if any: they face you and talk. */
  talkingTo?: () => string | null;
}
export interface View3D { stop(): void }

export type Tier = 'low' | 'high';
/** Rough device class, from what the browser will tell us. */
export function pickTier(): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.deviceMemory ?? 4) <= 3 || (navigator.hardwareConcurrency ?? 4) <= 4 ? 'low' : 'high';
}

const WALK_SPEED = 3.4, NPC_SPEED = 2.6;
/** Which other houses run a generator during outages (same as the 2D street). */
const HOUSE_GEN = [false, false, false, true, false];

export function start(canvas: HTMLCanvasElement, hooks: Hooks, tier: Tier = pickTier()): View3D {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'high', powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier === 'high' ? 2 : 1.25));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const shadows = tier === 'high';
  renderer.shadowMap.enabled = shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#c4e7fa', 24, 75);
  const camera = new THREE.PerspectiveCamera(38, 1.8, .5, 140);

  // sky: a vertical gradient texture, redrawn when the colours drift
  const skyCv = document.createElement('canvas'); skyCv.width = 2; skyCv.height = 64;
  const skyTex = new THREE.CanvasTexture(skyCv); skyTex.colorSpace = THREE.SRGBColorSpace; scene.background = skyTex;
  let skyKey = '';

  const hemi = new THREE.HemisphereLight('#bfe0ff', '#6b4a35', 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d8', 1.5); scene.add(sun, sun.target);
  if (shadows) {
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 14, bottom: -14, near: 1, far: 80 });
    sun.shadow.bias = -.0015;
  }
  const moon = new THREE.DirectionalLight('#7f93d8', 0); moon.position.set(-10, 20, 12); scene.add(moon);

  // the street is one set; the other places are built the first time you head there, and only one is shown
  const streetG = new THREE.Group(); scene.add(streetG);
  const W = buildStreet(streetG, shadows);
  const sets = new Map<PlaceId, PlaceSet>();
  /** The place on screen: where you are, or where you're heading (you ride/walk into it during the trip). */
  let cur: PlaceId = 'street', snap = true;
  const viewPlace = (): PlaceId => (G.trip ? G.trip.to : G.loc);
  function showSet(id: PlaceId): void {
    if (id !== 'street' && !sets.has(id)) { const s = buildSet(id, shadows); sets.set(id, s); scene.add(s.group); }
    streetG.visible = id === 'street';
    for (const [k, s] of sets) s.group.visible = k === id;
    cur = id; snap = true; tapTo = null;
    if (SET.motion) { canvas.style.transition = 'none'; canvas.style.opacity = '0'; requestAnimationFrame(() => { canvas.style.transition = 'opacity .35s'; canvas.style.opacity = '1'; }); }
  }
  const setOf = (id: PlaceId): PlaceSet | undefined => sets.get(id);

  /* ---------- people ---------- */
  const npcs = NPCDEF.map((n) => {
    const p = new Person({ skin: n.skin, hair: n.hair, outfit: n.outfit, gender: 0 }, .95);
    p.root.userData.hit = { kind: 'npc', id: n.id } satisfies Hit;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(.9, 2, .9), new THREE.MeshBasicMaterial({ visible: false })); pad.position.y = 1; p.root.add(pad); // easier to tap
    scene.add(p.root);
    return { def: n, p, lastAt: whereabouts(n.id).at };
  });
  let me: Person | null = null, meKey = '';
  let tapTo: { x: number; z: number } | null = null;
  const pops: { tag: Tag; t0: number }[] = [];
  const bike = okada('#2f6db5'); bike.visible = false; scene.add(bike);

  function ensureMe(): Person {
    const key = `${G.skin}|${G.hair}|${G.outfit}|${G.gender}|${G.name}`;
    if (me && key === meKey) return me;
    if (me) scene.remove(me.root);
    me = new Person({ skin: G.skin, hair: HAIRS[G.hair]?.id ?? 'lowcut', outfit: OUTFITS[G.outfit], gender: G.gender }, 1.02);
    meKey = key; scene.add(me.root); snap = true;
    return me;
  }

  /* ---------- rain puddles: they fill as the ground gets wet, show the sky, and at night a smear of warm light ----------
     (no environment map on phones, so the "reflection" is faked: sky colour plus an additive streak towards the camera) */
  const puddleMat = new THREE.MeshBasicMaterial({ color: '#8aa0c0', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const shineMat = new THREE.MeshBasicMaterial({ map: glowTex(), color: '#ffc46b', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const [x, z, r] of [[-9, 2.8, 1.4], [-2.5, 3.7, 1], [4, 2.4, 1.6], [11, 3.4, 1.1], [-6, 7, 1.8], [7, 6.4, 1.5], [15, 8, 1.2]]) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(r, 20), puddleMat);
    p.rotation.x = -Math.PI / 2; p.scale.y = .55; p.position.set(x, .03, z); scene.add(p);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(r * .7, r * 1.6), shineMat);
    s.rotation.x = -Math.PI / 2; s.position.set(x, .035, z); scene.add(s);
  }

  /* ---------- tap feedback: a ring that pulses where you tapped ---------- */
  const ring = new THREE.Mesh(new THREE.RingGeometry(.42, .58, 32),
    new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .05; scene.add(ring);
  let ringAt = -9;
  const pulse = (x: number, z: number) => { ring.position.x = x; ring.position.z = z; ringAt = performance.now() / 1000; };

  /* ---------- waypoint beacon and the dashed path to it ---------- */
  const beacon = new THREE.Group(); beacon.visible = false; scene.add(beacon);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 7, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 3.5; beacon.add(beam, groundDisc(1.2, '#ffb347'));
  const beaconTag = new Tag(2.8); beaconTag.sprite.position.y = 4.6; beacon.add(beaconTag.sprite);
  const pathGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const path = new THREE.Line(pathGeo, new THREE.LineDashedMaterial({ color: '#ffb347', dashSize: .5, gapSize: .35, transparent: true, opacity: .9 }));
  path.frustumCulled = false; path.visible = false; scene.add(path);

  /* ---------- rain: short slanted streaks, two vertices each ---------- */
  const DROPS = tier === 'high' ? 1400 : 500, STREAK = .55, SLANT = .1;
  const dropPos = new Float32Array(DROPS * 6);
  const setDrop = (i: number, x: number, y: number, z: number) => dropPos.set([x, y, z, x + SLANT, y + STREAK, z], i * 6);
  for (let i = 0; i < DROPS; i++) setDrop(i, Math.random() * 50 - 25, Math.random() * 14, Math.random() * 24 - 8);
  const dropGeo = new THREE.BufferGeometry(); dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const rain = new THREE.LineSegments(dropGeo, new THREE.LineBasicMaterial({ color: '#c8d8f0', transparent: true, opacity: .45, depthWrite: false }));
  rain.frustumCulled = false; scene.add(rain);
  let wet = 0, flash = 0, nextBolt = 0;

  /* ---------- gen smoke ---------- */
  const smoke = Array.from({ length: 18 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#8a8a90', transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false; scene.add(s); return { s, life: 0, vx: 0, vy: 0 };
  });
  let smokeAt = 0;

  /* ---------- camera ---------- */
  let zoom = .2, camX = HOME_SPOT.x;
  /** `kick`: how hard to shake this frame (lightning, NEPA cutting); `push`: a short dolly-in for big moments. */
  function placeCamera(dt: number, focusX: number, kick = 0, push = 0): void {
    const target = followX(focusX);
    camX = SET.motion ? camX + (target - camX) * Math.min(1, dt * 2.5) : target;
    // zoomed out shows roofs, sky and about three houses; zoomed in is a porch-level view
    const z = Math.min(1, zoom + (SET.motion ? push : 0)), dist = 21 - z * 9, height = 6.4 - z * 2.4;
    const sx = SET.motion ? (Math.random() - .5) * kick : 0, sy = SET.motion ? (Math.random() - .5) * kick : 0;
    camera.position.set(camX + sx, height + sy, Z.outside + dist);
    camera.lookAt(camX + sx * .5, 2.9 - z * .9, Z.porch);
  }

  /* ---------- input: tap to pick or walk, pinch / wheel to zoom ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const touches = new Map<number, { x: number; y: number }>();
  let down: { x: number; y: number; id: number } | null = null, pinch0 = 0, zoom0 = zoom;
  const onDown = (e: PointerEvent) => {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 1) down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = zoom; down = null; }
  };
  const onMove = (e: PointerEvent) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2 && pinch0) { const [a, b] = [...touches.values()]; zoom = THREE.MathUtils.clamp(zoom0 + (Math.hypot(a.x - b.x, a.y - b.y) / pinch0 - 1) * 1.2, 0, 1); }
  };
  const onUp = (e: PointerEvent) => {
    touches.delete(e.pointerId); if (touches.size < 2) pinch0 = 0;
    if (!down || down.id !== e.pointerId || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { down = null; return; }
    down = null; tap(e.clientX, e.clientY);
  };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); zoom = THREE.MathUtils.clamp(zoom - e.deltaY * .0015, 0, 1); };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const shownChain = (o: THREE.Object3D | null): boolean => { for (; o; o = o.parent) if (!o.visible && !(o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial && !o.material.visible)) return false; return true; };
  function tap(cx: number, cy: number): void {
    if (!hasGame() || G.trip) return; // on the road: nothing to tap yet
    const r = canvas.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const found = pickAt();
    if (found) {
      const npc = (found.hit as Hit).kind === 'npc';
      pulse(npc ? found.obj.position.x : found.point.x, npc ? found.obj.position.z : Math.max(found.point.z, Z.porch));
      hooks.onHit(found.hit as Hit); return;
    }
    if (G.job) return; // you're at work: no wandering off
    const g = ray.intersectObject(W.walkPlane)[0]; // the walk plane is world-wide, so it serves every set
    if (g) { tapTo = clampIn(cur, g.point.x, g.point.z); pulse(tapTo.x, tapTo.z); }
  }
  /** The tappable thing under the ray (set from the last pointer position), if any. */
  function pickAt(): { hit: unknown; obj: THREE.Object3D; point: THREE.Vector3 } | null {
    const targets = [...(cur === 'street' ? W.pickables : setOf(cur)?.pickables ?? []), ...npcs.filter((n) => n.p.root.visible).map((n) => n.p.root)];
    for (const h of ray.intersectObjects(targets, true)) {
      if (!shownChain(h.object)) continue;
      for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (o.userData.hit) return { hit: o.userData.hit, obj: o, point: h.point };
    }
    return null;
  }
  // desktop: a hand cursor over anything you can tap
  let hoverAt = 0;
  const onHover = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || touches.size || performance.now() - hoverAt < 90) return;
    hoverAt = performance.now();
    const r = canvas.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    canvas.style.cursor = !G.trip && pickAt() ? 'pointer' : 'default';
  };
  canvas.addEventListener('pointermove', onHover);

  /* ---------- size ---------- */
  function resize(): void {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; ro?.observe(canvas); resize();

  /* ---------- the frame ---------- */
  let raf = 0, last = 0, frames = 0, slowSum = 0, reportedSlow = false;
  let lastGrid: boolean | null = null, offAt = -99, onAt = -99;
  const gameOn = () => hasGame() && !!document.querySelector('#scr-game.active') && !document.hidden && canvas.offsetParent !== null;

  function frame(): void {
    raf = requestAnimationFrame(frame);
    if (!gameOn()) { last = 0; return; }
    const t = performance.now() / 1000;
    if (tier === 'low' && last && t - last < 1 / 31) return; // cap cheap phones at 30fps
    const dt = Math.min(.1, last ? t - last : 0); last = t;
    // frame-time probe: skip warm-up, then average a few seconds
    if (++frames > 60 && frames <= 240) { slowSum += dt; if (frames === 240 && slowSum / 180 > .05 && !reportedSlow) { reportedSlow = true; hooks.onSlow(); } }

    const h = hourNow(), L = timeLook(h, G.weather), day = 1 - Math.min(1, L.dark / .6);

    // sky and fog
    const key = rgba(L.top) + rgba(L.bot);
    if (key !== skyKey) {
      skyKey = key; const c = skyCv.getContext('2d')!, g = c.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, rgba(L.top)); g.addColorStop(1, rgba(L.bot)); c.fillStyle = g; c.fillRect(0, 0, 2, 64); skyTex.needsUpdate = true;
    }
    (scene.fog as THREE.Fog).color.set(rgba(mix(L.bot, L.darkColor, L.dark * .6)));

    // storm lightning lights everything for a moment
    if (G.weather === 'storm' && SET.motion && t > nextBolt) { flash = 1; nextBolt = t + 5 + Math.random() * 8; }
    flash = Math.max(0, flash - dt * 4);

    // sun arc from 6AM to 6:30PM, moon at night; the hemisphere carries the overall time-of-day colour
    const a = (h - 6) / 12.5 * Math.PI;
    sun.position.set(camX + Math.cos(a) * -22, Math.max(2, Math.sin(a) * 26), 14); sun.target.position.set(camX, 0, 0);
    sun.intensity = day * (1.9 - L.cloud * 1.1); sun.color.set(rgba(mix(L.grade, [255, 244, 224], .55)));
    hemi.color.set(rgba(mix(L.top, [255, 255, 255], .35))); hemi.intensity = .26 + day * .9 + flash * 2.5;
    moon.intensity = (1 - day) * .6; // enough moonlight to make out people in a blackout, not enough to feel lit

    // houses: grid (or their own gen) for neighbours, your own supply for you
    const night = .2 + L.dark * 1.1;
    W.houses.forEach((hl, i) => {
      const lv = lampLevel(hl.id, hl.player ? powered() : (G.gridOn || HOUSE_GEN[i]), t), on = Math.min(1, lv);
      for (const m of hl.windows) m.emissiveIntensity = lv * (.12 + L.dark * 1.8); // a lit room barely shows at noon
      hl.bulb.color.set(rgba(mix([93, 93, 93], [255, 246, 208], on)));
      hl.glows.forEach((g, k) => { g.material.opacity = lv * night * (k ? .45 : .8); });
      (hl.pool.material as THREE.MeshBasicMaterial).opacity = lv * L.dark * .55;
      if (hl.player) {
        const lamp = !powered() && G.lamp > 0 && L.dark > .2; // rechargeable lamp: cool white, weaker
        W.porch.color.set(lamp ? '#fff0c8' : '#ffcf7a');
        W.porch.intensity = (lamp ? 4 : lv * 9) * (.25 + L.dark);
      }
    });
    W.meterLed.color.set(G.meterUnits < 4 ? (Math.floor(t * 2.5) % 2 ? '#ff4040' : '#601818') : '#40d060');
    const sl = lampLevel('street', streetLit(), t);
    W.street.head.color.set(rgba(mix([76, 76, 76], [255, 243, 200], Math.min(1, sl))));
    W.street.glow.material.opacity = sl * night * .9;
    (W.street.pool.material as THREE.MeshBasicMaterial).opacity = sl * L.dark * .7;
    W.street.light.intensity = sl * 14 * L.dark;
    W.farWindows.opacity = lampLevel('far3d', G.gridOn, t, .3) * Math.min(1, L.dark * 1.6);

    // wet road gets shiny in the rain and dries slowly
    const raining = G.weather === 'rain' || G.weather === 'storm';
    wet = Math.max(0, Math.min(1, wet + dt * (raining ? 1 / 12 : -1 / 40)));
    W.road.roughness = .75 - wet * .45; W.ground.roughness = .9 - wet * .3;
    puddleMat.opacity = wet * .45; puddleMat.color.set(rgba(mix(L.bot, L.top, .3)));
    shineMat.opacity = wet * Math.min(1, L.dark * 1.4) * .85; // the bulbs, mirrored
    const ringAge = t - ringAt; // tap ring: grows and fades in half a second
    (ring.material as THREE.MeshBasicMaterial).opacity = ringAge < .5 ? (1 - ringAge / .5) * .9 : 0;
    ring.scale.setScalar(1 + Math.min(ringAge, .5) * 1.6);
    W.ground.color.set(rgba(mix([255, 255, 255], [170, 150, 140], wet)));
    rain.visible = raining && SET.motion;
    if (rain.visible) {
      const fall = (G.weather === 'storm' ? 22 : 15) * dt;
      for (let i = 0; i < DROPS; i++) {
        let x = dropPos[i * 6] - fall * SLANT / STREAK, y = dropPos[i * 6 + 1] - fall;
        if (y < 0) { y += 14; x = camX + Math.random() * 50 - 25; }
        setDrop(i, x, y, dropPos[i * 6 + 2]);
      }
      dropGeo.attributes.position.needsUpdate = true;
    }

    // your generator
    W.gen.group.visible = G.gen > 0;
    if (G.gen > 0) {
      W.gen.body.color.set(G.gen === 2 ? '#d4a017' : '#c0392b');
      W.gen.group.position.x = GEN_SPOT.x + (G.genOn && SET.motion ? Math.sin(t * 60) * .015 : 0); // running gens shake
      W.gen.led.color.set(G.genOn ? '#5fd068' : '#3a3a3a');
      W.gen.glow.material.opacity = G.genOn ? (.35 + .08 * Math.sin(t * 31)) * night : 0;
      W.gen.light.intensity = G.genOn ? 3 * (.3 + L.dark) : 0;
      if (G.genOn && SET.motion && cur === 'street' && t > smokeAt) {
        smokeAt = t + .18; const s = smoke.find((p) => p.life <= 0);
        if (s) { s.life = 1; s.vx = -.25 - Math.random() * .2; s.vy = .5 + Math.random() * .3; s.s.position.copy(W.gen.exhaust); s.s.visible = true; }
      }
    }
    for (const s of smoke) {
      if (s.life <= 0 || cur !== 'street') { s.s.visible = false; s.life = Math.min(s.life, 0); continue; }
      s.life -= dt * .45; s.s.position.x += s.vx * dt; s.s.position.y += s.vy * dt;
      s.s.scale.setScalar(.3 + (1 - s.life) * 1.1); s.s.material.opacity = Math.max(0, s.life) * .35;
      s.s.material.color.set(rgba(mix([138, 138, 144], [255, 154, 64], L.dark * .45 * s.life))); // fresh smoke catches the gen's glow at night
    }

    // NEPA moments everyone reacts to: a gasp when it goes, a cheer when it comes back
    if (G.gridOn !== lastGrid) { if (lastGrid != null) { if (G.gridOn) onAt = t; else offAt = t; } lastGrid = G.gridOn; }
    const sinceOff = t - offAt, sinceOn = t - onAt;
    const hot = !G.gridOn && G.temp >= 31 && h >= 11 && h < 23;
    const talking = hooks.talkingTo?.() ?? null;
    const moodOf = (rel: number, grudge: boolean, seated: boolean, seed: number, talk = false, heat = hot) =>
      npcLook({ rel, grudge, seated, hot: heat, sinceOff, sinceOn, hour: h, talking: talk, seed, t });

    // the place on screen follows you; signs and bulbs at other places run on the grid or their own gen
    const vp = viewPlace(); if (vp !== cur) showSet(vp);
    const set = setOf(cur);
    if (set) {
      const lv = lampLevel('set-' + cur, place(cur).power === 'gen' || G.gridOn, t), on = Math.min(1, lv);
      for (const m of set.signs) m.emissiveIntensity = lv * (.08 + L.dark * 1.1);
      for (const b of set.bulbs) b.color.set(rgba(mix([93, 93, 93], [255, 246, 208], on)));
      for (const g of set.glows) g.material.opacity = lv * night * .7;
      for (const g of set.lanterns) g.material.opacity = Math.max(0, L.dark - .15) * (.8 + (SET.motion ? Math.sin(t * 9 + g.position.x) * .08 : 0)); // flames flicker
      set.light.intensity = lv * 9 * L.dark;
      const open = isOpen(cur);
      set.crowd.forEach((c, i) => { // shoppers and passers-by: some stand, some stroll
        c.p.shown = open; if (!open) { c.p.place(); return; }
        const x = c.home.x + (c.roam && SET.motion ? Math.sin(t * .35 + i * 2) * c.roam : 0), moving = c.roam > 0 && SET.motion;
        const look = moodOf(55, false, false, i, false, false); // strangers: no grudges, and their place has its own shade
        c.p.face(c.roam ? Math.cos(t * .35 + i * 2) : 0, c.roam ? 0 : 1); c.p.pos.x = x; c.p.animate(dt, moving, SET.motion, moving ? 'idle' : look.pose, look.face); c.p.place();
      });
    }

    // neighbours: on the street they keep their porch/door/edge routine; at other places they turn up at a slot
    const visitors = cur === 'street' ? [] : npcs.filter((n) => { const w = whereabouts(n.def.id); return w.at === 'out' && w.place === cur; });
    for (const n of npcs) {
      const w = whereabouts(n.def.id), p = n.p;
      let to: { x: number; z: number; show: boolean };
      if (cur === 'street') {
        to = npcSpot(n.def.x, !!n.def.dy, w.at);
        if (to.show && !p.shown && !snap) { const from = npcSpot(n.def.x, !!n.def.dy, n.lastAt === 'out' ? 'out' : 'in'); p.pos = { x: from.x, z: from.z }; p.shown = true; }
      } else {
        const L3 = SETS[cur as Exclude<PlaceId, 'street'>], k = visitors.indexOf(n);
        to = k >= 0 ? { ...L3.slots[k % L3.slots.length], show: true } : { ...L3.entry, show: false };
        if (to.show && !p.shown && !snap) { p.pos = { ...L3.entry }; p.shown = true; } // walking in from the junction road
      }
      if (snap) { p.pos = { x: to.x, z: to.z }; p.shown = to.show; } // just arrived at this place: everyone's already where they are
      n.lastAt = w.at;
      const ox = p.pos.x, oz = p.pos.z, arrived = stepToward(p.pos, to, NPC_SPEED * dt);
      if (arrived && !to.show) p.shown = false;
      const st = G.npcs.find((x) => x.id === n.def.id)!, rel = Math.round(st.rel), talk = talking === n.def.id;
      const look = moodOf(rel, opinion(n.def.id) <= GRUDGE, cur === 'street' && w.at === 'outside', npcs.indexOf(n), talk);
      if (talk && me) p.lookAt(me.pos.x, me.pos.z); else p.face(p.pos.x - ox, p.pos.z - oz);
      p.animate(dt, !arrived, SET.motion, arrived ? look.pose : 'idle', look.face); p.place();
      p.tag.set(n.def.name, rel >= 65 ? '#7ee787' : rel >= 40 ? '#ffd97a' : '#ff9d9d', '♥' + rel);
    }

    // you: on the road you walk (or ride) into the place you're going; there, you go to your work spot or where you tap
    const m = ensureMe(), job = currentHustle(), riding = G.trip?.mode === 'okada';
    const rest = cur === 'street' ? HOME_SPOT : SETS[cur as Exclude<PlaceId, 'street'>].arrive;
    const workAt = job && !G.trip ? (cur === 'street' ? STALL[job.id] : SETS[cur as Exclude<PlaceId, 'street'>].jobs[job.id]) : undefined;
    let to: { x: number; z: number }, leave = false;
    if (G.trip) to = arriving(cur, tripProgress());
    else if (job?.id === 'deliver') { to = { x: EDGE_R, z: Z.drain - .4 }; leave = true; } // off on the bike, out of sight
    else to = workAt ?? tapTo ?? rest;
    if (job) tapTo = null;
    if (snap) { m.pos = G.trip ? { ...to } : { ...(workAt ?? rest) }; m.shown = true; }
    if (!leave && !m.shown) { m.pos = { ...rest }; m.shown = true; }
    const ox = m.pos.x, oz = m.pos.z;
    const arrived = stepToward(m.pos, to, (G.trip ? 99 : WALK_SPEED) * dt * (job?.id === 'deliver' ? 2 : 1)); // trips follow the clock exactly
    if (arrived && leave) m.shown = false;
    const moving = !!G.trip ? tripProgress() < 1 : !arrived;
    const working = !!workAt && arrived && !jobStalled();
    const myPose: Pose = working ? (job!.id === 'content' ? 'cheer' : 'work') : moving || riding ? 'idle' : sinceOff < SHOCK_S ? 'shock' : sinceOn < CHEER_S ? 'cheer' : 'idle';
    const myFace = playerFace(G.happiness, G.hunger, sinceOff, sinceOn, h);
    const partner = talking ? npcs.find((n) => n.def.id === talking && n.p.shown) : undefined;
    if (partner && !moving) m.lookAt(partner.p.pos.x, partner.p.pos.z); else m.face(m.pos.x - ox, m.pos.z - oz);
    m.animate(dt, moving && !riding, SET.motion, myPose, myFace); m.place();
    bike.visible = riding && m.shown;
    if (bike.visible) { bike.position.set(m.pos.x, 0, m.pos.z); bike.rotation.y = Math.atan2(-(m.pos.z - oz), m.pos.x - ox || 1e-6); m.root.position.y = .45; }
    if (working || (job && workAt && jobStalled())) m.tag.set(jobStalled() ? '⏳ Waiting for light…' : job!.verb, '#f5eeda', '', jobProgress());
    else if (G.trip) m.tag.set(`${riding ? '🛵' : '🚶'} ${place(G.trip.to).n}`, '#ffd97a', `${Math.max(0, Math.ceil(G.trip.until - T()))} min`);
    else m.tag.set('⬤ ' + G.name, '#ffffff');

    // waypoint: a beacon on the person you're finding, or at the road out when it's somewhere else; a dashed path to it
    const wp = waypointPlace();
    let bx: number | null = null, bz = 0;
    if (wp && !G.trip) {
      if (wp === cur) { const npc = G.waypoint?.startsWith('npc:') ? npcs.find((n) => 'npc:' + n.def.id === G.waypoint) : null; if (npc?.p.shown) { bx = npc.p.pos.x; bz = npc.p.pos.z; } }
      else { const exit = cur === 'street' ? { x: EDGE + 4, z: Z.outside + .6 } : { x: SETS[cur as Exclude<PlaceId, 'street'>].entry.x + 5, z: 3 }; bx = exit.x; bz = exit.z; }
    }
    beacon.visible = path.visible = bx != null && m.shown;
    if (bx != null) {
      beacon.position.set(bx, 0, bz);
      (beam.material as THREE.MeshBasicMaterial).opacity = .25 + (SET.motion ? Math.sin(t * 3) * .1 : 0);
      beaconTag.set('📌 ' + waypointLabel(), '#ffb347', wp === cur ? 'Dey here' : `${walkMins(G.loc, wp!)} min · this way`);
      const pos = pathGeo.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, m.pos.x, .06, m.pos.z); pos.setXYZ(1, bx, .06, bz); pos.needsUpdate = true; path.computeLineDistances();
    }

    // ₦ floating up when you get paid
    while (payFx.length) {
      const f = payFx.shift()!, tag = new Tag(2);
      tag.set(`+₦${fmt(f.amount)}`, f.full ? '#7ee787' : '#ffd97a');
      tag.sprite.position.set(m.shown ? m.pos.x : HOME_SPOT.x, 2.6, (m.shown ? m.pos.z : HOME_SPOT.z) + .2);
      scene.add(tag.sprite); pops.push({ tag, t0: t });
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const q = pops[i], age = t - q.t0;
      if (age > 1.8) { scene.remove(q.tag.sprite); pops.splice(i, 1); continue; }
      q.tag.sprite.position.y = 2.6 + age * .8; q.tag.sprite.material.opacity = 1 - age / 1.8;
    }

    const focus = m.shown ? m.pos.x : rest.x;
    if (snap) camX = followX(focus); // a new place: cut, don't pan in from the last one
    // lightning jolts the camera; NEPA cutting gives a thump and a short push in on the dark
    const kick = flash * .35 + Math.max(0, .5 - sinceOff) * .5, push = sinceOff < 2.5 ? (1 - sinceOff / 2.5) * .25 : 0;
    placeCamera(dt, focus, kick, push);
    snap = false;
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    stop() {
      cancelAnimationFrame(raf); ro?.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('pointermove', onHover);
      renderer.dispose();
    },
  };
}
