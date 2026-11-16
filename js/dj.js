// DJ booth: two decks you can scratch, EQ, filter, effects, crossfader, transitions,
// a light show with visualizer, full customization, and mix recording with export.
import { $, el, clamp, toast, knob, select, ask, download, uid, safeName } from './util.js';
import { helpBtn, HELP } from './help.js';
import { app } from './state.js';
import { E, ensureCtx, encodeWav, renderSong, renderMastered } from './engine.js';
import { SOUNDS, loadSounds, soundBuffer, detectBpm } from './library.js';
import { db, saveAudio } from './store.js';
import { newFx, buildFx } from './fx.js';
import { encodeMp3 } from './mp3.js';

// ---------- saved settings ----------
const KEY = 'loopden.dj';
const DEF = {
  deckStyle: 'vinyl', body: 'graphite', recA: '#151518', recB: '#151518', labelA: '#ff5ea8', labelB: '#5ed3ff', ringA: '#ff5ea8', ringB: '#5ed3ff',
  imgA: null, imgB: null, lights: 'beams', lightColor: 'rainbow', beams: 6, lightSpeed: 1, lightAmt: 0.7, viz: 'bars', vizOn: true,
  curve: 'smooth', range: 8, transStyle: 'blend', transBeats: 8,
  keys: { playA: 'q', playB: 'p', cueA: 'w', cueB: 'o', syncA: 'e', syncB: 'i', xfLeft: 'z', xfRight: 'm', trans: 't', strobe: 'b', rec: 'r' },
};
export const DJ = (() => { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...DEF, ...s, keys: { ...DEF.keys, ...(s.keys || {}) } }; })();
const saveDJ = () => { try { localStorage.setItem(KEY, JSON.stringify(DJ)); } catch { toast('Could not save that picture, it is too big.'); } };

// ---------- deck player worklet: plays at any speed, even backwards (scratching) ----------
const DECK_WORKLET = `
class Deck extends AudioWorkletProcessor {
  constructor() { super(); this.ch = null; this.len = 0; this.pos = 0; this.rate = 0; this.target = 0; this.k = 1; this.loop = null; this.n = 0;
    this.port.onmessage = e => { const d = e.data;
      if (d.buf) { this.ch = d.buf; this.len = d.buf[0].length; this.k = d.sr / sampleRate; this.pos = 0; }
      if (d.seek != null) this.pos = Math.max(0, Math.min(this.len - 1, d.seek));
      if (d.rate != null) { this.target = d.rate; if (d.jump) this.rate = d.rate; }
      if ('loop' in d) this.loop = d.loop;
    }; }
  process(_, outs) {
    const o = outs[0], L = o[0], R = o[1] || o[0];
    if (!this.ch) { return true; }
    const A = this.ch[0], B = this.ch[1] || this.ch[0];
    for (let i = 0; i < L.length; i++) {
      this.rate += (this.target - this.rate) * 0.004;
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

// ---------- audio graph ----------
const FX_LIST = [['delay', 'Echo'], ['room', 'Reverb'], ['flanger', 'Flanger'], ['phaser', 'Phaser'], ['bitcrush', 'Lo-fi'], ['repeat', 'Stutter'], ['filter', 'Auto filter'], ['dist', 'Distortion'], ['dust', 'Vinyl dust'], ['vibrato', 'Wobble']];
let G = null;
function deckObj(id) {
  return { id, name: '', buf: null, bpm: 0, pos: 0, rate: 0, playing: false, tempo: 0, cue: 0, hot: [null, null, null, null], loop: null, peaks: null, sync: false,
    eq: { hi: 0, mid: 0, lo: 0 }, filter: 0, trim: 1, fader: 1, fxType: 'delay', fxAmt: 0, fxOn: false, kill: { hi: false, mid: false, lo: false } };
}
export const D = { A: deckObj('A'), B: deckObj('B'), xf: 0, master: 0.9, rec: null };
function build(_) {
  const c = E.ctx;
  const master = c.createGain(), lim = c.createDynamicsCompressor(), an = c.createAnalyser(), post = c.createGain();
  lim.threshold.value = -1.5; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1; an.fftSize = 2048; an.smoothingTimeConstant = 0.75;
  master.connect(lim); lim.connect(post); post.connect(an); post.connect(c.destination);
  G = { c, master, post, an, ch: {} };
  for (const id of ['A', 'B']) {
    const node = new AudioWorkletNode(c, 'sheloops-deck', { outputChannelCount: [2] });
    const trim = c.createGain(), lo = c.createBiquadFilter(), mid = c.createBiquadFilter(), hi = c.createBiquadFilter(), filt = c.createBiquadFilter();
    lo.type = 'lowshelf'; lo.frequency.value = 180; mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.7; hi.type = 'highshelf'; hi.frequency.value = 5000;
    filt.type = 'allpass'; filt.Q.value = 1.2;
    const dry = c.createGain(), wet = c.createGain(), fxIn = c.createGain(), fxOut = c.createGain(), fader = c.createGain(), xf = c.createGain(), an2 = c.createAnalyser(); an2.fftSize = 512;
    node.connect(trim); trim.connect(lo); lo.connect(mid); mid.connect(hi); hi.connect(filt); filt.connect(dry); filt.connect(fxIn); fxOut.connect(wet);
    dry.connect(fader); wet.connect(fader); fader.connect(xf); xf.connect(master); fader.connect(an2);
    node.port.onmessage = e => { const d = D[id]; d.pos = e.data.pos; d.rate = e.data.rate; };
    G.ch[id] = { node, trim, lo, mid, hi, filt, dry, wet, fxIn, fxOut, fader, xf, an: an2, fx: null, fxKey: '' };
    applyDeck(id);
  }
  applyXf();
}
const sp = (p, v) => p.setTargetAtTime(v, G.c.currentTime, 0.015);
function applyDeck(id) {
  if (!G) return; const d = D[id], g = G.ch[id];
  sp(g.trim.gain, d.trim);
  sp(g.lo.gain, d.kill.lo ? -40 : d.eq.lo); sp(g.mid.gain, d.kill.mid ? -40 : d.eq.mid); sp(g.hi.gain, d.kill.hi ? -40 : d.eq.hi);
  // one filter knob: left = low pass, right = high pass, middle = off
  const f = d.filter;
  if (Math.abs(f) < 0.03) g.filt.type = 'allpass';
  else if (f < 0) { g.filt.type = 'lowpass'; sp(g.filt.frequency, 20000 * Math.pow(0.006, -f)); }
  else { g.filt.type = 'highpass'; sp(g.filt.frequency, 20 * Math.pow(400, f)); }
  sp(g.fader.gain, d.fader);
  syncFx(id);
}
function beatSec(id) { const d = D[id]; return 60 / ((d.bpm || 120) * rateOf(d)); }
function fxParams(id) {
  const b = beatSec(id);
  return { delay: { time: clamp(b * 0.75, 0.05, 1.5), feedback: 0.55, tone: 3500, mix: 1 }, room: { size: 4, tone: 7000, mix: 1 }, repeat: { slice: clamp(b / 4, 0.03, 0.5), count: 4, mix: 1 },
    filter: { mode: 0, cutoff: 900, res: 8, rate: 1 / (b * 4), depth: 0.9 }, flanger: { mix: 1 }, phaser: { mix: 1 }, bitcrush: { bits: 5, mix: 1 }, dist: { drive: 0.6, mix: 1 }, dust: { crackle: 0.8, hiss: 0.5 }, vibrato: { rate: 4, depth: 0.6 } }[D[id].fxType] || {};
}
function syncFx(id) {
  const d = D[id], g = G.ch[id], key = d.fxType + ':' + Math.round(beatSec(id) * 100);
  if (g.fxKey !== key) {
    if (g.fx) { try { g.fxIn.disconnect(); g.fx.out.disconnect(); g.fx.stop?.(); } catch { } }
    const f = newFx(d.fxType, fxParams(id)); g.fx = buildFx(G.c, f); g.fx.set(f.params, { key: 0, scaleIdx: 2 }, true);
    g.fxIn.connect(g.fx.in); g.fx.out.connect(g.fxOut); g.fxKey = key;
  }
  const a = d.fxOn ? d.fxAmt : 0;
  sp(g.wet.gain, a); sp(g.dry.gain, d.fxType === 'filter' || d.fxType === 'vibrato' || d.fxType === 'repeat' ? 1 - a : 1);
}
function applyXf() {
  if (!G) return; const x = (D.xf + 1) / 2;
  const curve = DJ.curve === 'sharp' ? v => clamp(v * 4, 0, 1) : DJ.curve === 'linear' ? v => v : v => Math.sin(v * Math.PI / 2);
  sp(G.ch.A.xf.gain, curve(1 - x)); sp(G.ch.B.xf.gain, curve(x)); sp(G.master.gain, D.master);
}
const rateOf = d => d.playing ? 1 + d.tempo / 100 : 0;
function sendRate(id, jump) { if (G) G.ch[id].node.port.postMessage({ rate: rateOf(D[id]), jump }); }

// ---------- deck actions ----------
function peaksOf(buf) {
  const n = Math.ceil(buf.length / 256), a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a, out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let m = 0; for (let j = i * 256; j < Math.min(buf.length, i * 256 + 256); j += 4) m = Math.max(m, Math.abs(a[j]), Math.abs(b[j])); out[i] = m; }
  return out;
}
export async function load(id, buf, name) {
  await ctx(); const d = D[id];
  d.buf = buf; d.name = name; d.pos = 0; d.cue = 0; d.hot = [null, null, null, null]; d.loop = null; d.playing = false; d.peaks = peaksOf(buf);
  d.bpm = (detectBpm(buf) || {}).bpm || 120;
  const ch = []; for (let k = 0; k < Math.min(2, buf.numberOfChannels); k++) ch.push(buf.getChannelData(k).slice());
  G.ch[id].node.port.postMessage({ buf: ch, sr: buf.sampleRate, loop: null, rate: 0, jump: true });
  if (DJ['img' + id] == null) labelCache[id] = null;
  toast(`${name} loaded on deck ${id} (${d.bpm} BPM).`); render();
}
const secOf = d => d.buf ? d.pos / d.buf.sampleRate : 0;
const seek = (id, sec) => { const d = D[id]; if (!d.buf) return; d.pos = clamp(sec, 0, d.buf.duration) * d.buf.sampleRate; G.ch[id].node.port.postMessage({ seek: d.pos }); };
function play(id, on = !D[id].playing) { const d = D[id]; if (!d.buf) return toast(`Load a song on deck ${id} first.`); d.playing = on; if (on && d.sync) doSync(id, true); sendRate(id); render(); }
function cue(id) { const d = D[id]; if (!d.buf) return; if (d.playing) { d.playing = false; sendRate(id, true); seek(id, d.cue); } else { d.cue = secOf(d); toast(`Cue set on deck ${id}.`); } render(); }
function hotCue(id, k, set) { const d = D[id]; if (!d.buf) return; if (set || d.hot[k] == null) { d.hot[k] = secOf(d); toast(`Hot cue ${k + 1} saved on deck ${id}.`); } else seek(id, d.hot[k]); render(); }
function setLoop(id, beats) {
  const d = D[id]; if (!d.buf) return;
  if (!beats || (d.loop && d.loop.beats === beats)) { d.loop = null; G.ch[id].node.port.postMessage({ loop: null }); render(); return; }
  const sr = d.buf.sampleRate, s = d.pos, e = s + beats * 60 / d.bpm * sr; d.loop = { beats }; G.ch[id].node.port.postMessage({ loop: [s, e] }); render();
}
function doSync(id, quiet) {
  const o = D[id === 'A' ? 'B' : 'A'], d = D[id]; if (!o.buf || !d.buf) return quiet ? null : toast('Load songs on both decks to sync.');
  const target = o.bpm * (1 + o.tempo / 100); d.tempo = clamp((target / d.bpm - 1) * 100, -50, 50); sendRate(id); syncFx(id);
  if (!quiet) toast(`Deck ${id} now matches ${target.toFixed(1)} BPM.`); render();
}
// nudge: bend the speed for a moment to line up the beats
function nudge(id, dir) { const d = D[id]; if (!d.playing) return; G.ch[id].node.port.postMessage({ rate: rateOf(d) * (1 + dir * 0.04) }); setTimeout(() => sendRate(id), 250); }

// ---------- transitions ----------
export const TRANSITIONS = [
  ['blend', 'Smooth blend', 'Slowly fades one song into the other.'],
  ['bassswap', 'Bass swap', 'Fades in, then swaps the bass halfway so the two basses never clash.'],
  ['filter', 'Filter fade', 'The old song thins out while the new one opens up.'],
  ['echoout', 'Echo out', 'The old song echoes away and the new one drops in.'],
  ['washout', 'Reverb wash', 'The old song melts into a huge reverb.'],
  ['spinback', 'Spinback', 'Spins the old record backwards, then the new song hits.'],
  ['brake', 'Vinyl brake', 'The old record slows to a stop like the power went off.'],
  ['stutter', 'Stutter cut', 'The old song stutters, then cuts to the new one.'],
  ['cut', 'Quick cut', 'Switches right on the beat.'],
];
let trans = null;
async function transition(style = DJ.transStyle, beats = DJ.transBeats) {
  if (trans) return;
  const from = D.xf <= 0 ? 'A' : 'B', to = from === 'A' ? 'B' : 'A', F = D[from], T = D[to];
  if (!T.buf) return toast(`Load a song on deck ${to} to transition to.`);
  if (!F.playing) return toast(`Play deck ${from} first. The transition goes from ${from} to ${to}.`);
  await ctx();
  if (!T.playing) { T.sync = true; doSync(to, true); play(to, true); }
  const dur = beats * beatSec(from) * 1000, t0 = performance.now(), dir = to === 'B' ? 1 : -1, start = D.xf;
  const keep = { Ff: F.filter, Tf: T.filter, Flo: F.eq.lo, Tlo: T.eq.lo, Ffx: [F.fxType, F.fxAmt, F.fxOn] };
  trans = { style, to };
  if (style === 'echoout' || style === 'washout' || style === 'stutter') { F.fxType = style === 'echoout' ? 'delay' : style === 'washout' ? 'room' : 'repeat'; F.fxOn = true; F.fxAmt = 0; applyDeck(from); }
  if (style === 'bassswap') { T.eq.lo = -40; applyDeck(to); }
  if (style === 'filter') { T.filter = -0.85; applyDeck(to); }
  const end = () => {
    D.xf = dir; F.filter = keep.Ff; T.filter = keep.Tf; F.eq.lo = keep.Flo; T.eq.lo = keep.Tlo; [F.fxType, F.fxAmt, F.fxOn] = keep.Ffx;
    if (F.playing) { F.playing = false; sendRate(from); }
    applyDeck(from); applyDeck(to); applyXf(); trans = null; render(); toast(`Now playing deck ${to}.`);
  };
  const step = () => {
    if (!trans) return;
    const p = clamp((performance.now() - t0) / dur, 0, 1), e = p * p * (3 - 2 * p);
    switch (style) {
      case 'cut': if (p > 0) { D.xf = dir; return end(); } break;
      case 'blend': D.xf = start + (dir - start) * e; break;
      case 'bassswap': D.xf = start + (dir - start) * clamp(e * 1.6, 0, 1); if (p > 0.5) { F.eq.lo = -40; T.eq.lo = keep.Tlo; } break;
      case 'filter': F.filter = 0.9 * e; T.filter = -0.85 * (1 - e); D.xf = start + (dir - start) * e; break;
      case 'echoout': case 'washout': F.fxAmt = Math.min(1, p * 2.5); if (p > 0.45 && F.playing) { F.playing = false; sendRate(from); } D.xf = p > 0.45 ? start + (dir - start) * clamp((p - 0.45) * 3, 0, 1) : start; break;
      case 'stutter': F.fxAmt = Math.min(1, p * 4); if (p > 0.5) D.xf = dir; break;
      case 'spinback': if (p < 0.35) { G.ch[from].node.port.postMessage({ rate: -3 }); } else { if (F.playing) { F.playing = false; sendRate(from); } D.xf = dir; } break;
      case 'brake': G.ch[from].node.port.postMessage({ rate: (1 + F.tempo / 100) * (1 - e) }); D.xf = start + (dir - start) * clamp((p - 0.5) * 2, 0, 1); break;
    }
    applyDeck(from); applyDeck(to); applyXf(); drawXf();
    if (p >= 1) return end();
    requestAnimationFrame(step);
  };
  render(); step();
}

// ---------- recording the mix ----------
async function toggleRec() {
  await ctx();
  if (D.rec) {
    const r = D.rec; D.rec = null; r.node.port.postMessage({ rec: false }); G.post.disconnect(r.node); r.node.disconnect();
    const len = r.chunks.reduce((a, ch) => a + ch.d[0].length, 0); if (!len) { render(); return; }
    const buf = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: G.c.sampleRate }); let off = 0;
    for (const ch of r.chunks) { buf.copyToChannel(ch.d[0], 0, off); buf.copyToChannel(ch.d[1] || ch.d[0], 1, off); off += ch.d[0].length; }
    lastMix = buf; render(); toast(`Recorded ${buf.duration.toFixed(0)} seconds. Save it below.`); return;
  }
  const node = new AudioWorkletNode(G.c, 'cap', { channelCount: 2, channelCountMode: 'explicit' }), sink = G.c.createGain(); sink.gain.value = 0;
  G.post.connect(node); node.connect(sink); sink.connect(G.c.destination);
  D.rec = { node, chunks: [], t0: G.c.currentTime }; node.port.onmessage = e => D.rec && D.rec.chunks.push(e.data); node.port.postMessage({ rec: true });
  render(); toast('Recording your mix. Press Stop recording when you are done.');
}
let lastMix = null;
async function saveMix(kind) {
  if (!lastMix) return toast('Record a mix first.');
  const name = await ask('Name your mix', 'Name', 'My DJ mix'); if (!name) return;
  if (kind === 'wav') download(new Blob([encodeWav(lastMix)], { type: 'audio/wav' }), safeName(name) + '.wav');
  else if (kind === 'mp3') { try { download(await encodeMp3(lastMix, { name, artist: (app.P && app.P.artist) || '' }), safeName(name) + '.mp3'); } catch { toast('MP3 is not available. Saving WAV instead.'); download(new Blob([encodeWav(lastMix)], { type: 'audio/wav' }), safeName(name) + '.wav'); } }
  else { const id = 's' + uid(); await saveAudio(id, lastMix); await db.put('sounds', id, { id, name, folder: 'DJ mixes', fav: false, kind: 'loop', dur: lastMix.duration, bpm: null, added: Date.now() }); await loadSounds(); toast(`Saved "${name}" in My sounds (DJ mixes).`); }
}

// ---------- crate: songs to play ----------
const crate = []; // { id, name, src: 'file'|'sound'|'song', buf?, sid? }
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

// ---------- drawing: platters, waveforms, meters, lights, visualizer ----------
let root = null, raf = 0;
const labelCache = {};
function labelImg(id) { const u = DJ['img' + id]; if (!u) return null; if (!labelCache[id] || labelCache[id].src !== u) { const im = new Image(); im.src = u; labelCache[id] = im; } return labelCache[id].complete ? labelCache[id] : null; }
function drawPlatter(id) {
  const cv = root.querySelector(`.platter[data-d="${id}"]`); if (!cv) return;
  const d = D[id], S = cv.width = cv.height = cv.clientWidth * devicePixelRatio, g = cv.getContext('2d'), R = S / 2, ang = secOf(d) * Math.PI * 2 * (33.3 / 60);
  g.clearRect(0, 0, S, S); g.save(); g.translate(R, R);
  // glow ring
  const ring = DJ['ring' + id], lvl = meterLevel(id);
  g.shadowColor = ring; g.shadowBlur = (8 + lvl * 30) * devicePixelRatio; g.strokeStyle = ring; g.lineWidth = 3 * devicePixelRatio; g.beginPath(); g.arc(0, 0, R * 0.97, 0, 7); g.stroke(); g.shadowBlur = 0;
  if (DJ.deckStyle === 'cdj') {
    g.fillStyle = '#1b1b20'; g.beginPath(); g.arc(0, 0, R * 0.93, 0, 7); g.fill();
    g.rotate(ang); g.strokeStyle = '#ffffff18'; for (let k = 0; k < 60; k++) { g.beginPath(); g.moveTo(R * 0.8, 0); g.lineTo(R * 0.9, 0); g.stroke(); g.rotate(Math.PI / 30); }
    g.fillStyle = '#0c0c10'; g.beginPath(); g.arc(0, 0, R * 0.62, 0, 7); g.fill();
    g.fillStyle = ring; g.shadowColor = ring; g.shadowBlur = 12; g.fillRect(-2, -R * 0.6, 4, R * 0.22); g.shadowBlur = 0;
  } else {
    g.rotate(ang);
    g.fillStyle = DJ['rec' + id]; g.beginPath(); g.arc(0, 0, R * 0.93, 0, 7); g.fill();
    g.strokeStyle = '#ffffff10'; g.lineWidth = 1; for (let r = R * 0.4; r < R * 0.92; r += R * 0.025) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); }
    const sh = g.createConicGradient(0, 0, 0); ['#ffffff00', '#ffffff22', '#ffffff00', '#ffffff00', '#ffffff18', '#ffffff00'].forEach((c, k, a) => sh.addColorStop(k / (a.length - 1), c));
    g.save(); g.rotate(-ang); g.fillStyle = sh; g.beginPath(); g.arc(0, 0, R * 0.93, 0, 7); g.arc(0, 0, R * 0.38, 0, 7, true); g.fill('evenodd'); g.restore();
    const im = labelImg(id);
    g.save(); g.beginPath(); g.arc(0, 0, R * 0.36, 0, 7); g.clip();
    if (im) g.drawImage(im, -R * 0.36, -R * 0.36, R * 0.72, R * 0.72); else { g.fillStyle = DJ['label' + id]; g.fillRect(-R, -R, 2 * R, 2 * R); g.fillStyle = '#000a'; g.font = `700 ${R * 0.09}px sans-serif`; g.textAlign = 'center'; g.fillText((d.name || 'SHELOOPS').slice(0, 16), 0, -R * 0.12); g.font = `600 ${R * 0.07}px sans-serif`; g.fillText(`DECK ${id}`, 0, R * 0.2); }
    g.restore();
    g.fillStyle = '#ddd'; g.beginPath(); g.arc(0, 0, R * 0.03, 0, 7); g.fill();
  }
  g.restore();
}
function drawWave(id) {
  const cv = root.querySelector(`.wave2[data-d="${id}"]`); if (!cv) return;
  const d = D[id], W = cv.width = cv.clientWidth * devicePixelRatio, H = cv.height = cv.clientHeight * devicePixelRatio, g = cv.getContext('2d'); g.clearRect(0, 0, W, H);
  if (!d.peaks) { g.fillStyle = '#ffffff30'; g.font = `${12 * devicePixelRatio}px sans-serif`; g.textAlign = 'center'; g.fillText('Drop a song here', W / 2, H / 2 + 4); return; }
  const col = DJ['ring' + id], spp = 256, view = 6 * d.buf.sampleRate / spp, c0 = d.pos / spp - view / 2;
  // beat grid
  const bp = 60 / d.bpm * d.buf.sampleRate / spp; g.fillStyle = '#ffffff14'; for (let b = Math.ceil(c0 / bp) * bp; b < c0 + view; b += bp) g.fillRect((b - c0) / view * W, 0, 1, H);
  g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 6;
  for (let x = 0; x < W; x += 2) { const i = Math.floor(c0 + x / W * view); const v = i >= 0 && i < d.peaks.length ? d.peaks[i] : 0; const h = v * H * 0.9; g.globalAlpha = x < W / 2 ? 0.45 : 1; g.fillRect(x, (H - h) / 2, 1.5, h); }
  g.globalAlpha = 1; g.shadowBlur = 0;
  for (const [k, t] of d.hot.entries()) if (t != null) { const x = (t * d.buf.sampleRate / spp - c0) / view * W; g.fillStyle = HOTC[k]; g.fillRect(x, 0, 2, H); }
  g.fillStyle = '#fff'; g.fillRect(W / 2 - 1, 0, 2, H);
  const ov = root.querySelector(`.overview[data-d="${id}"]`); if (ov) ov.style.setProperty('--p', (secOf(d) / d.buf.duration * 100).toFixed(2) + '%');
  const t = root.querySelector(`.dtime[data-d="${id}"]`); if (t) { const left = d.buf.duration - secOf(d); t.textContent = `-${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}  ·  ${(d.bpm * (1 + d.tempo / 100)).toFixed(1)} BPM`; }
}
const HOTC = ['#ff4a5e', '#ffd84a', '#6dffb0', '#5ed3ff'];
const tbuf = new Uint8Array(512);
function meterLevel(id) { if (!G) return 0; const an = G.ch[id].an; an.getByteTimeDomainData(tbuf); let m = 0; for (const v of tbuf) m = Math.max(m, Math.abs(v - 128)); return m / 128; }
const fbuf = new Uint8Array(1024);
let beamT = 0, strobe = false, bass = 0;
function drawStage(dt) {
  const cv = root.querySelector('.stage'); if (!cv) return;
  const W = cv.width = cv.clientWidth * devicePixelRatio, H = cv.height = cv.clientHeight * devicePixelRatio, g = cv.getContext('2d');
  if (G) G.an.getByteFrequencyData(fbuf);
  const b = G ? (fbuf[2] + fbuf[3] + fbuf[4] + fbuf[5]) / 1020 : 0; bass += (b - bass) * 0.3;
  g.fillStyle = '#05050a'; g.fillRect(0, 0, W, H);
  const colAt = k => DJ.lightColor === 'rainbow' ? `hsl(${(k * 60 + beamT * 40) % 360} 100% 60%)` : DJ.lightColor === 'accent' ? getComputedStyle(document.documentElement).getPropertyValue('--led').trim() || '#ff5ea8' : DJ.lightColor;
  beamT += dt * DJ.lightSpeed;
  // light beams from the top of the stage
  if (DJ.lights !== 'off') {
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < DJ.beams; k++) {
      const x = (k + 0.5) / DJ.beams * W, sw = DJ.lights === 'sweep' || DJ.lights === 'beams' ? Math.sin(beamT * 1.3 + k) * 0.6 : 0;
      const a = Math.PI / 2 + sw, len = H * 1.3, wdt = W * 0.05 * (0.6 + bass);
      const on = DJ.lights === 'pulse' ? bass : DJ.lights === 'chase' ? (Math.floor(beamT * 4) % DJ.beams === k ? 1 : 0.15) : 0.35 + bass * 0.65;
      const gr = g.createLinearGradient(x, 0, x + Math.cos(a) * len, Math.sin(a) * len); const c = colAt(k);
      gr.addColorStop(0, c); gr.addColorStop(1, 'transparent');
      g.globalAlpha = on * DJ.lightAmt; g.fillStyle = gr;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + Math.cos(a - 0.08) * len - wdt, Math.sin(a - 0.08) * len); g.lineTo(x + Math.cos(a + 0.08) * len + wdt, Math.sin(a + 0.08) * len); g.closePath(); g.fill();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  // visualizer
  if (DJ.vizOn && G) {
    const n = 64, c = colAt(0); g.shadowColor = c; g.shadowBlur = 14 * devicePixelRatio;
    if (DJ.viz === 'bars' || DJ.viz === 'mirror') for (let i = 0; i < n; i++) { const v = Math.pow(fbuf[Math.floor(Math.pow(i / n, 1.7) * 400)] / 255, 1.3), bw = W / n, hh = v * H * (DJ.viz === 'mirror' ? 0.45 : 0.8); g.fillStyle = colAt(i / 8); if (DJ.viz === 'mirror') g.fillRect(i * bw + 1, H / 2 - hh, bw - 2, hh * 2); else g.fillRect(i * bw + 1, H - hh, bw - 2, hh); }
    else if (DJ.viz === 'ring' || DJ.viz === 'tunnel') {
      const cx = W / 2, cy = H / 2, R0 = Math.min(W, H) * (0.18 + bass * 0.1);
      if (DJ.viz === 'tunnel') for (let r = 0; r < 8; r++) { const rr = ((r / 8 + beamT * 0.15) % 1) * Math.max(W, H) * 0.7; g.strokeStyle = colAt(r); g.globalAlpha = 1 - rr / (Math.max(W, H) * 0.7); g.lineWidth = 2 + bass * 6; g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.stroke(); }
      g.globalAlpha = 1; g.lineWidth = 3;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, v = fbuf[Math.floor(i / n * 300)] / 255; g.strokeStyle = colAt(i / 8); g.beginPath(); g.moveTo(cx + Math.cos(a) * R0, cy + Math.sin(a) * R0); g.lineTo(cx + Math.cos(a) * (R0 + v * R0 * 1.4), cy + Math.sin(a) * (R0 + v * R0 * 1.4)); g.stroke(); }
    } else if (DJ.viz === 'lasers') {
      g.lineWidth = 2 * devicePixelRatio; g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 14; k++) { const a = Math.sin(beamT * 0.9 + k * 0.6) * 1.1 - Math.PI / 2, v = fbuf[k * 20] / 255; g.strokeStyle = colAt(k); g.globalAlpha = 0.3 + v * 0.7; g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2 + Math.cos(a) * H * 2, H + Math.sin(a) * H * 2); g.stroke(); }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    } else if (DJ.viz === 'wave') {
      G.an.getByteTimeDomainData(fbuf); g.strokeStyle = c; g.lineWidth = 3 * devicePixelRatio; g.beginPath(); for (let i = 0; i < 512; i++) { const x = i / 511 * W, y = H / 2 + (fbuf[i * 2] - 128) / 128 * H * 0.4; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    }
    g.shadowBlur = 0;
  }
  if (strobe && Math.floor(performance.now() / 50) % 2) { g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); }
  root.style.setProperty('--bass', bass.toFixed(3));
}
function drawXf() { const x = root && root.querySelector('.xfader input'); if (x && document.activeElement !== x) x.value = D.xf; }
let last = performance.now();
function frame() {
  if (!root || !root.isConnected) { raf = 0; return; }
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  for (const id of ['A', 'B']) { drawPlatter(id); drawWave(id); const m = root.querySelector(`.vu[data-d="${id}"]`); if (m) m.style.setProperty('--l', meterLevel(id).toFixed(3)); }
  drawStage(dt); drawXf();
  const rt = root.querySelector('.rectime'); if (rt && D.rec) { const s = G.c.currentTime - D.rec.t0; rt.textContent = `● ${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
  raf = requestAnimationFrame(frame);
}

// ---------- UI ----------
const dk = (label, min, max, step, val, on, fmt, help, cls = 'dial') => knob(label, min, max, step, val, on, fmt || (v => Math.round(v * 100) / 100 + ''), help, cls);
function deckUI(id) {
  const d = D[id], set = (fn) => { fn(); applyDeck(id); };
  const plat = el('canvas', { class: 'platter', 'data-d': id, title: 'Drag around to scratch. While playing, drag to nudge.' });
  // scratching: dragging the record moves it like a real turntable
  plat.addEventListener('pointerdown', e => {
    if (!d.buf) return; e.preventDefault(); plat.setPointerCapture(e.pointerId);
    const r = plat.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let la = Math.atan2(e.clientY - cy, e.clientX - cx), lt = performance.now();
    plat.classList.add('grab');
    plat.onpointermove = ev => {
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx), t = performance.now(); let da = a - la; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      const turns = da / (2 * Math.PI), secs = turns * 60 / 33.3, dts = Math.max(0.004, (t - lt) / 1000), rate = clamp(secs / dts, -8, 8);
      G.ch[id].node.port.postMessage({ rate: d.playing ? rateOf(d) + rate * 0.3 : rate, jump: !d.playing }); la = a; lt = t;
    };
    plat.onpointerup = () => { plat.onpointermove = null; plat.classList.remove('grab'); sendRate(id, !d.playing); };
  });
  const drop = el('div', { class: 'deck', 'data-d': id },
    el('div', { class: 'dhead' }, el('span', { class: 'dletter' }, id), el('b', { class: 'dname' }, d.name || 'Empty deck'), el('span', { class: 'dtime', 'data-d': id }, d.buf ? '' : 'Drop a song here'), helpBtn('djDeck')),
    el('canvas', { class: 'wave2', 'data-d': id }),
    el('div', { class: 'overview', 'data-d': id, title: 'Click to jump', onclick: e => { if (!d.buf) return; const r = e.currentTarget.getBoundingClientRect(); seek(id, (e.clientX - r.left) / r.width * d.buf.duration); } }),
    el('div', { class: 'dbody' },
      el('div', { class: 'platwrap' }, plat),
      el('div', { class: 'dside' },
        el('label', { class: 'tempo', title: 'Speed. Up is faster.' }, el('small', {}, 'TEMPO'), el('input', { type: 'range', min: -DJ.range, max: DJ.range, step: 0.01, value: -d.tempo, oninput: e => { d.tempo = -e.target.value; d.sync = false; sendRate(id); syncFx(id); }, ondblclick: e => { d.tempo = 0; e.target.value = 0; sendRate(id); } }), el('small', {}, `±${DJ.range}%`)),
        el('div', { class: 'nudge' }, el('button', { class: 'sq', title: 'Slow down for a moment', onclick: () => nudge(id, -1) }, '−'), el('button', { class: 'sq', title: 'Speed up for a moment', onclick: () => nudge(id, 1) }, '+')))),
    el('div', { class: 'dbtns' },
      el('button', { class: 'bigbtn play' + (d.playing ? ' on' : ''), onclick: () => play(id) }, d.playing ? '❚❚' : '▶'),
      el('button', { class: 'bigbtn cue', title: 'Stopped: sets the cue. Playing: jumps back to the cue and stops.', onclick: () => cue(id) }, 'CUE'),
      el('button', { class: 'bigbtn sync' + (d.sync ? ' on' : ''), title: 'Matches the speed of the other deck', onclick: () => { d.sync = !d.sync; if (d.sync) doSync(id); render(); } }, 'SYNC')),
    el('div', { class: 'hotcues' }, el('small', {}, 'HOT CUES'), d.hot.map((h, k) => el('button', { class: 'hcue' + (h != null ? ' set' : ''), style: `--hc:${HOTC[k]}`, title: 'Click to save or jump. Shift+click to save again. Right-click to clear.', onclick: e => hotCue(id, k, e.shiftKey), oncontextmenu: e => { e.preventDefault(); d.hot[k] = null; render(); } }, k + 1))),
    el('div', { class: 'loops' }, el('small', {}, 'LOOP'), [1, 2, 4, 8, 16].map(b => el('button', { class: 'loopbtn' + (d.loop && d.loop.beats === b ? ' on' : ''), title: `Loop ${b} beats`, onclick: () => setLoop(id, b) }, b)), d.loop ? el('button', { class: 'loopbtn exit', onclick: () => setLoop(id, 0) }, 'EXIT') : null),
    el('div', { class: 'deckfx' }, el('small', {}, 'EFFECT'),
      select(FX_LIST, d.fxType, v => { d.fxType = v; syncFx(id); }),
      dk('Amount', 0, 1, 0.01, d.fxAmt, v => { d.fxAmt = v; syncFx(id); }, v => Math.round(v * 100) + '', null, 'dial sm'),
      el('button', { class: 'fxonbtn' + (d.fxOn ? ' on' : ''), onclick: e => { d.fxOn = !d.fxOn; e.target.classList.toggle('on', d.fxOn); syncFx(id); } }, 'FX ON'), helpBtn('djFx')));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async e => { e.preventDefault(); drop.classList.remove('over'); const cid = e.dataTransfer.getData('sheloops/crate'); if (cid) { const it = crate.find(x => x.id === cid); if (it) loadItem(it, id); return; } if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files], id); });
  return drop;
}
function channelUI(id) {
  const d = D[id], set = fn => { fn(); applyDeck(id); };
  const eqk = (band, label) => el('div', { class: 'eqk' }, dk(label, -24, 6, 0.5, d.eq[band], v => set(() => d.eq[band] = v), v => (v > 0 ? '+' : '') + v.toFixed(0), null, 'dial sm'),
    el('button', { class: 'kill' + (d.kill[band] ? ' on' : ''), title: 'Kill: removes this part of the sound', onclick: e => { set(() => d.kill[band] = !d.kill[band]); e.target.classList.toggle('on', d.kill[band]); } }, 'KILL'));
  return el('div', { class: 'chan', 'data-d': id },
    el('b', { class: 'chname' }, id),
    dk('Gain', 0, 2, 0.01, d.trim, v => set(() => d.trim = v), v => Math.round(v * 100) + '', null, 'dial sm'),
    eqk('hi', 'High'), eqk('mid', 'Mid'), eqk('lo', 'Low'),
    dk('Filter', -1, 1, 0.01, d.filter, v => set(() => d.filter = v), v => Math.abs(v) < 0.03 ? 'off' : v < 0 ? 'LP' : 'HP', 'djFilter', 'dial'),
    el('div', { class: 'faderrow' }, el('div', { class: 'vu', 'data-d': id }), el('input', { class: 'vfader', type: 'range', min: 0, max: 1, step: 0.01, value: d.fader, title: 'Channel volume', oninput: e => set(() => d.fader = +e.target.value) })));
}
function mixerUI() {
  return el('div', { class: 'djmixer' },
    el('div', { class: 'mixtop' }, el('b', {}, 'MIXER'), helpBtn('djMixer')),
    el('div', { class: 'chans' }, channelUI('A'), channelUI('B')),
    el('div', { class: 'xfader' }, el('small', {}, 'A'), el('input', { type: 'range', min: -1, max: 1, step: 0.005, value: D.xf, title: 'Crossfader: left plays A, right plays B', oninput: e => { D.xf = +e.target.value; applyXf(); } }), el('small', {}, 'B')),
    el('div', { class: 'xfopts' }, el('span', { class: 'hint' }, 'Curve'), ...[['smooth', 'Smooth'], ['linear', 'Linear'], ['sharp', 'Sharp (scratch)']].map(([v, l]) => el('button', { class: 'chip' + (DJ.curve === v ? ' on' : ''), onclick: () => { DJ.curve = v; saveDJ(); applyXf(); render(); } }, l))),
    dk('Master', 0, 1.2, 0.01, D.master, v => { D.master = v; applyXf(); }, v => Math.round(v * 100) + '', null, 'dial'));
}
function transUI() {
  return el('div', { class: 'trans panel' },
    el('div', { class: 'fxtop' }, el('b', {}, 'Transitions'), helpBtn('djTrans'), el('span', { class: 'spacer' }),
      el('span', { class: 'hint' }, 'Length'), ...[2, 4, 8, 16, 32].map(b => el('button', { class: 'chip' + (DJ.transBeats === b ? ' on' : ''), onclick: () => { DJ.transBeats = b; saveDJ(); render(); } }, b + ' beats'))),
    el('div', { class: 'transgrid' }, TRANSITIONS.map(([k, n, w]) => el('button', { class: 'tbtn' + (DJ.transStyle === k ? ' on' : '') + (trans && trans.style === k ? ' running' : ''), title: w,
      onclick: () => { DJ.transStyle = k; saveDJ(); transition(k); } }, el('b', {}, n), el('small', {}, w)))),
    el('div', { class: 'explain' }, 'A transition moves from the deck that is playing now to the other deck. Load songs on both decks, play one, then click a transition. The other deck starts by itself, matched to the same speed.'));
}
function crateUI() {
  const list = el('div', { class: 'cratelist' });
  const row = it => el('div', { class: 'crow', draggable: 'true', ondragstart: e => e.dataTransfer.setData('sheloops/crate', it.id) },
    el('span', { class: 'cname' }, it.name), el('small', {}, it.src === 'file' ? 'my device' : it.src === 'song' ? 'current song' : 'My sounds'),
    el('button', { class: 'sq', title: 'Load on deck A', onclick: () => loadItem(it, 'A') }, 'A'), el('button', { class: 'sq', title: 'Load on deck B', onclick: () => loadItem(it, 'B') }, 'B'));
  const items = [...crate];
  if (app.P && !items.some(x => x.src === 'song')) items.unshift({ id: 'song', name: app.P.name + ' (your song)', src: 'song' });
  for (const s of SOUNDS.filter(s => s.kind === 'loop' || s.dur > 6)) if (!items.some(x => x.sid === s.id)) items.push({ id: 'snd' + s.id, name: s.name, src: 'sound', sid: s.id });
  for (const it of items) if (!crate.includes(it)) crate.push(it);
  list.append(...items.map(row));
  if (!items.length) list.append(el('p', { class: 'hint' }, 'No songs yet. Drop music files here or on a deck.'));
  const box = el('div', { class: 'crate panel' },
    el('div', { class: 'fxtop' }, el('b', {}, 'Your crate'), helpBtn('djCrate'), el('span', { class: 'spacer' }),
      el('button', { class: 'hot', onclick: () => { const i = el('input', { type: 'file', accept: 'audio/*', multiple: true }); i.onchange = () => addFiles([...i.files]); i.click(); } }, '+ Add music from my device')),
    el('div', { class: 'explain' }, 'Drag a song onto a deck, or click A or B. Drop music files from your computer anywhere here. Your song from the Studio and your loops from My sounds and the Pad machine are listed too.'),
    list);
  box.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); box.classList.add('over'); } });
  box.addEventListener('dragleave', () => box.classList.remove('over'));
  box.addEventListener('drop', e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); box.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
  return box;
}
function recUI() {
  return el('div', { class: 'djrec panel' },
    el('div', { class: 'fxtop' }, el('b', {}, 'Record your mix'), helpBtn('djRec')),
    el('div', { class: 'fxtop' }, el('button', { class: 'tog rec' + (D.rec ? ' on' : ''), onclick: toggleRec }, D.rec ? '■ Stop recording' : '● Record mix'), el('span', { class: 'rectime' }, D.rec ? '● 0:00' : lastMix ? `Last mix: ${lastMix.duration.toFixed(0)}s` : '')),
    lastMix ? el('div', { class: 'fxtop' }, el('button', { class: 'hot', onclick: () => saveMix('sounds') }, 'Save to My sounds'), el('button', { onclick: () => saveMix('wav') }, 'Download WAV'), el('button', { onclick: () => saveMix('mp3') }, 'Download MP3')) : null);
}
function stageUI() {
  const chip = (key, v, l) => el('button', { class: 'chip' + (DJ[key] === v ? ' on' : ''), onclick: () => { DJ[key] = v; saveDJ(); render(); } }, l);
  return el('div', { class: 'stagewrap' }, el('canvas', { class: 'stage' }),
    el('div', { class: 'stagectl' },
      el('span', { class: 'hint' }, 'Lights'), ...[['beams', 'Beams'], ['sweep', 'Sweep'], ['pulse', 'Pulse'], ['chase', 'Chase'], ['off', 'Off']].map(([v, l]) => chip('lights', v, l)),
      el('span', { class: 'hint' }, 'Visualizer'), ...[['bars', 'Bars'], ['mirror', 'Mirror'], ['ring', 'Ring'], ['tunnel', 'Tunnel'], ['lasers', 'Lasers'], ['wave', 'Wave']].map(([v, l]) => chip('viz', v, l)),
      el('button', { class: 'strobe', title: 'Hold for strobe (or hold the strobe key)', onpointerdown: () => strobe = true, onpointerup: () => strobe = false, onpointerleave: () => strobe = false }, 'STROBE'), helpBtn('djLights')));
}
function customUI() {
  const set = (k, v, re = true) => { DJ[k] = v; saveDJ(); if (re) render(); };
  const color = (k, label) => el('label', { class: 'num' }, label, el('input', { type: 'color', value: DJ[k], oninput: e => set(k, e.target.value, false) }));
  const chips = (k, opts) => el('div', { class: 'fxlib' }, opts.map(([v, l]) => el('button', { class: 'chip' + (DJ[k] === v ? ' on' : ''), onclick: () => set(k, v) }, l)));
  const pickImg = id => { const i = el('input', { type: 'file', accept: 'image/*' }); i.onchange = () => { const f = i.files[0]; if (!f) return; const im = new Image(); im.onload = () => { const cv = el('canvas', { width: 300, height: 300 }), g = cv.getContext('2d'), s = Math.min(im.width, im.height); g.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 300, 300); set('img' + id, cv.toDataURL('image/jpeg', 0.85)); }; im.src = URL.createObjectURL(f); }; i.click(); };
  const keyBtn = (act, label) => el('button', { class: 'keybind', onclick: e => { const b = e.currentTarget; b.textContent = 'press a key...'; const h = ev => { ev.preventDefault(); removeEventListener('keydown', h, true); DJ.keys[act] = ev.key.toLowerCase(); saveDJ(); render(); }; addEventListener('keydown', h, true); } }, el('small', {}, label), el('kbd', {}, (DJ.keys[act] || '').toUpperCase()));
  return el('details', { class: 'djcustom panel', open: !!DJ.customOpen, ontoggle: e => { DJ.customOpen = e.target.open; saveDJ(); } },
    el('summary', {}, '🎨 Customize your booth', helpBtn('djCustom')),
    el('div', { class: 'skingrid' },
      el('div', {}, el('small', {}, 'Deck style'), chips('deckStyle', [['vinyl', 'Vinyl turntable'], ['cdj', 'Digital (CDJ)']])),
      el('div', {}, el('small', {}, 'Booth body'), chips('body', [['graphite', 'Graphite'], ['white', 'White'], ['neon', 'Neon'], ['clear', 'See-through'], ['wood', 'Wood']])),
      el('div', {}, el('small', {}, 'Records and labels'), el('div', { class: 'knobrow' }, color('recA', 'Record A'), color('labelA', 'Label A'), color('recB', 'Record B'), color('labelB', 'Label B'))),
      el('div', {}, el('small', {}, 'Label pictures (your own art)'), el('div', { class: 'fxtop' },
        el('button', { onclick: () => pickImg('A') }, DJ.imgA ? 'Change label A' : 'Picture on label A'), DJ.imgA ? el('button', { class: 'sq', onclick: () => set('imgA', null) }, '×') : null,
        el('button', { onclick: () => pickImg('B') }, DJ.imgB ? 'Change label B' : 'Picture on label B'), DJ.imgB ? el('button', { class: 'sq', onclick: () => set('imgB', null) }, '×') : null)),
      el('div', {}, el('small', {}, 'Glow colors'), el('div', { class: 'knobrow' }, color('ringA', 'Deck A'), color('ringB', 'Deck B'))),
      el('div', {}, el('small', {}, 'Light color'), el('div', { class: 'fxlib' }, el('button', { class: 'chip' + (DJ.lightColor === 'rainbow' ? ' on' : ''), onclick: () => set('lightColor', 'rainbow') }, 'Rainbow'), el('button', { class: 'chip' + (DJ.lightColor === 'accent' ? ' on' : ''), onclick: () => set('lightColor', 'accent') }, 'Theme'),
        el('input', { type: 'color', value: DJ.lightColor.startsWith('#') ? DJ.lightColor : '#ff5ea8', oninput: e => set('lightColor', e.target.value, false) }))),
      el('div', { class: 'knobrow' }, dk('Beams', 2, 12, 1, DJ.beams, v => set('beams', v, false), v => v + '', null, 'dial sm'), dk('Light speed', 0.2, 3, 0.05, DJ.lightSpeed, v => set('lightSpeed', v, false), v => v.toFixed(1) + 'x', null, 'dial sm'), dk('Brightness', 0.1, 1, 0.01, DJ.lightAmt, v => set('lightAmt', v, false), v => Math.round(v * 100) + '', null, 'dial sm')),
      el('div', {}, el('small', {}, 'Tempo range'), chips('range', [[8, '±8%'], [16, '±16%'], [50, '±50%']])),
      el('div', { class: 'keybinds' }, el('small', {}, 'Your keys (click one, then press a new key)'), el('div', { class: 'fxlib' },
        keyBtn('playA', 'Play A'), keyBtn('cueA', 'Cue A'), keyBtn('syncA', 'Sync A'), keyBtn('playB', 'Play B'), keyBtn('cueB', 'Cue B'), keyBtn('syncB', 'Sync B'),
        keyBtn('xfLeft', 'Fader left'), keyBtn('xfRight', 'Fader right'), keyBtn('trans', 'Transition'), keyBtn('strobe', 'Strobe (hold)'), keyBtn('rec', 'Record mix'))),
      el('div', {}, el('button', { onclick: () => { const keep = { imgA: DJ.imgA, imgB: DJ.imgB }; Object.assign(DJ, JSON.parse(JSON.stringify(DEF)), keep); saveDJ(); render(); } }, 'Reset booth look'))));
}
export function renderDJ() {
  const view = $('#view'); view.innerHTML = '';
  root = el('div', { class: `djpage body-${DJ.body} deck-${DJ.deckStyle}` });
  root.append(
    el('div', { class: 'ptop' }, el('h1', {}, 'DJ booth'), helpBtn('dj'), el('span', { class: 'spacer' }), el('span', { class: 'hint' }, 'Keys: ' + ['playA', 'playB', 'trans'].map(k => DJ.keys[k].toUpperCase()).join(' / ') + ' (change them in Customize)')),
    el('div', { class: 'explain djsteps' }, el('b', {}, 'Start mixing in 4 steps: '), '1. Drag a song onto Deck A and another onto Deck B (or click A / B in your crate). 2. Press ▶ on Deck A. 3. Press SYNC on Deck B so both play at the same speed. 4. Click a transition, or slide the crossfader from A to B yourself. Turn the knobs to shape each song: High, Mid and Low are the EQ, Filter makes it muffled or thin, Effect adds echo, reverb and more. Drag the record to scratch.'),
    stageUI(),
    el('div', { class: 'booth' }, deckUI('A'), mixerUI(), deckUI('B')),
    transUI(),
    el('div', { class: 'djbottom' }, crateUI(), el('div', { class: 'djright' }, recUI(), customUI())));
  view.append(root);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  if (!SOUNDS.length) loadSounds().then(() => app.view === 'dj' && render());
  ctx().catch(() => { });
}
function render() { if (app.view === 'dj' && root && root.isConnected) { const y = scrollY; renderDJ(); scrollTo(0, y); } }

// ---------- keys ----------
addEventListener('keydown', e => {
  if (app.view !== 'dj' || e.ctrlKey || e.metaKey || e.altKey || e.target.matches('input:not([type=range]), select, textarea') || document.querySelector('.modal-wrap')) return;
  const k = e.key.toLowerCase(), K = DJ.keys, act = Object.keys(K).find(a => K[a] === k); if (!act) return;
  e.preventDefault(); if (e.repeat && act !== 'xfLeft' && act !== 'xfRight') return;
  ({ playA: () => play('A'), playB: () => play('B'), cueA: () => cue('A'), cueB: () => cue('B'), syncA: () => doSync('A'), syncB: () => doSync('B'),
    xfLeft: () => { D.xf = clamp(D.xf - 0.1, -1, 1); applyXf(); }, xfRight: () => { D.xf = clamp(D.xf + 0.1, -1, 1); applyXf(); }, trans: () => transition(), strobe: () => strobe = true, rec: () => toggleRec() })[act]();
});
addEventListener('keyup', e => { if (app.view === 'dj' && e.key.toLowerCase() === DJ.keys.strobe) strobe = false; });
