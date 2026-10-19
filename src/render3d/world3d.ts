/* The street as 3D geometry, built from code with the 2D street's layout and colours.
   Returns handles to everything that changes at runtime (lights, glows, the meter LED, the gen). */
import * as THREE from 'three';
import { seededRng } from '../core/util';
import { GEN_SPOT, HOUSE_BOXES, HOUSE_H, toX, Z } from './space';
import { glow, grainTex, groundDisc, pickable, windowTex, zincTex } from './kit';

export interface HouseLights { id: string; player: boolean; windows: THREE.MeshStandardMaterial[]; bulb: THREE.MeshBasicMaterial; glows: THREE.Sprite[]; pool: THREE.Mesh }
export interface Built {
  houses: HouseLights[];
  meterLed: THREE.MeshBasicMaterial;
  street: { head: THREE.MeshBasicMaterial; glow: THREE.Sprite; pool: THREE.Mesh; light: THREE.PointLight };
  porch: THREE.PointLight;
  gen: { group: THREE.Group; body: THREE.MeshStandardMaterial; led: THREE.MeshBasicMaterial; glow: THREE.Sprite; light: THREE.PointLight; exhaust: THREE.Vector3 };
  farWindows: THREE.PointsMaterial;
  ground: THREE.MeshStandardMaterial; road: THREE.MeshStandardMaterial;
  walkPlane: THREE.Mesh;
  pickables: THREE.Object3D[];
}

const CURTAINS = ['#b5462f', '#2f6db5', '#c9a227', '#3c8a4a', '#8a3c7a'];
const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, ...extra });
const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };

/** Builds the street into `scene` (a Group, so it can be hidden while you're at another place). */
export function buildStreet(scene: THREE.Object3D, shadows: boolean): Built {
  const pickables: THREE.Object3D[] = [];
  const cast = (o: THREE.Object3D) => { if (shadows) o.traverse((c) => { c.castShadow = true; c.receiveShadow = true; }); return o; };

  // ground: laterite yard, concrete drain, asphalt road with a faded centre line
  const ground = std('#ffffff', { map: grainTex('#94634a', [14, 6], .3, .1) });
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(90, 40), ground);
  yard.rotation.x = -Math.PI / 2; yard.position.set(0, 0, -6); yard.receiveShadow = shadows; scene.add(yard);
  const road = std('#ffffff', { map: grainTex('#3c3d44', [16, 2], .35, .1), roughness: .75 });
  const roadM = new THREE.Mesh(new THREE.PlaneGeometry(90, Z.roadFar - Z.roadNear), road);
  roadM.rotation.x = -Math.PI / 2; roadM.position.set(0, .01, (Z.roadNear + Z.roadFar) / 2); roadM.receiveShadow = shadows; scene.add(roadM);
  const line = std('#dec468', { roughness: .6 });
  for (let x = -44; x < 44; x += 2.8) { const d = box(1.3, .01, .14, line, x, .02, (Z.roadNear + Z.roadFar) / 2); scene.add(d); }
  scene.add(box(90, .14, .55, std('#8c877d', { map: grainTex('#8c877d', [40, 1]) }), 0, .05, Z.drain));
  scene.add(box(90, .02, .5, std('#211d1a'), 0, .01, Z.drain + .45));

  // houses: plastered box, zinc roof, two barred windows, a door and a bulb over it
  const houses: HouseLights[] = [];
  let meterLed!: THREE.MeshBasicMaterial;
  const doorMat = std('#6b4426'), frameMat = std('#3b2618'), stepMat = std('#9a9488'), plinth = std('#7b756a');
  HOUSE_BOXES.forEach((h, i) => {
    const g = new THREE.Group(); g.position.x = h.cx; scene.add(g);
    const depth = Z.houseFront - Z.houseBack, zc = (Z.houseFront + Z.houseBack) / 2;
    const wall = std(h.wall, { map: grainTex(h.wall, [2, 2], .22, .1) });
    const body = box(h.width, HOUSE_H, depth, wall, 0, HOUSE_H / 2, zc); g.add(cast(body));
    g.add(box(h.width + .15, .55, depth + .15, plinth, 0, .27, zc));
    // roof: a gable whose ridge runs along the street
    const shape = new THREE.Shape([new THREE.Vector2(-depth / 2 - .6, 0), new THREE.Vector2(depth / 2 + .6, 0), new THREE.Vector2(0, 1.7)]);
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: h.width + 1, bevelEnabled: false });
    roofGeo.rotateY(Math.PI / 2); roofGeo.translate(-(h.width + 1) / 2, HOUSE_H, zc);
    const roof = new THREE.Mesh(roofGeo, std('#ffffff', { map: zincTex(h.roof), metalness: .3, roughness: .6 })); g.add(cast(roof));
    // windows: glass texture, plus an emissive "lit" texture driven by the light level
    const wt = windowTex(CURTAINS[i]), windows: THREE.MeshStandardMaterial[] = [];
    for (const wx of [-h.width / 2 + 1.1, h.width / 2 - 1.1]) {
      const m = new THREE.MeshStandardMaterial({ map: wt.glass, emissive: '#ffb860', emissiveMap: wt.lit, emissiveIntensity: 0, roughness: .3 });
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.35), m); win.position.set(wx, 2.55, Z.houseFront + .02); g.add(win); windows.push(m);
      g.add(box(1.6, .12, .25, stepMat, wx, 1.82, Z.houseFront + .08)); // sill
    }
    g.add(box(1.6, 2.5, .08, frameMat, 0, 1.25 + .3, Z.houseFront + .03), box(1.35, 2.3, .1, doorMat, 0, 1.15 + .3, Z.houseFront + .05));
    g.add(box(2.2, .25, .9, stepMat, 0, .12, Z.houseFront + .4));
    const bulb = new THREE.MeshBasicMaterial({ color: '#5d5d5d' });
    const bulbM = new THREE.Mesh(new THREE.SphereGeometry(.11, 8, 6), bulb); bulbM.position.set(0, 3.15, Z.houseFront + .2); g.add(bulbM);
    const glows = [glow('#ffd27a', 2.6), glow('#ffc46b', 2.2), glow('#ffc46b', 2.2)];
    glows[0].position.set(0, 3.15, Z.houseFront + .3);
    glows[1].position.set(-h.width / 2 + 1.1, 2.55, Z.houseFront + .2); glows[2].position.set(h.width / 2 - 1.1, 2.55, Z.houseFront + .2);
    g.add(...glows);
    const pool = groundDisc(2.4, '#ffcf7a'); pool.position.set(0, .03, Z.houseFront + 1.4); g.add(pool);
    if (h.player) {
      // prepaid meter on the wall by the door, blinking red when low
      const meter = pickable(box(.32, .5, .12, std('#e9e9e4'), h.width / 2 - .45, 1.9, Z.houseFront + .07), { kind: 'meter' });
      meterLed = new THREE.MeshBasicMaterial({ color: '#40d060' });
      const led = box(.16, .1, .03, meterLed, 0, .1, .07); meter.add(led);
      g.add(meter); pickables.push(meter);
      g.add(box(1.6, .02, .5, std('#b8862e'), 0, .26, Z.houseFront + .65)); // doormat
      pickable(g, { kind: 'house' }); pickables.push(g); // walls and roof; the meter (nearer the tap) still wins
    }
    houses.push({ id: 'house' + i, player: !!h.player, windows, bulb, glows, pool });
  });

  // your porch bulb is a real light; the others are glows (point lights are dear on phones)
  const player = HOUSE_BOXES.find((h) => h.player)!;
  const porch = new THREE.PointLight('#ffcf7a', 0, 9, 1.6); porch.position.set(player.cx, 3, Z.houseFront + .8); scene.add(porch);

  // the pole, transformer and wires at the start of the street
  const poleX = toX(18), wood = std('#5a4030');
  scene.add(cast(box(.28, 7.2, .28, wood, poleX, 3.6, Z.houseFront + .6)));
  scene.add(box(2.4, .2, .2, wood, poleX, 6.8, Z.houseFront + .6));
  const tank = std('#69717a', { metalness: .4, roughness: .5 });
  scene.add(cast(box(1.1, 1.4, .9, tank, poleX + .1, 5.2, Z.houseFront + .2)));
  scene.add(box(.35, .25, .02, std('#c0392b'), poleX + .3, 5.2, Z.houseFront + .66));
  const slX = toX(806), wire = new THREE.LineBasicMaterial({ color: '#141418' });
  const sag = (a: THREE.Vector3, b: THREE.Vector3, droop: number) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 24; k++) { const f = k / 24; pts.push(new THREE.Vector3().lerpVectors(a, b, f).add(new THREE.Vector3(0, -Math.sin(f * Math.PI) * droop, 0))); }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wire);
  };
  [-1, 0, 1].forEach((k) => scene.add(sag(new THREE.Vector3(poleX + k * 1.1, 6.85, Z.houseFront + .6), new THREE.Vector3(slX, 5.6, Z.houseFront + .7), 1.3 + k * .15)));
  for (const h of HOUSE_BOXES) scene.add(sag(new THREE.Vector3(h.cx + h.width / 2 - .8, 5.9, Z.houseFront + .65), new THREE.Vector3(h.cx + h.width / 2 - .8, HOUSE_H + .2, Z.houseFront - .2), .25));

  // streetlight at the far end: pole, arm, head, cone pool
  const steel = std('#3a3e45', { metalness: .5, roughness: .5 });
  scene.add(cast(box(.18, 6.2, .18, steel, slX, 3.1, Z.porch + .2)));
  scene.add(box(1.4, .1, .1, steel, slX - .65, 6.1, Z.porch + .2));
  const head = new THREE.MeshBasicMaterial({ color: '#4c4c4c' });
  scene.add(box(.6, .12, .32, head, slX - 1.3, 6.0, Z.porch + .2));
  const sGlow = glow('#ffe2a0', 4.5); sGlow.position.set(slX - 1.3, 5.9, Z.porch + .3); scene.add(sGlow);
  const sPool = groundDisc(4.2, '#ffe2a0'); sPool.position.set(slX - 1.3, .04, Z.outside); scene.add(sPool);
  const sLight = new THREE.PointLight('#ffe2a0', 0, 16, 1.4); sLight.position.set(slX - 1.3, 5.6, Z.porch + .4); scene.add(sLight);

  // trees: a mango behind the first houses, a palm between the last two
  const leaf = std('#2f5a2a'), leaf2 = std('#3e7434'), bark = std('#4a3324');
  const mx = toX(173);
  scene.add(cast(box(.4, 4.5, .4, bark, mx, 2.25, Z.houseBack - .8)));
  for (const [dx, dy, dz, r] of [[-1, 5, 0, 1.6], [.4, 5.8, .2, 1.8], [1.3, 4.9, -.2, 1.5], [0, 4.4, .8, 1.3]]) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), dy > 5 ? leaf2 : leaf); s.position.set(mx + dx, dy, Z.houseBack - .8 + dz); scene.add(cast(s));
  }
  const px = toX(655), pz = Z.houseFront + .8;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.13, .2, 6.5, 6), std('#6a5440')); trunk.position.set(px, 3.25, pz); trunk.rotation.z = .05; scene.add(cast(trunk));
  for (let k = 0; k < 8; k++) {
    const frond = new THREE.Mesh(new THREE.BoxGeometry(2.4, .05, .45), leaf); frond.geometry.translate(1.2, 0, 0);
    frond.position.set(px + .15, 6.5, pz); frond.rotation.set(0, k * Math.PI / 4, -.45); scene.add(frond);
  }

  // far skyline: other streets' blocks, with lit windows that also go out when the area's power goes
  const rng = seededRng('skyline3d'), far = std('#1e2333', { roughness: 1 }), winPts: number[] = [];
  for (let x = -46; x < 46;) {
    const w = 2 + rng() * 3.5, h = 2.5 + rng() * 6, z = -20 - rng() * 8;
    scene.add(box(w, h, 2, far, x + w / 2, h / 2, z));
    for (let wy = 1; wy < h - .6; wy += .9) for (let wx = x + .5; wx < x + w - .4; wx += .8) if (rng() < .3) winPts.push(wx, wy, z + 1.02);
    x += w + rng() * 1.2;
  }
  const farWindows = new THREE.PointsMaterial({ color: '#ffc46b', size: .28, transparent: true, opacity: 0, depthWrite: false });
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(winPts, 3));
  scene.add(new THREE.Points(pg, farWindows));

  // your generator: outdoors, beside the house, away from the windows
  const gen = new THREE.Group(); gen.position.set(GEN_SPOT.x, 0, GEN_SPOT.z); gen.visible = false; scene.add(gen);
  const genBody = std('#c0392b', { roughness: .5, metalness: .2 });
  gen.add(box(1.1, .45, .7, genBody, 0, .82, 0), box(1, .5, .6, std('#3d4249'), 0, .35, 0));
  const frame = std('#262626', { metalness: .4 });
  for (const [x, z] of [[-.55, -.36], [.55, -.36], [-.55, .36], [.55, .36]]) gen.add(box(.06, 1.1, .06, frame, x, .55, z));
  const genLed = new THREE.MeshBasicMaterial({ color: '#3a3a3a' });
  gen.add(box(.1, .1, .02, genLed, -.3, .45, .32), groundDisc(.9));
  const genGlow = glow('#ff9a40', 2.8); genGlow.position.set(0, .6, .5); gen.add(genGlow);
  const genLight = new THREE.PointLight('#ff9a40', 0, 6, 1.6); genLight.position.set(0, .9, .8); gen.add(genLight);
  pickable(gen, { kind: 'gen' }); pickables.push(gen);

  // an invisible plane at ground level for tap-to-walk
  const walkPlane = new THREE.Mesh(new THREE.PlaneGeometry(90, 30), new THREE.MeshBasicMaterial({ visible: false }));
  walkPlane.rotation.x = -Math.PI / 2; walkPlane.position.z = 2; scene.add(walkPlane);

  return {
    houses, meterLed, porch, farWindows, ground, road, walkPlane, pickables,
    street: { head, glow: sGlow, pool: sPool, light: sLight },
    gen: { group: gen, body: genBody, led: genLed, glow: genGlow, light: genLight, exhaust: new THREE.Vector3(GEN_SPOT.x - .7, .7, GEN_SPOT.z) },
  };
}
