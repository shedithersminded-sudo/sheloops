// "What I hear": one switchboard on every page. Turn any part on or off, keep your sound safe,
// and find where a strange noise comes from. Nothing is deleted. It only changes what you hear.
import { el, toast, knob } from './util.js';
import { app, save, emit, on } from './state.js';
import { E, applyMix, T, stop, resetNodes, micSettings, applyMicSettings, updateMonitor, clearNotches, openMic } from './engine.js';
import { SHIELD_INFO, fixButton, shieldKnobs } from './micui.js';
import { actionFor } from './keys.js';
import { settings, saveSettings } from './store.js';

let btn = null, panel = null;
export function initHear() {
  if (btn) return; btn = true;
  on(k => { if (k === 'shield') toast('A squeal kept coming back, so the Squeal shield turned itself up to Strong. Your effects still work.'); if ((k === 'shield' || k === 'feedback') && panel && tab === 'flow') fill(); });
  addEventListener('keydown', e => { if (actionFor(e, app.view) === 'hear' && !e.target.matches('input, textarea, select')) { e.preventDefault(); panel ? closePanel() : openPanel(); } });
}
export const hearButton = () => el('button', { class: 'navbtn hearbtn' + (panel ? ' on' : ''), title: 'Turn parts of the sound on or off, and keep your sound safe (Shift + H)', onclick: () => panel ? closePanel() : openPanel() }, el('span', { class: 'hearicon' }, el('i'), el('i'), el('i')), 'What I hear');
function closePanel() { panel?.remove(); panel = null; document.querySelectorAll('.hearbtn').forEach(b => b.classList.remove('on')); }
async function openPanel() { closePanel(); document.querySelectorAll('.hearbtn').forEach(b => b.classList.add('on')); panel = el('div', { class: 'hearpanel' }); document.body.append(panel); await fill(); }
const refreshView = () => { if (app.view && ['studio', 'beat', 'mixer'].includes(app.view)) emit('goto:' + app.view); };
let tab = 'flow';

// stop every sound right now, and clear the echoes and reverb tails
async function panic() {
  if (T.playing) stop();
  settings.monitor = false; saveSettings(); updateMonitor();
  try { const pads = await import('./pads.js'); pads.stopPads(); } catch { }
  try { const dj = await import('./dj.js'); for (const id of ['A', 'B']) if (dj.D[id].playing) dj.djToggle(id); } catch { }
  if (E.g) { const m = E.g.master.gain, t = E.ctx.currentTime; m.cancelScheduledValues(t); m.setValueAtTime(0, t); resetNodes(); applyMix(undefined, true); m.setTargetAtTime(app.P ? app.P.master.vol : 1, t + 0.3, 0.1); }
  toast('All sound stopped. Echo and reverb tails cleared. Hear myself is off.');
}
// look at the current setup and name the most likely cause of a noise
function diagnose() {
  const P = app.P, M = micSettings(), out = [];
  const vocals = P ? P.tracks.filter(t => t.kind !== 'file') : [];
  if (settings.monitor && M.monFx && !M.speakers) out.push(['bad', 'Hear myself is on with effects', 'If you are not on headphones, your speakers go back into the mic and it squeals. Press Fix my squeal, wear headphones, or set the Squeal shield to Strong.']);
  if (settings.monitor && M.speakers) out.push(['warn', 'Hear myself on speakers', 'Keep the volume low and the Feedback guard on.']);
  if (!M.guard) out.push(['warn', 'Feedback guard is off', 'Turn it on so the squeal stops itself.']);
  const heavy = vocals.filter(t => (t.fx || []).some(f => f.on && (f.type === 'comp' && f.params.makeup >= 6 || f.type === 'limiter' && f.params.drive >= 2 || f.type === 'dist')));
  const ungated = heavy.filter(t => !t.gate);
  if (ungated.length) out.push(['bad', `${ungated.map(t => t.name).join(', ')}: loud effects with no gate`, 'Strong compression turns your room noise up between words. Turn on the Room gate in Sound path.']);
  const crush = vocals.filter(t => (t.fx || []).some(f => f.on && (f.type === 'bitcrush' && f.params.bits <= 6 || f.type === 'ring')));
  if (crush.length) out.push(['warn', 'Lo-fi crusher or robot effect on ' + crush.map(t => t.name).join(', '), 'These add buzzy, high digital tones on purpose. Turn their Mix down if they sound harsh.']);
  const bright = vocals.filter(t => (t.fx || []).some(f => f.on && f.type === 'eq' && f.params.air + f.params.presence >= 9));
  if (bright.length) out.push(['warn', 'Very bright EQ on ' + bright.map(t => t.name).join(', '), 'Lots of Presence and Air makes hiss sharp. Lower them a little, or add the De-esser.']);
  if (E.mic && E.mic.notches.length) out.push(['good', `Feedback guard stopped ${E.mic.notches.length} squeal${E.mic.notches.length === 1 ? '' : 's'}`, 'If your voice now sounds thin, open Mic sound and reset the fixes.']);
  if (!out.length) out.push(['good', 'Nothing looks wrong right now', 'If you still hear a noise, turn effects off below. If it stops, the noise is in your effects. If not, it is your room or mic: open Mic sound.']);
  return out;
}
async function fill() {
  if (!panel) return;
  const P = app.P, M = micSettings();
  const row = (label, sub, on, toggle, solo) => el('div', { class: 'hrow' + (on ? ' on' : '') },
    el('button', { class: 'hswitch', title: on ? 'Click to turn it off' : 'Click to hear it again', onclick: async () => { await toggle(); await fill(); refreshView(); } }, el('span', { class: 'hled' })),
    el('div', { class: 'hlabel' }, el('b', {}, label), sub ? el('small', {}, sub) : null),
    solo ? el('button', { class: 'honly', title: 'Hear only this', onclick: async () => { await solo(); await fill(); refreshView(); } }, 'Only this') : null);
  const sec = (title, why, ...rows) => el('div', { class: 'hsec' }, el('div', { class: 'hsect' }, title), why ? el('p', { class: 'hwhy' }, why) : null, ...rows.filter(Boolean));
  const tabs = el('div', { class: 'htabs' }, ...[['flow', 'Sound path'], ['parts', 'Parts'], ['fix', 'Find the noise']].map(([k, l]) => el('button', { class: 'htab' + (tab === k ? ' on' : ''), onclick: () => { tab = k; fill(); } }, l)));
  const parts = [];
  if (tab === 'parts') {
    if (P) {
      const songParts = [...P.tracks.map(t => ({ t, label: t.name, sub: t.kind === 'file' ? 'beat file' : 'vocal track' })), { t: P.beat, label: 'Beat maker', sub: 'everything from the Beat page' }];
      const soloOnly = target => () => { for (const x of songParts) x.t.mute = x.t !== target; applyMix(); save(); toast(`Only ${target === P.beat ? 'the beat maker' : target.name} is on.`); };
      parts.push(sec('Your song: ' + P.name, 'Switch a part off to work without it. Nothing gets deleted.',
        ...songParts.map(x => row(x.label, x.sub, !x.t.mute, () => { x.t.mute = !x.t.mute; applyMix(); save(); }, soloOnly(x.t))),
        ...P.beat.tracks.map(t => row(t.name, 'inside the beat maker', !t.mute && !P.beat.mute, () => { t.mute = !t.mute; applyMix(); save(); })),
        el('div', { class: 'hbtns' }, el('button', { onclick: async () => { for (const x of songParts) x.t.mute = false; for (const t of P.beat.tracks) t.mute = false; applyMix(); save(); await fill(); refreshView(); toast('Everything in your song is on again.'); } }, 'Turn everything on'))));
    }
    parts.push(sec('Helpers', null, row('Click (metronome)', 'the tick while you play or record', !!settings.metro, () => { settings.metro = !settings.metro; saveSettings(); }),
      row('Hear myself', 'your mic in your ears while you record', !!settings.monitor, () => { settings.monitor = !settings.monitor; saveSettings(); updateMonitor(); })));
    try { const pads = await import('./pads.js'); parts.push(sec('Pad machine', null, row('Pad loop', pads.padsPlaying() ? 'playing now' : 'stopped', pads.padsPlaying(), () => pads.padLoopToggle()))); } catch { }
    try { const dj = await import('./dj.js'); if (dj.D.A.buf || dj.D.B.buf) parts.push(sec('DJ booth', null, ...['A', 'B'].filter(id => dj.D[id].buf).map(id => row('Deck ' + id, dj.D[id].name, dj.D[id].playing, () => dj.djToggle(id))))); } catch { }
  } else if (tab === 'flow') {
    // the path your sound takes, as four stops. Each stop says what it does and holds its own switches.
    const vocals = P ? P.tracks.filter(t => t.kind !== 'file') : [];
    const gated = vocals.length && vocals.every(t => t.gate), fxOn = vocals.some(t => !t.fxBypass), gateDb = vocals[0] ? vocals[0].gateDb : -55;
    const set = (k, v) => { M[k] = v; saveSettings(); applyMicSettings(); };
    const pill = (on, a, b) => el('span', { class: 'fpill' + (on ? ' on' : '') }, on ? a : b);
    const stop_ = (n, icon, title, what, state, ...kids) => el('div', { class: 'fstop', style: `--n:${n}` },
      el('div', { class: 'fstop-h' }, el('span', { class: 'fnum' }, n), el('span', { class: 'ficon ' + icon }), el('b', {}, title), state),
      el('p', { class: 'fwhat' }, what), ...kids.filter(Boolean));
    const notes = E.mic ? E.mic.notches.length : 0;
    parts.push(
      el('div', { class: 'fquick' }, fixButton(() => fill()), el('button', { class: 'danger panic', onclick: panic }, 'Stop all sound'),
        el('span', { class: 'fguard' + (M.guard ? ' on' : '') }, el('i'), M.guard ? (notes ? `Guard stopped ${notes} squeal${notes === 1 ? '' : 's'}` : 'Guard listening') : 'Guard off')),
      el('div', { class: 'fpath' },
        stop_(1, 'i-mic', 'Your mic', 'Picks up your voice, and the room around you. The gate goes silent between your words so room noise never gets turned up.', pill(gated, 'room gate on', 'room gate off'),
          row('Room gate on every vocal', 'silence between words', !!gated, () => { for (const t of vocals) { t.gate = !gated; t.gateDb = t.gateDb || -55; } applyMix(); save(); }),
          vocals.length ? knob('Close below', -80, -25, 1, gateDb, v => { for (const t of vocals) t.gateDb = v; applyMix(); save(); }, v => v + ' dB', null, 'dial sm') : null,
          el('button', { onclick: () => import('./micui.js').then(m => m.openMicPanel()) }, 'Mic sound and EQ')),
        stop_(2, 'i-fx', 'Your effects', 'Auto-Tune, reverb, echo and the rest. Turn them all off for a second to check if a strange sound comes from them. Your settings stay.', pill(fxOn, 'effects on', 'dry'),
          row('Vocal effects', fxOn ? 'you hear them' : 'switched off', fxOn, () => { for (const t of vocals) t.fxBypass = fxOn; applyMix(); save(); })),
        stop_(3, 'i-ears', 'Your ears', 'Hear yourself while you record. The squeal shield keeps it safe, even with effects on. It never changes your recording.', pill(!!settings.monitor, M.monFx ? 'hearing myself + effects' : 'hearing myself dry', 'not hearing myself'),
          row('Hear myself', settings.monitor ? 'on' : 'off', !!settings.monitor, async () => { settings.monitor = !settings.monitor; saveSettings(); if (settings.monitor) await openMic().catch(() => { }); updateMonitor(); }),
          el('div', { class: 'fxlib' }, el('button', { class: 'chip' + (M.monFx ? ' on' : ''), onclick: async () => { set('monFx', true); await fill(); } }, 'With my effects'), el('button', { class: 'chip' + (!M.monFx ? ' on' : ''), onclick: async () => { set('monFx', false); await fill(); } }, 'Dry voice')),
          el('div', { class: 'fsub' }, 'Squeal shield'),
          el('div', { class: 'fxlib' }, ...Object.entries(SHIELD_INFO).map(([k, [n]]) => el('button', { class: 'chip' + (M.shield === k ? ' on' : ''), onclick: async () => { delete M.sh; set('shield', k); await fill(); } }, n))),
          el('small', { class: 'hint' }, SHIELD_INFO[M.shield || 'auto'][1]),
          shieldKnobs(M, (k, v) => { if (v === undefined) delete M[k]; else M[k] = v; saveSettings(); applyMicSettings(); }),
          knob('Volume', 0, 1.5, 0.01, M.monVol, v => { M.monVol = v; saveSettings(); updateMonitor(); }, v => Math.round(v * 100) + '%', null, 'dial sm'),
          row('I am on speakers', 'no headphones', !!M.speakers, async () => { M.speakers = !M.speakers; if (M.speakers) { M.shield = 'strong'; M.guard = true; settings.ec = true; } saveSettings(); applyMicSettings(); })),
        stop_(4, 'i-spk', 'Your speakers', 'Everything together, at the master volume. If a sound will not stop, Stop all sound clears it, echoes and all.', pill(!!M.guard, 'feedback guard on', 'feedback guard off'),
          row('Feedback guard', notes ? `stopped ${notes} so far` : 'listens for a squeal and cuts it', M.guard, () => { M.guard = !M.guard; saveSettings(); }),
          notes ? el('button', { onclick: async () => { clearNotches(); await fill(); } }, 'Forget the fixes') : null,
          P ? knob('Master', 0, 1.2, 0.01, P.master.vol, v => { P.master.vol = v; applyMix(); save(); }, v => Math.round(v * 100) + '%', null, 'dial sm') : null)));
  } else {
    parts.push(sec('What I found', 'A quick check of your setup right now.', ...diagnose().map(([lvl, t, w]) => el('div', { class: 'hfind ' + lvl }, el('span', { class: 'dot' }), el('div', {}, el('b', {}, t), el('small', {}, w))))),
      sec('Still hearing it?', null, el('ol', { class: 'hsteps' },
        el('li', {}, 'Press Stop all sound. If it keeps going, it is outside SHELOOPS (another tab or app).'),
        el('li', {}, 'Turn Your effects off in Sound path. If it stops, one effect is the cause: open the Sound stack and turn layers off one by one.'),
        el('li', {}, 'If it only happens while you talk, it is feedback or room noise: wear headphones, or open Mic sound.')),
        el('div', { class: 'hbtns' }, el('button', { class: 'danger panic', onclick: panic }, 'Stop all sound'), el('button', { onclick: () => import('./micui.js').then(m => m.openMicPanel()) }, 'Mic sound'))));
  }
  panel.innerHTML = '';
  panel.append(
    el('div', { class: 'hhead' }, el('b', {}, 'What I hear'), el('button', { class: 'sq', title: 'Close', onclick: closePanel }, '×')),
    el('p', { class: 'hexplain' }, 'Your sound control room. Switch parts on and off, keep your sound clean and safe, and track down any strange noise. Shift + H opens it anywhere.'),
    tabs, ...parts);
}
