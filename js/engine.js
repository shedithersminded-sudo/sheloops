// Audio engine: graph, instruments, transport, recording, export.
import { app, barDur, stepDur, songEnd, selTrack, emit, patData } from './state.js';
import { settings, audioCache } from './store.js';
import { clamp } from './util.js';
import { PITCH_WORKLET, DENOISE_WORKLET, buildFx } from './fx.js';
import { SCALES } from './beat.js';
import { playString, playExtra, EXTRA_ENGINES, playPerc, PERC } from './instruments.js';

const WORKLET = `
class Cap extends AudioWorkletProcessor {
  constructor() { super(); this.on = false; this.port.onmessage = e => { this.on = e.data.rec; }; }
  process(inputs) {
    const i = inputs[0];
    if (this.on && i && i[0]) this.port.postMessage({ t: currentTime, d: i.map(c => c.slice(0)) });
    return true;
  }
}
registerProcessor('cap', Cap);
class Gate extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'threshold', defaultValue: -50 }, { name: 'on', defaultValue: 0 }]; }
  constructor() { super(); this.env = 0; this.g = 1; }
  process(ins, outs, p) {
    const i = ins[0], o = outs[0];
    if (!i || !i.length) return true;
    const on = p.on[0] > 0.5, th = Math.pow(10, p.threshold[0] / 20), n = o[0].length;
    for (let s = 0; s < n; s++) {
      let m = 0;
      for (let c = 0; c < i.length; c++) { const v = Math.abs(i[c][s]); if (v > m) m = v; }
      this.env = m > this.env ? m : this.env * 0.9997;
      const target = (!on || this.env > th) ? 1 : 0;
      this.g += (target - this.g) * (target > this.g ? 0.02 : 0.0008);
      for (let c = 0; c < o.length; c++) o[c][s] = (i[c] || i[0])[s] * this.g;
    }
    return true;
  }
}
registerProcessor('gate', Gate);
// Lookahead peak limiter: output never goes above the ceiling.
class Limit extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'ceiling', defaultValue: -1 }, { name: 'release', defaultValue: 0.08 }]; }
  constructor() { super(); this.LA = Math.round(sampleRate * 0.005); this.N = 1024; this.buf = [new Float32Array(1024), new Float32Array(1024)]; this.pk = new Float32Array(1024); this.w = 0; this.g = 1; this.t = 0; this.dq = new Int32Array(1024); this.dv = new Float32Array(1024); this.h = 0; this.e = 0; }
  process(ins, outs, P) {
    const i = ins[0], o = outs[0]; if (!o || !o.length) return true;
    const n = o[0].length, c = Math.pow(10, P.ceiling[0] / 20), rel = 1 - Math.exp(-1 / (P.release[0] * sampleRate)), M = this.N - 1, LA = this.LA;
    for (let s = 0; s < n; s++) {
      let m = 0;
      for (let ch = 0; ch < 2; ch++) { const x = i && i.length ? (i[ch] || i[0])[s] : 0; this.buf[ch][this.w] = x; const a = Math.abs(x); if (a > m) m = a; }
      // monotonic deque of (time, value): front is the max of the last LA+1 samples
      while (this.e > this.h && this.dv[(this.e - 1) & M] <= m) this.e--;
      this.dq[this.e & M] = this.t; this.dv[this.e & M] = m; this.e++;
      while (this.dq[this.h & M] < this.t - LA) this.h++;
      const env = this.dv[this.h & M]; this.t++;
      const tgt = env > c ? c / env : 1;
      this.g = tgt < this.g ? tgt : this.g + (tgt - this.g) * rel;
      const r = (this.w - LA + this.N) & M;
      for (let ch = 0; ch < o.length; ch++) { let y = this.buf[Math.min(ch, 1)][r] * this.g; if (y > c) y = c; else if (y < -c) y = -c; o[ch][s] = y; }
      this.w = (this.w + 1) & M;
    }
    return true;
  }
}
registerProcessor('limit', Limit);` + PITCH_WORKLET + DENOISE_WORKLET;
const workletURL = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));

export const E = { ctx: null, g: null, mic: null, ready: null };

export function ensureCtx() {
  E.ready ||= (async () => {
    const opts = { latencyHint: settings.latency };
    if (settings.sampleRate) opts.sampleRate = settings.sampleRate;
    const c = new AudioContext(opts);
    if (settings.outputId && c.setSinkId) await c.setSinkId(settings.outputId).catch(() => { });
    await c.audioWorklet.addModule(workletURL);
    E.ctx = c; E.g = buildGraph(c, true);
    return c;
  })();
  return E.ready.then(async c => { if (c.state === 'suspended') await c.resume(); return c; });
}
export const latency = () => E.ctx ? (E.ctx.outputLatency || 0) + (E.ctx.baseLatency || 0) : 0;

// ---------- graph ----------
export function makeImpulse(c, dur) {
  const len = Math.floor(c.sampleRate * dur), b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return b;
}
export const MASTER_DEFAULTS = { on: false, style: '', lowcut: 25, bass: 0, warmth: 0, clarity: 0, air: 0, harsh: 0, glue: 0, width: 1, loud: 0, ceiling: -1, match: 0 };
export function masterOf(P) {
  const m = P.master.chain ||= {};
  for (const [k, v] of Object.entries(MASTER_DEFAULTS)) if (m[k] === undefined) m[k] = v;
  return m;
}

// Mastering chain: EQ, harshness control, glue compressor, warmth, stereo width, loudness. Bypass blends to dry.
function buildMasterChain(c) {
  const inp = c.createGain(), out = c.createGain(), dry = c.createGain(), wet = c.createGain();
  inp.connect(dry); dry.connect(out); wet.connect(out);
  const lc = c.createBiquadFilter(), bass = c.createBiquadFilter(), clar = c.createBiquadFilter(), air = c.createBiquadFilter();
  lc.type = 'highpass'; lc.Q.value = 0.707;
  bass.type = 'lowshelf'; bass.frequency.value = 110;
  clar.type = 'peaking'; clar.frequency.value = 3000; clar.Q.value = 0.7;
  air.type = 'highshelf'; air.frequency.value = 11000;
  const harsh = buildFx(c, { type: 'deess' }), sat = buildFx(c, { type: 'sat' });
  const glue = c.createDynamicsCompressor(), glueMk = c.createGain();
  glue.attack.value = 0.02; glue.release.value = 0.25; glue.knee.value = 8;
  // mid/side width
  const spl = c.createChannelSplitter(2), mrg = c.createChannelMerger(2);
  const mL = c.createGain(), mR = c.createGain(), sL = c.createGain(), sR = c.createGain(), Mg = c.createGain(), Sg = c.createGain(), inv = c.createGain();
  mL.gain.value = 0.5; mR.gain.value = 0.5; sL.gain.value = 0.5; sR.gain.value = -0.5; inv.gain.value = -1;
  spl.connect(mL, 0); spl.connect(mR, 1); spl.connect(sL, 0); spl.connect(sR, 1);
  mL.connect(Mg); mR.connect(Mg); sL.connect(Sg); sR.connect(Sg);
  Mg.connect(mrg, 0, 0); Mg.connect(mrg, 0, 1); Sg.connect(mrg, 0, 0); Sg.connect(inv); inv.connect(mrg, 0, 1);
  const loud = c.createGain();
  inp.connect(lc); lc.connect(bass); bass.connect(clar); clar.connect(air); air.connect(harsh.in);
  harsh.out.connect(glue); glue.connect(glueMk); glueMk.connect(sat.in); sat.out.connect(spl); mrg.connect(loud); loud.connect(wet);
  return { in: inp, out, dry, wet, lc, bass, clar, air, harsh, sat, glue, glueMk, Sg, loud };
}
function applyMaster(g, instant, bypass) {
  const m = masterOf(app.P), M = g.M, on = m.on && !bypass;
  setP(M.wet.gain, on ? 1 : 0, g, instant);
  // the loudness match only applies to the live Before/After switch, never to renders
  setP(M.dry.gain, on ? 0 : (g.live && E.masterBefore ? Math.pow(10, (m.match || 0) / 20) : 1), g, instant);
  setP(M.lc.frequency, m.lowcut, g, instant); setP(M.bass.gain, m.bass, g, instant);
  setP(M.clar.gain, m.clarity, g, instant); setP(M.air.gain, m.air, g, instant);
  M.harsh.set({ amount: m.harsh, freq: 5500 }, null, instant);
  M.sat.set({ drive: m.warmth * 0.6, mix: m.warmth > 0 ? 1 : 0 }, null, instant);
  setP(M.glue.threshold, -4 - m.glue * 22, g, instant); setP(M.glue.ratio, 1.5 + m.glue * 2.5, g, instant);
  setP(M.glueMk.gain, Math.pow(10, (m.glue * 5) / 20), g, instant);
  setP(M.Sg.gain, m.width, g, instant);
  setP(M.loud.gain, Math.pow(10, m.loud / 20), g, instant);
  g.lim.parameters.get('ceiling').value = on ? m.ceiling : -0.3;
}
function kWeight(c, src) {
  const hs = c.createBiquadFilter(), hp = c.createBiquadFilter();
  hs.type = 'highshelf'; hs.frequency.value = 1681; hs.gain.value = 4; hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.5;
  src.connect(hs); hs.connect(hp); return hp;
}
function buildGraph(c, live) {
  const master = c.createGain();
  const M = buildMasterChain(c);
  master.connect(M.in);
  const lim = new AudioWorkletNode(c, 'limit', { outputChannelCount: [2] });
  const post = c.createGain();
  M.out.connect(lim); lim.connect(post); post.connect(c.destination);
  let analyser = null, kL = null, kR = null;
  if (live) {
    analyser = c.createAnalyser(); analyser.fftSize = 1024; post.connect(analyser);
    const k = kWeight(c, post), sp = c.createChannelSplitter(2);
    k.connect(sp); kL = c.createAnalyser(); kR = c.createAnalyser(); kL.fftSize = kR.fftSize = 16384;
    sp.connect(kL, 0); sp.connect(kR, 1);
  }
  const rev = c.createConvolver(); rev.buffer = makeImpulse(c, app.P ? app.P.master.revSize : 2.5);
  rev.connect(master);
  const dly = c.createDelay(4), fb = c.createGain(), dlyF = c.createBiquadFilter();
  dlyF.type = 'lowpass'; dlyF.frequency.value = 3500;
  dly.connect(dlyF); dlyF.connect(fb); fb.connect(dly); dlyF.connect(master);
  const beatBus = c.createGain();
  let beatAn = null; if (live) { beatAn = c.createAnalyser(); beatAn.fftSize = 512; beatBus.connect(beatAn); }
  const g = { c, live, master, M, lim, post, analyser, kL, kR, rev, dly, fb, beatBus, beatAn, beatDest: null, nodes: {}, buses: {} };
  if (app.P) applyMix(g, true);
  return g;
}
// kind: 'vocal' (default for song tracks), 'beat', 'bus'
export function nodeFor(g, t, isBeat, kind) {
  let n = g.nodes[t.id];
  if (n) return n;
  kind ||= isBeat ? 'beat' : 'vocal';
  const c = g.c;
  n = { kind, input: c.createGain(), vol: c.createGain(), auto: c.createGain(), pan: c.createStereoPanner(), rs: c.createGain(), ds: c.createGain(), gate: null, dest: null };
  let head = n.input;
  if (kind === 'vocal') { n.gate = new AudioWorkletNode(c, 'gate', { outputChannelCount: [2] }); n.input.connect(n.gate); head = n.gate; }
  if (kind !== 'beat') { n.fxIn = c.createGain(); n.fxOut = c.createGain(); head.connect(n.fxIn); n.fxIn.connect(n.fxOut); n.fx = []; n.sig = ''; head = n.fxOut; }
  head.connect(n.vol); n.vol.connect(n.auto); n.auto.connect(n.pan);
  n.pan.connect(n.rs); n.rs.connect(g.rev); n.pan.connect(n.ds); n.ds.connect(g.dly);
  if (g.live) { n.an = c.createAnalyser(); n.an.fftSize = 512; n.pan.connect(n.an); }
  route(n, kind === 'beat' ? g.beatBus : g.master);
  g.nodes[t.id] = n;
  return n;
}
function route(n, target) {
  if (n.dest === target) return;
  if (n.dest) { try { n.pan.disconnect(n.dest); } catch { } }
  n.pan.connect(target); n.dest = target;
}
export function resetNodes() {
  if (!E.g) return;
  for (const n of Object.values(E.g.nodes)) { n.pan.disconnect(); n.dest = null; }
  E.g.nodes = {};
  if (E.mic) E.mic.mon.disconnect();
}
const audible = (t, list) => !t.mute && (!list.some(x => x.solo) || t.solo);
function setP(p, v, g, instant) { if (instant) p.value = v; else p.setTargetAtTime(v, g.c.currentTime, 0.015); }
export function applyMix(g = E.g, instant = false, only = null, bypassMaster = false) {
  const P = app.P; if (!g || !P) return;
  P.buses ||= [];
  setP(g.master.gain, P.master.vol, g, instant);
  setP(g.dly.delayTime, clamp(stepDur() * P.master.delayDiv, 0.01, 3.9), g, instant);
  setP(g.fb.gain, P.master.delayFb, g, instant);
  applyMaster(g, instant, bypassMaster || (g.live && E.masterBefore));
  // groups (buses)
  const busIn = id => { const b = P.buses.find(x => x.id === id); return b ? nodeFor(g, b, false, 'bus').input : g.master; };
  for (const b of P.buses) {
    const n = nodeFor(g, b, false, 'bus');
    setP(n.vol.gain, b.mute ? 0 : b.vol, g, instant); setP(n.pan.pan, b.pan || 0, g, instant);
    setP(n.rs.gain, b.mute ? 0 : (b.rev || 0), g, instant); setP(n.ds.gain, b.mute ? 0 : (b.dly || 0), g, instant);
    syncFx(g, n, b, instant);
  }
  const songList = [...P.tracks, P.beat];
  const beatOn = only ? only === 'beat' : audible(P.beat, songList);
  setP(g.beatBus.gain, beatOn ? P.beat.vol : 0, g, instant);
  const bt = busIn(P.beat.bus);
  if (g.beatDest !== bt) { if (g.beatDest) { try { g.beatBus.disconnect(g.beatDest); } catch { } } g.beatBus.connect(bt); g.beatDest = bt; }
  // sends skip the group, so scale them by the group's level (a muted group is fully silent)
  const busF = id => { const b = P.buses.find(x => x.id === id); return b ? (b.mute ? 0 : b.vol) : 1; };
  for (const t of P.tracks) {
    const n = nodeFor(g, t, false), on = only ? only === t.id : audible(t, songList), bf = busF(t.bus);
    route(n, busIn(t.bus));
    setP(n.vol.gain, on ? t.vol : 0, g, instant); setP(n.pan.pan, t.pan, g, instant);
    setP(n.rs.gain, on ? t.rev * bf : 0, g, instant); setP(n.ds.gain, on ? t.dly * bf : 0, g, instant);
    n.gate.parameters.get('on').value = t.gate ? 1 : 0;
    n.gate.parameters.get('threshold').value = t.gateDb;
    syncFx(g, n, t, instant);
  }
  const sendScale = beatOn ? P.beat.vol * busF(P.beat.bus) : 0;
  for (const t of P.beat.tracks) {
    const n = nodeFor(g, t, true), on = audible(t, P.beat.tracks);
    setP(n.vol.gain, on ? t.vol : 0, g, instant); setP(n.pan.pan, t.pan, g, instant);
    setP(n.rs.gain, on ? t.rev * sendScale : 0, g, instant); setP(n.ds.gain, on ? t.dly * sendScale : 0, g, instant);
  }
}
// ---------- automation (track volume) ----------
export function autoValue(pts, pos) {
  if (!pts || !pts.length) return 1;
  if (pos <= pts[0].t) return pts[0].v;
  for (let i = 1; i < pts.length; i++) if (pos <= pts[i].t) { const a = pts[i - 1], b = pts[i]; return a.v + (b.v - a.v) * (pos - a.t) / Math.max(1e-6, b.t - a.t); }
  return pts[pts.length - 1].v;
}
function scheduleAuto(g, ctx0, pos0, end) {
  for (const t of app.P.tracks) {
    const n = nodeFor(g, t, false), p = n.auto.gain, pts = t.auto || [];
    p.cancelScheduledValues(ctx0);
    p.setValueAtTime(autoValue(pts, pos0), ctx0);
    for (const q of pts) if (q.t > pos0 && q.t < end) p.linearRampToValueAtTime(q.v, ctx0 + q.t - pos0);
    if (pts.length) p.linearRampToValueAtTime(autoValue(pts, end), ctx0 + end - pos0);
  }
}
function resetAuto(g) {
  if (!g) return;
  for (const t of app.P.tracks) { const n = g.nodes[t.id]; if (n) { n.auto.gain.cancelScheduledValues(0); n.auto.gain.value = 1; } }
}
// ---------- meters ----------
const mBuf = new Float32Array(16384);
export function levelOf(id) {
  const g = E.g; if (!g) return 0;
  const an = id === 'master' ? g.analyser : id === 'beat' ? g.beatAn : (g.nodes[id] || {}).an;
  return an ? peakOf(an) : 0;
}
export function momentaryLufs() {
  const g = E.g; if (!g || !g.kL) return -Infinity;
  let sum = 0;
  for (const an of [g.kL, g.kR]) { an.getFloatTimeDomainData(mBuf); let s = 0; for (let i = 0; i < an.fftSize; i++) s += mBuf[i] * mBuf[i]; sum += s / an.fftSize; }
  return sum > 0 ? -0.691 + 10 * Math.log10(sum) : -Infinity;
}
// Run only the master chain over an already rendered mix (fast, used by Auto master).
export async function renderMastered(dry) {
  const oc = new OfflineAudioContext(2, dry.length, dry.sampleRate);
  await oc.audioWorklet.addModule(workletURL);
  const M = buildMasterChain(oc), lim = new AudioWorkletNode(oc, 'limit', { outputChannelCount: [2] });
  const src = oc.createBufferSource(); src.buffer = dry;
  src.connect(M.in); M.out.connect(lim); lim.connect(oc.destination);
  applyMaster({ c: oc, M, lim, live: false }, true, false);
  src.start();
  return oc.startRendering();
}
// Integrated loudness (ITU-R BS.1770 style, gated) and sample peak of a rendered buffer.
export async function measureLoudness(buf) {
  const sr = buf.sampleRate, oc = new OfflineAudioContext(buf.numberOfChannels, buf.length, sr);
  const s = oc.createBufferSource(); s.buffer = buf; kWeight(oc, s).connect(oc.destination); s.start();
  const k = await oc.startRendering();
  const blk = Math.floor(sr * 0.4), hop = Math.floor(sr * 0.1), chans = [];
  for (let c = 0; c < k.numberOfChannels; c++) chans.push(k.getChannelData(c));
  const zs = [];
  for (let i = 0; i + blk <= k.length; i += hop) {
    let z = 0; for (const d of chans) { let q = 0; for (let j = i; j < i + blk; j += 2) q += d[j] * d[j]; z += q / (blk / 2); }
    zs.push(z);
  }
  const L = z => -0.691 + 10 * Math.log10(z);
  let g1 = zs.filter(z => z > 0 && L(z) > -70);
  if (!g1.length) return { lufs: -Infinity, peak: -Infinity };
  const rel = L(g1.reduce((a, z) => a + z, 0) / g1.length) - 10;
  const g2 = g1.filter(z => L(z) > rel);
  let pk = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; } }
  // band energy for the auto master (low < 150 Hz, high > 6 kHz), relative to full band
  const band = async (type, f) => {
    const o2 = new OfflineAudioContext(1, buf.length, sr), s2 = o2.createBufferSource(), fl = o2.createBiquadFilter();
    s2.buffer = buf; fl.type = type; fl.frequency.value = f; s2.connect(fl); fl.connect(o2.destination); s2.start();
    const r = (await o2.startRendering()).getChannelData(0); let q = 0; for (let i = 0; i < r.length; i += 4) q += r[i] * r[i]; return q;
  };
  let full = 0; { const d = buf.getChannelData(0); for (let i = 0; i < d.length; i += 4) full += d[i] * d[i]; }
  const low = await band('lowpass', 150), high = await band('highpass', 6000);
  let side = 0, mid = 0;
  if (buf.numberOfChannels > 1) { const l = buf.getChannelData(0), r = buf.getChannelData(1); for (let i = 0; i < l.length; i += 4) { const m = l[i] + r[i], sd = l[i] - r[i]; mid += m * m; side += sd * sd; } }
  const db = v => 10 * Math.log10(Math.max(1e-12, v));
  return { lufs: L(g2.reduce((a, z) => a + z, 0) / g2.length), peak: 20 * Math.log10(Math.max(1e-9, pk)),
    lowDb: db(low) - db(full), highDb: db(high) - db(full), widthDb: db(side) - db(mid) };
}
// Effect chain: rebuild when the list changes, otherwise just update parameters.
function songKeyInfo() {
  const B = app.P.beat, idx = Object.keys(SCALES).indexOf(B.scale);
  const map = { off: 0, major: 1, minor: 2, 'pentatonic minor': 3, 'pentatonic major': 4, blues: 5, dorian: 6 };
  return { key: B.key, scaleIdx: map[B.scale] ?? (idx < 0 ? 0 : idx) };
}
function syncFx(g, n, t, instant) {
  const list = (t.fx || []).filter(f => f.on && !t.fxBypass);
  const sig = list.map(f => f.id).join(',');
  if (sig !== n.sig) {
    n.fxIn.disconnect();
    for (const x of n.fx) { try { x.node.out.disconnect(); x.node.stop?.(); } catch { } }
    n.fx = list.map(f => ({ id: f.id, node: buildFx(g.c, f) }));
    let prev = n.fxIn;
    for (const x of n.fx) { prev.connect(x.node.in); prev = x.node.out; }
    prev.connect(n.fxOut);
    n.sig = sig;
    instant = true;
  }
  const info = songKeyInfo();
  n.fx.forEach((x, i) => x.node.set(list[i].params, info, instant));
}
export function setReverbSize(v) { if (E.g) E.g.rev.buffer = makeImpulse(E.ctx, v); }

// ---------- instruments ----------
const noiseCache = new WeakMap();
function noise(c) {
  let b = noiseCache.get(c);
  if (!b) {
    b = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(c, b);
  }
  return b;
}
function decayEnv(p, t, peak, dec) { p.setValueAtTime(peak, t); p.exponentialRampToValueAtTime(0.0001, t + dec); }
function noiseHit(c, dest, t, vel, type, freq, dec, q = 0.7) {
  const s = c.createBufferSource(); s.buffer = noise(c);
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); decayEnv(g.gain, t, vel, dec);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t, Math.random() * 0.5); s.stop(t + dec + 0.05);
}
function toneHit(c, dest, t, vel, wave, f0, f1, pdec, dec) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = wave; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + pdec);
  decayEnv(g.gain, t, vel, dec);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dec + 0.05);
}
const driveCurve = (() => { const c = new Float32Array(256); for (let i = 0; i < 256; i++) c[i] = Math.tanh((i / 128 - 1) * 2.2); return c; })();
export function playDrum(c, dest, sound, t, vel) {
  if (PERC.includes(sound)) return playPerc(c, dest, sound, t, vel);
  switch (sound) {
    case 'kick': toneHit(c, dest, t, vel, 'sine', 160, 42, 0.12, 0.45); noiseHit(c, dest, t, vel * 0.25, 'highpass', 3000, 0.01); break;
    case 'snare': noiseHit(c, dest, t, vel * 0.6, 'highpass', 1200, 0.18); toneHit(c, dest, t, vel * 0.45, 'triangle', 200, 150, 0.08, 0.1); break;
    case 'clap':
      [0, 0.011, 0.023].forEach(o => noiseHit(c, dest, t + o, vel * 0.5, 'bandpass', 1400, 0.03, 1.4));
      noiseHit(c, dest, t + 0.03, vel * 0.5, 'bandpass', 1300, 0.2, 1.2); break;
    case 'hat': noiseHit(c, dest, t, vel * 0.35, 'highpass', 7500, 0.05); break;
    case 'openhat': noiseHit(c, dest, t, vel * 0.3, 'highpass', 7000, 0.35); break;
    case 'tom': toneHit(c, dest, t, vel * 0.8, 'sine', 210, 95, 0.2, 0.32); break;
    case 'rim': toneHit(c, dest, t, vel * 0.4, 'triangle', 1700, 1600, 0.02, 0.04); noiseHit(c, dest, t, vel * 0.2, 'bandpass', 2500, 0.02, 3); break;
    case '808': {
      const o = c.createOscillator(), g = c.createGain(), sh = c.createWaveShaper(); sh.curve = driveCurve;
      o.type = 'sine'; o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.08);
      decayEnv(g.gain, t, vel * 0.9, 1.1);
      o.connect(sh); sh.connect(g); g.connect(dest); o.start(t); o.stop(t + 1.2); break;
    }
  }
}
export function playNote(c, dest, syn, midi, t, dur, vel = 0.8, sample = null) {
  const eng = syn.engine || 'synth';
  if (eng === 'piano') return playPiano(c, dest, syn, midi, t, dur, vel);
  if (eng === 'guitar' || eng.startsWith('gtr-') || ['banjo', 'harp', 'koto', 'sitar'].includes(eng)) return playString(c, dest, syn, midi, t, dur, vel);
  if (EXTRA_ENGINES.has(eng)) return playExtra(c, dest, syn, midi, t, dur, vel);
  if (eng === 'sampler') return playSampler(c, dest, syn, midi, t, dur, vel, sample);
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const flt = c.createBiquadFilter(), g = c.createGain();
  flt.type = 'lowpass'; flt.Q.value = syn.res;
  const a = Math.max(0.002, syn.attack), r = Math.max(0.02, syn.release);
  const end = t + Math.max(dur, a + 0.01);
  flt.frequency.setValueAtTime(Math.min(18000, syn.cutoff * (1 + syn.env * 4)), t);
  flt.frequency.exponentialRampToValueAtTime(Math.max(40, syn.cutoff), t + 0.1 + 0.3 * (1 - syn.sustain));
  const peak = vel * 0.28, sus = peak * syn.sustain + 0.0001;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.linearRampToValueAtTime(sus, Math.max(t + a + 0.001, Math.min(end, t + a + 0.25)));
  g.gain.setValueAtTime(sus, end);
  g.gain.exponentialRampToValueAtTime(0.0001, end + r);
  flt.connect(g); g.connect(dest);
  for (const d of syn.detune ? [-syn.detune, syn.detune] : [0]) {
    const o = c.createOscillator(); o.type = syn.wave; o.frequency.value = f; o.detune.value = d;
    const og = c.createGain(); og.gain.value = syn.detune ? 0.55 : 0.8;
    o.connect(og); og.connect(flt); o.start(t); o.stop(end + r + 0.05);
  }
}
// Piano: decaying harmonics, low notes ring longer.
function playPiano(c, dest, syn, midi, t, dur, vel) {
  const f = 440 * Math.pow(2, (midi - 69) / 12), end = t + Math.max(dur, 0.05), r = Math.max(0.08, syn.release);
  const ring = clamp(2.6 - (midi - 36) * 0.035, 0.5, 3);
  const flt = c.createBiquadFilter(), out = c.createGain();
  flt.type = 'lowpass'; flt.frequency.value = Math.min(16000, syn.cutoff); out.gain.value = vel * 0.22;
  flt.connect(out); out.connect(dest);
  const parts = [[1, 1], [2, 0.45], [3, 0.25], [4, 0.12], [5, 0.08], [6, 0.04]];
  for (const [h, amp] of parts) {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = f * h * (1 + 0.0004 * h * h);
    const tau = ring / (1 + (h - 1) * 0.8);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.004, tau / 3);
    g.gain.setTargetAtTime(0, end, r / 4);
    o.connect(g); g.connect(flt); o.start(t); o.stop(end + r + 0.1);
  }
  noiseHit(c, flt, t, vel * 0.05, 'bandpass', Math.min(8000, f * 6), 0.02, 1);
}
// Guitar: Karplus-Strong plucked string, cached per note.
const ksCache = new Map();
export function ksBuffer(c, midi) {
  const key = c.sampleRate + ':' + midi;
  if (ksCache.has(key)) return ksCache.get(key);
  const sr = c.sampleRate, f = 440 * Math.pow(2, (midi - 69) / 12), N = Math.max(2, Math.floor(sr / f - 0.5));
  const len = Math.floor(sr * 2.5), b = c.createBuffer(1, len, sr), y = b.getChannelData(0);
  const decay = 0.996 + Math.min(0.0035, (60 - Math.min(60, midi)) * 0.00006);
  for (let i = 0; i < N; i++) y[i] = (Math.random() * 2 - 1) * 0.8;
  for (let i = N; i < len; i++) y[i] = decay * 0.5 * (y[i - N] + y[Math.max(0, i - N - 1)]);
  const res = { b, rate: f / (sr / (N + 0.5)) };
  ksCache.set(key, res);
  return res;
}
function playGuitar(c, dest, syn, midi, t, dur, vel) {
  const { b, rate } = ksBuffer(c, midi), end = t + Math.max(dur, 0.05), r = Math.max(0.05, syn.release);
  const s = c.createBufferSource(), g = c.createGain(), flt = c.createBiquadFilter();
  s.buffer = b; s.playbackRate.value = rate;
  flt.type = 'lowpass'; flt.frequency.value = Math.min(16000, syn.cutoff);
  g.gain.setValueAtTime(vel * 0.5, t); g.gain.setTargetAtTime(0, end, r / 4);
  s.connect(flt); flt.connect(g); g.connect(dest); s.start(t); s.stop(Math.min(t + 2.5, end + r + 0.1));
}
// Sampler: one of my sounds played at different pitches (root note C4 by default).
function playSampler(c, dest, syn, midi, t, dur, vel, buf) {
  if (!buf) return;
  const s = c.createBufferSource(), g = c.createGain(), end = t + Math.max(dur, 0.02);
  const a = Math.max(0.002, syn.attack), r = Math.max(0.02, syn.release);
  s.buffer = buf; s.playbackRate.value = Math.pow(2, (midi - (syn.root ?? 60)) / 12);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.9, t + a);
  g.gain.setValueAtTime(vel * 0.9, end); g.gain.setTargetAtTime(0, end, r / 4);
  s.connect(g); g.connect(dest); s.start(t); s.stop(end + r + 0.05);
}
export function playSample(c, dest, buf, t, vel) {
  if (!buf) return;
  const s = c.createBufferSource(), g = c.createGain();
  s.buffer = buf; g.gain.value = vel; s.connect(g); g.connect(dest); s.start(t);
}
export function click(c, t, accent) {
  const o = c.createOscillator(), g = c.createGain();
  o.frequency.value = accent ? 1760 : 1100; decayEnv(g.gain, t, 0.3, 0.04);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.06);
}
// Quick previews from the UI
export async function previewDrum(t, row, vel = 0.9) {
  const c = await ensureCtx(), dest = nodeFor(E.g, t, true).input;
  if (row.sample) playSample(c, dest, audioCache.get(row.sample), c.currentTime + 0.01, vel * (row.vol ?? 1));
  else playDrum(c, dest, row.sound, c.currentTime + 0.01, vel * (row.vol ?? 1));
}
export async function previewNote(t, midi, dur = 0.3, vel = 0.8) { const c = await ensureCtx(); playNote(c, nodeFor(E.g, t, true).input, t.synth, midi, c.currentTime + 0.01, dur, vel, audioCache.get(t.sample)); }

// ---------- scheduling ----------
function scheduleBeatStep(g, step, time, pid) {
  if (!pid) return;
  const sd = stepDur();
  for (const t of app.P.beat.tracks) {
    const dest = nodeFor(g, t, true).input;
    if (t.type === 'drums') {
      const st = patData(t, pid).steps;
      t.rows.forEach((r, ri) => {
        const v = st[ri] && st[ri][step]; if (!v) return;
        const vel = (v === 2 ? 1 : 0.72) * (r.vol ?? 1);
        if (r.sample) playSample(g.c, dest, audioCache.get(r.sample), time, vel);
        else playDrum(g.c, dest, r.sound, time, vel);
      });
    } else {
      const smp = t.synth.engine === 'sampler' ? audioCache.get(t.sample) : null;
      for (const n of patData(t, pid).notes) if (n.step === step) playNote(g.c, dest, t.synth, n.pitch, time + (n.off || 0), n.len * sd - 0.005 - (n.off || 0), n.vel ?? 0.8, smp);
    }
  }
}
// Which pattern plays at an absolute 16th step of the song ('' means silence)
export function patternAt(absStep) {
  const B = app.P.beat;
  if (app.view === 'beat') return B.cur || 'A';
  const slot = Math.floor(absStep / (B.bars * 16));
  const a = B.arr || [];
  return slot < a.length ? a[slot] : (a.length ? a[a.length - 1] : 'A');
}
function scheduleClips(g, ctx0, pos0, end, srcs) {
  for (const t of app.P.tracks) {
    const dest = nodeFor(g, t, false).input;
    for (const c of t.clips) {
      const buf = audioCache.get(c.audioId); if (!buf) continue;
      const a = Math.max(c.start, pos0), b = Math.min(c.start + c.dur, end);
      if (b - a < 0.012) continue;
      const when = ctx0 + (a - pos0), dur = b - a, off = c.offset + (a - c.start), gv = c.gain ?? 1;
      const s = g.c.createBufferSource(), fg = g.c.createGain();
      s.buffer = buf;
      fg.gain.setValueAtTime(0, when); fg.gain.linearRampToValueAtTime(gv, when + 0.004);
      fg.gain.setValueAtTime(gv, when + dur - 0.004); fg.gain.linearRampToValueAtTime(0, when + dur);
      s.connect(fg); fg.connect(dest);
      s.start(when, off, dur);
      if (srcs) { srcs.add(s); s.onended = () => srcs.delete(s); }
    }
  }
}

export const T = { playing: false, segs: [], nextStep: 0, timer: null, srcs: new Set(), endCtx: 0, startPos: 0 };
let rec = null;
export const recState = () => rec;
const LOOK = 0.15;

function effLoop() {
  const P = app.P;
  if (app.view === 'beat') return { start: 0, end: P.beat.bars * barDur() };
  if (P.loop && !rec && P.range.end - P.range.start > 0.05) return P.range;
  return null;
}
export function posAt(t) {
  for (let i = T.segs.length - 1; i >= 0; i--) { const s = T.segs[i]; if (t >= s.ctx0 || i === 0) return s.pos0 + (t - s.ctx0); }
  return app.playhead;
}
export const currentPos = () => (T.playing && E.ctx ? posAt(E.ctx.currentTime) : app.playhead);

function startSeg(ctx0, pos0) {
  const L = effLoop(), loop = !!(L && pos0 < L.end);
  const seg = { ctx0, pos0, end: loop ? L.end : songEnd(), loop };
  T.segs.push(seg); if (T.segs.length > 4) T.segs.shift();
  scheduleClips(E.g, ctx0, pos0, seg.end, T.srcs);
  scheduleAuto(E.g, ctx0, pos0, seg.end);
  T.nextStep = Math.ceil(pos0 / stepDur() - 1e-6);
}
function tick() {
  const c = E.ctx, now = c.currentTime, sd = stepDur(), P = app.P;
  for (let guard = 0; guard < 1024; guard++) {
    const seg = T.segs[T.segs.length - 1];
    const stepPos = T.nextStep * sd;
    if (stepPos >= seg.end - 1e-6) {
      const segEndCtx = seg.ctx0 + (seg.end - seg.pos0);
      if (seg.loop) { if (segEndCtx < now + LOOK) { startSeg(segEndCtx, effLoop()?.start ?? 0); continue; } break; }
      T.endCtx = segEndCtx; break;
    }
    const at = seg.ctx0 + (stepPos - seg.pos0);
    if (at > now + LOOK) break;
    if (at >= now - 0.005) {
      const sw = T.nextStep % 2 ? P.beat.swing * sd * 0.5 : 0;
      scheduleBeatStep(E.g, T.nextStep % (P.beat.bars * 16), at + sw, patternAt(T.nextStep));
      if (settings.metro && T.nextStep % 4 === 0) click(c, at, T.nextStep % 16 === 0);
    }
    T.nextStep++;
  }
  if (rec && rec.punch && currentPos() > rec.to + 0.15) finishRecord();
  if (T.endCtx && now > T.endCtx + 0.05) { stop(); return; }
  emit('tick');
}
function killSources() { for (const s of T.srcs) { try { s.stop(); } catch { } } T.srcs.clear(); }

export async function play(pos = app.playhead, opts = {}) {
  await ensureCtx();
  if (T.playing) halt();
  T.playing = true; T.segs = []; T.endCtx = 0; T.startPos = pos;
  let ctx0 = E.ctx.currentTime + 0.08;
  if (opts.countIn) { const bd = barDur(); for (let b = 0; b < 4; b++) click(E.ctx, ctx0 + b * bd / 4, b === 0); ctx0 += bd; }
  T.countInEnd = ctx0;
  startSeg(ctx0, Math.max(0, pos));
  T.timer = setInterval(tick, 25); tick();
  emit('transport');
}
function halt() { T.playing = false; clearInterval(T.timer); killSources(); T.segs = []; resetAuto(E.g); }
export function stop() {
  if (!T.playing) return;
  if (rec) finishRecord();
  halt();
  app.playhead = T.startPos;
  emit('transport'); emit('tick');
}
// Re-schedule after an edit while playing.
export function refresh() {
  if (!T.playing || rec) return;
  const pos = currentPos(), keep = T.startPos;
  killSources(); T.segs = []; T.endCtx = 0;
  resetAuto(E.g); startSeg(E.ctx.currentTime + 0.04, pos); T.startPos = keep;
}

// ---------- mic ----------
export async function openMic() {
  await ensureCtx();
  if (E.mic) return E.mic;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: {
    deviceId: settings.inputId ? { exact: settings.inputId } : undefined,
    channelCount: settings.mono ? 1 : 2,
    echoCancellation: settings.ec, noiseSuppression: settings.nr, autoGainControl: settings.agc,
  } });
  const c = E.ctx;
  const src = c.createMediaStreamSource(stream), gain = c.createGain(), an = c.createAnalyser(), mon = c.createGain(), sink = c.createGain();
  gain.gain.value = settings.inputGain; an.fftSize = 2048; mon.gain.value = 0; sink.gain.value = 0;
  const cap = new AudioWorkletNode(c, 'cap', { channelCount: settings.mono ? 1 : 2, channelCountMode: 'explicit' });
  src.connect(gain); gain.connect(an); gain.connect(cap); cap.connect(sink); sink.connect(c.destination); gain.connect(mon);
  cap.port.onmessage = e => { if (rec) rec.chunks.push(e.data); };
  E.mic = { stream, src, gain, an, cap, sink, mon, clips: 0 };
  updateMonitor();
  return E.mic;
}
export function closeMic() {
  const m = E.mic; if (!m) return;
  m.stream.getTracks().forEach(t => t.stop());
  for (const n of [m.src, m.gain, m.cap, m.sink, m.mon]) n.disconnect();
  E.mic = null;
}
export async function reopenMic() { const had = !!E.mic; closeMic(); if (had) await openMic(); }
export function setInputGain(v) { settings.inputGain = v; if (E.mic) E.mic.gain.gain.value = v; }
export function updateMonitor() {
  const m = E.mic; if (!m) return;
  m.mon.disconnect();
  const t = app.P && selTrack();
  if (t && settings.monitor) { m.mon.connect(nodeFor(E.g, t, false).input); m.mon.gain.value = 1; }
  else m.mon.gain.value = 0;
}
const tdBuf = new Float32Array(2048);
export function peakOf(an) {
  if (!an) return 0;
  an.getFloatTimeDomainData(tdBuf);
  let p = 0; for (let i = 0; i < an.fftSize; i++) { const v = Math.abs(tdBuf[i]); if (v > p) p = v; }
  return p;
}
export function rmsOf(an) {
  an.getFloatTimeDomainData(tdBuf);
  let s = 0; for (let i = 0; i < an.fftSize; i++) s += tdBuf[i] * tdBuf[i];
  return Math.sqrt(s / an.fftSize);
}

// ---------- recording ----------
// E.onRecorded({ trackId, buf, from, to }) is set by the studio to store the take.
export async function startRecord(track) {
  if (rec) return;
  await openMic();
  updateMonitor();
  const P = app.P;
  const punch = P.punch && P.range.end - P.range.start > 0.1;
  const pos = T.playing ? currentPos() : app.playhead;
  rec = { trackId: track.id, chunks: [], punch, from: punch ? P.range.start : pos, to: punch ? P.range.end : Infinity, t0: null };
  if (T.playing) halt();
  await play(punch ? Math.max(0, P.range.start - barDur()) : pos, { countIn: !punch && !T.playing && settings.countIn });
  if (punch) T.startPos = P.range.start;
  E.mic.cap.port.postMessage({ rec: true });
  emit('transport');
}
export function recElapsed() {
  if (!rec || !T.playing) return 0;
  return Math.max(0, currentPos() - rec.from);
}
export function finishRecord() {
  if (!rec) return;
  const r = rec; rec = null;
  E.mic.cap.port.postMessage({ rec: false });
  const c = E.ctx, sr = c.sampleRate, lat = latency();
  const to = Math.min(r.to, currentPos());
  const from = r.from;
  emit('transport');
  if (to - from < 0.15 || !r.chunks.length) return;
  const len = Math.round((to - from) * sr), nch = r.chunks[0].d.length;
  const outs = Array.from({ length: nch }, () => new Float32Array(len));
  for (const ch of r.chunks) {
    const off = Math.round((posAt(ch.t - lat) - from) * sr);
    for (let k = 0; k < nch; k++) {
      const src = ch.d[k] || ch.d[0], o = outs[k];
      for (let i = 0; i < src.length; i++) { const j = off + i; if (j >= 0 && j < len) o[j] = src[i]; }
    }
  }
  const buf = new AudioBuffer({ length: len, numberOfChannels: nch, sampleRate: sr });
  outs.forEach((o, k) => buf.copyToChannel(o, k));
  E.onRecorded?.({ trackId: r.trackId, buf, from, to });
}
// Short test recording for the mic wizard (not stored in a project).
export async function testRecord(sec) {
  await openMic();
  const chunks = [];
  const prev = E.mic.cap.port.onmessage;
  E.mic.cap.port.onmessage = e => chunks.push(e.data);
  E.mic.cap.port.postMessage({ rec: true });
  await new Promise(r => setTimeout(r, sec * 1000));
  E.mic.cap.port.postMessage({ rec: false });
  E.mic.cap.port.onmessage = prev;
  const n = chunks.reduce((a, c) => a + c.d[0].length, 0);
  const buf = new AudioBuffer({ length: Math.max(1, n), numberOfChannels: 1, sampleRate: E.ctx.sampleRate });
  const d = new Float32Array(Math.max(1, n)); let o = 0;
  for (const c of chunks) { d.set(c.d[0], o); o += c.d[0].length; }
  buf.copyToChannel(d, 0);
  return buf;
}
export async function playBuffer(buf) {
  const c = await ensureCtx();
  const s = c.createBufferSource(); s.buffer = buf; s.connect(c.destination); s.start();
  return new Promise(r => s.onended = r);
}
export async function testTone(pan) {
  const c = await ensureCtx();
  const o = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner();
  o.frequency.value = 440; p.pan.value = pan; const t = c.currentTime;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.05); g.gain.setValueAtTime(0.2, t + 0.7); g.gain.linearRampToValueAtTime(0, t + 0.8);
  o.connect(g); g.connect(p); p.connect(c.destination); o.start(t); o.stop(t + 0.85);
}

// ---------- export ----------
export async function renderSong(only = null, bypassMaster = false) {
  const P = app.P, end = songEnd(), sr = 44100, tail = 2.5;
  const oc = new OfflineAudioContext(2, Math.ceil((end + tail) * sr), sr);
  await oc.audioWorklet.addModule(workletURL);
  const g = buildGraph(oc, false);
  applyMix(g, true, only, bypassMaster);
  const t0 = 0.02;
  scheduleClips(g, t0, 0, end, null);
  scheduleAuto(g, t0, 0, end);
  if (!only || only === 'beat') {
    const sd = stepDur(), bs = P.beat.bars * 16, n = Math.ceil(end / sd - 1e-6);
    for (let i = 0; i < n; i++) scheduleBeatStep(g, i % bs, t0 + i * sd + (i % 2 ? P.beat.swing * sd * 0.5 : 0), patternAt(i));
  }
  return oc.startRendering();
}
export function encodeWav(buf) {
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
  const dv = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, len * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = clamp(data[c][i], -1, 1); dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([dv], { type: 'audio/wav' });
}
