// Pad machine: 16 finger-drum pads in 4 banks. Each pad plays a drum, an instrument note or chord,
// one of My sounds, or my own voice recorded onto it. Every pad has its own effects.
// A loop recorder captures what I play, and the loop can go to My sounds (with effects) or the beat maker.
import { $, el, clamp, toast, knob, select, ask, download, uid, safeName } from './util.js';
import { helpBtn, HELP } from './help.js';
import { app, save, snapshot, DRUMS, DRUM_NAMES, PRESETS, newBeatTrack } from './state.js';
import { E, ensureCtx, playDrum, playNote, encodeWav, workletURL, captureMic } from './engine.js';
import { PERC, PERC_NAMES, drumMenu } from './instruments.js';
import { SOUNDS, loadSounds, soundBuffer } from './library.js';
import { db, saveAudio } from './store.js';
import { FX, FX_ORDER, newFx, buildFx } from './fx.js';
import { fxCard } from './fxui.js';
import { makeMovable, resetBtn } from './movable.js';

const KEY = 'loopden.pads';
const KEYS = '1234qwerasdfzxcv';
const COLORS = ['#ff5ea8', '#ff9a3d', '#ffd84a', '#6dffb0', '#5ed3ff', '#8a9bff', '#c08bff', '#ff4a5e'];
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = m => NOTE[m % 12] + (Math.floor(m / 12) - 1);
const CHORDS = { single: [0], major: [0, 4, 7], minor: [0, 3, 7], 'minor 7': [0, 3, 7, 10], 'major 7': [0, 4, 7, 11], power: [0, 7, 12], octave: [0, 12] };
const soundLabel = s => DRUM_NAMES[s] || PERC_NAMES[s] || s;

const drumPad = (sound, color) => ({ kind: 'drum', sound, name: soundLabel(sound), color, vol: 0.9, pitch: 0, fx: [] });
const notePad = (preset, note, chord, color) => ({ kind: 'note', preset, note, chord, len: 0.5, name: (chord !== 'single' ? noteName(note) + ' ' + chord : noteName(note)), color, vol: 0.8, pitch: 0, fx: [] });
const emptyPad = color => ({ kind: 'empty', name: 'Empty', color, vol: 0.9, pitch: 0, fx: [] });
// banks E to H: genre kits built from the drum variations
const MORE = {
  E: ['k_trap', 's_trap', 'c_trap', 'h_trap', 'o_808', 'b_boom', 'p_trap', 'f_rev', 'k_drill', 's_drill', 'c_tight', 'h_drill', 'b_slide', 'p_drill', 'p_rim', 'f_impact'],
  F: ['k_jungle', 's_jungle', 'ghost', 'h_jungle', 'o_crash', 'b_reese', 'airhorn', 'siren', 'k_breakcore', 's_breakcore', 'c_rave', 'h_crispy', 'o_trash', 'b_dist', 'glitch', 'rewind'],
  G: ['k_909', 's_house', 'c_house', 'h_909', 'o_909', 'o_ride', 'p_bell', 'crackle', 'k_lofi', 's_lofi', 'c_lofi', 'h_lofi', 'o_lofi', 'p_knock', 'vinyl', 'f_down'],
  H: ['b_clean', 'b_long', 'b_dist', 'b_slide', 'b_punch', 'b_soft', 'b_boom', 'b_gritty', 'b_short', 'b_reese', 'b_high', 't_808', 't_high', 't_mid', 't_low', 't_elec'],
};
const BANK_NAMES = { A: 'Drums', B: 'House', C: 'Keys', D: 'Empty, for your voice', E: 'Trap and drill', F: 'Jungle and breakcore', G: 'House and lo-fi', H: '808s and toms' };
function moreBanks() { const c = i => COLORS[i % COLORS.length]; return Object.fromEntries(Object.entries(MORE).map(([b, list], bi) => [b, list.map((snd, i) => drumPad(snd, c(Math.floor(i / 4) + bi * 2)))])); }
function defaultBanks() {
  const c = i => COLORS[i % COLORS.length];
  return {
    A: ['kick', 'snare', 'clap', 'hat', 'openhat', 'tom', 'rim', '808', 'shaker', 'cowbell', 'crash', 'ride', 'airhorn', 'siren', 'vinyl', 'laser'].map((s, i) => drumPad(s, c(Math.floor(i / 4) * 2))),
    B: [...['housekick', 'clap', 'hat', 'openhat', 'crackle', 'tambourine', 'snap', 'ride'].map((s, i) => drumPad(s, c(4 + Math.floor(i / 4)))),
      ...[[57, 'minor 7'], [55, 'major 7'], [53, 'major 7'], [52, 'minor 7']].map(([n, ch]) => notePad('house organ', n, ch, c(6))),
      ...[[45, 'single'], [43, 'single'], [41, 'single'], [40, 'single']].map(([n, ch]) => notePad('acid bass', n, ch, c(7)))],
    C: [57, 59, 60, 62, 64, 65, 67, 69, 45, 48, 50, 52, 53, 55, 57, 60].map((n, i) => notePad(i < 8 ? 'piano' : 'electric piano', n, 'single', c(i < 8 ? 5 : 3))),
    D: Array.from({ length: 16 }, (_, i) => emptyPad(c(i % 8))),
    ...moreBanks(),
  };
}
export const PADS = Object.assign({ bank: 'A', banks: null, loops: {}, bars: 2, quant: true, metro: true, sel: 0 }, JSON.parse(localStorage.getItem(KEY) || '{}'));
PADS.banks ||= defaultBanks();
for (const [b, pads] of Object.entries(moreBanks())) PADS.banks[b] ||= pads; // older saves get the new banks
// every bank keeps a list of loops (slots), so a new idea never overwrites a good one
PADS.slots ||= {}; PADS.slot ||= {};
for (const b of 'ABCDEFGH') {
  if (!PADS.slots[b]) PADS.slots[b] = [{ id: uid(), name: 'Loop 1', hits: (PADS.loops && PADS.loops[b]) || [] }];
  PADS.slot[b] = clamp(PADS.slot[b] || 0, 0, PADS.slots[b].length - 1);
}
delete PADS.loops;
PADS.safe ??= true; PADS.chain ??= false;
PADS.skin = { shape: 'rounded', light: 'both', glow: 0.6, body: 'graphite', lcd: '#7dff9a', size: 1, ...(PADS.skin || {}) };
const savePads = () => localStorage.setItem(KEY, JSON.stringify(PADS));
const bank = () => PADS.banks[PADS.bank];
const bpm = () => (app.P && app.P.bpm) || 120;
const beatSec = () => 60 / bpm();
const loopSec = () => PADS.bars * 4 * beatSec();

// ---------- sound: one effects chain per pad ----------
const chains = new Map(); // key -> { c, sig, input, nodes, out }
function chainFor(c, key, pad, dest) {
  let ch = chains.get(key);
  const sig = (pad.fx || []).filter(f => f.on).map(f => f.id).join(',');
  if (!ch || ch.c !== c || ch.sig !== sig) {
    if (ch) { try { ch.input.disconnect(); } catch { } for (const n of ch.nodes) { try { n.out.disconnect(); n.stop?.(); } catch { } } }
    const input = c.createGain(), out = c.createGain();
    const list = (pad.fx || []).filter(f => f.on), nodes = list.map(f => buildFx(c, f));
    let prev = input; for (const n of nodes) { prev.connect(n.in); prev = n.out; } prev.connect(out); out.connect(dest);
    ch = { c, sig, input, nodes, out, list }; chains.set(key, ch);
  }
  const info = { key: app.P ? app.P.beat.key : 0, scaleIdx: 2 };
  ch.list.forEach((f, i) => ch.nodes[i].set(f.params, info, false));
  ch.out.gain.value = pad.vol;
  return ch.input;
}
const revCache = new WeakMap();
function reversed(b) { let r = revCache.get(b); if (!r) { r = new AudioBuffer({ length: b.length, numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate }); for (let i = 0; i < b.numberOfChannels; i++) r.copyToChannel(b.getChannelData(i).slice().reverse(), i); revCache.set(b, r); } return r; }
// plays a pad at time t into dest. Returns a stop function for hold mode.
function sound(c, dest, pad, t, vel, buf) {
  const k = Math.pow(2, (pad.pitch || 0) / 12);
  if (pad.kind === 'drum') { playDrum(c, dest, pad.sound, t, vel); return null; }
  if (pad.kind === 'note') { const syn = { ...PRESETS[pad.preset] }; for (const iv of CHORDS[pad.chord] || [0]) playNote(c, dest, syn, pad.note + iv + (pad.pitch || 0), t, pad.len || 0.5, vel * 0.8); return null; }
  if ((pad.kind === 'sample' || pad.kind === 'voice') && buf) {
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = pad.reverse ? reversed(buf) : buf; s.playbackRate.value = k; g.gain.value = vel;
    s.connect(g); g.connect(dest); s.start(t);
    return () => { g.gain.setTargetAtTime(0, c.currentTime, 0.02); try { s.stop(c.currentTime + 0.1); } catch { } };
  }
  return null;
}
const bufs = new Map();
async function padBuf(pad) { if (!pad.sample) return null; if (!bufs.has(pad.sample)) bufs.set(pad.sample, await soundBuffer(pad.sample)); return bufs.get(pad.sample); }

const held = new Map();
export async function hit(i, vel = 0.85, fromLoop = false) {
  const pad = bank()[i]; if (!pad || pad.kind === 'empty') return;
  const c = await ensureCtx(); if (c.state !== 'running') await c.resume();
  const buf = await padBuf(pad);
  const stopFn = sound(c, chainFor(c, PADS.bank + i, pad, E.g.master), pad, c.currentTime + 0.005, vel, buf);
  if (stopFn && pad.hold) held.set(i, stopFn);
  flash(i, vel);
  if (!fromLoop && L.rec && L.playing) record(i, vel);
}
function release(i) { const f = held.get(i); if (f) { f(); held.delete(i); } }

// ---------- loop recorder ----------
const L = { playing: false, rec: false, t0: 0, timer: null, next: 0, lastBeat: -1 };
const slots = () => PADS.slots[PADS.bank];
const curSlot = () => slots()[PADS.slot[PADS.bank]] || slots()[0];
const loop = () => curSlot().hits;
const slotFor = cycle => PADS.chain && slots().length > 1 ? slots()[cycle % slots().length] : curSlot();
function newSlot(name, hits = []) { const sl = slots(); const n = { id: uid(), name: name || 'Loop ' + (sl.length + 1), hits }; sl.push(n); PADS.slot[PADS.bank] = sl.length - 1; savePads(); return n; }
function record(i, vel) {
  const c = E.ctx, len = loopSec();
  let pos = ((c.currentTime - L.t0) % len + len) % len;
  if (PADS.quant) { const st = len / (PADS.bars * 16); pos = (Math.round(pos / st) % (PADS.bars * 16)) * st; }
  loop().push({ pad: i, pos, vel, pass: L.pass }); savePads();
  drawLoop();
}
function beginTake() {
  // Safe record: if this loop already has hits, record onto a copy so the original stays safe
  L.take = null;
  if (PADS.safe && loop().length) {
    const orig = curSlot(), copy = newSlot(orig.name + ' (new take)', orig.hits.map(h => ({ ...h })));
    L.take = { orig: orig.id, copy: copy.id };
    renderSlots();
  }
}
async function startLoop(rec) {
  const c = await ensureCtx(); if (c.state !== 'running') await c.resume();
  if (rec) beginTake();
  if (L.playing) { L.rec = rec; L.pass = Date.now(); renderBar(); return; }
  L.playing = true; L.rec = rec; L.pass = Date.now(); L.t0 = c.currentTime + 0.1; L.cycle = 0;
  L.timer = setInterval(schedule, 25); schedule(); renderBar(); tickUI();
}
function stopRec() { L.rec = false; renderBar(); }
function stopLoop() { L.playing = false; L.rec = false; clearInterval(L.timer); renderBar(); drawLoop(); renderSlots(); }
function schedule() {
  const c = E.ctx, len = loopSec(), ahead = c.currentTime + 0.12;
  while (true) {
    const start = L.t0 + L.cycle * len; if (start > ahead) break;
    const end = start + len;
    for (const h of slotFor(L.cycle).hits) { const t = start + h.pos; if (t >= (L.done || 0) && t < ahead && t >= c.currentTime - 0.01) { const pad = bank()[h.pad]; if (pad) padBuf(pad).then(b => sound(c, chainFor(c, PADS.bank + h.pad, pad, E.g.master), pad, t, h.vel, b)); setTimeout(() => flash(h.pad, h.vel), Math.max(0, (t - c.currentTime) * 1000)); } }
    if (PADS.metro) for (let b = 0; b < PADS.bars * 4; b++) { const t = start + b * beatSec(); if (t >= (L.done || 0) && t < ahead && t >= c.currentTime - 0.01) click(c, t, b % 4 === 0); }
    if (end <= ahead) { L.cycle++; L.done = end; } else { L.done = ahead; break; }
  }
}
function click(c, t, down) { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = down ? 1500 : 1000; g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); o.connect(g); g.connect(E.g.master); o.start(t); o.stop(t + 0.05); }

// render the loop (with every pad effect) to an AudioBuffer
export async function renderLoop(times = 1, all = false) {
  const list = all ? slots().filter(x => x.hits.length) : [curSlot()];
  if (!list.some(x => x.hits.length)) { toast('Record a loop first.'); return null; }
  times = all ? list.length : times;
  const sr = 44100, len = loopSec() * times, oc = new OfflineAudioContext(2, Math.ceil(sr * (len + 0.02)), sr);
  await oc.audioWorklet.addModule(workletURL);
  const master = oc.createGain(); master.connect(oc.destination);
  const local = new Map();
  for (let r = 0; r < times; r++) for (const h of (all ? list[r] : list[0]).hits) {
    const pad = bank()[h.pad]; if (!pad) continue;
    const key = 'r' + h.pad; if (!local.has(key)) { const save = chains.get(key); chains.delete(key); local.set(key, chainFor(oc, key, pad, master)); if (save) chains.set(key, save); }
    sound(oc, local.get(key), pad, r * loopSec() + h.pos, h.vel, await padBuf(pad));
  }
  const b = await oc.startRendering();
  // fold the tail that rang past the end back to the start so the loop repeats smoothly
  return b;
}

// ---------- recording my voice onto a pad ----------
let mediaRec = null;
async function recordVoice(i, btn) {
  if (mediaRec) { mediaRec.stop(); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } }); }
  catch { return toast('Allow the microphone to record onto a pad.'); }
  const chunks = []; mediaRec = new MediaRecorder(stream);
  mediaRec.ondataavailable = e => chunks.push(e.data);
  mediaRec.onstop = async () => {
    stream.getTracks().forEach(t => t.stop()); mediaRec = null;
    try {
      const c = await ensureCtx(); let buf = await c.decodeAudioData(await new Blob(chunks).arrayBuffer());
      buf = trim(buf);
      const name = await ask('Name this sound', 'Name', 'My voice ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) || 'My voice';
      const id = 's' + uid(); await saveAudio(id, buf);
      await db.put('sounds', id, { id, name, folder: 'Pad recordings', fav: false, kind: buf.duration < 2.5 ? 'one-shot' : 'loop', dur: buf.duration, bpm: null, added: Date.now() });
      await loadSounds(); bufs.delete(id);
      Object.assign(bank()[i], { kind: 'voice', sample: id, name }); savePads(); renderPads();
      toast(`"${name}" is on pad ${i + 1} and saved in My sounds (Pad recordings).`);
    } catch { toast('Could not use that recording.'); }
  };
  mediaRec.start(); btn.textContent = '■ Stop recording'; btn.classList.add('rec');
  toast('Recording. Click Stop when you are done.');
}
// cut silence at the start and end
function trim(b) {
  const d = b.getChannelData(0), th = 0.02; let a = 0, z = d.length - 1;
  while (a < z && Math.abs(d[a]) < th) a++; while (z > a && Math.abs(d[z]) < th) z--;
  a = Math.max(0, a - Math.floor(b.sampleRate * 0.01)); z = Math.min(d.length, z + Math.floor(b.sampleRate * 0.05));
  if (z - a < b.sampleRate * 0.05) return b;
  const out = new AudioBuffer({ length: z - a, numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate });
  for (let ch = 0; ch < b.numberOfChannels; ch++) out.copyToChannel(b.getChannelData(ch).slice(a, z), ch);
  return out;
}

// ---------- voice loop: sing or rap over the loop, recorded exactly one loop long ----------
let voiceBusy = false;
async function recordVoiceLoop() {
  if (voiceBusy) return;
  let i = bank().findIndex(p => p.kind === 'empty');
  if (i < 0) { i = PADS.sel; if (!confirm(`No empty pad in bank ${PADS.bank}. Put the voice loop on pad ${i + 1} (${bank()[i].name})?`)) return; }
  voiceBusy = true;
  try {
    if (!L.playing) await startLoop(false);
    const c = E.ctx, len = loopSec(), k = Math.ceil((c.currentTime + 0.3 - L.t0) / len), from = L.t0 + k * len, to = from + len;
    const lcd = root && root.querySelector('.lcd-hit');
    const buf = await captureMic(from, to, (st, toStart, toEnd) => {
      if (!lcd) return;
      lcd.textContent = st === 'wait' ? `VOICE LOOP STARTS IN ${Math.max(0, toStart).toFixed(1)}` : `● RECORDING VOICE  ${Math.max(0, toEnd).toFixed(1)}s LEFT`;
      lcd.classList.toggle('rec', st === 'rec');
    });
    if (lcd) lcd.classList.remove('rec');
    const name = await ask('Name this voice loop', 'Name', `Voice loop ${slots().length ? curSlot().name : ''}`.trim()) || 'Voice loop';
    const id = 's' + uid(); await saveAudio(id, buf);
    await db.put('sounds', id, { id, name, folder: 'Pad voice loops', fav: false, kind: 'loop', dur: buf.duration, bpm: bpm(), added: Date.now() });
    await loadSounds(); bufs.delete(id);
    const pad = bank()[i];
    Object.assign(pad, { kind: 'voice', sample: id, name, hold: false, loopPad: true });
    if (!pad.fx || !pad.fx.length) pad.fx = [newFx('eq', { lowcut: 100, mud: -2, presence: 2, air: 2 }), newFx('comp', { thresh: -20, ratio: 3, makeup: 3 })];
    loop().push({ pad: i, pos: 0, vel: 0.9, pass: Date.now(), voice: true });
    PADS.sel = i; savePads(); renderPads();
    toast(`Voice loop is on pad ${i + 1} and plays every time "${curSlot().name}" comes around. Add effects to that pad to change your voice.`);
  } catch (e) { toast('Could not record. Allow the microphone, or check Mic setup.'); }
  voiceBusy = false;
}

// ---------- send the loop to other places ----------
async function loopToSounds() {
  const all = PADS.chain && slots().filter(x => x.hits.length).length > 1;
  const b = await renderLoop(1, all); if (!b) return;
  const name = await ask('Save loop to My sounds', 'Name', all ? `Pad song ${PADS.bank} ${bpm()} BPM` : `${curSlot().name} ${bpm()} BPM`); if (!name) return;
  const id = 's' + uid(); await saveAudio(id, b);
  await db.put('sounds', id, { id, name, folder: 'Pad loops', fav: false, kind: 'loop', dur: b.duration, bpm: bpm(), added: Date.now() });
  await loadSounds(); toast(`Saved "${name}" in My sounds (Pad loops), with all effects. Use it in the Studio or beat maker.`);
}
async function loopToWav() { const b = await renderLoop(2); if (b) download(new Blob([encodeWav(b)], { type: 'audio/wav' }), safeName(`pad-loop-${PADS.bank}`) + '.wav'); }
function loopToBeat() {
  if (!app.P) return toast('Open or create a song first.');
  const hits = loop(); if (!hits.length) return toast('Record a loop first.');
  snapshot();
  const steps = Math.min(64, PADS.bars * 16), st = loopSec() / steps, B = app.P.beat;
  const used = [...new Set(hits.map(h => h.pad))].map(i => [i, bank()[i]]);
  const drums = used.filter(([, p]) => p.kind === 'drum' || p.kind === 'sample' || p.kind === 'voice');
  if (drums.length) {
    const t = newBeatTrack('drums', { name: 'Pad loop ' + PADS.bank });
    t.rows = drums.map(([i, p]) => ({ sound: p.kind === 'drum' ? p.sound : 'kick', sample: p.kind === 'drum' ? null : p.sample, vol: p.vol, steps: Array(64).fill(0), _i: i }));
    for (const h of hits) { const r = t.rows.find(x => x._i === h.pad); if (r) { const s = Math.round(h.pos / st) % steps; for (let k = s; k < 64; k += steps) r.steps[k] = h.vel > 0.95 ? 2 : 1; } }
    t.rows.forEach(r => delete r._i); B.tracks.push(t);
  }
  for (const [i, p] of used.filter(([, p]) => p.kind === 'note')) {
    const t = newBeatTrack('synth', { name: p.name, preset: p.preset });
    const len = Math.max(1, Math.round((p.len || 0.5) / st));
    for (const h of hits.filter(h => h.pad === i)) { const s = Math.round(h.pos / st) % steps; for (let k = s; k < 64; k += steps) for (const iv of CHORDS[p.chord] || [0]) t.notes.push({ step: k, pitch: p.note + iv + (p.pitch || 0), len, vel: h.vel }); }
    B.tracks.push(t);
  }
  B.bars = Math.max(B.bars, Math.min(4, PADS.bars));
  save(); toast('Loop sent to the beat maker as new tracks. Pad effects stay on the pads: use Save loop to My sounds to keep them.');
}

// ---------- UI ----------
let root = null;
let level = 0;
function flash(i, vel = 0.85) {
  const p = root && root.querySelector(`.mpad[data-i="${i}"]`); if (!p) return;
  p.classList.remove('hit'); void p.offsetWidth; p.style.setProperty('--v', vel.toFixed(2)); p.classList.add('hit');
  const r = el('span', { class: 'ripple' }); p.append(r); setTimeout(() => r.remove(), 650);
  if (PADS.skin.light === 'spark') for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, sp = el('span', { class: 'spark', style: `--dx:${Math.cos(a) * 60}px;--dy:${Math.sin(a) * 60}px` }); p.append(sp); setTimeout(() => sp.remove(), 600); }
  level = Math.min(1, level + vel * 0.7);
  const pad = bank()[i], lcd = root.querySelector('.lcd-hit');
  if (lcd && pad) { lcd.textContent = `PAD ${String(i + 1).padStart(2, '0')}  ${pad.name.toUpperCase().slice(0, 18)}`; lcd.style.setProperty('--pc', pad.color); }
  root.style.setProperty('--last', pad ? pad.color : '#fff');
  root.classList.remove('thump'); void root.offsetWidth; root.classList.add('thump');
}
// LED meter that jumps with every hit and falls back down
function meterLoop() {
  if (!root || !root.isConnected) return;
  level *= 0.9;
  root.querySelectorAll('.leds i').forEach((d, k, all) => d.classList.toggle('on', k < Math.round(level * all.length)));
  const lcdT = root.querySelector('.lcd-time');
  if (lcdT) { const pos = L.playing && E.ctx ? ((E.ctx.currentTime - L.t0) % loopSec() + loopSec()) % loopSec() : 0, beat = Math.floor(pos / beatSec()); lcdT.textContent = `${L.rec ? 'REC' : L.playing ? 'PLAY' : 'STOP'}  BAR ${Math.floor(beat / 4) + 1}.${beat % 4 + 1}  ${bpm()} BPM  BANK ${PADS.bank}`; lcdT.classList.toggle('rec', L.rec); }
  requestAnimationFrame(meterLoop);
}
function padEl(pad, i) {
  const b = el('button', { class: 'mpad' + (PADS.sel === i ? ' sel' : '') + (pad.kind === 'empty' ? ' empty' : ''), 'data-i': i, style: `--pc:${pad.color}`, title: 'Click or press the key to play. Right-click to edit.' },
    el('span', { class: 'pkey' }, KEYS[i].toUpperCase()), el('span', { class: 'pname' }, pad.name), el('span', { class: 'pkind' }, pad.kind === 'note' ? pad.preset : pad.kind === 'voice' ? 'my voice' : pad.kind === 'sample' ? 'my sound' : pad.kind === 'drum' ? 'drum' : 'tap Edit'),
    (pad.fx || []).some(f => f.on) ? el('span', { class: 'pfx' }, 'FX') : null);
  b.addEventListener('pointerdown', e => { if (e.button === 2) return; e.preventDefault(); const r = b.getBoundingClientRect(); const vel = e.shiftKey ? 1 : clamp(0.55 + 0.45 * (1 - (e.clientY - r.top) / r.height), 0.4, 1); hit(i, vel); if (PADS.sel !== i) { PADS.sel = i; savePads(); renderEditor(); root.querySelectorAll('.mpad').forEach(x => x.classList.toggle('sel', +x.dataset.i === i)); } });
  b.addEventListener('pointerup', () => release(i)); b.addEventListener('pointerleave', () => release(i));
  b.addEventListener('contextmenu', e => { e.preventDefault(); PADS.sel = i; savePads(); renderPads(); });
  return b;
}
function renderBar() {
  const bar = root && root.querySelector('.ploopbar'); if (!bar) return;
  bar.innerHTML = '';
  bar.append(
    el('button', { class: 'hot', onclick: () => L.playing ? stopLoop() : startLoop(false) }, L.playing ? '■ Stop' : '▶ Play loop'),
    el('button', { class: 'tog rec' + (L.rec ? ' on' : ''), onclick: () => L.rec ? stopRec() : startLoop(true) }, L.rec ? '● Recording (click to stop)' : '● Record pads'),
    el('button', { class: 'tog voicebtn', title: 'Sing or rap over the loop. It records exactly one loop long and stays in time.', onclick: recordVoiceLoop }, '🎤 Record voice loop'), helpBtn('padLoop'),
    el('label', { class: 'num' }, 'Bars', select([[1, '1'], [2, '2'], [4, '4']], PADS.bars, v => { PADS.bars = +v; savePads(); if (L.playing) { stopLoop(); } drawLoop(); })),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: PADS.quant, onchange: e => { PADS.quant = e.target.checked; savePads(); } }), 'Snap to beat'),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: PADS.metro, onchange: e => { PADS.metro = e.target.checked; savePads(); } }), 'Click'),
    el('span', { class: 'hint' }, `${bpm()} BPM (from your song)`),
    el('span', { class: 'spacer' }),
    el('button', { title: 'Remove only what you recorded last time', onclick: () => { const L0 = loop(); if (!L0.length) return; const last = Math.max(...L0.map(h => h.pass || 0)); curSlot().hits = L0.filter(h => (h.pass || 0) !== last); savePads(); drawLoop(); renderSlots(); toast('Removed the last recording pass.'); } }, 'Undo pass'),
    el('button', { class: 'danger', onclick: () => { if (loop().length && !confirm(`Clear everything in "${curSlot().name}"?`)) return; curSlot().hits = []; savePads(); drawLoop(); renderSlots(); } }, 'Clear loop'));
  // after a safe take: keep the new one, go back, or keep both
  const tk = L.take && !L.rec ? L.take : null;
  const dec = root.querySelector('.takebar'); dec.innerHTML = ''; dec.hidden = !tk;
  if (tk) {
    const sl = slots(), o = sl.find(x => x.id === tk.orig), n = sl.find(x => x.id === tk.copy);
    if (!o || !n) { L.take = null; dec.hidden = true; return; }
    const pick = id => { PADS.slot[PADS.bank] = slots().findIndex(x => x.id === id); savePads(); renderSlots(); drawLoop(); };
    dec.append(el('span', { class: 'takeq' }, el('b', {}, 'How was that take?'), ` Your new take is "${n.name}". The old one, "${o.name}", is still safe.`),
      el('button', { onclick: () => pick(o.id) }, '▶ Hear old'), el('button', { onclick: () => pick(n.id) }, '▶ Hear new'),
      el('button', { class: 'hot', onclick: () => { n.name = o.name; PADS.slots[PADS.bank] = slots().filter(x => x.id !== o.id); L.take = null; pick(n.id); renderBar(); toast('Kept the new take.'); } }, 'Keep new'),
      el('button', { onclick: () => { PADS.slots[PADS.bank] = slots().filter(x => x.id !== n.id); L.take = null; pick(o.id); renderBar(); toast('Went back to the old loop. The new take is gone.'); } }, 'Go back to old'),
      el('button', { onclick: () => { n.name = n.name.replace(' (new take)', ' v2'); L.take = null; savePads(); renderSlots(); renderBar(); toast('Kept both loops.'); } }, 'Keep both'));
  }
}
// strip of loops in this bank: click to switch (even while playing), copy, rename, delete
function renderSlots() {
  const box = root && root.querySelector('.slots'); if (!box) return;
  const sl = slots(), cur = PADS.slot[PADS.bank];
  box.innerHTML = '';
  box.append(el('span', { class: 'hint' }, 'Loops:'),
    ...sl.map((x, k) => el('button', { class: 'slot' + (k === cur ? ' on' : '') + (x.hits.length ? '' : ' empty'), title: 'Click to switch to this loop. It switches right away, even while playing.',
      onclick: () => { PADS.slot[PADS.bank] = k; savePads(); renderSlots(); drawLoop(); } },
      el('span', { class: 'slotled' }), x.name, el('small', {}, x.hits.length ? `${x.hits.length} hits` : 'empty'))),
    el('button', { class: 'sq', title: 'New empty loop. Your other loops stay safe.', onclick: () => { newSlot(); renderSlots(); drawLoop(); toast('New empty loop. Your other loops are still here.'); } }, '+'),
    el('span', { class: 'spacer' }),
    el('button', { title: 'Make a copy to try ideas on', onclick: () => { newSlot(curSlot().name + ' copy', loop().map(h => ({ ...h }))); renderSlots(); drawLoop(); toast('Copied. Change the copy, the original stays safe.'); } }, 'Copy'),
    el('button', { onclick: async () => { const n = await ask('Rename loop', 'Name', curSlot().name); if (n) { curSlot().name = n; savePads(); renderSlots(); } } }, 'Rename'),
    el('button', { class: 'danger', onclick: () => {
      if (!confirm(`Delete "${curSlot().name}"? This cannot be undone.`)) return;
      if (sl.length === 1) { curSlot().hits = []; } else { sl.splice(cur, 1); PADS.slot[PADS.bank] = Math.max(0, cur - 1); }
      savePads(); renderSlots(); drawLoop();
    } }, 'Delete'),
    el('label', { class: 'chk', title: 'Plays every loop in this bank one after another, like a song' }, el('input', { type: 'checkbox', checked: PADS.chain, onchange: e => { PADS.chain = e.target.checked; savePads(); } }), 'Play all in order'),
    el('label', { class: 'chk', title: 'When a loop already has hits, Record pads works on a copy so you can keep the old one' }, el('input', { type: 'checkbox', checked: PADS.safe, onchange: e => { PADS.safe = e.target.checked; savePads(); } }), 'Safe record'));
}
function drawLoop() {
  const cv = root && root.querySelector('.ploopcv'); if (!cv) return;
  const g = cv.getContext('2d'), W = cv.width = cv.clientWidth * devicePixelRatio, H = cv.height = 64 * devicePixelRatio, steps = PADS.bars * 16, len = loopSec();
  g.clearRect(0, 0, W, H);
  for (let s = 0; s < steps; s++) { g.fillStyle = s % 16 === 0 ? 'rgba(255,255,255,.18)' : s % 4 === 0 ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.04)'; g.fillRect(s / steps * W, 0, 1, H); }
  const showing = L.playing && PADS.chain ? slotFor(L.cycle) : curSlot();
  for (const h of showing.hits) { const p = bank()[h.pad]; if (!p) continue; g.fillStyle = p.color; g.shadowColor = p.color; g.shadowBlur = 8; const x = h.pos / len * W, y = (h.pad % 16) / 16 * (H - 6) + 2; g.fillRect(x, y, Math.max(3, W / steps * 0.6), 4 * devicePixelRatio); }
  g.shadowBlur = 0;
  if (L.playing && E.ctx) { const x = (((E.ctx.currentTime - L.t0) % len + len) % len) / len * W; g.fillStyle = L.rec ? '#ff3b3b' : '#fff'; g.fillRect(x, 0, 2 * devicePixelRatio, H); }
}
function tickUI() { if (!L.playing || app.view !== 'pads') return; drawLoop(); requestAnimationFrame(tickUI); }

function renderEditor() {
  const box = root && root.querySelector('.ped'); if (!box) return;
  const i = PADS.sel, pad = bank()[i], set = (k, v, re) => { pad[k] = v; savePads(); if (re) renderPads(); };
  const rr = () => { savePads(); renderPads(); };
  const kinds = [['drum', 'Drum'], ['note', 'Instrument'], ['sample', 'My sound'], ['voice', 'Record my voice'], ['empty', 'Empty']];
  const kindBtns = el('div', { class: 'fxlib' }, kinds.map(([k, l]) => el('button', { class: 'chip' + ((pad.kind === k || (k === 'voice' && pad.kind === 'voice')) ? ' on' : ''), onclick: () => {
    if (k === 'drum') Object.assign(pad, { kind: 'drum', sound: pad.sound || 'kick', name: soundLabel(pad.sound || 'kick') });
    else if (k === 'note') Object.assign(pad, { kind: 'note', preset: pad.preset || 'piano', note: pad.note || 60, chord: pad.chord || 'single', len: pad.len || 0.5, name: noteName(pad.note || 60) });
    else if (k === 'sample') { if (!SOUNDS.length) return toast('Upload sounds in My sounds first, or record your voice.'); Object.assign(pad, { kind: 'sample', sample: pad.sample || SOUNDS[0].id, name: (SOUNDS.find(s => s.id === (pad.sample || SOUNDS[0].id)) || {}).name }); }
    else if (k === 'voice') { pad.kind = pad.kind === 'voice' ? 'voice' : 'voice'; }
    else Object.assign(pad, { kind: 'empty', name: 'Empty' });
    rr();
  } }, l)));
  function stepSound(d) { const all = drumMenu(DRUMS, DRUM_NAMES).flatMap(([, l]) => l.map(x => x[0])), k = (all.indexOf(pad.sound) + d + all.length) % all.length; pad.sound = all[k]; pad.name = soundLabel(pad.sound); rr(); hit(i); }
  let src = null;
  if (pad.kind === 'drum') src = el('label', { class: 'num' }, 'Sound', el('select', { onchange: e => { pad.sound = e.target.value; pad.name = soundLabel(pad.sound); rr(); hit(i); } },
    drumMenu(DRUMS, DRUM_NAMES).map(([g, list]) => el('optgroup', { label: g }, list.map(([s, n]) => el('option', { value: s, selected: pad.sound === s }, n))))),
    el('button', { class: 'sq', title: 'Previous sound', onclick: () => stepSound(-1) }, '◀'), el('button', { class: 'sq', title: 'Next sound (try them fast)', onclick: () => stepSound(1) }, '▶'));
  else if (pad.kind === 'note') src = [
    el('label', { class: 'num' }, 'Instrument', select(Object.keys(PRESETS).filter(k => k !== 'my sound'), pad.preset, v => { pad.preset = v; rr(); hit(i); })),
    el('label', { class: 'num' }, 'Note', select(Array.from({ length: 49 }, (_, k) => [24 + k, noteName(24 + k)]), pad.note, v => { pad.note = +v; pad.name = noteName(pad.note) + (pad.chord !== 'single' ? ' ' + pad.chord : ''); rr(); hit(i); })),
    el('label', { class: 'num' }, 'Chord', select(Object.keys(CHORDS), pad.chord, v => { pad.chord = v; pad.name = noteName(pad.note) + (v !== 'single' ? ' ' + v : ''); rr(); hit(i); })),
    knob('Length', 0.05, 4, 0.05, pad.len || 0.5, v => set('len', v), v => (+v).toFixed(2) + 's', null, 'dial')];
  else if (pad.kind === 'sample' || pad.kind === 'voice') src = [
    pad.kind === 'sample' || pad.sample ? el('label', { class: 'num' }, 'Sound', select(SOUNDS.map(s => [s.id, s.folder + ' / ' + s.name]), pad.sample, v => { pad.sample = v; pad.name = (SOUNDS.find(s => s.id === v) || {}).name; rr(); hit(i); })) : null,
    el('button', { class: 'hot', onclick: e => recordVoice(i, e.target) }, mediaRec ? '■ Stop recording' : '● Record my voice on this pad'),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!pad.reverse, onchange: e => set('reverse', e.target.checked) }), 'Reverse'),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!pad.hold, onchange: e => set('hold', e.target.checked) }), 'Only play while held')];
  const add = type => { pad.fx ||= []; pad.fx.push(newFx(type)); rr(); };
  box.innerHTML = '';
  box.append(
    el('div', { class: 'fxtop' }, el('b', { class: 'pedtitle', style: `--pc:${pad.color}` }, `Pad ${i + 1} · ${pad.name}`), helpBtn('padEdit'), el('span', { class: 'spacer' }),
      el('div', { class: 'pcolors' }, COLORS.map(c => el('button', { class: 'swatchbtn', style: `background:${c}`, title: 'Pad color', onclick: () => set('color', c, true) }))),
      el('button', { onclick: async () => { const n = await ask('Rename pad', 'Name', pad.name); if (n) set('name', n, true); } }, 'Rename')),
    el('div', { class: 'explain' }, 'Pick what this pad plays. Turn the knobs to change it. Add effects below, they only change this pad. Right-click any pad to edit it.'),
    kindBtns,
    el('div', { class: 'knobrow' }, src, knob('Volume', 0, 1.5, 0.01, pad.vol, v => set('vol', v), v => Math.round(v * 100) + '', null, 'dial'), knob('Pitch', -12, 12, 1, pad.pitch || 0, v => set('pitch', v), v => (v > 0 ? '+' : '') + v, null, 'dial'),
      el('button', { onclick: () => hit(i) }, '▶ Test')),
    el('div', { class: 'fxtop' }, el('b', {}, 'Effects on this pad'), helpBtn('beatFx'), el('span', { class: 'spacer' }),
      (pad.fx || []).length ? el('button', { onclick: () => { for (const [j, p] of bank().entries()) if (j !== i) p.fx = JSON.parse(JSON.stringify(pad.fx)).map(f => ({ ...f, id: uid() })); rr(); toast('Copied these effects to every pad in this bank.'); } }, 'Copy to all pads') : null),
    el('div', { class: 'fxlib' }, FX_ORDER.filter(t => t !== 'denoise').map(type => el('button', { class: 'chip', title: (HELP['fx_' + type] || {}).what || '', onclick: () => add(type) }, '+ ' + FX[type].name))),
    (pad.fx || []).length ? el('div', { class: 'fxchain' }, pad.fx.map((f, j) => fxCard(pad, f, j, rr))) : el('p', { class: 'hint' }, 'No effects on this pad yet. Click one above.'));
}
// ---------- machine look ----------
function applySkin() {
  if (!root) return; const k = PADS.skin;
  root.className = `padpage shape-${k.shape} light-${k.light} body-${k.body}`;
  root.style.setProperty('--pglow', k.glow); root.style.setProperty('--lcdc', k.lcd); root.style.setProperty('--padsize', k.size);
}
function skinPanel() {
  const k = PADS.skin, set = (key, v) => { k[key] = v; savePads(); applySkin(); renderSkin(); };
  const chips = (key, opts) => el('div', { class: 'fxlib' }, opts.map(([v, l]) => el('button', { class: 'chip' + (k[key] === v ? ' on' : ''), onclick: () => set(key, v) }, l)));
  return el('div', { class: 'skinpanel panel' },
    el('div', { class: 'fxtop' }, el('b', {}, 'Customize the machine'), helpBtn('padSkin'), el('span', { class: 'spacer' }), el('button', { onclick: () => { PADS.skin = { shape: 'rounded', light: 'both', glow: 0.6, body: 'graphite', lcd: '#7dff9a', size: 1 }; savePads(); applySkin(); renderSkin(); } }, 'Reset look')),
    el('div', { class: 'skingrid' },
      el('div', {}, el('small', {}, 'Pad shape'), chips('shape', [['square', 'Square'], ['rounded', 'Rounded'], ['round', 'Round'], ['hex', 'Hexagon']])),
      el('div', {}, el('small', {}, 'Hit lights'), chips('light', [['both', 'Flash and ripple'], ['flash', 'Flash'], ['ripple', 'Ripple'], ['spark', 'Sparks'], ['none', 'Off']])),
      el('div', {}, el('small', {}, 'Machine body'), chips('body', [['graphite', 'Graphite'], ['white', 'White'], ['neon', 'Neon'], ['clear', 'See-through'], ['wood', 'Wood']])),
      el('div', {}, el('small', {}, 'Screen color'), el('div', { class: 'fxlib' }, ['#7dff9a', '#5ed3ff', '#ffb347', '#ff5ea8', '#ff4a5e', '#e8e8e8'].map(c => el('button', { class: 'swatchbtn' + (k.lcd === c ? ' on' : ''), style: `background:${c}`, onclick: () => set('lcd', c) })))),
      el('div', { class: 'knobrow' }, knob('Glow', 0, 1, 0.01, k.glow, v => { k.glow = v; savePads(); applySkin(); }, v => Math.round(v * 100) + '', null, 'dial sm'),
        knob('Pad size', 0.7, 1.2, 0.01, k.size, v => { k.size = v; savePads(); applySkin(); }, v => Math.round(v * 100) + '%', null, 'dial sm'))));
}
function renderSkin() { const box = root && root.querySelector('.skinbox'); if (!box) return; box.innerHTML = ''; if (PADS.skinOpen) box.append(skinPanel()); }
export function renderPads() {
  const view = $('#view'); view.innerHTML = '';
  root = el('div', { class: 'padpage' });
  const grid = el('div', { class: 'mpadgrid' }, bank().map(padEl));
  root.append(
    el('div', { class: 'machine-head', 'data-panel': 'screen', 'data-title': 'Screen and meter' },
      el('div', { class: 'lcd' }, el('div', { class: 'lcd-time' }, 'STOP'), el('div', { class: 'lcd-hit' }, 'TAP A PAD')),
      el('div', { class: 'leds' }, Array.from({ length: 16 }, () => el('i')))),
    el('div', { class: 'ptop' }, el('h1', {}, 'Pad machine'), helpBtn('pads'), el('span', { class: 'spacer' }),
      el('div', { class: 'banks' }, el('span', { class: 'hint' }, 'Bank'), 'ABCDEFGH'.split('').map(b => el('button', { class: 'bankbtn' + (PADS.bank === b ? ' on' : ''), title: BANK_NAMES[b], onclick: () => { PADS.bank = b; savePads(); if (L.playing) stopLoop(); renderPads(); } }, b))),
      resetBtn('pads', renderPads),
      el('button', { class: 'hot', onclick: () => { PADS.skinOpen = !PADS.skinOpen; savePads(); renderSkin(); } }, '🎨 Customize machine'),
      el('button', { onclick: () => { if (!confirm('Reset all pads in every bank to the starting sounds? Your recordings stay in My sounds.')) return; PADS.banks = defaultBanks(); savePads(); renderPads(); } }, 'Reset pads')),
    el('div', { class: 'explain', 'data-panel': 'guide', 'data-title': 'How to use' }, 'Tap the pads with your mouse, your fingers on a touch screen, or the keys shown on each pad. Press near the top of a pad for a louder hit, or hold Shift. Record a loop, then save it to My sounds or send it to the beat maker.'),
    el('div', { class: 'skinbox' }),
    el('div', { class: 'padmain', 'data-panel': 'pads', 'data-title': 'Pads, loops and editor' },
      el('div', { class: 'padleft' }, grid, el('div', { class: 'ploop panel' }, el('div', { class: 'ploopbar' }), el('div', { class: 'takebar', hidden: true }), el('div', { class: 'slots' }), el('canvas', { class: 'ploopcv' }),
        el('div', { class: 'explain' }, el('b', {}, 'How loops work: '), 'Press Play loop to hear the beat with a click. Press Record pads and tap: your taps are added each time the loop comes around. Safe record keeps your old loop and lets you choose afterwards. Press + for a new empty loop, or Copy to try ideas on a copy. Click any loop to switch, even while it plays. Record voice loop waits for the start of the loop, then records you for exactly one loop, so it always stays in time. Add effects to the voice pad to change your voice.'),
        el('div', { class: 'fxtop' }, el('button', { class: 'hot', onclick: loopToSounds }, 'Save loop to My sounds'), el('button', { onclick: loopToBeat }, 'Send to beat maker'), el('button', { onclick: loopToWav }, 'Download WAV'), helpBtn('padSend')))),
      el('div', { class: 'ped panel' })));
  view.append(root);
  makeMovable(root, 'pads');
  renderBar(); renderSlots(); renderEditor(); requestAnimationFrame(drawLoop); meterLoop(); applySkin(); renderSkin();
  if (!SOUNDS.length) loadSounds().then(() => renderEditor());
}

// keys: 1234 / qwer / asdf / zxcv play pads, Space plays the loop, Shift = loud
addEventListener('keydown', e => {
  if (app.view !== 'pads' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.target.matches('input:not([type=range]):not([type=checkbox]), select, textarea') || document.querySelector('.modal-wrap')) return;
  if (e.code === 'Space') { e.preventDefault(); L.playing ? stopLoop() : startLoop(false); return; }
  const k = e.code.startsWith('Digit') ? e.code.slice(5) : e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : '';
  const i = KEYS.indexOf(k); if (i < 0) return;
  e.preventDefault(); hit(i, e.shiftKey ? 1 : 0.8);
});
addEventListener('keyup', e => {
  if (app.view !== 'pads') return;
  const k = e.code.startsWith('Digit') ? e.code.slice(5) : e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : '';
  const i = KEYS.indexOf(k); if (i >= 0) release(i);
});
export const padsPlaying = () => L.playing;
export function stopPads() { if (L.playing) stopLoop(); }

// used by "drop anywhere": save a file to My sounds and put it on the first empty pad (or the selected one)
export async function padLoadFile(file) {
  const c = await ensureCtx(), buf = await c.decodeAudioData(await file.arrayBuffer());
  const id = 's' + uid(), name = file.name.replace(/\.[^.]+$/, '');
  await saveAudio(id, buf);
  await db.put('sounds', id, { id, name, folder: 'Dropped in', fav: false, kind: buf.duration < 2.5 ? 'one-shot' : 'loop', dur: buf.duration, bpm: null, added: Date.now() });
  await loadSounds();
  let i = bank().findIndex(p => p.kind === 'empty'); if (i < 0) i = PADS.sel;
  Object.assign(bank()[i], { kind: 'sample', sample: id, name, hold: buf.duration > 4 });
  PADS.sel = i; savePads();
  return { pad: i + 1, bank: PADS.bank };
}

// used by "What I hear": start or stop the pad loop from anywhere
export async function padLoopToggle() { if (L.playing) stopLoop(); else await startLoop(false); }
