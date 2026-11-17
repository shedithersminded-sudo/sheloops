// Drop anywhere: drag audio files onto any page and a dock slides up asking where they go.
// Also the "Add audio" button in the top bar, and pasting a direct link to an audio file.
import { el, toast, modal } from './util.js';
import { app, emit } from './state.js';
import { importSounds, loadSounds } from './library.js';

const isAudio = f => /^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|ogg|flac|webm|aif|aiff)$/i.test(f.name);
const go = v => emit('goto:' + v);
const TARGETS = [
  ['studio', 'Rap or sing over it', 'Opens the Studio with it as your beat'],
  ['djA', 'DJ deck A', 'Loads it on the left deck'],
  ['djB', 'DJ deck B', 'Loads it on the right deck'],
  ['pad', 'A pad', 'Puts it on an empty pad in the Pad machine'],
  ['sounds', 'My sounds', 'Keeps it for the beat maker, pads and everything else'],
];

export async function sendTo(target, files) {
  files = [...files].filter(isAudio);
  if (!files.length) return toast('That is not an audio file. Use MP3, WAV, M4A, OGG or FLAC.');
  const f = files[0];
  try {
    if (target === 'studio') {
      if (app.P) { go('studio'); const { importBeatFile } = await import('./studio.js'); await importBeatFile(f, 0); }
      else { const { createSong } = await import('./pages.js'); await createSong(f); }
    } else if (target === 'djA' || target === 'djB') {
      go('dj'); const { djLoadFile } = await import('./dj.js'); for (const x of files.slice(0, 1)) await djLoadFile(x, target === 'djA' ? 'A' : 'B');
      if (files.length > 1) { for (const x of files.slice(1)) await djLoadFile(x); toast(`The other ${files.length - 1} file(s) are in your crate.`); }
    } else if (target === 'pad') {
      const { padLoadFile } = await import('./pads.js'); let last;
      for (const x of files.slice(0, 16)) last = await padLoadFile(x);
      go('pads'); toast(files.length > 1 ? `${files.length} sounds put on pads, also saved in My sounds.` : `On pad ${last.pad} in bank ${last.bank}, and saved in My sounds.`);
    } else {
      const n = await importSounds(files, 'Dropped in'); await loadSounds();
      toast(`${n} file${n === 1 ? '' : 's'} saved in My sounds, folder "Dropped in".`); if (app.view === 'sounds') go('sounds');
    }
  } catch (e) { toast('Could not read that file. Try MP3 or WAV.'); }
}

// ---------- the dock that slides up while dragging ----------
let dock = null, depth = 0;
function buildDock() {
  dock = el('div', { class: 'dropdock', 'aria-hidden': 'true' },
    el('div', { class: 'ddtitle' }, el('b', {}, 'Drop your audio here'), el('small', {}, 'Let go on where it should go')),
    el('div', { class: 'ddzones' }, ...TARGETS.map(([k, l, s]) => {
      const z = el('div', { class: 'ddzone', 'data-t': k }, el('b', {}, l), el('small', {}, s));
      z.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; z.classList.add('over'); });
      z.addEventListener('dragleave', () => z.classList.remove('over'));
      z.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); hide(); sendTo(k, e.dataTransfer.files); });
      return z;
    })));
  document.body.append(dock);
}
const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
function show() { if (!dock) buildDock(); dock.classList.add('show'); }
function hide() { depth = 0; if (dock) { dock.classList.remove('show'); dock.querySelectorAll('.over').forEach(z => z.classList.remove('over')); } }
addEventListener('dragenter', e => { if (!hasFiles(e)) return; depth++; show(); });
addEventListener('dragleave', e => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) hide(); });
addEventListener('drop', e => { hide(); });
addEventListener('dragend', hide);
// a drop on empty space (not on a deck, the crate, the timeline or a drop box) goes to the chooser instead of opening the file in the browser
addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('drop', e => {
  if (!hasFiles(e) || e.defaultPrevented) return;
  e.preventDefault();
  const files = [...e.dataTransfer.files].filter(isAudio);
  if (files.length) openAddAudio(files);
});

// ---------- the Add audio button: pick a file or paste a link, then choose where ----------
export function openAddAudio(files = null) {
  let close;
  const choose = list => el('div', { class: 'addaudio-targets' }, ...TARGETS.map(([k, l, s]) => el('button', { class: 'aatarget', onclick: () => { close(); sendTo(k, list); } }, el('b', {}, l), el('small', {}, s))));
  const body = el('div', { class: 'addaudio' });
  const showTargets = list => { body.innerHTML = ''; body.append(el('p', { class: 'hint' }, `${list.length === 1 ? list[0].name : list.length + ' files'}: where should it go?`), choose(list)); };
  if (files) showTargets(files);
  else {
    const pick = el('button', { class: 'hot big', onclick: () => { const i = el('input', { type: 'file', accept: 'audio/*,.mp3,.wav,.m4a,.ogg,.flac', multiple: true }); i.onchange = () => i.files.length && showTargets([...i.files]); i.click(); } }, 'Choose audio from my device');
    const url = el('input', { class: 'textin', placeholder: 'https://... direct link to an .mp3 or .wav', type: 'url' });
    const fetchBtn = el('button', { onclick: async () => {
      const u = url.value.trim(); if (!u) return;
      if (/youtube\.com|youtu\.be|spotify\.com|soundcloud\.com|music\.apple\.com|tiktok\.com/i.test(u)) return toast('Streaming sites cannot be used. Download the beat from the producer’s link (BeatStars, Google Drive and so on), then add the file.');
      fetchBtn.disabled = true; fetchBtn.textContent = 'Getting it...';
      try {
        const r = await fetch(u); if (!r.ok) throw 0;
        const b = await r.blob(), name = decodeURIComponent(u.split('/').pop().split('?')[0] || 'linked audio');
        const f = new File([b], /\.\w{2,4}$/.test(name) ? name : name + '.mp3', { type: b.type || 'audio/mpeg' });
        if (!isAudio(f)) throw 0; showTargets([f]);
      } catch { toast('That link could not be opened here. Some sites block it. Download the file first, then choose it from your device.'); fetchBtn.disabled = false; fetchBtn.textContent = 'Use this link'; }
    } }, 'Use this link');
    body.append(
      el('p', { class: 'hint' }, 'Add a beat, song, loop or sample. You can also drag audio files onto any page at any time.'),
      pick,
      el('div', { class: 'aaor' }, el('span', {}, 'or paste a link')),
      el('div', { class: 'aalink' }, url, fetchBtn),
      el('div', { class: 'explain', style: 'display:block' }, el('b', {}, 'Got a beat from YouTube? '), 'Most producers put a download link in the video description (BeatStars, Google Drive, their website). Download it there, check what the producer allows (free for non-profit, free with credit, or bought), then add the file here. Streaming links themselves cannot be used.'));
  }
  close = modal('Add audio', body);
}
