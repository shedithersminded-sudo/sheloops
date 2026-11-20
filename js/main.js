import { renderPads } from './pads.js';
import { renderSampler } from './sampler.js';
import { actionFor, binds, keyOf } from './keys.js';
import { renderDJ } from './dj.js';
import { openAddAudio } from './dropanywhere.js';
import { initHear, hearButton } from './hear.js';
import { initTours } from './tour.js';
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
import { mountMicDock } from './micui.js';
import { recState } from './engine.js';
window.__shRec = () => recState();
mountMicDock();
import { renderHome, renderProjects, renderMic, renderLearn, createSong } from './pages.js';

setDecoder(async ab => (await ensureCtx()).decodeAudioData(ab));

const VIEWS = { home: renderHome, studio: renderStudio, beat: renderBeat, mixer: renderMixer, master: renderMaster, profile: renderProfile, look: renderAppearance, art: renderArt, player: renderPlayer, sounds: renderLibrary, projects: renderProjects, mic: renderMic, learn: renderLearn, pads: renderPads, dj: renderDJ, sampler: renderSampler };
const NEEDS_SONG = ['studio', 'beat', 'mixer', 'master'];
const PLAYS = ['studio', 'beat', 'mixer', 'master', 'player'];

// Top menu: pages grouped into categories, each with a short line about what it is for
const MENU = [
  ['Create', 'Make music', [
    ['studio', 'Studio', 'Record your voice over a beat, with takes and vocal effects'],
    ['beat', 'Beat maker', 'Drums, 75 instruments, patterns and the guitar maker'],
    ['pads', 'Pad machine', 'Tap beats on 128 glowing pads, record loops and voice loops'],
    ['sampler', 'Sample maker', 'Chop pieces from your songs and make your producer tag'],
    ['dj', 'DJ booth', 'Mix two tracks with scratching, effects, transitions and lights']]],
  ['Finish', 'Make it sound done', [
    ['mixer', 'Mixer', 'Faders, meters and groups for every track'],
    ['master', 'Master', 'Make your song loud, clear and polished'],
    ['export', 'Export', 'Save your song, beat, vocals or everything'],
    ['player', 'Player', 'Listen to your songs with their covers']]],
  ['Design', 'Make it yours', [
    ['art', 'Cover art', 'Covers, CDs, back covers and 3D cases'],
    ['look', 'Appearance', 'Themes, fonts, glow, background, mouse and the CD player'],
    ['profile', 'My sound', 'Your artist profile and default vocal sound']]],
  ['Library', 'Your stuff', [
    ['projects', 'Projects', 'All your songs: open, copy, export'],
    ['sounds', 'My sounds', 'Your uploads, recordings, pad loops and DJ mixes']]],
  ['Help', 'Learn the app', [
    ['learn', 'Lessons', 'Short step by step lessons'],
    ['mic', 'Mic setup', 'Set up and test your microphone'],
    ['keys', 'Keys guide', 'Every keyboard shortcut (or press ?)'],
    ['welcome', 'Welcome guide', 'Themes, Simple or Advanced, and quick starts on Home']]],
];
function menuGo(v) {
  if (v === 'export') { settings.visited ||= []; if (!settings.visited.includes('export')) { settings.visited.push('export'); saveSettings(); } return openExport(); }
  if (v === 'keys') return openKeyGuide(app.view);
  if (v === 'welcome') { settings.hideWelcome = false; saveSettings(); goto('home'); return; }
  goto(v);
}
function nav() {
  const bar = $('#nav'); bar.innerHTML = '';
  const P = app.P;
  const cat = ([name, sub, items], ci) => {
    const on = items.some(([v]) => v === app.view);
    const d = el('details', { class: 'more navcat' + (on ? ' on' : ''), style: `--ci:${ci}` },
      el('summary', { class: 'navbtn' + (on ? ' on' : '') }, name, el('i', { class: 'caret' })),
      el('div', { class: 'megamenu' },
        el('div', { class: 'mmhead' }, el('b', {}, name), el('small', {}, sub)),
        ...items.map(([v, label, what], k) => el('button', { class: 'mmitem' + (app.view === v ? ' on' : ''), style: `--k:${k}`, onclick: () => { d.open = false; menuGo(v); } },
          el('span', { class: 'mmdot' }), el('span', { class: 'mmtext' }, el('b', {}, label), el('small', {}, what))))));
    d.addEventListener('toggle', () => { if (d.open) for (const o of bar.querySelectorAll('details.navcat[open]')) if (o !== d) o.open = false; });
    // open on hover with a mouse, click works everywhere
    d.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && bar.querySelector('details.navcat[open]')) d.open = true; });
    return d;
  };
  bar.append(...[
    brandEl(),
    el('nav', { class: 'catnav' }, el('button', { class: 'navbtn' + (app.view === 'home' ? ' on' : ''), onclick: () => goto('home') }, 'Home'), ...MENU.map(cat)),
    el('span', { class: 'spacer' }),
    P ? el('div', { class: 'songchip', title: 'Your current song. Click to see all your projects.', onclick: () => goto('projects') },
      P.cover ? el('img', { src: P.cover, alt: '' }) : el('span', { class: 'blank' }, P.name.slice(0, 2).toUpperCase()),
      el('span', {}, P.name)) : null,
    hearButton(),
    el('button', { class: 'navbtn addaudiobtn', title: 'Add a beat, song or sound from your device or a link. You can also drag audio onto any page.', onclick: () => openAddAudio() }, '+ Audio'),
    el('button', { class: 'navbtn exportbtn', title: 'Export songs, beats, tracks or everything', onclick: openExport }, 'Export'),
    el('span', { class: 'withhelp modewrap' },
      el('div', { class: 'modeswitch', role: 'group' },
        [[true, 'Simple', 'Fewer buttons, and every screen explains itself'], [false, 'Advanced', 'Every tool, knob and setting']].map(([v, l, t]) => el('button', { class: !!settings.simple === v ? 'on' : '', title: t, onclick: () => {
          if (!!settings.simple === v) return;
          settings.simple = v; saveSettings(); applyMode(); nav(); if (app.view) goto(app.view);
          toast(v ? 'Simple mode: fewer buttons and plain explanations everywhere.' : 'Advanced mode: every tool and knob is showing.');
        } }, l))),
      el('div', { class: 'modetip' }, el('b', {}, settings.simple ? 'You are in Simple mode' : 'You are in Advanced mode'), el('span', {}, 'Simple shows fewer buttons and explains every screen. Advanced shows every tool. Switch any time, nothing is lost.')),
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
    const mode = L.mode || 'runner';
    // the SHELOOPS runner: always on the move, with speed lines behind her
    if (mode === 'runner') b.append(el('span', { class: 'runlogo', 'aria-hidden': 'true' }, el('i', { class: 'streak s1' }), el('i', { class: 'streak s2' }), el('i', { class: 'streak s3' }), el('span', { class: 'runner' })));
    else if (mode === 'mine' && url) b.append(el('img', { class: 'logo ' + (L.shape || ''), src: url, alt: 'logo', draggable: 'false', oncontextmenu: e => e.preventDefault() }));
    if (mode !== 'mine' || !url || L.text !== false) b.append(el('span', { class: 'brandtext' }, 'SHE', el('span', {}, 'LOOPS')));
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
    el('label', { class: 'knob' }, el('span', { class: 'lab' }, el('span', {}, 'Echo speed', helpBtn('delayTime'))),
      select([[2, '1/8'], [3, '3/16'], [4, '1/4'], [6, '3/8']], M.delayDiv, v => { M.delayDiv = +v; applyMix(); save(); })),
    knob('Echo repeats', 0, 0.85, 0.01, M.delayFb, v => { M.delayFb = v; applyMix(); save(); }, pct, 'delayFb'),
    el('canvas', { id: 'meter', width: 240, height: 14, title: 'Master level. Keep it out of the red.' }),
    el('span', { class: 'hint keyhint' }, app.view === 'beat' ? `Letters play the selected sound. Z and X change octave. ${keyOf('beatRec')} goes to record.` : `${keyOf('play')} play, ${keyOf('record')} record, ${keyOf('split')} split, ${keyOf('undo')} undo.`, el('button', { class: 'keylink', onclick: () => openKeyGuide(app.view, true) }, 'Change keys')),
  );
}

export function goto(v) {
  if (v === 'export') return openExport(); // export is a window, not a page
  if (!VIEWS[v]) return;
  if (NEEDS_SONG.includes(v) && !app.P) { createSong(v === 'beat' ? false : null); return; }
  const was = app.view;
  app.view = v;
  settings.visited ||= []; if (!settings.visited.includes(v)) { settings.visited.push(v); saveSettings(); } // lights up steps on Home
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
  if (e.target.matches?.('input:not([type=range]):not([type=checkbox]), select, textarea')) return;
  if (document.querySelector('.modal-wrap')) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey, act = actionFor(e, app.view);
  if (act === 'guide') { e.preventDefault(); openKeyGuide(app.view); return; }
  if (act === 'hear') return; // What I hear handles its own key
  const inSong = app.P && PLAYS.includes(app.view);
  if (!inSong) return;
  // in the Beat maker the instrument keys come first: a letter plays a note and does nothing else
  if (app.view === 'beat' && !ctrl && !e.altKey && !e.repeat && beatKey(k, false, e)) { e.preventDefault(); return; }
  if (act === 'play') { e.preventDefault(); T.playing ? stop() : play(); return; }
  if (act === 'undo') { e.preventDefault(); edit.undo(); return; }
  if (act === 'redo' || (ctrl && e.shiftKey && k === 'z')) { e.preventDefault(); edit.redo(); return; }
  if (app.view === 'studio') {
    if (ctrl && k === 'c') { edit.copy(); return; }
    if (ctrl && k === 'x') { edit.cut(); return; }
    if (ctrl && k === 'v') { edit.paste(); return; }
    if (e.repeat) return;
    if (act === 'record') record();
    else if (act === 'split') edit.split();
    else if (act === 'del' || (!act && k === 'backspace' && binds().del === 'delete')) { e.preventDefault(); edit.del(); }
    else if (act === 'home') seek(0);
  } else if (app.view === 'beat' && act === 'beatRec' && !e.repeat) { e.preventDefault(); goto('studio'); record(); }
});
window.addEventListener('keyup', e => {
  if (app.view === 'beat' && !e.target.matches?.('input:not([type=range]), select, textarea')) beatKey(e.key.toLowerCase(), true, e);
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
  initHear();
  initTours(() => app.view);
  goto('home');
  requestAnimationFrame(frame);
}
boot();
