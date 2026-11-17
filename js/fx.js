// Effect definitions (params, defaults) and Web Audio builders.
import { uid } from './util.js';

const hz = v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v) + '';
const db = v => (v > 0 ? '+' : '') + (+v).toFixed(1);
const pc = v => Math.round(v * 100) + '';
const st = v => (v > 0 ? '+' : '') + v;
const sec = v => (+v).toFixed(3) + 's';
export const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const TUNE_SCALES = { chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], 'pentatonic minor': [0, 3, 5, 7, 10], 'pentatonic major': [0, 2, 4, 7, 9], blues: [0, 3, 5, 6, 7, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };

// p(key, label, min, max, step, default, format, advanced)
const p = (k, label, min, max, step, def, fmt, adv) => ({ k, label, min, max, step, def, fmt, adv });
export const FX = {
  denoise: { name: 'Noise remover', group: 'Clean up', params: [p('amount', 'Amount', 0, 1, 0.01, 0.6, pc)] },
  tune:    { name: 'Auto-Tune', group: 'Pitch', params: [p('speed', 'Retune speed', 0, 1, 0.01, 0.5, pc), p('key', 'Key', -1, 11, 1, -1, v => v < 0 ? 'song' : NOTE[v]), p('scale', 'Scale', 0, 6, 1, 2, v => Object.keys(TUNE_SCALES)[v], true), p('shift', 'Transpose', -12, 12, 1, 0, st), p('mix', 'Mix', 0, 1, 0.01, 1, pc)] },
  pitch:   { name: 'Pitch shift', group: 'Pitch', params: [p('semis', 'Semitones', -12, 12, 1, 0, st), p('mix', 'Mix', 0, 1, 0.01, 1, pc)] },
  harmony: { name: 'Harmonizer', group: 'Pitch', params: [p('v1', 'Voice 1', -12, 12, 1, 4, st), p('v2', 'Voice 2', -12, 12, 1, 7, st), p('mix', 'Harmony level', 0, 1, 0.01, 0.35, pc)] },
  eq:      { name: 'EQ (tone)', group: 'Tone', params: [p('lowcut', 'Low cut', 20, 600, 1, 80, hz), p('body', 'Body', -12, 12, 0.5, 0, db), p('mud', 'Mud', -12, 12, 0.5, 0, db), p('presence', 'Presence', -12, 12, 0.5, 0, db), p('air', 'Air', -12, 12, 0.5, 0, db), p('hicut', 'High cut', 2000, 20000, 100, 20000, hz, true)] },
  comp:    { name: 'Compressor', group: 'Dynamics', params: [p('thresh', 'Amount', -45, 0, 1, -18, v => v + ' dB'), p('ratio', 'Ratio', 1, 20, 0.5, 4, v => v + ':1', true), p('attack', 'Attack', 0.001, 0.1, 0.001, 0.005, sec, true), p('release', 'Release', 0.03, 1, 0.01, 0.15, sec, true), p('makeup', 'Makeup', 0, 18, 0.5, 4, db)] },
  deess:   { name: 'De-esser', group: 'Dynamics', params: [p('amount', 'Amount', 0, 1, 0.01, 0.5, pc), p('freq', 'Frequency', 3000, 10000, 100, 6500, hz, true)] },
  limiter: { name: 'Limiter', group: 'Dynamics', params: [p('ceiling', 'Ceiling', -12, 0, 0.5, -1, db), p('drive', 'Push', 0, 12, 0.5, 0, db)] },
  sat:     { name: 'Saturation', group: 'Color', params: [p('drive', 'Warmth', 0, 1, 0.01, 0.3, pc), p('mix', 'Mix', 0, 1, 0.01, 1, pc, true)] },
  dist:    { name: 'Distortion', group: 'Color', params: [p('drive', 'Drive', 0, 1, 0.01, 0.5, pc), p('tone', 'Tone', 500, 8000, 50, 3000, hz), p('mix', 'Mix', 0, 1, 0.01, 0.5, pc)] },
  ring:    { name: 'Robot (ring mod)', group: 'Color', params: [p('freq', 'Robot pitch', 20, 400, 1, 60, v => v + ' Hz'), p('mix', 'Mix', 0, 1, 0.01, 0.6, pc)] },
  chorus:  { name: 'Chorus', group: 'Space', params: [p('rate', 'Speed', 0.1, 5, 0.05, 0.8, v => (+v).toFixed(2) + ' Hz'), p('depth', 'Depth', 0, 1, 0.01, 0.4, pc), p('mix', 'Mix', 0, 1, 0.01, 0.35, pc)] },
  doubler: { name: 'Doubler', group: 'Space', params: [p('width', 'Width', 0, 1, 0.01, 0.7, pc), p('mix', 'Mix', 0, 1, 0.01, 0.5, pc)] },
  flanger: { name: 'Flanger', group: 'Space', params: [p('rate', 'Speed', 0.05, 2, 0.01, 0.25, v => (+v).toFixed(2) + ' Hz'), p('depth', 'Depth', 0, 1, 0.01, 0.6, pc), p('feedback', 'Feedback', 0, 0.9, 0.01, 0.5, pc, true), p('mix', 'Mix', 0, 1, 0.01, 0.5, pc)] },
  phaser:  { name: 'Phaser', group: 'Space', params: [p('rate', 'Speed', 0.05, 3, 0.01, 0.4, v => (+v).toFixed(2) + ' Hz'), p('depth', 'Depth', 0, 1, 0.01, 0.7, pc), p('feedback', 'Feedback', 0, 0.9, 0.01, 0.4, pc, true), p('mix', 'Mix', 0, 1, 0.01, 0.5, pc)] },
  widen:   { name: 'Stereo widener', group: 'Space', params: [p('amount', 'Width', 0, 1, 0.01, 0.5, pc)] },
  bitcrush:{ name: 'Lo-fi crusher', group: 'Color', params: [p('bits', 'Bits', 2, 12, 1, 6, v => v + ' bit'), p('tone', 'Tone', 500, 12000, 50, 6000, hz), p('mix', 'Mix', 0, 1, 0.01, 0.6, pc)] },
  autowah: { name: 'Auto-wah', group: 'Motion', params: [p('rate', 'Speed', 0.1, 8, 0.05, 1.5, v => (+v).toFixed(2) + ' Hz'), p('freq', 'Center', 200, 3000, 10, 900, hz), p('depth', 'Sweep', 0, 1, 0.01, 0.7, pc), p('q', 'Squeal', 0.5, 15, 0.1, 5, v => (+v).toFixed(1)), p('mix', 'Mix', 0, 1, 0.01, 0.8, pc)] },
  tremolo: { name: 'Tremolo / chop', group: 'Motion', params: [p('rate', 'Speed', 0.5, 16, 0.1, 5, v => (+v).toFixed(1) + ' Hz'), p('depth', 'Depth', 0, 1, 0.01, 0.6, pc), p('shape', 'Choppy', 0, 1, 0.01, 0, pc)] },
  vibrato: { name: 'Vibrato', group: 'Motion', params: [p('rate', 'Speed', 0.5, 12, 0.1, 5, v => (+v).toFixed(1) + ' Hz'), p('depth', 'Depth', 0, 1, 0.01, 0.4, pc)] },
  delay:   { name: 'Echo', group: 'Space', params: [p('time', 'Time', 0.03, 1.5, 0.01, 0.33, v => (+v).toFixed(2) + 's'), p('feedback', 'Repeats', 0, 0.92, 0.01, 0.4, pc), p('tone', 'Tone', 500, 12000, 50, 4000, hz), p('mix', 'Mix', 0, 1, 0.01, 0.35, pc)] },
  filter:  { name: 'Filter sweep', group: 'Tone', params: [p('mode', 'Type', 0, 2, 1, 0, v => ['Low pass', 'High pass', 'Band pass'][v]), p('cutoff', 'Cutoff', 60, 18000, 10, 2500, hz), p('res', 'Resonance', 0.5, 20, 0.1, 2, v => (+v).toFixed(1)), p('rate', 'Sweep speed', 0, 2, 0.01, 0, v => v ? (+v).toFixed(2) + ' Hz' : 'off'), p('depth', 'Sweep amount', 0, 1, 0.01, 0.6, pc)] },
  dust:    { name: 'Vinyl dust', group: 'Color', params: [p('crackle', 'Crackle', 0, 1, 0.01, 0.4, pc), p('hiss', 'Hiss', 0, 1, 0.01, 0.25, pc), p('tone', 'Tone', 1000, 12000, 100, 5000, hz)] },
  exciter: { name: 'Exciter', group: 'Color', params: [p('freq', 'From', 1500, 9000, 50, 3500, hz), p('drive', 'Shine', 0, 1, 0.01, 0.5, pc), p('mix', 'Amount', 0, 1, 0.01, 0.3, pc)] },
  shimmer: { name: 'Shimmer reverb', group: 'Space', params: [p('size', 'Size', 1, 10, 0.1, 5, v => (+v).toFixed(1) + 's'), p('pitch', 'Shimmer', 0, 12, 1, 12, st), p('mix', 'Mix', 0, 1, 0.01, 0.35, pc)] },
  tape:    { name: 'Tape machine', group: 'Color', params: [p('drive', 'Saturate', 0, 1, 0.01, 0.4, pc), p('wow', 'Wow', 0, 1, 0.01, 0.3, pc), p('tone', 'Tone', 2000, 16000, 100, 9000, hz), p('mix', 'Mix', 0, 1, 0.01, 1, pc)] },
  gate:    { name: 'Trance gate', group: 'Motion', params: [p('rate', 'Steps per second', 1, 16, 0.5, 6, v => (+v).toFixed(1)), p('pattern', 'Pattern', 0, 5, 1, 0, v => ['Straight', 'Offbeat', 'Triplet', 'Skip', 'Stutter', 'Half'][v]), p('depth', 'Depth', 0, 1, 0.01, 1, pc)] },
  autopan: { name: 'Auto-pan', group: 'Motion', params: [p('rate', 'Speed', 0.05, 8, 0.05, 0.5, v => (+v).toFixed(2) + ' Hz'), p('depth', 'Width', 0, 1, 0.01, 0.8, pc)] },
  repeat:  { name: 'Stutter repeat', group: 'Motion', params: [p('slice', 'Slice', 0.03, 0.5, 0.005, 0.09, v => Math.round(v * 1000) + 'ms'), p('count', 'Repeats', 2, 8, 1, 4, v => v + 'x'), p('mix', 'Mix', 0, 1, 0.01, 0.8, pc)] },
  room:    { name: 'Reverb room', group: 'Space', params: [p('size', 'Size', 0.2, 10, 0.1, 1.8, v => (+v).toFixed(1) + 's'), p('tone', 'Tone', 1000, 16000, 100, 8000, hz), p('mix', 'Mix', 0, 1, 0.01, 0.3, pc)] },
};
export const FX_ORDER = ['denoise', 'tune', 'pitch', 'harmony', 'eq', 'filter', 'comp', 'deess', 'sat', 'exciter', 'tape', 'dist', 'bitcrush', 'ring', 'autowah', 'tremolo', 'vibrato', 'repeat', 'chorus', 'doubler', 'flanger', 'phaser', 'gate', 'autopan', 'delay', 'room', 'shimmer', 'widen', 'dust', 'limiter'];
// effects that make sense on instruments in the beat maker
export const BEAT_FX = ['eq', 'filter', 'dust', 'tape', 'exciter', 'gate', 'autopan', 'shimmer', 'comp', 'sat', 'dist', 'bitcrush', 'autowah', 'tremolo', 'vibrato', 'repeat', 'chorus', 'flanger', 'phaser', 'delay', 'room', 'widen', 'pitch', 'ring', 'limiter'];

export function newFx(type, params = {}) {
  const def = {}; for (const q of FX[type].params) def[q.k] = q.def;
  return { id: uid(), type, on: true, params: { ...def, ...params } };
}
export function scaleMask(key, scaleIdx) {
  const s = Object.values(TUNE_SCALES)[scaleIdx] || TUNE_SCALES.chromatic;
  let m = 0; for (const iv of s) m |= 1 << ((key + iv) % 12);
  return m;
}

// ---------- builders ----------
// Each returns { in, out, set(params, ctxInfo, instant), stop() }
function sp(c, param, v, instant) { if (instant) param.value = v; else param.setTargetAtTime(v, c.currentTime, 0.02); }
// saturation curve with unity gain for quiet sounds: room noise stays where it is, only the loud parts get warm and rounded
const tanhCurve = k => { const n = 2048, a = new Float32Array(n), m = Math.max(1, k * 0.35); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; a[i] = Math.tanh(m * x) / m; } return a; };
const hardCurve = k => { const n = 1024, a = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; a[i] = Math.max(-1, Math.min(1, Math.atan(k * x) / Math.atan(k) * 1.2)); } return a; };
function wetDry(c) {
  const input = c.createGain(), out = c.createGain(), dry = c.createGain(), wet = c.createGain();
  input.connect(dry); dry.connect(out); wet.connect(out);
  return { input, out, dry, wet, mix(v, inst) { sp(c, dry.gain, 1 - v, inst); sp(c, wet.gain, v, inst); } };
}
function lfo(c, rate, amount, target) {
  const o = c.createOscillator(), g = c.createGain();
  o.frequency.value = rate; g.gain.value = amount; o.connect(g); g.connect(target); o.start();
  return { o, g };
}

export function buildFx(c, f) {
  const B = BUILD[f.type]; return B(c, f);
}
const BUILD = {
  denoise(c, f) {
    const prof = f && f.params && f.params.profile;
    const n = new AudioWorkletNode(c, 'denoise', { outputChannelCount: [2], processorOptions: { profile: prof || null } });
    return { in: n, out: n, set(p) { n.parameters.get('amount').value = p.amount; } };
  },
  eq(c) {
    const lc = c.createBiquadFilter(), body = c.createBiquadFilter(), mud = c.createBiquadFilter(), pres = c.createBiquadFilter(), air = c.createBiquadFilter(), hc = c.createBiquadFilter();
    lc.type = 'highpass'; lc.Q.value = 0.707;
    body.type = 'lowshelf'; body.frequency.value = 180;
    mud.type = 'peaking'; mud.frequency.value = 350; mud.Q.value = 1;
    pres.type = 'peaking'; pres.frequency.value = 3200; pres.Q.value = 0.8;
    air.type = 'highshelf'; air.frequency.value = 10000;
    hc.type = 'lowpass'; hc.Q.value = 0.707;
    lc.connect(body); body.connect(mud); mud.connect(pres); pres.connect(air); air.connect(hc);
    return { in: lc, out: hc, set(p, _, i) { sp(c, lc.frequency, p.lowcut, i); sp(c, body.gain, p.body, i); sp(c, mud.gain, p.mud, i); sp(c, pres.gain, p.presence, i); sp(c, air.gain, p.air, i); sp(c, hc.frequency, p.hicut, i); } };
  },
  comp(c) {
    const k = c.createDynamicsCompressor(), mk = c.createGain(); k.knee.value = 6; k.connect(mk);
    return { in: k, out: mk, set(p, _, i) { sp(c, k.threshold, p.thresh, i); sp(c, k.ratio, p.ratio, i); k.attack.value = p.attack; k.release.value = p.release; sp(c, mk.gain, Math.pow(10, p.makeup / 20), i); } };
  },
  deess(c) {
    // Linkwitz-Riley split: the high band gets compressed hard, then the bands are summed back.
    const input = c.createGain(), out = c.createGain();
    const lp1 = c.createBiquadFilter(), lp2 = c.createBiquadFilter(), hp1 = c.createBiquadFilter(), hp2 = c.createBiquadFilter();
    for (const f of [lp1, lp2]) { f.type = 'lowpass'; f.Q.value = 0.707; }
    for (const f of [hp1, hp2]) { f.type = 'highpass'; f.Q.value = 0.707; }
    const k = c.createDynamicsCompressor(); k.ratio.value = 12; k.attack.value = 0.001; k.release.value = 0.06; k.knee.value = 3;
    input.connect(lp1); lp1.connect(lp2); lp2.connect(out);
    input.connect(hp1); hp1.connect(hp2); hp2.connect(k); k.connect(out);
    return { in: input, out, set(p, _, i) { for (const f of [lp1, lp2, hp1, hp2]) sp(c, f.frequency, p.freq, i); sp(c, k.threshold, -12 - p.amount * 38, i); } };
  },
  limiter(c) {
    const pre = c.createGain(), k = c.createDynamicsCompressor(), post = c.createGain();
    k.ratio.value = 20; k.knee.value = 0; k.attack.value = 0.001; k.release.value = 0.08;
    pre.connect(k); k.connect(post);
    return { in: pre, out: post, set(p, _, i) { sp(c, pre.gain, Math.pow(10, p.drive / 20), i); sp(c, k.threshold, p.ceiling - 2, i); sp(c, post.gain, Math.pow(10, 1.5 / 20), i); } };
  },
  sat(c) {
    const w = wetDry(c), sh = c.createWaveShaper(); sh.oversample = '4x';
    w.input.connect(sh); sh.connect(w.wet);
    let last = -1;
    return { in: w.input, out: w.out, set(p, _, i) { if (p.drive !== last) { sh.curve = tanhCurve(1 + p.drive * 6); last = p.drive; } w.mix(p.mix, i); } };
  },
  dist(c) {
    const w = wetDry(c), sh = c.createWaveShaper(), tone = c.createBiquadFilter(), lvl = c.createGain();
    sh.oversample = '4x'; tone.type = 'lowpass'; lvl.gain.value = 0.6;
    w.input.connect(sh); sh.connect(tone); tone.connect(lvl); lvl.connect(w.wet);
    let last = -1;
    return { in: w.input, out: w.out, set(p, _, i) { if (p.drive !== last) { sh.curve = hardCurve(2 + p.drive * 60); last = p.drive; } sp(c, tone.frequency, p.tone, i); w.mix(p.mix, i); } };
  },
  ring(c) {
    const w = wetDry(c), rm = c.createGain(); rm.gain.value = 0;
    const o = c.createOscillator(); o.type = 'sine'; o.connect(rm.gain); o.start();
    w.input.connect(rm); rm.connect(w.wet);
    return { in: w.input, out: w.out, set(p, _, i) { sp(c, o.frequency, p.freq, i); w.mix(p.mix, i); }, stop() { o.stop(); } };
  },
  chorus(c) {
    const w = wetDry(c), d1 = c.createDelay(0.1), d2 = c.createDelay(0.1), p1 = c.createStereoPanner(), p2 = c.createStereoPanner();
    d1.delayTime.value = 0.02; d2.delayTime.value = 0.027; p1.pan.value = -0.6; p2.pan.value = 0.6;
    const l1 = lfo(c, 0.8, 0.002, d1.delayTime), l2 = lfo(c, 0.9, 0.002, d2.delayTime);
    w.input.connect(d1); w.input.connect(d2); d1.connect(p1); d2.connect(p2); p1.connect(w.wet); p2.connect(w.wet);
    return { in: w.input, out: w.out, set(p, _, i) { sp(c, l1.o.frequency, p.rate, i); sp(c, l2.o.frequency, p.rate * 1.13, i); sp(c, l1.g.gain, p.depth * 0.005, i); sp(c, l2.g.gain, p.depth * 0.005, i); w.mix(p.mix, i); }, stop() { l1.o.stop(); l2.o.stop(); } };
  },
  doubler(c) {
    const w = wetDry(c), d1 = c.createDelay(0.1), d2 = c.createDelay(0.1), p1 = c.createStereoPanner(), p2 = c.createStereoPanner();
    d1.delayTime.value = 0.017; d2.delayTime.value = 0.029;
    const l1 = lfo(c, 0.11, 0.0012, d1.delayTime), l2 = lfo(c, 0.17, 0.0015, d2.delayTime);
    w.input.connect(d1); w.input.connect(d2); d1.connect(p1); d2.connect(p2); p1.connect(w.wet); p2.connect(w.wet);
    return { in: w.input, out: w.out, set(p, _, i) { sp(c, p1.pan, -p.width, i); sp(c, p2.pan, p.width, i); sp(c, w.dry.gain, 1, i); sp(c, w.wet.gain, p.mix * 0.8, i); }, stop() { l1.o.stop(); l2.o.stop(); } };
  },
  flanger(c) {
    const w = wetDry(c), d = c.createDelay(0.05), fb = c.createGain();
    d.delayTime.value = 0.003;
    const l = lfo(c, 0.25, 0.002, d.delayTime);
    w.input.connect(d); d.connect(fb); fb.connect(d); d.connect(w.wet);
    return { in: w.input, out: w.out, set(p, _, i) { sp(c, l.o.frequency, p.rate, i); sp(c, l.g.gain, p.depth * 0.0028, i); sp(c, fb.gain, p.feedback, i); w.mix(p.mix, i); }, stop() { l.o.stop(); } };
  },
  phaser(c) {
    const w = wetDry(c), aps = [0, 1, 2, 3].map(() => { const f = c.createBiquadFilter(); f.type = 'allpass'; f.frequency.value = 800; f.Q.value = 0.5; return f; });
    const fb = c.createGain(); const mod = c.createGain(); mod.gain.value = 600;
    const o = c.createOscillator(); o.frequency.value = 0.4; o.connect(mod); o.start();
    aps.forEach(f => mod.connect(f.frequency));
    w.input.connect(aps[0]); for (let k = 0; k < 3; k++) aps[k].connect(aps[k + 1]);
    aps[3].connect(fb); fb.connect(aps[0]); aps[3].connect(w.wet);
    return { in: w.input, out: w.out, set(p, _, i) { sp(c, o.frequency, p.rate, i); sp(c, mod.gain, 200 + p.depth * 900, i); sp(c, fb.gain, p.feedback, i); w.mix(p.mix, i); }, stop() { o.stop(); } };
  },
  widen(c) {
    const input = c.createGain(), out = c.createGain(), m = c.createChannelMerger(2), d = c.createDelay(0.05), dry = c.createGain(), wet = c.createGain();
    input.connect(dry); dry.connect(out);
    input.connect(m, 0, 0); input.connect(d); d.connect(m, 0, 1); m.connect(wet); wet.connect(out);
    return { in: input, out, set(p, _, i) { sp(c, d.delayTime, 0.004 + p.amount * 0.014, i); sp(c, wet.gain, p.amount * 0.7, i); sp(c, dry.gain, 1 - p.amount * 0.5, i); } };
  },
  bitcrush(c) {
    const w = wetDry(c), sh = c.createWaveShaper(), tone = c.createBiquadFilter(); tone.type = 'lowpass';
    w.input.connect(sh); sh.connect(tone); tone.connect(w.wet);
    let last = -1;
    return { in: w.input, out: w.out, set(p, _, i) {
      if (p.bits !== last) { const n = 4096, a = new Float32Array(n), q = Math.pow(2, p.bits - 1); for (let k = 0; k < n; k++) { const x = k / (n - 1) * 2 - 1; a[k] = Math.round(x * q) / q; } sh.curve = a; last = p.bits; }
      sp(c, tone.frequency, p.tone, i); w.mix(p.mix, i); } };
  },
  autowah(c) {
    const w = wetDry(c), f = c.createBiquadFilter(); f.type = 'bandpass';
    const mk = c.createGain(); mk.gain.value = 3;
    const l = lfo(c, 1.5, 400, f.frequency);
    w.input.connect(f); f.connect(mk); mk.connect(w.wet);
    return { in: w.input, out: w.out, set(p, _, i) { sp(c, f.frequency, p.freq, i); sp(c, l.o.frequency, p.rate, i); sp(c, l.g.gain, p.freq * 0.9 * p.depth, i); sp(c, f.Q, p.q, i); w.mix(p.mix, i); }, stop() { l.o.stop(); } };
  },
  tremolo(c) {
    const input = c.createGain(), amp = c.createGain(), o = c.createOscillator(), sh = c.createWaveShaper(), dep = c.createGain();
    o.connect(sh); sh.connect(dep); dep.connect(amp.gain); input.connect(amp); o.start();
    let last = -1;
    return { in: input, out: amp, set(p, _, i) {
      if (p.shape !== last) { const n = 512, a = new Float32Array(n), k = 1 + p.shape * 40; for (let j = 0; j < n; j++) { const x = j / (n - 1) * 2 - 1; a[j] = Math.tanh(k * x) / Math.tanh(k); } sh.curve = a; last = p.shape; }
      sp(c, o.frequency, p.rate, i); sp(c, amp.gain, 1 - p.depth / 2, i); sp(c, dep.gain, p.depth / 2, i); }, stop() { o.stop(); } };
  },
  vibrato(c) {
    const d = c.createDelay(0.05); d.delayTime.value = 0.008;
    const l = lfo(c, 5, 0.002, d.delayTime);
    return { in: d, out: d, set(p, _, i) { sp(c, l.o.frequency, p.rate, i); sp(c, l.g.gain, p.depth * 0.004, i); }, stop() { l.o.stop(); } };
  },
  filter(c) {
    const f = c.createBiquadFilter(), l = lfo(c, 0.1, 0, f.detune);
    return { in: f, out: f, set(p, _, i) {
      f.type = ['lowpass', 'highpass', 'bandpass'][p.mode] || 'lowpass';
      sp(c, f.frequency, p.cutoff, i); sp(c, f.Q, p.res, i);
      sp(c, l.o.frequency, Math.max(0.01, p.rate), i); sp(c, l.g.gain, p.rate ? p.depth * 3000 : 0, i); // sweep in cents, so it moves evenly through the octaves
    }, stop() { l.o.stop(); } };
  },
  // vinyl crackle and tape hiss laid over the sound
  dust(c) {
    const input = c.createGain(), out = c.createGain(), len = c.sampleRate * 3, b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let k = 0; k < len; k++) if (Math.random() < 0.00035) { const a = (Math.random() * 2 - 1) * (0.3 + Math.random() * 0.7); for (let j = 0; j < 40 && k + j < len; j++) d[k + j] += a * Math.exp(-j / 6) * (j % 2 ? -1 : 1); } }
    const hb = c.createBuffer(2, c.sampleRate * 2, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = hb.getChannelData(ch); for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1; }
    const cr = c.createBufferSource(), hs = c.createBufferSource(), cg = c.createGain(), hg = c.createGain(), tone = c.createBiquadFilter();
    cr.buffer = b; hs.buffer = hb; cr.loop = hs.loop = true; tone.type = 'lowpass';
    input.connect(out); cr.connect(cg); hs.connect(hg); cg.connect(tone); hg.connect(tone); tone.connect(out); cr.start(); hs.start();
    return { in: input, out, set(p, _, i) { sp(c, cg.gain, p.crackle * 0.5, i); sp(c, hg.gain, p.hiss * 0.025, i); sp(c, tone.frequency, p.tone, i); }, stop() { cr.stop(); hs.stop(); } };
  },
  exciter(c) {
    const w = wetDry(c), hp = c.createBiquadFilter(), sh = c.createWaveShaper(), hp2 = c.createBiquadFilter(); hp.type = hp2.type = 'highpass'; sh.oversample = '4x';
    w.input.connect(hp); hp.connect(sh); sh.connect(hp2); hp2.connect(w.wet); let last = -1;
    return { in: w.input, out: w.out, set(p, _, i) { sp(c, hp.frequency, p.freq, i); sp(c, hp2.frequency, p.freq, i); if (p.drive !== last) { sh.curve = tanhCurve(1 + p.drive * 10); last = p.drive; } sp(c, w.dry.gain, 1, i); sp(c, w.wet.gain, p.mix, i); } };
  },
  shimmer(c) {
    const w = wetDry(c), ps = new AudioWorkletNode(c, 'pitch', { outputChannelCount: [2] }), cv = c.createConvolver(), fb = c.createGain(), lp = c.createBiquadFilter();
    ps.parameters.get('mode').value = 1; lp.type = 'lowpass'; lp.frequency.value = 9000; fb.gain.value = 0.35;
    w.input.connect(cv); cv.connect(lp); lp.connect(w.wet); lp.connect(ps); ps.connect(fb); fb.connect(cv); let last = -1;
    return { in: w.input, out: w.out, set(p, _, i) {
      if (p.size !== last) { const len = Math.floor(c.sampleRate * p.size), b = c.createBuffer(2, len, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / len, 2) * 0.6; } cv.buffer = b; last = p.size; }
      ps.parameters.get('semis').value = p.pitch; sp(c, w.dry.gain, 1, i); sp(c, w.wet.gain, p.mix, i); } };
  },
  tape(c) {
    const w = wetDry(c), sh = c.createWaveShaper(), lp = c.createBiquadFilter(), d = c.createDelay(0.05); lp.type = 'lowpass'; d.delayTime.value = 0.006; sh.oversample = '2x';
    const l = lfo(c, 0.6, 0, d.delayTime); w.input.connect(sh); sh.connect(lp); lp.connect(d); d.connect(w.wet); let last = -1;
    return { in: w.input, out: w.out, set(p, _, i) { if (p.drive !== last) { sh.curve = tanhCurve(1 + p.drive * 5); last = p.drive; } sp(c, lp.frequency, p.tone, i); sp(c, l.g.gain, p.wow * 0.0025, i); w.mix(p.mix, i); }, stop() { l.o.stop(); } };
  },
  gate(c) {
    // a step pattern that opens and closes the sound, like a trance gate
    const input = c.createGain(), amp = c.createGain(); input.connect(amp); amp.gain.value = 1; let timer = null, k = 0, P = null;
    const PATS = [[1, 1, 1, 1, 1, 1, 1, 1], [0, 1, 0, 1, 0, 1, 0, 1], [1, 1, 0, 1, 1, 0, 1, 1], [1, 0, 1, 1, 0, 1, 1, 0], [1, 1, 1, 1, 0, 1, 0, 1], [1, 1, 1, 1, 0, 0, 0, 0]];
    const tick = () => { if (!P) return; const on = PATS[P.pattern][k++ % 8]; amp.gain.cancelScheduledValues(c.currentTime); amp.gain.setTargetAtTime(on ? 1 : 1 - P.depth, c.currentTime, 0.004); };
    return { in: input, out: amp, set(p) { const re = !P || P.rate !== p.rate; P = p; if (c instanceof OfflineAudioContext) { amp.gain.value = 1 - p.depth * 0.3; return; } if (re) { clearInterval(timer); timer = setInterval(tick, 1000 / p.rate); } }, stop() { clearInterval(timer); } };
  },
  autopan(c) {
    const pan = c.createStereoPanner(), l = lfo(c, 0.5, 0.8, pan.pan);
    return { in: pan, out: pan, set(p, _, i) { sp(c, l.o.frequency, p.rate, i); sp(c, l.g.gain, p.depth, i); }, stop() { l.o.stop(); } };
  },
  // grabs a short slice and repeats it, then grabs the next one (beat-repeat stutter)
  repeat(c) {
    const input = c.createGain(), out = c.createGain(), dry = c.createGain(), wet = c.createGain(), gate = c.createGain(), d = c.createDelay(1), fb = c.createGain();
    const o = c.createOscillator(), sh = c.createWaveShaper(), fbMod = c.createGain(), dryMod = c.createGain(), wetMod = c.createGain();
    o.type = 'sawtooth'; o.connect(sh); gate.gain.value = 0;
    sh.connect(gate.gain); sh.connect(fbMod); fbMod.connect(fb.gain); sh.connect(dryMod); dryMod.connect(dry.gain); sh.connect(wetMod); wetMod.connect(wet.gain);
    input.connect(gate); gate.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(out); input.connect(dry); dry.connect(out); o.start();
    let last = -1;
    return { in: input, out, set(p, _, i) {
      if (p.count !== last) { const n = 1024, a = new Float32Array(n); for (let k = 0; k < n; k++) a[k] = (k / (n - 1)) < 1 / p.count ? 1 : 0; sh.curve = a; last = p.count; }
      sp(c, d.delayTime, p.slice, i); sp(c, o.frequency, 1 / (p.slice * p.count), i);
      sp(c, fb.gain, 0.97, i); sp(c, fbMod.gain, -0.97, i);           // keep repeating, but clear while grabbing a new slice
      sp(c, dry.gain, 1 - p.mix, i); sp(c, dryMod.gain, p.mix, i);    // you hear the live voice while it grabs
      sp(c, wet.gain, p.mix, i); sp(c, wetMod.gain, -p.mix, i);
    }, stop() { o.stop(); } };
  },
  delay(c) {
    const w = wetDry(c), d = c.createDelay(2), fb = c.createGain(), tone = c.createBiquadFilter(); tone.type = 'lowpass';
    w.input.connect(d); d.connect(tone); tone.connect(fb); fb.connect(d); tone.connect(w.wet);
    return { in: w.input, out: w.out, set(p, _, i) { sp(c, d.delayTime, p.time, i); sp(c, fb.gain, p.feedback, i); sp(c, tone.frequency, p.tone, i); sp(c, w.dry.gain, 1, i); sp(c, w.wet.gain, p.mix, i); } };
  },
  room(c) {
    const w = wetDry(c), cv = c.createConvolver(), tone = c.createBiquadFilter(); tone.type = 'lowpass';
    w.input.connect(cv); cv.connect(tone); tone.connect(w.wet);
    let last = -1;
    return { in: w.input, out: w.out, set(p, _, i) {
      if (p.size !== last) { const len = Math.floor(c.sampleRate * p.size), b = c.createBuffer(2, len, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / len, 2.5); } cv.buffer = b; last = p.size; }
      sp(c, tone.frequency, p.tone, i); sp(c, w.dry.gain, 1, i); sp(c, w.wet.gain, p.mix, i); } };
  },
  tune(c) {
    const n = new AudioWorkletNode(c, 'pitch', { outputChannelCount: [2] });
    n.parameters.get('mode').value = 2;
    return { in: n, out: n, set(p, info) {
      // key -1 means: follow the song key and scale from the Beat tab
      n.parameters.get('mask').value = p.key < 0 ? scaleMask(info.key, info.scaleIdx) : scaleMask(p.key, p.scale);
      n.parameters.get('speed').value = p.speed; n.parameters.get('mix').value = p.mix; n.parameters.get('semis').value = p.shift || 0;
    } };
  },
  pitch(c) {
    const n = new AudioWorkletNode(c, 'pitch', { outputChannelCount: [2] });
    n.parameters.get('mode').value = 1;
    return { in: n, out: n, set(p) { n.parameters.get('semis').value = p.semis; n.parameters.get('mix').value = p.mix; } };
  },
  harmony(c) {
    const input = c.createGain(), out = c.createGain();
    const a = new AudioWorkletNode(c, 'pitch', { outputChannelCount: [2] }), b = new AudioWorkletNode(c, 'pitch', { outputChannelCount: [2] });
    const pa = c.createStereoPanner(), pb = c.createStereoPanner(), ga = c.createGain(), gb = c.createGain();
    pa.pan.value = -0.5; pb.pan.value = 0.5;
    input.connect(out);
    input.connect(a); a.connect(ga); ga.connect(pa); pa.connect(out);
    input.connect(b); b.connect(gb); gb.connect(pb); pb.connect(out);
    for (const x of [a, b]) x.parameters.get('mode').value = 1;
    return { in: input, out, set(p, _, i) { a.parameters.get('semis').value = p.v1; b.parameters.get('semis').value = p.v2; sp(c, ga.gain, p.v1 ? p.mix : 0, i); sp(c, gb.gain, p.v2 ? p.mix : 0, i); } };
  },
};

// Spectral noise remover: STFT (1024, hop 256), per-bin gain from a noise profile.
// Uses a learned profile when given (Fix My Voice), otherwise tracks the noise floor by itself.
export const DENOISE_WORKLET = `
class Denoise extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'amount', defaultValue: 0.6 }]; }
  constructor(opt) {
    super();
    const N = 1024; this.N = N; this.H = 256;
    this.inb = new Float32Array(N); this.ring = new Float32Array(N); this.rp = 0; this.outb = new Float32Array(N * 2); this.cnt = 0; this.op = 0;
    this.oq = new Float32Array(8192); this.qw = 0; this.qr = 0;
    this.win = new Float32Array(N); for (let i = 0; i < N; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    this.re = new Float32Array(N); this.im = new Float32Array(N);
    this.B = N / 2 + 1; this.noise = new Float32Array(this.B); this.g = new Float32Array(this.B).fill(1);
    const pr = opt && opt.processorOptions && opt.processorOptions.profile;
    this.fixed = !!(pr && pr.length === this.B); if (this.fixed) this.noise.set(pr);
    this.frames = 0;
    this.rev = new Uint32Array(N); const bits = Math.log2(N);
    for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); this.rev[i] = r; }
  }
  fft(re, im, inv) {
    const N = this.N, rev = this.rev;
    for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, ang = (inv ? 2 : -2) * Math.PI / size, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let s = 0; s < N; s += size) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = s + k, b = a + half;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }
  frame(amount) {
    const N = this.N, re = this.re, im = this.im, w = this.win, B = this.B;
    for (let i = 0; i < N; i++) { re[i] = this.ring[(this.rp + i) % N] * w[i]; im[i] = 0; }
    this.fft(re, im, false);
    this.frames++;
    for (let k = 0; k < B; k++) {
      const mag = Math.hypot(re[k], im[k]);
      if (!this.fixed) {
        const nz = this.noise[k];
        if (this.frames < 10) this.noise[k] = this.frames === 1 ? mag : Math.min(nz, mag) * 0.5 + nz * 0.5;
        else if (mag < nz * 2) this.noise[k] = nz * 0.97 + mag * 0.03; else this.noise[k] = nz * 1.002;
      }
      const sub = this.noise[k] * (1 + 2 * amount);
      let gt = mag > 1e-9 ? Math.max(0, 1 - sub / mag) : 0;
      gt = Math.max(gt, Math.pow(10, -amount * 1.5)); // floor: up to -30 dB at full amount
      const gp = this.g[k]; this.g[k] = gt > gp ? gp + (gt - gp) * 0.6 : gp + (gt - gp) * 0.25;
      const gg = this.g[k];
      re[k] *= gg; im[k] *= gg;
      if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    }
    this.fft(re, im, true);
    const sc = 1 / (N * 1.5);
    for (let i = 0; i < N; i++) this.outb[(this.op + i) % (N * 2)] += re[i] * w[i] * sc;
    for (let i = 0; i < this.H; i++) { const j = (this.op + i) % (N * 2); this.oq[this.qw & 8191] = this.outb[j]; this.qw++; this.outb[j] = 0; }
    this.op = (this.op + this.H) % (N * 2);
  }
  process(ins, outs, P) {
    const i = ins[0], o = outs[0]; if (!o || !o.length) return true;
    const n = o[0].length, amount = P.amount[0];
    for (let s = 0; s < n; s++) {
      let x = 0; if (i && i.length) { for (let c = 0; c < i.length; c++) x += i[c][s]; x /= i.length; }
      this.ring[this.rp] = x; this.rp = (this.rp + 1) % this.N; // after this, rp points at the oldest sample
      if (++this.cnt === this.H) { this.cnt = 0; this.frame(amount); }
      // fixed latency: start reading once one full frame of output is queued
      const y = this.qw - this.qr > this.N ? this.oq[(this.qr++) & 8191] : 0;
      for (let c = 0; c < o.length; c++) o[c][s] = y;
    }
    return true;
  }
}
registerProcessor('denoise', Denoise);`;

// Worklet source for the pitch shifter / Auto-Tune. Added to the engine's worklet module.
export const PITCH_WORKLET = `
class Pitch extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [
    { name: 'mode', defaultValue: 1 }, { name: 'semis', defaultValue: 0 }, { name: 'speed', defaultValue: 0.5 },
    { name: 'mask', defaultValue: 4095 }, { name: 'mix', defaultValue: 1 }]; }
  constructor() {
    super();
    this.N = 8192; this.buf = new Float32Array(this.N); this.w = 0; this.W = 2048; this.ph = 0;
    this.ratio = 1; this.tr = 1; this.an = new Float32Array(1024); this.ai = 0; this.half = 0; this.hc = 0;
    this.maxL = Math.min(380, Math.floor(sampleRate / 2 / 70)); this.minL = Math.floor(sampleRate / 2 / 1000);
    this.d = new Float32Array(this.maxL + 2);
  }
  detect(mask) {
    const x = this.an, W = 512, d = this.d, maxL = this.maxL, minL = this.minL, sr = sampleRate / 2;
    let e = 0; for (let i = 0; i < W; i++) e += x[i] * x[i];
    if (Math.sqrt(e / W) < 0.006) return;
    let run = 0, tau = -1;
    d[0] = 1;
    for (let t = 1; t <= maxL; t++) {
      let s = 0; for (let i = 0; i < W; i++) { const q = x[i] - x[i + t]; s += q * q; }
      run += s; d[t] = run > 0 ? s * t / run : 1;
    }
    for (let t = minL; t < maxL; t++) {
      if (d[t] < 0.15) { while (t + 1 < maxL && d[t + 1] < d[t]) t++; tau = t; break; }
    }
    if (tau < 0) return;
    const a = d[tau - 1], b = d[tau], c = d[tau + 1], den = a - 2 * b + c;
    const bt = den ? tau + 0.5 * (a - c) / den : tau;
    const f = sr / bt, midi = 69 + 12 * Math.log2(f / 440);
    let best = Math.round(midi), bd = 99;
    for (let k = -7; k <= 7; k++) { const n = Math.round(midi) + k; if (mask & (1 << (((n % 12) + 12) % 12))) { const dd = Math.abs(n - midi); if (dd < bd) { bd = dd; best = n; } } }
    this.tr = Math.pow(2, (best - midi) / 12);
  }
  process(ins, outs, P) {
    const i = ins[0], o = outs[0];
    if (!o || !o.length) return true;
    const n = o[0].length, mode = P.mode[0], mask = P.mask[0] | 0, mix = P.mix[0];
    const semis = Math.pow(2, P.semis[0] / 12), speed = P.speed[0];
    const tc = 0.25 * (1 - speed) * (1 - speed) + 0.0005, k = 1 - Math.exp(-1 / (tc * sampleRate));
    const N = this.N, M = N - 1, W = this.W, buf = this.buf;
    for (let s = 0; s < n; s++) {
      let x = 0;
      if (i && i.length) { for (let c = 0; c < i.length; c++) x += i[c][s]; x /= i.length; }
      buf[this.w] = x;
      if (mode === 2) {
        this.hc += x; if (++this.half === 2) { this.an[this.ai++] = this.hc / 2; this.half = 0; this.hc = 0; }
        if (this.ai === 1024) { this.detect(mask); this.an.copyWithin(0, 512); this.ai = 512; }
        this.ratio += (this.tr - this.ratio) * k;
      } else this.ratio = 1;
      const r = this.ratio * semis;
      this.ph += (1 - r) / W; this.ph -= Math.floor(this.ph);
      const p2 = (this.ph + 0.5) % 1;
      const y = this.tap(this.ph * W) * (0.5 - 0.5 * Math.cos(2 * Math.PI * this.ph)) + this.tap(p2 * W) * (0.5 - 0.5 * Math.cos(2 * Math.PI * p2));
      const out = x * (1 - mix) + y * mix;
      for (let c = 0; c < o.length; c++) o[c][s] = out;
      this.w = (this.w + 1) & M;
    }
    return true;
  }
  tap(d) {
    const pos = this.w - 1 - d + this.N, i0 = Math.floor(pos), f = pos - i0, M = this.N - 1;
    return this.buf[i0 & M] * (1 - f) + this.buf[(i0 + 1) & M] * f;
  }
}
registerProcessor('pitch', Pitch);`;
