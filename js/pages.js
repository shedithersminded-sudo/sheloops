// Home, projects, mic setup, learn.
import { $, el, clamp, toast, toggle, select, knob, ask, confirmBox, modal } from './util.js';
import { HELP, LESSONS, helpBtn, showHelp } from './help.js';
import { app, newProject, openProject, flush, emit, save } from './state.js';
import { db, settings, saveSettings, cleanupAudio } from './store.js';
import { E, ensureCtx, openMic, reopenMic, setInputGain, peakOf, rmsOf, testRecord, playBuffer, testTone, latency, updateMonitor } from './engine.js';
import { importBeatFile } from './studio.js';
import { U, check, whatsNew, install } from './update.js';
import { exportSongFile, exportEverything, openSheloopsFile } from './exporter.js';
import { look, saveLook, applyLook, allThemes, applyGlow, UIFX_PRESETS, applyUiFx, derive, HEAD_FONTS, applyHeadFont } from './look.js';
import { STARTERS } from './state.js';

const go = v => emit('goto:' + v);
const ago = ts => { const s = (Date.now() - ts) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : new Date(ts).toLocaleDateString(); };
const coverEl = (p, cls = 'cover') => p.cover ? el('img', { class: cls, src: p.cover, alt: '' }) : el('div', { class: cls + ' blank' }, (p.name || '?').slice(0, 2).toUpperCase());

export async function createSong(withFile, style) {
  const name = await ask('New song', 'Song name', style ? style + ' song' : 'New song');
  if (!name) return;
  const keep = settings.defaultStarter; if (style) settings.defaultStarter = style;
  const p = newProject(name);
  settings.defaultStarter = keep;
  if (withFile) { p.beat.mute = true; }
  await db.put('projects', p.id, p);
  await openProject(p);
  if (withFile) { go('studio'); await importBeatFile(withFile); }
  else go(withFile === false ? 'beat' : 'studio');
}
function pickFile(accept) {
  return new Promise(res => { const i = el('input', { type: 'file', accept }); i.onchange = () => res(i.files[0] || null); i.click(); });
}

// ---------- welcome guide on Home: make it yours, Simple vs Advanced, what you can make ----------
const GENRES = [['Trap', 'hard 808s'], ['Drill', 'sliding bass'], ['R&B', 'smooth'], ['Hip-Hop', 'boom bap'], ['Afrobeats', 'bouncy'], ['Pop', 'bright'], ['Lo-fi', 'dusty chill'],
  ['Jungle', 'chopped breaks'], ['Drum & Bass', 'fast and deep'], ['Breakcore', 'chaos breaks'], ['Heavenly Breakcore', 'dreamy and fast'], ['Lonely Breakcore', 'sad piano'],
  ['Outsider House', 'dusty house'], ['Healing House', 'warm and soft'], ['Get Lost', 'dreamy and slow'], ['Starlight Pop', 'glossy dance'], ['Ambient Breaks', 'dreamy breaks'], ['Euphoric Trance', 'uplifting'], ['Acid House', 'squelchy'], ['Rave Breaks', 'hoovers'], ['Gospel', 'church keys'], ['Soul', 'warm']];
function welcome() {
  const open = !settings.hideWelcome;
  const step = (n, title, text, ...kids) => el('div', { class: 'wcard' }, el('div', { class: 'wnum' }, n), el('b', {}, title), el('p', {}, text), ...kids);
  const themes = settings.simple ? allThemes().slice(0, 8) : allThemes();
  const cards = [
      step('1', 'Make it yours', 'Your studio can look and feel any way you want. Here is everything you can change:',
        el('div', { class: 'wcan' }, ...[['Theme colors', 'look'], ['Your own palette', 'look'], ['Glow, pulse and flash', 'look'], ['Text glow and color', 'look'], ['Fonts', 'look'], ['Background', 'look'], ['Mouse effects', 'look'], ['CD player and visualizer', 'look'], ['Your logo', 'look'], ['Move sections around', 'studio']].map(([l, v]) => el('button', { class: 'wcanchip', onclick: () => go(v) }, l))),
        el('div', { class: 'wsub' }, '1. Pick a theme'),
        el('div', { class: 'wthemes' }, themes.map(t => el('button', { class: 'wtheme' + (t.id === look.theme ? ' on' : ''), title: t.name, style: `--tb:${t.c.bg};--ta:${t.c.led};--tt:${t.c.text}`, onclick: async e => { look.theme = t.id; saveLook(); await applyLook(); e.currentTarget.closest('.wthemes').querySelectorAll('.wtheme').forEach(b => b.classList.toggle('on', b === e.currentTarget)); toast(`Theme: ${t.name}.`); } }, el('i'), el('span', {}, t.name)))),
        settings.simple ? el('small', { class: 'hint' }, `${allThemes().length} themes in all. See them in Appearance, or switch to Advanced to see them here.`) : null,
        el('div', { class: 'wsub' }, '2. Pick a feel'),
        el('div', { class: 'wrow' }, ...Object.keys(UIFX_PRESETS).map(n => el('button', { class: 'wfeel' + (Object.entries(UIFX_PRESETS[n]).every(([k, v]) => look.uifx[k] === v) ? ' on' : ''), title: { 'Clean pro': 'No glow, calm motion', 'Calm studio': 'Soft glow that breathes slowly', 'Neon club': 'Bright neon glow, lively', 'Party': 'Max glow, throbbing and flashing' }[n], onclick: e => { Object.assign(look.uifx, UIFX_PRESETS[n]); saveLook(); applyUiFx(); e.currentTarget.parentNode.querySelectorAll('.wfeel').forEach(b => b.classList.toggle('on', b === e.currentTarget)); toast(`Feel: ${n}.`); } }, n))),
        el('div', { class: 'wsub' }, '3. Make your own colors'),
        settings.simple ? el('div', { class: 'wrow' }, el('button', { class: 'hot', onclick: () => go('look') }, 'Open Appearance to make my palette'))
          : (() => { const c = { bg: '#120a1a', a: '#ff5ca8', t: '#fff0f8' }; const inp = (k, l) => el('label', { class: 'num' }, l, el('input', { type: 'color', value: c[k], oninput: e => c[k] = e.target.value }));
            return el('div', { class: 'wrow wpal' }, inp('bg', 'Background'), inp('a', 'Accent'), inp('t', 'Text'), el('button', { class: 'hot', onclick: async () => { const n = await ask('Name your theme', 'Name', 'My palette'); if (!n) return; const t = { id: 'my-' + Math.random().toString(36).slice(2, 9), name: n, c: derive(c.bg, c.a, c.t), tracks: [c.a] }; look.themes.push(t); look.theme = t.id; saveLook(); await applyLook(); toast(`"${n}" made and turned on. Fine-tune every color in Appearance.`); go('home'); } }, 'Make my theme')); })(),
        el('div', { class: 'wrow' },
          el('button', { class: 'tog' + (look.glow && look.glow.on ? ' on' : ''), onclick: e => { look.glow.on = !look.glow.on; saveLook(); applyGlow(); e.target.classList.toggle('on', look.glow.on); e.target.textContent = look.glow.on ? 'Text glow ON' : 'Text glow OFF'; } }, look.glow && look.glow.on ? 'Text glow ON' : 'Text glow OFF'),
          el('button', { onclick: () => go('look') }, 'Everything else in Appearance'))),
      step('2', 'Simple or Advanced', settings.simple
        ? 'You are in Simple mode: fewer buttons, and every screen explains itself in plain words. Switch to Advanced when you want every knob and tool.'
        : 'You are in Advanced mode: every tool and knob is out. Switch to Simple for fewer buttons and plain-word explanations on every screen.',
        el('div', { class: 'wmodes' },
          el('button', { class: 'wmode' + (settings.simple ? ' on' : ''), onclick: () => setMode(true) }, el('b', {}, 'Simple'), el('small', {}, 'Explains everything. Best to start.')),
          el('button', { class: 'wmode' + (!settings.simple ? ' on' : ''), onclick: () => setMode(false) }, el('b', {}, 'Advanced'), el('small', {}, 'All tools, mixer, automation, effects chain.'))),
        el('p', { class: 'hint' }, 'The same switch is always at the top right. Press ? on any screen for the keys, and click any ? button to learn what something does.')),
      step('3', 'What do you want to make?', 'Pick a style. You get a new song with a ready beat in that style, then you can change everything.',
        el('div', { class: 'wgenres' }, GENRES.filter(([g]) => STARTERS[g]).map(([g, s]) => el('button', { class: 'wgenre', onclick: () => createSong(false, g) }, el('b', {}, g), el('small', {}, s)))),
        el('div', { class: 'wrow' }, el('button', { onclick: () => go('pads') }, 'Or tap a beat on the Pad machine'), el('button', { onclick: () => go('learn') }, 'Step by step lessons'))),
    step('4', 'Pick your lettering', 'Choose the font for every title and big word in the app. Your body text font is in Appearance.',
      el('div', { class: 'wfonts' }, ...HEAD_FONTS.map(([f, n]) => el('button', { class: 'wfont' + ((look.headFont || 'Bungee') === f ? ' on' : ''), style: `font-family:"${f}"`, onclick: e => { look.headFont = f === 'Bungee' ? '' : f; saveLook(); applyHeadFont(); e.currentTarget.parentNode.querySelectorAll('.wfont').forEach(b => b.classList.toggle('on', b === e.currentTarget)); toast(`Titles now use ${f}.`); } }, el('b', {}, 'SheLoops'), el('small', {}, n))))),
  ];
  const tabs = [['Make it yours', 'Colors, feel, glow'], ['Simple or Advanced', 'How much you see'], ['Start a style', 'A ready beat in one click'], ['Lettering', 'Fonts for titles']];
  let cur = clamp(settings.welcomeTab || 0, 0, cards.length - 1);
  const body = el('div', { class: 'wbody' }, cards[cur]);
  const bar = el('div', { class: 'wtabs' }, ...tabs.map(([t, sub], i) => el('button', { class: 'wtab' + (i === cur ? ' on' : ''), style: `--i:${i}`, onclick: e => {
    if (i === cur) return; const dir = i > cur ? 1 : -1; cur = i; settings.welcomeTab = i; saveSettings();
    bar.querySelectorAll('.wtab').forEach(b => b.classList.toggle('on', b === e.currentTarget));
    const next = cards[i]; next.style.setProperty('--dir', dir); next.classList.remove('slidein'); void next.offsetWidth; next.classList.add('slidein'); body.replaceChildren(next);
  } }, el('span', { class: 'wtnum' }, String(i + 1).padStart(2, '0')), el('b', {}, t), el('small', {}, sub))));
  const d = el('details', { class: 'welcome', open },
    el('summary', {}, el('span', { class: 'wled' }), scatter('Welcome to your studio'), el('small', {}, open ? 'Click to fold' : 'Click to open')),
    el('div', { class: 'wlayout' }, bar, body));
  d.addEventListener('toggle', () => { settings.hideWelcome = !d.open; saveSettings(); d.querySelector('summary small').textContent = d.open ? 'Click to fold' : 'Click to open'; });
  return d;
}
// big words with letters that sit a little off and float, so titles never look flat
function scatter(text, cls = 'scatter') {
  return el('span', { class: cls, 'aria-label': text }, ...[...text].map((ch, i) => ch === ' ' ? el('span', { class: 'sp' }, ' ') : el('span', { class: 'ch', style: `--r:${((i * 37) % 9) - 4}deg;--y:${((i * 53) % 7) - 3}px;--d:${(i % 7) * 0.12}s` }, ch)));
}
// ---------- the journey: the steps of making a song, lit up as you go ----------
const JOURNEY = [
  ['mic', 'Set up', 'Plug in your mic or headphones and test them.', 'Mic setup', () => settings.wizardDone, 'mic', 'You can skip this and use your laptop mic.'],
  ['beat', 'Get a beat', 'Drop in a beat file, start a style, make one in the beat maker, or tap one on the pads.', 'Beat maker', P => P && (P.tracks.some(t => t.kind === 'file' && t.clips.length) || P.beat.tracks.some(t => (t.notes || []).length || (t.rows || []).some(r => r.steps.some(Boolean)))), 'beat', 'Try a style on the Start a style tab above for a ready beat.'],
  ['record', 'Record', 'Rap or sing over your beat. Every take is kept.', 'Studio', P => P && P.tracks.some(t => t.kind !== 'file' && t.clips.length), 'studio', 'Press R in the Studio to record. A click counts you in.'],
  ['shape', 'Shape your sound', 'Pick a vocal style, stack Enhance and Voice FX, and turn the knobs.', 'Vocal presets', P => P && P.tracks.some(t => (t.fx || []).length), 'studio', 'Check my voice in Fix my voice finds problems for you.'],
  ['mix', 'Mix and master', 'Balance the levels, then make it loud and polished.', 'Master', () => (settings.visited || []).includes('master'), 'master', 'Pick a mastering style and compare before and after.'],
  ['cover', 'Cover art', 'Design the cover, the CD and the case.', 'Cover art', P => P && !!P.coverDesign, 'art', 'Your own pictures and GIFs work on covers and discs.'],
  ['share', 'Share it', 'Export your song as MP3 or WAV, or play it in the Player.', 'Export', () => (settings.visited || []).includes('export'), 'export', 'Export everything to keep a backup of all your work.'],
];
function journey(P) {
  const done = JOURNEY.map(j => !!j[4](P)), next = done.indexOf(false), pct = done.filter(Boolean).length / JOURNEY.length;
  let open = settings.journeyOpen ?? (next < 0 ? 0 : next);
  const detail = el('div', { class: 'jdetail' });
  const show = i => {
    open = i; settings.journeyOpen = i; saveSettings();
    const [, title, what, where, , view, tip] = JOURNEY[i];
    nodes.querySelectorAll('.jnode').forEach((n, k) => n.classList.toggle('open', k === i));
    detail.replaceChildren(el('div', { class: 'jcard' },
      el('div', { class: 'jcardhead' }, el('span', { class: 'jstate ' + (done[i] ? 'done' : i === next ? 'next' : '') }, done[i] ? 'Done' : i === next ? 'Next step' : 'Later'), el('b', {}, title)),
      el('p', {}, what), el('p', { class: 'jtip' }, el('b', {}, 'Tip: '), tip),
      el('button', { class: 'hot', onclick: () => view === 'export' ? import('./exporter.js').then(m => m.openExport()) : view === 'beat' || view === 'studio' || view === 'master' ? (app.P ? go(view) : createSong(view === 'beat' ? false : null)) : go(view) }, 'Go to ' + where + ' →')));
  };
  const nodes = el('div', { class: 'jnodes', style: `--pct:${pct}` }, el('div', { class: 'jline' }, el('i')),
    ...JOURNEY.map((j, i) => el('button', { class: 'jnode' + (done[i] ? ' done' : '') + (i === next ? ' next' : ''), style: `--i:${i}`, onclick: () => show(i) },
      el('span', { class: 'jdot' }, done[i] ? '✓' : i + 1), el('b', {}, j[1]))));
  const box = el('div', { class: 'journey panel reveal' },
    el('div', { class: 'jhead' }, el('h2', { class: 'jtitle' }, scatter('Your song, step by step')), el('small', {}, next < 0 ? 'Every step done. Make another one!' : `${Math.round(pct * 100)}% done · next: ${JOURNEY[next][1]}`)),
    nodes, detail);
  show(open); return box;
}
// ---------- explore: every tool, grouped, revealed as you scroll ----------
const EXPLORE = [
  ['Create', 'Make music', [['studio', 'Studio', 'Record, takes, vocal effects'], ['beat', 'Beat maker', 'Drums, 75 instruments, guitar'], ['pads', 'Pad machine', '128 pads, loops, voice loops'], ['dj', 'DJ booth', 'Mix, scratch, transitions, visuals']]],
  ['Shape', 'Make it sound right', [['fix', 'Fix my voice', 'Finds and fixes problems'], ['presets', 'Vocal presets', '172 styles and effects'], ['build', 'Build my sound', 'Pick a vibe, shape it'], ['sounds', 'My sounds', 'Your drums, loops and recordings']]],
  ['Finish', 'Make it done', [['mixer', 'Mixer', 'Faders, meters, groups'], ['master', 'Master', 'Loud and polished'], ['export', 'Export', 'MP3, WAV, stems, backups'], ['player', 'Player', 'Listen with your covers']]],
  ['Design', 'Make it yours', [['art', 'Cover art', 'Covers, CDs, cases, GIFs'], ['look', 'Appearance', 'Themes, glow, fonts, mouse'], ['profile', 'My sound', 'Your artist profile']]],
  ['Learn', 'Get better', [['learn', 'Lessons', 'Step by step'], ['mic', 'Mic setup', 'Test your mic'], ['projects', 'Projects', 'All your songs']]],
];
function explore(P) {
  const open = (v) => {
    if (v === 'export') return import('./exporter.js').then(m => m.openExport());
    if (['fix', 'presets', 'build'].includes(v)) { settings.inspTab = v; saveSettings(); return P ? go('studio') : createSong(null); }
    if (['studio', 'mixer', 'master', 'beat'].includes(v) && !P) return createSong(v === 'beat' ? false : null);
    go(v);
  };
  return el('div', { class: 'explore' },
    el('h2', { class: 'jtitle reveal' }, scatter('Explore everything')),
    ...EXPLORE.map(([cat, sub, items], ci) => el('div', { class: 'xrow reveal', style: `--ci:${ci}` },
      el('div', { class: 'xhead' }, el('b', {}, cat), el('small', {}, sub)),
      el('div', { class: 'xcards' }, ...items.map(([v, t, w], k) => el('button', { class: 'xcard', style: `--k:${k}`, onclick: () => open(v) }, el('span', { class: 'xnum' }, String(ci * 4 + k + 1).padStart(2, '0')), el('b', {}, t), el('small', {}, w), el('span', { class: 'xgo' }, '→')))))));
}
function revealOnScroll(root) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('inview'); io.unobserve(e.target); } }), { threshold: 0.12 });
  root.querySelectorAll('.reveal').forEach(n => io.observe(n));
}
function setMode(v) { settings.simple = v; saveSettings(); document.body.classList.toggle('simple', v); emit('modechange'); toast(v ? 'Simple mode: plain explanations everywhere.' : 'Advanced mode: every tool is out.'); }

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
// a slow scrolling strip like a hi-fi display
function ticker(P, all) {
  const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const bits = P ? [`now loaded: ${P.name}`, `${P.bpm} bpm`, `${KEYS[P.beat.key]} ${P.beat.scale === 'off' ? '' : P.beat.scale}`.trim(), `${P.tracks.length} vocal track${P.tracks.length === 1 ? '' : 's'}`, `${P.beat.tracks.length} beat track${P.beat.tracks.length === 1 ? '' : 's'}`]
    : ['no song loaded', 'drop a beat to start'];
  bits.push(`${all.length} song${all.length === 1 ? '' : 's'} in your crate`, 'press ? for keys', 'sheloops studio');
  const line = bits.join('  ✦  ') + '  ✦  ';
  return el('div', { class: 'ticker', 'aria-hidden': 'true' }, el('span', { class: 'led' }), el('div', { class: 'ticker-track' }, el('span', {}, line), el('span', {}, line)));
}
let homeToken = 0;
export async function renderHome() {
  const my = ++homeToken; // only the newest call may draw, so Home never shows twice
  const all = (await db.all('projects')).sort((a, b) => b.updated - a.updated);
  if (app.view !== 'home' || my !== homeToken) return;
  const view = $('#view'); view.innerHTML = '';
  const P = app.P;
  const home = el('div', { class: 'home' },
    el('div', { class: 'hero panel' },
      P ? coverEl(P, 'cover big') : null,
      heroLogo(),
      el('div', { class: 'hero-text' },
        el('small', {}, P ? 'Current song' : 'Welcome'), el('h1', {}, scatter(P ? P.name : "Let's make something", 'scatter big')),
        P && P.artist ? el('p', {}, P.artist) : null,
        el('div', { class: 'wrow' },
          P ? el('button', { class: 'hot', onclick: () => go('studio') }, 'Continue in the studio') : el('button', { class: 'hot', onclick: () => createSong(null) }, 'Start a new song'),
          el('button', { onclick: async () => { const f = await pickFile('audio/*'); if (f) createSong(f); } }, 'Start with my beat'))),
      el('div', { class: 'dropzone', id: 'homedrop' }, el('b', {}, 'Drop a beat file here'), el('span', {}, 'Starts a new song with your beat, ready to record.')),
    ),
    ticker(P, all),
    welcome(),
    journey(P),
    explore(P),
    all.length ? el('div', {}, el('h2', { class: 'h2' }, 'Recent songs'),
      el('div', { class: 'recent' }, all.slice(0, 6).map(p => el('button', { class: 'recent-card', onclick: async () => { await openProject(p); go('studio'); } },
        coverEl(p), el('b', {}, p.name), el('small', {}, ago(p.updated)))))) : null,
    updatesPanel(),
  );
  view.append(home);
  revealOnScroll(home);
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
      el('button', { title: 'Save this song as a .sheloops file', onclick: () => exportSongFile(p) }, 'Export'),
      el('button', { onclick: () => copyProject(p, p.name + ' copy') }, 'Duplicate'),
      el('button', { title: 'Saves a frozen copy you can go back to', onclick: () => copyProject(p, `${p.name} (version ${new Date().toLocaleString()})`) }, 'Save version'),
      el('button', { class: 'danger', onclick: () => deleteProject(p) }, 'Delete'),
    ));
  view.append(el('div', { class: 'projects' },
    el('div', { class: 'ptop' }, el('h1', {}, 'My projects'),
      el('button', { class: 'hot', onclick: () => createSong(null) }, 'New song'),
      el('button', { onclick: async () => { const f = await pickFile('audio/*'); if (f) createSong(f); } }, 'New song from my beat'),
      el('button', { onclick: () => openSheloopsFile(renderProjects) }, 'Open a .sheloops file'),
      el('button', { onclick: () => exportEverything() }, 'Export everything'), helpBtn('exportAll')),
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
