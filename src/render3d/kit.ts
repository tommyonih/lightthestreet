/* Textures and small helpers for the 3D street. Everything is drawn in code on small canvases: no image files to download. */
import * as THREE from 'three';
import type { Outfit } from '../data/content';

function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!); return cv;
}
function tex(cv: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const cache = new Map<string, THREE.Texture>();
const once = (key: string, make: () => THREE.Texture): THREE.Texture => { let t = cache.get(key); if (!t) cache.set(key, t = make()); return t; };

/** Soft round glow for additive light sprites and ground pools. */
export const glowTex = (): THREE.Texture => once('glow', () => tex(canvas(64, 64, (c) => {
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
})));

/** Dark blob under people and props, standing in for shadow maps on cheap phones. */
export const shadowTex = (): THREE.Texture => once('shadow', () => tex(canvas(64, 64, (c) => {
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
})));

/** Speckled grain for laterite, plaster and asphalt. */
export const grainTex = (base: string, repeat: [number, number], dark = .25, light = .08): THREE.Texture => once(`grain${base}${repeat}`, () => tex(canvas(128, 128, (c) => {
  c.fillStyle = base; c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) {
    c.fillStyle = Math.random() < .6 ? `rgba(0,0,0,${Math.random() * dark})` : `rgba(255,255,255,${Math.random() * light})`;
    c.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}), repeat));

/** Corrugated zinc: ridges catch light, troughs fall dark, a few rust patches. */
export const zincTex = (roof: string): THREE.Texture => once('zinc' + roof, () => tex(canvas(64, 64, (c) => {
  c.fillStyle = roof; c.fillRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x += 8) { c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(x, 0, 2, 64); c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(x + 4, 0, 2, 64); }
  for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(115,52,18,.35)'; c.beginPath(); c.ellipse(Math.random() * 64, Math.random() * 64, 6, 4, 0, 0, 7); c.fill(); }
}), [3, 1]));

/** A burglar-proofed window: `glass` is what you see, `lit` is where light shows (bars stay black). */
export function windowTex(curtain: string): { glass: THREE.Texture; lit: THREE.Texture } {
  const draw = (lit: boolean) => (c: CanvasRenderingContext2D) => {
    c.fillStyle = lit ? '#ffffff' : '#1c2536'; c.fillRect(0, 0, 64, 64);
    c.fillStyle = lit ? '#8a6a50' : curtain; // curtains block some light
    c.beginPath(); c.moveTo(0, 0); c.lineTo(20, 0); c.quadraticCurveTo(10, 32, 16, 64); c.lineTo(0, 64); c.fill();
    c.beginPath(); c.moveTo(64, 0); c.lineTo(44, 0); c.quadraticCurveTo(54, 32, 48, 64); c.lineTo(64, 64); c.fill();
    c.fillStyle = '#000'; for (const x of [15, 31, 47]) c.fillRect(x, 0, 3, 64); c.fillRect(0, 30, 64, 3);
    c.strokeStyle = lit ? '#000' : '#4a3423'; c.lineWidth = 6; c.strokeRect(0, 0, 64, 64);
  };
  return { glass: once('wg' + curtain, () => tex(canvas(64, 64, draw(false)))), lit: once('wl' + curtain, () => tex(canvas(64, 64, draw(true)))) };
}

/** Fabric for clothes: the same patterns as the 2D street and the creator. */
export const fabricTex = (o: Outfit): THREE.Texture => once('fab' + o.id, () => tex(canvas(64, 64, (c) => {
  c.fillStyle = o.c1; c.fillRect(0, 0, 64, 64); c.fillStyle = o.c2;
  if (o.pat === 'stripes') for (let y = 0; y < 64; y += 16) c.fillRect(0, y, 64, 6);
  if (o.pat === 'dots') for (let y = 8; y < 64; y += 16) for (let x = 8; x < 64; x += 16) { c.beginPath(); c.arc(x + (y % 32 ? 8 : 0), y, 3.5, 0, 7); c.fill(); }
  if (o.pat === 'tri') for (let x = 0; x < 64; x += 16) for (let y = 4; y < 64; y += 22) { c.beginPath(); c.moveTo(x, y + 14); c.lineTo(x + 8, y); c.lineTo(x + 16, y + 14); c.fill(); }
}), [2, 2]));

/** A floating name tag (or job bubble). Redraw by calling `set` with new text. */
export class Tag {
  readonly sprite: THREE.Sprite;
  private cv = document.createElement('canvas');
  private key = '';
  private t: THREE.CanvasTexture;
  constructor(private w = 2.4) {
    this.cv.width = 256; this.cv.height = 72;
    this.t = new THREE.CanvasTexture(this.cv); this.t.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.t, depthTest: false, transparent: true }));
    this.sprite.scale.set(w, w * 72 / 256, 1); this.sprite.renderOrder = 10;
  }
  set(text: string, color = '#ffffff', sub = '', progress = -1): void {
    const key = `${text}|${color}|${sub}|${progress.toFixed(2)}`; if (key === this.key) return; this.key = key;
    const c = this.cv.getContext('2d')!; c.clearRect(0, 0, 256, 72);
    c.font = '800 26px system-ui'; const tw = Math.min(244, Math.max(c.measureText(text).width, sub ? c.measureText(sub).width * .8 : 0) + 28);
    const h = sub || progress >= 0 ? 66 : 40;
    c.fillStyle = 'rgba(10,12,22,.72)'; c.beginPath(); c.roundRect(128 - tw / 2, 2, tw, h, 14); c.fill();
    c.textAlign = 'center'; c.fillStyle = color; c.fillText(text, 128, 31, 236);
    if (sub) { c.font = '700 19px system-ui'; c.fillStyle = 'rgba(255,255,255,.78)'; c.fillText(sub, 128, 56, 236); }
    if (progress >= 0) {
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(128 - tw / 2 + 14, 48, tw - 28, 7);
      c.fillStyle = '#5fd068'; c.fillRect(128 - tw / 2 + 14, 48, (tw - 28) * progress, 7);
    }
    this.t.needsUpdate = true;
  }
}

/** An additive glow sprite (bulbs, windows, gen) whose strength is set every frame. */
export function glow(color: string, size: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  s.scale.setScalar(size); return s;
}

/** A flat soft disc on the ground: shadows (normal blending) or pools of light (additive). */
export function groundDisc(r: number, light?: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({
    map: light ? glowTex() : shadowTex(), color: light ?? '#ffffff', transparent: true, depthWrite: false,
    blending: light ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: light ? 0 : 1,
  }));
  m.rotation.x = -Math.PI / 2; m.position.y = .02; return m;
}

/** Facial expressions, painted on a transparent decal that sits on the front of the head.
    `frame` 1 is the alternate frame: a blink, or the open mouth while talking. */
export function faceTex(face: string, frame = 0): THREE.Texture {
  return once(`face${face}${frame}`, () => tex(canvas(128, 128, (c) => {
    const ink = '#1a1210';
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = ink; c.fillStyle = ink;
    const eye = (x: number, y: number, look = 0, r = 7) => {
      c.fillStyle = '#f5efe6'; c.beginPath(); c.ellipse(x, y, r + 3, r + 1, 0, 0, 7); c.fill();
      c.fillStyle = ink; c.beginPath(); c.arc(x + look, y + 1, r - 2, 0, 7); c.fill();
    };
    const shut = (x: number, y: number, up = false) => { c.lineWidth = 4; c.beginPath(); c.arc(x, y + (up ? 6 : -4), 9, up ? Math.PI * 1.15 : Math.PI * .15, up ? Math.PI * 1.85 : Math.PI * .85); c.stroke(); };
    const brow = (x: number, y: number, tilt: number) => { c.lineWidth = 5; c.beginPath(); c.moveTo(x - 10, y + tilt); c.lineTo(x + 10, y - tilt); c.stroke(); };
    const mouth = (path: () => void, fill = false) => { c.lineWidth = 4.5; c.beginPath(); path(); if (fill) { c.fillStyle = '#5a1e1e'; c.fill(); } c.stroke(); };
    const L = 44, R = 84, Y = 56, M = 92;
    const blink = frame === 1 && face !== 'talk';
    switch (face) {
      case 'happy':
        if (blink) { shut(L, Y); shut(R, Y); } else { shut(L, Y, true); shut(R, Y, true); }
        mouth(() => { c.moveTo(48, M - 6); c.quadraticCurveTo(64, M + 14, 80, M - 6); c.closePath(); }, true); break;
      case 'annoyed':
        if (blink) { shut(L, Y); shut(R, Y); } else { eye(L, Y); eye(R, Y); }
        brow(L, Y - 15, -4); brow(R, Y - 15, 4);
        mouth(() => { c.moveTo(52, M + 4); c.quadraticCurveTo(64, M - 4, 76, M + 4); }); break;
      case 'shocked':
        eye(L, Y, 0, 9); eye(R, Y, 0, 9); brow(L, Y - 22, 2); brow(R, Y - 22, -2);
        mouth(() => { c.ellipse(64, M + 2, 8, 11, 0, 0, 7); }, true); break;
      case 'sleepy':
        c.lineWidth = 4; for (const x of [L, R]) { c.beginPath(); c.moveTo(x - 9, Y + 2); c.lineTo(x + 9, Y + 2); c.stroke(); }
        mouth(() => { c.ellipse(64, M, 5, 4, 0, 0, 7); }, true); break;
      case 'sideeye':
        if (blink) { shut(L, Y); shut(R, Y); } else { eye(L, Y + 2, 5, 6); eye(R, Y + 2, 5, 6); }
        brow(L, Y - 13, 0); brow(R, Y - 17, -5);
        mouth(() => { c.moveTo(50, M + 2); c.quadraticCurveTo(66, M + 2, 78, M - 4); }); break;
      case 'talk':
        eye(L, Y); eye(R, Y);
        if (frame === 1) mouth(() => { c.ellipse(64, M, 9, 7, 0, 0, 7); }, true);
        else mouth(() => { c.moveTo(52, M); c.quadraticCurveTo(64, M + 6, 76, M); }); break;
      default:
        if (blink) { shut(L, Y); shut(R, Y); } else { eye(L, Y); eye(R, Y); }
        mouth(() => { c.moveTo(52, M); c.quadraticCurveTo(64, M + 8, 76, M); });
    }
  })));
}

/** A painted signboard. The material glows at night when its place has power (set emissiveIntensity per frame). */
export function signboard(text: string, w: number, h: number, bg: string, fg: string, sub = ''): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> {
  const t = once(`sign${text}${bg}${fg}${sub}`, () => tex(canvas(512, Math.round(512 * h / w), (c) => {
    const H = c.canvas.height;
    c.fillStyle = bg; c.fillRect(0, 0, 512, H);
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 10; c.strokeRect(0, 0, 512, H);
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 ${Math.round(H * (sub ? .4 : .55))}px system-ui`; c.fillText(text, 256, H * (sub ? .4 : .52), 480);
    if (sub) { c.font = `700 ${Math.round(H * .2)}px system-ui`; c.fillText(sub, 256, H * .78, 480); }
  })));
  const m = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0, roughness: .6 });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

/** Tag every mesh under `o` so a tap on any part of it reports `hit`. */
export function pickable<T extends THREE.Object3D>(o: T, hit: unknown): T { o.userData.hit = hit; return o; }
