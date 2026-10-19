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

/* ---------- ambience: soft background beds per place and weather, all synthesised (no audio files) ---------- */

export type Bed = 'rain' | 'storm' | 'market' | 'junction' | 'fuel' | 'campus' | 'church';
interface Playing { out: GainNode; stop: () => void }
const beds = new Map<Bed, Playing>();
let noiseBuf: AudioBuffer | null = null;

function noise(a: AudioContext): AudioBufferSourceNode {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
}
/** A slow wobble on a gain, so beds breathe instead of hissing flat. */
function wobble(a: AudioContext, target: AudioParam, rate: number, depth: number): OscillatorNode {
  const lfo = a.createOscillator(), amt = a.createGain(); lfo.frequency.value = rate; amt.gain.value = depth;
  lfo.connect(amt); amt.connect(target); lfo.start(); return lfo;
}

function makeBed(a: AudioContext, kind: Bed): Playing {
  const out = a.createGain(); out.gain.value = 0; out.connect(a.destination);
  const nodes: AudioScheduledSourceNode[] = [];
  const filtered = (type: BiquadFilterType, freq: number, q: number, level: number, lfoRate = 0, lfoDepth = 0) => {
    const n = noise(a), f = a.createBiquadFilter(), g = a.createGain();
    f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = level;
    n.connect(f); f.connect(g); g.connect(out); n.start(); nodes.push(n);
    if (lfoRate) nodes.push(wobble(a, g.gain, lfoRate, lfoDepth));
  };
  const hum = (freq: number, level: number, type: OscillatorType = 'sawtooth') => {
    const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = freq; g.gain.value = level;
    o.connect(g); g.connect(out); o.start(); nodes.push(o);
  };
  switch (kind) {
    case 'rain': filtered('lowpass', 1400, .5, .5); break;
    case 'storm': filtered('lowpass', 900, .5, .7, .15, .25); break;
    case 'market': filtered('bandpass', 900, 1.2, .5, 2.3, .3); filtered('bandpass', 1700, 2, .25, 3.1, .18); break; // many voices
    case 'junction': filtered('lowpass', 260, .8, .7, .4, .35); hum(38, .08); break; // engines idling, okadas passing
    case 'fuel': hum(52, .25); hum(104, .08, 'square'); break; // the station's big gen
    case 'campus': filtered('bandpass', 1300, 1.5, .2, 1.6, .12); break;
    case 'church': [262, 330, 392].forEach((f) => hum(f, .08, 'sine')); nodes.push(wobble(a, out.gain, .25, .02)); break; // a hymn drifting out
  }
  return { out, stop: () => nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }) };
}

/** Level each bed sits at once faded in. Kept low: this is background, not music. */
const LEVEL: Record<Bed, number> = { rain: .05, storm: .07, market: .05, junction: .05, fuel: .05, campus: .03, church: .04 };

/** Play exactly these beds, fading the rest out. Called whenever place, weather or the sound setting changes. */
export function setAmbience(want: Bed[]): void {
  const a = AC; if (!a) return; // never start audio ourselves: the first tap creates the context
  const on = SET.sound ? new Set(want) : new Set<Bed>(), now = a.currentTime;
  for (const kind of on) {
    if (beds.has(kind)) continue;
    const b = makeBed(a, kind); beds.set(kind, b);
    b.out.gain.setValueAtTime(0, now); b.out.gain.linearRampToValueAtTime(LEVEL[kind], now + 1.2);
  }
  for (const [kind, b] of beds) {
    if (on.has(kind)) continue;
    b.out.gain.cancelScheduledValues(now); b.out.gain.setValueAtTime(b.out.gain.value, now); b.out.gain.linearRampToValueAtTime(0, now + .8);
    setTimeout(b.stop, 900); beds.delete(kind);
  }
}

export function genHum(on: boolean): void {
  const a = ac(); if (!a) return;
  if (on && SET.sound && !genOsc) {
    const o = a.createOscillator(), v = a.createGain();
    o.type = 'sawtooth'; o.frequency.value = 52; v.gain.value = .035; o.connect(v); v.connect(a.destination); o.start(); genOsc = { o, v };
  } else if (!on && genOsc) { try { genOsc.o.stop(); } catch { /* already stopped */ } genOsc = null; }
}
