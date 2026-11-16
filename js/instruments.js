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
  ukulele:    { lp: 4200, hp: 220, dec: 0.5, gain: 0.55 },
  mandolin:   { lp: 6500, hp: 250, dec: 0.55, gain: 0.4, pair: [0, 0.9, 7], pick: 0.25 },
  shamisen:   { lp: 7000, hp: 300, dec: 0.5, gain: 0.4, sitar: true, bend: 0.012, pick: 0.6 },
  biwa:       { lp: 3800, hp: 130, dec: 1.1, gain: 0.42, sitar: true, bend: 0.035, pick: 0.4 },
  sanshin:    { lp: 3600, hp: 160, dec: 0.75, gain: 0.5, pick: 0.2 },
  harpsichord:{ lp: 9000, hp: 280, dec: 1.2, gain: 0.32, pair: [12, 0.45, 3], pick: 0.3 },
  dulcimer:   { lp: 7000, hp: 160, dec: 2, gain: 0.36, pair: [0, 1, 6], mallet: true },
  'laser-harp': { lp: 9000, hp: 200, dec: 2, gain: 0.3, drive: true, pair: [12, 0.35, 0] },
};
export const isString = eng => !!GUITARS[eng];
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
  const strings = G.twelve ? [[midi, 1, 0], [midi + 12, 0.5, 4]] : G.pair ? [[midi, 1, 0], [midi + G.pair[0], G.pair[1], G.pair[2]]] : [[midi, 1, 0]];
  if (G.pick) noise(c, head, t, G.pick * 0.6, 0.012, 'highpass', 2500, 0.7, 0.001);
  if (G.mallet) part(c, out, mtof(midi) * 2, t, 0.25, 0.08);
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

// ---------- held instruments from a recipe (bowed, reeds, brass, breath, drones) ----------
// osc: [wave, ratio, cents, amp]. form: [freq, q, gain] body/vowel filters. vib: [rate, cents, delay].
// scoop: start this many semitones low and slide up. wah: [rate, low Hz, high Hz] moving filter. breath: noise amount.
const W = (w, r = 1, d = 0, a = 1) => [w, r, d, a];
const HELD = {
  violin:    { osc: [W('sawtooth', 1, -4), W('sawtooth', 1, 5, 0.7)], lp: 6000, form: [[450, 3, 6], [1600, 4, 4], [3000, 5, 3]], vib: [5.8, 18, 0.25], att: 0.08, rel: 0.25, gain: 0.208, breath: 0.03 },
  cello:     { osc: [W('sawtooth', 1, -3), W('sawtooth', 1, 4, 0.6)], lp: 3200, form: [[250, 3, 6], [800, 4, 4], [2000, 5, 2]], vib: [5, 14, 0.3], att: 0.12, rel: 0.3, gain: 0.1, breath: 0.03 },
  strings:   { osc: [W('sawtooth', 1, -12), W('sawtooth', 1, 0), W('sawtooth', 1, 11), W('sawtooth', 0.5, 6, 0.4)], lp: 4500, vib: [5, 8, 0.4], att: 0.35, rel: 0.6, gain: 0.07 },
  kokyu:     { osc: [W('sawtooth', 1, 0), W('triangle', 2, 3, 0.4)], lp: 4500, form: [[700, 4, 6], [2200, 5, 4]], vib: [6.5, 30, 0.15], scoop: 0.6, att: 0.1, rel: 0.25, gain: 0.304, breath: 0.05 },
  erhu:      { osc: [W('sawtooth', 1, 0), W('sawtooth', 1, 6, 0.4)], lp: 5000, form: [[900, 5, 7], [2600, 6, 4]], vib: [6, 35, 0.12], scoop: 0.8, att: 0.06, rel: 0.25, gain: 0.304, breath: 0.04 },
  sax:       { osc: [W('sawtooth', 1, 0), W('square', 1, 4, 0.3)], lp: 3500, q: 2, form: [[600, 3, 5], [1400, 4, 4]], vib: [5, 12, 0.35], scoop: 0.5, att: 0.04, rel: 0.12, gain: 0.26, breath: 0.08 },
  clarinet:  { osc: [W('square', 1, 0), W('square', 1, 5, 0.3)], lp: 2600, vib: [5, 6, 0.4], att: 0.05, rel: 0.1, gain: 0.24, breath: 0.04 },
  oboe:      { osc: [W('sawtooth', 1, 0)], lp: 5000, form: [[1200, 6, 9], [2800, 6, 5]], vib: [5.5, 10, 0.3], att: 0.04, rel: 0.1, gain: 0.315, breath: 0.03 },
  trumpet:   { osc: [W('sawtooth', 1, -4), W('sawtooth', 1, 4)], lp: 4200, lpFrom: 400, q: 2, vib: [5.5, 8, 0.3], scoop: 0.4, att: 0.03, rel: 0.1, gain: 0.1 },
  trombone:  { osc: [W('sawtooth', 1, -5), W('sawtooth', 1, 5)], lp: 2200, lpFrom: 250, q: 2, vib: [5, 8, 0.35], scoop: 2, scoopT: 0.15, att: 0.05, rel: 0.15, gain: 0.12 },
  accordion: { osc: [W('sawtooth', 1, -11), W('sawtooth', 1, 11), W('square', 0.5, 0, 0.4)], lp: 3500, form: [[1000, 2, 4]], trem: [6, 0.1], att: 0.03, rel: 0.1, gain: 0.156 },
  harmonica: { osc: [W('square', 1, -6), W('square', 1, 7)], lp: 3000, form: [[1500, 3, 6]], vib: [6, 25, 0.1], att: 0.02, rel: 0.1, gain: 0.156, breath: 0.06 },
  melodica:  { osc: [W('square', 1, -4), W('sawtooth', 1, 4, 0.5)], lp: 2800, att: 0.02, rel: 0.08, gain: 0.21, breath: 0.03 },
  sho:       { osc: [W('sawtooth', 1, 0), W('sawtooth', 1.5, 2, 0.8), W('sawtooth', 2, -2, 0.7), W('sawtooth', 2.25, 3, 0.5), W('sawtooth', 3, 0, 0.3)], lp: 4000, form: [[1800, 3, 3]], att: 0.6, rel: 0.8, gain: 0.2, trem: [0.4, 0.05] },
  shakuhachi:{ osc: [W('sine', 1, 0), W('triangle', 2, 0, 0.12)], lp: 6000, vib: [4.5, 25, 0.35], scoop: 1, scoopT: 0.2, att: 0.12, rel: 0.3, gain: 0.32, breath: 0.35 },
  shinobue:  { osc: [W('sine', 1, 0), W('sine', 2, 0, 0.18)], lp: 9000, vib: [6, 20, 0.2], scoop: 0.3, att: 0.04, rel: 0.12, gain: 0.3, breath: 0.2 },
  ryuteki:   { osc: [W('sine', 1, 0), W('triangle', 3, 0, 0.1)], lp: 8000, vib: [5, 30, 0.25], scoop: 0.6, att: 0.06, rel: 0.2, gain: 0.3, breath: 0.25 },
  ocarina:   { osc: [W('sine', 1, 0), W('sine', 2, 0, 0.05)], lp: 6000, vib: [5, 10, 0.3], att: 0.04, rel: 0.12, gain: 0.35, breath: 0.08 },
  didgeridoo:{ osc: [W('sawtooth', 0.5, 0), W('sawtooth', 0.5, 6, 0.6)], lp: 900, q: 6, wah: [1.6, 300, 1100], att: 0.1, rel: 0.3, gain: 0.25, breath: 0.05 },
  'jaw-harp':{ osc: [W('square', 0.5, 0)], lp: 1200, q: 14, wah: [3, 500, 2600], att: 0.005, rel: 0.2, gain: 0.12, decay: 1.2 },
  stylophone:{ osc: [W('square', 1, 0)], lp: 5000, att: 0.003, rel: 0.02, gain: 0.266 },
  'glass-harmonica': { osc: [W('sine', 1, 0), W('sine', 2, 3, 0.3), W('sine', 3, -2, 0.08)], lp: 9000, trem: [4, 0.15], att: 0.3, rel: 0.8, gain: 0.28 },
};
function playHeld(c, out, R, midi, t, dur, v) {
  const f = mtof(midi), h = held(c, out, t, R.decay ? Math.min(dur, R.decay) : dur, R.att, R.rel, v * R.gain);
  let head = h.g;
  if (R.trem) { const tg = c.createGain(); tg.gain.value = 1 - R.trem[1]; tg.connect(head); lfo(c, R.trem[0], R.trem[1], tg.gain, t, h.stop); head = tg; }
  const lpf = c.createBiquadFilter(); lpf.type = 'lowpass'; lpf.Q.value = R.q || 0.7;
  if (R.form) { // body / vowel resonances on top of the plain tone
    const dry = c.createGain(); dry.gain.value = 0.4; lpf.connect(dry); dry.connect(head);
    for (const [fr, q, g] of R.form) { const bp = c.createBiquadFilter(), gg = c.createGain(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = q; gg.gain.value = g * 0.2; lpf.connect(bp); bp.connect(gg); gg.connect(head); }
  } else lpf.connect(head);
  lpf.frequency.setValueAtTime(R.lpFrom || R.lp, t); if (R.lpFrom) lpf.frequency.exponentialRampToValueAtTime(R.lp, t + 0.08);
  if (R.wah) { lpf.frequency.value = (R.wah[1] + R.wah[2]) / 2; lfo(c, R.wah[0], (R.wah[2] - R.wah[1]) / 2, lpf.frequency, t, h.stop); }
  for (const [w, r, d, a] of R.osc) {
    const o = c.createOscillator(), g = c.createGain(); o.type = w; o.detune.value = d; g.gain.value = a;
    const fr = f * r;
    if (R.scoop) { o.frequency.setValueAtTime(fr * Math.pow(2, -R.scoop / 12), t); o.frequency.exponentialRampToValueAtTime(fr, t + (R.scoopT || 0.07)); } else o.frequency.value = fr;
    if (R.vib) lfo(c, R.vib[0], R.vib[1], o.detune, t + R.vib[2], h.stop);
    o.connect(g); g.connect(lpf); o.start(t); o.stop(h.stop);
  }
  if (R.breath) noise(c, head, t, v * R.breath, Math.max(0.05, Math.min(1.5, dur)), 'bandpass', Math.min(8000, f * 2), 1.2, 0.03);
}

// ---------- struck instruments from a recipe ----------
// parts: [ratio, amp, decay seconds]
const STRUCK = {
  handpan:  { parts: [[1, 1, 2.2], [2, 0.45, 1.4], [3, 0.2, 0.9], [4.1, 0.08, 0.4]], att: 0.01, gain: 0.4, thump: 0.15 },
  celesta:  { parts: [[2, 1, 1.2], [4, 0.3, 0.4], [8.1, 0.06, 0.1]], att: 0.002, gain: 0.35 },
  xylophone:{ parts: [[1, 1, 0.3], [3, 0.4, 0.08], [6.3, 0.15, 0.03]], att: 0.001, gain: 0.55 },
  'tubular-bells': { parts: [[1, 0.6, 3], [2.76, 0.4, 2.2], [5.4, 0.3, 1.4], [8.9, 0.15, 0.7]], att: 0.002, gain: 0.3 },
  'gamelan': { parts: [[1, 1, 2.5], [2.01, 0.5, 1.8], [2.97, 0.3, 1.2], [4.8, 0.15, 0.5]], att: 0.002, gain: 0.32, beat: 3 },
};
function playStruck(c, into, level, R, midi, t, v) {
  const f = mtof(midi); level.gain.value = v * R.gain;
  for (const [r, a, d] of R.parts) { part(c, into, f * r, t, a, d, 'sine', R.att); if (R.beat) part(c, into, f * r + R.beat, t, a * 0.6, d, 'sine', R.att); }
  if (R.thump) noise(c, into, t, R.thump, 0.05, 'lowpass', 400, 1);
}

// ---------- other instruments ----------
export const EXTRA_ENGINES = new Set(['kalimba', 'marimba', 'vibes', 'bells', 'musicbox', 'steeldrum', 'panflute', 'talkdrum', 'flute', 'choir', 'brass', 'organ', 'epiano', 'bass808', 'reese', 'theremin', ...Object.keys(HELD), ...Object.keys(STRUCK)]);
export function playExtra(c, dest, syn, midi, t, dur, vel) {
  const f = mtof(midi), out = c.createGain(), lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = Math.min(18000, syn.cutoff || 12000); lp.connect(out); out.connect(dest);
  const v = vel;
  if (HELD[syn.engine]) { out.gain.value = 1; return playHeld(c, lp, HELD[syn.engine], midi, t, dur, v); }
  if (STRUCK[syn.engine]) return playStruck(c, lp, out, STRUCK[syn.engine], midi, t, v);
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
export const PERC_NAMES = { conga: 'Conga', bongo: 'Bongo', shaker: 'Shaker', cowbell: 'Cowbell', tambourine: 'Tambourine', triangle: 'Triangle', woodblock: 'Woodblock', snap: 'Finger snap', timbale: 'Timbale', guiro: 'Guiro',
  claves: 'Claves', agogo: 'Agogo bell', castanets: 'Castanets', cabasa: 'Cabasa', vibraslap: 'Vibraslap', djembe: 'Djembe', djembeslap: 'Djembe slap', tabla: 'Tabla', tablabayan: 'Tabla bass', cajon: 'Cajon', cajonslap: 'Cajon slap', gong: 'Gong', timpani: 'Timpani', crash: 'Crash cymbal', ride: 'Ride cymbal', chime: 'Wind chimes',
  taiko: 'Taiko', odaiko: 'O-daiko', shime: 'Shime-daiko', tsuzumi: 'Tsuzumi', mokugyo: 'Mokugyo', suzu: 'Kagura suzu', hyoshigi: 'Hyoshigi clap', rin: 'Rin bowl', laser: 'Laser zap', vinyl: 'Vinyl scratch', riser: 'Riser', glitch: 'Glitch',
  breaksnare: 'Break snare', ghost: 'Ghost snare', airhorn: 'Air horn', siren: 'Dub siren', rewind: 'Rewind' };
export const PERC = Object.keys(PERC_NAMES);
export const PERC_KITS = {
  'Latin': ['conga', 'bongo', 'timbale', 'cowbell', 'claves', 'agogo', 'guiro', 'shaker', 'cabasa', 'vibraslap'],
  'Japanese': ['odaiko', 'taiko', 'shime', 'tsuzumi', 'mokugyo', 'hyoshigi', 'suzu', 'rin'],
  'World': ['djembe', 'djembeslap', 'tabla', 'tablabayan', 'cajon', 'cajonslap', 'tambourine', 'castanets'],
  'Orchestra': ['timpani', 'crash', 'ride', 'gong', 'triangle', 'chime', 'snap', 'woodblock'],
  'FX': ['laser', 'vinyl', 'riser', 'glitch', 'snap', 'chime'],
  'Jungle': ['breaksnare', 'ghost', 'ride', 'crash', 'airhorn', 'siren', 'rewind', 'vinyl'],
};
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
    case 'claves': part(c, out, 2500, t, 0.7, 0.07); part(c, out, 3700, t, 0.2, 0.04); break;
    case 'agogo': for (const [f, a] of [[920, 0.5], [1380, 0.25], [2600, 0.1]]) part(c, out, f, t, a, 0.35); break;
    case 'castanets': for (const o of [0, 0.018]) { noise(c, out, t + o, 0.7, 0.02, 'bandpass', 3000, 3); part(c, out, 1800, t + o, 0.2, 0.025); } break;
    case 'cabasa': noise(c, out, t, 0.5, 0.06, 'highpass', 8000, 1, 0.01); break;
    case 'vibraslap': for (let i = 0; i < 14; i++) noise(c, out, t + i * 0.035, 1.6 * (1 - i / 14), 0.02, 'bandpass', 2800, 6); break;
    case 'djembe': drop(150, 95, 0.9, 0.35); noise(c, out, t, 0.15, 0.03, 'lowpass', 900, 1); break;
    case 'djembeslap': drop(500, 420, 0.4, 0.08); noise(c, out, t, 0.6, 0.05, 'bandpass', 2400, 1.5); break;
    case 'tabla': for (const [r, a] of [[1, 0.6], [2, 0.3], [3, 0.2], [4, 0.1]]) part(c, out, 420 * r, t, a, 0.4 / r + 0.1); noise(c, out, t, 0.15, 0.01, 'bandpass', 3000, 2); break;
    case 'tablabayan': { const o = part(c, out, 90, t, 1, 0.6); o.frequency.setValueAtTime(90, t); o.frequency.linearRampToValueAtTime(130, t + 0.15); o.frequency.linearRampToValueAtTime(110, t + 0.5); break; }
    case 'cajon': drop(110, 70, 1, 0.18); noise(c, out, t, 0.25, 0.04, 'lowpass', 1200, 1); break;
    case 'cajonslap': drop(300, 250, 0.3, 0.05); for (const o of [0, 0.004, 0.009]) noise(c, out, t + o, 0.5, 0.08, 'bandpass', 3500, 1.2); break;
    case 'gong': for (const [f, a, d] of [[110, 0.36, 3], [178, 0.24, 2.6], [263, 0.18, 2.2], [391, 0.12, 1.8], [587, 0.09, 1.3], [870, 0.05, 1]]) part(c, out, f, t + 0.01, a, d, 'sine', 0.05); noise(c, out, t, 0.08, 1.5, 'bandpass', 900, 0.8, 0.1); break;
    case 'timpani': drop(105, 98, 1, 1.2); noise(c, out, t, 0.2, 0.05, 'lowpass', 600, 1); break;
    case 'crash': noise(c, out, t, 0.6, 1.6, 'highpass', 4500, 0.6, 0.003); noise(c, out, t, 0.2, 0.9, 'bandpass', 7000, 2); break;
    case 'ride': noise(c, out, t, 0.25, 1.1, 'highpass', 7000, 0.6); part(c, out, 3200, t, 0.18, 1.2); part(c, out, 4900, t, 0.08, 0.8); break;
    case 'chime': for (let i = 0; i < 9; i++) part(c, out, [2093, 2349, 2637, 3136, 3520][i % 5] * (1 + (i % 3) * 0.5), t + i * 0.055 + Math.random() * 0.02, 0.14, 0.9); break;
    case 'taiko': drop(95, 62, 1, 0.75); noise(c, out, t, 0.35, 0.05, 'lowpass', 1500, 1); break;
    case 'odaiko': drop(62, 40, 0.8, 1.8); noise(c, out, t, 0.4, 0.12, 'lowpass', 700, 1, 0.005); break;
    case 'shime': drop(380, 340, 0.6, 0.12); noise(c, out, t, 0.6, 0.03, 'bandpass', 3200, 2); break;
    case 'tsuzumi': { const o = part(c, out, 220, t, 0.9, 0.45); o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(320, t + 0.06); o.frequency.exponentialRampToValueAtTime(290, t + 0.3); noise(c, out, t, 0.3, 0.02, 'bandpass', 2000, 2); break; }
    case 'mokugyo': drop(640, 600, 0.8, 0.1); part(c, out, 1310, t, 0.15, 0.05); break;
    case 'suzu': for (let i = 0; i < 6; i++) { const tt = t + i * 0.03 + Math.random() * 0.01; for (const f of [4200, 5900, 7600]) part(c, out, f * (1 + Math.random() * 0.03), tt, 0.09, 0.3); } break;
    case 'hyoshigi': part(c, out, 1900, t, 0.8, 0.09); part(c, out, 3400, t, 0.3, 0.05); noise(c, out, t, 0.4, 0.015, 'bandpass', 2500, 3); break;
    case 'rin': for (const [f, a, d] of [[880, 0.3, 4], [2400, 0.18, 2.5], [4600, 0.07, 1.2]]) { part(c, out, f, t, a, d); part(c, out, f + 2.5, t, a * 0.7, d); } break;
    case 'laser': { const o = part(c, out, 3000, t, 0.4, 0.25, 'sawtooth'); o.frequency.setValueAtTime(3000, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.25); break; }
    case 'vinyl': { const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(); s.buffer = noiseBuf(c); bp.type = 'bandpass'; bp.Q.value = 4; bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(2500, t + 0.09); bp.frequency.exponentialRampToValueAtTime(300, t + 0.22); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(3.5, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); s.connect(bp); bp.connect(g); g.connect(out); s.start(t); s.stop(t + 0.3); break; }
    case 'riser': { const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(); s.buffer = noiseBuf(c); s.loop = true; bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(9000, t + 1.8); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 1.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9); s.connect(bp); bp.connect(g); g.connect(out); s.start(t); s.stop(t + 2); break; }
    case 'breaksnare': noise(c, out, t, 0.75, 0.13, 'bandpass', 2600, 0.8); noise(c, out, t, 0.35, 0.05, 'highpass', 6000, 0.7); drop(330, 210, 0.5, 0.07, 'triangle'); break;
    case 'ghost': noise(c, out, t, 0.22, 0.06, 'bandpass', 3000, 0.9); drop(300, 220, 0.12, 0.04, 'triangle'); break;
    case 'airhorn': for (const [o, l] of [[0, 0.11], [0.14, 0.11], [0.28, 0.42]]) {
      const lp = c.createBiquadFilter(), g = c.createGain(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t + o); g.gain.exponentialRampToValueAtTime(0.22, t + o + 0.01); g.gain.setValueAtTime(0.22, t + o + l - 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + o + l);
      for (const f of [466, 470, 932, 587]) { const x = c.createOscillator(); x.type = 'sawtooth'; x.frequency.setValueAtTime(f * 0.94, t + o); x.frequency.exponentialRampToValueAtTime(f, t + o + 0.04); x.connect(lp); x.start(t + o); x.stop(t + o + l + 0.02); }
    } break;
    case 'siren': { const x = c.createOscillator(), lf = c.createOscillator(), lg = c.createGain(), g = c.createGain(), lp = c.createBiquadFilter();
      x.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 2500; x.frequency.setValueAtTime(520, t); x.frequency.linearRampToValueAtTime(760, t + 1.6);
      lf.frequency.setValueAtTime(5, t); lf.frequency.linearRampToValueAtTime(9, t + 1.6); lg.gain.value = 140; lf.connect(lg); lg.connect(x.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.03); g.gain.setValueAtTime(0.3, t + 1.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.75);
      x.connect(lp); lp.connect(g); g.connect(out); x.start(t); lf.start(t); x.stop(t + 1.8); lf.stop(t + 1.8); break; }
    case 'rewind': { const x = c.createOscillator(), g = c.createGain(), bp = c.createBiquadFilter(); x.type = 'sawtooth'; bp.type = 'bandpass'; bp.Q.value = 1.2;
      x.frequency.setValueAtTime(400, t); x.frequency.exponentialRampToValueAtTime(60, t + 0.35); x.frequency.exponentialRampToValueAtTime(900, t + 0.9);
      bp.frequency.setValueAtTime(1500, t); bp.frequency.exponentialRampToValueAtTime(400, t + 0.35); bp.frequency.exponentialRampToValueAtTime(3000, t + 0.9);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.03); g.gain.setValueAtTime(0.4, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
      x.connect(bp); bp.connect(g); g.connect(out); x.start(t); x.stop(t + 1.05); noise(c, out, t, 0.15, 0.9, 'bandpass', 1200, 1); break; }
    case 'glitch': for (let i = 0; i < 6; i++) part(c, out, [200, 1600, 400, 3200, 800, 6400][i], t + i * 0.018, 0.3, 0.015, 'square', 0.001); break;
  }
}
