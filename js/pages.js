// Home, projects, mic setup, learn.
import { $, el, clamp, toast, toggle, select, knob, ask, confirmBox, modal } from './util.js';
import { HELP, LESSONS, helpBtn, showHelp } from './help.js';
import { app, newProject, openProject, flush, emit, save } from './state.js';
import { db, settings, saveSettings, cleanupAudio } from './store.js';
import { E, ensureCtx, openMic, reopenMic, setInputGain, peakOf, rmsOf, testRecord, playBuffer, testTone, latency, updateMonitor } from './engine.js';
import { importBeatFile } from './studio.js';
import { U, check, whatsNew, install } from './update.js';

const go = v => emit('goto:' + v);
const ago = ts => { const s = (Date.now() - ts) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : new Date(ts).toLocaleDateString(); };
const coverEl = (p, cls = 'cover') => p.cover ? el('img', { class: cls, src: p.cover, alt: '' }) : el('div', { class: cls + ' blank' }, (p.name || '?').slice(0, 2).toUpperCase());

export async function createSong(withFile) {
  const name = await ask('New song', 'Song name', 'New song');
  if (!name) return;
  const p = newProject(name);
  if (withFile) { p.beat.mute = true; }
  await db.put('projects', p.id, p);
  await openProject(p);
  if (withFile) { go('studio'); await importBeatFile(withFile); }
  else go(withFile === false ? 'beat' : 'studio');
}
function pickFile(accept) {
  return new Promise(res => { const i = el('input', { type: 'file', accept }); i.onchange = () => res(i.files[0] || null); i.click(); });
}

// Updates & app box on Home
function updatesPanel() {
  const box = el('div', { class: 'panel later updates' });
  const draw = () => {
    const v = U.current, ready = U.latest || U.remote;
    box.innerHTML = '';
    box.append(
      el('div', { class: 'upd-head' }, el('h2', { class: 'h2' }, 'Updates & app'), helpBtn('updates')),
      el('div', { class: 'upd-row' },
        el('div', {}, el('b', {}, v ? `SHELOOPS ${v.version}` : 'SHELOOPS'), el('small', { class: 'hint' }, v ? ` · ${v.date}` : ''),
          el('p', { class: 'hint' }, ready ? `Version ${ready.version} is available.` : 'You have the newest version.')),
        el('span', { class: 'spacer' }),
        ready ? el('button', { class: 'hot', onclick: () => U.latest ? location.reload() : whatsNew(ready) }, U.latest ? 'Update now' : `See ${ready.version}`) : null,
        el('button', { onclick: () => check(true) }, 'Check for updates'),
        el('button', { onclick: () => whatsNew(U.current) }, "What's new"),
        U.installed ? el('span', { class: 'badge' }, 'Installed as an app') : el('button', { class: U.installEvt ? 'hot' : '', onclick: () => install() }, 'Install as an app')));
  };
  draw();
  document.addEventListener('updatestate', () => { if (document.body.contains(box)) draw(); });
  return box;
}
function heroLogo() {
  const box = el('span');
  import('./look.js').then(m => m.logoURL()).then(u => { if (u) box.replaceWith(el('img', { class: 'herologo', src: u, alt: 'logo', draggable: 'false', oncontextmenu: e => e.preventDefault() })); });
  return box;
}
// ---------- home ----------
export async function renderHome() {
  const view = $('#view'); view.innerHTML = '';
  const all = (await db.all('projects')).sort((a, b) => b.updated - a.updated);
  if (app.view !== 'home') return;
  const P = app.P;
  const tile = (title, sub, fn, hot) => el('button', { class: 'tile' + (hot ? ' hot' : ''), onclick: fn }, el('b', {}, title), el('span', {}, sub));
  const home = el('div', { class: 'home' },
    el('div', { class: 'hero panel' },
      P ? coverEl(P, 'cover big') : null,
      heroLogo(),
      el('div', { class: 'hero-text' },
        el('small', {}, 'Current song'), el('h1', {}, P ? P.name : 'No song yet'),
        P && P.artist ? el('p', {}, P.artist) : null,
        P ? el('button', { class: 'hot', onclick: () => go('studio') }, 'Continue in the studio') : null),
      el('div', { class: 'dropzone', id: 'homedrop' }, el('b', {}, 'Drop a beat file here'), el('span', {}, 'Starts a new song with your beat, ready to record.')),
    ),
    el('div', { class: 'tiles' },
      tile('Start with my beat', 'Pick an MP3 or WAV and record over it', async () => { const f = await pickFile('audio/*'); if (f) createSong(f); }, true),
      tile('Create new song', 'Starts with a simple built-in beat', () => createSong(null)),
      tile('Record vocals', 'Open the recording studio', () => P ? go('studio') : createSong(null)),
      tile('Fix my voice', 'Check a take and fix problems', () => { settings.inspTab = 'fix'; saveSettings(); P ? go('studio') : createSong(null); }),
      tile('My sound', 'Your studio profile and defaults', () => go('profile')),
      tile('My studio appearance', 'Themes, backgrounds, cursor, layout', () => go('look')),
      tile('My cover art', 'Covers, CD discs, back covers and cases', () => go('art')),
      tile('Player', 'Listen to your songs with their covers', () => go('player')),
      tile('Vocal presets', 'Change how your voice sounds', () => { settings.inspTab = 'presets'; saveSettings(); P ? go('studio') : createSong(null); }),
      tile('Build my sound', 'Pick a vibe, shape it, keep it', () => { settings.inspTab = 'build'; saveSettings(); P ? go('studio') : createSong(null); }),
      tile('Make a beat', 'Drums, instruments, patterns', () => P ? go('beat') : createSong(false)),
      tile('My sounds', 'Upload your own drums, loops and samples', () => go('sounds')),
      tile('Mixing studio', 'Faders, meters, groups', () => P ? go('mixer') : createSong(null)),
      tile('Mastering studio', 'Make your song loud and polished', () => P ? go('master') : createSong(null)),
      tile('My projects', `${all.length} song${all.length === 1 ? '' : 's'}`, () => go('projects')),
      tile('Mic setup', settings.wizardDone ? 'Check or change your mic' : 'Start here if you are new', () => go('mic'), !settings.wizardDone),
      tile('Learn', 'Short step by step lessons', () => go('learn')),
    ),
    all.length ? el('div', {}, el('h2', { class: 'h2' }, 'Recent songs'),
      el('div', { class: 'recent' }, all.slice(0, 6).map(p => el('button', { class: 'recent-card', onclick: async () => { await openProject(p); go('studio'); } },
        coverEl(p), el('b', {}, p.name), el('small', {}, ago(p.updated)))))) : null,
    updatesPanel(),
  );
  view.append(home);
  const dz = $('#homedrop');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) createSong(f); });
}

// ---------- projects ----------
async function setCover(p) {
  const f = await pickFile('image/*'); if (!f) return;
  try {
    const img = await createImageBitmap(f);
    const s = Math.min(img.width, img.height), size = Math.min(1000, s);
    const c = el('canvas', { width: size, height: size });
    c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    p.cover = c.toDataURL('image/jpeg', 0.9);
    p.coverOrig = 'cover-' + p.id;
    await db.put('audio', p.coverOrig, { img: f, name: f.name });
    if (app.P && app.P.id === p.id) { app.P.cover = p.cover; app.P.coverOrig = p.coverOrig; await flush(); }
    else { p.updated = Date.now(); await db.put('projects', p.id, p); }
    toast('Cover saved.');
  } catch { toast('Could not read that picture.'); }
}
export async function renderProjects() {
  const view = $('#view'); view.innerHTML = '';
  await flush();
  const all = (await db.all('projects')).sort((a, b) => b.updated - a.updated);
  if (app.view !== 'projects') return;
  const card = p => el('div', { class: 'pcard panel' + (app.P && app.P.id === p.id ? ' current' : '') },
    el('button', { class: 'pcover', title: 'Open', onclick: async () => { await openProject(p); go('studio'); } }, coverEl(p)),
    el('div', { class: 'pinfo' },
      el('b', {}, p.name), el('small', {}, (p.artist ? p.artist + ' · ' : '') + `${p.tracks.length} tracks · ${ago(p.updated)}`)),
    el('div', { class: 'pbtns' },
      el('button', { class: 'hot', onclick: async () => { await openProject(p); go('studio'); } }, 'Open'),
      el('button', { onclick: async () => { const n = await ask('Rename song', 'Song name', p.name); if (!n) return; await update(p, x => x.name = n); } }, 'Rename'),
      el('button', { onclick: async () => { const n = await ask('Artist name', 'Artist', p.artist || ''); if (n == null) return; await update(p, x => x.artist = n); } }, 'Artist'),
      el('span', { class: 'withhelp' }, el('button', { onclick: async () => { await setCover(p); renderProjects(); } }, p.cover ? 'Change cover' : 'Set cover'), helpBtn('cover')),
      el('button', { onclick: () => go('art') }, 'Design cover'),
      el('button', { onclick: () => copyProject(p, p.name + ' copy') }, 'Duplicate'),
      el('button', { title: 'Saves a frozen copy you can go back to', onclick: () => copyProject(p, `${p.name} (version ${new Date().toLocaleString()})`) }, 'Save version'),
      el('button', { class: 'danger', onclick: () => deleteProject(p) }, 'Delete'),
    ));
  view.append(el('div', { class: 'projects' },
    el('div', { class: 'ptop' }, el('h1', {}, 'My projects'),
      el('button', { class: 'hot', onclick: () => createSong(null) }, 'New song'),
      el('button', { onclick: async () => { const f = await pickFile('audio/*'); if (f) createSong(f); } }, 'New song from my beat')),
    el('p', { class: 'hint' }, 'Everything saves automatically in this browser while you work.'),
    all.length ? el('div', { class: 'pgrid' }, all.map(card)) : el('div', { class: 'empty' }, 'No songs yet. Click New song.')));
}
async function update(p, fn) {
  if (app.P && app.P.id === p.id) { fn(app.P); await flush(); emit('meta'); }
  else { fn(p); p.updated = Date.now(); await db.put('projects', p.id, p); }
  renderProjects();
}
async function copyProject(p, name) {
  if (app.P && app.P.id === p.id) { await flush(); p = app.P; }
  const c = JSON.parse(JSON.stringify(p));
  c.id = Math.random().toString(36).slice(2, 10); c.name = name; c.created = c.updated = Date.now();
  if (p.coverOrig) { const d = await db.get('audio', p.coverOrig); if (d) { c.coverOrig = 'cover-' + c.id; await db.put('audio', c.coverOrig, d); } }
  await db.put('projects', c.id, c);
  toast('Saved as "' + name + '".');
  renderProjects();
}
async function deleteProject(p) {
  if (!await confirmBox('Delete song', `Delete "${p.name}" and its recordings? This cannot be undone.`, 'Delete')) return;
  await db.del('projects', p.id);
  if (app.P && app.P.id === p.id) { app.P = null; settings.lastProject = null; saveSettings(); emit('meta'); }
  await cleanupAudio();
  toast('Deleted.');
  renderProjects();
}

// ---------- mic setup wizard ----------
let wiz = 0, wizRaf = 0, peakHist = [];
const STEPS = ['Connect', 'Devices', 'Level', 'Noise', 'Headphones', 'Test'];
export function renderMic() {
  cancelAnimationFrame(wizRaf);
  const view = $('#view'); view.innerHTML = '';
  const body = el('div', { class: 'wiz-body' });
  const nav = el('div', { class: 'wiz-steps' }, STEPS.map((s, i) => el('button', { class: 'wstep' + (i === wiz ? ' on' : '') + (i < wiz ? ' done' : ''), onclick: () => { wiz = i; renderMic(); } }, `${i + 1}. ${s}`)));
  const foot = el('div', { class: 'wiz-foot' },
    wiz > 0 ? el('button', { onclick: () => { wiz--; renderMic(); } }, 'Back') : el('span'),
    wiz < STEPS.length - 1 ? el('button', { class: 'hot', onclick: () => { wiz++; renderMic(); } }, 'Next') :
      el('button', { class: 'hot', onclick: () => { settings.wizardDone = true; saveSettings(); toast('Mic setup saved.'); go(app.P ? 'studio' : 'home'); } }, 'Finish'));
  view.append(el('div', { class: 'wizard panel' }, el('h1', {}, 'Mic setup'), nav, body, foot));
  [stepConnect, stepDevices, stepLevel, stepNoise, stepPhones, stepTest][wiz](body);
}
function para(...t) { return t.map(x => el('p', {}, x)); }
async function stepConnect(b) {
  b.append(...para('Plug in your microphone (USB mic or audio interface) and put on headphones.',
    'Your browser will ask for permission to use the mic. Click Allow.'));
  const st = el('p', { class: 'status' }, E.mic ? 'Mic is connected.' : 'Mic not connected yet.');
  b.append(el('button', { class: 'hot', onclick: async () => {
    try { await openMic(); st.textContent = 'Mic is connected. Click Next.'; }
    catch (e) { st.textContent = 'Could not open the mic. Check the browser permission (the icon left of the address bar) and that the mic is plugged in.'; }
  } }, 'Allow microphone'), st);
}
async function stepDevices(b) {
  b.append(...para('Pick the mic you want to record with, and where you want to hear sound.'));
  let devs = [];
  try { devs = await navigator.mediaDevices.enumerateDevices(); } catch { }
  const ins = devs.filter(d => d.kind === 'audioinput'), outs = devs.filter(d => d.kind === 'audiooutput');
  if (ins.length && !ins[0].label) b.append(el('p', { class: 'status' }, 'Names are hidden until you allow the mic in step 1.'));
  const canSink = !!(window.AudioContext && AudioContext.prototype.setSinkId);
  b.append(
    el('label', { class: 'field' }, el('span', {}, 'Microphone', helpBtn('inputDevice')),
      select([['', 'System default'], ...ins.map(d => [d.deviceId, d.label || 'Mic'])], settings.inputId, async v => { settings.inputId = v; saveSettings(); try { await reopenMic(); toast('Mic changed.'); } catch { toast('Could not open that mic.'); } })),
    el('label', { class: 'field' }, el('span', {}, 'Output', helpBtn('outputDevice')),
      canSink ? select([['', 'System default'], ...outs.map(d => [d.deviceId, d.label || 'Output'])], settings.outputId, async v => { settings.outputId = v; saveSettings(); await ensureCtx(); E.ctx.setSinkId(v).catch(() => toast('Could not switch output.')); })
        : el('span', { class: 'hint' }, 'This browser cannot pick an output. Use your system sound settings.')),
    el('label', { class: 'field' }, el('span', {}, 'Recording channels', helpBtn('mono')),
      select([['mono', 'Mono (one vocal mic)'], ['stereo', 'Stereo']], settings.mono ? 'mono' : 'stereo', async v => { settings.mono = v === 'mono'; saveSettings(); await reopenMic().catch(() => { }); })),
    el('button', { onclick: () => renderMic() }, 'Refresh list'),
  );
}
function liveMeter(b) {
  const cv = el('canvas', { class: 'bigmeter', width: 600, height: 34 });
  const read = el('div', { class: 'status' });
  peakHist = [];
  const loop = () => {
    if (!document.body.contains(cv)) return;
    const p = E.mic ? peakOf(E.mic.an) : 0, db = p > 0 ? 20 * Math.log10(p) : -100;
    peakHist.push(db); if (peakHist.length > 180) peakHist.shift();
    const mx = Math.max(...peakHist);
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, W, H);
    const x = d => clamp((d + 60) / 60, 0, 1) * W;
    g.fillStyle = '#1d3a22'; g.fillRect(x(-30), 0, x(-6) - x(-30), H);
    g.fillStyle = '#3a3420'; g.fillRect(x(-6), 0, x(-3) - x(-6), H);
    g.fillStyle = '#3a1d1d'; g.fillRect(x(-3), 0, W - x(-3), H);
    g.fillStyle = db > -3 ? '#ff3b3b' : db > -6 ? '#ffd23f' : '#4cd964'; g.fillRect(0, 8, x(db), H - 16);
    g.fillStyle = '#fff'; g.fillRect(x(mx) - 1, 0, 2, H);
    g.font = '10px monospace'; g.fillStyle = '#aaa'; g.fillText('too quiet', 4, 12); g.fillText('good', x(-30) + 4, 12); g.fillText('loud', x(-6) + 2, 12);
    read.textContent = !E.mic ? 'Mic not connected. Go back to step 1.' : mx < -40 ? 'Sing or talk now. If you are, it is too quiet: raise the gain.' : mx < -30 ? 'A bit quiet. Raise the gain or move closer.' : mx > -3 ? 'Too loud, it may distort. Lower the gain or step back.' : 'Good level.';
    wizRaf = requestAnimationFrame(loop);
  };
  b.append(cv, read); loop();
}
async function stepLevel(b) {
  try { await openMic(); } catch { }
  b.append(...para('Sing or rap the loudest part of your song, at the distance you will record (about one hand away from the mic).',
    'Aim for the green zone, with your loudest moments near the yellow. Never red.'));
  liveMeter(b);
  b.append(
    knob('Input gain', 0, 4, 0.01, settings.inputGain, v => { setInputGain(v); saveSettings(); }, v => (v >= 1 ? '+' : '') + (20 * Math.log10(Math.max(v, 0.0001))).toFixed(1) + ' dB', 'inputGain'),
    el('p', { class: 'hint' }, 'If your mic or interface has a physical gain knob, set that first. This slider adds a digital boost on top.'),
    el('div', { class: 'togrow' },
      toggle('Noise reduction', settings.nr, async v => { settings.nr = v; saveSettings(); await reopenMic().catch(() => { }); }, 'noiseReduction'),
      toggle('Auto gain', settings.agc, async v => { settings.agc = v; saveSettings(); await reopenMic().catch(() => { }); }, 'autoGain'),
      toggle('Echo cancel', settings.ec, async v => { settings.ec = v; saveSettings(); await reopenMic().catch(() => { }); }, 'echoCancel')),
  );
}
async function stepNoise(b) {
  try { await openMic(); } catch { }
  b.append(...para('Now stay quiet for 3 seconds. This measures the background noise in your room.'));
  const res = el('div', { class: 'status' });
  b.append(el('span', { class: 'withhelp' }, el('button', { class: 'hot', onclick: async () => {
    if (!E.mic) { res.textContent = 'Mic not connected. Go back to step 1.'; return; }
    res.textContent = 'Measuring. Stay quiet...';
    const vals = [];
    const t0 = performance.now();
    await new Promise(r => { const f = () => { vals.push(rmsOf(E.mic.an)); performance.now() - t0 < 3000 ? setTimeout(f, 50) : r(); }; f(); });
    const avg = vals.reduce((a, v) => a + v, 0) / vals.length, db = avg > 0 ? 20 * Math.log10(avg) : -100;
    res.innerHTML = '';
    res.append(el('b', {}, `Background noise: ${db.toFixed(0)} dB. `),
      db < -60 ? 'Great. Your room is quiet.' : db < -45 ? 'OK. Turn on the noise gate on your vocal track to clean up gaps between lines.'
        : 'Noisy. Turn off fans or AC, close windows, move away from the computer. You can also turn on Noise reduction in the Level step and the Noise gate on your vocal track.');
  } }, 'Measure noise'), helpBtn('noiseFloor')), res);
}
async function stepPhones(b) {
  await ensureCtx();
  b.append(...para('Put on your headphones. Click each button: you should hear a beep only on that side.'),
    el('div', { class: 'togrow' },
      el('button', { onclick: () => testTone(-1) }, 'Beep left'),
      el('button', { onclick: () => testTone(1) }, 'Beep right'),
      el('button', { onclick: () => testTone(0) }, 'Beep both')),
    el('div', { class: 'togrow' }, toggle('Hear myself (monitoring)', settings.monitor, v => { settings.monitor = v; saveSettings(); updateMonitor(); }, 'monitor')),
    el('p', { class: 'hint' }, `Current delay (latency): about ${Math.round(latency() * 1000)} ms. Sample rate: ${E.ctx.sampleRate} Hz.`),
    el('div', { class: 'adv' },
      el('label', { class: 'field' }, el('span', {}, 'Latency mode', helpBtn('latency')),
        select([['interactive', 'Low (best for recording)'], ['balanced', 'Medium'], ['playback', 'High (most stable)']], settings.latency, v => { settings.latency = v; saveSettings(); toast('Reload the page to apply.'); })),
      el('label', { class: 'field' }, el('span', {}, 'Sample rate', helpBtn('sampleRate')),
        select([[0, 'Auto'], [44100, '44100 Hz'], [48000, '48000 Hz'], [96000, '96000 Hz']], settings.sampleRate, v => { settings.sampleRate = +v; saveSettings(); toast('Reload the page to apply.'); })),
      el('button', { onclick: () => location.reload() }, 'Reload now')),
  );
}
async function stepTest(b) {
  b.append(...para('Last step. Record 5 seconds of singing, then listen back. If it sounds clear and not distorted, you are ready.'));
  const st = el('p', { class: 'status' });
  let buf = null;
  const playBtn = el('button', { disabled: true, onclick: async () => { st.textContent = 'Playing...'; await playBuffer(buf); st.textContent = 'How did it sound? If it is distorted, lower the gain. If it is quiet, raise it.'; } }, 'Play it back');
  b.append(el('button', { class: 'hot', onclick: async () => {
    try { await openMic(); } catch { st.textContent = 'Mic not connected. Go back to step 1.'; return; }
    st.textContent = 'Recording for 5 seconds...';
    buf = await testRecord(5);
    st.textContent = 'Done. Click Play it back.'; playBtn.disabled = false;
  } }, 'Record 5 seconds'), playBtn, st);
}

// ---------- learn ----------
export function renderLearn() {
  const view = $('#view'); view.innerHTML = '';
  view.append(el('div', { class: 'learn' },
    el('h1', {}, 'Learn'),
    el('p', { class: 'hint' }, 'Every control in the app has a ? button. Click it to see what it does, when to use it, and good starting settings.'),
    el('div', { class: 'lessons' }, LESSONS.map(l => el('div', { class: 'panel lesson' }, el('h3', {}, l.t), el('ol', {}, l.steps.map(s => el('li', {}, s)))))),
    el('h2', { class: 'h2' }, 'All terms'),
    el('div', { class: 'glossary' }, Object.entries(HELP).sort((a, b) => a[1].t.localeCompare(b[1].t)).map(([k, h]) => el('button', { onclick: () => showHelp(k) }, h.t))),
  ));
}
