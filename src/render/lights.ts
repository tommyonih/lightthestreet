/* Lighting. Darkness is drawn into a light map with holes cut where light falls, laid over the street, then each
   light adds a soft coloured glow. So a lit window really lights the porch, and a blackout really goes dark. */
import { SET } from '../core/state';
import { LH, LW } from './layout';
import { blob, makeCanvas, rgba, type RGB } from './paint';

export interface Light {
  x: number; y: number; r: number;
  /** Strength 0..~1.5. */
  a: number;
  color: string;
  /** Stretch the light: ground pools are flat (sy < 1), wet-road reflections are tall and thin (sx < 1). */
  sx?: number; sy?: number;
  /** Cuts darkness but adds no glow (moonlight, ambient fill). */
  noGlow?: boolean;
}

/** The light map is blurry by nature, so half resolution looks the same and costs a quarter. */
const LM_SCALE = .5;
let lm: HTMLCanvasElement | null = null;

function stamp(x: CanvasRenderingContext2D, l: Light, r: number, img: HTMLCanvasElement): void {
  const w = r * (l.sx ?? 1), h = r * (l.sy ?? 1);
  x.drawImage(img, l.x - w, l.y - h, w * 2, h * 2);
}

/** `dark` is how dark the unlit street is (0 at noon, ~.7 at midnight). */
export function drawLighting(ctx: CanvasRenderingContext2D, lights: Light[], dark: number, darkColor: RGB): void {
  if (dark > .01) {
    lm ??= makeCanvas(LW * LM_SCALE, LH * LM_SCALE);
    const x = lm.getContext('2d');
    if (x) {
      x.setTransform(LM_SCALE, 0, 0, LM_SCALE, 0, 0);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      x.clearRect(0, 0, LW, LH);
      x.fillStyle = rgba(darkColor, dark); x.fillRect(0, 0, LW, LH);
      x.globalCompositeOperation = 'destination-out';
      const white = blob();
      for (const l of lights) { if (l.a <= .01) continue; x.globalAlpha = Math.min(1, l.a); stamp(x, l, l.r, white); }
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      ctx.drawImage(lm, 0, 0, LW, LH);
    }
  }
  // colour: lights tint what they touch, strongest when it's dark around them
  const glow = .06 + dark * 1.1;
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    if (l.a <= .01 || l.noGlow) continue;
    ctx.globalAlpha = Math.min(1, l.a * glow * .5); stamp(ctx, l, l.r * .75, blob(l.color));
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

/* ---------- switching lights: stutter out when power goes, surge back when it returns ---------- */
interface Lamp { on: boolean; at: number }
const lamps = new Map<string, Lamp>();
/** Brightness steps of a dying bulb, FLICK_STEP seconds each (~0.6s in all). */
const FLICKER = [1, .2, .9, .05, .7, 0, .45, .1, 0];
const FLICK_STEP = .07;
const SURGE_S = .45;

/** Brightness (0..1.5) of the light `id`, which should currently be `on`. `delay` staggers a group (the far skyline). */
export function lampLevel(id: string, on: boolean, t: number, delay = 0): number {
  let L = lamps.get(id);
  if (!L) { L = { on, at: -99 }; lamps.set(id, L); } // first sight: no transition
  if (L.on !== on) { L.on = on; L.at = t; }
  const since = t - L.at - delay;
  if (since < 0) return on ? 0 : 1; // this one hasn't caught up with the change yet
  if (!SET.motion) return on ? 1 : 0;
  if (on) return since < SURGE_S ? 1 + .5 * (1 - since / SURGE_S) : 1;
  const k = Math.floor(since / FLICK_STEP);
  return k < FLICKER.length ? FLICKER[k] : 0;
}
