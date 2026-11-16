// Recording studio: song timeline, tracks, clips, takes.
import { $, el, uid, clamp, pct, panFmt, fmtTime, toast, knob, toggle, download, safeName, confirmBox, modal, cssVar } from './util.js';
import { helpBtn } from './help.js';
import { app, barDur, songEnd, selTrack, save, snapshot, undo, redo, emit, newVocalTrack } from './state.js';
import { settings, saveSettings, saveAudio, saveAudioFile, audioCache } from './store.js';
import { fxTab, presetsTab, buildTab, previewBar, setRerender, addFx } from './fxui.js';
import { arrSlots, arrGet, arrCycle } from './beat.js';
import { fixTab } from './fixvoice.js';
import { look, arrangeToolbar, inspectorGrip } from './look.js';
import { SOUNDS, loadSounds, soundBuffer, detectBpm, playSound } from './library.js';
import { E, T, ensureCtx, play, stop, refresh, currentPos, startRecord, recState, recElapsed, applyMix, updateMonitor, peakOf, renderSong, encodeWav, openMic } from './engine.js';

const HEAD_W = 210, ROW_H = 84, BEAT_H = 46;
const pps = () => settings.zoom * app.P.bpm / 60; // pixels per second (zoom = px per beat)
const beatSec = () => 60 / app.P.bpm;
const snapT = (t, e) => (settings.snap && !(e && e.altKey)) ? Math.round(t / beatSec()) * beatSec() : t;

let root, scroller, inner, ph, rangeEl, timeEl, barEl, recTimeEl, meterCv, clipLed;
let clipLatched = false;

// ---------- data helpers ----------
export function carve(t, a, b) {
  const out = [];
  for (const c of t.clips) {
    const cs = c.start, ce = c.start + c.dur;
    if (ce <= a || cs >= b) { out.push(c); continue; }
    if (cs < a) out.push({ ...c, id: uid(), dur: a - cs });
    if (ce > b) out.push({ ...c, id: uid(), start: b, offset: c.offset + (b - cs), dur: ce - b });
  }
  t.clips = out;
}
const findClip = () => {
  if (!app.clip) return null;
  const t = app.P.tracks.find(x => x.id === app.clip.trackId);
  const c = t && t.clips.find(x => x.id === app.clip.clipId);
  return c ? { t, c } : null;
};
function recordTarget() {
  let t = selTrack();
  if (t && t.kind !== 'file') return t;
  t = app.P.tracks.find(x => x.kind !== 'file');
  if (!t) { t = newVocalTrack('Vocal ' + (app.P.tracks.length + 1)); app.P.tracks.push(t); }
  app.P.sel = t.id;
  return t;
}

E.onRecorded = async ({ trackId, buf, from, to }) => {
  const t = app.P.tracks.find(x => x.id === trackId); if (!t) return;
  snapshot();
  const audioId = uid();
  await saveAudio(audioId, buf);
  carve(t, from, to);
  t.clips.push({ id: uid(), audioId, start: from, offset: 0, dur: to - from });
  t.takes.push({ id: uid(), audioId, start: from, dur: to - from, at: Date.now(), n: t.takes.length + 1 });
  if (to > songEnd()) app.P.lengthBars = Math.ceil(to / barDur()) + 1;
  save(); renderStudio();
  toast(`Take ${t.takes.length} saved.`);
};

export async function importBeatFile(file, at = 0) {
  if (!file || !/^audio\//.test(file.type) && !/\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i.test(file.name)) { toast('That is not an audio file.'); return false; }
  toast('Loading ' + file.name + '...');
  try {
    const c = await ensureCtx();
    const buf = await c.decodeAudioData(await file.arrayBuffer());
    snapshot();
    const audioId = uid();
    await saveAudioFile(audioId, file, buf);
    const t = newVocalTrack('Beat: ' + file.name.replace(/\.[^.]+$/, ''));
    Object.assign(t, { kind: 'file', rev: 0, dly: 0, vol: 0.8 });
    t.clips.push({ id: uid(), audioId, start: at, offset: 0, dur: buf.duration });
    app.P.tracks.unshift(t);
    const needBars = Math.ceil((at + buf.duration) / barDur());
    if (needBars > app.P.lengthBars) app.P.lengthBars = needBars;
    let msg = 'Beat added.';
    const det = detectBpm(buf);
    const hasVocals = app.P.tracks.some(x => x.kind !== 'file' && x.clips.length);
    if (det && !hasVocals) { app.P.bpm = det.bpm; app.P.lengthBars = Math.max(app.P.lengthBars, Math.ceil((at + buf.duration) / barDur())); msg +=` Tempo detected: ${det.bpm} BPM (set for you). Change it if the click feels off.`; }
    else if (det) msg += ` Tempo detected: about ${det.bpm} BPM. Your BPM is ${app.P.bpm}.`;
    else msg += ' Set the BPM to match it so the metronome and grid line up.';
    if (!app.P.beat.mute) { app.P.beat.mute = true; msg = 'Beat added. The built-in beat is muted. ' + msg; }
    if (!selTrack() || selTrack().kind === 'file') recordTarget();
    applyMix(); save(); renderStudio(); refresh();
    toast(msg);
    return true;
  } catch { toast('Could not read that file.'); return false; }
}

// ---------- edit commands ----------
export const edit = {
  split() {
    const f = findClip(); const p = app.playhead;
    if (!f) return toast('Click a clip first.');
    const { t, c } = f;
    if (p <= c.start + 0.01 || p >= c.start + c.dur - 0.01) return toast('Put the playhead inside the clip.');
    snapshot();
    const right = { ...c, id: uid(), start: p, offset: c.offset + (p - c.start), dur: c.start + c.dur - p };
    c.dur = p - c.start;
    t.clips.push(right); app.clip = { trackId: t.id, clipId: right.id };
    save(); renderLanes(); refresh();
  },
  copy() { const f = findClip(); if (!f) return toast('Click a clip first.'); app.clipboard = { ...f.c }; toast('Copied.'); },
  cut() { if (!findClip()) return toast('Click a clip first.'); this.copy(); this.del(); },
  paste() {
    if (!app.clipboard) return toast('Copy a clip first.');
    const t = selTrack(); if (!t) return toast('Select a track first.');
    snapshot();
    const c = { ...app.clipboard, id: uid(), start: app.playhead };
    carve(t, c.start, c.start + c.dur); t.clips.push(c);
    app.clip = { trackId: t.id, clipId: c.id };
    save(); renderLanes(); refresh();
  },
  del() {
    const f = findClip(); if (!f) return toast('Click a clip first.');
    snapshot(); f.t.clips = f.t.clips.filter(x => x !== f.c); app.clip = null;
    save(); renderLanes(); refresh();
  },
  undo() { if (!undo()) toast('Nothing to undo.'); else refresh(); },
  redo() { if (!redo()) toast('Nothing to redo.'); else refresh(); },
};

export async function record() {
  if (recState()) { stop(); return; }
  const t = recordTarget();
  renderStudio();
  try { await startRecord(t); }
  catch (e) { toast('No mic access. Allow the mic in your browser, or open Mic setup.'); }
}
export function seek(pos) {
  pos = clamp(pos, 0, songEnd());
  if (T.playing && !recState()) { play(pos); }
  else app.playhead = pos;
  updatePlayhead();
}

// ---------- render ----------
// plain words shown in Simple mode under the inspector tabs
const TAB_EXPLAIN = {
  mix: 'Set how loud this track is, move it left or right, and pick which recording (take) to use. Record again and every take is kept here.',
  fix: 'Click Check my voice. SHELOOPS listens to your recording and tells you what to fix, like noise, harsh S sounds or a quiet take. One click fixes each problem.',
  presets: 'Make your voice sound finished. 1: pick one Vocal style. 2: add Enhance to polish it. 3: add Voice FX for fun or creative sounds. Everything you add shows up in the Sound stack, where you can turn it off, open its knobs, or take it off.',
  fx: 'Every effect on this track, in order. Turn the knobs to change the sound.',
  build: 'Pick a vibe, then shape it with four big knobs.',
};
export function renderStudio() {
  setRerender(() => renderInspector());
  const view = $('#view'); view.innerHTML = '';
  const P = app.P;
  root = el('div', { class: 'studio' });
  timeEl = el('span', { class: 'big' }); barEl = el('small'); recTimeEl = el('small', { class: 'rectime' });
  meterCv = el('canvas', { class: 'inmeter', width: 120, height: 10, title: 'Mic level' });
  clipLed = el('span', { class: 'led', title: 'Red means your mic was too loud (clipping). Click to reset.', onclick: () => { clipLatched = false; clipLed.classList.remove('on'); } });

  const tb = el('div', { class: 'panel toolbar' },
    el('button', { class: 'tbtn', title: 'Back to start (Home)', onclick: () => seek(0) }, '|<'),
    el('span', { class: 'withhelp' }, el('button', { id: 'playbtn', class: 'tbtn', onclick: () => T.playing ? stop() : play() }, 'Play'), helpBtn('play')),
    el('span', { class: 'withhelp' }, el('button', { id: 'recbtn', class: 'tbtn recbig', onclick: record }, 'Record'), helpBtn('record')),
    el('div', { class: 'lcd' }, timeEl, barEl, recTimeEl),
    el('label', { class: 'num' }, 'BPM', el('input', { type: 'number', min: 40, max: 300, value: P.bpm, onchange: e => { snapshot(); P.bpm = clamp(+e.target.value || 90, 40, 300); e.target.value = P.bpm; applyMix(); save(); renderStudio(); refresh(); } }), helpBtn('bpm')),
    toggle('Click', settings.metro, v => { settings.metro = v; saveSettings(); }, 'metro'),
    toggle('Count in', settings.countIn, v => { settings.countIn = v; saveSettings(); }, 'countin'),
    toggle('Loop', P.loop, v => { P.loop = v; save(); refresh(); renderRange(); }, 'loop'),
    toggle('Punch', P.punch, v => { P.punch = v; save(); renderRange(); }, 'punch'),
    toggle('Monitor', settings.monitor, async v => { settings.monitor = v; saveSettings(); if (v) { try { await openMic(); } catch { toast('No mic access.'); } } updateMonitor(); if (v) toast('Use headphones while monitoring, or you will get feedback.'); }, 'monitor'),
    el('span', { class: 'withhelp meterwrap' }, meterCv, clipLed, helpBtn('clipping')),
    el('span', { class: 'withhelp adv' }, toggle('Automation', !!settings.showAuto, v => { settings.showAuto = v; saveSettings(); renderLanes(); }), helpBtn('automation')),
  );
  ['tostart', 'play', 'record', 'lcd', 'bpm', 'click', 'countin', 'loop', 'punch', 'monitor', 'meter', 'automation'].forEach((k, i) => { if (tb.children[i]) tb.children[i].dataset.k = k; });
  arrangeToolbar(tb);
  const fileIn = el('input', { type: 'file', accept: 'audio/*', hidden: true, onchange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) importBeatFile(f); } });
  const eb = el('div', { class: 'panel editbar' },
    el('button', { class: 'hot', onclick: () => fileIn.click(), title: 'Or drag an audio file onto the timeline' }, 'Add my beat file'), fileIn,
    el('button', { onclick: () => { snapshot(); const t = newVocalTrack('Vocal ' + (P.tracks.length + 1)); P.tracks.push(t); P.sel = t.id; save(); renderStudio(); } }, '+ Vocal track'),
    el('span', { class: 'withhelp' }, el('button', { onclick: soundPicker }, 'Add from my sounds'), helpBtn('library')),
    el('span', { class: 'sep' }),
    el('button', { onclick: () => edit.split(), title: 'S' }, 'Split'),
    el('button', { onclick: () => edit.cut(), title: 'Ctrl+X' }, 'Cut'),
    el('button', { onclick: () => edit.copy(), title: 'Ctrl+C' }, 'Copy'),
    el('button', { onclick: () => edit.paste(), title: 'Ctrl+V' }, 'Paste'),
    el('button', { onclick: () => edit.del(), title: 'Delete' }, 'Delete'),
    el('button', { onclick: () => edit.undo(), title: 'Ctrl+Z' }, 'Undo'),
    el('button', { onclick: () => edit.redo(), title: 'Ctrl+Y' }, 'Redo'),
    helpBtn('edit'),
    el('span', { class: 'sep' }),
    el('span', { class: 'adv withhelp' }, toggle('Snap', settings.snap, v => { settings.snap = v; saveSettings(); }), helpBtn('snap')),
    el('span', { class: 'withhelp' }, el('button', { onclick: () => zoom(1 / 1.4) }, '-'), el('button', { onclick: () => zoom(1.4) }, '+'), helpBtn('zoom')),
    el('label', { class: 'num adv' }, 'Bars', el('input', { type: 'number', min: 4, max: 400, value: P.lengthBars, onchange: e => { snapshot(); P.lengthBars = clamp(+e.target.value || 32, 4, 400); save(); renderLanes(); } }), helpBtn('songLength')),
    el('span', { class: 'spacer' }),
    el('span', { class: 'withhelp' }, el('button', { onclick: exportSong }, 'Export song'), helpBtn('exportSong')),
    el('span', { class: 'withhelp adv' }, el('button', { onclick: exportStems }, 'Export tracks'), helpBtn('exportStems')),
  );
  scroller = el('div', { class: 'tl-scroll' });
  const insp = el('div', { class: 'panel inspector', id: 'inspector' });
  root.append(tb, eb, scroller, insp);
  view.append(root);

  // drag and drop beat files
  root.addEventListener('dragover', e => {
    const types = e.dataTransfer.types;
    if (types.includes('loopden/sound')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; return; }
    if (types.includes('loopden/fx')) { const row = e.target.closest('[data-track]'); if (row) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } return; }
    if (types.includes('Files')) { e.preventDefault(); root.classList.add('dropping'); }
  });
  root.addEventListener('dragleave', e => { if (e.target === root || !root.contains(e.relatedTarget)) root.classList.remove('dropping'); });
  root.addEventListener('drop', async e => {
    e.preventDefault(); root.classList.remove('dropping');
    const fxType = e.dataTransfer.getData('loopden/fx');
    const sid = e.dataTransfer.getData('loopden/sound');
    if (sid) { const row = e.target.closest('[data-track]'); const lane = e.target.closest('.lane'); let at = app.playhead;
      if (lane) at = Math.max(0, snapT((e.clientX - lane.getBoundingClientRect().left) / pps()));
      await addSoundClip(sid, row && P.tracks.find(x => x.id === row.dataset.track), at); return; }
    if (fxType) {
      const row = e.target.closest('[data-track]'); const t = row && P.tracks.find(x => x.id === row.dataset.track);
      if (t) { P.sel = t.id; addFx(t, fxType); renderLanes(); }
      return;
    }
    const lane = e.target.closest('.lane');
    let at = 0;
    if (lane) { const x = e.clientX - lane.getBoundingClientRect().left; at = Math.max(0, Math.round(x / pps() / barDur()) * barDur()); }
    for (const f of e.dataTransfer.files) await importBeatFile(f, at);
  });

  renderLanes();
  renderInspector();
  updateTransport();
}

function zoom(f) {
  const center = app.playhead;
  settings.zoom = clamp(settings.zoom * f, 6, 400); saveSettings();
  renderLanes();
  scroller.scrollLeft = center * pps() - scroller.clientWidth / 2;
}

export function renderLanes() {
  if (!scroller || !document.body.contains(scroller)) return;
  const P = app.P, W = Math.ceil(songEnd() * pps()) + 200, sl = scroller.scrollLeft, st = scroller.scrollTop;
  const beatPx = settings.zoom, barPx = beatPx * 4;
  scroller.innerHTML = '';
  inner = el('div', { class: 'tl-inner', style: `width:${W + HEAD_W}px;--beat:${beatPx}px;--bar:${barPx}px` });

  // ruler + range strip
  const ruler = el('div', { class: 'lane ruler' });
  const step = barPx < 30 ? 4 : barPx < 60 ? 2 : 1;
  for (let b = 0; b < P.lengthBars; b += step) ruler.append(el('span', { class: 'barnum', style: `left:${b * barPx}px` }, b + 1));
  ruler.addEventListener('pointerdown', e => {
    const r = ruler.getBoundingClientRect();
    const set = ev => seek((ev.clientX - r.left) / pps());
    set(e); ruler.setPointerCapture(e.pointerId);
    ruler.onpointermove = ev => { if (ev.buttons) { app.playhead = clamp((ev.clientX - r.left) / pps(), 0, songEnd()); updatePlayhead(); } };
    ruler.onpointerup = ev => { ruler.onpointermove = null; set(ev); };
  });
  const strip = el('div', { class: 'lane rangestrip', title: 'Drag here to set the loop and punch range' });
  rangeEl = el('div', { class: 'range' });
  strip.addEventListener('pointerdown', e => {
    const r = strip.getBoundingClientRect(), a = snapT((e.clientX - r.left) / pps(), e);
    strip.setPointerCapture(e.pointerId); snapshot();
    strip.onpointermove = ev => { const b = snapT((ev.clientX - r.left) / pps(), ev); P.range = { start: Math.max(0, Math.min(a, b)), end: Math.max(a, b) }; renderRange(); };
    strip.onpointerup = () => { strip.onpointermove = null; save(); refresh(); };
  });
  inner.append(
    el('div', { class: 'row sticky-top' }, el('div', { class: 'head corner' }, el('span', { class: 'hint' }, 'Drop beat files here')), ruler),
    el('div', { class: 'row sticky-top2' }, el('div', { class: 'head corner small' }, 'Loop / punch range'), strip),
  );

  // beat maker row
  const B = P.beat, loopPx = B.bars * barPx;
  const beatHead = el('div', { class: 'head' + (P.sel === 'beat' ? ' sel' : ''), style: '--c:#888' },
    el('div', { class: 'hrow1' }, el('b', {}, 'Beat maker'), helpBtn('beatTrack'),
      el('button', { class: 'sq m' + (B.mute ? ' on' : ''), onclick: () => { B.mute = !B.mute; applyMix(); save(); renderLanes(); } }, 'M'),
      el('button', { class: 'sq s' + (B.solo ? ' on' : ''), onclick: () => { B.solo = !B.solo; applyMix(); save(); renderLanes(); } }, 'S')),
    knob('Vol', 0, 1.2, 0.01, B.vol, v => { B.vol = v; applyMix(); save(); }, pct),
  );
  beatHead.addEventListener('pointerdown', e => { if (!e.target.closest('input,button')) selectTrack('beat'); });
  const blane = el('div', { class: 'lane beatlane' + (B.mute ? ' muted' : ''), onpointerdown: e => { if (!e.target.closest('.slotblk')) laneDown(e, null); } });
  for (let i = 0, n = arrSlots(); i < n; i++) {
    const p = arrGet(i);
    blane.append(el('button', { class: 'slotblk' + (p ? '' : ' off'), style: `left:${i * loopPx}px;width:${loopPx - 2}px`, title: 'Beat pattern here. Click to change, right-click for silence.',
      onclick: () => { arrCycle(i); renderLanes(); }, oncontextmenu: e => { e.preventDefault(); arrCycle(i, true); renderLanes(); } }, p || '-'));
  }
  inner.append(el('div', { class: 'row', style: `height:${BEAT_H}px` }, beatHead, blane));

  // audio tracks
  for (const t of P.tracks) {
    const head = el('div', { class: 'head' + (P.sel === t.id ? ' sel' : ''), style: `--c:${t.color}` },
      el('div', { class: 'hrow1' },
        el('input', { class: 'tname', value: t.name, spellcheck: 'false', onchange: e => { snapshot(); t.name = e.target.value; save(); renderInspector(); } }),
        el('button', { class: 'sq m' + (t.mute ? ' on' : ''), title: 'Mute', onclick: () => { t.mute = !t.mute; applyMix(); save(); renderLanes(); } }, 'M'),
        el('button', { class: 'sq s' + (t.solo ? ' on' : ''), title: 'Solo', onclick: () => { t.solo = !t.solo; applyMix(); save(); renderLanes(); } }, 'S'),
        el('button', { class: 'sq', title: 'Delete track', onclick: () => deleteTrack(t) }, '×')),
      el('div', { class: 'hrow2' },
        el('span', { class: 'tag' + (t.kind === 'file' ? '' : ' rec') }, t.kind === 'file' ? 'beat file' : (P.sel === t.id ? '● record here' : 'vocal'),
          (t.fx || []).filter(f => f.on).length ? el('span', { class: 'fxbadge', title: 'Effects on this track' }, ' FX ' + t.fx.filter(f => f.on).length) : null),
        knob('Vol', 0, 1.2, 0.01, t.vol, v => { t.vol = v; applyMix(); save(); }, pct)),
    );
    head.addEventListener('pointerdown', e => { if (!e.target.closest('input,button')) selectTrack(t.id); });
    const lane = el('div', { class: 'lane', onpointerdown: e => laneDown(e, t) });
    for (const c of t.clips) lane.append(clipEl(t, c));
    if (settings.showAuto && !settings.simple) lane.append(autoLane(t, Math.ceil(songEnd() * pps()) + 200));
    inner.append(el('div', { class: 'row', 'data-track': t.id, style: `height:${ROW_H}px` }, head, lane));
  }
  inner.append(el('div', { class: 'row filler' }, el('div', { class: 'head corner' },
    el('button', { onclick: () => { snapshot(); const t = newVocalTrack('Vocal ' + (P.tracks.length + 1)); P.tracks.push(t); P.sel = t.id; save(); renderStudio(); } }, '+ Vocal track')),
    el('div', { class: 'lane', onpointerdown: e => laneDown(e, null) })));

  ph = el('div', { class: 'playhead' });
  const ov = el('div', { class: 'overlay', style: `left:${HEAD_W}px` }, rangeEl, ph);
  inner.append(ov);
  scroller.append(inner);
  scroller.scrollLeft = sl; scroller.scrollTop = st;
  renderRange(); updatePlayhead();
}

function renderRange() {
  if (!rangeEl) return;
  const P = app.P, on = P.loop || P.punch;
  rangeEl.style.left = P.range.start * pps() + 'px';
  rangeEl.style.width = Math.max(0, (P.range.end - P.range.start) * pps()) + 'px';
  rangeEl.className = 'range' + (P.punch ? ' punch' : on ? ' loop' : '');
}

function laneDown(e, t) {
  if (e.target.closest('.clip')) return;
  const r = e.currentTarget.getBoundingClientRect();
  app.clip = null;
  if (t) selectTrack(t.id, true);
  seek((e.clientX - r.left) / pps());
  $$clips().forEach(x => x.classList.remove('sel'));
}
const $$clips = () => [...inner.querySelectorAll('.clip')];

function clipEl(t, c) {
  const W = c.dur * pps();
  const d = el('div', { class: 'clip' + (app.clip && app.clip.clipId === c.id ? ' sel' : ''), style: `left:${c.start * pps()}px;width:${W}px;--c:${t.color}` });
  const cv = el('canvas', { width: Math.max(1, Math.min(Math.round(W), 8000)), height: ROW_H - 14 });
  d.append(cv, el('span', { class: 'clipname' }, t.kind === 'file' ? t.name.replace(/^Beat: /, '') : 'Take ' + ((t.takes.find(k => k.audioId === c.audioId) || {}).n || '')));
  drawWave(cv, audioCache.get(c.audioId), c.offset, c.dur, look.wave || t.color);
  d.addEventListener('pointerdown', e => clipDown(e, t, c, d));
  d.addEventListener('pointermove', e => { if (e.buttons) return; const x = e.offsetX; d.style.cursor = (x < 7 || x > d.clientWidth - 7) ? 'ew-resize' : 'grab'; });
  return d;
}
function drawWave(cv, buf, off, dur, color) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  if (!buf) { g.fillStyle = '#fff4'; g.fillText('missing audio', 6, 14); return; }
  const d = buf.getChannelData(0), sr = buf.sampleRate, a0 = off * sr, per = dur * sr / W;
  g.fillStyle = color;
  const stride = Math.max(1, Math.floor(per / 64));
  for (let x = 0; x < W; x++) {
    let mx = 0; const a = Math.floor(a0 + x * per), b = Math.min(d.length, Math.floor(a0 + (x + 1) * per));
    for (let i = a; i < b; i += stride) { const v = Math.abs(d[i]); if (v > mx) mx = v; }
    const h = Math.max(1, Math.min(1, mx) * H * 0.92); g.fillRect(x, (H - h) / 2, 1, h);
  }
}
function clipDown(e, t, c, d) {
  e.stopPropagation();
  app.clip = { trackId: t.id, clipId: c.id };
  $$clips().forEach(x => x.classList.toggle('sel', x === d));
  if (app.P.sel !== t.id) selectTrack(t.id, true);
  const x = e.offsetX, mode = x < 7 ? 'l' : x > d.clientWidth - 7 ? 'r' : 'm';
  const o = { ...c }, x0 = e.clientX, buf = audioCache.get(c.audioId), maxLen = buf ? buf.duration : c.offset + c.dur;
  let moved = false;
  d.setPointerCapture(e.pointerId);
  d.onpointermove = ev => {
    const dt = (ev.clientX - x0) / pps();
    if (!moved && Math.abs(ev.clientX - x0) < 3) return;
    if (!moved) { snapshot(); moved = true; }
    if (mode === 'm') c.start = Math.max(0, snapT(o.start + dt, ev));
    else if (mode === 'l') {
      const ns = clamp(snapT(o.start + dt, ev), Math.max(0, o.start - o.offset), o.start + o.dur - 0.05);
      c.offset = o.offset + (ns - o.start); c.dur = o.dur - (ns - o.start); c.start = ns;
    } else {
      const ne = clamp(snapT(o.start + o.dur + dt, ev), o.start + 0.05, o.start + (maxLen - o.offset));
      c.dur = ne - o.start;
    }
    d.style.left = c.start * pps() + 'px'; d.style.width = c.dur * pps() + 'px';
  };
  d.onpointerup = () => { d.onpointermove = null; if (moved) { save(); renderLanes(); refresh(); } };
}

function selectTrack(id, quiet) {
  if (app.P.sel === id) return;
  app.P.sel = id; save(); updateMonitor();
  if (!quiet) { renderLanes(); renderInspector(); return; }
  // light update without rebuilding lanes
  renderLanes(); renderInspector();
}
async function deleteTrack(t) {
  if (!await confirmBox('Delete track', `Delete "${t.name}"? You can undo with Ctrl+Z.`, 'Delete')) return;
  snapshot();
  app.P.tracks = app.P.tracks.filter(x => x !== t);
  if (app.P.sel === t.id) app.P.sel = (app.P.tracks[0] || {}).id || 'beat';
  save(); renderStudio(); refresh();
}

// ---------- inspector ----------
export function renderInspector() {
  const box = $('#inspector'); if (!box) return;
  box.innerHTML = '';
  inspectorGrip(box);
  const P = app.P;
  if (P.sel === 'beat') {
    box.append(el('div', { class: 'insp-title' }, el('b', {}, 'Beat maker'), helpBtn('beatTrack')),
      el('p', { class: 'hint' }, 'Your built-in beat loops for the whole song. Edit it in the Beat tab.'),
      el('button', { class: 'hot', onclick: () => emit('goto:beat') }, 'Open beat maker'));
    return;
  }
  const t = selTrack();
  if (!t) { box.append(el('p', { class: 'hint' }, 'Click a track to see its settings.')); return; }
  const mixRow = el('div', { class: 'knobrow' },
    knob('Volume', 0, 1.2, 0.01, t.vol, v => { t.vol = v; applyMix(); save(); }, pct, 'vol'),
    knob('Pan', -1, 1, 0.01, t.pan, v => { t.pan = v; applyMix(); save(); }, panFmt, 'pan'),
    knob('Reverb', 0, 1, 0.01, t.rev, v => { t.rev = v; applyMix(); save(); }, pct, 'rev'),
    knob('Delay', 0, 1, 0.01, t.dly, v => { t.dly = v; applyMix(); save(); }, pct, 'dly'),
    toggle('Noise gate', t.gate, v => { t.gate = v; applyMix(); save(); }, 'gate'),
    knob('Gate threshold', -80, -10, 1, t.gateDb, v => { t.gateDb = v; applyMix(); save(); }, v => v + ' dB', 'gateThresh', 'adv'),
    el('span', { class: 'withhelp adv' }, el('small', { class: 'hint' }, `Volume automation: ${(t.auto || []).length} points `),
      (t.auto || []).length ? el('button', { onclick: () => { snapshot(); t.auto = []; save(); refresh(); renderLanes(); renderInspector(); } }, 'Clear') : null, helpBtn('automation')),
  );
  const takes = el('div', { class: 'takes' }, el('div', { class: 'insp-sub' }, 'Takes', helpBtn('takes')));
  if (!t.takes.length) takes.append(el('p', { class: 'hint' }, t.kind === 'file' ? 'This is a beat file. Record on a vocal track.' : 'No takes yet. Press Record.'));
  for (const k of [...t.takes].reverse()) {
    const inUse = t.clips.some(c => c.audioId === k.audioId);
    takes.append(el('div', { class: 'take' + (inUse ? ' inuse' : '') },
      el('span', {}, `Take ${k.n}`), el('small', {}, `at ${fmtTime(k.start)}, ${k.dur.toFixed(1)}s`),
      el('button', { onclick: () => { snapshot(); carve(t, k.start, k.start + k.dur); t.clips.push({ id: uid(), audioId: k.audioId, start: k.start, offset: 0, dur: k.dur }); save(); renderLanes(); renderInspector(); refresh(); toast(`Using take ${k.n}.`); } }, inUse ? 'In use' : 'Use'),
    ));
  }
  let tab = settings.inspTab || 'mix';
  if (settings.simple && (tab === 'fx' || tab === 'build')) tab = 'mix';
  const tabBtn = (k, label) => el('button', { class: 'itab' + (tab === k ? ' on' : ''), onclick: () => { settings.inspTab = k; saveSettings(); renderInspector(); } }, label);
  let content;
  if (tab === 'fx') content = fxTab(t);
  else if (tab === 'fix') content = fixTab(t, renderInspector);
  else if (tab === 'presets') content = presetsTab(t);
  else if (tab === 'build') content = buildTab(t);
  else content = el('div', { class: 'insp-grid' }, mixRow, takes);
  box.append(...[
    el('div', { class: 'insp-title', style: `--c:${t.color}` }, el('b', {}, t.name), el('span', { class: 'tag' }, t.kind === 'file' ? 'beat file' : 'vocal track'),
      el('div', { class: 'itabs' }, tabBtn('mix', 'Mix & takes'), tabBtn('fix', 'Fix my voice'), tabBtn('presets', 'Vocal presets'), settings.simple ? null : tabBtn('fx', `Effects (${(t.fx || []).length})`), settings.simple ? null : tabBtn('build', 'Build my sound'))),
    previewBar(t),
    el('div', { class: 'explain tabexplain' }, el('b', {}, 'What this tab does: '), TAB_EXPLAIN[tab] || ''),
    content,
  ].filter(Boolean));
}
setRerender(() => renderInspector());

// ---------- live updates ----------
export function updatePlayhead() {
  if (!ph || !app.P) return;
  const pos = currentPos();
  ph.style.left = pos * pps() + 'px';
  if (timeEl) {
    timeEl.textContent = fmtTime(pos);
    const beat = Math.floor(pos / beatSec());
    barEl.textContent = `Bar ${Math.floor(beat / 4) + 1}.${beat % 4 + 1}`;
    const r = recState();
    recTimeEl.textContent = r ? 'REC ' + fmtTime(recElapsed()) : '';
  }
  if (T.playing && scroller) {
    const x = pos * pps(), view = scroller.scrollLeft, w = scroller.clientWidth - HEAD_W;
    if (x > view + w - 40 || x < view) scroller.scrollLeft = x - 40;
  }
}
export function updateTransport() {
  const pb = $('#playbtn'), rb = $('#recbtn'); if (!pb) return;
  pb.textContent = T.playing ? 'Stop' : 'Play'; pb.classList.toggle('on', T.playing);
  const r = recState();
  rb.classList.toggle('on', !!r);
  rb.textContent = r ? 'Stop rec' : 'Record';
}
export function drawInputMeter() {
  if (!meterCv || !document.body.contains(meterCv)) return;
  const g = meterCv.getContext('2d'), W = meterCv.width, H = meterCv.height;
  const p = E.mic ? peakOf(E.mic.an) : 0;
  if (p > 0.98 && !clipLatched) { clipLatched = true; clipLed.classList.add('on'); }
  g.fillStyle = cssVar('--well'); g.fillRect(0, 0, W, H);
  const db = p > 0 ? 20 * Math.log10(p) : -100, f = clamp((db + 60) / 60, 0, 1);
  g.fillStyle = db > -3 ? '#ff3b3b' : db > -12 ? '#ffd23f' : '#4cd964';
  g.fillRect(0, 0, W * f, H);
  if (!E.mic) { g.fillStyle = '#666'; g.font = '9px monospace'; g.fillText('mic off', 4, 8); }
}

// ---------- export ----------
async function exportSong() {
  toast('Rendering your song...');
  try { const buf = await renderSong(); download(encodeWav(buf), safeName(app.P.name) + '.wav'); toast('Song saved to your downloads.'); }
  catch (e) { toast('Export failed: ' + e.message); }
}
async function exportStems() {
  const P = app.P, list = [['beat', 'beat-maker'], ...P.tracks.map(t => [t.id, t.name])];
  toast(`Rendering ${list.length} tracks...`);
  try {
    for (const [id, name] of list) {
      if (id === 'beat' && P.beat.mute) continue;
      const buf = await renderSong(id);
      download(encodeWav(buf), safeName(P.name) + '-' + safeName(name) + '.wav');
      await new Promise(r => setTimeout(r, 400));
    }
    toast('Tracks saved to your downloads.');
  } catch (e) { toast('Export failed: ' + e.message); }
}

// ---------- sounds from my library ----------
export async function addSoundClip(sid, track, at) {
  const buf = await soundBuffer(sid); if (!buf) return toast('That sound is missing.');
  const snd = SOUNDS.find(x => x.id === sid) || (await loadSounds()).find(x => x.id === sid);
  snapshot();
  let t = track;
  if (!t) { t = newVocalTrack(snd ? snd.name : 'Sound'); Object.assign(t, { kind: 'file', rev: 0, dly: 0, vol: 0.8 }); app.P.tracks.unshift(t); }
  t.clips.push({ id: uid(), audioId: sid, start: at, offset: 0, dur: buf.duration });
  if (at + buf.duration > songEnd()) app.P.lengthBars = Math.ceil((at + buf.duration) / barDur());
  let msg = `Added ${snd ? snd.name : 'sound'}.`;
  if (snd && snd.bpm && snd.bpm !== app.P.bpm) msg += ` This loop is ${snd.bpm} BPM, your song is ${app.P.bpm}.`;
  save(); renderStudio(); refresh(); toast(msg);
}
async function soundPicker() {
  await loadSounds();
  if (!SOUNDS.length) return toast('No sounds yet. Upload some in My sounds.');
  const box = el('div', { class: 'picker' });
  const close = modal('Add from my sounds', box);
  const draw = q => {
    box.innerHTML = '';
    box.append(el('input', { class: 'textin', placeholder: 'Search', value: q, oninput: e => draw(e.target.value) }));
    const sel = selTrack();
    box.append(el('p', { class: 'hint' }, `Adds at the playhead${sel && sel.kind === 'file' ? ' on ' + sel.name : ' on a new track'}.`));
    for (const x of SOUNDS.filter(x => !q || x.name.toLowerCase().includes(q.toLowerCase()))) box.append(el('div', { class: 'snd' },
      el('button', { class: 'sq play', onclick: () => playSound(x.id) }, '▶'), el('b', { class: 'snd-name' }, x.name), el('small', {}, x.kind + (x.bpm ? ' · ' + x.bpm + ' BPM' : '')),
      el('button', { class: 'hot', onclick: async () => { close(); const s2 = selTrack(); await addSoundClip(x.id, s2 && s2.kind === 'file' ? s2 : null, app.playhead); } }, 'Add')));
    const inp = box.querySelector('input'); inp.focus(); inp.setSelectionRange(q.length, q.length);
  };
  draw('');
}

// ---------- volume automation ----------
const AH = ROW_H, vToY = v => (1 - v / 1.5) * (AH - 8) + 4, yToV = y => clamp((1 - (y - 4) / (AH - 8)) * 1.5, 0, 1.5);
function autoLane(t, W) {
  const cv = el('canvas', { class: 'autolane', width: Math.min(W, 30000), height: AH, title: 'Click to add a point, drag to move, right-click to delete' });
  const draw = () => {
    const g = cv.getContext('2d'), pts = t.auto || [];
    g.clearRect(0, 0, cv.width, AH);
    g.fillStyle = '#ffd23f22'; g.fillRect(0, vToY(1), cv.width, 1);
    g.strokeStyle = '#ffd23f'; g.lineWidth = 2; g.beginPath();
    const y0 = vToY(pts.length ? pts[0].v : 1); g.moveTo(0, y0);
    for (const p of pts) g.lineTo(p.t * pps(), vToY(p.v));
    g.lineTo(cv.width, vToY(pts.length ? pts[pts.length - 1].v : 1)); g.stroke();
    g.fillStyle = '#ffd23f';
    for (const p of pts) { g.beginPath(); g.arc(p.t * pps(), vToY(p.v), 4, 0, 7); g.fill(); }
  };
  const hit = (x, y) => (t.auto || []).findIndex(p => Math.abs(p.t * pps() - x) < 7 && Math.abs(vToY(p.v) - y) < 7);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    e.stopPropagation();
    const x = e.offsetX, y = e.offsetY;
    t.auto ||= [];
    let i = hit(x, y);
    snapshot();
    if (e.button === 2) { if (i >= 0) { t.auto.splice(i, 1); draw(); save(); refresh(); renderInspector(); } return; }
    if (i < 0) { t.auto.push({ t: Math.max(0, x / pps()), v: yToV(y) }); t.auto.sort((a, b) => a.t - b.t); i = hit(x, y); }
    const p = t.auto[i]; draw();
    cv.setPointerCapture(e.pointerId);
    cv.onpointermove = ev => { p.t = Math.max(0, ev.offsetX / pps()); p.v = yToV(ev.offsetY); t.auto.sort((a, b) => a.t - b.t); draw(); };
    cv.onpointerup = () => { cv.onpointermove = null; save(); refresh(); renderInspector(); };
  });
  draw();
  return cv;
}
