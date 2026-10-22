/* Your character on their own: a slow turntable on the creator screen, and a still portrait for the share card.
   Same rig and looks as the street, so the person you build is the person you play. Part of the lazy 3D chunk. */
import * as THREE from 'three';
import { HAIRS, OUTFITS } from '../data/content';
import { SET } from '../core/state';
import type { Face, Pose } from './mood';
import { Person } from './people';

/** The creator's choices (indexes into HAIRS/OUTFITS, like GameState). */
export interface PortraitLook { skin: number; hair: number; outfit: number; gender: number }

function stage(): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff3e0', '#2a2238', 1.4));
  const key = new THREE.DirectionalLight('#ffd9a0', 1.6); key.position.set(2, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight('#7f93d8', .9); rim.position.set(-3, 3, -4); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(28, 140 / 190, .1, 50);
  camera.position.set(0, 1.3, 3.9); camera.lookAt(0, 1.08, 0); // head to shoes, filling the frame
  return { scene, camera };
}
const build = (l: PortraitLook): Person => {
  const p = new Person({ skin: l.skin, hair: HAIRS[l.hair]?.id ?? 'lowcut', outfit: OUTFITS[l.outfit], gender: l.gender });
  p.tag.sprite.visible = false; p.pos = { x: 0, z: 0 }; p.place(); return p;
};
const keyOf = (l: PortraitLook) => `${l.skin}|${l.hair}|${l.outfit}|${l.gender}`;

/** A turntable on `canvas`, following the creator's choices as they change. Returns a stop function. */
export function startPreview(canvas: HTMLCanvasElement, look: () => PortraitLook): () => void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const { scene, camera } = stage();
  let p: Person | null = null, key = '', raf = 0, last = 0, spin = -.5;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (canvas.offsetParent === null) { last = 0; return; } // creator not on screen
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    const t = performance.now() / 1000, dt = Math.min(.1, last ? t - last : 0); last = t;
    const l = look(), k = keyOf(l);
    if (k !== key) { if (p) scene.remove(p.root); p = build(l); scene.add(p.root); key = k; }
    spin = SET.motion ? spin + dt * .6 : -.35;
    p!.root.rotation.y = Math.sin(spin) * .7; // a gentle sway rather than a full spin: we always see the face
    p!.animate(dt, false, SET.motion, 'idle', 'happy');
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); renderer.dispose(); };
}

/** Creator tiles: one still per look from a single shared renderer (phones allow only a few WebGL contexts).
    `head` frames the face for skin and hair; `full` shows head to shoes for body and outfit. */
let thumbGL: { renderer: THREE.WebGLRenderer; cv: HTMLCanvasElement } | null = null;
export function thumbs(looks: PortraitLook[], w: number, h: number, framing: 'head' | 'full'): HTMLCanvasElement[] {
  // one renderer for every call: tapping through the categories must not use up the browser's WebGL contexts
  if (!thumbGL) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.setSize(w, h, false);
    thumbGL = { renderer: r, cv: c };
  }
  const { renderer, cv } = thumbGL;
  const { scene, camera } = stage(); camera.aspect = w / h;
  if (framing === 'head') { camera.fov = 17; camera.position.set(0, 1.74, 3.4); camera.lookAt(0, 1.64, 0); }
  camera.updateProjectionMatrix();
  const out = looks.map((l) => {
    const p = build(l); p.root.rotation.y = -.3; p.animate(0, false, false, 'idle', 'happy'); scene.add(p.root);
    renderer.render(scene, camera); scene.remove(p.root);
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(cv, 0, 0);
    return c;
  });
  return out;
}
/** Let the thumbnail renderer go once the creator is done. */
export function freeThumbs(): void { thumbGL?.renderer.dispose(); thumbGL?.renderer.forceContextLoss(); thumbGL = null; }

/** A still portrait (transparent background) for the share card. */
export function snapshot(l: PortraitLook, w: number, h: number, face: Face = 'happy', pose: Pose = 'idle'): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.setSize(w, h, false);
  const { scene, camera } = stage(); camera.aspect = w / h; camera.updateProjectionMatrix();
  const p = build(l); p.root.rotation.y = -.35; p.animate(0, false, false, pose, face); scene.add(p.root);
  renderer.render(scene, camera);
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  out.getContext('2d')!.drawImage(cv, 0, 0); // copy out before the GL context goes
  renderer.dispose(); renderer.forceContextLoss();
  return out;
}
