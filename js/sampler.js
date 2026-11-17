// Sample maker: cut pieces out of a song you own, chop it into slices, flip it, and save the pieces as sounds or put them on pads.
// Tag maker: record your producer tag (your catchphrase) and turn it into a finished, effected tag with a riser, impact or zap.
import { $, el, toast, knob, modal, ask, download, uid, safeName } from './util.js';
import { helpBtn } from './help.js';
import { ensureCtx, encodeWav } from './engine.js';
import { SOUNDS, loadSounds, soundBuffer, detectBpm } from './library.js';
import { db, saveAudio } from './store.js';

const fill = (box, ...kids) => box.replaceChildren(...kids.flat(3).filter(x => x != null && x !== false));
const pickFile = accept => new Promise(res => { const i = el('input', { type: 'file', accept }); i.onchange = () => res(i.files[0] || null); i.click(); });
const R = (s => () => (s = s * 16807 % 2147483647) / 2147483647)(99);

// ---------- buffer tools ----------
function cut(c, buf, a, b) {
  const sr = buf.sampleRate, s0 = Math.max(0, Math.floor(a * sr)), s1 = Math.min(buf.length, Math.ceil(b * sr)), n = Math.max(1, s1 - s0);
  const out = c.createBuffer(buf.numberOfChannels, n, sr);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) out.copyToChannel(buf.getChannelData(ch).subarray(s0, s1), ch);
  return out;
}
function reverse(buf) { for (let ch = 0; ch < buf.numberOfChannels; ch++) buf.getChannelData(ch).reverse(); return buf; }
function fades(buf, fin, fout) {
  const sr = buf.sampleRate, a = Math.floor(fin * sr), b = Math.floor(fout * sr), n = buf.length;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < a && i < n; i++) d[i] *= i / a; for (let i = 0; i < b && i < n; i++) d[n - 1 - i] *= i / b; }
  return buf;
}
function normalize(buf, peak = 0.95) {
  let p = 0; for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > p) p = v; } }
  if (p > 0) { const k = peak / p; for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] *= k; } }
  return buf;
}
// play a buffer through an offline graph: build(oc, source) returns the node to send to the output
async function render(buf, seconds, build) {
  const oc = new OfflineAudioContext(2, Math.ceil(seconds * buf.sampleRate), buf.sampleRate);
  const src = oc.createBufferSource(); src.buffer = buf;
  const out = build ? build(oc, src) : src; out.connect(oc.destination); src.start();
  return oc.startRendering();
}
// the start of each hit (kick, snare, word): where the sound suddenly gets louder
function findHits(buf, max = 16) {
  const d = buf.getChannelData(0), sr = buf.sampleRate, hop = 512, E = [];
  for (let i = 0; i + hop < d.length; i += hop) { let s = 0; for (let j = 0; j < hop; j++) s += d[i + j] * d[i + j]; E.push(Math.sqrt(s / hop)); }
  const peak = Math.max(...E, 1e-6), hits = []; let last = -1e9;
  for (let i = 8; i < E.length; i++) {
    let avg = 0; for (let j = i - 8; j < i; j++) avg += E[j]; avg /= 8;
    const t = i * hop / sr;
    if (E[i] > avg * 1.8 && E[i] > peak * 0.12 && t - last > 0.09) { hits.push({ t, s: E[i] }); last = t; }
  }
  return hits.sort((a, b) => b.s - a.s).slice(0, max).map(h => h.t).sort((a, b) => a - b);
}
async function saveSound(buf, name, folder) {
  const id = 's' + uid(); await saveAudio(id, buf);
  await db.put('sounds', id, { id, name, folder, fav: false, kind: buf.duration < 2.5 ? 'one-shot' : 'loop', dur: buf.duration, bpm: null, added: Date.now() });
  await loadSounds(); return id;
}
let playing = null;
async function play(buf, onEnd) {
  stopPlay(); const c = await ensureCtx(), s = c.createBufferSource(); s.buffer = buf; s.connect(c.destination); s.start();
  playing = s; s.onended = () => { if (playing === s) playing = null; onEnd && onEnd(); }; return s;
}
const stopPlay = () => { if (playing) { try { playing.stop(); } catch { } playing = null; } };

// ---------- waveform with a selection you can drag, and slices ----------
function waveView(S, redraw) {
  const cv = el('canvas', { class: 'smwave', width: 1200, height: 220 });
  const draw = () => {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, buf = S.buf; g.clearRect(0, 0, W, H);
    const css = getComputedStyle(document.body), led = css.getPropertyValue('--led').trim() || '#ff5ca8';
    if (!buf) { g.fillStyle = 'rgba(255,255,255,.35)'; g.font = '600 22px sans-serif'; g.textAlign = 'center'; g.fillText('Choose a song to start', W / 2, H / 2); return; }
    const v0 = S.v0 || 0, v1 = S.v1 || buf.duration, span = v1 - v0, d = buf.getChannelData(0), sr = buf.sampleRate, per = span * sr / W, x = t => (t - v0) / span * W;
    g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x(S.a), 0, x(S.b) - x(S.a), H);
    for (let px = 0; px < W; px++) {
      let mn = 1, mx = -1; const s0 = Math.floor(v0 * sr + px * per), s1 = Math.floor(v0 * sr + (px + 1) * per);
      for (let i = s0; i < s1; i += Math.max(1, (s1 - s0) >> 6)) { const v = d[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
      const t = v0 + px / W * span; g.fillStyle = t >= S.a && t <= S.b ? led : 'rgba(255,255,255,.35)';
      g.fillRect(px, H / 2 + mn * H * 0.46, 1, Math.max(1, (mx - mn) * H * 0.46));
    }
    S.slices.forEach((t, i) => { g.fillStyle = `hsl(${i * 47 % 360} 100% 65%)`; g.fillRect(x(t) - 1, 0, 2, H); g.font = '700 16px sans-serif'; g.fillText(i + 1, x(t) + 4, 18); });
    g.fillStyle = '#fff'; for (const t of [S.a, S.b]) { g.fillRect(x(t) - 1.5, 0, 3, H); g.fillRect(x(t) - 6, H - 12, 12, 12); }
    if (S.head != null) { g.fillStyle = '#fff'; g.fillRect(x(S.head), 0, 1, H); }
    if (S.bpm) { g.fillStyle = 'rgba(255,255,255,.12)'; const beat = 60 / S.bpm; for (let b = Math.ceil(v0 / beat) * beat; b < v1; b += beat) g.fillRect(x(b), H - 8, 1, 8); }
  };
  let drag = null;
  cv.onpointerdown = e => {
    if (!S.buf) return; const r = cv.getBoundingClientRect(), v0 = S.v0 || 0, span = (S.v1 || S.buf.duration) - v0, t = v0 + (e.clientX - r.left) / r.width * span, tol = span * 0.015;
    drag = Math.abs(t - S.a) < tol ? 'a' : Math.abs(t - S.b) < tol ? 'b' : 'new'; if (drag === 'new') { S.a = S.b = t; drag = 'b'; }
    try { cv.setPointerCapture(e.pointerId); } catch { }
  };
  cv.onpointermove = e => { if (!drag) return; const r = cv.getBoundingClientRect(), v0 = S.v0 || 0, span = (S.v1 || S.buf.duration) - v0, t = Math.max(0, Math.min(S.buf.duration, v0 + (e.clientX - r.left) / r.width * span)); S[drag] = t; if (S.a > S.b) { [S.a, S.b] = [S.b, S.a]; drag = drag === 'a' ? 'b' : 'a'; } draw(); };
  cv.onpointerup = () => { if (drag) { drag = null; if (S.b - S.a < 0.02) { S.a = 0; S.b = S.buf.duration; } redraw(); } };
  return { cv, draw };
}

// ---------- Sample maker ----------
function sampleMaker(opts = {}) {
  const S = { buf: null, name: '', a: 0, b: 0, slices: [], pitch: 0, rev: false, fin: 0.005, fout: 0.02, lofi: false, head: null, gain: 1, lowcut: 20, hicut: 20000, norm: true, loop: false, bpm: 0, v0: 0, v1: 0, crush: 0 };
  const box = el('div', { class: 'smaker' });
  const rerender = () => draw();
  const wave = waveView(S, rerender);
  const load = async (buf, name) => { S.buf = buf; S.name = name; S.a = 0; S.b = Math.min(buf.duration, 8); S.slices = []; S.v0 = 0; S.v1 = 0; S.bpm = 0; draw(); try { S.bpm = Math.round(detectBpm(buf) || 0); draw(); } catch { } };
  // the selection with every tool applied
  const piece = async (a = S.a, b = S.b) => {
    const c = await ensureCtx(); let p = cut(c, S.buf, a, b); const rate = Math.pow(2, S.pitch / 12);
    const shaped = S.pitch || S.lofi || S.lowcut > 25 || S.hicut < 19000 || S.crush;
    if (shaped) p = await render(p, p.duration / rate + 0.05, (oc, src) => {
      src.playbackRate.value = rate; let head = src;
      const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = S.lofi ? Math.max(180, S.lowcut) : S.lowcut;
      const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = S.lofi ? Math.min(3800, S.hicut) : S.hicut;
      head.connect(hp); hp.connect(lp); head = lp;
      if (S.crush) { const ws = oc.createWaveShaper(), steps = Math.pow(2, 12 - S.crush * 9), c = new Float32Array(2048); for (let i = 0; i < 2048; i++) { const x = i / 1023.5 - 1; c[i] = Math.round(x * steps) / steps; } ws.curve = c; head.connect(ws); head = ws; }
      return head; });
    if (S.rev) reverse(p);
    fades(p, S.fin, S.fout);
    if (S.norm) normalize(p, 0.9);
    if (S.gain !== 1) for (let ch = 0; ch < p.numberOfChannels; ch++) { const d = p.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = Math.max(-1, Math.min(1, d[i] * S.gain)); }
    return p;
  };
  const playSel = async () => { if (!S.buf) return; const p = await piece(); const t0 = performance.now(), a = S.a, len = S.b - S.a;
    await play(p, () => { S.head = null; wave.draw(); if (S.loop && box.isConnected) playSel(); });
    const step = () => { if (!playing) return; S.head = a + Math.min(len, (performance.now() - t0) / 1000 * Math.pow(2, S.pitch / 12)); wave.draw(); requestAnimationFrame(step); }; step(); };
  const sliceRanges = () => { const pts = [S.a, ...S.slices.filter(t => t > S.a && t < S.b), S.b]; return pts.slice(0, -1).map((t, i) => [t, pts[i + 1]]); };
  const saveSel = async () => { if (!S.buf) return; const n = await ask('Name this sample', 'Name', (S.name || 'Sample') + ' chop'); if (!n) return; const id = await saveSound(await piece(), n, 'Samples'); toast(`"${n}" saved in My sounds (Samples).`); opts.onSave && opts.onSave(id); };
  const saveSlices = async toPads => {
    if (!S.slices.length) return toast('Chop it first: pick Equal slices or Find the hits.');
    const ids = []; let k = 1;
    for (const [a, b] of sliceRanges()) { ids.push(await saveSound(await piece(a, b), `${S.name || 'Sample'} slice ${k++}`, 'Samples')); }
    if (toPads) { const pads = await import('./pads.js'); pads.loadSlicesToPads(ids); toast(`${ids.length} slices are on pads 1 to ${ids.length}. Open the Pad machine to play them.`); }
    else toast(`${ids.length} slices saved in My sounds (Samples).`);
  };
  function draw() {
    const chip = (on, label, fn) => el('button', { class: 'chip' + (on ? ' on' : ''), onclick: fn }, label);
    fill(box, 
      el('p', { class: 'smnote' }, 'Only sample songs you made or have the rights to use. If you release music with someone else\'s sample, get their permission first.'),
      el('div', { class: 'smrow' },
        el('button', { class: 'hot', onclick: async () => { const f = await pickFile('audio/*'); if (!f) return; try { const c = await ensureCtx(); await load(await c.decodeAudioData(await f.arrayBuffer()), f.name.replace(/\.[^.]+$/, '')); } catch { toast('Could not open that file.'); } } }, 'Choose a song file'),
        SOUNDS.length ? el('select', { class: 'smsel', onchange: async e => { const s = SOUNDS.find(x => x.id === e.target.value); if (s) await load(await soundBuffer(s.id), s.name); } }, el('option', { value: '' }, 'or pick from My sounds'), ...SOUNDS.map(s => el('option', { value: s.id }, s.folder + ' / ' + s.name))) : null,
        S.buf ? el('span', { class: 'smname' }, S.name + ' · ' + S.buf.duration.toFixed(1) + 's') : null),
      el('div', { class: 'smsteps' }, ...['Choose a song', 'Drag to pick a piece', 'Chop it', 'Flip it', 'Keep it'].map((t, i) => el('span', { class: 'smstep' + ((i === 0 && S.buf) || (i === 1 && S.buf && S.b - S.a < S.buf.duration) || (i === 2 && S.slices.length) ? ' done' : '') }, el('b', {}, i + 1), t))),
      el('div', { class: 'smwavewrap' }, wave.cv),
      S.buf ? el('div', { class: 'smrow' },
        el('button', { onclick: () => { S.v0 = Math.max(0, S.a - (S.b - S.a) * 0.1); S.v1 = Math.min(S.buf.duration, S.b + (S.b - S.a) * 0.1); draw(); } }, 'Zoom to the piece'),
        el('button', { onclick: () => { S.v0 = 0; S.v1 = 0; draw(); } }, 'Show all'),
        el('button', { onclick: () => { const step = (S.b - S.a); S.a = Math.max(0, S.a - step); S.b = S.a + step; draw(); } }, '◀ Move back'),
        el('button', { onclick: () => { const step = (S.b - S.a); S.b = Math.min(S.buf.duration, S.b + step); S.a = S.b - step; draw(); } }, 'Move ahead ▶'),
        S.bpm ? [el('span', { class: 'smtime' }, `about ${S.bpm} BPM`),
          ...[[1, '1 beat'], [2, '2 beats'], [4, '1 bar'], [8, '2 bars'], [16, '4 bars']].map(([n, l]) => el('button', { class: 'chip', title: 'Make the piece exactly this long, starting where it starts now', onclick: () => { S.b = Math.min(S.buf.duration, S.a + n * 60 / S.bpm); draw(); } }, l))] : null) : null,
      el('p', { class: 'hint' }, 'Drag on the wave to pick a piece. Drag the white edges to fine tune it. Tip: pick a length in beats or bars so it loops in time.'),
      S.buf ? el('div', { class: 'smrow' },
        el('button', { class: 'hot', onclick: playSel }, '▶ Play the piece'), el('button', { onclick: () => { S.loop = false; stopPlay(); S.head = null; wave.draw(); draw(); } }, '■ Stop'),
        el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: S.loop, onchange: e => { S.loop = e.target.checked; } }), 'Loop it'),
        el('span', { class: 'smtime' }, `${S.a.toFixed(2)}s to ${S.b.toFixed(2)}s (${(S.b - S.a).toFixed(2)}s)`)) : null,
      S.buf ? el('div', { class: 'smgrid' },
        el('div', { class: 'smcard' }, el('b', {}, 'Chop it'), el('small', {}, 'Split the piece into slices you can play one by one.'),
          el('div', { class: 'fxlib' }, ...[2, 4, 8, 16].map(n => chip(false, n + ' equal slices', () => { S.slices = Array.from({ length: n - 1 }, (_, i) => S.a + (S.b - S.a) * (i + 1) / n); draw(); })),
            S.bpm ? chip(false, 'One per beat', () => { const b = 60 / S.bpm; S.slices = []; for (let t = S.a + b; t < S.b - 0.01; t += b) S.slices.push(t); draw(); }) : null,
            chip(false, 'Find the hits', () => { const p = cut(new OfflineAudioContext(1, 1, S.buf.sampleRate), S.buf, S.a, S.b); S.slices = findHits(p).map(t => S.a + t).filter(t => t > S.a + 0.02); draw(); toast(S.slices.length ? `Found ${S.slices.length + 1} hits.` : 'No clear hits here. Try equal slices.'); }),
            S.slices.length ? chip(false, 'No slices', () => { S.slices = []; draw(); }) : null),
          S.slices.length ? el('div', { class: 'smslices' }, ...sliceRanges().map(([a, b], i) => el('button', { class: 'smslice', style: `--h:${i * 47 % 360}`, onclick: async () => play(await piece(a, b)) }, i + 1))) : null),
        el('div', { class: 'smcard' }, el('b', {}, 'Flip it'), el('small', {}, 'Change the sound of the piece.'),
          knob('Pitch', -12, 12, 1, S.pitch, v => { S.pitch = v; }, v => (v > 0 ? '+' : '') + v, null, 'dial sm'),
          el('div', { class: 'fxlib' }, chip(S.rev, 'Reverse', () => { S.rev = !S.rev; draw(); }), chip(S.lofi, 'Lo-fi', () => { S.lofi = !S.lofi; draw(); }), chip(S.pitch === -5, 'Slowed down', () => { S.pitch = S.pitch === -5 ? 0 : -5; draw(); }), chip(S.pitch === 4, 'Sped up', () => { S.pitch = S.pitch === 4 ? 0 : 4; draw(); }), chip(S.pitch === -12, 'Octave down', () => { S.pitch = S.pitch === -12 ? 0 : -12; draw(); })),
          el('div', { class: 'knobrow' },
            knob('Low cut', 20, 1000, 1, S.lowcut, v => { S.lowcut = v; }, v => Math.round(v) + ' Hz', null, 'dial sm'),
            knob('High cut', 1000, 20000, 10, S.hicut, v => { S.hicut = v; }, v => v >= 19000 ? 'open' : (v / 1000).toFixed(1) + ' kHz', null, 'dial sm'),
            knob('Crunch', 0, 1, 0.01, S.crush, v => { S.crush = v; }, v => v ? Math.round(v * 100) + '%' : 'off', null, 'dial sm'),
            knob('Fade in', 0, 0.5, 0.001, S.fin, v => { S.fin = v; }, v => Math.round(v * 1000) + ' ms', null, 'dial sm'),
            knob('Fade out', 0, 1, 0.01, S.fout, v => { S.fout = v; }, v => Math.round(v * 1000) + ' ms', null, 'dial sm'),
            knob('Volume', 0.2, 2, 0.01, S.gain, v => { S.gain = v; }, v => Math.round(v * 100) + '%', null, 'dial sm')),
          el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: S.norm, onchange: e => { S.norm = e.target.checked; } }), 'Make it loud and even (normalize)'),
          el('small', {}, 'Changes apply when you press Play or Save.')),
        el('div', { class: 'smcard' }, el('b', {}, 'Keep it'), el('small', {}, 'Save to My sounds. Use it in the Beat maker, Studio and pads.'),
          el('button', { class: 'hot', onclick: saveSel }, 'Save the piece'),
          el('button', { onclick: () => saveSlices(false) }, 'Save every slice'),
          el('button', { onclick: () => saveSlices(true) }, 'Put slices on pads'))) : null);
    wave.draw();
  }
  draw();
  return box;
}

// ---------- Tag maker ----------
export const TAG_STYLES = {
  'Deep and dark': { what: 'Pitched way down with a big room. The classic.', pitch: -6, verb: 0.35, echo: 0.15 },
  'Echo throw': { what: 'The last word bounces away.', pitch: 0, verb: 0.15, echo: 0.6 },
  'Radio call': { what: 'Thin and crunchy like a walkie-talkie.', pitch: 0, verb: 0.1, echo: 0.2, radio: true },
  'Whisper wide': { what: 'Airy and spread out, close to your ear.', pitch: 0, verb: 0.45, echo: 0.25, air: true },
  'Robot': { what: 'Metallic and computer-like.', pitch: -2, verb: 0.2, echo: 0.2, robot: true },
  'Chipmunk': { what: 'High and fast and funny.', pitch: 7, verb: 0.15, echo: 0.2 },
  'Cathedral': { what: 'A huge hall that rings out.', pitch: -3, verb: 0.75, echo: 0 },
  'Reverse swell': { what: 'A ghostly sweep that sucks into your voice.', pitch: -2, verb: 0.4, echo: 0.1, swell: true },
  'Stutter': { what: 'The first sound repeats before it lands.', pitch: 0, verb: 0.2, echo: 0.2, stutter: true },
};
export const TAG_LAYERS = { riser: 'Riser (sweeps up)', impact: 'Impact (boom)', zap: 'Laser zap', subdrop: 'Sub drop', reverse: 'Reverse cymbal', vinyl: 'Vinyl stop', whoosh: 'Whoosh', bell: 'Shiny bell', glitch: 'Glitch stutter', horn: 'Air horn', scratch: 'Record scratch', heartbeat: 'Heartbeat' };
const noiseBuf = (c, sec) => { const b = c.createBuffer(1, Math.ceil(sec * c.sampleRate), c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1; return b; };
const roomIR = (c, sec) => { const b = c.createBuffer(2, Math.ceil(sec * c.sampleRate), c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / d.length, 3); } return b; };
// one finished tag: voice through the style, plus an optional sound layer
export async function renderTag(voice, o) {
  const st = TAG_STYLES[o.style] || TAG_STYLES['Deep and dark'], sr = voice.sampleRate;
  const pitch = st.pitch + (o.pitch || 0), rate = Math.pow(2, pitch / 12), vlen = voice.duration / rate;
  const LS = new Set(o.layers || (o.layer && o.layer !== 'none' ? [o.layer] : [])); const pre = LS.has('riser') || LS.has('reverse') || LS.has('whoosh') || st.swell ? 1.2 : st.stutter ? 0.5 : 0.05;
  const total = pre + vlen + 2.2;
  const oc = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
  const bus = oc.createGain(), dry = oc.createGain(), verb = oc.createConvolver(), vg = oc.createGain(), dl = oc.createDelay(1), fb = oc.createGain(), dlf = oc.createBiquadFilter(), eg = oc.createGain(), comp = oc.createDynamicsCompressor();
  verb.buffer = roomIR(oc, 0.6 + (o.verb ?? st.verb) * 3); vg.gain.value = (o.verb ?? st.verb) * 1.4;
  dl.delayTime.value = 0.27; fb.gain.value = Math.min(0.7, (o.echo ?? st.echo) * 0.9); dlf.type = 'lowpass'; dlf.frequency.value = 3500; eg.gain.value = (o.echo ?? st.echo);
  bus.connect(dry); dry.connect(comp); bus.connect(verb); verb.connect(vg); vg.connect(comp); bus.connect(dl); dl.connect(dlf); dlf.connect(fb); fb.connect(dl); dlf.connect(eg); eg.connect(comp); comp.connect(oc.destination);
  // the voice chain for this style
  let head = bus;
  const insert = node => { node.connect(head); head = node; };
  if (st.radio) { const bp = oc.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 1.4; const ws = oc.createWaveShaper(), curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 4) / Math.tanh(4); } ws.curve = curve; ws.connect(bp); bp.connect(head); head = ws; }
  if (st.air) { const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350; const sh = oc.createBiquadFilter(); sh.type = 'highshelf'; sh.frequency.value = 6000; sh.gain.value = 8; sh.connect(hp); hp.connect(head); head = sh; }
  if (st.robot) { const rm = oc.createGain(); rm.gain.value = 0; const osc = oc.createOscillator(); osc.frequency.value = 55; osc.connect(rm.gain); osc.start(); rm.connect(head); head = rm; }
  const play = (when, off = 0, dur) => { const s = oc.createBufferSource(); s.buffer = voice; s.playbackRate.value = rate; s.connect(head); s.start(when, off, dur); };
  if (st.stutter) { for (let k = 0; k < 4; k++) play(pre - 0.48 + k * 0.12, 0, 0.1 * rate); }
  play(pre);
  if (st.swell) { // reversed echo of the voice, rising into it
    const rv = await render(voice, voice.duration / rate + 1.5, (o2, src) => { src.playbackRate.value = rate; const cv = o2.createConvolver(); cv.buffer = roomIR(o2, 1.5); src.connect(cv); return cv; });
    reverse(rv); const s = oc.createBufferSource(); s.buffer = rv; const g = oc.createGain(); g.gain.value = 0.6; s.connect(g); g.connect(comp); s.start(Math.max(0, pre - rv.duration + 0.15));
  }
  // the extra sound
  const lv = oc.createGain(); lv.gain.value = o.layerVol ?? 0.6; lv.connect(comp);
  const t0 = pre;
  for (const L of LS) {
  if (L === 'whoosh') { const n = oc.createBufferSource(); n.buffer = noiseBuf(oc, pre + 0.4); const f = oc.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(400, 0); f.frequency.exponentialRampToValueAtTime(4000, pre); f.frequency.exponentialRampToValueAtTime(600, pre + 0.4); const g = oc.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.7, pre); g.gain.exponentialRampToValueAtTime(0.001, pre + 0.4); const pn = oc.createStereoPanner(); pn.pan.setValueAtTime(-1, 0); pn.pan.linearRampToValueAtTime(1, pre + 0.4); n.connect(f); f.connect(g); g.connect(pn); pn.connect(lv); n.start(0); }
  if (L === 'bell') for (const [f0, a] of [[1320, 0.3], [1980, 0.15], [2640, 0.1]]) { const o2 = oc.createOscillator(), g = oc.createGain(); o2.frequency.value = f0; g.gain.setValueAtTime(a, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.6); o2.connect(g); g.connect(lv); g.connect(verb); o2.start(t0); o2.stop(t0 + 1.7); }
  if (L === 'glitch') { const s2 = oc.createBufferSource(); s2.buffer = voice; for (let k = 0; k < 6; k++) { const s3 = oc.createBufferSource(); s3.buffer = voice; s3.playbackRate.value = rate * (1 + (k % 2) * 0.5); const g = oc.createGain(); g.gain.value = 0.5; s3.connect(g); g.connect(lv); s3.start(pre + vlen + 0.05 + k * 0.06, Math.max(0, voice.duration - 0.25), 0.05); } void s2; }
  if (L === 'horn') for (const f0 of [466, 554, 698]) { const o2 = oc.createOscillator(), g = oc.createGain(), f = oc.createBiquadFilter(); o2.type = 'sawtooth'; o2.frequency.value = f0; f.type = 'lowpass'; f.frequency.value = 2500; for (let k = 0; k < 3; k++) { const a = t0 + k * 0.18; g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(0.18, a + 0.02); g.gain.setValueAtTime(0.18, a + 0.12); g.gain.linearRampToValueAtTime(0, a + 0.15); } o2.connect(f); f.connect(g); g.connect(lv); o2.start(t0); o2.stop(t0 + 0.6); }
  if (L === 'scratch') { const s2 = oc.createBufferSource(); s2.buffer = voice; const g = oc.createGain(); g.gain.value = 0.6; s2.playbackRate.setValueAtTime(0.5, pre + vlen); s2.playbackRate.linearRampToValueAtTime(2.2, pre + vlen + 0.12); s2.playbackRate.linearRampToValueAtTime(0.4, pre + vlen + 0.25); s2.connect(g); g.connect(lv); s2.start(pre + vlen, 0, 0.3); }
  if (L === 'heartbeat') for (const k of [0, 0.22, 0.8, 1.02]) { const o2 = oc.createOscillator(), g = oc.createGain(); o2.frequency.setValueAtTime(70, t0 + k); o2.frequency.exponentialRampToValueAtTime(40, t0 + k + 0.15); g.gain.setValueAtTime(k % 0.8 ? 0.6 : 0.9, t0 + k); g.gain.exponentialRampToValueAtTime(0.001, t0 + k + 0.2); o2.connect(g); g.connect(lv); o2.start(t0 + k); o2.stop(t0 + k + 0.25); }
  if (L === 'riser' || L === 'reverse') { const n = oc.createBufferSource(); n.buffer = noiseBuf(oc, pre); const f = oc.createBiquadFilter(); f.type = L === 'riser' ? 'bandpass' : 'highpass'; f.Q.value = 3; f.frequency.setValueAtTime(L === 'riser' ? 300 : 5000, 0); if (L === 'riser') f.frequency.exponentialRampToValueAtTime(9000, pre); const g = oc.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.8, pre - 0.02); g.gain.linearRampToValueAtTime(0, pre); n.connect(f); f.connect(g); g.connect(lv); n.start(0); }
  if (L === 'impact' || L === 'subdrop') { const o2 = oc.createOscillator(), g = oc.createGain(); o2.frequency.setValueAtTime(L === 'impact' ? 120 : 90, t0); o2.frequency.exponentialRampToValueAtTime(30, t0 + (L === 'impact' ? 0.5 : 1.6)); g.gain.setValueAtTime(1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + (L === 'impact' ? 0.9 : 1.8)); o2.connect(g); g.connect(lv); o2.start(t0); o2.stop(t0 + 2);
    if (L === 'impact') { const n = oc.createBufferSource(); n.buffer = noiseBuf(oc, 0.6); const ng = oc.createGain(); ng.gain.setValueAtTime(0.6, t0); ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5); n.connect(ng); ng.connect(verb); ng.connect(lv); n.start(t0); } }
  if (L === 'zap') { const o2 = oc.createOscillator(), g = oc.createGain(); o2.type = 'sawtooth'; o2.frequency.setValueAtTime(3200, t0); o2.frequency.exponentialRampToValueAtTime(80, t0 + 0.35); g.gain.setValueAtTime(0.35, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4); o2.connect(g); g.connect(lv); g.connect(dl); o2.start(t0); o2.stop(t0 + 0.5); }
  if (L === 'vinyl') { const v2 = oc.createBufferSource(); v2.buffer = voice; v2.playbackRate.setValueAtTime(rate, pre + vlen * 0.6); v2.playbackRate.linearRampToValueAtTime(0.05, pre + vlen + 0.5); const g = oc.createGain(); g.gain.value = 0.5; v2.connect(g); g.connect(lv); v2.start(pre + vlen * 0.6, voice.duration * 0.6); }
  }
  return normalize(await oc.startRendering(), 0.92);
}
function tagMaker() {
  const T = { voice: null, style: 'Deep and dark', layers: ['riser'], pitch: 0, verb: null, echo: null, layerVol: 0.6, out: null, recording: null, loop: false, dirty: true };
  const box = el('div', { class: 'tmaker' });
  const make = async () => { if (!T.voice) { toast('Record your tag or pick a sound first.'); return null; } T.out = await renderTag(T.voice, T); drawResult(); return T.out; };
  const result = el('canvas', { class: 'tagwave', width: 900, height: 90 });
  const drawResult = () => { const g = result.getContext('2d'), W = result.width, H = result.height; g.clearRect(0, 0, W, H); if (!T.out) return; const d = T.out.getChannelData(0), per = d.length / W, led = getComputedStyle(document.body).getPropertyValue('--led').trim() || '#ff5ca8'; g.fillStyle = led; for (let x = 0; x < W; x++) { let m = 0; for (let i = Math.floor(x * per); i < (x + 1) * per; i += 8) m = Math.max(m, Math.abs(d[i] || 0)); g.fillRect(x, H / 2 - m * H / 2, 1, Math.max(1, m * H)); } };
  const playTag = async () => { const b = await make(); if (b) play(b, () => { if (T.loop && box.isConnected) setTimeout(playTag, 400); }); };
  const record = async btn => {
    if (T.recording) { T.recording.stop(); return; }
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { return toast('Allow the microphone to record your tag.'); }
    const chunks = [], mr = new MediaRecorder(stream); T.recording = mr; btn.textContent = '■ Stop'; btn.classList.add('rec');
    mr.ondataavailable = e => chunks.push(e.data);
    mr.onstop = async () => { stream.getTracks().forEach(t => t.stop()); T.recording = null; try { const c = await ensureCtx(); T.voice = trimSilence(c, await c.decodeAudioData(await new Blob(chunks).arrayBuffer())); toast('Got it. Now pick a style and press Play.'); } catch { toast('Could not use that recording.'); } draw(); };
    mr.start(); setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, 6000);
  };
  function draw() {
    fill(box, 
      el('div', { class: 'tstep' }, el('span', { class: 'tnum' }, '1'), el('div', {}, el('b', {}, 'Say your tag'), el('small', {}, 'Your catchphrase, like your producer name. Up to 6 seconds. Say it clearly and close to the mic.'),
        el('div', { class: 'smrow' }, el('button', { class: 'hot', onclick: e => record(e.currentTarget) }, T.recording ? '■ Stop' : '● Record my tag'),
          SOUNDS.length ? el('select', { class: 'smsel', onchange: async e => { const s = SOUNDS.find(x => x.id === e.target.value); if (s) { T.voice = await soundBuffer(s.id); draw(); } } }, el('option', { value: '' }, 'or use a sound I have'), ...SOUNDS.map(s => el('option', { value: s.id }, s.name))) : null,
          T.voice ? el('button', { onclick: () => play(T.voice) }, '▶ Hear my voice') : null,
          T.voice ? el('span', { class: 'tok' }, 'Voice ready · ' + T.voice.duration.toFixed(1) + 's') : null))),
      el('div', { class: 'tstep' }, el('span', { class: 'tnum' }, '2'), el('div', {}, el('b', {}, 'Pick a style'),
        el('div', { class: 'tstyles' }, ...Object.entries(TAG_STYLES).map(([k, v]) => el('button', { class: 'tstyle' + (T.style === k ? ' on' : ''), onclick: () => { T.style = k; T.verb = T.echo = null; draw(); } }, el('b', {}, k), el('small', {}, v.what)))))),
      el('div', { class: 'tstep' }, el('span', { class: 'tnum' }, '3'), el('div', {}, el('b', {}, 'Add a sound around it'),
        el('small', {}, 'Pick as many as you like. They play together with your voice.'),
        el('div', { class: 'fxlib' }, ...Object.entries(TAG_LAYERS).map(([k, n]) => el('button', { class: 'chip' + (T.layers.includes(k) ? ' on' : ''), onclick: async () => { T.layers = T.layers.includes(k) ? T.layers.filter(x => x !== k) : [...T.layers, k]; draw(); } }, n)),
          el('button', { class: 'chip', onclick: () => { T.layers = []; draw(); } }, 'None')),
        el('div', { class: 'knobrow' },
          knob('Voice pitch', -7, 7, 1, T.pitch, v => { T.pitch = v; }, v => (v > 0 ? '+' : '') + v, null, 'dial sm'),
          knob('Echo', 0, 1, 0.01, T.echo ?? TAG_STYLES[T.style].echo, v => { T.echo = v; }, v => Math.round(v * 100) + '%', null, 'dial sm'),
          knob('Room', 0, 1, 0.01, T.verb ?? TAG_STYLES[T.style].verb, v => { T.verb = v; }, v => Math.round(v * 100) + '%', null, 'dial sm'),
          knob('Extra sound', 0, 1, 0.01, T.layerVol, v => { T.layerVol = v; }, v => Math.round(v * 100) + '%', null, 'dial sm')))),
      el('div', { class: 'tstep' }, el('span', { class: 'tnum' }, '4'), el('div', {}, el('b', {}, 'Hear it and keep it'),
        el('div', { class: 'smrow' },
          el('button', { class: 'hot', onclick: playTag }, '▶ Play my tag'),
          el('button', { onclick: () => { T.loop = false; stopPlay(); draw(); } }, '■ Stop'),
          el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: T.loop, onchange: e => { T.loop = e.target.checked; } }), 'Play it on repeat'),
          el('button', { onclick: async () => { const b = await make(); if (!b) return; const n = await ask('Name your tag', 'Name', 'My tag ' + T.style.toLowerCase()); if (!n) return; await saveSound(b, n, 'My tags'); toast(`"${n}" saved in My sounds (My tags). Drop it at the start of any beat.`); } }, 'Save to My sounds'),
          el('button', { onclick: async () => { const b = await make(); if (b) download(new Blob([encodeWav(b)], { type: 'audio/wav' }), safeName('tag-' + T.style) + '.wav'); } }, 'Download WAV')),
        result, el('small', {}, 'Every change is used the next time you press Play. Turn on repeat and change the knobs while it plays.'))),
      el('details', { class: 'taghelp' }, el('summary', {}, 'How to make a great tag'),
        el('ul', {}, el('li', {}, 'Keep it short: your name, or a short line like "made it in the studio".'),
          el('li', {}, 'Say it close to the mic, clearly, with a little attitude.'),
          el('li', {}, 'Deep and dark plus Riser and Impact is the classic producer tag.'),
          el('li', {}, 'Save it, then drop it at the very start of your beats from My sounds.'))));
    drawResult();
  }
  draw();
  return box;
}
function trimSilence(c, buf) {
  const d = buf.getChannelData(0), th = 0.02; let a = 0, b = d.length - 1;
  while (a < b && Math.abs(d[a]) < th) a++; while (b > a && Math.abs(d[b]) < th) b--;
  return cut(c, buf, Math.max(0, a / buf.sampleRate - 0.03), Math.min(buf.duration, b / buf.sampleRate + 0.15));
}

// ---------- the page and the pop-up ----------
let tab = 'sample';
export async function renderSampler() {
  await loadSounds();
  const view = $('#view'); view.innerHTML = '';
  const body = el('div', {});
  const draw = () => { body.replaceChildren(tab === 'sample' ? sampleMaker() : tagMaker()); tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.classList.contains('t-' + tab))); };
  const tabs = el('div', { class: 'smtabs' }, ...[['sample', 'Sample a song', 'Cut, chop and flip pieces of a song'], ['tag', 'Producer tag', 'Make your catchphrase with effects']].map(([k, n, w]) => el('button', { class: 't-' + k, onclick: () => { tab = k; draw(); } }, el('b', {}, n), el('small', {}, w))));
  view.append(el('div', { class: 'smpage panel' }, el('div', { class: 'smhead' }, el('h1', {}, 'Sample maker'), helpBtn('sampler')), tabs, body));
  draw();
}
export async function openSampleMaker(opts = {}) {
  await loadSounds();
  modal('Sample a song', el('div', { class: 'smmodal' }, sampleMaker(opts)));
}
