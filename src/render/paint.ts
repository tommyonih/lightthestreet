/* Shared canvas helpers for the street: colours, offscreen canvases, and textures/light sprites drawn once and reused. */
import { seededRng } from '../core/util';

type Factory = (w: number, h: number) => HTMLCanvasElement;
let factory: Factory = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
/** Node-canvas renders (screenshot scripts) need offscreen canvases from the same library as the main one. */
export function setCanvasFactory(f: Factory): void { factory = f; sprites.clear(); patterns.clear(); }
export const makeCanvas = (w: number, h: number): HTMLCanvasElement => factory(w, h);

export type RGB = [number, number, number];
export function hex(h: string): RGB { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
export function mix(a: RGB, b: RGB, f: number): RGB { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
export const rgba = (c: RGB, a = 1): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
/** Darken (f < 0) or lighten (f > 0) a hex colour. */
export const shade = (h: string, f: number): string => rgba(mix(hex(h), f < 0 ? [0, 0, 0] : [255, 255, 255], Math.abs(f)));

const sprites = new Map<string, HTMLCanvasElement>();
function sprite(key: string, w: number, h: number, draw: (x: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  let c = sprites.get(key);
  if (!c) { c = makeCanvas(w, h); const x = c.getContext('2d'); if (x) draw(x); sprites.set(key, c); }
  return c;
}

/** Soft round light, white or tinted. Scaled with drawImage, which is far cheaper than a gradient per light per frame. */
export function blob(color = '#ffffff'): HTMLCanvasElement {
  return sprite('blob' + color, 128, 128, (x) => {
    const c = hex(color), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, rgba(c, 1)); g.addColorStop(.3, rgba(c, .6)); g.addColorStop(.65, rgba(c, .18)); g.addColorStop(1, rgba(c, 0));
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  });
}

const patterns = new Map<string, CanvasPattern | null>();
/** Tileable speckle for plaster, soil and asphalt: dark and light grains, seeded so it never shimmers. */
export function grain(ctx: CanvasRenderingContext2D, seed: string, dark = .2, light = .08, n = 900): CanvasPattern | null {
  if (!patterns.has(seed)) {
    const c = sprite('grain' + seed, 96, 96, (x) => {
      const r = seededRng(seed);
      for (let i = 0; i < n; i++) {
        const s = r() < .85 ? 1 : 2;
        x.fillStyle = r() < .6 ? `rgba(0,0,0,${(r() * dark).toFixed(3)})` : `rgba(255,255,255,${(r() * light).toFixed(3)})`;
        x.fillRect(r() * 96, r() * 96, s, s);
      }
    });
    patterns.set(seed, ctx.createPattern(c, 'repeat') ?? null);
  }
  return patterns.get(seed) ?? null;
}

/** Fill a rect with a grain pattern (no-op where patterns aren't supported). */
export function grainRect(ctx: CanvasRenderingContext2D, seed: string, x: number, y: number, w: number, h: number, dark?: number, light?: number): void {
  const p = grain(ctx, seed, dark, light); if (!p) return;
  ctx.fillStyle = p; ctx.fillRect(x, y, w, h);
}
