// Inspector tabs for effects, presets and Build My Sound.
import { el, clamp, toast, knob, select, ask, confirmBox } from './util.js';
import { helpBtn, HELP } from './help.js';
import { app, save, snapshot } from './state.js';
import { settings, saveSettings } from './store.js';
import { FX, FX_ORDER, BEAT_FX, NOTE, TUNE_SCALES, newFx } from './fx.js';
import { BUILTIN, CATS, MOODS, moodOf, VIBES, buildSound, mine, favs, saveMine, addMine, folders, presetFx, findPreset } from './presets.js';
import { T, play, applyMix } from './engine.js';

let preview = null;
let rerender = () => { };
const rerenderFn = () => rerender();
export function setRerender(fn) { rerender = fn; }
export function clearPreview() { preview = null; }

const trackOf = id => app.P.tracks.find(t => t.id === id);
export function startPreview(t, pre) {
  if (preview && preview.trackId !== t.id) cancelPreview(true);
  if (!preview) preview = { trackId: t.id, old: { fx: t.fx || [], rev: t.rev, dly: t.dly, fxBypass: !!t.fxBypass, layers: t.layers || [], layerBase: t.layerBase || null } };
  preview.name = pre.name;
  Object.assign(t, { fx: pre.fx, rev: pre.rev, dly: pre.dly, fxBypass: false, layers: pre.layers || [], layerBase: pre.layerBase || null });
  applyMix();
  if (!T.playing) {
    const sel = app.clip && app.clip.trackId === t.id && t.clips.find(c => c.id === app.clip.clipId);
    const c = sel || t.clips[0];
    if (c) play(c.start); else toast('Record something on this track to hear the preview, or turn on Monitor and sing.');
  }
  rerender();
}
export function keepPreview() {
  const t = trackOf(preview.trackId); if (!t) { preview = null; return; }
  const now = { fx: t.fx, rev: t.rev, dly: t.dly, layers: t.layers, layerBase: t.layerBase };
  Object.assign(t, preview.old); snapshot(); Object.assign(t, now, { fxBypass: false });
  toast(`"${preview.name}" applied.`); preview = null; save(); applyMix(); rerender();
}
export function cancelPreview(quiet) {
  const t = trackOf(preview.trackId);
  if (t) Object.assign(t, preview.old);
  preview = null; applyMix(); if (!quiet) rerender();
}
function applyPreset(t, pre) {
  if (preview) cancelPreview(true);
  snapshot();
  Object.assign(t, { fx: pre.fx, rev: pre.rev, dly: pre.dly, fxBypass: false, layers: pre.layers || [], layerBase: pre.layerBase || null });
  save(); applyMix(); rerender(); toast(pre.msg || `"${pre.name}" applied to ${t.name}.`);
}

// ---------- layers: presets stack on top of each other and come off again ----------
// Each fx made by a preset carries f.layer = preset id. t.layers lists the active presets.
// Vocal presets are full chains, so only one Vocal is on at a time. Enhance, Voice FX and my presets stack.
const rank = f => FX_ORDER.indexOf(f.type);
const isOn = (t, p) => (t.layers || []).some(l => l.pid === p.id);
function recalcSpace(st) {
  const b = st.layerBase || { rev: 0, dly: 0 };
  st.rev = Math.max(b.rev, ...st.layers.map(l => l.rev || 0)); st.dly = Math.max(b.dly, ...st.layers.map(l => l.dly || 0));
  if (!st.layers.length) st.layerBase = null;
}
function layered(t, p) {
  const st = { name: p.name, fx: (t.fx || []).slice(), layers: (t.layers || []).slice(), layerBase: t.layerBase || { rev: t.rev || 0, dly: t.dly || 0 } };
  const drop = pid => { st.layers = st.layers.filter(l => l.pid !== pid); st.fx = st.fx.filter(f => f.layer !== pid); };
  const cat = p.cat || 'Mine';
  if (isOn(t, p)) { drop(p.id); st.msg = `"${p.name}" taken off ${t.name}.`; }
  else {
    if (cat === 'Vocal') for (const l of st.layers.filter(l => l.cat === 'Vocal')) drop(l.pid);
    st.layers.push({ pid: p.id, name: p.name, cat, rev: p.rev || 0, dly: p.dly || 0 });
    for (const f of presetFx(p)) { f.layer = p.id; let i = st.fx.length; while (i > 0 && rank(st.fx[i - 1]) > rank(f)) i--; st.fx.splice(i, 0, f); }
    st.msg = `"${p.name}" added to ${t.name}. Stack more, or click Take off to remove it.`;
  }
  recalcSpace(st);
  return st;
}
// after a single effect is removed, drop layers that have nothing left
function tidyLayers(t) {
  if (!t.layers || !t.layers.length) return;
  const before = t.layers.length;
  t.layers = t.layers.filter(l => (t.fx || []).some(f => f.layer === l.pid));
  if (t.layers.length !== before) { const st = { layers: t.layers, layerBase: t.layerBase }; recalcSpace(st); Object.assign(t, st); }
}
const openLayers = new Set();
const pc = v => Math.round(v * 100) + '';
function stackPanel(t) {
  const L = t.layers || [];
  if (!L.length) return el('div', { class: 'stack empty' }, el('span', { class: 'stacktitle' }, 'Sound stack'),
    el('span', { class: 'hint' }, 'Nothing on yet. Pick one Vocal preset, then stack Enhance and Voice FX on top.'), helpBtn('stack'));
  return el('div', { class: 'stack' },
    el('div', { class: 'stackhead' }, el('span', { class: 'stacktitle' }, `Sound stack · ${L.length}`), helpBtn('stack'), el('span', { class: 'spacer' }),
      knob('Space', 0, 1, 0.01, t.rev || 0, v => { t.rev = v; applyMix(); save(); }, pc, 'rev', 'dial sm'),
      knob('Echo', 0, 1, 0.01, t.dly || 0, v => { t.dly = v; applyMix(); save(); }, pc, 'dly', 'dial sm'),
      el('button', { class: 'danger', onclick: () => {
        snapshot(); const ids = new Set(L.map(l => l.pid)); t.fx = (t.fx || []).filter(f => !ids.has(f.layer));
        const b = t.layerBase || { rev: t.rev, dly: t.dly }; Object.assign(t, { layers: [], layerBase: null, rev: b.rev, dly: b.dly });
        save(); applyMix(); rerender(); toast('Stack cleared.');
      } }, 'Clear stack')),
    L.map(l => {
      const mine = (t.fx || []).map((f, i) => [f, i]).filter(([f]) => f.layer === l.pid), on = mine.some(([f]) => f.on), open = openLayers.has(t.id + l.pid);
      return el('div', { class: 'layer' + (on ? ' on' : '') + (open ? ' open' : '') },
        el('div', { class: 'layerhead' }, on ? eqBars() : null,
          el('button', { class: 'pow' + (on ? ' on' : ''), title: on ? 'Mute this layer' : 'Turn it back on', onclick: () => { for (const [f] of mine) f.on = !on; save(); applyMix(); rerender(); } }, on ? 'ON' : 'OFF'),
          el('b', {}, l.name), el('span', { class: 'cattag c-' + l.cat.replace(/\W/g, '') }, l.cat),
          el('small', { class: 'hint' }, mine.map(([f]) => FX[f.type].name).join(' + ')),
          el('span', { class: 'spacer' }),
          el('button', { class: 'gear' + (open ? ' on' : ''), onclick: () => { open ? openLayers.delete(t.id + l.pid) : openLayers.add(t.id + l.pid); rerender(); } }, open ? 'Hide knobs' : 'Knobs'),
          el('button', { class: 'sq', title: 'Take this off', onclick: () => {
            const p = findPreset(l.pid) || { id: l.pid, name: l.name, cat: l.cat }; snapshot(); const st = layered(t, p);
            Object.assign(t, st); save(); applyMix(); rerender(); toast(st.msg);
          } }, '×')),
        el('div', { class: 'explain' }, (findPreset(l.pid) || {}).desc || '', ' Click Knobs to change it, OFF to hear it without, or × to take it off.'),
        open ? el('div', { class: 'layerfx' }, mine.map(([f, i]) => fxCard(t, f, i))) : null);
    }));
}

export function previewBar(t) {
  if (!preview || preview.trackId !== t.id) return null;
  return el('div', { class: 'previewbar' }, el('span', {}, `Previewing "${preview.name}" on ${t.name}.`),
    el('button', { class: 'hot', onclick: keepPreview }, 'Keep it'), el('button', { onclick: () => cancelPreview() }, 'Cancel'), helpBtn('preview'));
}
export function abButton(t) {
  const on = !!t.fxBypass;
  return el('span', { class: 'withhelp' }, el('button', { class: 'abbtn' + (on ? ' b' : ''), onclick: () => { t.fxBypass = !t.fxBypass; applyMix(); save(); rerender(); } },
    on ? 'B: hearing original' : 'A: hearing effects'), helpBtn('ab'));
}
async function saveAsMine(t) {
  if (!(t.fx || []).length) return toast('Add some effects first.');
  const name = await ask('Save my preset', 'Preset name', t.name + ' sound'); if (!name) return;
  const folder = await ask('Folder', 'Folder name (to organize presets)', folders()[0] || 'My presets'); if (folder == null) return;
  addMine(name, folder, t.fx, t.rev, t.dly); toast(`Saved "${name}" in ${folder}.`); rerender();
}

// ---------- Effects tab ----------
export function fxTab(t) {
  t.fx ||= [];
  const lib = el('div', { class: 'fxlib' }, el('span', { class: 'hint' }, 'Drag onto a track, or click to add:'),
    FX_ORDER.map(type => el('button', { class: 'chip', draggable: 'true',
      ondragstart: e => { e.dataTransfer.setData('loopden/fx', type); e.dataTransfer.effectAllowed = 'copy'; },
      onclick: () => { addFx(t, type); } }, FX[type].name)), helpBtn('fxLibrary'));
  if (t.layers && t.layers.length) lib.append(el('div', { class: 'hint' }, 'Effects from your Sound stack show the preset name.'));
  const chain = el('div', { class: 'fxchain' });
  if (!t.fx.length) chain.append(el('p', { class: 'hint' }, 'No effects yet. Add one above, or pick a preset in the Presets tab.'));
  t.fx.forEach((f, i) => chain.append(fxCard(t, f, i)));
  return el('div', { class: 'fxtab' },
    el('div', { class: 'fxtop' }, abButton(t), el('button', { onclick: () => saveAsMine(t) }, 'Save as my preset'),
      t.fx.length ? el('button', { onclick: async () => { if (await confirmBox('Remove effects', `Remove all effects from ${t.name}?`, 'Remove')) { snapshot(); t.fx = []; t.layers = []; t.layerBase = null; save(); applyMix(); rerender(); } } }, 'Remove all') : null),
    lib, chain);
}
export function addFx(t, type) {
  snapshot(); t.fx ||= []; t.fx.push(newFx(type)); save(); applyMix(); rerender();
  toast(`${FX[type].name} added to ${t.name}.`);
}
export function fxCard(t, f, i, rr) {
  const rerender = rr || rerenderFn;
  const D = FX[f.type];
  const set = (k, v) => { f.params[k] = v; applyMix(); save(); };
  const move = d => { const j = i + d; if (j < 0 || j >= t.fx.length) return; snapshot(); [t.fx[i], t.fx[j]] = [t.fx[j], t.fx[i]]; save(); applyMix(); rerender(); };
  const params = D.params.map(q => {
    if (f.type === 'tune' && q.k === 'key') return el('label', { class: 'knob' }, el('span', { class: 'lab' }, 'Key'),
      select([[-1, 'Song key'], ...NOTE.map((n, k) => [k, n])], f.params.key, v => { set('key', +v); rerender(); }));
    if (f.type === 'tune' && q.k === 'scale') return f.params.key < 0 ? null : el('label', { class: 'knob' }, el('span', { class: 'lab' }, 'Scale'),
      select(Object.keys(TUNE_SCALES).map((s, k) => [k, s]), f.params.scale, v => set('scale', +v)));
    return knob(q.label, q.min, q.max, q.step, f.params[q.k] ?? q.def, v => set(q.k, v), q.fmt, null, 'dial' + (q.adv ? ' adv' : ''));
  });
  const src = f.layer && (t.layers || []).find(l => l.pid === f.layer);
  return el('div', { class: 'fxcard' + (f.on ? '' : ' off'), 'data-g': D.group },
    el('div', { class: 'fxhead' },
      el('button', { class: 'pow' + (f.on ? ' on' : ''), title: f.on ? 'Turn off' : 'Turn on', onclick: () => { f.on = !f.on; save(); applyMix(); rerender(); } }, f.on ? 'ON' : 'OFF'),
      el('span', { class: 'led' }), el('b', {}, D.name), helpBtn('fx_' + f.type), src ? el('span', { class: 'cattag' }, src.name) : null, el('span', { class: 'spacer' }),
      el('button', { class: 'sq', title: 'Move earlier', onclick: () => move(-1) }, '<'),
      el('button', { class: 'sq', title: 'Move later', onclick: () => move(1) }, '>'),
      el('button', { class: 'sq', title: 'Remove', onclick: () => { snapshot(); t.fx.splice(i, 1); tidyLayers(t); save(); applyMix(); rerender(); } }, '×')),
    HELP['fx_' + f.type] ? el('div', { class: 'explain' }, HELP['fx_' + f.type].what, ' ', el('i', {}, HELP['fx_' + f.type].how), HELP['fx_' + f.type].start ? el('span', { class: 'try' }, 'Try: ' + HELP['fx_' + f.type].start) : null) : null,
    el('div', { class: 'fxparams' }, params),
    f.type === 'tune' && f.params.key < 0 ? el('small', { class: 'hint' }, `Song key: ${NOTE[app.P.beat.key]} ${app.P.beat.scale === 'off' ? '(all notes)' : app.P.beat.scale}. Change it in the Beat tab.`) : null);
}

// ---------- Presets tab ----------
let presetCat = 'Vocal', myFolder = '', mood = '';
const eqBars = () => el('span', { class: 'eqbars', 'aria-hidden': 'true' }, el('i'), el('i'), el('i'), el('i'));
function steps(t) {
  const L = t.layers || [], has = c => L.some(l => l.cat === c);
  const st = (n, c, label, text) => el('button', { class: 'step' + (has(c) ? ' done' : '') + (presetCat === c ? ' on' : ''), onclick: () => { presetCat = c; mood = ''; rerender(); } },
    el('span', { class: 'num' }, has(c) ? '✓' : n), el('b', {}, label), el('small', {}, text));
  return el('div', { class: 'steps explain' },
    st('1', 'Vocal', 'Pick a style', 'One Vocal preset sets the main sound.'),
    st('2', 'Enhance', 'Polish it', 'Add Enhance to make it clearer, warmer or louder.'),
    st('3', 'Voice FX', 'Get creative', 'Add Voice FX for robot, deep, echo and more.'));
}
export function presetsTab(t) {
  const cats = ['Favorites', ...CATS, 'My presets'];
  const top = el('div', { class: 'fxtop' },
    cats.map(c => el('button', { class: 'chip' + (presetCat === c ? ' on' : ''), onclick: () => { presetCat = c; mood = ''; rerender(); } }, c === 'Favorites' ? '★ Favorites' : c)),
    helpBtn('presets'), el('span', { class: 'spacer' }), abButton(t));
  const stack = stackPanel(t);
  let list;
  if (presetCat === 'My presets') list = mine.filter(p => !myFolder || p.folder === myFolder);
  else if (presetCat === 'Favorites') list = [...BUILTIN, ...mine].filter(p => favs.has(p.id));
  else list = BUILTIN.filter(p => p.cat === presetCat);
  const moods = MOODS[presetCat];
  const all = list;
  if (moods && mood) list = list.filter(p => moodOf(p) === mood);
  const moodRow = moods ? el('div', { class: 'moods' },
    el('span', { class: 'hint' }, 'Mood:'),
    ['', ...moods].map(m => el('button', { class: 'mood' + (mood === m ? ' on' : ''), 'data-m': m || 'all', onclick: () => { mood = m; rerender(); } }, m || 'All', el('small', {}, String(m ? all.filter(p => moodOf(p) === m).length : all.length)))),
    el('span', { class: 'spacer' }),
    el('button', { class: 'hot surprise', title: 'Adds a random preset from this list', onclick: () => {
      const pool = list.filter(p => !isOn(t, p)); if (!pool.length) return toast('Everything here is already on.');
      const p = pool[Math.floor(Math.random() * pool.length)]; applyPreset(t, layered(t, p));
    } }, 'Surprise me')) : null;
  const grid = el('div', { class: 'pregrid' });
  if (presetCat === 'My presets') top.append(el('label', { class: 'num' }, 'Folder', select([['', 'All folders'], ...folders()], myFolder, v => { myFolder = v; rerender(); })));
  if (!list.length) grid.append(el('p', { class: 'hint' }, presetCat === 'Favorites' ? 'Click the star on a preset to add it here.' : 'No saved presets yet. Set up effects on a track and click Save as my preset.'));
  for (const p of list) {
    const isMine = p.id.startsWith('m:'), active = isOn(t, p);
    const inside = (p.chain ? p.chain() : p.fx).map(f => FX[f.type].name);
    grid.append(el('div', { class: 'precard' + (preview && preview.trackId === t.id && preview.name === p.name ? ' prev' : '') + (active ? ' on' : ''), title: 'Inside: ' + inside.join(', ') },
      el('div', { class: 'prehead' }, active ? eqBars() : null, el('b', {}, p.name), moodOf(p) ? el('span', { class: 'moodtag', 'data-m': moodOf(p) }, moodOf(p)) : null,
        el('button', { class: 'star' + (favs.has(p.id) ? ' on' : ''), title: 'Favorite', onclick: () => { favs.has(p.id) ? favs.delete(p.id) : favs.add(p.id); saveMine(); rerender(); } }, favs.has(p.id) ? '★' : '☆')),
      el('small', {}, isMine ? `${p.folder} · ${p.fx.length} effects` : p.desc),
      el('div', { class: 'inside' }, (p.chain ? p.chain() : p.fx).map(f => el('span', { title: (HELP['fx_' + f.type] || {}).what || '' }, FX[f.type].name))),
      el('div', { class: 'prebtns' },
        active ? null : el('button', { onclick: () => startPreview(t, layered(t, p)) }, 'Preview'),
        el('button', { class: active ? 'danger' : 'hot', onclick: () => applyPreset(t, layered(t, p)) }, active ? 'Take off' : ((p.cat || 'Mine') === 'Vocal' ? 'Use' : 'Add')),
        isMine ? [
          el('button', { onclick: async () => { const n = await ask('Rename preset', 'Name', p.name); if (n) { p.name = n; saveMine(); rerender(); } } }, 'Rename'),
          el('button', { onclick: async () => { const n = await ask('Move to folder', 'Folder', p.folder); if (n) { p.folder = n; saveMine(); rerender(); } } }, 'Folder'),
          el('button', { onclick: () => { addMine(p.name + ' copy', p.folder, p.fx, p.rev, p.dly); rerender(); } }, 'Copy'),
          el('button', { class: 'danger', onclick: async () => { if (await confirmBox('Delete preset', `Delete "${p.name}"?`, 'Delete')) { mine.splice(mine.indexOf(p), 1); favs.delete(p.id); saveMine(); rerender(); } } }, 'Delete'),
        ] : null)));
  }
  return el('div', { class: 'fxtab' }, top, steps(t), stack, moodRow, grid);
}

// ---------- Build My Sound tab ----------
const B = { vibe: 'Smooth R&B', base: null, tune: 0.4, space: 0.6, bright: 0.5, warm: 0.4 };
function pickVibe(v) {
  B.vibe = v;
  if (VIBES[v]) Object.assign(B, VIBES[v], { base: null });
}
function currentBuild() {
  let base;
  if (B.vibe === 'My signature sound') { const m = findPreset(B.base) || mine[0]; if (!m) return null; base = { chain: () => presetFx(m) }; }
  else base = BUILTIN.find(p => p.name === VIBES[B.vibe].base);
  const r = buildSound(base, B); r.name = B.vibe; return r;
}
export function buildTab(t) {
  const vibes = [...Object.keys(VIBES), 'My signature sound'];
  const sl = (label, k, help) => knob(label, 0, 1, 0.01, B[k], v => { B[k] = v; if (preview && preview.trackId === t.id) startPreview(t, currentBuild()); }, v => Math.round(v * 100) + '', help, 'dial');
  return el('div', { class: 'fxtab' },
    el('div', { class: 'fxtop' }, el('b', {}, '1. Pick the sound you want'), helpBtn('buildSound')),
    el('div', { class: 'fxlib' }, vibes.map(v => el('button', { class: 'chip' + (B.vibe === v ? ' on' : ''), onclick: () => { pickVibe(v); if (preview && preview.trackId === t.id) { const b = currentBuild(); if (b) startPreview(t, b); } rerender(); } }, v))),
    B.vibe === 'My signature sound' ? (mine.length
      ? el('label', { class: 'num' }, 'Start from', select(mine.map(p => [p.id, p.name]), B.base || mine[0].id, v => { B.base = v; }))
      : el('p', { class: 'hint' }, 'Save a preset of your own first (Effects tab, Save as my preset). It becomes your signature sound.')) : null,
    el('div', { class: 'fxtop' }, el('b', {}, '2. Shape it')),
    el('div', { class: 'knobrow' }, sl('Auto-Tune', 'tune', 'fx_tune'), sl('Space', 'space', 'rev'), sl('Brightness', 'bright', 'fx_eq'), sl('Warmth', 'warm', 'fx_sat')),
    el('div', { class: 'fxtop' }, el('b', {}, '3. Listen and keep it'),
      el('button', { onclick: () => { const b = currentBuild(); if (b) startPreview(t, b); else toast('Save a preset of your own first.'); } }, 'Preview'),
      el('button', { class: 'hot', onclick: () => { const b = currentBuild(); if (b) applyPreset(t, b); } }, 'Apply'),
      el('button', { onclick: async () => {
        const b = currentBuild(); if (!b) return;
        const name = await ask('Save my preset', 'Preset name', B.vibe + ' (mine)'); if (!name) return;
        addMine(name, 'Built sounds', b.fx, b.rev, b.dly); toast(`Saved "${name}".`); rerender();
      } }, 'Save as my preset')),
  );
}

// ---------- Beat maker effects (per instrument or drum row) ----------
const BEAT_RECIPES = [
  { name: 'Breakcore crunch', what: 'Smashed, distorted, crunchy drums.', fx: [['comp', { thresh: -30, ratio: 8, makeup: 8, attack: 0.002 }], ['dist', { drive: 0.55, tone: 5000, mix: 0.45 }], ['bitcrush', { bits: 8, tone: 9000, mix: 0.3 }], ['limiter', { ceiling: -1, drive: 3 }]] },
  { name: 'Jungle break', what: 'Punchy, gritty old-school break sound.', fx: [['eq', { lowcut: 40, body: 2, presence: 3, air: 2 }], ['comp', { thresh: -24, ratio: 5, makeup: 6, attack: 0.003 }], ['sat', { drive: 0.5 }]] },
  { name: 'Stutter', what: 'Fast on and off chop.', fx: [['tremolo', { rate: 12, depth: 1, shape: 1 }]] },
  { name: 'Heavenly wash', what: 'Huge dreamy space for pads, bells and choirs.', fx: [['chorus', { rate: 0.4, depth: 0.5, mix: 0.35 }], ['delay', { time: 0.42, feedback: 0.45, tone: 6000, mix: 0.25 }], ['room', { size: 5.5, tone: 10000, mix: 0.5 }]] },
  { name: 'Dub echo', what: 'Long repeating echo, great on snares and stabs.', fx: [['delay', { time: 0.35, feedback: 0.7, tone: 1800, mix: 0.35 }]] },
  { name: 'Lo-fi tape', what: 'Warm, wobbly and dusty.', fx: [['sat', { drive: 0.5 }], ['vibrato', { rate: 0.7, depth: 0.2 }], ['bitcrush', { bits: 10, tone: 6000, mix: 0.3 }]] },
  { name: 'Reese wobble', what: 'Moving filter for dark basses.', fx: [['autowah', { rate: 0.5, freq: 400, depth: 0.7, q: 4, mix: 0.7 }], ['dist', { drive: 0.3, tone: 2500, mix: 0.3 }]] },
  { name: 'Glitch', what: 'Broken digital stutter.', fx: [['tremolo', { rate: 16, depth: 1, shape: 1 }], ['bitcrush', { bits: 5, tone: 8000, mix: 0.5 }]] },
];
export function beatFxPanel(t, rr) {
  t.fx ||= [];
  const add = type => { snapshot(); t.fx.push(newFx(type)); save(); applyMix(); rr(); toast(`${FX[type].name} added to ${t.name}.`); };
  return el('div', { class: 'beatfx fxtab' },
    el('div', { class: 'fxtop' }, el('b', {}, `Effects on ${t.name}`), helpBtn('beatFx'), el('span', { class: 'spacer' }),
      t.fx.length ? el('button', { onclick: () => { snapshot(); t.fx = []; save(); applyMix(); rr(); } }, 'Remove all') : null),
    el('div', { class: 'explain' }, 'Effects change how this track sounds. Click one to add it, then turn its knobs. Drag a knob up or down. Double-click a knob to reset it. Hover an effect to see what it does.'),
    el('div', { class: 'recipes' }, el('span', { class: 'hint' }, 'Quick sounds:'), BEAT_RECIPES.map(r => el('button', { class: 'recipe', title: r.what, onclick: () => {
      snapshot(); for (const [type, params] of r.fx) t.fx.push(newFx(type, params)); save(); applyMix(); rr(); toast(`${r.name} added to ${t.name}. Turn the knobs below to change it.`);
    } }, r.name)), helpBtn('beatRecipes')),
    el('div', { class: 'fxlib' }, BEAT_FX.map(type => el('button', { class: 'chip', title: (HELP['fx_' + type] || {}).what || FX[type].group, onclick: () => add(type) }, '+ ' + FX[type].name))),
    t.fx.length ? el('div', { class: 'fxchain' }, t.fx.map((f, i) => fxCard(t, f, i, rr))) : el('p', { class: 'hint' }, 'No effects yet. Click one above. Each one gets its own knobs.'));
}
