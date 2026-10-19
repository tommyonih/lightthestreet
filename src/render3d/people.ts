/* Low-poly people built from the same skin/hair/outfit data as the 2D street and the creator.
   One shared body plan; hair and fabric swap per person. Walk cycle swings arms and legs; idle breathes. */
import * as THREE from 'three';
import { OUTFITS, SKINS, type Outfit } from '../data/content';
import { fabricTex, groundDisc, Tag } from './kit';

export interface Look { skin: number; hair: string; outfit: string | Outfit; gender: number }

const HAIR = new THREE.MeshStandardMaterial({ color: '#191410', roughness: .95 });
const DARK = new THREE.MeshStandardMaterial({ color: '#1a1a1e', roughness: .8 });
const EYE = new THREE.MeshBasicMaterial({ color: '#120c0a' });
const skinMats = new Map<number, THREE.MeshStandardMaterial>();
const skinMat = (i: number) => { let m = skinMats.get(i); if (!m) skinMats.set(i, m = new THREE.MeshStandardMaterial({ color: SKINS[i], roughness: .7 })); return m; };
const clothMats = new Map<string, THREE.MeshStandardMaterial>();
const clothMat = (o: Outfit) => { let m = clothMats.get(o.id); if (!m) clothMats.set(o.id, m = new THREE.MeshStandardMaterial({ map: fabricTex(o), roughness: .85 })); return m; };

/* shared geometry: everyone is built from the same few meshes */
const G = {
  torso: new THREE.CapsuleGeometry(.27, .5, 4, 10),
  limb: new THREE.CapsuleGeometry(.075, .42, 3, 6),
  leg: new THREE.CapsuleGeometry(.1, .5, 3, 6),
  head: new THREE.SphereGeometry(.23, 14, 10),
  eye: new THREE.SphereGeometry(.028, 6, 4),
  cap: new THREE.SphereGeometry(.245, 14, 8, 0, Math.PI * 2, 0, Math.PI * .5),
  afro: new THREE.SphereGeometry(.34, 12, 10),
  bun: new THREE.SphereGeometry(.07, 6, 5),
  loc: new THREE.CylinderGeometry(.03, .03, .34, 5),
  side: new THREE.BoxGeometry(.09, .42, .2),
};

export class Person {
  readonly root = new THREE.Group();
  readonly tag = new Tag();
  private body = new THREE.Group();
  private armL: THREE.Object3D; private armR: THREE.Object3D;
  private legL: THREE.Object3D; private legR: THREE.Object3D;
  private phase = Math.random() * 6;
  /** Where it is in the world (x, z) and whether it's on screen. */
  pos = { x: 0, z: 0 };
  shown = true;

  constructor(look: Look, scale = 1) {
    const of = typeof look.outfit === 'string' ? (OUTFITS.find((o) => o.id === look.outfit) ?? OUTFITS[3]) : look.outfit;
    const skin = skinMat(look.skin), cloth = clothMat(of);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };
    // legs and arms hang from pivots so they can swing
    const limb = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, len: number) => {
      const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
      pivot.add(mesh(geo, mat, 0, -len / 2, 0)); this.body.add(pivot); return pivot;
    };
    this.legL = limb(G.leg, DARK, -.12, .72, .7); this.legR = limb(G.leg, DARK, .12, .72, .7);
    this.body.add(mesh(G.torso, cloth, 0, 1.05, 0));
    this.armL = limb(G.limb, skin, -.33, 1.32, .5); this.armR = limb(G.limb, skin, .33, 1.32, .5);
    const head = new THREE.Group(); head.position.y = 1.62; this.body.add(head);
    head.add(mesh(G.head, skin));
    head.add(mesh(G.eye, EYE, -.08, .03, .2), mesh(G.eye, EYE, .08, .03, .2));
    this.hair(head, look);
    this.body.scale.setScalar(scale);
    this.root.add(this.body, groundDisc(.45));
    this.tag.sprite.position.y = 2.25 * scale; this.root.add(this.tag.sprite);
  }

  private hair(head: THREE.Group, look: Look): void {
    const add = (g: THREE.BufferGeometry, x = 0, y = 0, z = 0, s = 1) => { const m = new THREE.Mesh(g, HAIR); m.position.set(x, y, z); m.scale.setScalar(s); head.add(m); return m; };
    switch (look.hair) {
      case 'afro': add(G.afro, 0, .08, -.04); break;
      case 'braids': add(G.cap, 0, .02); for (const x of [-.15, -.05, .05, .15]) add(G.bun, x, .22, -.02); break;
      case 'locs': add(G.cap, 0, .02); for (let i = 0; i < 7; i++) { const a = Math.PI * (.15 + i * .12); add(G.loc, Math.cos(a) * .22, -.12, -Math.sin(a) * .2); } break;
      case 'natural': add(G.cap, 0, .03, -.02, 1.18); break;
      case 'straight': add(G.cap, 0, .02); add(G.side, -.22, -.14, -.03); add(G.side, .22, -.14, -.03); break;
      default: add(G.cap, 0, .03, -.01, .98); // low cut
    }
  }

  /** `moving`: walking this frame. `motion`: ambient animation allowed (SET.motion). `pose`: hands busy working. */
  animate(dt: number, moving: boolean, motion: boolean, pose: 'idle' | 'work' | 'cheer' = 'idle'): void {
    this.phase += dt * (moving ? 9 : 2);
    const s = moving ? Math.sin(this.phase) * .55 : 0;
    this.legL.rotation.x = s; this.legR.rotation.x = -s;
    if (pose === 'work') { const w = motion ? Math.sin(this.phase * 3) * .25 : 0; this.armL.rotation.x = -1.1 + w; this.armR.rotation.x = -1.1 - w; }
    else if (pose === 'cheer') { const w = motion ? Math.sin(this.phase * 2) * .3 : 0; this.armL.rotation.z = -2.6 + w; this.armR.rotation.z = 2.6 - w; }
    else { this.armL.rotation.set(-s, 0, 0); this.armR.rotation.set(s, 0, 0); }
    if (pose !== 'cheer') { this.armL.rotation.z = 0; this.armR.rotation.z = 0; }
    this.body.position.y = moving ? Math.abs(Math.sin(this.phase)) * .05 : motion ? Math.sin(this.phase) * .012 : 0;
  }

  /** Face the direction of travel (or the camera when standing). */
  face(dx: number, dz: number): void {
    const target = Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : 0;
    let d = target - this.body.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.body.rotation.y += d * .2;
  }

  place(): void { this.root.position.set(this.pos.x, 0, this.pos.z); this.root.visible = this.shown; }
}
