// Mastering studio: styles, auto master from analysis, manual controls, before/after, loudness.
import { $, el, clamp, toast, knob, download, safeName } from './util.js';
import { helpBtn } from './help.js';
import { app, save, snapshot } from './state.js';
import { STYLES } from './presets.js';
import { E, applyMix, renderSong, renderMastered, measureLoudness, momentaryLufs, encodeWav, masterOf, T, play, stop } from './engine.js';

export { STYLES };
const STYLE_DESC = {
  Warm: 'Full, soft and cozy. Great for R&B and soul.', Clean: 'Natural and open, just polished.', Loud: 'As loud as possible for clubs and car speakers.',
  Smooth: 'Gentle top end, nothing harsh.', Bright: 'Crisp and shiny, vocals jump out.', Deep: 'Heavy low end for trap and hip-hop.',
  Streaming: 'Balanced and set to -14 LUFS, the level Spotify, Apple Music and YouTube play at.',
};
let report = [], lastMeasure = null, busy = false, matchOn = true;

export function renderMaster() {
  const view = $('#view'); view.innerHTML = '';
  const m = masterOf(app.P);
  const set = (k, v) => { m[k] = v; m.on = true; applyMix(); save(); };
  const sl = (label, k, min, max, step, fmt, help) => knob(label, min, max, step, m[k], v => set(k, v), fmt, help);
  const db = v => (v > 0 ? '+' : '') + (+v).toFixed(1) + ' dB';
  const pc = v => Math.round(v * 100) + '%';
  view.append(el('div', { class: 'mastering' },
    el('div', { class: 'ptop' }, el('h1', {}, 'Mastering'), helpBtn('mastering'),
      el('button', { class: 'tog big' + (m.on ? ' on' : ''), onclick: () => { snapshot(); m.on = !m.on; applyMix(); save(); renderMaster(); } }, m.on ? 'Mastering ON' : 'Mastering OFF'),
      el('span', { class: 'withhelp' }, el('button', { class: 'abbtn' + (E.masterBefore ? ' b' : ''), disabled: !m.on, onclick: () => { E.masterBefore = !E.masterBefore; applyMix(); renderMaster(); } },
        E.masterBefore ? 'Hearing: BEFORE' : 'Hearing: AFTER'), helpBtn('masterAB')),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: matchOn, onchange: e => { matchOn = e.target.checked; m.match = matchOn && lastMeasure ? lastMeasure.match || 0 : 0; applyMix(); save(); } }), 'Match loudness when comparing'),
      el('button', { onclick: () => T.playing ? stop() : play() }, T.playing ? 'Stop' : 'Play song')),
    el('div', { class: 'panel mpanel' },
      el('div', { class: 'insp-sub' }, '1. Pick a style', helpBtn('masterStyles')),
      el('div', { class: 'styles' }, Object.keys(STYLES).map(s => el('button', { class: 'stylebtn' + (m.style === s ? ' on' : ''), onclick: () => applyStyle(s) },
        el('b', {}, s === 'Streaming' ? 'Pro Streaming' : s), el('small', {}, STYLE_DESC[s])))),
      el('div', { class: 'fxtop' },
        el('b', {}, '2. Let it fit your song'),
        el('button', { class: 'hot', disabled: busy, onclick: autoMaster }, busy ? 'Working...' : 'Auto master'), helpBtn('autoMaster'),
        el('span', { class: 'hint' }, 'Listens to your whole song and adjusts loudness and tone. Your mix is not changed.')),
      report.length ? el('ul', { class: 'report' }, report.map(r => el('li', {}, r))) : null),
    el('div', { class: 'panel mpanel' },
      el('div', { class: 'insp-sub' }, '3. Fine tune (optional)'),
      el('div', { class: 'knobrow mknobs' },
        sl('Loudness', 'loud', -6, 18, 0.5, db, 'mLoud'),
        sl('Bass', 'bass', -6, 6, 0.5, db, 'mBass'),
        sl('Warmth', 'warmth', 0, 1, 0.01, pc, 'mWarmth'),
        sl('Vocal clarity', 'clarity', -6, 6, 0.5, db, 'mClarity'),
        sl('Air (brightness)', 'air', -6, 6, 0.5, db, 'mAir'),
        sl('Harshness control', 'harsh', 0, 1, 0.01, pc, 'mHarsh'),
        sl('Glue', 'glue', 0, 1, 0.01, pc, 'mGlue'),
        sl('Stereo width', 'width', 0, 1.8, 0.01, pc, 'mWidth'),
        sl('Low cut', 'lowcut', 15, 120, 1, v => v + ' Hz', 'mLowcut'),
        sl('Ceiling', 'ceiling', -6, 0, 0.1, v => v.toFixed(1) + ' dB', 'mCeiling'))),
    el('div', { class: 'panel mpanel' },
      el('div', { class: 'insp-sub' }, '4. Check loudness and export', helpBtn('lufs')),
      el('div', { class: 'fxtop' },
        el('div', { class: 'lufsbox' }, el('small', {}, 'Live loudness'), el('b', { id: 'lufslive' }, '--'), el('small', {}, 'LUFS')),
        el('button', { disabled: busy, onclick: measureFinal }, 'Measure final loudness'),
        lastMeasure ? el('span', {}, `Song: ${lastMeasure.lufs.toFixed(1)} LUFS, peak ${lastMeasure.peak.toFixed(1)} dB. ${verdict(lastMeasure.lufs, m)}`) : el('span', { class: 'hint' }, 'Takes a few seconds.'),
        el('span', { class: 'spacer' }),
        el('button', { class: 'hot', onclick: exportMastered }, 'Export mastered WAV'),
        mp3Button()),
    ),
  ));
}
function verdict(l, m) {
  const tgt = (STYLES[m.style] || STYLES.Streaming).target;
  if (l > -8) return 'Very loud. Streaming apps will turn it down, and it may sound squashed.';
  if (Math.abs(l - tgt) <= 1.5) return 'Right on target.';
  return l < tgt ? 'A bit quiet for this style. Raise Loudness.' : 'Louder than this style aims for.';
}
function applyStyle(name) {
  snapshot();
  const m = masterOf(app.P), s = STYLES[name];
  Object.assign(m, { on: true, style: name, lowcut: s.lowcut, bass: s.bass, warmth: s.warmth, clarity: s.clarity, air: s.air, harsh: s.harsh, glue: s.glue, width: s.width, ceiling: -1 });
  applyMix(); save(); report = [`${name} style applied. Click Auto master to set the loudness for your song.`]; renderMaster();
}
const lufsOf = async bypass => measureLoudness(await renderSong(null, bypass));
async function autoMaster() {
  if (busy) return; busy = true; renderMaster();
  try {
    const m = masterOf(app.P);
    if (!m.style) Object.assign(m, STYLES.Streaming, { style: 'Streaming' });
    delete m.target;
    const s = STYLES[m.style], base = STYLES[m.style];
    toast('Listening to your song...');
    const dry = await renderSong(null, true);
    const a = await measureLoudness(dry);
    const lufsOf = async () => measureLoudness(await renderMastered(dry));
    if (!isFinite(a.lufs)) { report = ['Your song is silent. Record or add something first.']; return; }
    const r = [`Your mix is ${a.lufs.toFixed(1)} LUFS with peaks at ${a.peak.toFixed(1)} dB.`];
    m.on = true; m.bass = base.bass; m.air = base.air; m.harsh = base.harsh; m.width = base.width;
    if (a.lowDb > -3) { const c = clamp((a.lowDb + 5) * 0.8, 0.5, 3); m.bass -= c; r.push(`The low end is heavy, so bass was lowered ${c.toFixed(1)} dB.`); }
    else if (a.lowDb < -12) { const c = clamp((-12 - a.lowDb) * 0.4, 0.5, 3); m.bass += c; r.push(`The low end is thin, so bass was raised ${c.toFixed(1)} dB.`); }
    if (a.highDb < -28) { const c = clamp((-28 - a.highDb) * 0.3, 0.5, 3); m.air += c; r.push(`The top end is dull, so air was raised ${c.toFixed(1)} dB.`); }
    else if (a.highDb > -14) { m.air -= 1.5; m.harsh = clamp(m.harsh + 0.3, 0, 1); r.push('The top end is harsh, so it was softened.'); }
    if (a.widthDb < -25) { m.width = Math.max(m.width, 1.2); r.push('The mix is narrow, so it was widened a little.'); }
    else if (a.widthDb > -6) { m.width = Math.min(m.width, 0.9); r.push('The mix is very wide, so it was narrowed for phone speakers.'); }
    // loudness: two passes through the full chain to land on the target
    // find the loudness setting that hits the target (secant search, the limiter makes it non-linear)
    let x0 = clamp(s.target - a.lufs, -6, 24); m.loud = x0; applyMix();
    let f0 = (await lufsOf()).lufs - s.target, fin = null;
    let x1 = clamp(x0 - f0, -6, 24);
    for (let i = 0; i < 4 && Math.abs(f0) > 0.4; i++) {
      m.loud = x1; applyMix(); fin = await lufsOf();
      const f1 = fin.lufs - s.target;
      if (Math.abs(f1) <= 0.4) { f0 = f1; break; }
      const slope = (f1 - f0) / ((x1 - x0) || 1e-3);
      const nx = clamp(x1 - f1 / (Math.abs(slope) > 0.05 ? slope : 1), -6, 24);
      x0 = x1; f0 = f1; x1 = nx;
    }
    fin = await lufsOf();
    lastMeasure = { ...fin, match: a.lufs - fin.lufs };
    m.match = matchOn ? lastMeasure.match : 0;
    r.push(`Loudness set to ${fin.lufs.toFixed(1)} LUFS (target for ${m.style === 'Streaming' ? 'streaming' : m.style} is ${s.target}). Peak ${fin.peak.toFixed(1)} dB.`);
    r.push('Use the Before/After button to compare. Fine tune below if you want.');
    report = r; save(); applyMix();
  } catch (e) { report = ['Auto master failed: ' + e.message]; }
  finally { busy = false; renderMaster(); }
}
async function measureFinal() {
  busy = true; renderMaster();
  try { const b = await lufsOf(false); lastMeasure = { ...b, match: lastMeasure ? lastMeasure.match : 0 }; }
  catch (e) { toast('Measure failed: ' + e.message); }
  busy = false; renderMaster();
}
async function exportMastered() {
  toast('Rendering mastered song...');
  try { const buf = await renderSong(); download(encodeWav(buf), safeName(app.P.name) + '-master.wav'); toast('Mastered WAV saved to your downloads.'); }
  catch (e) { toast('Export failed: ' + e.message); }
}
function mp3Button() {
  if (!window.lamejs) return el('span', { class: 'hint' }, 'MP3 export needs the encoder file (not installed yet).');
  return el('button', { onclick: exportMp3 }, 'Export MP3');
}
async function exportMp3() {
  const mod = await import('./mp3.js');
  toast('Rendering and encoding MP3...');
  try { const buf = await renderSong(); download(await mod.encodeMp3(buf, app.P), safeName(app.P.name) + '.mp3'); toast('MP3 saved to your downloads.'); }
  catch (e) { toast('MP3 export failed: ' + e.message); }
}
export function masterTick() {
  const elv = $('#lufslive'); if (!elv) return;
  const l = T.playing ? momentaryLufs() : -Infinity;
  elv.textContent = isFinite(l) ? l.toFixed(1) : '--';
}
