// Guided Studio: one step at a time. 1 check my mic, 2 record, 3 make it sound good, 4 listen and save.
// The full studio (timeline, every tool) is one click away.
import { $, el, toast, fmtTime } from './util.js';
import { helpBtn } from './help.js';
import { app, save, emit, selTrack, newVocalTrack } from './state.js';
import { E, T, ensureCtx, openMic, play, stop, nodeFor, micSettings, applyMicSettings, recState, recElapsed, currentPos, applyMix, setReverbSize } from './engine.js';
import { knob, select } from './util.js';
import { settings, saveSettings } from './store.js';
import { micPanel } from './micui.js';
import { presetsTab, previewBar, setRerender } from './fxui.js';
import { fixTab } from './fixvoice.js';

const STEPS = [
  ['mic', 'Check my mic', 'Make your voice sound clean before anything else'],
  ['rec', 'Record', 'Sing or rap over your beat'],
  ['sound', 'Make it sound good', 'Pick a vocal style and polish it'],
  ['save', 'Listen and save', 'Play it back and export it'],
];
let test = null, testBusy = false, raf = 0;
const vocal = () => {
  let t = selTrack(); if (t && t.kind !== 'file') return t;
  t = app.P.tracks.find(x => x.kind !== 'file');
  if (!t) { t = newVocalTrack('Vocal 1'); app.P.tracks.push(t); save(); }
  app.P.sel = t.id; return t;
};

export function renderGuide(api) {
  const P = app.P, t = vocal(), step = settings.gStep || 'mic', idx = STEPS.findIndex(s => s[0] === step);
  setRerender(() => renderGuide(api)); renderAgain = () => renderGuide(api);
  const view = $('#view'); view.innerHTML = '';
  const go = k => { settings.gStep = k; saveSettings(); renderGuide(api); };
  const stepper = el('div', { class: 'gsteps' }, ...STEPS.map(([k, n, w], i) => el('button', { class: 'gstep' + (k === step ? ' on' : '') + (i < idx ? ' done' : ''), onclick: () => go(k) },
    el('span', { class: 'gnum' }, i < idx ? '✓' : i + 1), el('div', {}, el('b', {}, n), el('small', {}, w)))));
  let body;
  if (step === 'mic') body = micStep(t, () => renderGuide(api));
  else if (step === 'rec') body = recStep(t, api);
  else if (step === 'sound') body = soundStep(t, api);
  else body = saveStep(api);
  // a small player that is always there
  const time = el('b', { class: 'gtime' }, fmtTime(currentPos()));
  const playBtn = el('button', { class: 'gplay', onclick: () => { T.playing ? stop() : play(0); } }, T.playing ? '■ Stop' : '▶ Play from the start');
  cancelAnimationFrame(raf);
  const tick = () => { if (!time.isConnected) return; time.textContent = recState() ? 'REC ' + fmtTime(recElapsed()) : fmtTime(currentPos()); playBtn.textContent = T.playing ? '■ Stop' : '▶ Play from the start'; raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
  view.append(el('div', { class: 'guide' },
    el('div', { class: 'ghead' },
      el('div', {}, el('h1', {}, 'Studio'), el('small', {}, `${P.name} · ${t.name} · ${P.bpm} BPM`)),
      el('div', { class: 'gmode' }, el('button', { class: 'on' }, 'Guided'), el('button', { onclick: () => { settings.studioMode = 'full'; saveSettings(); api.full(); } }, 'Full studio'), helpBtn('guide'))),
    stepper,
    el('div', { class: 'gbody', style: `--i:${idx}` }, body),
    el('div', { class: 'gfoot' }, playBtn, time,
      el('span', { class: 'spacer' }),
      idx > 0 ? el('button', { onclick: () => go(STEPS[idx - 1][0]) }, '← Back') : null,
      idx < STEPS.length - 1 ? el('button', { class: 'hot', onclick: () => go(STEPS[idx + 1][0]) }, 'Next: ' + STEPS[idx + 1][1] + ' →') : null)));
}

// ---------- 1: mic check, with a test recording you can play back plain or with your style ----------
function micStep(t, rerender) {
  const recTest = async btn => {
    if (testBusy) return; testBusy = true;
    try {
      await openMic(); const c = E.ctx, dest = c.createMediaStreamDestination(); E.mic.post.connect(dest);
      const chunks = [], mr = new MediaRecorder(dest.stream); mr.ondataavailable = e => chunks.push(e.data);
      let left = 5; btn.disabled = true; btn.textContent = 'Recording... 5'; mr.start();
      await new Promise(r => { const iv = setInterval(() => { left--; btn.textContent = left > 0 ? 'Recording... ' + left : 'Done'; if (left <= 0) { clearInterval(iv); r(); } }, 1000); });
      await new Promise(r => { mr.onstop = r; mr.stop(); }); E.mic.post.disconnect(dest);
      test = await c.decodeAudioData(await new Blob(chunks).arrayBuffer());
      toast('Got it. Play it back and listen for noise, hiss or boom.');
    } catch { toast('Could not record. Allow the microphone in your browser.'); }
    testBusy = false; rerender();
  };
  const playTest = async withStyle => {
    if (!test) return; const c = await ensureCtx(), s = c.createBufferSource(); s.buffer = test;
    s.connect(withStyle ? nodeFor(E.g, t, false).input : c.destination); s.start();
  };
  return el('div', { class: 'gmic' },
    el('div', { class: 'gcard gtest' },
      el('b', {}, 'Test my mic'), el('small', {}, 'Say a few lines like you would on a song. Then listen back. This is how your mic sounds after the clean up below, before any vocal style.'),
      el('div', { class: 'grow' },
        el('button', { class: 'bigrec', onclick: e => recTest(e.currentTarget) }, el('span', { class: 'rdot' }), test ? 'Record a new test (5 s)' : 'Record a 5 second test'),
        test ? el('button', { class: 'hot', onclick: () => playTest(false) }, '▶ Hear my plain mic') : null,
        test ? el('button', { onclick: () => playTest(true) }, '▶ Hear it with my vocal style') : null),
      el('ul', { class: 'gtips' },
        el('li', {}, 'Hiss or room noise between words? Turn up Noise remover, or press Measure my room.'),
        el('li', {}, 'Boomy or muddy? Raise Low cut, or turn Mud down.'),
        el('li', {}, 'Too quiet or too loud? Change Input until the bar reaches the yellow when you speak.'),
        el('li', {}, 'Words cut off? Lower the Gate, or turn the gate off.'))),
    el('div', { class: 'gcard' }, micPanel(rerender)));
}

// ---------- 2: record ----------
function recStep(t, api) {
  const P = app.P, hasBeat = P.tracks.some(x => x.kind === 'file' && x.clips.length) || P.beat.tracks.some(b => (b.rows || []).some(r => r.steps && r.steps.some(Boolean)) || Object.values(b.pats || {}).some(p => (p.notes || []).length || (p.steps || []).some(r => r.some(Boolean))));
  const M = micSettings(), hearNow = !settings.monitor ? 'off' : M.monFx ? 'fx' : 'dry';
  const setHear = async k => { settings.monitor = k !== 'off'; M.monFx = k === 'fx'; saveSettings(); if (settings.monitor) { try { await openMic(); } catch { toast('No mic access.'); } } applyMicSettings(); api.rerender(); };
  const takes = t.takes || [];
  return el('div', { class: 'grec' },
    el('div', { class: 'gcard' }, el('b', {}, '1. Your beat'),
      hasBeat ? el('small', {}, 'You have a beat. It plays while you record.') : el('small', {}, 'No beat yet. Add a beat file, or make one in the Beat maker.'),
      el('div', { class: 'grow' },
        el('button', { class: hasBeat ? '' : 'hot', onclick: () => api.addBeat() }, '+ Add my beat file'),
        el('button', { onclick: () => emit('goto:beat') }, 'Make a beat'))),
    el('div', { class: 'gcard' }, el('b', {}, '2. What you hear while you record'),
      el('small', {}, 'Headphones are best. On speakers, keep it on Plain or Off so it does not squeal.'),
      el('div', { class: 'fxlib' }, ...[['off', 'Nothing'], ['dry', 'My plain voice'], ['fx', 'My voice + effects']].map(([k, n]) => el('button', { class: 'chip' + (hearNow === k ? ' on' : ''), onclick: () => setHear(k) }, n))),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!settings.countIn, onchange: e => { settings.countIn = e.target.checked; saveSettings(); } }), 'Count me in (4 clicks before recording starts)'),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!settings.metro, onchange: e => { settings.metro = e.target.checked; saveSettings(); } }), 'Click while I record')),
    el('div', { class: 'gcard grecbig' }, el('b', {}, '3. Record'),
      el('small', {}, recState() ? 'Recording now. Press Stop when you are done.' : `Starts at ${fmtTime(app.playhead || 0)}. Every take is kept, nothing gets lost.`),
      el('button', { class: 'bigrec huge' + (recState() ? ' on' : ''), onclick: () => api.record() }, el('span', { class: 'rdot' }), recState() ? 'Stop recording' : 'Record'),
      el('div', { class: 'grow' }, el('button', { onclick: () => { app.playhead = 0; api.rerender(); } }, 'Start from the beginning'),
        el('button', { onclick: () => { settings.studioMode = 'full'; saveSettings(); api.full(); } }, 'Pick a spot on the timeline'))),
    el('div', { class: 'gcard' }, el('b', {}, `Your takes on ${t.name} (${takes.length})`),
      takes.length ? el('small', {}, 'Press Play from the start below to hear your song. To cut, move or pick takes, open the Full studio.') : el('small', {}, 'Nothing recorded yet.'),
      takes.length ? el('div', { class: 'gtakes' }, ...takes.slice().reverse().slice(0, 8).map(k => el('span', { class: 'gtake' }, `Take ${k.n} · ${k.dur.toFixed(1)}s`))) : null));
}

// ---------- 3: make it sound good ----------
function soundStep(t, api) {
  const mode = settings.gSound || 'style';
  const tab = (k, n) => el('button', { class: 'chip' + (mode === k ? ' on' : ''), onclick: () => { settings.gSound = k; saveSettings(); api.rerender(); } }, n);
  return el('div', { class: 'gsound' },
    el('div', { class: 'gcard' }, el('b', {}, 'Make it sound finished'),
      el('small', {}, 'Pick one vocal style first. Then add Enhance to polish it, and Voice FX for creative sounds. Use Preview to try before you keep it.'),
      el('div', { class: 'fxlib' }, tab('style', 'Vocal styles and effects'), tab('fix', 'Check my voice for problems'))),
    previewBar(t),
    echoCard(t),
    el('div', { class: 'gcard' }, mode === 'fix' ? fixTab(t, () => api.rerender()) : presetsTab(t)));
}

// echo and room: how much your voice echoes and how big the room around it is
export function echoCard(t) {
  const M = app.P.master, pc = v => Math.round(v * 100) + '%';
  return el('div', { class: 'gcard gecho' }, el('b', {}, 'Echo and space'), el('small', {}, 'How much your voice echoes, how many times, and how big the room sounds. Changes are heard right away.'),
    el('div', { class: 'knobrow' },
      knob('Echo amount', 0, 1, 0.01, t.dly || 0, v => { t.dly = v; applyMix(); save(); }, pc, 'delayFb', 'dial'),
      knob('Echo repeats', 0, 0.85, 0.01, M.delayFb ?? 0.35, v => { M.delayFb = v; applyMix(); save(); }, v => v < 0.15 ? 'once' : v > 0.7 ? 'lots' : pc(v), 'delayFb', 'dial'),
      el('label', { class: 'knob' }, el('span', { class: 'lab' }, 'Echo speed'), select([[2, 'Fast (1/8)'], [3, 'Bouncy (3/16)'], [4, 'Normal (1/4)'], [6, 'Slow (3/8)']], M.delayDiv || 4, v => { M.delayDiv = +v; applyMix(); save(); })),
      knob('Room amount', 0, 1, 0.01, t.rev || 0, v => { t.rev = v; applyMix(); save(); }, pc, 'rev', 'dial'),
      knob('Room size', 0.5, 6, 0.1, M.revSize || 2.5, v => { M.revSize = v; setReverbSize(v); save(); }, v => v.toFixed(1) + 's', 'revSize', 'dial')),
    el('div', { class: 'fxlib' }, ...[['Dry', 0, 0.2, 0, 0.1], ['Just a little', 0.12, 0.3, 0.15, 0.3], ['Big echo', 0.35, 0.55, 0.2, 0.4], ['Endless', 0.45, 0.8, 0.3, 0.6]].map(([n, d, fb, r, rs]) => el('button', { class: 'chip', onclick: () => { t.dly = d; M.delayFb = fb; t.rev = r; applyMix(); save(); renderAgain(); } }, n))));
}
let renderAgain = () => { };
// ---------- 4: listen and save ----------
function saveStep(api) {
  return el('div', { class: 'gsave' },
    el('div', { class: 'gcard' }, el('b', {}, 'Listen'), el('small', {}, 'Play your whole song from the start. If a part is too loud or quiet, the Mixer fixes it.'),
      el('div', { class: 'grow' }, el('button', { class: 'hot', onclick: () => play(0) }, '▶ Play from the start'), el('button', { onclick: () => emit('goto:mixer') }, 'Open the Mixer'))),
    el('div', { class: 'gcard' }, el('b', {}, 'Make it loud and polished'), el('small', {}, 'Mastering makes your song as loud and clear as songs online.'),
      el('div', { class: 'grow' }, el('button', { onclick: () => emit('goto:master') }, 'Open Master'))),
    el('div', { class: 'gcard' }, el('b', {}, 'Save it'), el('small', {}, 'Export your song as a WAV file you can play anywhere or upload.'),
      el('div', { class: 'grow' }, el('button', { class: 'hot', onclick: () => api.exportSong() }, 'Export my song'), el('button', { onclick: () => emit('goto:export') }, 'More export options'))));
}
