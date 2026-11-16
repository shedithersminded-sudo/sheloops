// My sounds: a library built only from files I upload. Also BPM detection.
import { $, el, toast, ask, confirmBox, select, uid } from './util.js';
import { helpBtn } from './help.js';
import { db, saveAudioFile, loadAudio, audioCache, cleanupAudio } from './store.js';
import { ensureCtx } from './engine.js';
import { app } from './state.js';

export let SOUNDS = [];
export async function loadSounds() { SOUNDS = (await db.all('sounds')).sort((a, b) => a.name.localeCompare(b.name)); return SOUNDS; }
export const soundName = id => (SOUNDS.find(s => s.id === id) || {}).name || 'missing sound';
const isAudio = f => /^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|ogg|flac|webm|aif|aiff)$/i.test(f.name);

// ---------- BPM detection ----------
// Onset energy envelope + autocorrelation. Returns { bpm, confidence } or null.
export function detectBpm(buf) {
  const sr = buf.sampleRate, ch = buf.numberOfChannels;
  const start = Math.floor(Math.max(0, buf.duration / 2 - 30) * sr), end = Math.min(buf.length, start + 60 * sr);
  if (end - start < sr * 4) return null;
  const hop = Math.round(sr * 0.01), win = hop * 2; // 10 ms hop
  const env = [];
  let prev = 0;
  const d0 = buf.getChannelData(0), d1 = ch > 1 ? buf.getChannelData(1) : d0;
  for (let i = start; i + win < end; i += hop) {
    let e = 0; for (let j = i; j < i + win; j += 2) { const v = (d0[j] + d1[j]) * 0.5; e += v * v; }
    e = Math.log(1e-6 + e);
    env.push(Math.max(0, e - prev)); prev = e;
  }
  const n = env.length, mean = env.reduce((a, v) => a + v, 0) / n;
  for (let i = 0; i < n; i++) env[i] -= mean;
  const minLag = Math.floor(60 / 180 / 0.01), maxLag = Math.ceil(60 / 65 / 0.01);
  const ac = new Float64Array(maxLag + 2);
  for (let L = minLag - 1; L <= maxLag + 1; L++) { let s = 0; for (let i = 0; i + L < n; i++) s += env[i] * env[i + L]; ac[L] = s / (n - L); }
  // score each tempo by its lag plus the double lag (bar-level support), prefer 75..160
  let best = -Infinity, bl = 0, sum = 0, cnt = 0;
  for (let L = minLag; L <= maxLag; L++) {
    const bpm = 6000 / L;
    const w = bpm >= 75 && bpm <= 160 ? 1 : 0.8;
    const sc = (ac[L] + 0.5 * (ac[2 * L] || 0)) * w;
    sum += Math.abs(ac[L]); cnt++;
    if (sc > best) { best = sc; bl = L; }
  }
  const a = ac[bl - 1], b = ac[bl], c = ac[bl + 1], den = a - 2 * b + c;
  const lag = den ? bl + 0.5 * (a - c) / den : bl;
  let bpm = 6000 / lag;
  while (bpm < 70) bpm *= 2; while (bpm > 180) bpm /= 2;
  return { bpm: Math.round(bpm), confidence: best / (sum / cnt || 1) };
}

// ---------- import ----------
export async function importSounds(files, folder = 'Unsorted') {
  const c = await ensureCtx();
  let n = 0;
  for (const f of files) {
    if (!isAudio(f)) continue;
    try {
      const buf = await c.decodeAudioData(await f.arrayBuffer());
      const id = 's' + uid();
      const kind = buf.duration < 2.5 ? 'one-shot' : 'loop';
      const bpm = kind === 'loop' ? (detectBpm(buf) || {}).bpm || null : null;
      await saveAudioFile(id, f, buf);
      await db.put('sounds', id, { id, name: f.name.replace(/\.[^.]+$/, ''), folder, fav: false, kind, dur: buf.duration, bpm, added: Date.now() });
      n++;
    } catch { toast('Could not read ' + f.name); }
  }
  await loadSounds();
  return n;
}
export async function soundBuffer(id) { return audioCache.get(id) || loadAudio(id); }

let previewSrc = null;
export async function playSound(id) {
  const c = await ensureCtx();
  if (previewSrc) { try { previewSrc.stop(); } catch { } previewSrc = null; }
  const b = await soundBuffer(id); if (!b) return toast('That sound is missing.');
  const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start();
  previewSrc = s; s.onended = () => { if (previewSrc === s) previewSrc = null; };
}
export const isPreviewing = () => !!previewSrc;
export function stopSound() { if (previewSrc) { try { previewSrc.stop(); } catch { } previewSrc = null; } }

// ---------- page ----------
const F = { folder: '', kind: '', q: '', fav: false };
export async function renderLibrary() {
  const view = $('#view'); view.innerHTML = '';
  await loadSounds();
  if (app.view !== 'sounds') return;
  const fileIn = el('input', { type: 'file', accept: 'audio/*', multiple: true, hidden: true, onchange: async e => { const fs = [...e.target.files]; e.target.value = ''; await doImport(fs); } });
  const folders = [...new Set(SOUNDS.map(s => s.folder))].sort();
  const list = SOUNDS.filter(s => (!F.folder || s.folder === F.folder) && (!F.kind || s.kind === F.kind) && (!F.fav || s.fav) && (!F.q || s.name.toLowerCase().includes(F.q.toLowerCase())));
  const dz = el('div', { class: 'dropzone wide' }, el('b', {}, 'Drop sounds here'), el('span', {}, 'Drums, one-shots, loops, samples, vocals. MP3, WAV and most audio files. Short sounds become one-shots, longer ones become loops (with BPM detected).'));
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', async e => { e.preventDefault(); dz.classList.remove('over'); await doImport([...e.dataTransfer.files]); });
  const rows = el('div', { class: 'snd-list' });
  if (!list.length) rows.append(el('p', { class: 'empty' }, SOUNDS.length ? 'Nothing matches these filters.' : 'No sounds yet. Upload some to build your own library.'));
  for (const s of list) rows.append(el('div', { class: 'snd', draggable: 'true', ondragstart: e => { e.dataTransfer.setData('loopden/sound', s.id); e.dataTransfer.effectAllowed = 'copy'; } },
    el('button', { class: 'sq play', title: 'Play', onclick: () => playSound(s.id) }, '▶'),
    el('b', { class: 'snd-name' }, s.name),
    el('span', { class: 'badge ' + (s.kind === 'loop' ? 'loop' : '') }, s.kind),
    el('small', {}, s.dur.toFixed(1) + 's'),
    el('small', {}, s.bpm ? s.bpm + ' BPM' : ''),
    el('small', { class: 'snd-folder' }, s.folder),
    el('button', { class: 'star' + (s.fav ? ' on' : ''), title: 'Favorite', onclick: async () => { s.fav = !s.fav; await db.put('sounds', s.id, s); renderLibrary(); } }, s.fav ? '★' : '☆'),
    el('button', { onclick: async () => { const n = await ask('Rename sound', 'Name', s.name); if (n) { s.name = n; await db.put('sounds', s.id, s); renderLibrary(); } } }, 'Rename'),
    el('button', { onclick: async () => { const n = await ask('Folder', 'Folder name', s.folder); if (n) { s.folder = n; await db.put('sounds', s.id, s); renderLibrary(); } } }, 'Folder'),
    el('button', { class: 'adv', title: 'Set the tempo by hand', onclick: async () => { const n = await ask('Loop BPM', 'BPM', s.bpm || ''); if (n) { s.bpm = Math.round(+n) || null; await db.put('sounds', s.id, s); renderLibrary(); } } }, 'BPM'),
    el('button', { class: 'danger', onclick: async () => {
      if (!await confirmBox('Delete sound', `Delete "${s.name}"? Songs and kits that use it will go silent on that sound.`, 'Delete')) return;
      await db.del('sounds', s.id); await cleanupAudio(); renderLibrary();
    } }, 'Delete')));
  view.append(el('div', { class: 'library' },
    el('div', { class: 'ptop' }, el('h1', {}, 'My sounds'), helpBtn('library'),
      el('button', { class: 'hot', onclick: () => fileIn.click() }, 'Upload sounds'), fileIn),
    dz,
    el('div', { class: 'fxtop' },
      el('input', { class: 'textin search', placeholder: 'Search', value: F.q, oninput: e => { F.q = e.target.value; clearTimeout(window._sq); window._sq = setTimeout(renderLibrary, 250); } }),
      select([['', 'All folders'], ...folders], F.folder, v => { F.folder = v; renderLibrary(); }),
      select([['', 'All types'], ['one-shot', 'One-shots'], ['loop', 'Loops']], F.kind, v => { F.kind = v; renderLibrary(); }),
      el('button', { class: 'chip' + (F.fav ? ' on' : ''), onclick: () => { F.fav = !F.fav; renderLibrary(); } }, '★ Favorites'),
      el('span', { class: 'hint' }, `${SOUNDS.length} sounds. Drag a sound onto the Studio timeline, or use it in the Beat tab.`)),
    rows));
  const s = view.querySelector('.search'); if (F.q && s) { s.focus(); s.setSelectionRange(F.q.length, F.q.length); }
}
async function doImport(files) {
  const folder = await ask('Add sounds', 'Put them in folder', F.folder || 'Unsorted'); if (folder == null) return;
  toast('Importing...');
  const n = await importSounds(files, folder);
  toast(n ? `Added ${n} sound${n === 1 ? '' : 's'}.` : 'No audio files found.');
  renderLibrary();
}
