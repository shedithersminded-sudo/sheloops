// Export window: songs, beats, tracks, project files and a full backup. Plus opening .sheloops files.
import { el, toast, modal, download, uid } from './util.js';
import { helpBtn } from './help.js';
import { app, flush, emit } from './state.js';
import { db, audioIdsOf } from './store.js';
import { renderSong, encodeWav } from './engine.js';
import { studioData, applyStudioData } from './profile.js';

const fileName = (s, fallback = 'song') => (String(s || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || fallback).slice(0, 120);
const toURL = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
const fromURL = async url => (await fetch(url)).blob();
const busy = async (msg, fn) => { toast(msg); try { await fn(); } catch (e) { console.error(e); toast('Export failed: ' + (e.message || e)); } };

// one stored audio record -> portable { url, name }
async function packAudio(id) {
  const d = await db.get('audio', id);
  if (!d) return null;
  if (d.blob) return { url: await toURL(d.blob), name: d.name || 'audio' };
  if (d.img) return { url: await toURL(d.img), name: d.name || 'image', img: true };
  if (d.ch) {
    const buf = new AudioBuffer({ length: d.ch[0].length, numberOfChannels: d.ch.length, sampleRate: d.sr });
    d.ch.forEach((c, i) => buf.copyToChannel(c, i));
    return { url: await toURL(encodeWav(buf)), name: 'recording.wav' };
  }
  return null;
}
async function packAudios(ids) {
  const out = {};
  for (const id of ids) { const a = await packAudio(id); if (a) out[id] = a; }
  return out;
}
async function packSong(p) {
  const ids = audioIdsOf(p), sounds = [];
  for (const id of ids) { const s = await db.get('sounds', id); if (s) sounds.push(s); }
  return { project: p, audio: await packAudios(ids), sounds };
}
const saveJSON = (obj, name) => download(new Blob([JSON.stringify(obj)], { type: 'application/json' }), name);

export async function exportSongFile(p, name) {
  if (app.P && app.P.id === p.id) { await flush(); p = app.P; }
  await busy('Packing your song...', async () => {
    saveJSON({ app: 'SHELOOPS', kind: 'song', v: 1, saved: new Date().toISOString(), ...(await packSong(p)) }, fileName(name || p.name) + '.sheloops');
    toast('Song file saved to your downloads.');
  });
}
export async function exportEverything(name = 'my-sheloops-everything') {
  await flush();
  await busy('Packing everything. Big libraries can take a minute...', async () => {
    const projects = await db.all('projects'), sounds = await db.all('sounds'), designs = await db.all('designs'), art = await db.all('art');
    const ids = new Set(); for (const p of projects) for (const id of audioIdsOf(p)) ids.add(id);
    for (const s of sounds) ids.add(s.id);
    const artOut = []; for (const a of art) artOut.push({ ...a, blob: undefined, url: a.blob ? await toURL(a.blob) : null });
    saveJSON({ app: 'SHELOOPS', kind: 'everything', v: 1, saved: new Date().toISOString(), projects, sounds, designs, art: artOut, audio: await packAudios(ids), studio: await studioData() }, fileName(name) + '.sheloops');
    toast(`Saved everything: ${projects.length} songs, ${sounds.length} sounds, ${designs.length} designs.`);
  });
}

// ---------- open a file ----------
async function putAudio(audio = {}) {
  for (const [id, a] of Object.entries(audio)) {
    if (await db.get('audio', id)) continue;
    const blob = await fromURL(a.url);
    await db.put('audio', id, a.img ? { img: blob, name: a.name } : { blob, name: a.name });
  }
}
async function putProject(p) {
  if (await db.get('projects', p.id)) { p = { ...p, id: uid(), name: p.name + ' (opened copy)' }; }
  p.updated = Date.now();
  await db.put('projects', p.id, p);
  return p;
}
async function putMissing(store, list = []) { let n = 0; for (const x of list) if (x && x.id && !(await db.get(store, x.id))) { await db.put(store, x.id, x); n++; } return n; }

export function openSheloopsFile(after) {
  const inp = el('input', { type: 'file', accept: '.sheloops,.json,application/json' });
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    toast('Opening ' + f.name + '...');
    try { toast(await importData(JSON.parse(await f.text()))); emit('meta'); after?.(); }
    catch (e) { console.error(e); toast('Could not open that file. It needs to be a .sheloops file.'); }
  };
  inp.click();
}
// returns a short message saying what was added
export async function importData(d) {
  if (!d || d.app !== 'SHELOOPS') throw new Error('not a SHELOOPS file');
  if (d.kind === 'song') {
    await putAudio(d.audio); await putMissing('sounds', d.sounds);
    const p = await putProject(d.project);
    return `"${p.name}" added to My projects.`;
  }
  if (d.kind === 'everything') {
    await putAudio(d.audio);
    for (const p of d.projects || []) await putProject(p);
    const s = await putMissing('sounds', d.sounds), ds = await putMissing('designs', d.designs);
    const art = []; for (const a of d.art || []) if (a.url) { const { url, ...rest } = a; art.push({ ...rest, blob: await fromURL(url) }); }
    await putMissing('art', art);
    if (d.studio) await applyStudioData(d.studio);
    return `Opened: ${(d.projects || []).length} songs, ${s} new sounds, ${ds} new designs.`;
  }
  if (d.kind === 'studio') { const n = await applyStudioData(d); return `Studio setup loaded. ${n} new presets.`; }
  throw new Error('unknown file');
}

// ---------- the Export window ----------
export function openExport() {
  import('./store.js').then(({ settings, saveSettings }) => { settings.visited ||= []; if (!settings.visited.includes('export')) { settings.visited.push('export'); saveSettings(); } });
  const P = app.P, hasMp3 = !!window.lamejs;
  let name = P ? (P.artist ? P.artist + ' - ' : '') + P.name : 'my-sheloops';
  let fmt = 'wav';
  const nameIn = el('input', { value: name, oninput: e => name = e.target.value, spellcheck: 'false' });
  const fmtSel = el('div', { class: 'seg' }, [['wav', 'WAV (best quality)'], ['mp3', 'MP3 (small, for sharing)']].map(([v, l]) => {
    const b = el('button', { class: v === fmt ? 'on' : '', disabled: v === 'mp3' && !hasMp3, onclick: () => { fmt = v; for (const x of fmtSel.children) x.classList.toggle('on', x === b); } }, l); return b; }));
  const audioOut = async (buf, suffix = '') => {
    const n = fileName(name) + suffix;
    if (fmt === 'mp3') { const { encodeMp3 } = await import('./mp3.js'); download(await encodeMp3(buf, P), n + '.mp3'); }
    else download(encodeWav(buf), n + '.wav');
  };
  const row = (title, text, label, fn, help, needSong = true) => el('div', { class: 'exrow' + (needSong && !P ? ' off' : '') },
    el('div', {}, el('b', {}, title, help ? helpBtn(help) : null), el('small', {}, text)),
    el('button', { class: 'hot', disabled: needSong && !P, onclick: fn }, label));
  const body = el('div', { class: 'exporter' },
    el('label', { class: 'field' }, el('span', {}, 'File name ', helpBtn('exportName')), nameIn),
    el('div', { class: 'field' }, el('span', {}, 'Audio format'), fmtSel, hasMp3 ? null : el('small', { class: 'hint' }, 'MP3 needs vendor/lame.min.js.')),
    el('div', { class: 'exgroup' }, 'Audio'),
    row('Whole song', 'Everything mixed and mastered, ready to post.', 'Export song', () => busy('Rendering your song...', async () => { await audioOut(await renderSong()); toast('Song saved to your downloads.'); }), 'exportSong'),
    row('Beat only', 'Just the beat maker part, no vocals. Good for sending to other singers.', 'Export beat', () => busy('Rendering the beat...', async () => { await audioOut(await renderSong('beat'), ' (beat)'); toast('Beat saved to your downloads.'); }), 'exportBeat'),
    row('Vocals only', 'Every recorded track without the beat (acapella).', 'Export vocals', () => busy('Rendering vocals...', async () => {
      const vt = P.tracks.filter(t => !t.mute); if (!vt.length) throw new Error('no recorded tracks yet');
      let mix = null; for (const t of vt) { const b = await renderSong(t.id, true); if (!mix) mix = b; else for (let c = 0; c < 2; c++) { const a = mix.getChannelData(c), x = b.getChannelData(c); for (let i = 0; i < Math.min(a.length, x.length); i++) a[i] += x[i]; } }
      await audioOut(mix, ' (vocals)'); toast('Vocals saved to your downloads.'); }), 'exportVocals'),
    row('Each track on its own', 'One file per track (stems), for mixing somewhere else.', 'Export tracks', () => busy('Rendering tracks...', async () => {
      const list = [...(P.beat.mute ? [] : [['beat', 'beat']]), ...P.tracks.map(t => [t.id, t.name])];
      for (const [id, tn] of list) { await audioOut(await renderSong(id, true), ' - ' + fileName(tn, 'track')); await new Promise(r => setTimeout(r, 400)); }
      toast(`${list.length} tracks saved to your downloads.`); }), 'exportStems'),
    el('div', { class: 'exgroup' }, 'Project files (open again in SHELOOPS)'),
    row('This song as a project', 'The whole song with recordings, beat, sounds and settings in one .sheloops file. Open it on another computer or keep it safe.', 'Save song file', () => exportSongFile(P, name), 'exportProject'),
    row('Everything', 'All your songs, sounds, cover designs, pictures and studio setup in one backup file.', 'Save everything', () => exportEverything(fileName(name) + ' everything'), 'exportAll', false),
    row('Open a .sheloops file', 'Adds a song or a full backup to this browser. Nothing gets replaced.', 'Open file', () => openSheloopsFile(() => emit('goto:projects')), 'openFile', false),
  );
  modal('Export', body);
}
