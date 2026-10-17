export const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector(s) as T;
export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
export const chance = (p: number): boolean => Math.random() < p;
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
/** Small deterministic RNG (mulberry32) seeded from a string — same seed, same sequence. */
export function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = (h + 0x6D2B79F5) | 0; let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = (s: unknown): string => String(s).replace(/[&<>"]/g, (c) => ESC[c]);
