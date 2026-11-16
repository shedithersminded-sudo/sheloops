// Guitar loop maker: picks a style + chord progression and writes strums/picks into a pattern.
import { el, toast, modal, select } from './util.js';
import { helpBtn } from './help.js';
import { app, save, snapshot, stepDur, PRESETS, newBeatTrack, patData, setNotes } from './state.js';
import { applyMix, playNote, encodeWav } from './engine.js';
import { importSounds } from './library.js';
import { isString } from './instruments.js';
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// chord name for scale degree d in the beat's key, like "Am" or "F#dim"
export function chordName(d) {
  const sc = scaleOf(), k = app.P.beat.key, tone = i => sc[(d + i) % 7] + 12 * Math.floor((d + i) / 7);
  const third = tone(2) - tone(0), fifth = tone(4) - tone(0);
  return NOTE[(k + sc[d]) % 12] + (fifth === 6 ? 'dim' : third === 3 ? 'm' : '');
}

// One char per 16th step, repeated every bar.
// D down strum, U up strum, T top 3 strings stab, x muted scratch, P palm-muted chug,
// B bass (root), b other bass note (5th), 0-5 pick one string (0 = lowest)
export const STYLES = {
  'Pop strum':        { r: 'D...D.U...U.D.U.', sound: 'acoustic guitar', sp: 0.012 },
  'Fingerpick':       { r: 'B.3.b.4.B.3.b.5.', sound: 'acoustic guitar' },
  'Ballad arpeggio':  { r: '0.1.2.3.4.5.4.3.', sound: 'nylon guitar' },
  'Rock chug':        { r: 'D.P.P.P.D.P.PPP.', sound: 'overdrive guitar', power: true, sp: 0.006 },
  'Rock strum':       { r: 'D.D.D.DUD.D.D.DU', sound: 'overdrive guitar', power: true, sp: 0.008 },
  'Funk scratch':     { r: 'TxxTxUxTxxTxUxTx', sound: 'electric guitar', sp: 0.005 },
  'Reggae skank':     { r: '....T.......T...', sound: 'electric guitar', sp: 0.004 },
  'Flamenco rumba':   { r: 'D..xU.D.D..xU.D.', sound: 'nylon guitar', sp: 0.009 },
  'Lo-fi chill':      { r: 'D.......U.D.....', sound: 'nylon guitar', sp: 0.03, soft: true },
  'Trap melody':      { r: '5..4..3..5..4.2.', sound: 'nylon guitar' },
  'Bossa nova':       { r: 'B..T..T.b..T..T.', sound: 'nylon guitar', sp: 0.006 },
  'Country boom-chick': { r: 'B.T.b.T.B.T.b.T.', sound: 'acoustic guitar', sp: 0.005 },
  'Afrobeats highlife': { r: '3.43.5.4.3.43.5.', sound: 'electric guitar' },
  '12-string shimmer': { r: '0.2.4.5.3.5.4.2.', sound: '12-string guitar' },
  'Muted plucks':     { r: '2.2.3.2.4.2.3.2.', sound: 'muted guitar' },
  'Banjo roll':       { r: '0353035303530353', sound: 'banjo' },
};
// scale degrees (0 = the key's first chord)
export const PROGS = {
  'I V vi IV': [0, 4, 5, 3], 'vi IV I V': [5, 3, 0, 4], 'I vi IV V': [0, 5, 3, 4], 'I IV V IV': [0, 3, 4, 3],
  'ii V I I': [1, 4, 0, 0], 'i VI III VII': [0, 5, 2, 6], 'i iv v i': [0, 3, 4, 0], 'i VII VI VII': [0, 6, 5, 6],
  'i iv (two chords)': [0, 3, 0, 3], 'One chord vamp': [0, 0, 0, 0],
};
const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10];
export const scaleOf = () => /minor|blues|dorian/.test(app.P.beat.scale) ? (app.P.beat.scale === 'dorian' ? [0, 2, 3, 5, 7, 9, 10] : MIN) : MAJ;

// 6 strings low to high for chord degree d
export function voicing(d, power) {
  const sc = scaleOf(), key = app.P.beat.key;
  const tone = k => sc[(d + k) % 7] + 12 * Math.floor((d + k) / 7);
  let root = 40 + ((key + sc[d % 7]) % 12); // E2..D#3
  if (root > 47) root -= 12;
  const third = tone(2) - tone(0), fifth = tone(4) - tone(0);
  if (power) return [root, root + 7, root + 12, root + 7, root + 12, root + 12];
  return [root, root + fifth, root + 12, root + 12 + third, root + 12 + fifth, root + 24].map(m => m > 76 ? m - 12 : m);
}

export function makeLoop(styleName, progName, opts = {}) {
  const S = STYLES[styleName], prog = PROGS[progName], steps = app.P.beat.bars * 16;
  const chordLen = Math.max(8, steps / prog.length), sp = S.sp ?? 0.01, notes = [];
  const human = v => Math.max(0.15, Math.min(1, v + (opts.humanize ? (Math.random() - 0.5) * 0.12 : 0)));
  const events = [];
  for (let s = 0; s < steps; s++) { const ch = S.r[s % 16]; if (ch !== '.') events.push([s, ch]); }
  events.forEach(([s, ch], i) => {
    const next = i + 1 < events.length ? events[i + 1][0] : steps;
    const gap = Math.max(1, next - s), v = voicing(prog[Math.floor(s / chordLen) % prog.length], S.power);
    const beat = s % 4 === 0, base = (S.soft ? 0.6 : 0.85) * (beat ? 1 : 0.82);
    const add = (strs, len, vel, up) => strs.forEach((k, j) => notes.push({ step: s, pitch: v[k], len, vel: human(vel), off: +((up ? strs.length - 1 - j : j) * sp).toFixed(3) }));
    if (ch === 'D') add(S.power ? [0, 1, 2] : [0, 1, 2, 3, 4, 5], Math.min(gap, 8), base);
    else if (ch === 'U') add(S.power ? [1, 2] : [2, 3, 4, 5], Math.min(gap, 4), base * 0.7, true);
    else if (ch === 'T') add([3, 4, 5], 1, base * 0.9);
    else if (ch === 'x') add([2, 3, 4, 5], 0.5, 0.28);
    else if (ch === 'P') add([0, 1], 1, base * 0.75);
    else if (ch === 'B') add([0], Math.min(gap, 4), base);
    else if (ch === 'b') add([1], Math.min(gap, 4), base * 0.9);
    else if (/[0-5]/.test(ch)) add([+ch], Math.min(4, Math.max(gap, 2)), base * (ch > '2' ? 0.8 : 0.9));
  });
  return notes;
}

// Render one pass of a track's current pattern to a loopable WAV (the ring-out wraps back to the start).
async function renderLoop(t, pid) {
  const sd = stepDur(), steps = app.P.beat.bars * 16, len = steps * sd, sr = 44100, tail = 2.5;
  const c = new OfflineAudioContext(2, Math.ceil((len + tail) * sr), sr);
  const g = c.createGain(); g.gain.value = t.vol ?? 0.8; g.connect(c.destination);
  for (const n of patData(t, pid).notes) playNote(c, g, t.synth, n.pitch, n.step * sd + (n.off || 0), n.len * sd - 0.005 - (n.off || 0), n.vel ?? 0.8);
  const full = await c.startRendering(), N = Math.round(len * sr), out = new AudioBuffer({ numberOfChannels: 2, length: N, sampleRate: sr });
  for (let ch = 0; ch < 2; ch++) { const a = full.getChannelData(ch), b = out.getChannelData(ch); for (let i = 0; i < a.length; i++) b[i % N] += a[i]; }
  return out;
}

let last = { style: 'Pop strum', prog: 'I V vi IV', sound: '', target: '' };
export function openGuitarMaker(cur, onDone) {
  const b = app.P.beat, synths = () => b.tracks.filter(t => t.type === 'synth');
  const guitarSounds = Object.keys(PRESETS).filter(k => k !== 'guitar' && isString(PRESETS[k].engine));
  let style = last.style, prog = last.prog, sound = last.sound || STYLES[style].sound, target = last.target, humanize = true;
  if (!synths().some(t => t.id === target)) target = (synths().find(t => /guitar/i.test(t.name)) || {}).id || 'new';
  const chips = el('div', { class: 'chips' });
  const soundSel = select(guitarSounds, sound, v => sound = v);
  const drawChips = () => { chips.innerHTML = ''; for (const k of Object.keys(STYLES)) chips.append(el('button', { class: 'chip' + (k === style ? ' on' : ''), onclick: () => { style = k; sound = STYLES[k].sound; soundSel.value = sound; drawChips(); } }, k)); };
  drawChips();
  const progSel = select(Object.keys(PROGS), prog, v => prog = v);
  const targetSel = select([['new', 'A new guitar track'], ...synths().map(t => [t.id, t.name])], target, v => target = v);
  const status = el('p', { class: 'hint' }, `Chords follow your key and scale (${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][b.key]} ${b.scale === 'off' ? 'major' : b.scale}). Pattern ${cur} is ${b.bars} bar${b.bars > 1 ? 's' : ''}.`);

  const make = () => {
    snapshot();
    let t = b.tracks.find(x => x.id === target);
    if (!t) { t = newBeatTrack('synth', { preset: sound, rev: 0.18 }); t.name = 'Guitar loop'; b.tracks.push(t); target = t.id; }
    t.preset = sound; t.synth = { ...PRESETS[sound] };
    setNotes(t, cur, makeLoop(style, prog, { humanize }));
    b.sel = t.id; last = { style, prog, sound, target }; save(); applyMix(); onDone?.();
    return t;
  };
  const body = el('div', { class: 'gtrmaker' },
    el('div', { class: 'lab' }, 'Style', helpBtn('gtrStyle')), chips,
    el('div', { class: 'row' },
      el('label', { class: 'field' }, el('span', {}, 'Chords ', helpBtn('gtrProg')), progSel),
      el('label', { class: 'field' }, el('span', {}, 'Guitar sound ', helpBtn('gtrSound')), soundSel),
      el('label', { class: 'field' }, el('span', {}, 'Put it on'), targetSel),
      el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: humanize, onchange: e => humanize = e.target.checked }), 'Human feel ', helpBtn('gtrHuman'))),
    status);
  modal('Guitar loop maker', body, [
    ['Surprise me', () => { const ks = Object.keys(STYLES), ps = Object.keys(PROGS); style = ks[Math.random() * ks.length | 0]; prog = ps[Math.random() * ps.length | 0]; sound = STYLES[style].sound; soundSel.value = sound; progSel.value = prog; drawChips(); make(); toast(`${style} with ${prog}. Press Space to hear it.`); return false; }],
    ['Save as loop in My sounds', async () => {
      const t = make(); toast('Making the loop...');
      try {
        const buf = await renderLoop(t, cur), name = `${style} ${prog} ${app.P.bpm}bpm.wav`.replace(/\s+/g, ' ');
        await importSounds([new File([encodeWav(buf)], name, { type: 'audio/wav' })], 'Guitar loops');
        toast('Saved in My sounds, folder "Guitar loops".');
      } catch (e) { console.error(e); toast('Could not save the loop.'); }
      return false;
    }],
    ['Make loop', () => { make(); toast(`${style} loop made in pattern ${cur}. Press Space to hear it.`); return false; }, 'hot'],
  ]);
}
