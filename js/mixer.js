// Mixing console: one strip per track, groups (buses), master. Live meters.
import { $, el, uid, clamp, toast, ask, confirmBox, select, cssVar } from './util.js';
import { helpBtn } from './help.js';
import { app, save, snapshot, emit, nextColor } from './state.js';
import { settings, saveSettings } from './store.js';
import { applyMix, levelOf } from './engine.js';
import { fxTab, setRerender } from './fxui.js';

const TYPE = {
  vocal: ['Vocal', '#ff5ca8'], file: ['Beat file', '#ff6a1a'], beat: ['Beat maker', '#ffd23f'],
  drums: ['Drums', '#ffd23f'], synth: ['Instrument', '#3fd0ff'], bus: ['Group', '#b18cff'], master: ['Master', '#ffffff'],
};
const dbTxt = v => v <= 0.0001 ? '-inf' : (20 * Math.log10(v) > 0 ? '+' : '') + (20 * Math.log10(v)).toFixed(1);
let showParts = false, selBus = null;
const meters = [];

export function renderMixer() {
  const view = $('#view'); view.innerHTML = '';
  const P = app.P; P.buses ||= [];
  meters.length = 0;
  const strips = el('div', { class: 'mixstrips' });
  const outSel = obj => el('label', { class: 'knob adv' }, el('span', { class: 'lab' }, 'Out'),
    select([['', 'Master'], ...P.buses.map(b => [b.id, b.name])], obj.bus || '', v => { snapshot(); obj.bus = v || null; applyMix(); save(); }));

  for (const t of P.tracks) strips.append(strip(t, t.kind === 'file' ? 'file' : 'vocal', { out: outSel(t), fx: () => { P.sel = t.id; settings.inspTab = 'fx'; saveSettings(); emit('goto:studio'); } }));
  strips.append(strip(P.beat, 'beat', { name: 'Beat maker', out: outSel(P.beat), fx: () => emit('goto:beat'), extra: el('button', { class: 'tiny', onclick: () => { showParts = !showParts; renderMixer(); } }, showParts ? 'Hide parts' : 'Show parts') }));
  if (showParts) for (const t of P.beat.tracks) strips.append(strip(t, t.type, { part: true }));
  for (const b of P.buses) strips.append(strip(b, 'bus', { fx: () => { selBus = b.id; renderMixPanel(); }, del: async () => {
    if (!await confirmBox('Delete group', `Delete group "${b.name}"? Its tracks go straight to the master.`, 'Delete')) return;
    snapshot(); P.buses = P.buses.filter(x => x !== b);
    for (const t of [...P.tracks, P.beat]) if (t.bus === b.id) t.bus = null;
    if (selBus === b.id) selBus = null; applyMix(); save(); renderMixer();
  } }));
  strips.append(masterStrip());

  view.append(el('div', { class: 'mixer' },
    el('div', { class: 'panel toolbar' },
      el('b', { class: 'section-title' }, 'Mixer'), helpBtn('mixer'),
      el('span', { class: 'legend' }, Object.entries(TYPE).filter(([k]) => k !== 'master' && k !== 'drums').map(([, [n, c]]) => el('span', { style: `--c:${c}` }, n))),
      el('span', { class: 'spacer' }),
      el('span', { class: 'withhelp adv' }, el('button', { onclick: addGroup }, '+ Group'), helpBtn('groups')),
      el('button', { class: 'hot', onclick: () => emit('goto:master') }, 'Mastering')),
    strips,
    el('div', { id: 'mixpanel', class: 'panel mixpanel' })));
  renderMixPanel();
}
async function addGroup() {
  const name = await ask('New group', 'Group name (for example Vocals or Backing vocals)', 'Vocals'); if (!name) return;
  snapshot();
  const b = { id: uid(), name, color: '#b18cff', vol: 0.9, pan: 0, mute: false, rev: 0, dly: 0, fx: [] };
  app.P.buses.push(b); selBus = b.id; applyMix(); save(); renderMixer();
  toast(`Group "${name}" added. Set a track's Out to "${name}" to send it there.`);
}

function strip(t, type, o = {}) {
  const [label, color] = TYPE[type];
  const cv = el('canvas', { class: 'vmeter', width: 10, height: 170 });
  meters.push({ cv, id: type === 'beat' ? 'beat' : t.id, peak: 0 });
  const dbEl = el('span', { class: 'dbv' }, dbTxt(t.vol));
  const fader = el('input', { type: 'range', class: 'vfader', min: 0, max: 1.5, step: 0.01, value: t.vol, title: 'Volume',
    oninput: e => { t.vol = +e.target.value; dbEl.textContent = dbTxt(t.vol); applyMix(); save(); }, ondblclick: e => { t.vol = 0.8; e.target.value = 0.8; dbEl.textContent = dbTxt(0.8); applyMix(); save(); } });
  const mini = (lab, k, min, max) => el('label', { class: 'mini' }, lab,
    el('input', { type: 'range', min, max, step: 0.01, value: t[k] || 0, oninput: e => { t[k] = +e.target.value; applyMix(); save(); } }));
  const fxCount = (t.fx || []).filter(f => f.on).length;
  return el('div', { class: 'vstrip' + (o.part ? ' part' : '') + (type === 'bus' && selBus === t.id ? ' sel' : ''), style: `--c:${color}` },
    el('div', { class: 'stype' }, label),
    type === 'beat' || o.part ? el('b', { class: 'sname' }, o.name || t.name)
      : el('input', { class: 'sname tname', value: t.name, spellcheck: 'false', onchange: e => { snapshot(); t.name = e.target.value; save(); } }),
    o.fx ? el('button', { class: 'tiny', onclick: o.fx }, type === 'beat' ? 'Edit beat' : `FX ${fxCount || ''}`) : el('span', { class: 'tiny ph' }),
    el('div', { class: 'sends adv' }, mini('Rev', 'rev', 0, 1), mini('Dly', 'dly', 0, 1)),
    el('label', { class: 'mini' }, 'Pan', el('input', { type: 'range', min: -1, max: 1, step: 0.01, value: t.pan || 0, oninput: e => { t.pan = +e.target.value; applyMix(); save(); }, ondblclick: e => { t.pan = 0; e.target.value = 0; applyMix(); save(); } })),
    el('div', { class: 'faderwrap' }, cv, fader),
    dbEl,
    el('div', { class: 'ms' },
      el('button', { class: 'sq m' + (t.mute ? ' on' : ''), onclick: () => { t.mute = !t.mute; applyMix(); save(); renderMixer(); } }, 'M'),
      type !== 'bus' ? el('button', { class: 'sq s' + (t.solo ? ' on' : ''), onclick: () => { t.solo = !t.solo; applyMix(); save(); renderMixer(); } }, 'S') : null,
      o.del ? el('button', { class: 'sq', title: 'Delete group', onclick: o.del }, '×') : null),
    o.out || null, o.extra || null);
}
function masterStrip() {
  const M = app.P.master;
  const cv = el('canvas', { class: 'vmeter', width: 10, height: 170 });
  meters.push({ cv, id: 'master', peak: 0 });
  const dbEl = el('span', { class: 'dbv' }, dbTxt(M.vol));
  return el('div', { class: 'vstrip master', style: '--c:#fff' },
    el('div', { class: 'stype' }, 'Master'), el('b', { class: 'sname' }, 'Master'),
    el('button', { class: 'tiny', onclick: () => emit('goto:master') }, 'Mastering'),
    el('div', { class: 'sends adv' }), el('span', { class: 'mini' }),
    el('div', { class: 'faderwrap' }, cv, el('input', { type: 'range', class: 'vfader', min: 0, max: 1.5, step: 0.01, value: M.vol, oninput: e => { M.vol = +e.target.value; dbEl.textContent = dbTxt(M.vol); applyMix(); save(); } })),
    dbEl, el('span', { class: 'hint small' }, 'Keep out of red'));
}

function renderMixPanel() {
  const box = $('#mixpanel'); if (!box) return;
  setRerender(renderMixPanel);
  box.innerHTML = '';
  const b = app.P.buses.find(x => x.id === selBus);
  if (!b) {
    box.append(el('p', { class: 'hint' }, settings.simple
      ? 'Drag a fader up or down to set each part\'s volume. Pink strips are vocals, orange are beats, yellow is your beat maker. Switch to Advanced mode for groups, routing and sends.'
      : 'Click FX on a group to edit its effects here. Groups let you control several tracks at once, for example all vocals.'));
    return;
  }
  box.append(el('div', { class: 'insp-title', style: '--c:#b18cff' }, el('b', {}, `Group: ${b.name}`),
    el('label', { class: 'mini' }, 'Rev', el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: b.rev || 0, oninput: e => { b.rev = +e.target.value; applyMix(); save(); } })),
    el('label', { class: 'mini' }, 'Dly', el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: b.dly || 0, oninput: e => { b.dly = +e.target.value; applyMix(); save(); } })),
    el('span', { class: 'spacer' }), el('button', { onclick: () => { selBus = null; renderMixer(); } }, 'Close')),
    fxTab(b));
}

export function drawMixerMeters() {
  if (!meters.length || !document.body.contains(meters[0].cv)) return;
  for (const m of meters) {
    const p = levelOf(m.id); m.peak = Math.max(p, m.peak * 0.93);
    const g = m.cv.getContext('2d'), W = m.cv.width, H = m.cv.height;
    g.fillStyle = cssVar('--well'); g.fillRect(0, 0, W, H);
    const db = m.peak > 0 ? 20 * Math.log10(m.peak) : -100, f = clamp((db + 48) / 48, 0, 1), h = Math.round(H * f);
    const grd = g.createLinearGradient(0, H, 0, 0); grd.addColorStop(0, '#4cd964'); grd.addColorStop(0.75, '#ffd23f'); grd.addColorStop(0.95, '#ff3b3b');
    g.fillStyle = grd; g.fillRect(0, H - h, W, h);
  }
}
