// "What I hear": one switchboard on every page to turn any part of the sound on or off while you work.
// Nothing is deleted. It only changes what you hear.
import { el, toast } from './util.js';
import { app, save, emit } from './state.js';
import { applyMix, T } from './engine.js';
import { settings, saveSettings } from './store.js';

let btn = null, panel = null;
export function initHear() {
  if (btn) return;
  btn = true;
  addEventListener('keydown', e => { if (e.key.toLowerCase() === 'h' && e.shiftKey && !e.ctrlKey && !e.target.matches('input, textarea, select')) { e.preventDefault(); panel ? closePanel() : openPanel(); } });
}
export const hearButton = () => el('button', { class: 'navbtn hearbtn' + (panel ? ' on' : ''), title: 'Turn parts of the sound on or off while you work (Shift + H)', onclick: () => panel ? closePanel() : openPanel() }, el('span', { class: 'hearicon' }, el('i'), el('i'), el('i')), 'What I hear');
function closePanel() { panel?.remove(); panel = null; document.querySelectorAll('.hearbtn').forEach(b => b.classList.remove('on')); }
async function openPanel() {
  closePanel(); document.querySelectorAll('.hearbtn').forEach(b => b.classList.add('on'));
  panel = el('div', { class: 'hearpanel' }); document.body.append(panel); await fill();
}
const refreshView = () => { if (app.view && ['studio', 'beat', 'mixer'].includes(app.view)) emit('goto:' + app.view); };
async function fill() {
  if (!panel) return;
  const P = app.P;
  const row = (label, sub, on, toggle, solo) => el('div', { class: 'hrow' + (on ? ' on' : '') },
    el('button', { class: 'hswitch', title: on ? 'Click to turn it off' : 'Click to hear it again', onclick: async () => { await toggle(); await fill(); refreshView(); } }, el('span', { class: 'hled' })),
    el('div', { class: 'hlabel' }, el('b', {}, label), sub ? el('small', {}, sub) : null),
    solo ? el('button', { class: 'honly', title: 'Hear only this, turn the other song parts off', onclick: async () => { await solo(); await fill(); refreshView(); } }, 'Only this') : null);
  const sec = (title, ...rows) => el('div', { class: 'hsec' }, el('div', { class: 'hsect' }, title), ...rows.filter(Boolean));
  const parts = [];
  if (P) {
    const songParts = [...P.tracks.map(t => ({ t, label: t.name, sub: t.kind === 'file' ? 'beat file' : 'vocal track' })), { t: P.beat, label: 'Beat maker', sub: 'everything from the Beat page' }];
    const soloOnly = target => () => { for (const x of songParts) x.t.mute = x.t !== target; applyMix(); save(); toast(`Only ${target === P.beat ? 'the beat maker' : target.name} is on. Turn others back on any time.`); };
    parts.push(sec('Your song: ' + P.name,
      ...songParts.map(x => row(x.label, x.sub, !x.t.mute, () => { x.t.mute = !x.t.mute; applyMix(); save(); }, soloOnly(x.t))),
      ...P.beat.tracks.map(t => row(t.name, 'inside the beat maker', !t.mute && !P.beat.mute, () => { t.mute = !t.mute; applyMix(); save(); })),
      el('div', { class: 'hbtns' }, el('button', { onclick: async () => { for (const x of songParts) x.t.mute = false; for (const t of P.beat.tracks) t.mute = false; applyMix(); save(); await fill(); refreshView(); toast('Everything in your song is on again.'); } }, 'Turn everything on'))));
  }
  parts.push(sec('Helpers', row('Click (metronome)', 'the tick while you play or record', !!settings.metro, () => { settings.metro = !settings.metro; saveSettings(); })));
  try {
    const pads = await import('./pads.js');
    parts.push(sec('Pad machine', row('Pad loop', pads.padsPlaying() ? 'playing now' : 'stopped', pads.padsPlaying(), () => pads.padLoopToggle())));
  } catch { }
  try {
    const dj = await import('./dj.js');
    if (dj.D.A.buf || dj.D.B.buf) parts.push(sec('DJ booth', ...['A', 'B'].filter(id => dj.D[id].buf).map(id => row('Deck ' + id, dj.D[id].name, dj.D[id].playing, () => dj.djToggle(id)))));
  } catch { }
  panel.innerHTML = '';
  panel.append(
    el('div', { class: 'hhead' }, el('b', {}, 'What I hear'), el('button', { class: 'sq', title: 'Close', onclick: closePanel }, '×')),
    el('p', { class: 'hexplain' }, 'Turn any part off while you work, and keep hearing the rest. Nothing gets deleted. Click again to hear it. "Only this" plays just that part. Shift + H opens this from anywhere.'),
    ...parts,
    T.playing ? null : el('p', { class: 'hint' }, 'Tip: press Space on the Studio or Beat page to play while you switch things.'));
}
