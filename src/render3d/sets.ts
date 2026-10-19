/* The other places as 3D sets, built from code in the street's world frame (x along the road, houses/buildings
   at the back, road at the front). Each set is a Group shown only while you're there or heading there.
   Signs and bulbs glow at night if the place has power: the area grid, or its own gen. */
import * as THREE from 'three';
import { seededRng } from '../core/util';
import { OUTFITS, type PlaceId } from '../data/content';
import { glow, grainTex, pickable, signboard } from './kit';
import { Person } from './people';
import { SETS, Z, type Hit, type P } from './space';

export interface PlaceSet {
  id: PlaceId;
  group: THREE.Group;
  pickables: THREE.Object3D[];
  /** Night-glowing bits, driven by the place's light level. */
  signs: THREE.MeshStandardMaterial[]; glows: THREE.Sprite[]; bulbs: THREE.MeshBasicMaterial[];
  /** Lanterns: lit at night regardless of power. */
  lanterns: THREE.Sprite[];
  light: THREE.PointLight;
  /** Background people; shown while the place is open. */
  crowd: { p: Person; home: P; roam: number }[];
}

const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, ...extra });
const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cyl = (r: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 10) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m); o.position.set(x, y, z); return o; };

/* ---------- vehicles (also used for your okada ride) ---------- */

export function okada(color = '#c0392b'): THREE.Group {
  const g = new THREE.Group(), tyre = std('#141414'), frame = std(color, { metalness: .3, roughness: .5 });
  for (const x of [-.62, .62]) { const w = new THREE.Mesh(new THREE.TorusGeometry(.3, .08, 6, 14), tyre); w.position.set(x, .33, 0); g.add(w); }
  g.add(box(1.1, .22, .22, frame, 0, .62, 0), box(.5, .12, .3, std('#222'), -.15, .8, 0)); // tank + seat
  g.add(box(.08, .5, .08, frame, .55, .78, 0), box(.08, .06, .6, std('#333'), .55, 1.04, 0)); // fork + handlebars
  g.add(box(.12, .12, .14, std('#fff6d0'), .66, .82, 0));
  return g;
}
function keke(): THREE.Group {
  const g = new THREE.Group(), body = std('#f2c230', { roughness: .5 }), dark = std('#1d1d1d');
  g.add(box(2, 1.1, 1.3, body, 0, .95, 0), box(2.1, .08, 1.4, dark, 0, 1.55, 0), box(.6, .7, 1.2, std('#9fc3d6', { roughness: .2 }), .75, 1.05, 0));
  for (const [x, z] of [[-.7, -.6], [-.7, .6], [.95, 0]]) { const w = new THREE.Mesh(new THREE.TorusGeometry(.26, .08, 6, 12), dark); w.position.set(x, .28, z); g.add(w); }
  return g;
}
function danfo(): THREE.Group {
  const g = new THREE.Group(), body = std('#f2c230', { roughness: .5 }), dark = std('#1d1d1d');
  g.add(box(4.2, 1.7, 1.8, body, 0, 1.2, 0));
  for (const y of [.75, 1.55]) g.add(box(4.22, .1, 1.82, dark, 0, y, 0)); // the black stripes
  g.add(box(3.4, .5, 1.84, std('#2a3a48', { roughness: .2 }), -.2, 1.55, 0));
  for (const [x, z] of [[-1.4, -.9], [-1.4, .9], [1.4, -.9], [1.4, .9]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, .25, 12), dark); w.rotation.x = Math.PI / 2; w.position.set(x, .35, z); g.add(w); }
  return g;
}

/* ---------- shared pieces ---------- */

function base(g: THREE.Group, shadows: boolean, ground = '#94634a'): void {
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(90, 40), std('#ffffff', { map: grainTex(ground, [14, 6], .3, .1) }));
  yard.rotation.x = -Math.PI / 2; yard.position.set(0, 0, -6); yard.receiveShadow = shadows; g.add(yard);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(90, Z.roadFar - Z.roadNear), std('#ffffff', { map: grainTex('#3c3d44', [16, 2], .35, .1), roughness: .75 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, .01, (Z.roadNear + Z.roadFar) / 2); g.add(road);
  const line = std('#dec468', { roughness: .6 });
  for (let x = -44; x < 44; x += 2.8) g.add(box(1.3, .01, .14, line, x, .02, (Z.roadNear + Z.roadFar) / 2));
  g.add(box(90, .14, .55, std('#8c877d'), 0, .05, Z.drain));
}
/** A plain building block: walls, a parapet, a door and a couple of windows. */
function block(g: THREE.Group, x: number, w: number, h: number, wall: string, z = -3.5, d = 5): THREE.Mesh {
  const b = box(w, h, d, std(wall, { map: grainTex(wall, [2, 2], .22, .1) }), x, h / 2, z);
  g.add(b, box(w + .2, .3, d + .2, std('#7b756a'), x, h + .15, z));
  const glass = std('#22303f', { roughness: .25 });
  for (let k = 0; k < Math.floor(w / 2.4); k++) for (let fl = 0; fl < Math.floor(h / 2.6); fl++)
    g.add(box(1, 1, .05, glass, x - w / 2 + 1.4 + k * 2.4, 1.9 + fl * 2.6, z + d / 2 + .03));
  return b;
}
/** A market umbrella: pole and a coloured top. */
function umbrella(g: THREE.Group, x: number, z: number, a: string, b: string): void {
  g.add(cyl(.05, 2.4, std('#444'), x, 1.2, z, 6));
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, .6, 8), std(a, { side: THREE.DoubleSide }));
  top.position.set(x, 2.5, z); g.add(top);
  const rim = new THREE.Mesh(new THREE.ConeGeometry(1.52, .2, 8, 1, true), std(b, { side: THREE.DoubleSide })); rim.position.set(x, 2.25, z); g.add(rim);
}
function far(g: THREE.Group, seed: string): void {
  const rng = seededRng(seed), m = std('#1e2333', { roughness: 1 });
  // low and far back, so they read as the rest of town behind the place, not walls around it
  for (let x = -60; x < 60;) { const w = 3 + rng() * 4, h = 2 + rng() * 4; g.add(box(w, h, 2, m, x + w / 2, h / 2, -34 - rng() * 8)); x += w + rng(); }
}
function bench(g: THREE.Group, x: number, z: number, len = 2.2): void {
  const wood = std('#6b4a30');
  g.add(box(len, .1, .45, wood, x, .5, z), box(.1, .5, .4, wood, x - len / 2 + .2, .25, z), box(.1, .5, .4, wood, x + len / 2 - .2, .25, z));
}
function tree(g: THREE.Group, x: number, z: number, s = 1): void {
  g.add(box(.35 * s, 3 * s, .35 * s, std('#4a3324'), x, 1.5 * s, z));
  for (const [dx, dy, r] of [[-.6, 3.3, 1.2], [.5, 3.7, 1.3], [0, 4.3, 1.1]]) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), std('#2f5a2a')); c.position.set(x + dx * s, dy * s, z); g.add(c); }
}

/* ---------- the sets ---------- */

type Build = (g: THREE.Group, s: PlaceSet) => void;
const hit = <T extends THREE.Object3D>(s: PlaceSet, o: T, h: Hit): T => { pickable(o, h); s.pickables.push(o); return o; };
function addSign(s: PlaceSet, text: string, w: number, h: number, bg: string, fg: string, x: number, y: number, z: number, sub = ''): THREE.Mesh {
  const m = signboard(text, w, h, bg, fg, sub); m.position.set(x, y, z); s.group.add(m); s.signs.push(m.material); return m;
}
function addBulb(s: PlaceSet, x: number, y: number, z: number, color = '#ffd27a', size = 2.4): void {
  const b = new THREE.MeshBasicMaterial({ color: '#5d5d5d' }), m = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 6), b);
  m.position.set(x, y, z); s.group.add(m); s.bulbs.push(b);
  const gl = glow(color, size); gl.position.set(x, y, z + .1); s.group.add(gl); s.glows.push(gl);
}

/** A kerosene lantern on a stall: lit every night, NEPA or no NEPA. */
function addLantern(s: PlaceSet, x: number, y: number, z: number): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(.08, .1, .22, 8), new THREE.MeshBasicMaterial({ color: '#ffb35c' }));
  m.position.set(x, y, z); s.group.add(m);
  const gl = glow('#ff9a40', 2); gl.position.set(x, y + .05, z + .05); s.group.add(gl); s.lanterns.push(gl);
}

const BUILD: Record<Exclude<PlaceId, 'street'>, Build> = {
  junction(g, s) {
    // the crossing road, a motor park with okadas, a keke, a danfo and the POS umbrella
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(5, 18), std('#ffffff', { map: grainTex('#3c3d44', [2, 6], .35, .1) }));
    cross.rotation.x = -Math.PI / 2; cross.position.set(0, .012, -4); g.add(cross);
    block(g, -12, 9, 5.4, '#c9b48a'); block(g, 12, 10, 7.8, '#b9a27a');
    addSign(s, 'JUNCTION MOTOR PARK', 7, 1.1, '#1f6a3a', '#ffffff', -12, 5.9, -.9, 'Okada · Keke · Danfo');
    addSign(s, 'GEN REPAIRS & SPARE PARTS', 7.6, 1.1, '#c0392b', '#ffe9b0', 12, 4.4, -.9);
    const rider = hit(s, new THREE.Group(), { kind: 'act', id: 'okadaGist' });
    [['#c0392b', -9.6], ['#2f6db5', -8.1], ['#3c8a4a', -6.6]].forEach(([c, x]) => { const o = okada(c as string); o.position.set(x as number, 0, 1.4); o.rotation.y = Math.PI / 2; rider.add(o); });
    g.add(rider);
    addLantern(s, -8.1, 1.2, 1.9); addLantern(s, 3.4, .95, 1.2);
    const k = keke(); k.position.set(9, 0, 3.4); g.add(k);
    const d = danfo(); d.position.set(14, 0, 7); g.add(d);
    umbrella(g, 4.6, .6, '#e63946', '#ffb347');
    g.add(hit(s, box(1.8, .9, .7, std('#2b6cb0'), 4.6, .45, 1), { kind: 'app', tab: 'hustle' }));
    addSign(s, 'POS', 1.2, .5, '#2b6cb0', '#ffffff', 4.6, .62, 1.36);
    addBulb(s, -12, 4.9, -.8); addBulb(s, 12, 3.6, -.8); addBulb(s, 4.6, 2.2, .6, '#fff2c0', 3);
  },
  market(g, s) {
    far(g, 'mkt-far');
    // rows of stalls under umbrellas and tarps, a buka, a tailor, the electronics shop
    block(g, -15, 7, 4.2, '#d9b380'); block(g, 15, 8, 4.6, '#caa06a');
    addSign(s, 'MAMA PUT BUKA', 5.5, 1, '#8f3b2a', '#ffe9b0', -15, 3.6, -.9, 'Amala · Ewedu · Small chops');
    addSign(s, 'E-SHOP', 4.5, 1, '#1d3557', '#a8dadc', 15, 4, -.9, 'Fans · Lamps · Inverters · Solar');
    g.add(hit(s, box(3.2, .9, 1, std('#7a4a2b'), -15, .45, .3), { kind: 'act', id: 'buka' }));
    for (const x of [-16, -14.4]) g.add(cyl(.35, .5, std('#555'), x, 1.15, .3)); // soup pots
    g.add(hit(s, box(3.6, 1, 1.2, std('#3a4a5e'), 15, .5, .3), { kind: 'app', tab: 'shop' }));
    const colors = ['#e63946', '#ffb347', '#2f6db5', '#3c8a4a', '#8a3c7a', '#f2c230'];
    const produce = [std('#d84b2a'), std('#f2a33a'), std('#4f8a3a'), std('#e9d8a6')];
    for (let i = 0; i < 6; i++) {
      const x = -9 + i * 3.3; umbrella(g, x, -.6, colors[i], colors[(i + 2) % 6]);
      if (i % 2 === 0) addLantern(s, x + .9, .95, -.1);
      g.add(box(2.2, .8, 1, std('#6b4a30'), x, .4, -.4));
      for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(new THREE.SphereGeometry(.17, 6, 5), produce[(i + k) % 4]); p.position.set(x - .8 + k * .4, .95, -.4 + (k % 2) * .2); g.add(p); }
    }
    // the tailor's table and machine (where you sew)
    const t = SETS.market.jobs.tailor;
    g.add(box(1.6, .1, .8, std('#8b5a2b'), t.x + .9, .8, t.z - .5), box(.5, .3, .25, std('#e8e8e8'), t.x + 1.2, 1, t.z - .5));
    addBulb(s, -15, 3, -.8); addBulb(s, 15, 3.4, -.8); addBulb(s, -2.4, 2.2, -.6, '#fff2c0', 3); addBulb(s, 7.5, 2.2, -.6, '#fff2c0', 3);
  },
  fuel(g, s) {
    far(g, 'fuel-far');
    // canopy on pillars, pumps, a price board and the jerrycan queue
    const steel = std('#d8d8d8', { metalness: .3, roughness: .4 });
    g.add(box(14, .5, 6, std('#c0392b'), 1, 4.6, -.5), box(14.2, .12, 6.2, std('#f5f5f5'), 1, 4.32, -.5));
    for (const x of [-5, 7]) for (const z of [-2.8, 1.8]) g.add(box(.35, 4.4, .35, steel, x, 2.2, z));
    for (const x of [-1.5, 3.5]) {
      const pump = hit(s, box(.9, 1.7, .6, std('#f5f5f5'), x, .85, -.5), { kind: 'app', tab: 'shop' }); g.add(pump);
      g.add(box(.7, .4, .05, std('#132a19', { emissive: '#5fd068', emissiveIntensity: .5 }), x, 1.35, -.18));
      g.add(box(.08, .9, .08, std('#222'), x + .55, .9, -.5));
    }
    addSign(s, 'FUEL', 6, 1.2, '#c0392b', '#ffffff', 1, 4.6, 2.52, 'PMS · Price na fictional');
    block(g, 13, 5, 3.4, '#e9e4d8', -3.5, 4);
    addSign(s, 'MART', 3, .7, '#2f6db5', '#ffffff', 13, 2.8, -1.45);
    for (let i = 0; i < 6; i++) g.add(box(.35, .5, .25, std('#f2c230'), -9 + i * .55, .25, 1.2)); // jerrycans queueing
    addBulb(s, -1.5, 4.2, 1, '#f5f8ff', 3.4); addBulb(s, 3.5, 4.2, 1, '#f5f8ff', 3.4);
  },
  campus(g, s) {
    far(g, 'campus-far');
    // faculty building with columns, the cyber café, trees and benches
    block(g, -6, 16, 6.4, '#e9e4d8', -4.2, 5);
    for (let i = 0; i < 6; i++) g.add(cyl(.28, 5.6, std('#f5f5f5'), -12.5 + i * 2.6, 2.8, -1.2));
    g.add(box(17, .5, 2.4, std('#cfcabd'), -6, 5.85, -1.4));
    addSign(s, 'FACULTY OF SCIENCE', 8, 1, '#1d3557', '#ffffff', -6, 5.85, -.18);
    block(g, 9, 6, 3.6, '#2f6db5', -3, 4);
    addSign(s, 'CYBER CAFÉ', 4.6, .9, '#111827', '#5fd068', 9, 3, -.95, 'Gen dey · Browse · Print · Charge');
    g.add(hit(s, box(2.4, 2.2, .2, std('#22303f', { roughness: .2 }), 9, 1.1, -.95), { kind: 'act', id: 'cafeCharge' }));
    const r = SETS.campus.jobs.remote;
    g.add(box(1.4, .08, .7, std('#8b5a2b'), r.x + .8, .78, r.z - .4), box(.6, .4, .04, std('#1b2433', { emissive: '#5aa9ff', emissiveIntensity: .6 }), r.x + .8, 1.05, r.z - .55));
    tree(g, 15, -1); tree(g, -16, -.4, .9); bench(g, -12, 1.4); bench(g, 13, 1.2);
    addBulb(s, -6, 4.8, -.4); addBulb(s, 9, 2.4, -.8, '#e8f4ff', 2.8);
  },
  disco(g, s) {
    far(g, 'disco-far');
    // a glassy office, a queue behind a rope, and a long-suffering bench
    block(g, 2, 14, 7.6, '#d5d8dc', -4, 5);
    g.add(hit(s, box(3, 2.6, .1, std('#22303f', { roughness: .15, metalness: .4 }), 7, 1.3, -1.45), { kind: 'act', id: 'complain' }));
    addSign(s, 'DisCo CUSTOMER CARE', 8, 1.1, '#f2c230', '#1d1d1d', 2, 6.2, -1.42, 'Fictional · "We go escalate am"');
    for (let x = .5; x <= 6.5; x += 1.5) g.add(cyl(.05, 1, std('#c0a020'), x, .5, .1, 6));
    g.add(box(6, .05, .05, std('#8a1a1a'), 3.5, .95, .1));
    bench(g, -6, 1.2, 3); tree(g, -14, -.6);
    addBulb(s, 7, 2.9, -1.2, '#f5f8ff', 2.6); addBulb(s, -3, 4.5, -1.3, '#f5f8ff', 2.6);
  },
  church(g, s) {
    far(g, 'church-far');
    // a white chapel with a gable, a bell tower, plastic chairs under a canopy
    const white = std('#f1ece2', { map: grainTex('#f1ece2', [2, 2], .15, .05) });
    g.add(box(12, 5, 7, white, -1, 2.5, -4));
    const shape = new THREE.Shape([new THREE.Vector2(-6.4, 0), new THREE.Vector2(6.4, 0), new THREE.Vector2(0, 2.6)]);
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 7.4, bevelEnabled: false }), std('#7a2f22'));
    roof.position.set(-1, 5, -7.7); g.add(roof);
    g.add(box(2.4, 9, 2.4, white, 7, 4.5, -3.6), box(.18, 1.4, .18, std('#d4a017'), 7, 9.7, -3.6), box(.9, .18, .18, std('#d4a017'), 7, 9.9, -3.6));
    const door = hit(s, box(2, 3, .1, std('#6b4426'), -1, 1.5, -.45), { kind: 'act', id: 'service' }); g.add(door);
    addSign(s, 'GRACE CHAPEL', 5, .9, '#1d3557', '#f2c230', -1, 4.1, -.44, 'Sunday service 7AM–12PM');
    g.add(box(9, .1, 4, std('#ffffff'), -1, 2.6, 1.6)); for (const x of [-5.3, 3.3]) for (const z of [-.2, 3.4]) g.add(cyl(.05, 2.6, std('#999'), x, 1.3, z, 6));
    const chair = std('#e8e8e8');
    for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) g.add(box(.45, .45, .45, chair, -4.4 + c * 1.1, .23, .8 + r * 1.2));
    tree(g, -14, -1); tree(g, 14, -1.4, 1.1);
    addBulb(s, -1, 3.6, -.3); addBulb(s, 7, 6, -2.3);
  },
};

const LOOKS = ['lowcut', 'afro', 'braids', 'locs', 'natural', 'straight'];

export function buildSet(id: Exclude<PlaceId, 'street'>, shadows: boolean): PlaceSet {
  const group = new THREE.Group();
  const light = new THREE.PointLight('#ffd9a0', 0, 18, 1.4); light.position.set(0, 5, 2); group.add(light);
  const s: PlaceSet = { id, group, pickables: [], signs: [], glows: [], bulbs: [], lanterns: [], light, crowd: [] };
  base(group, shadows); BUILD[id](group, s);
  if (shadows) group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // background people, the same look every visit
  const rng = seededRng('crowd-' + id);
  for (const home of SETS[id].crowd) {
    const p = new Person({ skin: Math.floor(rng() * 6), hair: LOOKS[Math.floor(rng() * 6)], outfit: OUTFITS[Math.floor(rng() * OUTFITS.length)], gender: rng() < .5 ? 0 : 1 }, .92 + rng() * .1);
    p.tag.sprite.visible = false; p.pos = { ...home }; p.place(); group.add(p.root);
    s.crowd.push({ p, home, roam: rng() < .4 ? 1 + rng() * 2 : 0 });
  }
  return s;
}
