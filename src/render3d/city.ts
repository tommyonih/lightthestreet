/* The city map: Lagos from above, with every place in the game, our products' headquarters and billboards carrying
   their ads. It sits behind the welcome screen (drifting slowly) and opens full screen from the Map tab, where you
   drag to pan, pinch or scroll to zoom, and tap pins and billboards. Part of the lazy 3D chunk; reads nothing from
   the game except through hooks, so it also runs before anyone has a game. */
import * as THREE from 'three';
import { seededRng } from '../core/util';
import { PARTNERS, PATHS, PLACES, type PartnerId, type PlaceId } from '../data/content';
import { AD_SLOTS, drawAd } from '../render/ads';

export interface CityHooks {
  onPlace(id: PlaceId): void;
  onProduct(id: PartnerId, variant: number): void;
  /** What the game knows: which places are on the map (null = all, before a game) and where you are. */
  state(): { unlocked: PlaceId[] | null; here: PlaceId | null };
}
export interface CityView {
  stop(): void;
  /** `ambient`: drifts by itself behind the welcome screen. `map`: still, centred on you, yours to drag. */
  mode(m: 'ambient' | 'map'): void;
  /** Glide the camera to a place. */
  focus(id: PlaceId): void;
  /** Redraw pins after the game state changed (a place unlocked, you moved). */
  refresh(): void;
}

type Pick = { kind: 'place'; id: PlaceId } | { kind: 'product'; id: PartnerId; v: number };

/** Where each place sits on the city map, from its position on the 2D map (fractions of width and height). */
export const cityPos = (id: PlaceId): { x: number; z: number } => {
  const p = PLACES.find((q) => q.id === id)!;
  return { x: (p.mx - .5) * 100, z: (p.my - .5) * 72 };
};
const LAGOON = { z0: 7, z1: 12.5 };
const AVENUES_Z = [-15, 26], AVENUES_X = [-52, 52];
const HQ: { id: PartnerId; x: number; z: number; h: number }[] = [
  { id: 'nextpawa', x: 9, z: -8.5, h: 15 }, { id: 'verispon', x: -9, z: -8.5, h: 11 },
  { id: 'tapmonie', x: 46, z: -30, h: 9 }, { id: 'pressmonie', x: -48, z: 19, h: 8 },
];
const BILLBOARDS: [number, number][] = [[-30, -2.6], [17, -2.6], [31, 3.4], [-12, 4.6], [-40, -17.6], [3, -17.6], [40, -12.4], [-9, 16.5], [12, 17.4], [40, 23.4], [-30, 28.6], [24, -33]];
const EMOJI = Object.fromEntries(PLACES.map((p) => [p.id, p.emoji])) as Record<PlaceId, string>;
const HQ_EMOJI: Record<PartnerId, string> = { nextpawa: '⚡', verispon: '🛡️', tapmonie: '📲', pressmonie: '💸' };

const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, ...extra });
function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, g: THREE.Object3D, shadow = true): THREE.Mesh {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z);
  o.castShadow = shadow; o.receiveShadow = true; g.add(o); return o;
}
function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/** A round white pin with an emoji, like a map marker. Grey with "?" for places you haven't found yet. */
function pinTex(emoji: string, ring: string, locked = false): THREE.CanvasTexture {
  return canvasTex(128, 128, (x) => {
    x.fillStyle = 'rgba(20,30,60,.22)'; x.beginPath(); x.arc(64, 70, 50, 0, 7); x.fill();
    x.fillStyle = locked ? '#dfe3ea' : '#ffffff'; x.beginPath(); x.arc(64, 62, 48, 0, 7); x.fill();
    x.lineWidth = 7; x.strokeStyle = ring; x.stroke();
    x.font = '56px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#6b7385'; x.fillText(locked ? '?' : emoji, 64, 66);
  });
}
function labelTex(text: string): { tex: THREE.CanvasTexture; aspect: number } {
  const c = document.createElement('canvas'), x = c.getContext('2d')!;
  x.font = '700 30px "Plus Jakarta Sans", system-ui, sans-serif';
  const w = Math.ceil(x.measureText(text).width) + 36; c.width = w; c.height = 50;
  x.font = '700 30px "Plus Jakarta Sans", system-ui, sans-serif';
  x.fillStyle = 'rgba(255,255,255,.94)'; x.beginPath(); x.roundRect(2, 2, w - 4, 46, 23); x.fill();
  x.fillStyle = '#1b2238'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, 27);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: w / 50 };
}
function sprite(tex: THREE.Texture, w: number, h: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(w, h, 1); s.renderOrder = 10; return s;
}

export function startCity(canvas: HTMLCanvasElement, hooks: CityHooks, tier: 'low' | 'high'): CityView {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'high', powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier === 'high' ? 2 : 1.25));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  const shadows = tier === 'high';
  renderer.shadowMap.enabled = shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cfe6f7');
  scene.fog = new THREE.Fog('#cfe6f7', 120, 230);
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
  scene.add(new THREE.HemisphereLight('#ffffff', '#9fb98a', 1.25));
  const sun = new THREE.DirectionalLight('#fff4e0', 1.6); sun.position.set(-40, 80, 30); scene.add(sun, sun.target);
  if (shadows) {
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 60, bottom: -60, near: 10, far: 200 });
    sun.shadow.bias = -.0008;
  }

  const world = new THREE.Group(); scene.add(world);
  const pickables: THREE.Object3D[] = [];
  const rng = seededRng('lagos-city');
  const tag = (o: THREE.Object3D, p: Pick) => { o.userData.pick = p; pickables.push(o); };

  /* ---------- ground, water, roads ---------- */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 180), std('#b7d79f')); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(240, LAGOON.z1 - LAGOON.z0), std('#4f9fdc', { roughness: .25, metalness: .1 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, .03, (LAGOON.z0 + LAGOON.z1) / 2); world.add(water);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(240, 60), std('#4f9fdc', { roughness: .25, metalness: .1 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, .02, 75); world.add(sea);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(240, 4), std('#efe0b4')); sand.rotation.x = -Math.PI / 2; sand.position.set(0, .025, 44); world.add(sand);
  const lagoonLabel = new THREE.Mesh(new THREE.PlaneGeometry(26, 2.4), new THREE.MeshBasicMaterial({
    transparent: true, map: canvasTex(1024, 96, (x) => { x.font = '800 64px Outfit, system-ui'; x.fillStyle = 'rgba(255,255,255,.75)'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('L A G O S    L A G O O N', 512, 50); }),
  }));
  lagoonLabel.rotation.x = -Math.PI / 2; lagoonLabel.position.set(30, .05, 9.8); world.add(lagoonLabel);

  const roadMat = std('#8d9098'), lineMat = new THREE.MeshBasicMaterial({ color: '#f2f2ea' }), railMat = std('#e6e6e6');
  /** A straight road from a to b (axis-aligned), with a dashed centre line, and railings where it crosses water. */
  function road(ax: number, az: number, bx: number, bz: number, w = 2.4): void {
    const horiz = az === bz, len = horiz ? Math.abs(bx - ax) : Math.abs(bz - az);
    if (len < .1) return;
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const r = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len + w : w, .12, horiz ? w : len + w), roadMat);
    r.position.set(cx, .06, cz); r.receiveShadow = true; world.add(r);
    for (let s = -len / 2 + 1; s < len / 2 - 1; s += 2.4) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(horiz ? 1.1 : .14, horiz ? .14 : 1.1), lineMat);
      d.rotation.x = -Math.PI / 2; d.position.set(horiz ? cx + s : cx, .13, horiz ? cz : cz + s); world.add(d);
    }
    if (!horiz && Math.min(az, bz) < LAGOON.z1 && Math.max(az, bz) > LAGOON.z0) { // a bridge
      for (const side of [-1, 1]) box(.2, .5, LAGOON.z1 - LAGOON.z0 + 1, railMat, cx + side * (w / 2 + .1), .35, (LAGOON.z0 + LAGOON.z1) / 2, world);
    }
  }
  const J = cityPos('junction');
  for (const [a, b] of PATHS) { // every route goes through the junction: along the main street, then up or down
    const far = cityPos(a === 'junction' ? b : a);
    road(J.x, J.z, far.x, J.z); road(far.x, J.z, far.x, far.z);
  }
  for (const z of AVENUES_Z) road(-70, z, 70, z, 2);
  for (const x of AVENUES_X) road(x, -50, x, 40, 2);
  const roundabout = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, .16, 28), roadMat); roundabout.position.set(J.x, .08, J.z); world.add(roundabout);
  const island = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, .4, 24), std('#6fae5a')); island.position.set(J.x, .2, J.z); world.add(island);

  /* ---------- buildings: one small set piece per place ---------- */
  const pad = (x: number, z: number, w: number, d: number, color = '#e9e6dc') => box(w, .2, d, std(color), x, .14, z, world, false);
  const roof = (w: number, d: number, color: string, x: number, y: number, z: number) => {
    const r = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * .75, 1.2, 4), std(color));
    r.rotation.y = Math.PI / 4; r.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); r.position.set(x, y, z); r.castShadow = true; world.add(r);
  };
  const glass = std('#7fb3e0', { roughness: .2, metalness: .4 });
  const tops: Record<PlaceId, number> = { street: 4, junction: 3, market: 3, fuel: 3.4, campus: 6, disco: 10, church: 8 };
  const BUILD: Record<PlaceId, (x: number, z: number) => void> = {
    street(x, z) {
      pad(x, z, 15, 8, '#dcd6c4');
      ['#f2c9a0', '#cfe0f2', '#f6e3a1', '#d8c6ec', '#c7e5c4'].forEach((c, i) => {
        const hx = x - 6 + i * 3; box(2.4, 1.8, 2.4, std(c), hx, 1.1, z - 1.6, world); roof(2.4, 2.4, ['#c0533a', '#3d6fb5', '#2f8a4c'][i % 3], hx, 2.6, z - 1.6);
      });
      box(.8, 1, .8, std('#c0392b'), x + 6.6, .7, z + 1.4, world); // your gen
    },
    junction(x, z) {
      for (const [dx, dz, c] of [[-5, -3.4, '#f2a21b'], [5, -3.4, '#2d7be5'], [-5, 3.4, '#e5484d'], [5, 3.4, '#1fa463']] as const) {
        box(1.8, 1.4, 1.4, std(c), x + dx, .85, z + dz, world); box(2.4, .12, 1.9, std('#ffffff'), x + dx, 1.62, z + dz, world);
      }
    },
    market(x, z) {
      pad(x, z, 12, 9, '#e6dccb');
      const cols = ['#e5484d', '#f2a21b', '#2d7be5', '#1fa463', '#ac4fde', '#ff8fb1', '#17b6c4', '#f6d24b'];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        const sx = x - 4.2 + i * 2.8, sz = z - 2.6 + j * 2.6;
        box(2.3, .9, 2.1, std('#f2ede2'), sx, .6, sz, world); box(2.6, .14, 2.4, std(cols[(i * 3 + j) % cols.length]), sx, 1.15, sz, world);
      }
    },
    fuel(x, z) {
      pad(x, z, 12, 9);
      box(8, .3, 5, std('#ffffff'), x, 3.2, z, world); box(8.1, .5, 5.1, std('#e5484d'), x, 3.55, z, world, false);
      for (const dx of [-2.4, 2.4]) { box(.3, 3, .3, std('#d9d9d9'), x + dx, 1.6, z, world); box(.7, 1.2, .5, std('#2d7be5'), x + dx, .8, z + 1.2, world); }
      box(3, 2, 2.5, std('#f4f1ea'), x + 4.5, 1.2, z - 3, world);
    },
    campus(x, z) {
      pad(x, z, 16, 12, '#e3e0d6');
      box(9, 4, 3.6, std('#e8d7b5'), x - 2.5, 2.1, z - 3.2, world); box(9.2, .3, 3.8, std('#b5523a'), x - 2.5, 4.25, z - 3.2, world);
      const field = new THREE.Mesh(new THREE.PlaneGeometry(6, 4.4), std('#5aa652')); field.rotation.x = -Math.PI / 2; field.position.set(x + 4, .26, z + 2); world.add(field);
      const lines = new THREE.Mesh(new THREE.PlaneGeometry(.1, 4.4), lineMat); lines.rotation.x = -Math.PI / 2; lines.position.set(x + 4, .27, z + 2); world.add(lines);
      box(3, 2.2, 2.4, std('#cfe0f2'), x - 4.6, 1.2, z + 2.6, world);
    },
    disco(x, z) {
      pad(x, z, 10, 9);
      box(5, 9, 5, glass, x, 4.6, z - 1, world); box(5.2, .4, 5.2, std('#dfe6ef'), x, 9.2, z - 1, world);
      box(3.4, 2, 2, std('#f2a21b'), x + 3.8, 1.1, z + 2.6, world); // transformer yard
    },
    church(x, z) {
      pad(x, z, 11, 10, '#e6e1d4');
      box(5, 3.4, 7, std('#f4efe4'), x, 1.8, z, world); roof(5, 7, '#9b3b2e', x, 4.1, z);
      box(2, 6.4, 2, std('#f4efe4'), x, 3.3, z + 4.2, world); box(.2, 1.6, .2, std('#d4a017'), x, 7.3, z + 4.2, world); box(.9, .2, .2, std('#d4a017'), x, 7.5, z + 4.2, world);
    },
  };

  /* ---------- pins: places and product HQs ---------- */
  const placePins = new Map<PlaceId, { pin: THREE.Sprite; label: THREE.Sprite; key: string }>();
  for (const p of PLACES) {
    const at = cityPos(p.id); BUILD[p.id](at.x, at.z);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 10), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(at.x, 3, at.z); world.add(hit); tag(hit, { kind: 'place', id: p.id });
    const pin = sprite(pinTex(p.emoji, '#ffffff'), 3.6, 3.6); pin.position.set(at.x, tops[p.id] + 3.4, at.z); world.add(pin); tag(pin, { kind: 'place', id: p.id });
    const l = labelTex(p.n), label = sprite(l.tex, l.aspect * 1.1, 1.1); label.position.set(at.x, tops[p.id] + 1.2, at.z); world.add(label);
    placePins.set(p.id, { pin, label, key: '' });
  }
  for (const h of HQ) {
    const p = PARTNERS[h.id], col = new THREE.Color(p.color);
    pad(h.x, h.z, 8, 8, '#e6e3db');
    const tower = box(4.4, h.h, 4.4, std('#' + col.clone().lerp(new THREE.Color('#ffffff'), .55).getHexString(), { roughness: .35, metalness: .25 }), h.x, h.h / 2 + .2, h.z, world);
    tag(tower, { kind: 'product', id: h.id, v: 0 });
    for (let y = 1.6; y < h.h - 1; y += 1.6) box(4.5, .35, 4.5, std(p.color, { emissive: p.color, emissiveIntensity: .25 }), h.x, y, h.z, world, false); // floors in brand colour
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.4), new THREE.MeshBasicMaterial({
      map: canvasTex(384, 128, (x) => { x.fillStyle = p.color; x.fillRect(0, 0, 384, 128); x.fillStyle = '#fff'; x.font = '800 60px Outfit, system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(p.name, 192, 68); }),
    }));
    sign.position.set(h.x, h.h - .6, h.z + 2.24); world.add(sign);
    const pin = sprite(pinTex(HQ_EMOJI[h.id], p.color), 3.4, 3.4); pin.position.set(h.x, h.h + 3, h.z); world.add(pin); tag(pin, { kind: 'product', id: h.id, v: 0 });
  }

  /* ---------- billboards with our ads ---------- */
  const legMat = std('#3a3e45', { metalness: .4, roughness: .5 });
  BILLBOARDS.forEach(([x, z], i) => {
    const [id, v] = AD_SLOTS[i % AD_SLOTS.length];
    const g = new THREE.Group(); g.position.set(x, 0, z); world.add(g);
    for (const dx of [-2, 2]) box(.25, 3.2, .25, legMat, dx, 1.6, 0, g);
    box(7.2, 3.8, .3, legMat, 0, 4.9, -.18, g);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), new THREE.MeshBasicMaterial({ map: (() => { const t = new THREE.CanvasTexture(drawAd(id, v, 512, 256)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; })() }));
    face.position.set(0, 4.9, 0); g.add(face); tag(face, { kind: 'product', id, v });
    g.rotation.x = 0; g.rotation.y = (rng() - .5) * .25;
  });

  /* ---------- the estate: rows of identical houses, instanced ---------- */
  const EST = { x0: 30, z0: 29, cols: 10, rows: 4, gap: 3 };
  const n = EST.cols * EST.rows;
  const baseI = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 1.2, 1.8), std('#f3efe6'), n);
  const roofG = new THREE.ConeGeometry(1.5, .9, 4); roofG.rotateY(Math.PI / 4);
  const roofI = new THREE.InstancedMesh(roofG, std('#ffffff'), n);
  const m4 = new THREE.Matrix4(), roofCols = ['#2f9e5a', '#3aa864', '#279053'];
  for (let i = 0; i < n; i++) {
    const x = EST.x0 + (i % EST.cols) * EST.gap, z = EST.z0 + Math.floor(i / EST.cols) * EST.gap;
    m4.makeTranslation(x, .7, z); baseI.setMatrixAt(i, m4); m4.makeTranslation(x, 1.75, z); roofI.setMatrixAt(i, m4);
    roofI.setColorAt(i, new THREE.Color(roofCols[i % 3]));
  }
  baseI.castShadow = roofI.castShadow = shadows; world.add(baseI, roofI);
  const estLabel = labelTex('The Estate'), estSprite = sprite(estLabel.tex, estLabel.aspect * 1.1, 1.1);
  estSprite.position.set(EST.x0 + (EST.cols - 1) * EST.gap / 2, 4, EST.z0 - 2); world.add(estSprite);

  /* ---------- filler blocks and trees: the rest of the city ---------- */
  const near = (x: number, z: number, r: number) =>
    PLACES.some((p) => { const c = cityPos(p.id); return Math.abs(c.x - x) < 9 + r && Math.abs(c.z - z) < 7 + r; })
    || HQ.some((h) => Math.abs(h.x - x) < 5 + r && Math.abs(h.z - z) < 5 + r)
    || BILLBOARDS.some(([bx, bz]) => Math.abs(bx - x) < 4.5 + r && Math.abs(bz - z) < 2.5 + r)
    || (z > LAGOON.z0 - 1.5 - r && z < LAGOON.z1 + 1.5 + r) || z > 41 - r
    || (x > EST.x0 - 3 && x < EST.x0 + EST.cols * EST.gap && z > EST.z0 - 3 && z < EST.z0 + EST.rows * EST.gap)
    || AVENUES_Z.some((az) => Math.abs(az - z) < 2.2 + r) || AVENUES_X.some((ax) => Math.abs(ax - x) < 2.2 + r)
    || Math.abs(z - J.z) < 2.2 + r
    || PATHS.some(([a, b]) => { const f = cityPos(a === 'junction' ? b : a); return Math.abs(x - f.x) < 2.2 + r && z > Math.min(J.z, f.z) - 1 && z < Math.max(J.z, f.z) + 1; });
  const blockCols = ['#f2ede2', '#e8eef6', '#f6ecd9', '#ece4f4', '#e3efe2'];
  const blocks = tier === 'high' ? 70 : 40;
  for (let k = 0, tries = 0; k < blocks && tries < 1200; tries++) {
    const x = -66 + rng() * 132, z = -46 + rng() * 86, w = 2.4 + rng() * 2.4, d = 2.4 + rng() * 2.4, h = 1.2 + rng() * (rng() < .15 ? 9 : 3.5);
    if (near(x, z, Math.max(w, d) / 2)) continue;
    const b = box(w, h, d, std(blockCols[k % blockCols.length]), x, h / 2 + .05, z, world);
    if (h > 6) b.material = glass;
    k++;
  }
  const trees = tier === 'high' ? 220 : 120;
  const trunkI = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .16, 1, 5), std('#7a5a3a'), trees);
  const leafI = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.8, 0), std('#3f9b48', { flatShading: true }), trees);
  let t = 0;
  for (let tries = 0; t < trees && tries < 4000; tries++) {
    const x = -70 + rng() * 140, z = -50 + rng() * 92;
    if (near(x, z, .3) && !(z > 41 && z < 43)) continue;
    const s = .8 + rng() * .6;
    m4.makeScale(s, s, s).setPosition(x, .5 * s, z); trunkI.setMatrixAt(t, m4);
    m4.makeScale(s, s * 1.1, s).setPosition(x, 1.4 * s, z); leafI.setMatrixAt(t, m4);
    leafI.setColorAt(t, new THREE.Color(['#3f9b48', '#4caf50', '#2f8a3f'][t % 3])); t++;
  }
  trunkI.count = leafI.count = t; leafI.castShadow = shadows; world.add(trunkI, leafI);

  /* ---------- traffic: cars on the avenues, boats on the lagoon ---------- */
  const carCols = ['#e5484d', '#f2a21b', '#ffffff', '#2d7be5', '#f6d24b', '#1b2238'];
  const cars = Array.from({ length: tier === 'high' ? 14 : 8 }, (_, i) => {
    const g = new THREE.Group(); box(1.4, .5, .8, std(carCols[i % carCols.length], { roughness: .4 }), 0, .45, 0, g); box(.8, .4, .7, std('#cfe6f7', { roughness: .1 }), -.05, .85, 0, g, false);
    world.add(g);
    const lane = i % 4, speed = 4 + rng() * 3, off = rng() * 140;
    return { g, lane, speed, off };
  });
  const boats = Array.from({ length: 3 }, (_, i) => {
    const g = new THREE.Group(); box(2.2, .4, .9, std('#ffffff'), 0, .25, 0, g); box(.9, .5, .7, std('#2d7be5'), -.3, .65, 0, g, false);
    world.add(g); return { g, speed: 1.2 + i * .5, off: i * 50, z: LAGOON.z0 + 1.4 + i * 1.3 };
  });

  /* ---------- "you are here" ---------- */
  const youRing = new THREE.Mesh(new THREE.RingGeometry(5.5, 6.4, 40), new THREE.MeshBasicMaterial({ color: '#ac4fde', transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false }));
  youRing.rotation.x = -Math.PI / 2; youRing.position.y = .3; youRing.visible = false; world.add(youRing);
  const youTag = labelTex('You are here'), youSprite = sprite(youTag.tex, youTag.aspect * 1.1, 1.1); youSprite.visible = false; world.add(youSprite);

  function refresh(): void {
    const s = hooks.state();
    for (const p of PLACES) {
      const e = placePins.get(p.id)!, locked = !!s.unlocked && !s.unlocked.includes(p.id), here = s.here === p.id;
      const key = `${locked}|${here}`;
      if (key === e.key) continue;
      e.key = key;
      e.pin.material.map?.dispose(); e.pin.material.map = pinTex(EMOJI[p.id], here ? '#ac4fde' : '#ffffff', locked); e.pin.material.needsUpdate = true;
      e.label.visible = !locked;
    }
    if (s.here) { const at = cityPos(s.here); youRing.position.x = at.x; youRing.position.z = at.z; youSprite.position.set(at.x, tops[s.here] + 6.2, at.z); }
    youRing.visible = youSprite.visible = !!s.here;
  }
  refresh();

  /* ---------- camera and input ---------- */
  let mode: 'ambient' | 'map' = 'ambient';
  const cam = { x: 0, z: 0, dist: 80 }, goal = { x: 0, z: 0, dist: 80 };
  const BOUNDS = { x: 58, z0: -44, z1: 38 };
  const fitDist = () => (camera.aspect < .8 ? 120 : camera.aspect < 1.3 ? 95 : 78);
  function placeCamera(): void {
    camera.position.set(cam.x, cam.dist * .8, cam.z + cam.dist * .6);
    camera.lookAt(cam.x, 0, cam.z);
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const touches = new Map<number, { x: number; y: number }>();
  let down: { x: number; y: number; moved: boolean } | null = null, pinch0 = 0, dist0 = 0, lastTouch = 0;
  const onDown = (e: PointerEvent) => {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture?.(e.pointerId);
    if (touches.size === 1) down = { x: e.clientX, y: e.clientY, moved: false };
    if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = goal.dist; down = null; }
    lastTouch = performance.now();
  };
  const onMove = (e: PointerEvent) => {
    const prev = touches.get(e.pointerId); if (!prev) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); lastTouch = performance.now();
    if (touches.size === 2 && pinch0) { const [a, b] = [...touches.values()]; goal.dist = THREE.MathUtils.clamp(dist0 * pinch0 / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), 30, 150); return; }
    if (!down) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) down.moved = true;
    if (!down.moved) return;
    const k = cam.dist / Math.max(200, canvas.clientHeight) * 1.25;
    goal.x = THREE.MathUtils.clamp(goal.x - (e.clientX - prev.x) * k, -BOUNDS.x, BOUNDS.x);
    goal.z = THREE.MathUtils.clamp(goal.z - (e.clientY - prev.y) * k * 1.3, BOUNDS.z0, BOUNDS.z1);
    cam.x = goal.x; cam.z = goal.z;
  };
  const onUp = (e: PointerEvent) => {
    touches.delete(e.pointerId); if (touches.size < 2) pinch0 = 0;
    if (down && !down.moved && touches.size === 0) tap(e.clientX, e.clientY);
    if (touches.size === 0) down = null;
  };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); goal.dist = THREE.MathUtils.clamp(goal.dist * (1 + e.deltaY * .0012), 30, 150); lastTouch = performance.now(); };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  function pickAt(cx: number, cy: number): Pick | null {
    const r = canvas.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    for (const h of ray.intersectObjects(pickables, false)) if (h.object.visible !== false) return h.object.userData.pick as Pick;
    return null;
  }
  function tap(cx: number, cy: number): void {
    const p = pickAt(cx, cy); if (!p) return;
    if (p.kind === 'place') { const s = hooks.state(); if (s.unlocked && !s.unlocked.includes(p.id)) return; hooks.onPlace(p.id); }
    else hooks.onProduct(p.id, p.v);
  }
  let hoverAt = 0;
  const onHover = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || touches.size || performance.now() - hoverAt < 80) return;
    hoverAt = performance.now(); canvas.style.cursor = pickAt(e.clientX, e.clientY) ? 'pointer' : 'grab';
  };
  canvas.addEventListener('pointermove', onHover);

  function resize(): void {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; ro?.observe(canvas); resize();
  goal.dist = cam.dist = fitDist();

  /* ---------- the frame ---------- */
  let raf = 0, last = 0;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function frame(): void {
    raf = requestAnimationFrame(frame);
    if (document.hidden || canvas.offsetParent === null) { last = 0; return; }
    const now = performance.now() / 1000;
    if (tier === 'low' && last && now - last < 1 / 31) return;
    const dt = Math.min(.1, last ? now - last : 0); last = now;
    // ambient: a slow drift across the city, paused for a few seconds after you touch it
    if (mode === 'ambient' && !reduced && performance.now() - lastTouch > 6000) {
      goal.x = Math.sin(now * .035) * 34; goal.z = -6 + Math.sin(now * .023) * 14; goal.dist = fitDist();
    }
    const k = Math.min(1, dt * (mode === 'ambient' ? .8 : 4));
    cam.x += (goal.x - cam.x) * k; cam.z += (goal.z - cam.z) * k; cam.dist += (goal.dist - cam.dist) * Math.min(1, dt * 6);
    placeCamera();
    if (!reduced) {
      cars.forEach((c) => {
        const s = ((now * c.speed + c.off) % 140) - 70, back = c.lane % 2 === 1;
        if (c.lane < 2) { c.g.position.set(back ? -s : s, 0, AVENUES_Z[c.lane] + (back ? .6 : -.6)); c.g.rotation.y = back ? Math.PI : 0; }
        else { const x = AVENUES_X[c.lane - 2]; c.g.position.set(x + (back ? .6 : -.6), 0, THREE.MathUtils.clamp(back ? -s * .6 : s * .6, -48, 39)); c.g.rotation.y = back ? Math.PI / 2 : -Math.PI / 2; }
      });
      boats.forEach((b) => { b.g.position.set(((now * b.speed + b.off) % 150) - 75, 0, b.z); });
      (youRing.material as THREE.MeshBasicMaterial).opacity = .55 + Math.sin(now * 3) * .3;
    }
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
    mode(m) { mode = m; if (m === 'map') goal.dist = Math.min(goal.dist, 70); else lastTouch = 0; },
    focus(id) { const at = cityPos(id); goal.x = at.x; goal.z = at.z + 4; },
    refresh,
  };
}
