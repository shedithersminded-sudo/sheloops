// Full studio side browser (folders of everything you have) and a mixer strip under the timeline.
import { el, toast, clamp } from './util.js';
import { app, save, selTrack, openProject, flush } from './state.js';
import { db, settings, saveSettings } from './store.js';
import { SOUNDS, loadSounds, playSound, stopSound } from './library.js';
import { applyMix } from './engine.js';

const fmtDur = s => s ? (s < 60 ? s.toFixed(1) + 's' : Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0')) : '';
const openSet = () => (settings.brOpen ||= { song: true, rec: true, sounds: true });

// one row you can preview, drag onto the timeline, or double click to add
function item(name, sub, id, onAdd, cls = '') {
  return el('div', { class: 'bitem ' + cls, draggable: 'true', title: 'Drag onto the timeline, or double click to add at the playhead',
    ondragstart: e => { e.dataTransfer.setData('loopden/sound', id); e.dataTransfer.effectAllowed = 'copy'; },
    ondblclick: onAdd },
    el('button', { class: 'bplay', title: 'Listen', onclick: e => { e.stopPropagation(); playSound(id); } }, '▶'),
    el('span', { class: 'bname' }, name), sub ? el('small', {}, sub) : null);
}
function folder(key, icon, name, count, kids, depth = 0) {
  const O = openSet(), open = O[key] ?? false;
  const d = el('details', { class: 'bfolder d' + depth, open, ontoggle: () => { O[key] = d.open; saveSettings(); } },
    el('summary', {}, el('span', { class: 'bic' }, icon), el('b', {}, name), el('small', { class: 'bcount' }, count)),
    el('div', { class: 'bkids' }, ...(kids.length ? kids : [el('small', { class: 'bempty' }, 'Nothing here yet')])));
  return d;
}

export function browserPanel(ctx) {
  const shown = settings.showBrowser !== false;
  const box = el('aside', { class: 'sbrowser panel' + (shown ? '' : ' shut') });
  if (!shown) {
    box.append(el('button', { class: 'brail', title: 'Show the browser', onclick: () => { settings.showBrowser = true; saveSettings(); ctx.rerender(); } }, el('span', {}, 'Browser')));
    return box;
  }
  let q = '';
  const list = el('div', { class: 'blist' });
  const add = id => () => { const s = selTrack(); ctx.addSound(id, s && s.kind === 'file' ? s : null, app.playhead); };
  const draw = async () => {
    await loadSounds();
    const projects = (await db.all('projects')).sort((a, b) => b.updated - a.updated);
    const P = app.P, m = n => !q || n.toLowerCase().includes(q);
    list.innerHTML = '';
    // this song: tracks and every take you recorded
    const tracks = P.tracks.filter(t => m(t.name)).map(t => el('button', { class: 'bitem btrack' + (P.sel === t.id ? ' on' : ''), style: `--c:${t.color}`, onclick: () => { P.sel = t.id; save(); ctx.rerender(); } },
      el('i', { class: 'bdot' }), el('span', { class: 'bname' }, t.name), el('small', {}, t.clips.length + ' clips')));
    const takes = P.tracks.flatMap(t => (t.takes || []).map(k => ({ t, k }))).filter(({ t }) => m(t.name)).reverse()
      .map(({ t, k }) => item(t.name + ' take ' + k.n, fmtDur(k.dur), k.audioId, add(k.audioId), 'btake'));
    list.append(folder('song', '♪', 'This song', P.tracks.length, tracks), folder('rec', '●', 'Recorded takes', takes.length, takes));
    // my sounds, by your own folders, plus favorites, loops and one-shots
    const S = SOUNDS.filter(s => m(s.name)), row = s => item(s.name, s.kind === 'loop' ? (s.bpm ? s.bpm + ' BPM' : 'loop') : fmtDur(s.dur), s.id, add(s.id));
    const groups = [...new Set(S.map(s => s.folder || 'Unsorted'))].sort();
    list.append(folder('sounds', '▤', 'My sounds', S.length, [
      folder('fav', '★', 'Favorites', S.filter(s => s.fav).length, S.filter(s => s.fav).map(row), 1),
      folder('loops', '∞', 'Loops', S.filter(s => s.kind === 'loop').length, S.filter(s => s.kind === 'loop').map(row), 1),
      folder('shots', '•', 'One-shots', S.filter(s => s.kind !== 'loop').length, S.filter(s => s.kind !== 'loop').map(row), 1),
      ...groups.map(g => folder('f:' + g, '▸', g, S.filter(s => (s.folder || 'Unsorted') === g).length, S.filter(s => (s.folder || 'Unsorted') === g).map(row), 1))]));
    // other songs
    const songs = projects.filter(p => m(p.name)).map(p => el('button', { class: 'bitem bsong' + (p.id === P.id ? ' on' : ''), title: p.id === P.id ? 'Open now' : 'Open this song',
      onclick: async () => { if (p.id === P.id) return; stopSound(); await flush(); await openProject(p); ctx.rerender(); toast('Opened ' + p.name + '.'); } },
      el('span', { class: 'bic' }, '♫'), el('span', { class: 'bname' }, p.name), el('small', {}, p.bpm ? p.bpm + ' BPM' : '')));
    list.append(folder('songs', '♫', 'My songs', songs.length, songs));
    list.append(el('div', { class: 'bshort' },
      el('button', { onclick: ctx.addBeat }, '+ Beat file'), el('button', { onclick: () => ctx.go('sounds') }, 'Add sounds'), el('button', { onclick: () => ctx.go('sampler') }, 'Sample a song')));
  };
  box.append(
    el('div', { class: 'bhead' }, el('b', {}, 'Browser'),
      el('button', { class: 'bclose', title: 'Hide the browser', onclick: () => { settings.showBrowser = false; saveSettings(); ctx.rerender(); } }, '‹')),
    el('input', { class: 'textin bsearch', placeholder: 'Search everything', oninput: e => { q = e.target.value.toLowerCase(); draw(); } }),
    list,
    el('small', { class: 'bhint' }, 'Drag anything onto the timeline. Double click adds it at the playhead.'));
  draw();
  return box;
}

// mixer strip: one channel per track, plus the built-in beat and the master
export function mixerStrip(ctx) {
  const P = app.P, shown = settings.showMixer !== false;
  const head = el('div', { class: 'mxhead' }, el('b', {}, 'Mixer'),
    el('button', { class: 'chip', onclick: () => { settings.showMixer = !shown; saveSettings(); ctx.rerender(); } }, shown ? 'Hide' : 'Show'));
  if (!shown) return el('div', { class: 'mixstrip panel shut' }, head);
  const ch = (name, color, obj, sel, onSel) => el('div', { class: 'mxch' + (sel ? ' on' : '') + (obj.mute ? ' muted' : ''), style: `--c:${color}` },
    el('button', { class: 'mxname', title: name, onclick: onSel }, name),
    el('div', { class: 'mxfader' }, el('input', { type: 'range', min: 0, max: 1.2, step: 0.01, value: obj.vol ?? 0.8, title: 'Volume',
      oninput: e => { obj.vol = +e.target.value; e.target.nextSibling.textContent = Math.round(obj.vol * 100) + '%'; applyMix(); }, onchange: () => { save(); ctx.lanes(); } }),
      el('small', {}, Math.round((obj.vol ?? 0.8) * 100) + '%')),
    'pan' in obj ? el('input', { class: 'mxpan', type: 'range', min: -1, max: 1, step: 0.05, value: obj.pan, title: 'Left or right (double click centers)',
      oninput: e => { obj.pan = clamp(+e.target.value, -1, 1); applyMix(); }, onchange: () => save(), ondblclick: e => { obj.pan = 0; e.target.value = 0; applyMix(); save(); } }) : el('i', { class: 'mxpan' }),
    el('div', { class: 'mxms' },
      el('button', { class: 'sq m' + (obj.mute ? ' on' : ''), title: 'Mute', onclick: () => { obj.mute = !obj.mute; applyMix(); save(); ctx.rerender(); } }, 'M'),
      el('button', { class: 'sq s' + (obj.solo ? ' on' : ''), title: 'Solo', onclick: () => { obj.solo = !obj.solo; applyMix(); save(); ctx.rerender(); } }, 'S')));
  const chans = [];
  if (P.beat && 'vol' in P.beat) chans.push(ch('Beat maker', 'var(--led)', P.beat, false, () => ctx.go('beat')));
  for (const t of P.tracks) chans.push(ch(t.name, t.color, t, P.sel === t.id, () => { P.sel = t.id; save(); ctx.rerender(); }));
  return el('div', { class: 'mixstrip panel' }, head, el('div', { class: 'mxrow' }, ...chans));
}
