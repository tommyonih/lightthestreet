import { SET } from './state';

let AC: AudioContext | null = null;
let genOsc: { o: OscillatorNode; v: GainNode } | null = null;

export function ac(): AudioContext | null {
  if (!AC) {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      AC = new Ctor();
    } catch { /* no audio */ }
  }
  return AC;
}

export function tone(f: number, d: number, type: OscillatorType = 'sine', g = .12, when = 0): void {
  if (!SET.sound) return; const a = ac(); if (!a) return;
  const o = a.createOscillator(), v = a.createGain(); o.type = type; o.frequency.value = f;
  v.gain.setValueAtTime(g, a.currentTime + when); v.gain.exponentialRampToValueAtTime(.001, a.currentTime + when + d);
  o.connect(v); v.connect(a.destination); o.start(a.currentTime + when); o.stop(a.currentTime + when + d + .02);
}

export const sfx = {
  off() { tone(320, .18, 'sawtooth', .10); tone(200, .3, 'sawtooth', .10, .14); },
  on() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .14, 'triangle', .11, i * .09)); },
  alarm() { for (let i = 0; i < 3; i++) tone(880, .12, 'square', .07, i * .25); },
  knock() { tone(150, .1, 'square', .15); tone(150, .1, 'square', .15, .2); },
  cash() { tone(990, .08, 'sine', .1); tone(1320, .12, 'sine', .1, .08); },
  bad() { tone(220, .25, 'sawtooth', .09); tone(160, .35, 'sawtooth', .09, .18); },
  genStart() { tone(90, .4, 'sawtooth', .12); tone(140, .5, 'sawtooth', .10, .3); },
  cheer() { [660, 660, 880, 880, 1047].forEach((f, i) => tone(f, .12, 'triangle', .09, i * .11)); },
};

export function genHum(on: boolean): void {
  const a = ac(); if (!a) return;
  if (on && SET.sound && !genOsc) {
    const o = a.createOscillator(), v = a.createGain();
    o.type = 'sawtooth'; o.frequency.value = 52; v.gain.value = .035; o.connect(v); v.connect(a.destination); o.start(); genOsc = { o, v };
  } else if (!on && genOsc) { try { genOsc.o.stop(); } catch { /* already stopped */ } genOsc = null; }
}
