// Fix My Voice: analyze a vocal track and suggest fixes. Fixes only add effects or clip volume. The recording is never changed.
import { el, toast, clamp } from './util.js';
import { helpBtn } from './help.js';
import { app, save, snapshot } from './state.js';
import { audioCache } from './store.js';
import { FX_ORDER, newFx, scaleMask } from './fx.js';
import { applyMix, refresh } from './engine.js';
import { abButton } from './fxui.js';

// ---------- small FFT ----------
function fftMag(frame) { // frame length power of two, returns magnitude spectrum (N/2+1)
  const N = frame.length, re = Float64Array.from(frame), im = new Float64Array(N);
  for (let i = 1, j = 0; i < N; i++) { let b = N >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let size = 2; size <= N; size <<= 1) {
    const h = size >> 1, a = -2 * Math.PI / size, wr = Math.cos(a), wi = Math.sin(a);
    for (let s = 0; s < N; s += size) { let cr = 1, ci = 0; for (let k = 0; k < h; k++) { const p = s + k, q = p + h, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr; re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
  const out = new Float64Array(N / 2 + 1); for (let k = 0; k <= N / 2; k++) out[k] = Math.hypot(re[k], im[k]);
  return out;
}
const hann = n => { const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); return w; };
const W1024 = hann(1024), W2048 = hann(2048);

function yin(x, sr) { // x: Float32Array window, returns Hz or 0
  const W = Math.floor(x.length / 2), maxL = Math.min(W - 1, Math.floor(sr / 70)), minL = Math.floor(sr / 1000), d = new Float64Array(maxL + 2);
  let run = 0; d[0] = 1;
  for (let t = 1; t <= maxL; t++) { let s = 0; for (let i = 0; i < W; i++) { const q = x[i] - x[i + t]; s += q * q; } run += s; d[t] = run > 0 ? s * t / run : 1; }
  for (let t = minL; t < maxL; t++) if (d[t] < 0.12) { while (t + 1 < maxL && d[t + 1] < d[t]) t++; const a = d[t - 1], b = d[t], c = d[t + 1], den = a - 2 * b + c; return sr / (den ? t + 0.5 * (a - c) / den : t); }
  return 0;
}

// ---------- analysis ----------
export function analyze(t) {
  const segs = [];
  for (const c of t.clips) { const b = audioCache.get(c.audioId); if (!b) continue; const sr = b.sampleRate, a = Math.floor(c.offset * sr), e = Math.min(b.length, Math.floor((c.offset + c.dur) * sr)); if (e - a > sr * 0.3) segs.push({ d: b.getChannelData(0).subarray(a, e), sr, gain: c.gain ?? 1 }); }
  if (!segs.length) return null;
  const frames = []; let clips = 0, peak = 0, run = 0, lastClip = -1e9, pos = 0;
  for (const s of segs) {
    const F = Math.floor(s.sr * 0.05);
    for (let i = 0; i + F <= s.d.length; i += F) {
      let q = 0, pk = 0;
      for (let j = i; j < i + F; j++) { const v = Math.abs(s.d[j]); q += v * v; if (v > pk) pk = v; if (v > 0.985) { if (++run === 3) { const at = pos + j / s.sr; if (at - lastClip > 0.1) clips++; lastClip = at; } } else run = 0; }
      frames.push({ s, i, db: 10 * Math.log10(q / F + 1e-12) + 20 * Math.log10(s.gain), pk: pk * s.gain });
      if (pk * s.gain > peak) peak = pk * s.gain;
    }
    pos += s.d.length / s.sr;
  }
  const sorted = frames.map(f => f.db).sort((a, b) => a - b), pct = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const floor = pct(0.1), voicedT = Math.max(floor + 12, -50);
  const voiced = frames.filter(f => f.db > voicedT), quiet = frames.filter(f => f.db <= floor + 3);
  const vdb = voiced.map(f => f.db), mean = vdb.reduce((a, v) => a + v, 0) / (vdb.length || 1);
  const std = Math.sqrt(vdb.reduce((a, v) => a + (v - mean) * (v - mean), 0) / (vdb.length || 1));
  // spectrum of voiced frames, in bands
  const sr0 = segs[0].sr, bandsHz = { rumble: [20, 80], boom: [80, 200], mud: [200, 500], body: [500, 2000], pres: [2000, 5000], sib: [5000, 9000], air: [9000, 16000] };
  const bands = Object.fromEntries(Object.keys(bandsHz).map(k => [k, 0]));
  const pickV = voiced.filter((_, i) => i % Math.max(1, Math.floor(voiced.length / 120)) === 0);
  for (const f of pickV) {
    if (f.i + 2048 > f.s.d.length) continue;
    const fr = new Float64Array(2048); for (let i = 0; i < 2048; i++) fr[i] = f.s.d[f.i + i] * W2048[i];
    const m = fftMag(fr), hzPer = f.s.sr / 2048;
    for (const [k, [lo, hi]] of Object.entries(bandsHz)) for (let b = Math.ceil(lo / hzPer); b <= Math.min(1024, hi / hzPer); b++) bands[k] += m[b] * m[b];
  }
  const B = Object.fromEntries(Object.entries(bands).map(([k, v]) => [k, 10 * Math.log10(v + 1e-12)]));
  // noise profile for the noise remover (1024 FFT, same scale as the worklet)
  let profile = null;
  const pickQ = quiet.filter((_, i) => i % Math.max(1, Math.floor(quiet.length / 60)) === 0).filter(f => f.s.sr === sr0 && f.i + 1024 <= f.s.d.length);
  if (pickQ.length >= 4) {
    profile = new Array(513).fill(0);
    for (const f of pickQ) { const fr = new Float64Array(1024); for (let i = 0; i < 1024; i++) fr[i] = f.s.d[f.i + i] * W1024[i]; const m = fftMag(fr); for (let k = 0; k < 513; k++) profile[k] += m[k] / pickQ.length; }
    profile = profile.map(v => Math.round(v * 1e5) / 1e5);
  }
  // pitch vs the song key
  const P = app.P.beat, scales = { off: 4095 }, mask = P.scale === 'off' ? 4095 : scaleMask(P.key, ['off', 'major', 'minor', 'pentatonic minor', 'pentatonic major', 'blues', 'dorian'].indexOf(P.scale));
  const cents = [];
  const pickP = voiced.filter((_, i) => i % Math.max(1, Math.floor(voiced.length / 150)) === 0);
  for (const f of pickP) {
    const sr = f.s.sr / 2, n = 1024; if (f.i + n * 2 > f.s.d.length) continue;
    const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = (f.s.d[f.i + 2 * i] + f.s.d[f.i + 2 * i + 1]) / 2;
    const hz = yin(x, sr); if (!hz || hz < 70 || hz > 1000) continue;
    const midi = 69 + 12 * Math.log2(hz / 440); let best = 99;
    for (let k = -6; k <= 6; k++) { const nn = Math.round(midi) + k; if (mask & (1 << (((nn % 12) + 12) % 12))) best = Math.min(best, Math.abs(nn - midi)); }
    cents.push(best * 100);
  }
  const pitchErr = cents.length ? cents.reduce((a, v) => a + v, 0) / cents.length : null;
  const gain0 = t.clips.length ? (t.clips[0].gain ?? 1) : 1;
  return { gain0, floor, peak: 20 * Math.log10(peak + 1e-9), clips, voicedDb: mean, std, B, profile, pitchErr, pitchN: cents.length, voicedN: voiced.length };
}

// ---------- findings + fixes ----------
function insertFx(t, f) {
  t.fx ||= [];
  const rank = x => FX_ORDER.indexOf(x.type), i = t.fx.findIndex(x => rank(x) > rank(f));
  if (i < 0) t.fx.push(f); else t.fx.splice(i, 0, f);
  return f;
}
const getFx = (t, type, params) => (t.fx || []).find(f => f.type === type) || insertFx(t, newFx(type, params));

export function findings(t, a) {
  const out = [], key = app.P.beat;
  if (a.clips > 0) out.push({ level: 'bad', title: 'Clipping (distortion)', text: `${a.clips} spot${a.clips === 1 ? '' : 's'} where your mic was too loud and the sound got chopped off. This cannot be repaired. Next time lower Input gain or step back from the mic.` });
  if (a.voicedDb < -28) {
    const boost = clamp(-20 - a.voicedDb, 3, 18);
    out.push({ level: 'warn', title: 'Recording is quiet', text: `Your voice is about ${a.voicedDb.toFixed(0)} dB. A healthy level is around -20 dB.`, fix: { label: `Turn up ${boost.toFixed(0)} dB`, apply: () => {
      const g = Math.pow(10, boost / 20); for (const c of t.clips) c.gain = (c.gain ?? 1) * g;
      // keep an earlier noise fix matched to the new level
      const dn = (t.fx || []).find(f => f.type === 'denoise' && f.params.profile);
      if (dn) { dn.params.profile = dn.params.profile.map(v => v * g); dn.id = Math.random().toString(36).slice(2, 10); }
      if (t.gate) t.gateDb = Math.round(clamp(t.gateDb + boost, -80, -10));
    } } });
  }
  if (a.floor > -58) out.push({ level: a.floor > -45 ? 'bad' : 'warn', title: 'Background noise', text: `Between your lines the room is at ${a.floor.toFixed(0)} dB (quiet rooms are below -60). You can hear hiss or hum.`, fix: { label: 'Remove noise', apply: () => {
    // match the current clip volume (another fix may have raised it since the check)
    const g = (t.clips.length ? (t.clips[0].gain ?? 1) : 1) / a.gain0, gDb = 20 * Math.log10(g);
    const f = getFx(t, 'denoise'); f.params.amount = a.floor > -45 ? 0.75 : 0.55; if (a.profile) f.params.profile = a.profile.map(v => v * g); f.id = Math.random().toString(36).slice(2, 10);
    t.gate = true; t.gateDb = Math.round(clamp(a.floor + 14 + gDb, -75, -10)); // noise peaks sit well above its average
  } } });
  const bass = a.B.boom - a.B.body, mud = a.B.mud - a.B.pres, harsh = a.B.pres - a.B.body, sib = a.B.sib - a.B.pres, air = a.B.air - a.B.pres;
  const noisy = a.floor > -58;
  if (a.B.rumble - a.B.body > -8 || bass > 6) out.push({ level: 'warn', title: 'Too much bass', text: 'Low rumble or boom is clouding your voice. Common when singing very close to the mic.', fix: { label: 'Clean up the low end', apply: () => { const e = getFx(t, 'eq'); e.params.lowcut = Math.max(e.params.lowcut, 120); e.params.body = clamp(e.params.body - 2, -12, 12); } } });
  if (mud > 24) out.push({ level: 'warn', title: 'Muddy or boxy', text: 'There is a lot of energy around 200 to 500 Hz, which makes words less clear.', fix: { label: 'Cut the mud', apply: () => { const e = getFx(t, 'eq'); e.params.mud = clamp(e.params.mud - 3, -12, 12); e.params.presence = clamp(e.params.presence + 1, -12, 12); } } });
  if (harsh > 0) out.push({ level: 'warn', title: 'Harsh', text: 'The 2 to 5 kHz range is strong, which can sound sharp and tiring.', fix: { label: 'Smooth the harshness', apply: () => { const e = getFx(t, 'eq'); e.params.presence = clamp(e.params.presence - 2.5, -12, 12); } } });
  if (sib > 0) out.push({ level: 'warn', title: 'Sharp S sounds', text: 'S, T and SH sounds stand out.', fix: { label: 'Add de-esser', apply: () => { const d = getFx(t, 'deess'); d.params.amount = Math.max(d.params.amount, 0.6); } } });
  if (air < -30) out.push({ level: 'warn', title: 'Dull or muffled', text: 'Not much top end. Your voice may sound like it is behind a blanket.', fix: { label: 'Add brightness', apply: () => { const e = getFx(t, 'eq'); e.params.air = clamp(e.params.air + 3, -12, 12); e.params.presence = clamp(e.params.presence + 1, -12, 12); } } });
  else if (air > -4 && !noisy) out.push({ level: 'warn', title: 'Too much high end', text: 'Very bright and hissy on top.', fix: { label: 'Soften the top', apply: () => { const e = getFx(t, 'eq'); e.params.air = clamp(e.params.air - 2.5, -12, 12); } } });
  if (a.std > 5.5 && a.voicedN > 20) out.push({ level: 'warn', title: 'Uneven volume', text: 'Some words are much louder than others, so quiet parts get lost.', fix: { label: 'Even it out', apply: () => { const c = getFx(t, 'comp', { thresh: -22, ratio: 4, makeup: 4 }); c.params.thresh = Math.min(c.params.thresh, -22); c.params.ratio = Math.max(c.params.ratio, 4); } } });
  if (a.pitchErr != null && a.pitchN >= 12) {
    const note = `checked against your song key (${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][key.key]} ${key.scale === 'off' ? 'all notes' : key.scale})`;
    if (a.pitchErr > 22) out.push({ level: 'warn', title: 'Some notes are off pitch', text: `On average notes are ${a.pitchErr.toFixed(0)} cents away from the nearest note, ${note}. Rap and spoken parts also show up here.`, fix: { label: 'Add light Auto-Tune', apply: () => { const f = getFx(t, 'tune', { speed: 0.35 }); f.on = true; } } });
    else out.push({ level: 'good', title: 'Pitch is good', text: `Your notes are close to the key, ${note}.` });
  }
  if (!out.some(f => f.level !== 'good')) out.push({ level: 'good', title: 'Sounds healthy', text: 'No problems found. Try a vocal preset to shape the style.' });
  return out;
}

// ---------- UI tab ----------
const results = new Map(); // track id -> { a, list, applied:Set }
export function fixTab(t, rerender) {
  const r = results.get(t.id);
  const run = () => {
    const a = analyze(t);
    if (!a) { toast('Record or add something on this track first.'); return; }
    results.set(t.id, { a, list: findings(t, a), applied: new Set() }); rerender();
  };
  const doFix = (idxs) => {
    snapshot();
    for (const i of idxs) { const f = r.list[i]; if (f.fix && !r.applied.has(i)) { f.fix.apply(); r.applied.add(i); } }
    save(); applyMix(); refresh(); rerender(); toast('Done. Use the A/B button to compare.');
  };
  const fixable = r ? r.list.map((f, i) => f.fix && !r.applied.has(i) ? i : -1).filter(i => i >= 0) : [];
  return el('div', { class: 'fxtab' },
    el('div', { class: 'fxtop' },
      el('button', { class: 'hot', onclick: run }, r ? 'Check again' : 'Check my voice'), helpBtn('fixVoice'),
      r && fixable.length > 1 ? el('button', { onclick: () => doFix(fixable) }, 'Fix everything') : null,
      el('span', { class: 'spacer' }), abButton(t)),
    el('p', { class: 'hint' }, 'Your recording is never changed. Fixes are added as effects and volume you can change or remove later. Ctrl+Z undoes them.'),
    r ? el('div', { class: 'findings' }, r.list.map((f, i) => el('div', { class: 'finding ' + f.level },
      el('span', { class: 'dot' }),
      el('div', {}, el('b', {}, f.title), el('p', {}, f.text)),
      f.fix ? (r.applied.has(i) ? el('span', { class: 'done' }, 'Fixed') : el('button', { onclick: () => doFix([i]) }, f.fix.label)) : null))) : null,
  );
}
