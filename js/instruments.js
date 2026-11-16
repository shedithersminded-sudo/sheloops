// More instruments + percussion, all synthesized (no samples, no downloads).
import { ksBuffer } from './engine.js';

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const noiseCache = new WeakMap();
function noiseBuf(c) {
  let b = noiseCache.get(c);
  if (!b) { b = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noiseCache.set(c, b); }
  return b;
}
// one decaying sine (or other wave) partial
function part(c, out, f, t, amp, dec, type = 'sine', a = 0.004) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(amp, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + a + dec + 0.05);
  return o;
}
function noise(c, out, t, amp, dec, type, freq, q = 1, a = 0.002) {
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf(c); f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(amp, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + a + dec + 0.05);
}
// sustained voice with attack/release that follows the note length
function held(c, out, t, dur, a, r, peak) {
  const g = c.createGain(), end = t + Math.max(dur, a + 0.02);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, end); g.gain.exponentialRampToValueAtTime(0.0001, end + r);
  g.connect(out); return { g, stop: end + r + 0.05, end };
}
const lfo = (c, rate, depth, target, t, stop) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(target); o.start(t); o.stop(stop); };
const drive = (() => { const k = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 256 - 1; k[i] = Math.tanh(x * 6) * 0.9; } return k; })();
const buzz = (() => { const k = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 256 - 1; k[i] = Math.sign(x) * Math.pow(Math.abs(x), 0.6); } return k; })();

// ---------- guitars (Karplus-Strong string + body/amp shaping) ----------
const GUITARS = {
  guitar:     { lp: 5000, hp: 80, dec: 1, gain: 0.5 },          // acoustic steel
  'gtr-nylon':{ lp: 2400, hp: 70, dec: 1, gain: 0.55 },
  'gtr-clean':{ lp: 4200, hp: 90, dec: 1.4, gain: 0.45, chorus: true },
  'gtr-drive':{ lp: 3200, hp: 120, dec: 1.6, gain: 0.32, drive: true },
  'gtr-muted':{ lp: 1300, hp: 90, dec: 0.13, gain: 0.7 },
  'gtr-12':   { lp: 5500, hp: 90, dec: 1.1, gain: 0.38, twelve: true },
  'gtr-bass': { lp: 1400, hp: 30, dec: 1.4, gain: 0.7 },
  banjo:      { lp: 7000, hp: 350, dec: 0.45, gain: 0.5 },
  harp:       { lp: 2600, hp: 60, dec: 2.2, gain: 0.5 },
  koto:       { lp: 6000, hp: 150, dec: 0.9, gain: 0.5, bend: 0.03 },
  sitar:      { lp: 5000, hp: 200, dec: 1.6, gain: 0.35, sitar: true, bend: 0.02 },
};
export function playString(c, dest, syn, midi, t, dur, vel) {
  const G = GUITARS[syn.engine] || GUITARS.guitar;
  const end = t + Math.max(dur, 0.04), ring = Math.min(2.4, end - t + G.dec * 0.6);
  const out = c.createGain(), hp = c.createBiquadFilter(), lp = c.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = G.hp; lp.type = 'lowpass'; lp.frequency.value = Math.min(G.lp, syn.cutoff || G.lp);
  let head = hp; hp.connect(lp);
  let tail = lp;
  if (G.drive) { const sh = c.createWaveShaper(); sh.curve = drive; sh.oversample = '4x'; const pre = c.createGain(); pre.gain.value = 4; lp.connect(pre); pre.connect(sh); const cab = c.createBiquadFilter(); cab.type = 'lowpass'; cab.frequency.value = 3000; sh.connect(cab); tail = cab; }
  if (G.sitar) { const sh = c.createWaveShaper(); sh.curve = buzz; const bp = c.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 2500; bp.gain.value = 9; bp.Q.value = 2; tail.connect(sh); sh.connect(bp); tail = bp; }
  tail.connect(out); out.connect(dest);
  out.gain.setValueAtTime(vel * G.gain, t); out.gain.setTargetAtTime(0, Math.min(end + 0.02, t + ring), Math.max(0.03, (syn.release || 0.2) / 4));
  const strings = G.twelve ? [[midi, 1, 0], [midi + 12, 0.5, 4]] : [[midi, 1, 0]];
  for (const [m, amp, cents] of strings) {
    const { b, rate } = ksBuffer(c, Math.min(108, m));
    const s = c.createBufferSource(), sg = c.createGain(); s.buffer = b; s.playbackRate.value = rate * Math.pow(2, cents / 1200);
    if (G.bend) { s.playbackRate.setValueAtTime(rate * (1 - G.bend), t); s.playbackRate.linearRampToValueAtTime(rate, t + 0.08); }
    sg.gain.value = amp; s.connect(sg); sg.connect(head); s.start(t); s.stop(Math.min(t + 2.5, t + ring + 0.3));
  }
  if (G.sitar) { // sympathetic drone shimmer
    const { b, rate } = ksBuffer(c, midi + 7), s = c.createBufferSource(), sg = c.createGain(); s.buffer = b; s.playbackRate.value = rate; sg.gain.value = 0.15; s.connect(sg); sg.connect(head); s.start(t + 0.02); s.stop(t + 2.4);
  }
}

// ---------- other instruments ----------
export const EXTRA_ENGINES = new Set(['kalimba', 'marimba', 'vibes', 'bells', 'musicbox', 'steeldrum', 'panflute', 'talkdrum', 'flute', 'choir', 'brass', 'organ', 'epiano', 'bass808', 'reese', 'theremin']);
export function playExtra(c, dest, syn, midi, t, dur, vel) {
  const f = mtof(midi), out = c.createGain(), lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = Math.min(18000, syn.cutoff || 12000); lp.connect(out); out.connect(dest);
  const v = vel;
  switch (syn.engine) {
    case 'kalimba': out.gain.value = v * 0.5; part(c, lp, f, t, 1, 1.4); part(c, lp, f * 5.4, t, 0.18, 0.12); part(c, lp, f * 2.01, t, 0.08, 0.3); noise(c, lp, t, 0.05, 0.015, 'bandpass', 3000, 2); break;
    case 'marimba': out.gain.value = v * 0.55; part(c, lp, f, t, 1, 0.55); part(c, lp, f * 4, t, 0.35, 0.09); part(c, lp, f * 9.9, t, 0.1, 0.03); break;
    case 'vibes': {
      out.gain.value = v * 0.4; const trem = c.createGain(); trem.gain.value = 0.75; trem.connect(lp); lfo(c, 5.5, 0.25, trem.gain, t, t + 3);
      part(c, trem, f, t, 1, Math.max(1.8, dur * 1.5)); part(c, trem, f * 4, t, 0.15, 0.6); break;
    }
    case 'bells': { // FM bell / glockenspiel
      out.gain.value = v * 0.35; const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
      car.frequency.value = f * 2; mod.frequency.value = f * 2 * 3.5; mg.gain.setValueAtTime(f * 6, t); mg.gain.exponentialRampToValueAtTime(1, t + 1.5);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(lp); car.start(t); mod.start(t); car.stop(t + 2.3); mod.stop(t + 2.3); break;
    }
    case 'musicbox': out.gain.value = v * 0.4; part(c, lp, f * 2, t, 1, 1.1); part(c, lp, f * 4.8, t, 0.25, 0.25); part(c, lp, f * 11.8, t, 0.08, 0.08); break;
    case 'steeldrum': {
      out.gain.value = v * 0.38;
      for (const [r, a, d] of [[1, 1, 0.9], [2, 0.55, 0.7], [3, 0.25, 0.45], [4.2, 0.18, 0.3]]) { const o = part(c, lp, f * r * 1.015, t, a, d); o.frequency.setValueAtTime(f * r * 1.015, t); o.frequency.exponentialRampToValueAtTime(f * r, t + 0.04); }
      break;
    }
    case 'panflute': case 'flute': {
      const pan = syn.engine === 'panflute', h = held(c, lp, t, dur, pan ? 0.03 : 0.07, 0.15, v * 0.35);
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(h.g); lfo(c, 5, f * 0.008, o.frequency, t + 0.2, h.stop); o.start(t); o.stop(h.stop);
      const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2; const g2 = c.createGain(); g2.gain.value = 0.08; o2.connect(g2); g2.connect(h.g); o2.start(t); o2.stop(h.stop);
      noise(c, lp, t, v * (pan ? 0.25 : 0.12), Math.min(0.5, dur + 0.1), 'bandpass', f * 2, 3, 0.03); out.gain.value = 1; break;
    }
    case 'talkdrum': out.gain.value = v * 0.7; { const o = part(c, lp, f * 1.5, t, 1, 0.45); o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.18); } noise(c, lp, t, 0.2, 0.03, 'bandpass', 1800, 1.5); break;
    case 'choir': {
      out.gain.value = 1; const h = held(c, out, t, dur, 0.3, 0.6, v * 0.16);
      const mix = c.createGain(); mix.gain.value = 1;
      for (const [fr, q, a] of [[730, 8, 1], [1090, 10, 0.5], [2440, 12, 0.25]]) { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = q; const g = c.createGain(); g.gain.value = a * 6; mix.connect(bp); bp.connect(g); g.connect(h.g); }
      for (const d of [-9, 0, 8]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(mix); lfo(c, 4.5 + d * 0.05, 4, o.detune, t, h.stop); o.start(t); o.stop(h.stop); }
      break;
    }
    case 'brass': {
      out.gain.value = 1; const h = held(c, out, t, dur, 0.05, 0.15, v * 0.22), bl = c.createBiquadFilter(); bl.type = 'lowpass'; bl.Q.value = 2;
      bl.frequency.setValueAtTime(300, t); bl.frequency.exponentialRampToValueAtTime(3200, t + 0.08); bl.frequency.exponentialRampToValueAtTime(1800, t + 0.4); bl.connect(h.g);
      for (const d of [-6, 6]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.97, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06); o.detune.value = d; o.connect(bl); o.start(t); o.stop(h.stop); }
      break;
    }
    case 'organ': {
      out.gain.value = 1; const h = held(c, lp, t, dur, 0.01, 0.08, v * 0.12), rot = c.createGain(); rot.gain.value = 0.8; rot.connect(h.g); lfo(c, 6.2, 0.2, rot.gain, t, h.stop);
      for (const [r, a] of [[0.5, 0.6], [1, 1], [2, 0.7], [3, 0.45], [4, 0.35], [6, 0.18], [8, 0.15]]) { const o = c.createOscillator(); o.frequency.value = f * r; const g = c.createGain(); g.gain.value = a; o.connect(g); g.connect(rot); o.start(t); o.stop(h.stop); }
      break;
    }
    case 'epiano': { // FM electric piano with tremolo
      out.gain.value = 1; const h = held(c, lp, t, dur, 0.004, 0.4, v * 0.4), trem = c.createGain(); trem.gain.value = 0.85; trem.connect(h.g); lfo(c, 4.8, 0.15, trem.gain, t, h.stop);
      const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), dg = c.createGain();
      car.frequency.value = f; mod.frequency.value = f; mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.9);
      dg.gain.setValueAtTime(1, t); dg.gain.setTargetAtTime(0.25, t + 0.05, 0.9);
      mod.connect(mg); mg.connect(car.frequency); car.connect(dg); dg.connect(trem); car.start(t); mod.start(t); car.stop(h.stop); mod.stop(h.stop);
      part(c, trem, f * 14, t, 0.05, 0.05); break;
    }
    case 'bass808': {
      out.gain.value = v * 0.85; const sh = c.createWaveShaper(); sh.curve = drive; const g = c.createGain(), end = t + Math.max(dur, 0.3);
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9, t + 0.005); g.gain.setTargetAtTime(0.0001, end, 0.12); g.gain.exponentialRampToValueAtTime(0.3, t + 1.2);
      o.connect(sh); sh.connect(g); g.connect(lp); o.start(t); o.stop(end + 0.6); break;
    }
    case 'reese': {
      out.gain.value = 1; const h = held(c, out, t, dur, 0.02, 0.2, v * 0.25), bl = c.createBiquadFilter(); bl.type = 'lowpass'; bl.frequency.value = 700; bl.Q.value = 3; bl.connect(h.g);
      lfo(c, 0.35, 350, bl.frequency, t, h.stop);
      for (const d of [-16, 16]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(bl); o.start(t); o.stop(h.stop); }
      const sub = c.createOscillator(); sub.frequency.value = f / 2; const sg = c.createGain(); sg.gain.value = 0.6; sub.connect(sg); sg.connect(h.g); sub.start(t); sub.stop(h.stop); break;
    }
    case 'theremin': {
      out.gain.value = 1; const h = held(c, lp, t, dur, 0.12, 0.3, v * 0.3), o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.12); lfo(c, 6, f * 0.015, o.frequency, t + 0.15, h.stop);
      o.connect(h.g); o.start(t); o.stop(h.stop); break;
    }
  }
}

// ---------- percussion ----------
export const PERC = ['conga', 'bongo', 'shaker', 'cowbell', 'tambourine', 'triangle', 'woodblock', 'snap', 'timbale', 'guiro'];
export const PERC_NAMES = { conga: 'Conga', bongo: 'Bongo', shaker: 'Shaker', cowbell: 'Cowbell', tambourine: 'Tambourine', triangle: 'Triangle', woodblock: 'Woodblock', snap: 'Finger snap', timbale: 'Timbale', guiro: 'Guiro' };
export function playPerc(c, dest, sound, t, vel) {
  const out = c.createGain(); out.gain.value = vel; out.connect(dest);
  const drop = (f0, f1, amp, dec, type = 'sine') => { const o = part(c, out, f0, t, amp, dec, type, 0.002); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dec * 0.4); };
  switch (sound) {
    case 'conga': drop(240, 190, 0.8, 0.28); noise(c, out, t, 0.15, 0.02, 'bandpass', 1500, 2); break;
    case 'bongo': drop(420, 360, 0.7, 0.16); noise(c, out, t, 0.12, 0.015, 'bandpass', 2500, 2); break;
    case 'shaker': noise(c, out, t, 0.35, 0.07, 'highpass', 6500, 0.7, 0.025); break;
    case 'cowbell': { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 1.5; bp.connect(out); part(c, bp, 545, t, 0.6, 0.35, 'square'); part(c, bp, 815, t, 0.4, 0.3, 'square'); break; }
    case 'tambourine': for (const o of [0, 0.012, 0.025]) noise(c, out, t + o, 0.3, 0.12, 'highpass', 7500, 1); part(c, out, 6200, t, 0.05, 0.2); break;
    case 'triangle': part(c, out, 3150, t, 0.25, 1.4); part(c, out, 4700, t, 0.12, 0.9); part(c, out, 7300, t, 0.06, 0.5); break;
    case 'woodblock': drop(1100, 950, 0.6, 0.06); noise(c, out, t, 0.1, 0.01, 'bandpass', 2000, 4); break;
    case 'snap': for (const o of [0, 0.008]) noise(c, out, t + o, 1.2, 0.035, 'bandpass', 2200, 2.5); break;
    case 'timbale': drop(520, 470, 0.6, 0.35); noise(c, out, t, 0.25, 0.25, 'bandpass', 4000, 3); break;
    case 'guiro': for (let i = 0; i < 9; i++) noise(c, out, t + i * 0.022, 1.1, 0.012, 'bandpass', 3500, 3); break;
  }
}
