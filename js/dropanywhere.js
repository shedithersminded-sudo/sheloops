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
    const url = el('input', { class: 'textin', placeholder: 'Paste a link to an .mp3 or .wav (Google Drive and Dropbox links work too)', type: 'url' });
    // share links from common hosts point to a web page, so turn them into the real file link first
    const direct = u => {
      let m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([\w-]+)/); if (m) return 'https://drive.google.com/uc?export=download&id=' + m[1];
      if (/dropbox\.com/.test(u)) return u.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/[?&]dl=0/, '').replace(/[?&]raw=1/, '');
      if (/github\.com\/.+\/blob\//.test(u)) return u.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
      return u;
    };
    const useLink = async () => {
      let u = url.value.trim(); if (!u) return toast('Paste a link first.');
      if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      if (/youtube\.com|youtu\.be|spotify\.com|soundcloud\.com|music\.apple\.com|tiktok\.com|instagram\.com/i.test(u)) return toast('Streaming sites cannot be used. Download the beat from the producer link (BeatStars, Google Drive and so on), then add the file.');
      fetchBtn.disabled = true; fetchBtn.textContent = 'Getting it...';
      const done = msg => { if (msg) toast(msg); fetchBtn.disabled = false; fetchBtn.textContent = 'Use this link'; };
      let r;
      try { r = await fetch(direct(u)); } catch { return done('That site does not let other apps download its files. Open the link, download the file, then choose it from your device.'); }
      if (!r.ok) return done(`The link answered "${r.status}". Check that the link is right and the file is shared publicly.`);
      try {
        const b = await r.blob(), raw = decodeURIComponent(u.split('/').pop().split('?')[0] || 'linked audio');
        if (/text\/html/.test(b.type)) return done('That link opens a web page, not an audio file. Use the direct download link (it usually ends in .mp3 or .wav).');
        const name = /\.(mp3|wav|m4a|ogg|flac|aac|webm)$/i.test(raw) ? raw : raw.replace(/\.\w+$/, '') + '.mp3';
        const f = new File([b], name, { type: b.type && b.type.startsWith('audio') ? b.type : 'audio/mpeg' });
        try { const c = new OfflineAudioContext(1, 1, 44100); await c.decodeAudioData(await b.arrayBuffer()); } catch { return done('That file could not be played as audio. Try an .mp3 or .wav link.'); }
        done(); showTargets([f]);
      } catch { done('Something went wrong getting that file. Download it, then choose it from your device.'); }
    };
    url.addEventListener('keydown', e => { if (e.key === 'Enter') useLink(); });
    const fetchBtn = el('button', { class: 'hot', onclick: useLink }, 'Use this link');

    body.append(
      el('p', { class: 'hint' }, 'Add a beat, song, loop or sample. You can also drag audio files onto any page at any time.'),
      pick,
      el('div', { class: 'aaor' }, el('span', {}, 'or paste a link')),
      el('div', { class: 'aalink' }, url, fetchBtn),
      el('div', { class: 'linkhelp' },
        el('b', {}, 'Which links work?'),
        el('ul', {},
          el('li', { class: 'ok' }, 'Direct links to an audio file, usually ending in .mp3, .wav, .m4a or .ogg.'),
          el('li', { class: 'ok' }, 'Google Drive, Dropbox and GitHub share links. They are turned into the real download link for you.'),
          el('li', { class: 'ok' }, 'Press Enter or Use this link.'),
          el('li', { class: 'no' }, 'YouTube, Spotify, SoundCloud, TikTok and Instagram links cannot be used.')),
        el('p', {}, 'Some sites do not let other apps download their files, including some Google Drive files. If a link does not work, a message says why. Then download the file and press Choose audio from my device.'),
        el('p', {}, el('b', {}, 'Got a beat from YouTube? '), 'Producers usually put a download link in the video description (BeatStars, Google Drive, their website). Check what they allow (free for non-profit, free with credit, or bought), then add the file here.')));
  }
  close = modal('Add audio', body);
}
