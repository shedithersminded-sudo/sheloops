import { renderPads } from './pads.js';
import { renderDJ } from './dj.js';
import { $, el, toast, knob, select, pct, cssVar } from './util.js';
import { helpBtn } from './help.js';
import { app, on, emit, save, flush, newProject, openProject, newBeatTrack, STARTERS } from './state.js';
import { db, settings, saveSettings, setDecoder } from './store.js';
import { E, T, ensureCtx, play, stop, refresh, applyMix, resetNodes, setReverbSize, peakOf, updateMonitor } from './engine.js';
import { renderStudio, updatePlayhead, updateTransport, drawInputMeter, record, edit, seek, renderInspector } from './studio.js';
import { renderBeat, beatTick, beatKey } from './beat.js';
import { clearPreview } from './fxui.js';
import { renderLibrary } from './library.js';
import { renderMixer, drawMixerMeters } from './mixer.js';
import { renderMaster, masterTick } from './master.js';
import { renderProfile } from './profile.js';
import { renderAppearance } from './appearance.js';
import { applyLook, look, logoURL } from './look.js';
import { playIntro, introOn } from './intro.js';
import { openExport } from './exporter.js';
import { openKeyGuide } from './keyguide.js';
import { renderArt, artKey } from './artui.js';
import { renderPlayer, playerTick } from './player.js';
import { nowPlayingTick } from './nowplaying.js';
import { initUpdates } from './update.js';
import { renderHome, renderProjects, renderMic, renderLearn, createSong } from './pages.js';

setDecoder(async ab => (await ensureCtx()).decodeAudioData(ab));

const VIEWS = { home: renderHome, studio: renderStudio, beat: renderBeat, mixer: renderMixer, master: renderMaster, profile: renderProfile, look: renderAppearance, art: renderArt, player: renderPlayer, sounds: renderLibrary, projects: renderProjects, mic: renderMic, learn: renderLearn, pads: renderPads, dj: renderDJ };
const NEEDS_SONG = ['studio', 'beat', 'mixer', 'master'];
const PLAYS = ['studio', 'beat', 'mixer', 'master', 'player'];

function nav() {
  const bar = $('#nav'); bar.innerHTML = '';
  const P = app.P;
  const item = (v, label) => el('button', { class: 'navbtn' + (app.view === v ? ' on' : ''), onclick: () => goto(v) }, label);
  bar.append(...[
    brandEl(),
    settings.simple
      ? el('nav', {}, item('home', 'Home'), item('studio', 'Studio'), item('beat', 'Beat'), item('pads', 'Pads'), item('dj', 'DJ'), item('master', 'Master'), item('art', 'Cover art'), item('projects', 'Projects'),
        moreMenu([['mixer', 'Mixer'], ['player', 'Player'], ['sounds', 'My sounds'], ['profile', 'My sound'], ['look', 'Appearance'], ['mic', 'Mic setup'], ['learn', 'Learn']]))
      : el('nav', {}, item('home', 'Home'), item('studio', 'Studio'), item('beat', 'Beat'), item('pads', 'Pads'), item('dj', 'DJ'), item('mixer', 'Mixer'), item('master', 'Master'), item('art', 'Cover art'), item('player', 'Player'), item('projects', 'Projects'),
        moreMenu([['sounds', 'My sounds'], ['profile', 'My sound'], ['look', 'Appearance'], ['mic', 'Mic setup'], ['learn', 'Learn']])),
    el('span', { class: 'spacer' }),
    P ? el('div', { class: 'songchip', title: 'Current song', onclick: () => goto('projects') },
      P.cover ? el('img', { src: P.cover, alt: '' }) : el('span', { class: 'blank' }, P.name.slice(0, 2).toUpperCase()),
      el('span', {}, P.name)) : null,
    el('button', { class: 'navbtn exportbtn', title: 'Export songs, beats, tracks or everything', onclick: openExport }, 'Export'),
    el('span', { class: 'withhelp' },
      el('div', { class: 'modeswitch', role: 'group', title: 'Simple hides the extra buttons. Advanced shows everything.' },
        [[true, 'Simple'], [false, 'Advanced']].map(([v, l]) => el('button', { class: !!settings.simple === v ? 'on' : '', onclick: () => {
          if (!!settings.simple === v) return;
          settings.simple = v; saveSettings(); applyMode(); nav(); if (app.view) goto(app.view);
          toast(v ? 'Simple mode: only the main buttons show. Switch to Advanced any time for everything.' : 'Advanced mode: every tool and knob is showing.');
        } }, l))),
      helpBtn('simple')),
  ].filter(Boolean));
}
// close the More menu when clicking anywhere else (one listener for the whole app)
document.addEventListener('pointerdown', e => { for (const d of document.querySelectorAll('details.more[open]')) if (!d.contains(e.target)) d.open = false; });
function brandEl() {
  const b = el('div', { class: 'brand', title: 'Home', onclick: () => goto('home') });
  const L = look.logo || {};
  logoURL().then(url => {
    b.innerHTML = '';
    if (url) b.append(el('img', { class: 'logo ' + (L.shape || ''), src: url, alt: 'logo', draggable: 'false', oncontextmenu: e => e.preventDefault() }));
    if (!url || L.text !== false) b.append(el('span', { class: 'brandtext' }, 'SHE', el('span', {}, 'LOOPS')));
  });
  return b;
}
document.addEventListener('logochange', () => { const old = document.querySelector('#nav .brand'); if (old) old.replaceWith(brandEl()); });
function moreMenu(items) {
  const on = items.some(([v]) => v === app.view);
  const d = el('details', { class: 'more' }, el('summary', { class: 'navbtn' + (on ? ' on' : '') }, 'More'),
    el('div', { class: 'moremenu panel' }, items.map(([v, l]) => el('button', { class: 'navbtn' + (app.view === v ? ' on' : ''), onclick: () => { d.open = false; goto(v); } }, l))));
  return d;
}
function applyMode() { document.body.classList.toggle('simple', settings.simple); }

function footer() {
  const f = $('#foot'); f.innerHTML = '';
  if (!app.P || !NEEDS_SONG.includes(app.view)) { f.hidden = true; return; }
  f.hidden = false;
  const M = app.P.master;
  f.append(
    el('span', { class: 'title' }, 'Master'),
    knob('Volume', 0, 1.2, 0.01, M.vol, v => { M.vol = v; applyMix(); save(); }, pct, 'master'),
    knob('Reverb size', 0.5, 6, 0.1, M.revSize, v => { M.revSize = v; setReverbSize(v); save(); }, v => v.toFixed(1) + 's', 'revSize', 'adv'),
    el('label', { class: 'knob adv' }, el('span', { class: 'lab' }, el('span', {}, 'Delay time', helpBtn('delayTime'))),
      select([[2, '1/8'], [3, '3/16'], [4, '1/4'], [6, '3/8']], M.delayDiv, v => { M.delayDiv = +v; applyMix(); save(); })),
    knob('Delay repeats', 0, 0.85, 0.01, M.delayFb, v => { M.delayFb = v; applyMix(); save(); }, pct, 'delayFb', 'adv'),
    el('canvas', { id: 'meter', width: 240, height: 14, title: 'Master level. Keep it out of the red.' }),
    el('span', { class: 'hint keyhint' }, app.view === 'beat' ? 'Keys A to K play the selected synth. Z and X change octave.' : 'Space play, R record, S split, Ctrl+Z undo.'),
  );
}

export function goto(v) {
  if (NEEDS_SONG.includes(v) && !app.P) { createSong(v === 'beat' ? false : null); return; }
  const was = app.view;
  app.view = v;
  if (T.playing && (was === 'beat') !== (v === 'beat')) refresh();
  nav(); footer();
  VIEWS[v]();
  window.scrollTo(0, 0);
}
on(kind => {
  if (kind.startsWith('goto:')) goto(kind.slice(5));
  else if (kind === 'modechange') { nav(); if (app.view) goto(app.view); }
  else if (kind === 'tick') { updatePlayhead(); beatTick(); }
  else if (kind === 'transport') updateTransport();
  else if (kind === 'project') { clearPreview(); resetNodes(); applyMix(undefined, true); updateMonitor(); nav(); footer(); if (VIEWS[app.view]) VIEWS[app.view](); }
  else if (kind === 'meta') { nav(); }
});

// ---------- meters ----------
let mPeak = 0;
const warned = new Set();
const safe = (name, fn) => { try { fn(); } catch (e) { if (!warned.has(name)) { warned.add(name); console.warn('frame step failed:', name, e); } } };
function frame() {
  requestAnimationFrame(frame); // schedule first, so one failing step can never stop the meters, playhead or CD player
  if (T.playing) { safe('playhead', updatePlayhead); safe('beat', beatTick); }
  safe('input', drawInputMeter);
  safe('mixer', drawMixerMeters);
  safe('player', playerTick);
  safe('cdplayer', nowPlayingTick);
  safe('master', masterTick);
  const m = $('#meter');
  if (m) {
    const g = m.getContext('2d');
    const pk = E.g ? peakOf(E.g.analyser) : 0;
    mPeak = Math.max(pk, mPeak * 0.94);
    g.fillStyle = cssVar('--well'); g.fillRect(0, 0, m.width, m.height);
    const segs = 30, lit = Math.round(Math.min(1, mPeak) * segs);
    for (let i = 0; i < segs; i++) { g.fillStyle = i >= lit ? '#222' : i > 26 ? '#ff3b3b' : i > 21 ? '#ffd23f' : '#ff6a1a'; g.fillRect(2 + i * 8, 3, 6, m.height - 6); }
  }
}

// ---------- keyboard ----------
window.addEventListener('keydown', e => {
  if (artKey(e)) return;
  if (e.target.matches('input:not([type=range]):not([type=checkbox]), select, textarea')) return;
  if (document.querySelector('.modal-wrap')) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (e.key === '?' && !ctrl) { openKeyGuide(app.view); return; }
  const inSong = app.P && PLAYS.includes(app.view);
  if (!inSong) return;
  if (e.code === 'Space') { e.preventDefault(); T.playing ? stop() : play(); return; }
  if (ctrl && k === 'z') { e.preventDefault(); e.shiftKey ? edit.redo() : edit.undo(); return; }
  if (ctrl && k === 'y') { e.preventDefault(); edit.redo(); return; }
  if (app.view === 'studio') {
    if (ctrl && k === 'c') { edit.copy(); return; }
    if (ctrl && k === 'x') { edit.cut(); return; }
    if (ctrl && k === 'v') { edit.paste(); return; }
    if (ctrl || e.altKey || e.repeat) return;
    if (k === 'r') record();
    else if (k === 's') edit.split();
    else if (k === 'delete' || k === 'backspace') { e.preventDefault(); edit.del(); }
    else if (k === 'home') seek(0);
  } else if (app.view === 'beat' && !ctrl && !e.repeat) {
    if (beatKey(k, false, e)) e.preventDefault();
    else if (k === 'r') { goto('studio'); record(); }
  }
});
window.addEventListener('keyup', e => {
  if (app.view === 'beat' && !e.target.matches('input:not([type=range]), select, textarea')) beatKey(e.key.toLowerCase(), true, e);
});
window.addEventListener('beforeunload', () => { flush(); });
// Stop the browser from opening a file dropped outside a drop zone
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());

// ---------- boot ----------
async function migrateOld() {
  const raw = localStorage.getItem('loopden.project'); if (!raw) return null;
  try {
    const old = JSON.parse(raw);
    const p = newProject(old.name || 'First loop');
    p.bpm = old.bpm || 90; p.beat.bars = old.bars || 2; p.beat.swing = old.swing ?? 0.2;
    const bt = (old.tracks || []).filter(t => t.type === 'drums' || t.type === 'synth');
    if (bt.length) { p.beat.tracks = bt; p.beat.sel = bt[0].id; }
    await db.put('projects', p.id, p);
    localStorage.removeItem('loopden.project');
    return p;
  } catch { return null; }
}
async function boot() {
  applyMode();
  try { await applyLook(); } catch (e) { console.warn('appearance failed to load, using defaults', e); }
  if (introOn()) playIntro().catch(() => document.getElementById('intro-cover')?.remove());
  else document.getElementById('intro-cover')?.remove();
  initUpdates().catch(() => { });
  // optional MP3 encoder (vendor/lame.min.js); MP3 export shows up only when it exists
  fetch('vendor/lame.min.js', { method: 'HEAD' }).then(r => { if (r.ok) document.head.append(el('script', { src: 'vendor/lame.min.js' })); }).catch(() => { });
  let p = await migrateOld();
  if (!p && settings.lastProject) p = await db.get('projects', settings.lastProject);
  if (p) await openProject(p);
  goto('home');
  requestAnimationFrame(frame);
}
boot();
