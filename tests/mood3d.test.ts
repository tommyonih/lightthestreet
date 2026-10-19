/* What people's faces and bodies show in 3D: pure rules from game facts, so they're checked here without WebGL. */
import { describe, expect, it } from 'vitest';
import { CHEER_S, SHOCK_S, npcLook, playerFace, type MoodIn } from '../src/render3d/mood';

const calm: MoodIn = { rel: 50, grudge: false, seated: false, hot: false, sinceOff: Infinity, sinceOn: Infinity, hour: 14, talking: false, seed: 1, t: 0 };
const look = (m: Partial<MoodIn>) => npcLook({ ...calm, ...m });

describe('neighbour expressions and poses', () => {
  it('a blackout makes everyone gasp, then light coming back makes them cheer', () => {
    expect(look({ sinceOff: 1 })).toEqual({ face: 'shocked', pose: 'shock' });
    expect(look({ sinceOff: SHOCK_S + 1 }).face).not.toBe('shocked');
    expect(look({ sinceOn: 1 })).toEqual({ face: 'happy', pose: 'cheer' });
    expect(look({ sinceOn: CHEER_S + 1 }).pose).not.toBe('cheer');
  });

  it('a grudge shows as side-eye with folded arms, even while talking to you', () => {
    expect(look({ grudge: true })).toEqual({ face: 'sideeye', pose: 'hiss' });
    expect(look({ grudge: true, talking: true }).face).toBe('sideeye');
  });

  it('talking moves the mouth', () => {
    expect(look({ talking: true }).face).toBe('talk');
  });

  it('relationship sets the resting face; late nights make people sleepy', () => {
    expect(look({ rel: 80 }).face).toBe('happy');
    expect(look({ rel: 20 }).face).toBe('annoyed');
    expect(look({ rel: 50 }).face).toBe('neutral');
    expect(look({ hour: 23 }).face).toBe('sleepy');
  });

  it('heat with no light means fanning; sitting outside keeps them on their chair', () => {
    expect(look({ hot: true })).toEqual({ face: 'annoyed', pose: 'fan' });
    const seated = [0, 8, 16, 24, 32].map((t) => look({ seated: true, t }).pose);
    expect(seated.every((p) => p === 'sit')).toBe(true); // idle and phone-scrolling both happen sitting down
  });

  it('people pick up their phones now and then, and not all at the same time', () => {
    const at = (seed: number) => [0, 8, 16, 24].map((t) => look({ seed, t }).pose);
    expect(at(0)).toContain('phone');
    expect(at(0).filter((p) => p === 'phone').length).toBe(1);
    expect(at(0)).not.toEqual(at(1));
  });
});

describe('your face', () => {
  it('follows the blackout, the hour, hunger and mood', () => {
    expect(playerFace(70, 20, 1, Infinity, 12)).toBe('shocked');
    expect(playerFace(70, 20, Infinity, 1, 12)).toBe('happy');
    expect(playerFace(70, 20, Infinity, Infinity, 23)).toBe('sleepy');
    expect(playerFace(70, 90, Infinity, Infinity, 12)).toBe('annoyed');
    expect(playerFace(20, 20, Infinity, Infinity, 12)).toBe('annoyed');
    expect(playerFace(50, 20, Infinity, Infinity, 12)).toBe('neutral');
  });
});
