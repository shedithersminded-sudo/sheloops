// DJ booth: two decks (turntables or CDJs), a club mixer with Beat FX and Color FX, a sampler,
// transitions, a club light rig with an LED wall, deep customization, and mix recording.
import { $, el, clamp, toast, knob, select, ask, download, uid, safeName } from './util.js';
import { helpBtn } from './help.js';
import { app } from './state.js';
import { E, ensureCtx, encodeWav, renderSong, renderMastered, playDrum } from './engine.js';
import { SOUNDS, loadSounds, soundBuffer, detectBpm } from './library.js';
import { db, saveAudio } from './store.js';
import { newFx, buildFx } from './fx.js';
import { encodeMp3 } from './mp3.js';
import { PERC_NAMES } from './instruments.js';
import { drawRig, SCENES, PATTERNS, LASERS, WALLS } from './djlights.js';

// ---------- saved settings ----------
const KEY = 'loopden.dj';
const LIGHT_DEF = { scene: 'Neon club', pattern: 'sweep', speed: 1, heads: 8, spread: 1, width: 1, intensity: 0.85, haze: 0.6, bloom: 0.8, laser: 'fan', laserColor: 'scene', wall: 'spectrum', wallLevel: 0.8, floor: true, grain: true, colorBeats: 4, beatPulse: true, flicker: false, auto: false, c1: '#ff2bd6', c2: '#00e5ff', strobeRate: 8 };
const DEF = {
  deckStyle: 'vinyl', material: 'matte', led: '#ff2bd6', record: 'black', recA: '#1a1a1f', recB: '#1a1a1f', labelA: '#d81b60', labelB: '#1e88e5', imgA: null, imgB: null, tonearm: true, strobeDots: true,
  L: LIGHT_DEF, curve: 'smooth', range: 8, transStyle: 'blend', transBeats: 8, colorType: 'filter',
  beatFx: { type: 'echo', div: 0.5, level: 0.5, assign: 'master', on: false },
  sampler: ['airhorn', 'siren', 'rewind', 'f_impact', 'f_rev', 'laser', 'vinyl', 'f_up'], samplerVol: 0.8,
  keys: { playA: 'q', playB: 'p', cueA: 'w', cueB: 'o', syncA: 'e', syncB: 'i', xfLeft: 'z', xfRight: 'm', trans: 't', strobe: 'b', blinder: 'n', blackout: 'v', fx: 'f', rec: 'r' },
};
export const DJ = (() => { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...DEF, ...s, L: { ...LIGHT_DEF, ...(s.L || {}) }, beatFx: { ...DEF.beatFx, ...(s.beatFx || {}) }, keys: { ...DEF.keys, ...(s.keys || {}) }, sampler: s.sampler || DEF.sampler }; })();
const saveDJ = () => { try { localStorage.setItem(KEY, JSON.stringify(DJ)); } catch { toast('That picture is too big to save. Try a smaller one.'); } };

// ---------- deck player worklet: any speed, even backwards (scratching) ----------
const DECK_WORKLET = `
class Deck extends AudioWorkletProcessor {
  constructor() { super(); this.ch = null; this.len = 0; this.pos = 0; this.rate = 0; this.target = 0; this.k = 1; this.loop = null; this.n = 0; this.glide = 0.004;
    this.port.onmessage = e => { const d = e.data;
      if (d.buf) { this.ch = d.buf; this.len = d.buf[0].length; this.k = d.sr / sampleRate; this.pos = 0; }
      if (d.seek != null) this.pos = Math.max(0, Math.min(this.len - 1, d.seek));
      if (d.rate != null) { this.target = d.rate; this.glide = d.glide || 0.004; if (d.jump) this.rate = d.rate; }
      if ('loop' in d) this.loop = d.loop;
    }; }
  process(_, outs) {
    const o = outs[0], L = o[0], R = o[1] || o[0];
    if (!this.ch) return true;
    const A = this.ch[0], B = this.ch[1] || this.ch[0];
    for (let i = 0; i < L.length; i++) {
      this.rate += (this.target - this.rate) * this.glide;
      const p = this.pos, j = Math.floor(p), f = p - j;
      if (j >= 0 && j < this.len - 1) { L[i] = A[j] + (A[j + 1] - A[j]) * f; R[i] = B[j] + (B[j + 1] - B[j]) * f; } else { L[i] = 0; R[i] = 0; }
      this.pos += this.rate * this.k;
      if (this.loop && this.rate > 0 && this.pos >= this.loop[1]) this.pos -= this.loop[1] - this.loop[0];
      if (this.pos < 0) this.pos = 0; if (this.pos > this.len) this.pos = this.len;
    }
    if (++this.n % 6 === 0) this.port.postMessage({ pos: this.pos, rate: this.rate });
    return true;
  }
}
registerProcessor('sheloops-deck', Deck);`;
let ready = null;
async function ctx() {
  const c = await ensureCtx(); if (c.state !== 'running') await c.resume();
  ready ||= c.audioWorklet.addModule(URL.createObjectURL(new Blob([DECK_WORKLET], { type: 'text/javascript' }))).then(build);
  await ready; return c;
}

// ---------- Beat FX and Color FX ----------
export const BEAT_FX = [['echo', 'Echo'], ['delay', 'Delay'], ['pingpong', 'Ping pong'], ['spiral', 'Spiral'], ['reverb', 'Reverb'], ['trans', 'Trans'], ['roll', 'Roll'], ['flanger', 'Flanger'], ['phaser', 'Phaser'], ['filter', 'Filter'], ['crush', 'Crush'], ['noise', 'Noise']];
const INSERT = new Set(['trans', 'roll', 'filter', 'crush']); // these replace the sound instead of adding to it
export const COLOR_FX = [['filter', 'Filter'], ['space', 'Space'], ['dubecho', 'Dub echo'], ['noise', 'Noise'], ['crush', 'Crush']];
const DIVS = [[0.125, '1/8'], [0.25, '1/4'], [0.5, '1/2'], [0.75, '3/4'], [1, '1'], [2, '2'], [4, '4']];
function makeCustom(c, type, beat) {
  if (type === 'pingpong') {
    const i = c.createGain(), o = c.createGain(), dL = c.createDelay(4), dR = c.createDelay(4), fL = c.createGain(), fR = c.createGain(), m = c.createChannelMerger(2), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 5000; dL.delayTime.value = dR.delayTime.value = beat; fL.gain.value = fR.gain.value = 0.55;
    i.connect(lp); lp.connect(dL); dL.connect(fL); fL.connect(dR); dR.connect(fR); fR.connect(dL); dL.connect(m, 0, 0); dR.connect(m, 0, 1); m.connect(o);
    return { in: i, out: o, set() { } };
  }
  if (type === 'spiral') {
    const i = c.createGain(), o = c.createGain(), d = c.createDelay(4), fb = c.createGain(), f = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain();
    d.delayTime.value = beat; fb.gain.value = 0.82; f.type = 'bandpass'; f.Q.value = 2; f.frequency.value = 1200; lfo.frequency.value = 1 / (beat * 8); lg.gain.value = 2400; lfo.connect(lg); lg.connect(f.detune); lfo.start();
    i.connect(d); d.connect(f); f.connect(fb); fb.connect(d); f.connect(o);
    return { in: i, out: o, set() { }, stop() { lfo.stop(); } };
  }
  if (type === 'noise') {
    const i = c.createGain(), o = c.createGain(), len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), dd = b.getChannelData(0); for (let k = 0; k < len; k++) dd[k] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    s.buffer = b; s.loop = true; f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.value = 2500; g.gain.value = 0.25; lfo.frequency.value = 1 / (beat * 4); lg.gain.value = 3000; lfo.connect(lg); lg.connect(f.detune);
    s.connect(f); f.connect(g); g.connect(o); s.start(); lfo.start(); i.connect(o);
    return { in: i, out: o, set() { }, stop() { s.stop(); lfo.stop(); } };
  }
  return null;
}
function beatFxNode(c, type, beat) {
  const custom = makeCustom(c, type, beat); if (custom) return custom;
  const P = {
    echo: ['delay', { time: clamp(beat, 0.03, 1.5), feedback: 0.62, tone: 2600, mix: 1 }], delay: ['delay', { time: clamp(beat, 0.03, 1.5), feedback: 0.3, tone: 7000, mix: 1 }],
    reverb: ['room', { size: 4, tone: 7000, mix: 1 }], trans: ['tremolo', { rate: clamp(1 / beat, 0.5, 16), depth: 1, shape: 1 }], roll: ['repeat', { slice: clamp(beat, 0.03, 0.5), count: 16, mix: 1 }],
    flanger: ['flanger', { rate: clamp(1 / (beat * 4), 0.05, 2), depth: 0.8, feedback: 0.6, mix: 1 }], phaser: ['phaser', { rate: clamp(1 / (beat * 4), 0.05, 3), depth: 0.9, feedback: 0.5, mix: 1 }],
    filter: ['filter', { mode: 0, cutoff: 1200, res: 7, rate: clamp(1 / (beat * 4), 0.01, 2), depth: 0.9 }], crush: ['bitcrush', { bits: 4, tone: 9000, mix: 1 }],
  }[type];
  const f = newFx(P[0], P[1]), n = buildFx(c, f); n.set(f.params, { key: 0, scaleIdx: 2 }, true); return n;
}
function colorNode(c, type) {
  const f = { space: ['room', { size: 3, tone: 6000, mix: 1 }], dubecho: ['delay', { time: 0.375, feedback: 0.7, tone: 1800, mix: 1 }], crush: ['bitcrush', { bits: 5, tone: 8000, mix: 1 }] }[type];
  if (type === 'noise') return makeCustom(c, 'noise', 0.5);
  if (!f) return null;
  const x = newFx(f[0], f[1]), n = buildFx(c, x); n.set(x.params, { key: 0, scaleIdx: 2 }, true); return n;
}

// ---------- audio graph ----------
let G = null;
function deckObj(id) {
  return { id, name: '', buf: null, bpm: 0, pos: 0, rate: 0, playing: false, tempo: 0, cue: 0, hot: [null, null, null, null], loop: null, peaks: null, sync: false, rev: false,
    eq: { hi: 0, mid: 0, lo: 0 }, color: 0, trim: 1, fader: 1, kill: { hi: false, mid: false, lo: false } };
}
export const D = { A: deckObj('A'), B: deckObj('B'), xf: 0, master: 0.9, rec: null };
function build() {
  const c = E.ctx;
  const master = c.createGain(), fxIn = c.createGain(), fxWet = c.createGain(), lim = c.createDynamicsCompressor(), an = c.createAnalyser(), post = c.createGain(), samp = c.createGain();
  lim.threshold.value = -1.5; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1; an.fftSize = 2048; an.smoothingTimeConstant = 0.72;
  master.connect(lim); fxWet.connect(lim); lim.connect(post); post.connect(an); post.connect(c.destination); samp.connect(lim);
  G = { c, master, post, an, samp, mfxIn: fxIn, mfxWet: fxWet, mfx: null, mfxKey: '', ch: {} };
  master.connect(fxIn);
  for (const id of ['A', 'B']) {
    const node = new AudioWorkletNode(c, 'sheloops-deck', { outputChannelCount: [2] });
    const trim = c.createGain(), lo = c.createBiquadFilter(), mid = c.createBiquadFilter(), hi = c.createBiquadFilter(), filt = c.createBiquadFilter(), colIn = c.createGain(), colWet = c.createGain();
    lo.type = 'lowshelf'; lo.frequency.value = 180; mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.7; hi.type = 'highshelf'; hi.frequency.value = 5000; filt.type = 'allpass'; filt.Q.value = 1.4;
    const dry = c.createGain(), wet = c.createGain(), fxIn2 = c.createGain(), fader = c.createGain(), xf = c.createGain(), an2 = c.createAnalyser(); an2.fftSize = 512;
    node.connect(trim); trim.connect(lo); lo.connect(mid); mid.connect(hi); hi.connect(filt); hi.connect(colIn); colWet.connect(dry);
    filt.connect(dry); filt.connect(fxIn2); dry.connect(fader); wet.connect(fader); fader.connect(xf); xf.connect(master); fader.connect(an2);
    node.port.onmessage = e => { const d = D[id]; d.pos = e.data.pos; d.rate = e.data.rate; };
    G.ch[id] = { node, trim, lo, mid, hi, filt, colIn, colWet, col: null, colKey: '', dry, wet, fxIn: fxIn2, fader, xf, an: an2, fx: null, fxKey: '' };
    applyDeck(id);
  }
  applyXf(); applyBeatFx();
}
const sp = (p, v) => p.setTargetAtTime(v, G.c.currentTime, 0.015);
const rateOf = d => d.playing ? (d.rev ? -1 : 1) * (1 + d.tempo / 100) : 0;
function sendRate(id, jump, glide) { if (G) G.ch[id].node.port.postMessage({ rate: rateOf(D[id]), jump, glide }); }
function beatSec(id) { const d = D[id]; return 60 / ((d.bpm || 120) * (1 + d.tempo / 100)); }
function applyDeck(id) {
  if (!G) return; const d = D[id], g = G.ch[id];
  sp(g.trim.gain, d.trim);
  sp(g.lo.gain, d.kill.lo ? -40 : d.eq.lo); sp(g.mid.gain, d.kill.mid ? -40 : d.eq.mid); sp(g.hi.gain, d.kill.hi ? -40 : d.eq.hi);
  const v = d.color, t = DJ.colorType;
  // Color FX: one knob per channel. Filter: left low pass, right high pass. Others: turn either way for more.
  if (t === 'filter' && Math.abs(v) >= 0.03) { if (v < 0) { g.filt.type = 'lowpass'; sp(g.filt.frequency, 20000 * Math.pow(0.006, -v)); } else { g.filt.type = 'highpass'; sp(g.filt.frequency, 20 * Math.pow(400, v)); } }
  else if (t === 'space' && v > 0.03) { g.filt.type = 'highpass'; sp(g.filt.frequency, 20 * Math.pow(60, v)); }
  else if (t === 'space' && v < -0.03) { g.filt.type = 'lowpass'; sp(g.filt.frequency, 20000 * Math.pow(0.1, -v)); }
  else g.filt.type = 'allpass';
  if (g.colKey !== t) { if (g.col) { try { g.colIn.disconnect(); g.col.out.disconnect(); g.col.stop?.(); } catch { } } g.col = colorNode(G.c, t); if (g.col) { g.colIn.connect(g.col.in); g.col.out.connect(g.colWet); } g.colKey = t; }
  sp(g.colWet.gain, g.col ? Math.abs(v) * (t === 'noise' ? 1.2 : 0.9) : 0);
  if (t === 'crush') sp(g.dry.gain, 1 - Math.abs(v) * 0.8); else sp(g.dry.gain, 1);
  sp(g.fader.gain, d.fader);
}
// Beat FX unit: one effect timed to the beat, sent to deck A, deck B or the master
function applyBeatFx() {
  if (!G) return; const f = DJ.beatFx, src = f.assign === 'master' ? (D.A.playing || !D.B.playing ? 'A' : 'B') : f.assign, beat = beatSec(src) * f.div;
  const key = f.type + ':' + Math.round(beat * 1000);
  for (const id of ['A', 'B']) { const g = G.ch[id]; sp(g.wet.gain, 0); sp(g.dry.gain, DJ.colorType === 'crush' ? 1 - Math.abs(D[id].color) * 0.8 : 1); }
  const target = f.assign === 'master' ? { in: G.mfxIn, wet: G.mfxWet, store: G, k: 'mfx' } : { in: G.ch[f.assign].fxIn, wet: G.ch[f.assign].wet, store: G.ch[f.assign], k: 'fx' };
  for (const s of [G, G.ch.A, G.ch.B]) { const k = s === G ? 'mfx' : 'fx'; if (s[k] && s !== target.store) { try { (s === G ? G.mfxIn : s.fxIn).disconnect(); s[k].out.disconnect(); s[k].stop?.(); } catch { } s[k] = null; s[k + 'Key'] = ''; } }
  if (target.store[target.k + 'Key'] !== key) {
    const old = target.store[target.k]; if (old) { try { target.in.disconnect(); old.out.disconnect(); old.stop?.(); } catch { } }
    const n = beatFxNode(G.c, f.type, beat); target.in.connect(n.in); n.out.connect(target.wet); target.store[target.k] = n; target.store[target.k + 'Key'] = key;
  }
  sp(G.mfxWet.gain, f.assign === 'master' && f.on ? f.level : 0);
  if (f.assign !== 'master') { const g = G.ch[f.assign]; sp(g.wet.gain, f.on ? f.level : 0); if (INSERT.has(f.type)) sp(g.dry.gain, f.on ? 1 - f.level : 1); }
  if (f.assign === 'master' && INSERT.has(f.type)) sp(G.master.gain, f.on ? D.master * (1 - f.level) : D.master);
}
function applyXf() {
  if (!G) return; const x = (D.xf + 1) / 2;
  const curve = DJ.curve === 'sharp' ? v => clamp(v * 6, 0, 1) : DJ.curve === 'linear' ? v => v : v => Math.sin(v * Math.PI / 2);
  sp(G.ch.A.xf.gain, curve(1 - x)); sp(G.ch.B.xf.gain, curve(x));
  sp(G.master.gain, DJ.beatFx.on && DJ.beatFx.assign === 'master' && INSERT.has(DJ.beatFx.type) ? D.master * (1 - DJ.beatFx.level) : D.master);
  sp(G.samp.gain, DJ.samplerVol);
}

// ---------- deck actions ----------
function peaksOf(buf) {
  const n = Math.ceil(buf.length / 256), a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a, out = new Float32Array(n * 2);
  // two bands: overall level and a rough bass amount, so the waveform can be colored like a real CDJ
  let lp = 0;
  for (let i = 0; i < n; i++) { let m = 0, lo = 0; for (let j = i * 256; j < Math.min(buf.length, i * 256 + 256); j += 2) { const v = (a[j] + b[j]) / 2; lp += (v - lp) * 0.02; m = Math.max(m, Math.abs(v)); lo = Math.max(lo, Math.abs(lp)); } out[i * 2] = m; out[i * 2 + 1] = Math.min(1, lo * 3); }
  return out;
}
export async function load(id, buf, name) {
  await ctx(); const d = D[id];
  Object.assign(d, { buf, name, pos: 0, cue: 0, hot: [null, null, null, null], loop: null, playing: false, rev: false, peaks: peaksOf(buf) });
  d.bpm = (detectBpm(buf) || {}).bpm || 120;
  const ch = []; for (let k = 0; k < Math.min(2, buf.numberOfChannels); k++) ch.push(buf.getChannelData(k).slice());
  G.ch[id].node.port.postMessage({ buf: ch, sr: buf.sampleRate, loop: null, rate: 0, jump: true });
  toast(`${name} on deck ${id}, ${d.bpm} BPM.`); render();
}
const secOf = d => d.buf ? d.pos / d.buf.sampleRate : 0;
const seek = (id, sec) => { const d = D[id]; if (!d.buf) return; d.pos = clamp(sec, 0, d.buf.duration) * d.buf.sampleRate; G.ch[id].node.port.postMessage({ seek: d.pos }); };
function play(id, on = !D[id].playing) { const d = D[id]; if (!d.buf) return toast(`Load a song on deck ${id} first.`); d.playing = on; d.rev = false; if (on && d.sync) doSync(id, true); sendRate(id); applyBeatFx(); refreshDeck(id); }
function cue(id) { const d = D[id]; if (!d.buf) return; if (d.playing) { d.playing = false; sendRate(id, true); seek(id, d.cue); } else { d.cue = secOf(d); toast(`Cue point set on deck ${id}.`); } refreshDeck(id); }
function hotCue(id, k, set) { const d = D[id]; if (!d.buf) return; if (set || d.hot[k] == null) d.hot[k] = secOf(d); else seek(id, d.hot[k]); refreshDeck(id); }
function setLoop(id, beats) {
  const d = D[id]; if (!d.buf) return;
  if (!beats || (d.loop && d.loop.beats === beats)) { d.loop = null; G.ch[id].node.port.postMessage({ loop: null }); refreshDeck(id); return; }
  const sr = d.buf.sampleRate, s = d.pos, e = s + beats * 60 / d.bpm * sr; d.loop = { beats }; G.ch[id].node.port.postMessage({ loop: [s, e] }); refreshDeck(id);
}
function jump(id, beats) { const d = D[id]; if (!d.buf) return; seek(id, secOf(d) + beats * 60 / d.bpm); }
function doSync(id, quiet) {
  const o = D[id === 'A' ? 'B' : 'A'], d = D[id]; if (!o.buf || !d.buf) return quiet ? null : toast('Load songs on both decks to sync.');
  const target = o.bpm * (1 + o.tempo / 100); d.tempo = clamp((target / d.bpm - 1) * 100, -50, 50); sendRate(id); applyBeatFx();
  if (!quiet) toast(`Deck ${id} locked to ${target.toFixed(1)} BPM.`); refreshDeck(id);
}
function nudge(id, dir) { const d = D[id]; if (!d.playing) return; G.ch[id].node.port.postMessage({ rate: rateOf(d) * (1 + dir * 0.04) }); setTimeout(() => sendRate(id), 250); }
function brake(id) { const d = D[id]; if (!d.playing) return; G.ch[id].node.port.postMessage({ rate: 0, glide: 0.00006 }); setTimeout(() => { d.playing = false; sendRate(id, true); refreshDeck(id); }, 1600); }
function spinback(id) { const d = D[id]; if (!d.playing) return; G.ch[id].node.port.postMessage({ rate: -4, glide: 0.002 }); setTimeout(() => G.ch[id].node.port.postMessage({ rate: 0, glide: 0.0002 }), 500); setTimeout(() => { d.playing = false; sendRate(id, true); refreshDeck(id); }, 1300); }
function reverse(id, on) { const d = D[id]; if (!d.playing) return; d.rev = on; sendRate(id); }

// ---------- sampler ----------
const SAMPLE_CHOICES = ['airhorn', 'siren', 'rewind', 'f_impact', 'f_rev', 'f_up', 'f_down', 'f_noise', 'laser', 'vinyl', 'glitch', 'riser', 'crash', 'o_crash', 'b_boom', 'k_gabber', 's_verb', 'c_rave', 'gong', 'chime'];
async function fire(k) { await ctx(); playDrum(G.c, G.samp, DJ.sampler[k], G.c.currentTime + 0.005, 1); const b = root && root.querySelector(`.spad[data-k="${k}"]`); if (b) { b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); } }

// ---------- transitions ----------
export const TRANSITIONS = [
  ['blend', 'Smooth blend', 'Slow, even fade from one song into the other.'],
  ['bassswap', 'Bass swap', 'Brings the new song in with no bass, then swaps the basses on the beat.'],
  ['filter', 'Filter fade', 'The old song thins out while the new one opens up.'],
  ['echoout', 'Echo out', 'The old song echoes away on the beat, then the new one drops.'],
  ['washout', 'Reverb wash', 'The old song melts into a huge hall of reverb.'],
  ['spinback', 'Spinback', 'Spins the old record backwards, then the new song hits.'],
  ['brake', 'Vinyl brake', 'The old record slows to a stop like the power went out.'],
  ['roll', 'Roll out', 'Rolls the old song into tighter and tighter stutters, then cuts.'],
  ['noise', 'Noise sweep', 'A white noise riser builds, then the new song drops.'],
  ['cut', 'Quick cut', 'Switches right on the next beat.'],
];
let trans = null;
async function transition(style = DJ.transStyle, beats = DJ.transBeats) {
  if (trans) return;
  const from = D.xf <= 0 ? 'A' : 'B', to = from === 'A' ? 'B' : 'A', F = D[from], T = D[to];
  if (!T.buf) return toast(`Load a song on deck ${to} to go to.`);
  if (!F.playing) return toast(`Play deck ${from} first. The transition goes from ${from} to ${to}.`);
  await ctx();
  if (!T.playing) { T.sync = true; doSync(to, true); play(to, true); }
  const dur = beats * beatSec(from) * 1000, t0 = performance.now(), dir = to === 'B' ? 1 : -1, start = D.xf;
  const keep = { Fc: F.color, Tc: T.color, Flo: F.eq.lo, Tlo: T.eq.lo, fx: { ...DJ.beatFx }, ct: DJ.colorType };
  trans = { style };
  const useFx = (type, div) => { Object.assign(DJ.beatFx, { type, div, assign: from, on: true, level: 0 }); applyBeatFx(); };
  if (style === 'echoout') useFx('echo', 0.5); if (style === 'washout') useFx('reverb', 1); if (style === 'roll') useFx('roll', 0.5); if (style === 'noise') useFx('noise', 1);
  if (style === 'bassswap') { T.eq.lo = -40; applyDeck(to); }
  if (style === 'filter') { DJ.colorType = 'filter'; T.color = -0.85; applyDeck(to); }
  const end = () => {
    D.xf = dir; Object.assign(F, { color: keep.Fc }); T.color = keep.Tc; F.eq.lo = keep.Flo; T.eq.lo = keep.Tlo; DJ.beatFx = keep.fx; DJ.colorType = keep.ct;
    if (F.playing) { F.playing = false; sendRate(from); }
    applyDeck(from); applyDeck(to); applyBeatFx(); applyXf(); trans = null; render(); toast(`Now playing deck ${to}.`);
  };
  const step = () => {
    if (!trans) return;
    const p = clamp((performance.now() - t0) / dur, 0, 1), e = p * p * (3 - 2 * p);
    switch (style) {
      case 'cut': D.xf = dir; return end();
      case 'blend': D.xf = start + (dir - start) * e; break;
      case 'bassswap': D.xf = start + (dir - start) * clamp(e * 1.6, 0, 1); if (p > 0.5) { F.eq.lo = -40; T.eq.lo = keep.Tlo; } break;
      case 'filter': F.color = 0.9 * e; T.color = -0.85 * (1 - e); D.xf = start + (dir - start) * e; break;
      case 'echoout': case 'washout': DJ.beatFx.level = Math.min(1, p * 2.5); if (p > 0.45 && F.playing) { F.playing = false; sendRate(from); } D.xf = p > 0.45 ? start + (dir - start) * clamp((p - 0.45) * 3, 0, 1) : start; break;
      case 'roll': DJ.beatFx.level = Math.min(1, p * 3); DJ.beatFx.div = p < 0.4 ? 0.5 : p < 0.7 ? 0.25 : 0.125; if (p > 0.85) D.xf = dir; break;
      case 'noise': DJ.beatFx.level = Math.min(1, e * 1.2); F.color = 0; if (p > 0.92) D.xf = dir; break;
      case 'spinback': if (p < 0.35) G.ch[from].node.port.postMessage({ rate: -3 }); else { if (F.playing) { F.playing = false; sendRate(from); } D.xf = dir; } break;
      case 'brake': G.ch[from].node.port.postMessage({ rate: (1 + F.tempo / 100) * (1 - e) }); D.xf = start + (dir - start) * clamp((p - 0.5) * 2, 0, 1); break;
    }
    applyDeck(from); applyDeck(to); applyBeatFx(); applyXf(); drawXf();
    if (p >= 1) return end();
    requestAnimationFrame(step);
  };
  render(); step();
}

// ---------- recording the mix ----------
let lastMix = null;
async function toggleRec() {
  await ctx();
  if (D.rec) {
    const r = D.rec; D.rec = null; r.node.port.postMessage({ rec: false }); try { G.post.disconnect(r.node); } catch { } r.node.disconnect();
    const len = r.chunks.reduce((a, ch) => a + ch.d[0].length, 0); if (!len) { render(); return; }
    const buf = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: G.c.sampleRate }); let o = 0;
    for (const ch of r.chunks) { buf.copyToChannel(ch.d[0], 0, o); buf.copyToChannel(ch.d[1] || ch.d[0], 1, o); o += ch.d[0].length; }
    lastMix = buf; render(); toast(`Recorded ${Math.round(buf.duration)} seconds. Save it below.`); return;
  }
  const node = new AudioWorkletNode(G.c, 'cap', { channelCount: 2, channelCountMode: 'explicit' }), sink = G.c.createGain(); sink.gain.value = 0;
  G.post.connect(node); node.connect(sink); sink.connect(G.c.destination);
  D.rec = { node, chunks: [], t0: G.c.currentTime }; node.port.onmessage = e => D.rec && D.rec.chunks.push(e.data); node.port.postMessage({ rec: true });
  render(); toast('Recording your mix. Press Stop when you are done.');
}
async function saveMix(kind) {
  if (!lastMix) return toast('Record a mix first.');
  const name = await ask('Name your mix', 'Name', 'My DJ mix'); if (!name) return;
  const wav = () => download(new Blob([encodeWav(lastMix)], { type: 'audio/wav' }), safeName(name) + '.wav');
  if (kind === 'wav') wav();
  else if (kind === 'mp3') { try { download(await encodeMp3(lastMix, { name, artist: (app.P && app.P.artist) || '' }), safeName(name) + '.mp3'); } catch { toast('MP3 is not available here. Saving WAV instead.'); wav(); } }
  else { const id = 's' + uid(); await saveAudio(id, lastMix); await db.put('sounds', id, { id, name, folder: 'DJ mixes', fav: false, kind: 'loop', dur: lastMix.duration, bpm: null, added: Date.now() }); await loadSounds(); toast(`Saved "${name}" in My sounds (DJ mixes).`); }
}

// ---------- crate ----------
const crate = [];
async function bufFor(item) {
  if (item.buf) return item.buf;
  if (item.src === 'sound') return item.buf = await soundBuffer(item.sid);
  if (item.src === 'song') { toast('Rendering your song, one moment...'); return item.buf = await renderMastered(await renderSong()); }
  return null;
}
async function addFiles(files, deck) {
  const c = await ctx(); let first = null;
  for (const f of files) { if (!/^audio\//.test(f.type) && !/\.(mp3|wav|ogg|m4a|flac|aac|webm)$/i.test(f.name)) continue;
    try { const buf = await c.decodeAudioData(await f.arrayBuffer()); const it = { id: uid(), name: f.name.replace(/\.[^.]+$/, ''), src: 'file', buf }; crate.unshift(it); first ||= it; } catch { toast('Could not read ' + f.name); } }
  if (first && deck) await load(deck, first.buf, first.name); else render();
}
async function loadItem(item, deck) { const b = await bufFor(item); if (b) load(deck, b, item.name); }

// ---------- drawing ----------
let root = null, raf = 0, last = performance.now(), held = { strobe: false, blinder: false, blackout: false, fog: 0 };
const labelCache = {};
function labelImg(id) { const u = DJ['img' + id]; if (!u) return null; if (!labelCache[id] || labelCache[id].src !== u) { const im = new Image(); im.src = u; labelCache[id] = im; } return labelCache[id].complete ? labelCache[id] : null; }
const HOTC = ['#ff3b5c', '#ffb020', '#2bd97a', '#2bb3ff'];
const tbuf = new Uint8Array(512);
function meterLevel(id) { if (!G) return 0; const an = G.ch[id].an; an.getByteTimeDomainData(tbuf); let m = 0; for (const v of tbuf) m = Math.max(m, Math.abs(v - 128)); return m / 128; }
function drawPlatter(id) {
  const cv = root.querySelector(`.platter[data-d="${id}"]`); if (!cv) return;
  const d = D[id], dpr = devicePixelRatio, S = cv.width = cv.height = Math.round(cv.clientWidth * dpr), g = cv.getContext('2d'), R = S / 2, ang = secOf(d) * Math.PI * 2 * (33.3 / 60), led = DJ.led;
  g.clearRect(0, 0, S, S); g.save(); g.translate(R, R);
  if (DJ.deckStyle === 'cdj') return drawJog(g, R, d, ang, led, id);
  const pr = R * 0.9, rr = R * 0.82;
  // aluminium platter with strobe dots
  const al = g.createRadialGradient(-R * 0.2, -R * 0.3, R * 0.1, 0, 0, pr); al.addColorStop(0, '#c9ccd2'); al.addColorStop(0.6, '#8d9199'); al.addColorStop(1, '#5d6068');
  g.fillStyle = al; g.beginPath(); g.arc(0, 0, pr, 0, 7); g.fill();
  if (DJ.strobeDots) { g.save(); g.rotate(ang * (1 + (d.playing ? d.tempo / 100 * 30 : 0))); for (let row = 0; row < 3; row++) { const r = pr - R * 0.015 - row * R * 0.022, n = 180 - row * 4; g.fillStyle = row === 1 ? '#2a2c31' : '#3a3d44'; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; g.fillRect(Math.cos(a) * r - 0.8, Math.sin(a) * r - 0.8, 1.6 * dpr * 0.6, 1.6 * dpr * 0.6); } } g.restore(); }
  // strobe light glow at the edge, like the little lamp on a real deck
  const sl = g.createRadialGradient(-pr * 0.9, pr * 0.55, 0, -pr * 0.9, pr * 0.55, R * 0.35); sl.addColorStop(0, 'rgba(255,60,40,0.55)'); sl.addColorStop(1, 'rgba(255,60,40,0)'); g.fillStyle = sl; g.fillRect(-R, -R, 2 * R, 2 * R);
  // record
  g.save(); g.rotate(ang);
  const rec = DJ.record, rc = DJ['rec' + id];
  if (rec === 'picture' && labelImg(id)) { g.save(); g.beginPath(); g.arc(0, 0, rr, 0, 7); g.clip(); g.drawImage(labelImg(id), -rr, -rr, rr * 2, rr * 2); g.restore(); }
  else { g.fillStyle = rec === 'black' ? '#0c0c0e' : rec === 'clear' ? 'rgba(200,220,255,0.18)' : rc; g.beginPath(); g.arc(0, 0, rr, 0, 7); g.fill();
    if (rec === 'splatter') { for (let k = 0; k < 40; k++) { const a = k * 2.39, r = (k * 37 % 100) / 100 * rr * 0.9; g.fillStyle = k % 3 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, R * (0.01 + (k % 5) * 0.006), 0, 7); g.fill(); } } }
  // grooves
  g.lineWidth = Math.max(0.5, dpr * 0.5); for (let r = rr * 0.42; r < rr * 0.985; r += rr * 0.012) { g.strokeStyle = `rgba(255,255,255,${0.025 + (Math.sin(r * 0.9) + 1) * 0.012})`; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); }
  g.restore();
  // light catching the grooves stays still while the record spins
  const sh = g.createConicGradient(-0.6, 0, 0); [[0, 0], [0.06, 0.22], [0.12, 0], [0.5, 0], [0.56, 0.16], [0.62, 0], [1, 0]].forEach(([o, a]) => sh.addColorStop(o, `rgba(255,255,255,${a})`));
  g.fillStyle = sh; g.beginPath(); g.arc(0, 0, rr, 0, 7); g.arc(0, 0, rr * 0.4, 0, 7, true); g.fill('evenodd');
  // label
  g.save(); g.rotate(ang); const im = labelImg(id), lr = rr * 0.36;
  g.beginPath(); g.arc(0, 0, lr, 0, 7); g.clip();
  if (im && rec !== 'picture') g.drawImage(im, -lr, -lr, lr * 2, lr * 2);
  else { g.fillStyle = DJ['label' + id]; g.fillRect(-lr, -lr, lr * 2, lr * 2); g.fillStyle = 'rgba(0,0,0,0.65)'; g.textAlign = 'center'; g.font = `700 ${lr * 0.2}px "Bebas Neue", sans-serif`; g.fillText((d.name || 'SHELOOPS').toUpperCase().slice(0, 18), 0, -lr * 0.3); g.font = `600 ${lr * 0.13}px sans-serif`; g.fillText(`SIDE ${id}  ·  33⅓ RPM`, 0, lr * 0.42); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(0, 0, lr * 0.92, 0, 7); g.stroke(); }
  g.restore();
  const sp1 = g.createRadialGradient(-R * 0.01, -R * 0.01, 0, 0, 0, R * 0.03); sp1.addColorStop(0, '#fff'); sp1.addColorStop(1, '#777'); g.fillStyle = sp1; g.beginPath(); g.arc(0, 0, R * 0.028, 0, 7); g.fill();
  // tonearm: moves in across the record as the song plays
  if (DJ.tonearm) {
    const prog = d.buf ? clamp(secOf(d) / d.buf.duration, 0, 1) : 0, px = R * 0.86, py = -R * 0.8, rS = rr * (0.95 - prog * 0.5), a0 = -0.95;
    const sx = Math.cos(a0 + prog * 0.35) * rS, sy = Math.sin(a0 + prog * 0.35) * rS * -1 * -1;
    g.fillStyle = '#2a2b30'; g.beginPath(); g.arc(px, py, R * 0.09, 0, 7); g.fill(); g.fillStyle = '#9aa0aa'; g.beginPath(); g.arc(px, py, R * 0.05, 0, 7); g.fill();
    g.strokeStyle = '#c4c8cf'; g.lineWidth = R * 0.028; g.lineCap = 'round'; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px - R * 0.1, (py + sy) / 2, sx + R * 0.05, sy - R * 0.05); g.stroke();
    g.fillStyle = '#16171a'; g.save(); g.translate(sx, sy); g.rotate(-0.6); g.fillRect(-R * 0.03, -R * 0.07, R * 0.08, R * 0.12); g.fillStyle = led; g.fillRect(-R * 0.01, R * 0.03, R * 0.02, R * 0.02); g.restore();
  }
  g.restore();
}
function drawJog(g, R, d, ang, led, id) {
  const dpr = devicePixelRatio;
  const ring = g.createRadialGradient(0, -R * 0.4, R * 0.2, 0, 0, R * 0.95); ring.addColorStop(0, '#5a5d66'); ring.addColorStop(1, '#1d1e22'); g.fillStyle = ring; g.beginPath(); g.arc(0, 0, R * 0.95, 0, 7); g.fill();
  g.save(); g.rotate(ang); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = dpr; for (let k = 0; k < 90; k++) { g.rotate(Math.PI / 45); g.beginPath(); g.moveTo(R * 0.78, 0); g.lineTo(R * 0.92, 0); g.stroke(); } g.restore();
  // LED ring shows the position
  const prog = d.buf ? secOf(d) / d.buf.duration : 0;
  g.lineWidth = R * 0.035; g.strokeStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.arc(0, 0, R * 0.72, 0, 7); g.stroke();
  g.strokeStyle = led; g.shadowColor = led; g.shadowBlur = 12 * dpr; g.beginPath(); g.arc(0, 0, R * 0.72, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); g.stroke(); g.shadowBlur = 0;
  g.save(); g.rotate(ang); g.fillStyle = '#fff'; g.shadowColor = led; g.shadowBlur = 10 * dpr; g.fillRect(-R * 0.012, -R * 0.72 - R * 0.04, R * 0.024, R * 0.08); g.restore(); g.shadowBlur = 0;
  // center display
  g.fillStyle = '#05070a'; g.beginPath(); g.arc(0, 0, R * 0.6, 0, 7); g.fill();
  const im = labelImg(id); if (im) { g.save(); g.globalAlpha = 0.35; g.beginPath(); g.arc(0, 0, R * 0.58, 0, 7); g.clip(); g.rotate(ang); g.drawImage(im, -R * 0.58, -R * 0.58, R * 1.16, R * 1.16); g.restore(); }
  g.fillStyle = '#e8f3ff'; g.textAlign = 'center'; g.font = `600 ${R * 0.14}px "Cascadia Mono", monospace`;
  const left = d.buf ? d.buf.duration - secOf(d) : 0; g.fillText(`-${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, 0, R * 0.02);
  g.font = `600 ${R * 0.08}px "Cascadia Mono", monospace`; g.fillStyle = led; g.fillText(`${(d.bpm * (1 + d.tempo / 100) || 0).toFixed(1)} BPM`, 0, R * 0.2); g.fillStyle = '#7a8090'; g.fillText(`${d.tempo >= 0 ? '+' : ''}${d.tempo.toFixed(1)}%`, 0, R * 0.34);
  g.restore();
}
function drawWave(id) {
  const cv = root.querySelector(`.wave2[data-d="${id}"]`); if (!cv) return;
  const d = D[id], dpr = devicePixelRatio, W = cv.width = Math.round(cv.clientWidth * dpr), H = cv.height = Math.round(cv.clientHeight * dpr), g = cv.getContext('2d'); g.clearRect(0, 0, W, H);
  if (!d.peaks) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.font = `${11 * dpr}px "Cascadia Mono", monospace`; g.textAlign = 'center'; g.fillText('DROP A TRACK', W / 2, H / 2 + 4 * dpr); return; }
  const spp = 256, view = 6 * d.buf.sampleRate / spp, c0 = d.pos / spp - view / 2, n = d.peaks.length / 2;
  const bp = 60 / d.bpm * d.buf.sampleRate / spp; for (let b = Math.ceil(c0 / bp), k = b; k * bp < c0 + view; k++) { g.fillStyle = k % 4 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)'; g.fillRect((k * bp - c0) / view * W, 0, 1, H); }
  // colored like a real CDJ: bass in deep color, the rest in light
  for (let x = 0; x < W; x += 2) {
    const i = Math.floor(c0 + x / W * view); if (i < 0 || i >= n) continue;
    const v = d.peaks[i * 2] * H * 0.48, lo = d.peaks[i * 2 + 1] * H * 0.48, past = x < W / 2;
    g.fillStyle = past ? 'rgba(120,130,150,0.55)' : '#d9e6ff'; g.fillRect(x, H / 2 - v, 1.6, v * 2);
    g.fillStyle = past ? 'rgba(60,70,120,0.7)' : (id === 'A' ? '#ff2bd6' : '#2b9bff'); g.fillRect(x, H / 2 - Math.min(v, lo), 1.6, Math.min(v, lo) * 2);
  }
  for (const [k, t] of d.hot.entries()) if (t != null) { const x = (t * d.buf.sampleRate / spp - c0) / view * W; g.fillStyle = HOTC[k]; g.fillRect(x, 0, 2 * dpr, H); g.fillRect(x, 0, 8 * dpr, 6 * dpr); }
  if (d.loop) { g.fillStyle = 'rgba(43,217,122,0.12)'; g.fillRect(W / 2, 0, W / 2, H); }
  g.fillStyle = '#ff3b3b'; g.shadowColor = '#ff3b3b'; g.shadowBlur = 8 * dpr; g.fillRect(W / 2 - dpr, 0, 2 * dpr, H); g.shadowBlur = 0;
  const ov = root.querySelector(`.overview[data-d="${id}"]`); if (ov) ov.style.setProperty('--p', (secOf(d) / d.buf.duration * 100).toFixed(2) + '%');
  const t = root.querySelector(`.dtime[data-d="${id}"]`); if (t) { const left = d.buf.duration - secOf(d); t.textContent = `-${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}   ${(d.bpm * (1 + d.tempo / 100)).toFixed(1)} BPM   ${d.tempo >= 0 ? '+' : ''}${d.tempo.toFixed(1)}%`; }
}
const fbuf = new Uint8Array(1024), wbuf = new Uint8Array(2048);
let autoNext = 0;
function lightState() {
  // follow the deck you hear most
  const w = (D.xf + 1) / 2, main = (D.B.playing && (w > 0.5 || !D.A.playing)) ? 'B' : 'A', d = D[main];
  const bpm = d.playing && d.bpm ? d.bpm * (1 + d.tempo / 100) : 120, beat = d.playing && d.buf ? secOf(d) * d.bpm / 60 : performance.now() / 1000 * 2;
  if (G) { G.an.getByteFrequencyData(fbuf); G.an.getByteTimeDomainData(wbuf); }
  const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += fbuf[i]; return s / (b - a) / 255; };
  const L = DJ.L, ph = performance.now();
  if (L.auto && beat > autoNext) { autoNext = Math.floor(beat / 16 + 1) * 16; L.pattern = PATTERNS[Math.floor(Math.random() * (PATTERNS.length - 1))][0]; if (Math.random() < 0.35) L.laser = LASERS[1 + Math.floor(Math.random() * (LASERS.length - 1))][0]; if (Math.random() < 0.3) L.wall = WALLS[1 + Math.floor(Math.random() * (WALLS.length - 1))][0]; }
  const strobeOn = held.strobe && Math.floor(ph / (1000 / L.strobeRate / 2)) % 2 === 0;
  return { t: ph / 1000, beat, bpm, bass: avg(1, 6), mids: avg(10, 60), highs: avg(100, 300), spec: fbuf, wave: wbuf, strobeOn, blinder: held.blinder, blackout: held.blackout };
}
function drawStage() {
  const cv = root.querySelector('.stage'); if (!cv) return;
  const A = lightState(), led = getComputedStyle(document.documentElement).getPropertyValue('--led').trim() || '#ff2bd6';
  const S = { ...DJ.L, accent: led, accent2: DJ.led, haze: clamp(DJ.L.haze + held.fog, 0, 1) };
  drawRig(cv, S, A);
  root.style.setProperty('--bass', A.bass.toFixed(3));
  held.fog = Math.max(0, held.fog - 0.004);
}
function drawXf() { const x = root && root.querySelector('.xfader input'); if (x && document.activeElement !== x) x.value = D.xf; }
function frame() {
  if (!root || !root.isConnected) { raf = 0; return; }
  for (const id of ['A', 'B']) { drawPlatter(id); drawWave(id); const m = root.querySelector(`.vu[data-d="${id}"]`); if (m) m.style.setProperty('--l', meterLevel(id).toFixed(3)); }
  drawStage(); drawXf();
  const rt = root.querySelector('.rectime'); if (rt && D.rec) { const s = G.c.currentTime - D.rec.t0; rt.textContent = `REC ${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
  raf = requestAnimationFrame(frame);
}

// ---------- UI ----------
const dial = (label, min, max, step, val, on, fmt, help, cls = 'dial') => knob(label, min, max, step, val, on, fmt || (v => String(Math.round(v * 100) / 100)), help, cls);
const sect = (title, help, ...kids) => el('div', { class: 'dsect' }, el('div', { class: 'dsect-t' }, title, help ? helpBtn(help) : null), ...kids);
function refreshDeck(id) { const old = root && root.querySelector(`.deck[data-d="${id}"]`); if (old) old.replaceWith(deckUI(id)); else render(); }
function deckUI(id) {
  const d = D[id];
  const plat = el('canvas', { class: 'platter', 'data-d': id, title: 'Drag the record to scratch. While it plays, drag to nudge it.' });
  plat.addEventListener('pointerdown', e => {
    if (!d.buf) return; e.preventDefault(); plat.setPointerCapture(e.pointerId);
    const r = plat.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let la = Math.atan2(e.clientY - cy, e.clientX - cx), lt = performance.now();
    plat.classList.add('grab');
    plat.onpointermove = ev => {
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx), t = performance.now(); let da = a - la; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      const secs = da / (2 * Math.PI) * 60 / 33.3, dts = Math.max(0.004, (t - lt) / 1000), rate = clamp(secs / dts, -8, 8);
      G.ch[id].node.port.postMessage({ rate: d.playing && DJ.deckStyle === 'cdj' ? rateOf(d) + rate * 0.3 : rate, jump: true }); la = a; lt = t;
    };
    plat.onpointerup = () => { plat.onpointermove = null; plat.classList.remove('grab'); sendRate(id, false, 0.02); };
  });
  const hold = (label, title, down, up, cls = '') => el('button', { class: 'hw sm ' + cls, title, onpointerdown: down, onpointerup: up, onpointerleave: up }, label);
  const deck = el('div', { class: 'deck', 'data-d': id },
    el('div', { class: 'dhead' }, el('span', { class: 'dletter' }, id), el('div', { class: 'dinfo' }, el('b', { class: 'dname' }, d.name || 'No track loaded'), el('span', { class: 'dtime', 'data-d': id }, d.buf ? '' : 'Drag a song here, or click A / B in your crate')), helpBtn('djDeck')),
    el('canvas', { class: 'wave2', 'data-d': id }),
    el('div', { class: 'overview', 'data-d': id, title: 'Click anywhere to jump there', onclick: e => { if (!d.buf) return; const r = e.currentTarget.getBoundingClientRect(); seek(id, (e.clientX - r.left) / r.width * d.buf.duration); } }),
    el('div', { class: 'dbody' },
      el('div', { class: 'plinth' }, plat),
      el('div', { class: 'dside' },
        el('div', { class: 'tempo' }, el('small', {}, 'TEMPO'), el('input', { type: 'range', min: -DJ.range, max: DJ.range, step: 0.01, value: -d.tempo, title: 'Speed. Down is faster, like a real deck. Double-click to reset.', oninput: e => { d.tempo = -e.target.value; d.sync = false; sendRate(id); applyBeatFx(); }, ondblclick: e => { d.tempo = 0; e.target.value = 0; sendRate(id); } }), el('small', {}, `±${DJ.range}`)),
        el('div', { class: 'nudge' }, el('button', { class: 'hw sm', title: 'Slow down for a moment to line up the beats', onclick: () => nudge(id, -1) }, '−'), el('button', { class: 'hw sm', title: 'Speed up for a moment', onclick: () => nudge(id, 1) }, '+')))),
    el('div', { class: 'transport' },
      el('button', { class: 'hw round cue', title: 'Stopped: saves a cue point. Playing: jumps back to it and stops.', onclick: () => cue(id) }, 'CUE'),
      el('button', { class: 'hw round play' + (d.playing ? ' on' : ''), onclick: () => play(id) }, d.playing ? '❚❚' : '▶'),
      el('div', { class: 'tricks' },
        el('button', { class: 'hw sm sync' + (d.sync ? ' on' : ''), title: 'Locks the speed to the other deck', onclick: () => { d.sync = !d.sync; if (d.sync) doSync(id); else refreshDeck(id); } }, 'SYNC'),
        el('button', { class: 'hw sm', title: 'Jump back 4 beats', onclick: () => jump(id, -4) }, '◀◀ 4'), el('button', { class: 'hw sm', title: 'Jump forward 4 beats', onclick: () => jump(id, 4) }, '4 ▶▶'),
        hold('REV', 'Hold to play backwards (censor)', () => reverse(id, true), () => reverse(id, false)),
        el('button', { class: 'hw sm', title: 'Vinyl brake: slows to a stop', onclick: () => brake(id) }, 'BRAKE'),
        el('button', { class: 'hw sm', title: 'Spinback: spins the record backwards', onclick: () => spinback(id) }, 'SPIN'))),
    el('div', { class: 'pads2' },
      el('div', { class: 'row' }, el('small', {}, 'HOT CUE'), ...d.hot.map((h, k) => el('button', { class: 'hcue' + (h != null ? ' set' : ''), style: `--hc:${HOTC[k]}`, title: 'Click to save or jump. Shift+click to move it here. Right-click to clear.', onclick: e => hotCue(id, k, e.shiftKey), oncontextmenu: e => { e.preventDefault(); d.hot[k] = null; refreshDeck(id); } }, k + 1))),
      el('div', { class: 'row' }, el('small', {}, 'BEAT LOOP'), ...[0.5, 1, 2, 4, 8, 16].map(b => el('button', { class: 'lpad' + (d.loop && d.loop.beats === b ? ' on' : ''), title: `Loop ${b} beat${b === 1 ? '' : 's'}`, onclick: () => setLoop(id, b) }, b === 0.5 ? '½' : b)))));
  deck.addEventListener('dragover', e => { e.preventDefault(); deck.classList.add('over'); });
  deck.addEventListener('dragleave', () => deck.classList.remove('over'));
  deck.addEventListener('drop', async e => { e.preventDefault(); deck.classList.remove('over'); const cid = e.dataTransfer.getData('sheloops/crate'); if (cid) { const it = crate.find(x => x.id === cid); if (it) loadItem(it, id); return; } if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files], id); });
  return deck;
}
function channelUI(id) {
  const d = D[id], set = fn => { fn(); applyDeck(id); };
  const eqk = (band, label) => el('div', { class: 'eqk' }, dial(label, -26, 6, 0.5, d.eq[band], v => set(() => d.eq[band] = v), v => (v > 0 ? '+' : '') + v.toFixed(0), null, 'dial sm'),
    el('button', { class: 'kill' + (d.kill[band] ? ' on' : ''), title: 'Kill: cuts this part of the sound completely', onclick: e => { set(() => d.kill[band] = !d.kill[band]); e.target.classList.toggle('on', d.kill[band]); } }, 'KILL'));
  const ct = (COLOR_FX.find(x => x[0] === DJ.colorType) || COLOR_FX[0])[1];
  return el('div', { class: 'chan', 'data-d': id },
    el('b', { class: 'chname' }, 'CH ' + id),
    dial('Trim', 0, 2, 0.01, d.trim, v => set(() => d.trim = v), v => Math.round(v * 100) + '', null, 'dial sm'),
    eqk('hi', 'Hi'), eqk('mid', 'Mid'), eqk('lo', 'Low'),
    dial(ct, -1, 1, 0.01, d.color, v => set(() => d.color = v), v => Math.abs(v) < 0.03 ? '·' : (v < 0 ? '◀ ' : '') + Math.round(Math.abs(v) * 100) + (v > 0 ? ' ▶' : ''), 'djColor', 'dial colorfx'),
    el('div', { class: 'faderrow' }, el('div', { class: 'vu', 'data-d': id }), el('input', { class: 'vfader', type: 'range', min: 0, max: 1, step: 0.01, value: d.fader, title: 'Channel fader', oninput: e => set(() => d.fader = +e.target.value) })));
}
function mixerUI() {
  const f = DJ.beatFx, setF = (k, v, re) => { f[k] = v; saveDJ(); applyBeatFx(); applyXf(); if (re) renderMixer(); };
  return el('div', { class: 'djmixer' },
    el('div', { class: 'mixtop' }, el('b', {}, 'MIXER'), helpBtn('djMixer')),
    el('div', { class: 'colorsel' }, el('small', {}, 'COLOR FX'), ...COLOR_FX.map(([k, l]) => el('button', { class: 'csel' + (DJ.colorType === k ? ' on' : ''), onclick: () => { DJ.colorType = k; saveDJ(); applyDeck('A'); applyDeck('B'); renderMixer(); } }, l))),
    el('div', { class: 'chans' }, channelUI('A'), el('div', { class: 'mmid' }, dial('Master', 0, 1.2, 0.01, D.master, v => { D.master = v; applyXf(); }, v => Math.round(v * 100) + '', null, 'dial'), dial('Sampler', 0, 1.2, 0.01, DJ.samplerVol, v => { DJ.samplerVol = v; saveDJ(); applyXf(); }, v => Math.round(v * 100) + '', null, 'dial sm')), channelUI('B')),
    el('div', { class: 'beatfx' },
      el('div', { class: 'bfxhead' }, el('small', {}, 'BEAT FX'), helpBtn('djBeatFx'), el('span', { class: 'bfxlcd' }, `${(BEAT_FX.find(x => x[0] === f.type) || [])[1]}  ${(DIVS.find(x => x[0] === f.div) || [0, '1'])[1]}  ${f.assign === 'master' ? 'MST' : 'CH ' + f.assign}`)),
      el('div', { class: 'bfxtypes' }, ...BEAT_FX.map(([k, l]) => el('button', { class: 'csel' + (f.type === k ? ' on' : ''), onclick: () => setF('type', k, true) }, l))),
      el('div', { class: 'bfxrow' }, el('small', {}, 'BEAT'), ...DIVS.map(([v, l]) => el('button', { class: 'csel' + (f.div === v ? ' on' : ''), onclick: () => setF('div', v, true) }, l))),
      el('div', { class: 'bfxrow' }, el('small', {}, 'TO'), ...[['A', 'CH A'], ['master', 'MASTER'], ['B', 'CH B']].map(([v, l]) => el('button', { class: 'csel' + (f.assign === v ? ' on' : ''), onclick: () => setF('assign', v, true) }, l)),
        dial('Level', 0, 1, 0.01, f.level, v => setF('level', v), v => Math.round(v * 100) + '', null, 'dial sm'),
        el('button', { class: 'hw fxon' + (f.on ? ' on' : ''), title: 'Turns Beat FX on or off (your FX key works too)', onclick: e => { setF('on', !f.on); e.currentTarget.classList.toggle('on', f.on); } }, 'ON / OFF'))),
    el('div', { class: 'xfader' }, el('small', {}, 'A'), el('input', { type: 'range', min: -1, max: 1, step: 0.005, value: D.xf, title: 'Crossfader: left plays A, right plays B', oninput: e => { D.xf = +e.target.value; applyXf(); } }), el('small', {}, 'B')),
    el('div', { class: 'xfopts' }, el('small', {}, 'CURVE'), ...[['smooth', 'Blend'], ['linear', 'Linear'], ['sharp', 'Cut (scratch)']].map(([v, l]) => el('button', { class: 'csel' + (DJ.curve === v ? ' on' : ''), onclick: () => { DJ.curve = v; saveDJ(); applyXf(); renderMixer(); } }, l))));
}
function renderMixer() { const old = root && root.querySelector('.djmixer'); if (old) old.replaceWith(mixerUI()); }
function samplerUI() {
  return el('div', { class: 'sampler panel' },
    el('div', { class: 'fxtop' }, el('b', {}, 'Sampler'), helpBtn('djSampler'), el('span', { class: 'hint' }, 'Keys 1 to 8. Right-click a pad to change its sound.')),
    el('div', { class: 'spads' }, ...DJ.sampler.map((s, k) => el('button', { class: 'spad', 'data-k': k, onpointerdown: () => fire(k), oncontextmenu: async e => {
      e.preventDefault(); const pick = await ask('Sampler pad ' + (k + 1), 'Sound (' + SAMPLE_CHOICES.join(', ') + ')', s); if (pick && PERC_NAMES[pick] || pick && ['crash'].includes(pick)) { DJ.sampler[k] = pick; saveDJ(); render(); } else if (pick) toast('Pick one of the listed sounds.');
    } }, el('span', {}, k + 1), el('b', {}, (PERC_NAMES[s] || s).replace(/ /g, ' '))))));
}
function transUI() {
  return el('div', { class: 'trans panel' },
    el('div', { class: 'fxtop' }, el('b', {}, 'Transitions'), helpBtn('djTrans'), el('span', { class: 'spacer' }),
      el('small', { class: 'hint' }, 'Length'), ...[2, 4, 8, 16, 32].map(b => el('button', { class: 'csel' + (DJ.transBeats === b ? ' on' : ''), onclick: () => { DJ.transBeats = b; saveDJ(); render(); } }, b + ' beats'))),
    el('div', { class: 'transgrid' }, ...TRANSITIONS.map(([k, n, w]) => el('button', { class: 'tbtn' + (DJ.transStyle === k ? ' on' : '') + (trans && trans.style === k ? ' running' : ''), title: w, onclick: () => { DJ.transStyle = k; saveDJ(); transition(k); } }, el('b', {}, n), el('small', {}, w)))),
    el('div', { class: 'explain' }, 'A transition goes from the deck you hear now to the other deck. Load both decks, play one, then click a transition. The other deck starts by itself, locked to the same speed.'));
}
function crateUI() {
  const list = el('div', { class: 'cratelist' });
  const row = it => el('div', { class: 'crow', draggable: 'true', ondragstart: e => e.dataTransfer.setData('sheloops/crate', it.id) },
    el('span', { class: 'cgrip' }, '⠿'), el('span', { class: 'cname' }, it.name), el('small', {}, it.src === 'file' ? 'device' : it.src === 'song' ? 'studio' : 'my sounds'),
    el('button', { class: 'hw sm', title: 'Load on deck A', onclick: () => loadItem(it, 'A') }, 'A'), el('button', { class: 'hw sm', title: 'Load on deck B', onclick: () => loadItem(it, 'B') }, 'B'));
  const items = [...crate];
  if (app.P && !items.some(x => x.src === 'song')) items.unshift({ id: 'song', name: app.P.name + ' (your song)', src: 'song' });
  for (const s of SOUNDS.filter(s => s.kind === 'loop' || s.dur > 6)) if (!items.some(x => x.sid === s.id)) items.push({ id: 'snd' + s.id, name: s.name, src: 'sound', sid: s.id });
  for (const it of items) if (!crate.includes(it)) crate.push(it);
  list.append(...items.map(row));
  if (!items.length) list.append(el('p', { class: 'hint' }, 'No tracks yet. Drop music files here or onto a deck.'));
  const box = el('div', { class: 'crate panel' },
    el('div', { class: 'fxtop' }, el('b', {}, 'Crate'), helpBtn('djCrate'), el('span', { class: 'spacer' }),
      el('button', { class: 'hot', onclick: () => { const i = el('input', { type: 'file', accept: 'audio/*', multiple: true }); i.onchange = () => addFiles([...i.files]); i.click(); } }, '+ Add music from my device')),
    el('div', { class: 'explain' }, 'Drag a track onto a deck, or click A or B. Drop music files from your computer here. Your Studio song and your loops from My sounds and the Pad machine are listed too.'),
    list);
  box.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); box.classList.add('over'); } });
  box.addEventListener('dragleave', () => box.classList.remove('over'));
  box.addEventListener('drop', e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); box.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
  return box;
}
function recUI() {
  return el('div', { class: 'djrec panel' },
    el('div', { class: 'fxtop' }, el('b', {}, 'Record your mix'), helpBtn('djRec')),
    el('div', { class: 'fxtop' }, el('button', { class: 'hw recbtn' + (D.rec ? ' on' : ''), onclick: toggleRec }, D.rec ? '■ STOP' : '● REC'), el('span', { class: 'rectime' }, D.rec ? 'REC 0:00' : lastMix ? `Last mix ${Math.round(lastMix.duration)}s` : 'Not recording')),
    lastMix ? el('div', { class: 'fxtop' }, el('button', { class: 'hot', onclick: () => saveMix('sounds') }, 'Save to My sounds'), el('button', { onclick: () => saveMix('wav') }, 'Download WAV'), el('button', { onclick: () => saveMix('mp3') }, 'Download MP3')) : null);
}
// the light desk: everything about the light show
function lightDesk() {
  const L = DJ.L, set = (k, v, re = true) => { L[k] = v; saveDJ(); if (re) renderDesk(); };
  const chips = (k, opts) => el('div', { class: 'fxlib' }, ...opts.map(([v, l]) => el('button', { class: 'csel' + (L[k] === v ? ' on' : ''), onclick: () => set(k, v) }, l)));
  const scenes = [...Object.keys(SCENES), 'Rainbow', 'Theme', 'Custom'];
  const sw = s => s === 'Rainbow' ? 'linear-gradient(90deg,#f33,#ff3,#3f3,#3ff,#33f,#f3f)' : s === 'Theme' ? 'linear-gradient(90deg,var(--led),' + DJ.led + ')' : s === 'Custom' ? `linear-gradient(90deg,${L.c1},${L.c2})` : `linear-gradient(90deg,${SCENES[s].join(',')})`;
  const holdBtn = (k, label, title) => el('button', { class: 'hw live ' + k, title, onpointerdown: () => { held[k] = true; }, onpointerup: () => { held[k] = false; }, onpointerleave: () => { held[k] = false; } }, label);
  return el('div', { class: 'lightdesk panel' },
    el('div', { class: 'fxtop' }, el('b', {}, 'Light desk'), helpBtn('djLights'), el('span', { class: 'spacer' }),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: L.auto, onchange: e => set('auto', e.target.checked) }), 'Auto show (changes with the music every 16 beats)')),
    el('div', { class: 'deskgrid' },
      sect('Scene', 'djLights', el('div', { class: 'scenes' }, ...scenes.map(s => el('button', { class: 'scene' + (L.scene === s ? ' on' : ''), onclick: () => set('scene', s) }, el('i', { style: `background:${sw(s)}` }), s))),
        L.scene === 'Custom' ? el('div', { class: 'knobrow' }, el('label', { class: 'num' }, 'Color 1', el('input', { type: 'color', value: L.c1, oninput: e => set('c1', e.target.value, false) })), el('label', { class: 'num' }, 'Color 2', el('input', { type: 'color', value: L.c2, oninput: e => set('c2', e.target.value, false) }))) : null,
        el('div', { class: 'bfxrow' }, el('small', {}, 'COLOR CHANGE'), ...[[1, '1 beat'], [4, '1 bar'], [8, '2 bars'], [16, '4 bars'], [9999, 'Never']].map(([v, l]) => el('button', { class: 'csel' + (L.colorBeats === v ? ' on' : ''), onclick: () => set('colorBeats', v) }, l)))),
      sect('Moving heads', null, chips('pattern', PATTERNS),
        el('div', { class: 'bfxrow' }, el('small', {}, 'SPEED'), ...[[0.25, '¼'], [0.5, '½'], [1, '1x'], [2, '2x'], [4, '4x']].map(([v, l]) => el('button', { class: 'csel' + (L.speed === v ? ' on' : ''), onclick: () => set('speed', v) }, l))),
        el('div', { class: 'knobrow' }, dial('Fixtures', 2, 14, 1, L.heads, v => set('heads', v, false), v => v + '', null, 'dial sm'), dial('Spread', 0.2, 2, 0.01, L.spread, v => set('spread', v, false), v => Math.round(v * 100) + '', null, 'dial sm'), dial('Beam width', 0.3, 3, 0.01, L.width, v => set('width', v, false), v => Math.round(v * 100) + '', null, 'dial sm'), dial('Intensity', 0, 1, 0.01, L.intensity, v => set('intensity', v, false), v => Math.round(v * 100) + '', null, 'dial sm'))),
      sect('Atmosphere', null,
        el('div', { class: 'knobrow' }, dial('Haze', 0, 1, 0.01, L.haze, v => set('haze', v, false), v => Math.round(v * 100) + '', null, 'dial sm'), dial('Bloom', 0, 1.5, 0.01, L.bloom, v => set('bloom', v, false), v => Math.round(v * 100) + '', null, 'dial sm')),
        el('div', { class: 'fxlib' }, ...[['floor', 'Floor reflection'], ['grain', 'Film grain'], ['beatPulse', 'Pulse on the kick'], ['flicker', 'Flicker']].map(([k, l]) => el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!L[k], onchange: e => set(k, e.target.checked, false) }), l)))),
      sect('Lasers', null, chips('laser', LASERS), el('div', { class: 'fxlib' }, el('button', { class: 'csel' + (L.laserColor === 'scene' ? ' on' : ''), onclick: () => set('laserColor', 'scene') }, 'Scene color'), el('input', { type: 'color', value: L.laserColor === 'scene' ? '#39ff14' : L.laserColor, oninput: e => set('laserColor', e.target.value, false) }))),
      sect('LED wall (visualizer)', null, chips('wall', WALLS), dial('Brightness', 0.1, 1, 0.01, L.wallLevel, v => set('wallLevel', v, false), v => Math.round(v * 100) + '', null, 'dial sm')),
      sect('Live', null,
        el('div', { class: 'livebtns' }, holdBtn('strobe', 'STROBE', 'Hold for strobe'), holdBtn('blinder', 'BLINDER', 'Hold: blinding white lights on the crowd'), holdBtn('blackout', 'BLACKOUT', 'Hold: all lights off, for a drop'),
          el('button', { class: 'hw live fog', title: 'A burst of smoke', onclick: () => { held.fog = 0.4; } }, 'FOG')),
        el('div', { class: 'bfxrow' }, el('small', {}, 'STROBE RATE'), ...[[4, '1/4'], [8, '1/8'], [16, '1/16']].map(([v, l]) => el('button', { class: 'csel' + (L.strobeRate === v ? ' on' : ''), onclick: () => set('strobeRate', v) }, l))))));
}
function renderDesk() { const old = root && root.querySelector('.lightdesk'); if (old) old.replaceWith(lightDesk()); }
function customUI() {
  const set = (k, v, re = true) => { DJ[k] = v; saveDJ(); if (re) render(); };
  const color = (k, label) => el('label', { class: 'num' }, label, el('input', { type: 'color', value: DJ[k], oninput: e => set(k, e.target.value, false) }));
  const chips = (k, opts) => el('div', { class: 'fxlib' }, ...opts.map(([v, l]) => el('button', { class: 'csel' + (DJ[k] === v ? ' on' : ''), onclick: () => set(k, v) }, l)));
  const pickImg = id => { const i = el('input', { type: 'file', accept: 'image/*' }); i.onchange = () => { const f = i.files[0]; if (!f) return; const im = new Image(); im.onload = () => { const cv = el('canvas', { width: 360, height: 360 }), g = cv.getContext('2d'), s = Math.min(im.width, im.height); g.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 360, 360); set('img' + id, cv.toDataURL('image/jpeg', 0.85)); }; im.src = URL.createObjectURL(f); }; i.click(); };
  const keyBtn = (act, label) => el('button', { class: 'keybind', onclick: e => { const b = e.currentTarget; b.querySelector('kbd').textContent = '...'; const h = ev => { ev.preventDefault(); ev.stopPropagation(); removeEventListener('keydown', h, true); DJ.keys[act] = ev.key.toLowerCase(); saveDJ(); render(); }; addEventListener('keydown', h, true); } }, el('small', {}, label), el('kbd', {}, (DJ.keys[act] || '').toUpperCase()));
  return el('details', { class: 'djcustom panel', open: !!DJ.customOpen, ontoggle: e => { DJ.customOpen = e.target.open; saveDJ(); } },
    el('summary', {}, 'Customize your booth', helpBtn('djCustom')),
    el('div', { class: 'deskgrid' },
      sect('Decks', null, chips('deckStyle', [['vinyl', 'Turntables'], ['cdj', 'CDJ players']]),
        el('div', { class: 'fxlib' }, el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: DJ.tonearm, onchange: e => set('tonearm', e.target.checked) }), 'Tonearm'), el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: DJ.strobeDots, onchange: e => set('strobeDots', e.target.checked) }), 'Platter strobe dots')),
        chips('range', [[8, 'Tempo ±8%'], [16, '±16%'], [50, '±50%']])),
      sect('Booth', null, chips('material', [['matte', 'Matte black'], ['aluminum', 'Brushed aluminium'], ['white', 'Studio white'], ['carbon', 'Carbon'], ['wood', 'Walnut'], ['glass', 'Smoked glass']]), el('div', { class: 'knobrow' }, color('led', 'LED color'))),
      sect('Vinyl', null, chips('record', [['black', 'Black'], ['color', 'Colored'], ['clear', 'Clear'], ['splatter', 'Splatter'], ['picture', 'Picture disc']]),
        el('div', { class: 'knobrow' }, color('recA', 'Vinyl A'), color('labelA', 'Label A'), color('recB', 'Vinyl B'), color('labelB', 'Label B'))),
      sect('Your art on the records', null, el('div', { class: 'fxlib' },
        el('button', { onclick: () => pickImg('A') }, DJ.imgA ? 'Change art A' : 'Art on deck A'), DJ.imgA ? el('button', { class: 'sq', onclick: () => set('imgA', null) }, '×') : null,
        el('button', { onclick: () => pickImg('B') }, DJ.imgB ? 'Change art B' : 'Art on deck B'), DJ.imgB ? el('button', { class: 'sq', onclick: () => set('imgB', null) }, '×') : null),
        el('small', { class: 'hint' }, 'Shows on the label, or across the whole record with Picture disc. On CDJs it glows in the middle screen.')),
      sect('Keys (click one, then press a key)', null, el('div', { class: 'fxlib' },
        ...[['playA', 'Play A'], ['cueA', 'Cue A'], ['syncA', 'Sync A'], ['playB', 'Play B'], ['cueB', 'Cue B'], ['syncB', 'Sync B'], ['xfLeft', 'Fader left'], ['xfRight', 'Fader right'], ['trans', 'Transition'], ['fx', 'Beat FX on/off'], ['strobe', 'Strobe (hold)'], ['blinder', 'Blinder (hold)'], ['blackout', 'Blackout (hold)'], ['rec', 'Record mix']].map(([a, l]) => keyBtn(a, l)))),
      sect('Reset', null, el('button', { onclick: () => { const keep = { imgA: DJ.imgA, imgB: DJ.imgB }; Object.assign(DJ, JSON.parse(JSON.stringify(DEF)), keep); saveDJ(); render(); } }, 'Reset the whole booth look'))));
}
export function renderDJ() {
  const view = $('#view'); view.innerHTML = '';
  root = el('div', { class: `djpage mat-${DJ.material} deck-${DJ.deckStyle}`, style: `--djled:${DJ.led}` });
  const stage = el('div', { class: 'stagewrap' }, el('canvas', { class: 'stage' }),
    el('div', { class: 'stagectl' }, el('span', { class: 'stagetitle' }, 'LIVE'), el('span', { class: 'spacer' }),
      el('button', { class: 'hw sm', title: 'Full screen light show', onclick: () => { const w = root.querySelector('.stagewrap'); (document.fullscreenElement ? document.exitFullscreen() : w.requestFullscreen()).catch(() => { }); } }, '⛶ FULL SCREEN')));
  root.append(
    el('div', { class: 'ptop' }, el('h1', {}, 'DJ booth'), helpBtn('dj'), el('span', { class: 'spacer' }), el('span', { class: 'hint' }, `Keys: ${DJ.keys.playA.toUpperCase()} play A, ${DJ.keys.playB.toUpperCase()} play B, ${DJ.keys.trans.toUpperCase()} transition, 1 to 8 sampler. Change them in Customize.`)),
    el('div', { class: 'explain djsteps' }, el('b', {}, 'Start mixing: '), '1. Drag a track onto deck A and another onto deck B. 2. Press ▶ on A. 3. Press SYNC on B so both run at the same speed. 4. Click a transition, or slide the crossfader yourself. Shape each channel with Hi, Mid and Low, the Color FX knob, and Beat FX. Drag the record to scratch. Run the lights from the Light desk.'),
    stage,
    el('div', { class: 'booth' }, deckUI('A'), mixerUI(), deckUI('B')),
    el('div', { class: 'djrow2' }, transUI(), samplerUI()),
    lightDesk(),
    el('div', { class: 'djbottom' }, crateUI(), el('div', { class: 'djright' }, recUI(), customUI())));
  view.append(root);
  if (!raf) raf = requestAnimationFrame(frame);
  if (!SOUNDS.length) loadSounds().then(() => app.view === 'dj' && render());
  ctx().catch(() => { });
}
function render() { if (app.view === 'dj' && root && root.isConnected) { const y = scrollY; renderDJ(); scrollTo(0, y); } }

// ---------- keys ----------
addEventListener('keydown', e => {
  if (app.view !== 'dj' || e.ctrlKey || e.metaKey || e.altKey || e.target.matches('input:not([type=range]), select, textarea') || document.querySelector('.modal-wrap')) return;
  const k = e.key.toLowerCase();
  if (/^[1-8]$/.test(k)) { e.preventDefault(); if (!e.repeat) fire(+k - 1); return; }
  const K = DJ.keys, act = Object.keys(K).find(a => K[a] === k); if (!act) return;
  e.preventDefault(); if (e.repeat && act !== 'xfLeft' && act !== 'xfRight') return;
  ({ playA: () => play('A'), playB: () => play('B'), cueA: () => cue('A'), cueB: () => cue('B'), syncA: () => doSync('A'), syncB: () => doSync('B'),
    xfLeft: () => { D.xf = clamp(D.xf - 0.1, -1, 1); applyXf(); }, xfRight: () => { D.xf = clamp(D.xf + 0.1, -1, 1); applyXf(); }, trans: () => transition(),
    fx: () => { DJ.beatFx.on = !DJ.beatFx.on; applyBeatFx(); applyXf(); renderMixer(); },
    strobe: () => held.strobe = true, blinder: () => held.blinder = true, blackout: () => held.blackout = true, rec: () => toggleRec() })[act]();
});
addEventListener('keyup', e => { if (app.view !== 'dj') return; const k = e.key.toLowerCase(), K = DJ.keys; if (k === K.strobe) held.strobe = false; if (k === K.blinder) held.blinder = false; if (k === K.blackout) held.blackout = false; });
