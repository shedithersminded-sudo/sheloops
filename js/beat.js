// Beat maker: patterns, drum grid with my samples, piano roll instruments, keyboard + MIDI.
import { $, el, clamp, pct, panFmt, toast, knob, select, ask, confirmBox, cssVar } from './util.js';
import { helpBtn } from './help.js';
import { app, stepDur, save, snapshot, DRUMS, DRUM_NAMES, PRESETS, STARTERS, PAT_IDS, newBeatTrack, applyStarter, patData, setNotes, copyPattern } from './state.js';
import { applyMix, previewDrum, previewNote, liveNote, currentPos, T, refresh, ensureCtx } from './engine.js';
import { SOUNDS, loadSounds, soundName, soundBuffer } from './library.js';
import { PERC, PERC_NAMES, PERC_KITS, isString } from './instruments.js';
import { openGuitarMaker, voicing, chordName } from './guitar.js';
import { modal } from './util.js';
import { openKeyGuide } from './keyguide.js';
import { beatFxPanel } from './fxui.js';
import { FX } from './fx.js';

// effects drawer under each beat track editor
let fxOpen = true;
function fxDrawer(t) {
  const n = (t.fx || []).length;
  return el('div', { class: 'fxdrawer' + (fxOpen ? ' open' : '') },
    el('button', { class: 'drawerbtn', onclick: () => { fxOpen = !fxOpen; renderBeatEditor(); } },
      el('span', { class: 'led' + (n ? ' on' : '') }), `Effects and knobs (${n})`, el('small', {}, n ? (t.fx || []).map(f => FX[f.type].name).join(' + ') : 'Echo, wah, lo-fi, chop, reverb and more'), el('span', { class: 'chev' }, fxOpen ? '▾' : '▸')),
    fxOpen ? beatFxPanel(t, renderBeatEditor) : null);
}
const dname = s => DRUM_NAMES[s] || PERC_NAMES[s] || s;
// instrument menu groups (anything not listed lands in Synths)
const GROUPS = [
  ['Keys', ['piano', 'keys', 'electric piano', 'organ', 'harpsichord', 'celesta', 'accordion', 'melodica']],
  ['Guitars and plucked', ['guitar', 'acoustic guitar', 'nylon guitar', 'electric guitar', 'overdrive guitar', 'muted guitar', '12-string guitar', 'bass guitar', 'ukulele', 'mandolin', 'banjo', 'harp', 'hammered dulcimer']],
  ['Orchestra', ['string section', 'violin', 'cello', 'trumpet', 'trombone', 'brass', 'saxophone', 'clarinet', 'oboe', 'flute', 'choir']],
  ['Japanese', ['koto', 'shamisen', 'biwa', 'sanshin', 'kokyu', 'shakuhachi', 'shinobue', 'ryuteki', 'sho']],
  ['World', ['sitar', 'erhu', 'kalimba', 'handpan', 'steel drum', 'gamelan', 'talking drum', 'pan flute', 'ocarina', 'didgeridoo', 'jaw harp', 'harmonica']],
  ['Mallets and bells', ['marimba', 'xylophone', 'vibraphone', 'bells', 'tubular bells', 'music box', 'glass harmonica']],
  ['Fun and electronic', ['theremin', 'stylophone', 'laser harp']],
  ['Bass', ['bass', 'sub', '808 bass', 'reese bass']],
];
function instrSelect(value, on) {
  const used = new Set(GROUPS.flatMap(g => g[1])), keys = Object.keys(PRESETS).filter(k => k !== 'guitar' || value === 'guitar');
  const opt = k => el('option', { value: k, selected: k === value }, k === 'guitar' ? 'guitar (old)' : k);
  const groups = [['Synths', keys.filter(k => !used.has(k) && k !== 'my sound')], ...GROUPS.map(([n, l]) => [n, l.filter(k => keys.includes(k))]), ['My sound', ['my sound']]];
  return el('select', { onchange: e => on(e.target.value) }, groups.filter(g => g[1].length).map(([n, l]) => el('optgroup', { label: n }, l.map(opt))));
}

const LO = 24, HI = 83, RH = 14;
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const SCALES = { off: [], major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], 'pentatonic minor': [0, 3, 5, 7, 10], 'pentatonic major': [0, 2, 4, 7, 9], blues: [0, 3, 5, 6, 7, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };
const isBlack = m => [1, 3, 6, 8, 10].includes(m % 12);
const inScale = m => { const B = app.P.beat, s = SCALES[B.scale] || []; return !s.length || s.includes(((m - B.key) % 12 + 12) % 12); };
const noteName = m => NOTE[m % 12] + (Math.floor(m / 12) - 1);

let ED = {};
const B = () => app.P.beat;
const cur = () => B().cur || 'A';
const selBeatTrack = () => B().tracks.find(t => t.id === B().sel) || B().tracks[0];
function fixBeat() { const b = B(); b.patterns ||= ['A']; b.cur ||= 'A'; b.arr ||= []; }

// ---------- kits (localStorage) ----------
const KITS_KEY = 'loopden.kits';
const kits = () => JSON.parse(localStorage.getItem(KITS_KEY) || '[]');
const saveKits = k => localStorage.setItem(KITS_KEY, JSON.stringify(k));

export async function renderBeat() {
  fixBeat();
  await loadSounds();
  // make sure samples used here are decoded
  for (const t of B().tracks) { if (t.sample) await soundBuffer(t.sample); for (const r of t.rows || []) if (r.sample) await soundBuffer(r.sample); }
  if (app.view !== 'beat') return;
  const view = $('#view'); view.innerHTML = '';
  const b = B();
  let starter = 'R&B';
  const top = el('div', { class: 'panel toolbar' },
    el('b', { class: 'section-title' }, 'Beat maker'),
    el('label', { class: 'num' }, 'BPM', el('input', { type: 'number', min: 40, max: 220, value: app.P.bpm, onchange: e => { snapshot(); app.P.bpm = clamp(+e.target.value || 90, 40, 220); e.target.value = app.P.bpm; applyMix(); save(); refresh(); } }), helpBtn('bpm')),
    el('label', { class: 'num' }, 'Bars', select([1, 2, 3, 4], b.bars, v => { snapshot(); b.bars = +v; save(); renderBeatEditor(); renderArr(); refresh(); }), helpBtn('bars')),
    knob('Swing', 0, 1, 0.01, b.swing, v => { b.swing = v; save(); }, pct, 'swing'),
    el('label', { class: 'num' }, 'Key', select(NOTE.map((n, i) => [i, n]), b.key, v => { b.key = +v; save(); applyMix(); renderBeatEditor(); }),
      select(Object.keys(SCALES), b.scale, v => { b.scale = v; save(); applyMix(); renderBeatEditor(); }), helpBtn('scale')),
    el('label', { class: 'num' }, 'Style', select(Object.keys(STARTERS), starter, v => starter = v),
      el('button', { onclick: async () => {
        if (!await confirmBox('Load starter', `Load ${starter} drums, chords and bass into pattern ${cur()}? It replaces what is in this pattern and sets the BPM.`, 'Load')) return;
        snapshot(); app.P.bpm = applyStarter(b, starter, cur()); save(); applyMix(); renderBeat(); refresh(); toast(starter + ' starter loaded.');
      } }, 'Load'), helpBtn('starter')),
    el('span', { class: 'withhelp adv' }, el('button', { class: 'tog' + (midiOn ? ' on' : ''), onclick: connectMidi }, midiOn ? 'MIDI on' : 'Connect MIDI'), helpBtn('midi')),
  );
  const pats = el('div', { class: 'panel toolbar patbar' },
    el('b', {}, 'Patterns'), helpBtn('patterns'),
    b.patterns.map(p => el('button', { class: 'patbtn' + (p === cur() ? ' on' : ''), onclick: () => { b.cur = p; save(); renderBeat(); } }, p)),
    b.patterns.length < 8 ? el('button', { onclick: () => newPattern(false) }, '+ New') : null,
    b.patterns.length < 8 ? el('button', { onclick: () => newPattern(true) }, 'Copy ' + cur()) : null,
    cur() !== 'A' ? el('button', { class: 'danger', onclick: deletePattern }, 'Delete ' + cur()) : null,
    el('span', { class: 'sep' }),
    el('b', {}, 'Song'), helpBtn('arrangement'), el('div', { id: 'arr', class: 'arr' }),
  );
  const side = el('section', { class: 'side' }, el('div', { id: 'btracks' }),
    el('div', { class: 'add' },
      el('button', { onclick: () => addTrack('drums') }, '+ Drums'),
      el('button', { onclick: () => addTrack('synth') }, '+ Instrument'),
      el('button', { onclick: pickPercKit }, '+ Percussion'),
      el('button', { class: 'hot', onclick: () => openGuitarMaker(cur(), () => { renderBeatTracks(); renderBeatEditor(); }) }, 'Guitar loop maker'), helpBtn('gtrMaker')));
  const ed = el('section', { id: 'beated', class: 'editor' });
  view.append(el('div', { class: 'beatview' }, top, pats, el('div', { class: 'beatmain' }, side, ed)));
  renderArr(); renderBeatTracks(); renderBeatEditor();
}

function newPattern(copy) {
  const b = B(); const id = PAT_IDS.find(p => !b.patterns.includes(p)); if (!id) return;
  snapshot();
  b.patterns.push(id);
  for (const t of b.tracks) { patData(t, id); if (copy) copyPattern(t, cur(), id); }
  b.cur = id; save(); renderBeat(); toast(`Pattern ${id} ${copy ? 'copied' : 'added'}.`);
}
async function deletePattern() {
  const b = B(), id = cur();
  if (!await confirmBox('Delete pattern', `Delete pattern ${id}? Song spots using it become pattern A.`, 'Delete')) return;
  snapshot();
  b.patterns = b.patterns.filter(p => p !== id);
  for (const t of b.tracks) if (t.pats) delete t.pats[id];
  b.arr = b.arr.map(p => p === id ? 'A' : p);
  b.cur = 'A'; save(); renderBeat();
}

// Song arrangement: one slot per pattern length. Click to cycle, right-click for silence.
export function arrSlots() { const P = app.P; return Math.ceil(P.lengthBars / P.beat.bars); }
export function arrGet(i) { const a = B().arr || []; return i < a.length ? a[i] : (a.length ? a[a.length - 1] : 'A'); }
export function arrSet(i, v) { const b = B(); b.arr ||= []; const fill = arrGet(b.arr.length); while (b.arr.length <= i) b.arr.push(b.arr.length ? b.arr[b.arr.length - 1] : fill); b.arr[i] = v; }
export function arrCycle(i, back) {
  fixBeat();
  const opts = [...B().patterns, ''], now = arrGet(i), k = opts.indexOf(now);
  snapshot(); arrSet(i, back ? '' : opts[(k + 1) % opts.length]); save(); refresh();
}
function renderArr() {
  const box = $('#arr'); if (!box) return; box.innerHTML = '';
  const n = arrSlots();
  for (let i = 0; i < n; i++) {
    const p = arrGet(i);
    box.append(el('button', { class: 'slot' + (p ? '' : ' off'), title: `Bars ${i * B().bars + 1} to ${(i + 1) * B().bars}. Click to change, right-click for silence.`,
      onclick: () => { arrCycle(i); renderArr(); }, oncontextmenu: e => { e.preventDefault(); arrCycle(i, true); renderArr(); } }, p || '-'));
  }
}

function pickPercKit() {
  const close = modal('Add percussion', el('div', { class: 'kitpick' },
    el('p', { class: 'hint' }, 'Pick a set. Each one becomes a new drum track with its own rows. You can swap any row later.'),
    Object.entries(PERC_KITS).map(([name, list]) => el('button', { class: 'kitcard', onclick: () => { close(); addTrack('perc', name); } },
      el('b', {}, name), el('small', {}, list.map(dname).join(', '))))));
}
function addTrack(type, kit) {
  snapshot();
  const t = newBeatTrack(type === 'perc' ? 'drums' : type, type === 'synth' ? { preset: 'piano', rev: 0.2 } : {});
  if (type === 'synth') t.name = 'Instrument';
  if (type === 'perc') { t.name = kit + ' percussion'; t.rows = (PERC_KITS[kit] || PERC.slice(0, 8)).map(s => ({ sound: s, steps: Array(64).fill(0) })); t.rev = 0.15; }
  B().tracks.push(t); B().sel = t.id; save(); applyMix(); renderBeatTracks(); renderBeatEditor();
}
function renderBeatTracks() {
  const box = $('#btracks'); if (!box) return; box.innerHTML = '';
  for (const t of B().tracks) {
    const sq = (label, cls, on, fn, title) => el('button', { class: `sq ${cls}${on ? ' on' : ''}`, title, onclick: fn }, label);
    box.append(el('div', {
      class: 'strip' + (t.id === B().sel ? ' sel' : ''), style: `--c:${t.color}`,
      onpointerdown: e => { if (!e.target.closest('input,button,select')) { B().sel = t.id; save(); renderBeatTracks(); renderBeatEditor(); } },
    },
      el('div', { class: 'strip-head' },
        el('input', { class: 'tname', value: t.name, spellcheck: 'false', oninput: e => { t.name = e.target.value; save(); } }),
        el('span', { class: 'tag' }, t.type === 'drums' ? 'drums' : (t.synth.engine || 'synth')),
        sq('M', 'm', t.mute, () => { t.mute = !t.mute; applyMix(); save(); renderBeatTracks(); }, 'Mute'),
        sq('S', 's', t.solo, () => { t.solo = !t.solo; applyMix(); save(); renderBeatTracks(); }, 'Solo'),
        sq('×', 'x', false, async () => {
          if (!await confirmBox('Delete track', `Delete "${t.name}"?`, 'Delete')) return;
          snapshot(); B().tracks = B().tracks.filter(x => x !== t); if (B().sel === t.id) B().sel = (B().tracks[0] || {}).id;
          save(); applyMix(); renderBeatTracks(); renderBeatEditor();
        }, 'Delete')),
      el('div', { class: 'knobrow' },
        knob('Vol', 0, 1.2, 0.01, t.vol, v => { t.vol = v; applyMix(); save(); }, pct, 'vol'),
        knob('Pan', -1, 1, 0.01, t.pan, v => { t.pan = v; applyMix(); save(); }, panFmt),
        knob('Rev', 0, 1, 0.01, t.rev, v => { t.rev = v; applyMix(); save(); }, pct),
        knob('Dly', 0, 1, 0.01, t.dly, v => { t.dly = v; applyMix(); save(); }, pct)),
    ));
  }
}

export function renderBeatEditor() {
  const box = $('#beated'); if (!box) return;
  box.innerHTML = ''; ED = { last: -1 };
  const t = selBeatTrack();
  if (!t) { box.append(el('div', { class: 'empty' }, 'Add a drums or instrument track on the left.')); return; }
  box.style.setProperty('--c', t.color);
  if (t.type === 'drums') drumEditor(t, box); else synthEditor(t, box);
}
const head = (t, ...kids) => el('div', { class: 'ed-head' }, el('h2', {}, `${t.name} · pattern ${cur()}`), ...kids);

// ---------- drums ----------
let paint = null, painted = false;
window.addEventListener('pointerup', () => { paint = null; if (painted) { save(); painted = false; } });
const soundOptions = () => [
  ...DRUMS.map(s => ['b:' + s, 'Built-in ' + DRUM_NAMES[s]]),
  ...PERC.map(s => ['b:' + s, 'Percussion ' + PERC_NAMES[s]]),
  ...SOUNDS.filter(s => s.kind === 'one-shot').map(s => ['s:' + s.id, s.folder + ' / ' + s.name]),
  ...SOUNDS.filter(s => s.kind === 'loop').map(s => ['s:' + s.id, 'Loop: ' + s.name]),
];
function drumEditor(t, box) {
  const steps = B().bars * 16, data = patData(t, cur()).steps;
  const grid = el('div', { class: 'dgrid', style: `--steps:${steps}` });
  ED.cols = Array.from({ length: steps }, () => []);
  const cls = (v, i) => 'pad' + (v ? ' on' : '') + (v === 2 ? ' acc' : '') + (Math.floor(i / 4) % 2 ? ' alt' : '') + (i && i % 16 === 0 ? ' bar' : '');
  t.rows.forEach((r, ri) => {
    const label = r.sample ? soundName(r.sample) : dname(r.sound);
    grid.append(el('div', { class: 'dlabwrap' },
      el('button', { class: 'dlab', title: 'Click to hear. Change the sound with the menu.', onclick: () => previewDrum(t, r) }, label),
      el('select', { class: 'dsel', title: 'Pick a built-in sound or one of my sounds', onchange: async e => {
        snapshot(); const v = e.target.value;
        if (v.startsWith('s:')) { r.sample = v.slice(2); await soundBuffer(r.sample); } else { r.sample = null; r.sound = v.slice(2); }
        save(); renderBeatEditor(); previewDrum(t, r);
      } }, soundOptions().map(([v, l]) => el('option', { value: v, selected: v === (r.sample ? 's:' + r.sample : 'b:' + r.sound) }, l))),
      el('input', { type: 'range', class: 'rowvol adv', min: 0, max: 1.5, step: 0.01, value: r.vol ?? 1, title: 'Row volume', oninput: e => { r.vol = +e.target.value; save(); } }),
      el('button', { class: 'sq adv', title: 'Remove this row', onclick: () => { snapshot(); t.rows.splice(ri, 1); for (const p of Object.values(t.pats || {})) p.steps.splice(ri, 1); save(); renderBeatEditor(); } }, '×')));
    const row = data[ri];
    for (let i = 0; i < steps; i++) {
      const c = el('button', { class: cls(row[i], i) });
      const apply = v => { row[i] = v; c.className = cls(v, i); painted = true; };
      c.addEventListener('pointerdown', e => { snapshot(); paint = row[i] ? 0 : (e.shiftKey ? 2 : 1); apply(paint); c.releasePointerCapture?.(e.pointerId); if (paint) previewDrum(t, r, paint === 2 ? 1 : 0.72); });
      c.addEventListener('pointerenter', e => { if (paint !== null && e.buttons) apply(paint); });
      grid.append(c); ED.cols[i].push(c);
    }
  });
  const kitList = kits();
  box.append(...[
    head(t, helpBtn('drumsHelp'), el('span', { class: 'hint' }, 'Click or drag to add hits. Shift+click for a loud hit.'), el('span', { class: 'spacer' }),
      el('button', { onclick: () => { snapshot(); t.rows.push({ sound: 'kick', sample: null, steps: Array(64).fill(0) }); save(); renderBeatEditor(); } }, '+ Row'),
      el('span', { class: 'withhelp adv' },
        kitList.length ? select([['', 'Load kit...'], ...kitList.map((k, i) => [i, k.name])], '', async v => {
          if (v === '') return; const k = kitList[+v]; snapshot();
          k.rows.forEach((kr, i) => { if (!t.rows[i]) t.rows.push({ steps: Array(64).fill(0) }); Object.assign(t.rows[i], { sound: kr.sound, sample: kr.sample, vol: kr.vol }); });
          for (const r of t.rows) if (r.sample) await soundBuffer(r.sample);
          save(); renderBeatEditor(); toast(`Kit "${k.name}" loaded.`);
        }) : null,
        el('button', { onclick: async () => { const n = await ask('Save kit', 'Kit name', t.name + ' kit'); if (!n) return; const k = kits(); k.push({ name: n, rows: t.rows.map(r => ({ sound: r.sound, sample: r.sample || null, vol: r.vol ?? 1 })) }); saveKits(k); toast(`Kit "${n}" saved.`); renderBeatEditor(); } }, 'Save kit'),
        helpBtn('kits')),
      el('button', { onclick: () => { snapshot(); data.forEach(r => r.fill(0)); save(); renderBeatEditor(); } }, 'Clear')),
    el('div', { class: 'ed-body' }, grid),
    drumPads(t),
    fxDrawer(t),
    SOUNDS.length ? null : el('p', { class: 'hint pad12' }, 'Tip: upload your own drum sounds in My sounds, then pick them in each row menu.'),
  ].filter(Boolean));
}

// ---------- instruments ----------
let defLen = 2, newVel = 0.8, recNotes = false;
function synthEditor(t, box) {
  const steps = B().bars * 16, s = t.synth, notes = () => patData(t, cur()).notes;
  const body = el('div', { class: 'ed-body' });
  const avail = Math.max(400, (box.clientWidth || 900) - 90);
  const cw = clamp(Math.floor(avail / steps), 14, 40);
  ED.cw = cw;
  const rows = HI - LO + 1, W = steps * cw, H = rows * RH;
  const keys = el('canvas', { class: 'keys', width: 48, height: H });
  const cv = el('canvas', { width: W, height: H });
  ED.ph = el('div', { class: 'playhead' });

  const draw = () => {
    const g = cv.getContext('2d');
    const C = { well: cssVar('--well'), pad: cssVar('--pad'), pad2: cssVar('--pad2'), root: cssVar('--sel'), l1: cssVar('--line2'), l2: cssVar('--line'), l0: cssVar('--panel2') };
    for (let i = 0; i < rows; i++) {
      const m = HI - i, ins = inScale(m), root = SCALES[B().scale].length && (m - B().key) % 12 === 0;
      g.fillStyle = root ? C.root : ins ? (isBlack(m) ? C.pad : C.pad2) : C.well;
      g.fillRect(0, i * RH, W, RH);
    }
    for (let x = 0; x <= steps; x++) { g.fillStyle = x % 16 === 0 ? C.l1 : x % 4 === 0 ? C.l2 : C.l0; g.fillRect(x * cw, 0, 1, H); }
    for (let i = 0; i < rows; i++) if ((HI - i) % 12 === 11) { g.fillStyle = C.l2; g.fillRect(0, i * RH, W, 1); }
    for (const n of notes()) {
      if (n.step >= steps || n.pitch < LO || n.pitch > HI) continue;
      const x = n.step * cw, y = (HI - n.pitch) * RH, w = Math.min(n.len, steps - n.step) * cw;
      g.globalAlpha = 0.45 + 0.55 * (n.vel ?? 0.8);
      g.fillStyle = t.color; g.fillRect(x + 1, y + 1, w - 2, RH - 2);
      g.globalAlpha = 1; g.fillStyle = '#0006'; g.fillRect(x + w - 4, y + 2, 2, RH - 4);
    }
    const k = keys.getContext('2d');
    for (let i = 0; i < rows; i++) {
      const m = HI - i; k.fillStyle = isBlack(m) ? '#111' : '#d9d5cc'; k.fillRect(0, i * RH, 48, RH - 1);
      if (m % 12 === 0) { k.fillStyle = '#111'; k.font = '9px monospace'; k.fillText('C' + (m / 12 - 1), 26, i * RH + 10); }
      if (SCALES[B().scale].length && inScale(m)) { k.fillStyle = '#ff6a1a'; k.fillRect(44, i * RH + 3, 3, RH - 7); }
    }
  };
  ED.redraw = draw;
  keys.addEventListener('pointerdown', e => previewNote(t, HI - Math.floor(e.offsetY / RH)));
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    const st = Math.floor(e.offsetX / cw), p = HI - Math.floor(e.offsetY / RH);
    if (st < 0 || st >= steps || p < LO || p > HI) return;
    snapshot();
    const list = notes();
    const hit = list.findIndex(n => n.pitch === p && st >= n.step && st < n.step + n.len);
    if (hit >= 0) { list.splice(hit, 1); draw(); save(); return; }
    if (e.button !== 0) return;
    const n = { step: st, pitch: p, len: Math.min(defLen, steps - st), vel: newVel };
    list.push(n); previewNote(t, p, 0.3, newVel); draw();
    cv.setPointerCapture(e.pointerId);
    cv.onpointermove = ev => { const s2 = Math.floor(ev.offsetX / cw); if (s2 !== st) { n.len = clamp(s2 - st + 1, 1, steps - st); draw(); } };
    cv.onpointerup = () => { cv.onpointermove = null; defLen = n.len; save(); };
  });

  const instr = s.engine === 'sampler' ? 'my sound' : t.preset;
  const setPreset = async v => {
    snapshot(); t.preset = v; t.synth = { ...PRESETS[v] };
    if (v === 'my sound') { const first = t.sample || (SOUNDS[0] || {}).id; if (!first) toast('Upload a sound in My sounds first.'); else { t.sample = first; await soundBuffer(first); } }
    save(); renderBeatEditor(); renderBeatTracks();
  };
  const controls = s.engine === 'sampler' ? [
    el('label', { class: 'knob' }, el('span', { class: 'lab' }, el('span', {}, 'Sound', helpBtn('sampler'))),
      SOUNDS.length ? select(SOUNDS.map(x => [x.id, x.folder + ' / ' + x.name]), t.sample, async v => { snapshot(); t.sample = v; await soundBuffer(v); save(); previewNote(t, s.root ?? 60); }) : el('span', { class: 'hint' }, 'No sounds yet')),
    el('label', { class: 'knob' }, el('span', { class: 'lab' }, 'Root note'),
      select(Array.from({ length: 48 }, (_, i) => [36 + i, noteName(36 + i)]), s.root ?? 60, v => { s.root = +v; save(); })),
    knob('Attack', 0, 1.5, 0.005, s.attack, v => { s.attack = v; save(); }, v => v.toFixed(2), 'attack'),
    knob('Release', 0.02, 3, 0.01, s.release, v => { s.release = v; save(); }, v => v.toFixed(2), 'release'),
  ] : s.engine ? [
    knob('Brightness', 300, 16000, 10, s.cutoff, v => { s.cutoff = v; save(); }, v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v, 'cutoff'),
    knob('Release', 0.02, 3, 0.01, s.release, v => { s.release = v; save(); }, v => v.toFixed(2), 'release'),
  ] : [
    el('label', { class: 'knob' }, el('span', { class: 'lab' }, el('span', {}, 'Wave', helpBtn('wave'))),
      select(['sine', 'triangle', 'sawtooth', 'square'], s.wave, v => { s.wave = v; save(); })),
    knob('Brightness', 60, 12000, 10, s.cutoff, v => { s.cutoff = v; save(); }, v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v, 'cutoff'),
    knob('Res', 0, 20, 0.1, s.res, v => { s.res = v; save(); }, v => v.toFixed(1), 'res', 'adv'),
    knob('Env', 0, 1, 0.01, s.env, v => { s.env = v; save(); }, pct, 'env', 'adv'),
    knob('Attack', 0, 1.5, 0.005, s.attack, v => { s.attack = v; save(); }, v => v.toFixed(2), 'attack'),
    knob('Sustain', 0, 1, 0.01, s.sustain, v => { s.sustain = v; save(); }, pct, 'sustain', 'adv'),
    knob('Release', 0.02, 3, 0.01, s.release, v => { s.release = v; save(); }, v => v.toFixed(2), 'release'),
    knob('Detune', 0, 30, 1, s.detune, v => { s.detune = v; save(); }, v => v, 'detune', 'adv'),
  ];
  box.append(
    head(t,
      el('label', { class: 'knob' }, el('span', { class: 'lab' }, el('span', {}, 'Instrument', helpBtn('preset'))),
        instrSelect(instr, setPreset)),
      controls,
      knob('Note velocity', 0.1, 1, 0.01, newVel, v => { newVel = v; }, pct, 'velocity'),
      helpBtn('rollHelp'),
      el('span', { class: 'spacer' }),
      el('span', { class: 'withhelp adv' }, el('button', { class: 'tog rec' + (recNotes ? ' on' : ''), onclick: e => { recNotes = !recNotes; e.target.classList.toggle('on', recNotes); toast(recNotes ? 'Note recording on. Press Space to play, then play notes.' : 'Note recording off.'); } }, 'Rec notes'), helpBtn('recNotes')),
      el('button', { onclick: () => { snapshot(); setNotes(t, cur(), []); draw(); save(); } }, 'Clear'),
    ),
    body,
    playPanel(t),
    fxDrawer(t),
  );
  body.append(el('div', { class: 'roll' }, keys, el('div', { class: 'gridwrap' }, cv, ED.ph)));
  draw();
  const vis = notes().filter(n => n.pitch >= LO && n.pitch <= HI);
  const mid = vis.length ? vis.reduce((a, n) => a + n.pitch, 0) / vis.length : 60;
  requestAnimationFrame(() => { body.scrollTop = (HI - mid) * RH - body.clientHeight / 2; });
}

// ---------- play panel: piano keys, guitar, drum pads ----------
let octave = 4, playMode = null, gChord = 0, gShift = 0, fretDrag = false;
window.addEventListener('pointerup', () => { if (!fretDrag) return; fretDrag = false; for (const k of [...strumHeld.keys()]) if (k.startsWith('fret')) releaseStrum(k); });
const PADKEYS = 'asdfghjkqwertyui';
const GSTR = [40, 45, 50, 55, 59, 64]; // E A D G B E
const GKEYS = 'qwerty';
const modeOf = t => playMode || (isString(t.synth.engine) ? 'guitar' : 'piano');
function playTabs(t, mode) {
  const tab = (m, l) => el('button', { class: 'ptab' + (mode === m ? ' on' : ''), onclick: () => { playMode = m; renderBeatEditor(); } }, l);
  return el('div', { class: 'ptabs' }, el('b', {}, 'Play'), tab('piano', 'Piano keys'), tab('guitar', 'Guitar'),
    el('span', { class: 'spacer' }), el('button', { class: 'keysbtn', onclick: () => openKeyGuide('beat') }, '⌨ Keys guide'), helpBtn('playPanel'));
}
function playPanel(t) {
  const mode = modeOf(t);
  return el('div', { class: 'playpanel' }, playTabs(t, mode), mode === 'guitar' ? guitarPanel(t) : vkeyboard(t));
}
const flash = node => { if (!node) return; node.classList.remove('hit'); void node.offsetWidth; node.classList.add('hit'); };

// strum a chord of scale degree d: notes go out one string after another
const strumHeld = new Map(); // id -> notes
function strum(d, up, id = 'chord', vel = newVel) {
  gChord = d;
  const v = voicing(d).map(m => m + gShift), order = up ? [...v].reverse().slice(0, 4) : v, sp = up ? 12 : 16;
  releaseStrum(id);
  const notes = [];
  order.forEach((m, i) => setTimeout(() => { noteOn(m, Math.min(1, vel * (up ? 0.75 : 1) * (1 - i * 0.03))); notes.push(m); flash(document.querySelector(`.gstr[data-s="${v.indexOf(m)}"]`)); }, i * sp));
  strumHeld.set(id, { notes, at: performance.now(), count: order.length, sp });
  document.querySelectorAll('.chordpad').forEach((b, i) => b.classList.toggle('on', i === d));
}
function releaseStrum(id) {
  const h = strumHeld.get(id); if (!h) return; strumHeld.delete(id);
  const wait = Math.max(0, h.count * h.sp - (performance.now() - h.at)) + 5;
  setTimeout(() => { for (const m of h.notes) noteOff(m); }, wait);
}
function pluckString(s, id = 'str' + s) {
  const m = voicing(gChord)[s] + gShift;
  noteOn(m, newVel); strumHeld.set(id, { notes: [m], at: performance.now(), count: 0, sp: 0 });
  flash(document.querySelector(`.gstr[data-s="${s}"]`));
}
function guitarPanel(t) {
  const deg = [0, 1, 2, 3, 4, 5, 6];
  const pads = el('div', { class: 'chordpads' }, deg.map(d => el('button', { class: 'chordpad' + (d === gChord ? ' on' : ''),
    onpointerdown: e => { e.preventDefault(); strum(d, e.button === 2 || e.shiftKey, 'pad'); }, onpointerup: () => releaseStrum('pad'), onpointerleave: () => releaseStrum('pad'), oncontextmenu: e => e.preventDefault() },
    el('kbd', {}, d + 1), el('b', {}, chordName(d)), el('small', {}, ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii'][d]))));
  // fretboard: high string on top, like guitar tabs. Drag across strings to strum by hand.
  const board = el('div', { class: 'fretboard' });
  for (let s = 5; s >= 0; s--) {
    const row = el('div', { class: 'gstr', 'data-s': s, style: `--th:${1 + (5 - s) * 0.0}px;--w:${3 - s * 0.35}px` },
      el('kbd', { class: 'skey' }, GKEYS[s].toUpperCase()));
    for (let f = 0; f <= 12; f++) {
      const m = GSTR[s] + f + gShift, cell = el('div', { class: 'fret' + (f === 0 ? ' open' : '') + (inScale(m) ? ' insc' : '') + ([3, 5, 7, 9].includes(f) ? ' dot' : '') + (f === 12 ? ' dot2' : ''), title: noteName(m) },
        el('span', {}, inScale(m) ? NOTE[m % 12] : ''));
      const hit = () => { const id = 'fret' + s; releaseStrum(id); noteOn(m, newVel); strumHeld.set(id, { notes: [m], at: performance.now(), count: 0, sp: 0 }); flash(row); flash(cell); };
      cell.addEventListener('pointerdown', e => { e.preventDefault(); fretDrag = true; cell.releasePointerCapture?.(e.pointerId); hit(); });
      cell.addEventListener('pointerenter', e => { if (fretDrag && e.buttons) hit(); });
      row.append(cell);
    }
    board.append(row);
  }
  const ctl = el('div', { class: 'vk-ctl' },
    el('button', { onclick: () => { gShift = clamp(gShift - 12, -24, 12); renderBeatEditor(); } }, 'Lower'),
    el('span', {}, gShift ? (gShift > 0 ? '+' : '') + gShift / 12 + ' oct' : 'Normal'),
    el('button', { onclick: () => { gShift = clamp(gShift + 12, -24, 12); renderBeatEditor(); } }, 'Higher'),
    el('span', { class: 'hint' }, 'Chords: press 1 to 7 (Shift = up strum). Strings: Q W E R T Y. Or click and drag on the frets.'),
    isString(t.synth.engine) ? null : el('span', { class: 'hint warn' }, 'Tip: pick a guitar in the Instrument menu for a real guitar sound.'));
  return el('div', { class: 'guitarwrap' }, ctl, pads, board);
}
// drum pads: one big pad per row, with its computer key
function drumPads(t) {
  const n = Math.min(t.rows.length, 16);
  return el('div', { class: 'playpanel' },
    el('div', { class: 'ptabs' }, el('b', {}, 'Drum pads'), el('span', { class: 'hint' }, 'Play live with the keys shown. Hold Shift for a loud hit.'),
      el('span', { class: 'spacer' }),
      el('span', { class: 'withhelp' }, el('button', { class: 'tog rec' + (recNotes ? ' on' : ''), onclick: e => { recNotes = !recNotes; e.target.classList.toggle('on', recNotes); toast(recNotes ? 'Recording on. Press Space to play, then hit the pads.' : 'Recording off.'); } }, 'Rec hits'), helpBtn('recNotes')), el('button', { class: 'keysbtn', onclick: () => openKeyGuide('beat') }, '⌨ Keys guide')),
    el('div', { class: 'dpads', style: `--n:${Math.min(8, n)}` }, t.rows.slice(0, 16).map((r, i) => el('button', { class: 'dpad', 'data-i': i,
      onpointerdown: e => { e.preventDefault(); padHit(i, e.shiftKey ? 1 : 0.8); } },
      el('kbd', {}, PADKEYS[i].toUpperCase()), el('b', {}, r.sample ? soundName(r.sample) : dname(r.sound))))));
}
function padHit(i, vel) {
  noteOn(36 + i, vel); flash(document.querySelector(`.dpad[data-i="${i}"]`));
}
function vkeyboard(t) {
  const wrap = el('div', { class: 'vkeys' });
  const base = 12 * (octave + 1);
  const keysEl = el('div', { class: 'vk-inner' });
  for (let m = base; m < base + 25; m++) {
    const ki = m - base, key = ki < KEYMAP.length ? KEYMAP[ki].toUpperCase() : '';
    const k = el('div', { class: 'vk' + (isBlack(m) ? ' black' : '') + (inScale(m) ? ' insc' : ''), title: noteName(m) + (key ? ' (key ' + key + ')' : ''), 'data-m': m },
      key ? el('kbd', {}, key) : null, m % 12 === 0 ? el('span', {}, noteName(m)) : null);
    k.addEventListener('pointerdown', e => { e.preventDefault(); noteOn(m, 0.85); k.classList.add('down'); k.setPointerCapture(e.pointerId); });
    const up = () => { if (k.classList.contains('down')) { noteOff(m); k.classList.remove('down'); } };
    k.addEventListener('pointerup', up); k.addEventListener('pointercancel', up);
    keysEl.append(k);
  }
  wrap.append(el('div', { class: 'vk-ctl' },
    el('button', { onclick: () => { octave = clamp(octave - 1, 1, 6); renderBeatEditor(); } }, 'Oct -'),
    el('span', {}, 'C' + octave),
    el('button', { onclick: () => { octave = clamp(octave + 1, 1, 6); renderBeatEditor(); } }, 'Oct +'),
    helpBtn('vkeys')), keysEl);
  return wrap;
}

// ---------- live notes: computer keys, on-screen keys, MIDI ----------
const held = new Map();
function nowStep() { return Math.round(currentPos() / stepDur()) % (B().bars * 16); }
export function noteOn(midi, vel = 0.8) {
  const t = selBeatTrack(); if (!t) return;
  if (t.type === 'drums') { // pads: MIDI 36 and up map to rows
    const ri = midi - 36; const r = t.rows[((ri % t.rows.length) + t.rows.length) % t.rows.length];
    previewDrum(t, r, vel);
    if (recNotes && T.playing && app.view === 'beat') { const st = patData(t, cur()).steps[t.rows.indexOf(r)]; st[nowStep()] = vel > 0.9 ? 2 : 1; save(); renderBeatEditor(); }
    return;
  }
  live.get(midi)?.(); live.set(midi, liveNote(t, midi, vel));
  if (recNotes && T.playing && app.view === 'beat') held.set(midi, { step: nowStep(), vel, t, time: performance.now() });
}
const live = new Map();
export function noteOff(midi) {
  const stopIt = live.get(midi); if (stopIt) { live.delete(midi); stopIt(); }
  const h = held.get(midi); if (!h) return; held.delete(midi);
  const len = Math.max(1, Math.round((performance.now() - h.time) / 1000 / stepDur()));
  const steps = B().bars * 16;
  if (!held.size && !h.snap) snapshot();
  patData(h.t, cur()).notes.push({ step: h.step, pitch: midi, len: Math.min(len, steps - h.step), vel: Math.round(h.vel * 100) / 100 });
  save(); if (ED.redraw) ED.redraw();
}

const KEYMAP = 'awsedftgyhujk';
const keyDown = new Set();
// computer keys. Drums: pads. Instruments: piano keys or guitar (chords 1-7, strings Q-Y).
export function beatKey(k, up, e = {}) {
  const t = selBeatTrack(); if (!t) return false;
  const code = e.code || '', digit = /^Digit[1-7]$/.test(code) ? +code.slice(5) : 0, id = code || k;
  if (up) { if (!keyDown.has(id)) return false; keyDown.delete(id); }
  else { if (keyDown.has(id)) return true; keyDown.add(id); }
  if (t.type === 'drums') {
    const i = PADKEYS.indexOf(k); if (i < 0 || i >= t.rows.length) return false;
    if (!up) padHit(i, e.shiftKey ? 1 : 0.8);
    return true;
  }
  const mode = modeOf(t);
  if (mode === 'guitar') {
    if (digit) { if (up) releaseStrum('key' + digit); else strum(digit - 1, e.shiftKey, 'key' + digit); return true; }
    const s = GKEYS.indexOf(k);
    if (s >= 0) { if (up) releaseStrum('str' + s); else pluckString(s); return true; }
    if (!up && (k === 'z' || k === 'x')) { gShift = clamp(gShift + (k === 'z' ? -12 : 12), -24, 12); renderBeatEditor(); return true; }
    return false;
  }
  if (!up && k === 'z') { octave = clamp(octave - 1, 1, 6); toast('Octave ' + octave); renderBeatEditor(); return true; }
  if (!up && k === 'x') { octave = clamp(octave + 1, 1, 6); toast('Octave ' + octave); renderBeatEditor(); return true; }
  const i = KEYMAP.indexOf(k); if (i < 0) return false;
  const m = 12 * (octave + 1) + i, vk = document.querySelector(`.vk[data-m="${m}"]`);
  if (up) { noteOff(m); vk?.classList.remove('down'); } else { noteOn(m, newVel); vk?.classList.add('down'); }
  return true;
}

let midiOn = false;
async function connectMidi() {
  if (!navigator.requestMIDIAccess) return toast('This browser does not support MIDI. Use Chrome or Edge.');
  try {
    const acc = await navigator.requestMIDIAccess();
    const hook = () => { for (const inp of acc.inputs.values()) inp.onmidimessage = onMidi; };
    hook(); acc.onstatechange = hook;
    midiOn = true;
    const n = [...acc.inputs.values()].length;
    toast(n ? `MIDI connected (${n} device${n === 1 ? '' : 's'}). Select an instrument track and play.` : 'MIDI is on, but no keyboard was found. Plug one in.');
    renderBeat();
  } catch { toast('MIDI access was blocked.'); }
}
function onMidi(e) {
  const [st, note, vel] = e.data, cmd = st & 0xf0;
  if (app.view !== 'beat') return;
  if (cmd === 0x90 && vel > 0) noteOn(note, vel / 127);
  else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) noteOff(note);
}

export function beatTick() {
  if (!$('#beated')) return;
  const s = T.playing ? Math.floor(currentPos() / stepDur() + 1e-6) % (B().bars * 16) : -1;
  if (s === ED.last) return;
  if (ED.cols) { if (ED.last >= 0 && ED.cols[ED.last]) ED.cols[ED.last].forEach(c => c.classList.remove('now')); if (s >= 0 && ED.cols[s]) ED.cols[s].forEach(c => c.classList.add('now')); }
  if (ED.ph) { ED.ph.style.display = s < 0 ? 'none' : 'block'; if (s >= 0) ED.ph.style.left = s * ED.cw + 'px'; }
  ED.last = s;
}
