/* Low-poly people built from the same skin/hair/outfit data as the 2D street and the creator.
   A cut-out rig: hips, knees, shoulders and elbows are pivots, so every pose is just a few rotations.
   The face is a painted decal on the front of the head that swaps per expression (mood.ts decides which). */
import * as THREE from 'three';
import { OUTFITS, SKINS, type Outfit } from '../data/content';
import { faceTex, fabricTex, groundDisc, Tag } from './kit';
import type { Face, Pose } from './mood';

export interface Look { skin: number; hair: string; outfit: string | Outfit; gender: number }

const HAIR = new THREE.MeshStandardMaterial({ color: '#191410', roughness: .95 });
const TROUSERS = new THREE.MeshStandardMaterial({ color: '#23252e', roughness: .85 });
const SHOE = new THREE.MeshStandardMaterial({ color: '#141414', roughness: .6 });
const CHAIR = new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: .5 });
const cache = <T>(m: Map<string, T>, k: string, make: () => T): T => { let v = m.get(k); if (!v) m.set(k, v = make()); return v; };
const skins = new Map<string, THREE.MeshStandardMaterial>(), cloths = new Map<string, THREE.MeshStandardMaterial>();
const skinMat = (i: number) => cache(skins, String(i), () => new THREE.MeshStandardMaterial({ color: SKINS[i], roughness: .7 }));
const clothMat = (o: Outfit) => cache(cloths, o.id, () => new THREE.MeshStandardMaterial({ map: fabricTex(o), roughness: .85 }));

/* shared geometry: everyone is built from the same few meshes */
const GEO = {
  torso: new THREE.CapsuleGeometry(.25, .42, 4, 10),
  hips: new THREE.CylinderGeometry(.22, .24, .22, 10),
  upper: new THREE.CapsuleGeometry(.075, .2, 3, 6), fore: new THREE.CapsuleGeometry(.065, .2, 3, 6),
  hand: new THREE.SphereGeometry(.07, 6, 5),
  thigh: new THREE.CapsuleGeometry(.1, .28, 3, 6), shin: new THREE.CapsuleGeometry(.085, .28, 3, 6),
  foot: new THREE.BoxGeometry(.15, .08, .26),
  skirt: new THREE.CylinderGeometry(.23, .34, .55, 12, 1, true),
  neck: new THREE.CylinderGeometry(.07, .08, .12, 8),
  head: new THREE.SphereGeometry(.23, 16, 12),
  // the face decal: the front patch of a sphere just outside the head, so the texture wraps with it
  face: new THREE.SphereGeometry(.234, 16, 12, Math.PI / 2 - .85, 1.7, .9, 1.35),
  cap: new THREE.SphereGeometry(.245, 14, 8, 0, Math.PI * 2, 0, Math.PI * .5),
  afro: new THREE.SphereGeometry(.34, 12, 10),
  bun: new THREE.SphereGeometry(.07, 6, 5),
  loc: new THREE.CylinderGeometry(.03, .03, .34, 5),
  side: new THREE.BoxGeometry(.09, .42, .2),
  seat: new THREE.BoxGeometry(.5, .06, .48), back: new THREE.BoxGeometry(.5, .5, .05), chairLeg: new THREE.BoxGeometry(.04, .44, .04),
};

interface Limb { root: THREE.Group; joint: THREE.Group }

export class Person {
  readonly root = new THREE.Group();
  readonly tag = new Tag();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private armL: Limb; private armR: Limb; private legL: Limb; private legR: Limb;
  private faceMat = new THREE.MeshStandardMaterial({ map: faceTex('neutral'), transparent: true, roughness: .7, depthWrite: false });
  private chair = new THREE.Group();
  private phoneProp: THREE.Mesh;
  private phase = Math.random() * 6;
  private blinkAt = 1 + Math.random() * 4;
  private faceKey = '';
  /** Where it is in the world (x, z) and whether it's on screen. */
  pos = { x: 0, z: 0 };
  shown = true;

  constructor(look: Look, scale = 1) {
    const of = typeof look.outfit === 'string' ? (OUTFITS.find((o) => o.id === look.outfit) ?? OUTFITS[3]) : look.outfit;
    const skin = skinMat(look.skin), cloth = clothMat(of), female = look.gender === 1;
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };
    // a limb is two segments: root pivot (hip/shoulder) → joint pivot (knee/elbow) → end (foot/hand)
    const limb = (x: number, y: number, a: THREE.BufferGeometry, b: THREE.BufferGeometry, ma: THREE.Material, mb: THREE.Material, len: number, end: THREE.Mesh): Limb => {
      const root = new THREE.Group(); root.position.set(x, y, 0);
      root.add(mesh(a, ma, 0, -len / 2, 0));
      const joint = new THREE.Group(); joint.position.y = -len; root.add(joint);
      joint.add(mesh(b, mb, 0, -len / 2, 0)); end.position.y = -len - .02; joint.add(end);
      this.body.add(root); return { root, joint };
    };
    const foot = () => { const f = mesh(GEO.foot, SHOE); f.position.z = .06; return f; };
    this.legL = limb(-.11, .84, GEO.thigh, GEO.shin, female ? skin : TROUSERS, female ? skin : TROUSERS, .42, foot());
    this.legR = limb(.11, .84, GEO.thigh, GEO.shin, female ? skin : TROUSERS, female ? skin : TROUSERS, .42, foot());
    this.body.add(mesh(GEO.hips, female ? cloth : TROUSERS, 0, .9, 0));
    if (female) this.body.add(mesh(GEO.skirt, cloth, 0, .66, 0)); // wrapper
    this.body.add(mesh(GEO.torso, cloth, 0, 1.18, 0), mesh(GEO.neck, skin, 0, 1.5, 0));
    this.armL = limb(-.32, 1.4, GEO.upper, GEO.fore, cloth, skin, .3, mesh(GEO.hand, skin));
    this.armR = limb(.32, 1.4, GEO.upper, GEO.fore, cloth, skin, .3, mesh(GEO.hand, skin));
    this.phoneProp = mesh(new THREE.BoxGeometry(.08, .15, .02), new THREE.MeshStandardMaterial({ color: '#111', emissive: '#5aa9ff', emissiveIntensity: .5 }), 0, -.06, .06);
    this.phoneProp.visible = false; this.armR.joint.children[1].add(this.phoneProp);
    this.head.position.y = 1.72; this.body.add(this.head);
    this.head.add(mesh(GEO.head, skin), mesh(GEO.face, this.faceMat));
    this.hair(look);
    // a plastic chair, shown only when they sit
    this.chair.add(mesh(GEO.seat, CHAIR, 0, .46, -.05), mesh(GEO.back, CHAIR, 0, .72, -.28));
    for (const [x, z] of [[-.22, .18], [.22, .18], [-.22, -.26], [.22, -.26]]) this.chair.add(mesh(GEO.chairLeg, CHAIR, x, .22, z));
    this.chair.visible = false;
    this.body.scale.setScalar(scale);
    this.root.add(this.chair, this.body, groundDisc(.45));
    this.tag.sprite.position.y = 2.3 * scale; this.root.add(this.tag.sprite);
  }

  private hair(look: Look): void {
    const add = (g: THREE.BufferGeometry, x = 0, y = 0, z = 0, s = 1) => {
      const m = new THREE.Mesh(g, HAIR); m.position.set(x, y, z); m.scale.setScalar(s);
      if (g === GEO.cap) { m.rotation.x = -.5; m.position.z -= .03; } // tipped back: a hairline at the forehead, not over the eyes
      this.head.add(m); return m;
    };
    switch (look.hair) {
      case 'afro': add(GEO.afro, 0, .08, -.06); break;
      case 'braids': add(GEO.cap, 0, .02); for (const x of [-.15, -.05, .05, .15]) add(GEO.bun, x, .22, -.02); break;
      case 'locs': add(GEO.cap, 0, .02); for (let i = 0; i < 7; i++) { const a = Math.PI * (.15 + i * .12); add(GEO.loc, Math.cos(a) * .22, -.12, -Math.sin(a) * .2); } break;
      case 'natural': add(GEO.cap, 0, .03, -.02, 1.18); break;
      case 'straight': add(GEO.cap, 0, .02); add(GEO.side, -.22, -.14, -.03); add(GEO.side, .22, -.14, -.03); break;
      default: add(GEO.cap, 0, .03, -.01, .98); // low cut
    }
  }

  private setFace(face: Face, frame: number): void {
    const key = face + frame; if (key === this.faceKey) return;
    this.faceKey = key; this.faceMat.map = faceTex(face, frame); this.faceMat.needsUpdate = true;
  }

  /** `moving`: walking this frame. `motion`: ambient animation allowed (SET.motion). */
  animate(dt: number, moving: boolean, motion: boolean, pose: Pose = 'idle', face: Face = 'neutral'): void {
    this.phase += dt * (moving ? 9 : 2);
    const ph = this.phase, wave = (k: number, a: number) => (motion ? Math.sin(ph * k) * a : 0);
    const L = this.armL, R = this.armR, LL = this.legL, LR = this.legR;
    // reset to standing, arms relaxed
    for (const l of [L, R, LL, LR]) { l.root.rotation.set(0, 0, 0); l.joint.rotation.set(0, 0, 0); }
    L.root.rotation.z = -.08; R.root.rotation.z = .08; L.joint.rotation.x = -.15; R.joint.rotation.x = -.15;
    this.head.rotation.set(0, 0, 0); this.body.position.y = 0; this.chair.visible = false; this.phoneProp.visible = false;

    if (moving) { // walk cycle: legs swing, knees bend on the back swing, arms counter-swing
      const s = Math.sin(ph) * .55;
      LL.root.rotation.x = s; LR.root.rotation.x = -s;
      LL.joint.rotation.x = Math.max(0, -Math.sin(ph)) * .9; LR.joint.rotation.x = Math.max(0, Math.sin(ph)) * .9;
      L.root.rotation.x = -s * .8; R.root.rotation.x = s * .8;
      this.body.position.y = Math.abs(Math.sin(ph)) * .04;
    } else {
      this.body.position.y = wave(1, .01); // breathing
      if (pose === 'sit') {
        this.chair.visible = true; this.body.position.y = -.38;
        LL.root.rotation.x = LR.root.rotation.x = -1.45; LL.joint.rotation.x = LR.joint.rotation.x = 1.45;
        L.joint.rotation.x = R.joint.rotation.x = -.9;
      }
    }
    switch (pose) {
      case 'work': L.root.rotation.x = R.root.rotation.x = -.7; L.joint.rotation.x = -.6 + wave(6, .25); R.joint.rotation.x = -.6 - wave(6, .25); break;
      case 'cheer': L.root.rotation.z = -2.7 + wave(4, .25); R.root.rotation.z = 2.7 - wave(4, .25); L.joint.rotation.z = R.joint.rotation.z = 0; break;
      case 'shock': // hands on head
        L.root.rotation.set(-.4, 0, -2.3); R.root.rotation.set(-.4, 0, 2.3); L.joint.rotation.z = -1.9; R.joint.rotation.z = 1.9; this.head.rotation.x = -.12; break;
      case 'fan': // right hand fanning the face, left hand on the hip
        R.root.rotation.set(-1.9, 0, .3); R.joint.rotation.set(-1 + wave(10, .35), 0, 0); L.root.rotation.z = -.5; L.joint.rotation.x = -1.6; break;
      case 'phone':
        R.root.rotation.x = -.35; R.joint.rotation.x = -1.35; L.root.rotation.x = -.3; L.joint.rotation.set(-1.2, 0, .5);
        this.phoneProp.visible = true; this.head.rotation.x = .3; break;
      case 'hiss': // arms folded, chin up
        L.root.rotation.set(-.35, 0, -.25); R.root.rotation.set(-.35, 0, .25); L.joint.rotation.set(-1.7, .9, 0); R.joint.rotation.set(-1.7, -.9, 0);
        this.head.rotation.set(-.1, wave(.7, .25), 0); break;
      case 'sit': if (motion) this.head.rotation.y = Math.sin(ph * .4) * .3; break;
    }
    // faces: blink every few seconds, mouth flaps while talking
    let frame = 0;
    if (motion) {
      this.blinkAt -= dt; if (this.blinkAt < 0) { if (this.blinkAt < -.13) this.blinkAt = 2.5 + Math.random() * 3.5; else frame = 1; }
      if (face === 'talk') frame = Math.floor(ph * 2.5) % 2;
    }
    this.setFace(face, frame);
  }

  /** Face the direction of travel (or `dz` = 1 to face the camera). */
  face(dx: number, dz: number): void {
    const target = Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : 0;
    let d = target - this.body.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.body.rotation.y += d * .2;
  }
  /** Turn towards a point (someone you're talking to). */
  lookAt(x: number, z: number): void { this.face(x - this.pos.x, z - this.pos.z); }

  place(): void { this.root.position.set(this.pos.x, 0, this.pos.z); this.root.visible = this.shown; this.chair.rotation.y = this.body.rotation.y; }
}
