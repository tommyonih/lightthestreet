/* How people look right now: a face and a pose, from what's happening to them. Pure (no three.js), so it's tested.
   The renderer feeds in the facts; the rig in people.ts draws the result. */

export type Face = 'neutral' | 'happy' | 'annoyed' | 'shocked' | 'sleepy' | 'sideeye' | 'talk';
export type Pose = 'idle' | 'work' | 'cheer' | 'fan' | 'phone' | 'hiss' | 'shock' | 'sit';

export interface MoodIn {
  /** Their relationship with you, 0..100. */
  rel: number;
  /** Holding a grudge against you (memory.ts). */
  grudge: boolean;
  /** Sitting outside on a chair (whereabouts 'outside'). */
  seated: boolean;
  /** Hot and no power: fanning season. */
  hot: boolean;
  /** Seconds since NEPA took light / brought it back, as the renderer saw it (Infinity = not recently). */
  sinceOff: number; sinceOn: number;
  hour: number;
  /** Their panel is open: they're talking to you. */
  talking: boolean;
  /** Stable per person, so idle habits differ between people. */
  seed: number;
  /** Seconds, for the slow rotation of idle habits. */
  t: number;
}
export interface Look3D { face: Face; pose: Pose }

/** Seconds a blackout shock / an "Up NEPA!" cheer lasts. */
export const SHOCK_S = 3.5, CHEER_S = 5;

export function npcLook(m: MoodIn): Look3D {
  const legs = (p: Pose): Pose => (m.seated && (p === 'idle' || p === 'phone') ? 'sit' : p);
  if (m.talking) return { face: m.grudge ? 'sideeye' : 'talk', pose: legs(m.grudge ? 'hiss' : 'idle') };
  if (m.sinceOff < SHOCK_S) return { face: 'shocked', pose: 'shock' };
  if (m.sinceOn < CHEER_S) return { face: 'happy', pose: 'cheer' };
  if (m.grudge) return { face: 'sideeye', pose: legs('hiss') };
  const late = m.hour >= 22 || m.hour < 6;
  if (m.hot) return { face: 'annoyed', pose: legs('fan') };
  const face: Face = late ? 'sleepy' : m.rel >= 65 ? 'happy' : m.rel < 40 ? 'annoyed' : 'neutral';
  // every ~8s some people pick up their phone for a scroll
  const phone = !late && (Math.floor(m.t / 8) + m.seed) % 4 === 0;
  return { face, pose: legs(phone ? 'phone' : 'idle') };
}

/** Your own face: the blackout gets you too; otherwise mood and hunger show. */
export function playerFace(happiness: number, hunger: number, sinceOff: number, sinceOn: number, hour: number): Face {
  if (sinceOff < SHOCK_S) return 'shocked';
  if (sinceOn < CHEER_S) return 'happy';
  if (hour >= 22 || hour < 6) return 'sleepy';
  if (hunger > 80 || happiness < 35) return 'annoyed';
  return happiness >= 65 ? 'happy' : 'neutral';
}
