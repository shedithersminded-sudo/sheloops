// Shortcut keys you can change. One key does one thing in each place, and the keys that play
// instruments (Beat maker letters and numbers, Pad machine keys) never trigger anything else.
import { el, toast } from './util.js';
import { settings, saveSettings } from './store.js';

// where: song = every song page, studio, beat, any = every page
export const ACTIONS = [
  { id: 'play', label: 'Play or stop', where: 'song', def: 'space' },
  { id: 'undo', label: 'Undo', where: 'song', def: 'ctrl+z' },
  { id: 'redo', label: 'Redo', where: 'song', def: 'ctrl+y' },
  { id: 'record', label: 'Record', where: 'studio', def: 'r' },
  { id: 'split', label: 'Split the clip', where: 'studio', def: 's' },
  { id: 'del', label: 'Delete the clip', where: 'studio', def: 'delete' },
  { id: 'home', label: 'Jump to the start', where: 'studio', def: 'home' },
  { id: 'beatRec', label: 'Go record in the Studio', where: 'beat', def: 'shift+enter' },
  { id: 'hear', label: 'Open What I hear', where: 'any', def: 'shift+h' },
  { id: 'guide', label: 'Open the keys guide', where: 'any', def: 'shift+/' },
];
const WHERE = { song: 'Song pages', studio: 'Studio', beat: 'Beat maker', any: 'Everywhere' };
const overlap = (a, b) => a === b || a === 'any' || b === 'any' || a === 'song' || b === 'song';
// in the Beat maker plain letters and numbers play instruments, so actions there need a modifier or a special key
const playsNotes = c => /^([a-z0-9]|shift\+[a-z0-9])$/.test(c);

export const binds = () => { const k = settings.keys ||= {}; return Object.fromEntries(ACTIONS.map(a => [a.id, k[a.id] || a.def])); };
export function comboOf(e) {
  const c = e.code || '';
  const key = c.startsWith('Key') ? c.slice(3).toLowerCase() : c.startsWith('Digit') ? c.slice(5) : c === 'Space' ? 'space' : c === 'Slash' ? '/' : c === 'Enter' || c === 'NumpadEnter' ? 'enter' : (e.key || '').toLowerCase();
  if (['shift', 'control', 'alt', 'meta'].includes(key)) return '';
  return [(e.ctrlKey || e.metaKey) && 'ctrl', e.altKey && 'alt', e.shiftKey && 'shift', key].filter(Boolean).join('+');
}
// which action this key press means on this page (or null)
export function actionFor(e, page) {
  const c = comboOf(e); if (!c) return null; const B = binds();
  const here = a => a.where === 'any' || (a.where === 'song' && ['studio', 'beat', 'mixer', 'master', 'player'].includes(page)) || a.where === page;
  return (ACTIONS.find(a => B[a.id] === c && here(a)) || {}).id || null;
}
export const nice = c => c.split('+').map(p => ({ ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', space: 'Space', enter: 'Enter', delete: 'Delete', backspace: 'Backspace', home: 'Home', '/': '/' }[p] || p.toUpperCase())).join(' + ');
export const keyOf = id => nice(binds()[id]);

// the editor: click a key, press the new one. Clashes are blocked and explained.
export function keysEditor(onChange) {
  const box = el('div', { class: 'keyedit' });
  const draw = () => {
    const B = binds();
    box.replaceChildren(
      el('p', { class: 'hint' }, 'Click a key and press the new one. A key can only do one thing in each place. In the Beat maker and Pad machine, letters and numbers play sounds, so they never trigger shortcuts there.'),
      ...ACTIONS.map(a => el('div', { class: 'keyrow' }, el('span', { class: 'kwhere' }, WHERE[a.where]), el('b', {}, a.label),
        el('button', { class: 'keycap', onclick: e => capture(a, e.currentTarget) }, el('kbd', {}, nice(B[a.id]))),
        (settings.keys || {})[a.id] ? el('button', { class: 'sq', title: 'Back to ' + nice(a.def), onclick: () => { delete settings.keys[a.id]; saveSettings(); draw(); onChange && onChange(); } }, '↺') : null)),
      el('div', { class: 'hbtns' }, el('button', { onclick: () => { settings.keys = {}; saveSettings(); draw(); onChange && onChange(); toast('All keys are back to normal.'); } }, 'Reset all keys')));
  };
  const capture = (a, btn) => {
    btn.querySelector('kbd').textContent = 'press a key...'; btn.classList.add('listening');
    const h = ev => {
      ev.preventDefault(); ev.stopPropagation();
      if (ev.key === 'Escape') return done();
      const c = comboOf(ev); if (!c) return;
      const B = binds(), clash = ACTIONS.find(o => o.id !== a.id && B[o.id] === c && overlap(o.where, a.where));
      if (clash) { toast(`${nice(c)} already does "${clash.label}" (${WHERE[clash.where]}). Pick another key, or change that one first.`); return done(); }
      if ((a.where === 'beat' || a.where === 'song' || a.where === 'any') && playsNotes(c)) { toast(`${nice(c)} plays notes in the Beat maker. Use Ctrl, Alt, or a key like Enter or an F key.`); return done(); }
      (settings.keys ||= {})[a.id] = c; saveSettings(); toast(`${a.label}: ${nice(c)}`); done(); onChange && onChange();
    };
    const done = () => { removeEventListener('keydown', h, true); draw(); };
    addEventListener('keydown', h, true);
  };
  draw();
  return box;
}
