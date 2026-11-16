// IndexedDB for projects and audio. localStorage for small settings.
let dbp;
function open() {
  return dbp ||= new Promise((res, rej) => {
    // storage keys keep the old name 'loopden' so saved songs, sounds and presets carry over
    const r = indexedDB.open('loopden', 4);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects');
      if (!db.objectStoreNames.contains('sounds')) db.createObjectStore('sounds');
      if (!db.objectStoreNames.contains('art')) db.createObjectStore('art');
      if (!db.objectStoreNames.contains('designs')) db.createObjectStore('designs');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req && req.result);
    t.onerror = () => rej(t.error);
  });
}
export const db = {
  put: (s, k, v) => tx(s, 'readwrite', o => o.put(v, k)),
  get: (s, k) => tx(s, 'readonly', o => o.get(k)),
  del: (s, k) => tx(s, 'readwrite', o => o.delete(k)),
  all: s => tx(s, 'readonly', o => o.getAll()),
  keys: s => tx(s, 'readonly', o => o.getAllKeys()),
};

// ---- audio (immutable: an id always means the same recording) ----
export const audioCache = new Map();
export async function saveAudio(id, buf) {
  audioCache.set(id, buf);
  const ch = [];
  for (let i = 0; i < buf.numberOfChannels; i++) ch.push(buf.getChannelData(i).slice());
  await db.put('audio', id, { sr: buf.sampleRate, ch });
}
// Imported files are stored as the original file (small) and decoded on load.
let decoder = null;
export const setDecoder = fn => { decoder = fn; };
export async function saveAudioFile(id, file, buf) {
  audioCache.set(id, buf);
  await db.put('audio', id, { blob: file, name: file.name });
}
export async function loadAudio(id) {
  if (audioCache.has(id)) return audioCache.get(id);
  const d = await db.get('audio', id);
  if (!d) return null;
  if (d.blob) { const buf = await decoder(await d.blob.arrayBuffer()); audioCache.set(id, buf); return buf; }
  const buf = new AudioBuffer({ length: d.ch[0].length, numberOfChannels: d.ch.length, sampleRate: d.sr });
  d.ch.forEach((c, i) => buf.copyToChannel(c, i));
  audioCache.set(id, buf);
  return buf;
}
export function audioIdsOf(p) {
  const ids = new Set();
  if (p.coverOrig) ids.add(p.coverOrig);
  for (const t of p.tracks || []) {
    for (const c of t.clips || []) ids.add(c.audioId);
    for (const k of t.takes || []) ids.add(k.audioId);
  }
  // samples used by the beat maker (sound library ids are also audio ids)
  for (const t of (p.beat && p.beat.tracks) || []) {
    if (t.sample) ids.add(t.sample);
    for (const r of t.rows || []) if (r.sample) ids.add(r.sample);
  }
  return ids;
}
// Delete audio no project uses anymore.
export async function cleanupAudio() {
  const used = new Set();
  for (const p of await db.all('projects')) for (const id of audioIdsOf(p)) used.add(id);
  for (const k of await db.keys('sounds')) used.add(k);
  for (const k of await db.keys('audio')) if (!used.has(k) && !String(k).startsWith('look-')) { await db.del('audio', k); audioCache.delete(k); }
}

// ---- settings ----
const DEFAULTS = {
  simple: true, inputId: '', outputId: '', mono: true, inputGain: 1, monitor: false,
  nr: false, agc: false, ec: false, latency: 'interactive', sampleRate: 0,
  countIn: true, metro: true, snap: true, zoom: 40, lastProject: null, wizardDone: false,
};
export const settings = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem('loopden.settings') || '{}')) };
export function saveSettings() { localStorage.setItem('loopden.settings', JSON.stringify(settings)); }
