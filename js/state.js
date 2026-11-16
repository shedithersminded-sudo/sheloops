import { uid } from './util.js';
import { db, settings, saveSettings, loadAudio, audioIdsOf } from './store.js';
import { findPreset, presetFx, STYLES } from './presets.js';
import { trackColors } from './look.js';

export const COLORS = ['#ff6a1a', '#ffd23f', '#3fd0ff', '#9dff5c', '#ff5ca8', '#b18cff', '#5cffd6', '#ff8f6b'];
export const DRUMS = ['kick', 'snare', 'clap', 'hat', 'openhat', 'tom', 'rim', '808'];
export const DRUM_NAMES = { kick: 'Kick', snare: 'Snare', clap: 'Clap', hat: 'Hat', openhat: 'Open hat', tom: 'Tom', rim: 'Rim', '808': '808' };
export const PRESETS = {
  bass:   { wave: 'sawtooth', cutoff: 700,  res: 7, env: 0.6, attack: 0.005, sustain: 0.8, release: 0.12, detune: 4 },
  keys:   { wave: 'triangle', cutoff: 3200, res: 1, env: 0.2, attack: 0.005, sustain: 0.45, release: 0.4, detune: 6 },
  lead:   { wave: 'square',   cutoff: 2600, res: 4, env: 0.3, attack: 0.01,  sustain: 0.8, release: 0.2, detune: 10 },
  pad:    { wave: 'sawtooth', cutoff: 1400, res: 1, env: 0,   attack: 0.45,  sustain: 1,   release: 1.4, detune: 16 },
  pluck:  { wave: 'sawtooth', cutoff: 1800, res: 3, env: 1,   attack: 0.002, sustain: 0.03, release: 0.25, detune: 5 },
  sub:    { wave: 'sine',     cutoff: 400,  res: 0, env: 0,   attack: 0.005, sustain: 1,   release: 0.15, detune: 0 },
  piano:  { wave: 'sine', cutoff: 7000, res: 0, env: 0, attack: 0.003, sustain: 1, release: 0.35, detune: 0, engine: 'piano' },
  guitar: { wave: 'sine', cutoff: 5000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.25, detune: 0, engine: 'guitar' },
  'acoustic guitar': { wave: 'sine', cutoff: 5000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.25, detune: 0, engine: 'guitar' },
  'nylon guitar': { wave: 'sine', cutoff: 2600, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.3, detune: 0, engine: 'gtr-nylon' },
  'electric guitar': { wave: 'sine', cutoff: 4500, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.3, detune: 0, engine: 'gtr-clean' },
  'overdrive guitar': { wave: 'sine', cutoff: 3500, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.25, detune: 0, engine: 'gtr-drive' },
  'muted guitar': { wave: 'sine', cutoff: 1500, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.08, detune: 0, engine: 'gtr-muted' },
  '12-string guitar': { wave: 'sine', cutoff: 6000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.3, detune: 0, engine: 'gtr-12' },
  'bass guitar': { wave: 'sine', cutoff: 1500, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.2, detune: 0, engine: 'gtr-bass' },
  'banjo': { wave: 'sine', cutoff: 7000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.15, detune: 0, engine: 'banjo' },
  'harp': { wave: 'sine', cutoff: 3000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.6, detune: 0, engine: 'harp' },
  'koto': { wave: 'sine', cutoff: 6000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.3, detune: 0, engine: 'koto' },
  'sitar': { wave: 'sine', cutoff: 5000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.4, detune: 0, engine: 'sitar' },
  'kalimba': { wave: 'sine', cutoff: 12000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.3, detune: 0, engine: 'kalimba' },
  'marimba': { wave: 'sine', cutoff: 12000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.3, detune: 0, engine: 'marimba' },
  'vibraphone': { wave: 'sine', cutoff: 12000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.3, detune: 0, engine: 'vibes' },
  'bells': { wave: 'sine', cutoff: 12000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.3, detune: 0, engine: 'bells' },
  'music box': { wave: 'sine', cutoff: 12000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.3, detune: 0, engine: 'musicbox' },
  'steel drum': { wave: 'sine', cutoff: 12000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.3, detune: 0, engine: 'steeldrum' },
  'pan flute': { wave: 'sine', cutoff: 9000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.2, detune: 0, engine: 'panflute' },
  'flute': { wave: 'sine', cutoff: 9000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.2, detune: 0, engine: 'flute' },
  'talking drum': { wave: 'sine', cutoff: 12000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.3, detune: 0, engine: 'talkdrum' },
  'choir': { wave: 'sine', cutoff: 9000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.6, detune: 0, engine: 'choir' },
  'brass': { wave: 'sine', cutoff: 9000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.2, detune: 0, engine: 'brass' },
  'organ': { wave: 'sine', cutoff: 8000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.1, detune: 0, engine: 'organ' },
  'electric piano': { wave: 'sine', cutoff: 9000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.4, detune: 0, engine: 'epiano' },
  '808 bass': { wave: 'sine', cutoff: 4000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.2, detune: 0, engine: 'bass808' },
  'reese bass': { wave: 'sine', cutoff: 8000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.25, detune: 0, engine: 'reese' },
  'theremin': { wave: 'sine', cutoff: 9000, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.3, detune: 0, engine: 'theremin' },
  ...Object.fromEntries([
    ['ukulele', 'ukulele', 4500], ['mandolin', 'mandolin', 7000], ['shamisen', 'shamisen', 7000], ['biwa', 'biwa', 4000], ['sanshin', 'sanshin', 4000],
    ['harpsichord', 'harpsichord', 9000], ['hammered dulcimer', 'dulcimer', 7000], ['laser harp', 'laser-harp', 9000],
    ['violin', 'violin'], ['cello', 'cello'], ['string section', 'strings'], ['kokyu', 'kokyu'], ['erhu', 'erhu'],
    ['saxophone', 'sax'], ['clarinet', 'clarinet'], ['oboe', 'oboe'], ['trumpet', 'trumpet'], ['trombone', 'trombone'],
    ['accordion', 'accordion'], ['harmonica', 'harmonica'], ['melodica', 'melodica'], ['sho', 'sho'],
    ['shakuhachi', 'shakuhachi'], ['shinobue', 'shinobue'], ['ryuteki', 'ryuteki'], ['ocarina', 'ocarina'], ['didgeridoo', 'didgeridoo'], ['jaw harp', 'jaw-harp'],
    ['stylophone', 'stylophone'], ['glass harmonica', 'glass-harmonica'],
    ['handpan', 'handpan'], ['celesta', 'celesta'], ['xylophone', 'xylophone'], ['tubular bells', 'tubular-bells'], ['gamelan', 'gamelan'],
  ].map(([name, engine, cutoff = 12000]) => [name, { wave: 'sine', cutoff, res: 0, env: 0, attack: 0.002, sustain: 1, release: 0.3, detune: 0, engine }])),
  'my sound': { wave: 'sine', cutoff: 20000, res: 0, env: 0, attack: 0.003, sustain: 1, release: 0.15, detune: 0, engine: 'sampler', root: 60 },
};
// x = hit, X = loud hit. One bar, repeated. Chords: [step, length, semitones from the key root]. Bass follows chord roots with a rhythm.
export const STARTERS = {
  'R&B':       { bpm: 75,  swing: 0.25, scale: 'minor', keys: 'keys',  bassPreset: 'bass', kick: 'x......x..x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', rim: '..........x....x',
    chords: [[0, 16, [0, 3, 7, 10]], [16, 16, [-4, 0, 3, 7]]], bassR: [[0, 3], [6, 2], [10, 2]] },
  'Hip-Hop':   { bpm: 90,  swing: 0.2,  scale: 'minor', keys: 'piano', bassPreset: 'bass', kick: 'x......xx.x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', openhat: '..............x.',
    chords: [[0, 8, [0, 3, 7]], [8, 8, [-2, 2, 5]], [16, 8, [-4, 0, 3]], [24, 8, [-2, 2, 5]]], bassR: [[0, 3], [6, 2]] },
  'Trap':      { bpm: 140, swing: 0,    scale: 'minor', keys: 'pad',   bassPreset: 'sub',  kick: 'x.....x.........', '808': 'x.....x...x.....', snare: '........X.......', clap: '........x.......', hat: 'x.x.x.x.xxx.x.xx',
    chords: [[0, 16, [0, 3, 7]], [16, 16, [-4, 0, 3]]], bassR: [[0, 6], [6, 4], [10, 6]] },
  'Drill':     { bpm: 142, swing: 0.05, scale: 'minor', keys: 'pad',   bassPreset: 'sub',  kick: 'x.........x.....', '808': 'x.........x..x..', snare: '........X.....x.', hat: 'x..x..x.x..x..x.',
    chords: [[0, 16, [0, 3, 7]], [16, 8, [-4, 0, 3]], [24, 8, [-5, -1, 2]]], bassR: [[0, 6], [10, 3], [13, 3]] },
  'Pop':       { bpm: 110, swing: 0,    scale: 'major', keys: 'pluck', bassPreset: 'bass', kick: 'x...x...x...x...', snare: '....X.......X...', clap: '....x.......x...', hat: '..x...x...x...x.',
    chords: [[0, 8, [0, 4, 7]], [8, 8, [-5, -1, 2]], [16, 8, [-3, 0, 4]], [24, 8, [-7, -3, 0]]], bassR: [[0, 2], [2, 2], [4, 2], [6, 2]] },
  'Soul':      { bpm: 85,  swing: 0.3,  scale: 'major', keys: 'keys',  bassPreset: 'bass', kick: 'x.......x.x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', tom: '..............x.',
    chords: [[0, 8, [2, 5, 9, 12]], [8, 8, [-5, -1, 2, 5]], [16, 16, [0, 4, 7, 11]]], bassR: [[0, 3], [4, 2], [6, 2]] },
  'Gospel':    { bpm: 100, swing: 0.3,  scale: 'major', keys: 'piano', bassPreset: 'bass', kick: 'x..x....x..x....', snare: '....X.......X...', clap: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx',
    chords: [[0, 8, [0, 4, 7, 11]], [8, 8, [-3, 0, 4, 7]], [16, 8, [2, 5, 9, 12]], [24, 8, [-5, -1, 2, 5]]], bassR: [[0, 3], [3, 1], [6, 2]] },
  'Afrobeats': { bpm: 105, swing: 0.15, scale: 'minor', keys: 'guitar', bassPreset: 'bass', kick: 'x..x....x..x....', rim: '..x..x....x..x..', snare: '........X.......', hat: 'x.xxx.xxx.xxx.xx',
    chords: [[0, 8, [0, 3, 7]], [8, 8, [5, 8, 12]], [16, 8, [-2, 2, 5]], [24, 8, [3, 7, 10]]], bassR: [[0, 2], [3, 2], [6, 1]] },
  'Lo-fi':     { bpm: 80,  swing: 0.35, scale: 'major', keys: 'piano', bassPreset: 'bass', kick: 'x......x..x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', rim: '...x.......x....',
    chords: [[0, 8, [5, 9, 12, 16]], [8, 8, [4, 7, 11, 14]], [16, 8, [2, 5, 9, 12]], [24, 8, [0, 4, 7, 11]]], bassR: [[0, 4], [6, 2]] },
};
export const PAT_IDS = 'ABCDEFGH'.split('');

let colorN = 0;
export const nextColor = () => { const c = trackColors(); return c[colorN++ % c.length]; };

export function newBeatTrack(type, o = {}) {
  const t = { id: uid(), type, name: o.name || (type === 'drums' ? 'Drums' : 'Synth'), color: nextColor(),
    vol: 0.8, pan: 0, mute: false, solo: false, rev: o.rev ?? 0.08, dly: o.dly ?? 0 };
  if (type === 'drums') t.rows = DRUMS.map(s => ({ sound: s, steps: Array(64).fill(0) }));
  else { t.preset = o.preset || 'keys'; t.synth = { ...PRESETS[t.preset] }; t.notes = o.notes || []; }
  return t;
}
export function newVocalTrack(name = 'Vocal', useDefault = true) {
  const t = { id: uid(), type: 'vocal', name, color: nextColor(), vol: 0.85, pan: 0, mute: false, solo: false,
    rev: 0.2, dly: 0.08, gate: false, gateDb: -50, clips: [], takes: [] };
  // my default vocal chain (set on the My sound page)
  const p = useDefault && settings.defaultVocal && findPreset(settings.defaultVocal);
  if (p) { t.fx = presetFx(p); t.rev = p.rev; t.dly = p.dly; }
  return t;
}
// Pattern data. Pattern A lives in the original fields (rows[].steps, notes) so old songs keep working.
export function patData(t, pid) {
  if (pid === 'A' || !pid) return t.type === 'drums' ? { steps: t.rows.map(r => r.steps) } : { notes: t.notes };
  t.pats ||= {};
  let d = t.pats[pid];
  if (!d) d = t.pats[pid] = t.type === 'drums' ? { steps: t.rows.map(() => Array(64).fill(0)) } : { notes: [] };
  if (t.type === 'drums') while (d.steps.length < t.rows.length) d.steps.push(Array(64).fill(0));
  return d;
}
export function setNotes(t, pid, notes) { if (pid === 'A' || !pid) t.notes = notes; else patData(t, pid).notes = notes; }
export function copyPattern(t, from, to) {
  const src = patData(t, from);
  if (t.type === 'drums') { const dst = patData(t, to); src.steps.forEach((s, i) => { dst.steps[i].splice(0, 64, ...s); }); }
  else setNotes(t, to, src.notes.map(n => ({ ...n })));
}
export function applyStarter(beat, name, pid = 'A') {
  const st = STARTERS[name];
  let d = beat.tracks.find(t => t.type === 'drums');
  if (!st) return null;
  if (!d) { d = newBeatTrack('drums'); beat.tracks.unshift(d); }
  const steps = patData(d, pid).steps;
  d.rows.forEach((r, ri) => {
    const pat = r.sample ? '' : (st[r.sound] || '');
    for (let i = 0; i < 64; i++) { const ch = pat[i % 16] || '.'; steps[ri][i] = ch === 'X' ? 2 : ch === 'x' ? 1 : 0; }
  });
  beat.swing = st.swing; beat.scale = st.scale; beat.bars = Math.max(beat.bars, 2);
  // chords and bass, in the song key
  const find = (nm, preset, rev, dly) => {
    let t = beat.tracks.find(x => x.type === 'synth' && x.name === nm);
    if (!t) { t = newBeatTrack('synth', { name: nm, preset, rev, dly }); beat.tracks.push(t); }
    t.preset = preset; t.synth = { ...PRESETS[preset] };
    return t;
  };
  const keys = find('Keys', st.keys, 0.3, 0.12), bass = find('Bass', st.bassPreset, 0, 0);
  const kRoot = 48 + beat.key, bRoot = 36 + beat.key;
  const kn = [], bn = [];
  for (let rep = 0; rep < beat.bars / 2; rep++) for (const [step, len, semis] of st.chords) {
    const s0 = step + rep * 32;
    for (const iv of semis) kn.push({ step: s0, pitch: kRoot + iv, len: len - 1, vel: 0.7 });
    for (const [off, l] of st.bassR) if (off < len) bn.push({ step: s0 + off, pitch: bRoot + ((semis[0] % 12) + 12) % 12 - (semis[0] < -6 ? 0 : 0), len: Math.min(l, len - off), vel: off ? 0.7 : 0.9 });
  }
  setNotes(keys, pid, kn.filter(n => n.step < 64)); setNotes(bass, pid, bn.filter(n => n.step < 64));
  return st.bpm;
}
export function newProject(name = 'New song') {
  colorN = 0;
  const drums = newBeatTrack('drums');
  const bass = newBeatTrack('synth', { name: 'Bass', preset: 'bass', rev: 0,
    notes: [[0, 33, 3], [6, 33, 2], [10, 45, 2], [16, 29, 3], [22, 29, 2], [26, 41, 2], [30, 31, 2]].map(([step, pitch, len]) => ({ step, pitch, len })) });
  const keys = newBeatTrack('synth', { name: 'Keys', preset: 'keys', rev: 0.3, dly: 0.15,
    notes: [[0, 57], [0, 60], [0, 64], [16, 53], [16, 57], [16, 60]].map(([step, pitch]) => ({ step, pitch, len: 14 })) });
  const beat = { bars: 2, swing: 0.2, vol: 0.7, mute: false, solo: false, key: 9, scale: 'minor', tracks: [drums, bass, keys], sel: drums.id };
  const bpm = applyStarter(beat, STARTERS[settings.defaultStarter] ? settings.defaultStarter : 'R&B');
  beat.patterns = ['A']; beat.cur = 'A'; beat.arr = [];
  const v = newVocalTrack('Lead vocal');
  return {
    id: uid(), name, artist: '', cover: null, created: Date.now(), updated: Date.now(),
    bpm, lengthBars: 32, master: { vol: 0.8, revSize: 2.5, delayDiv: 4, delayFb: 0.35,
      ...(STYLES[settings.defaultMaster] ? { chain: { on: true, style: settings.defaultMaster, ...STYLES[settings.defaultMaster], target: undefined } } : {}) },
    beat, tracks: [v], range: { start: 0, end: 4 * 4 * 60 / bpm }, loop: false, punch: false, sel: v.id,
  };
}

// ---- app state ----
export const app = { P: null, view: 'home', clip: null, clipboard: null, playhead: 0, listeners: new Set() };
export const barDur = () => 4 * 60 / app.P.bpm;
export const stepDur = () => 60 / app.P.bpm / 4;
export const songEnd = () => app.P.lengthBars * barDur();
export const selTrack = () => app.P.tracks.find(t => t.id === app.P.sel);

export function on(fn) { app.listeners.add(fn); }
export function emit(kind) { for (const fn of app.listeners) fn(kind); }

let saveT;
export function save() {
  if (!app.P) return;
  clearTimeout(saveT);
  saveT = setTimeout(flush, 400);
}
export async function flush() {
  clearTimeout(saveT);
  if (!app.P) return;
  app.P.updated = Date.now();
  await db.put('projects', app.P.id, app.P);
}

// ---- undo ----
const undoStack = [], redoStack = [];
export function snapshot() {
  undoStack.push(JSON.stringify(app.P));
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
}
export function undo() {
  if (!undoStack.length) return false;
  redoStack.push(JSON.stringify(app.P));
  app.P = JSON.parse(undoStack.pop());
  save(); emit('project'); return true;
}
export function redo() {
  if (!redoStack.length) return false;
  undoStack.push(JSON.stringify(app.P));
  app.P = JSON.parse(redoStack.pop());
  save(); emit('project'); return true;
}

// ---- open ----
export async function openProject(p) {
  await flush();
  undoStack.length = 0; redoStack.length = 0;
  app.P = p; app.clip = null; app.playhead = 0;
  colorN = p.tracks.length + p.beat.tracks.length;
  settings.lastProject = p.id; saveSettings();
  await Promise.all([...audioIdsOf(p)].map(id => loadAudio(id).catch(() => null)));
  await flush();
  emit('project');
}
