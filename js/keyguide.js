// Keys guide: a picture of the computer keyboard that shows what every key does, per area.
import { el, modal } from './util.js';
import { keysEditor, keyOf } from './keys.js';

const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const SECTIONS = {
  piano: { name: 'Beat: piano keys', color: 'k1', text: 'Pick an instrument track, then play it like a piano. The bottom letters are white keys, the row above are black keys.',
    keys: { a: 'C', w: 'C#', s: 'D', e: 'D#', d: 'E', f: 'F', t: 'F#', g: 'G', y: 'G#', h: 'A', u: 'A#', j: 'B', k: 'C', z: 'Oct -', x: 'Oct +' } },
  guitar: { name: 'Beat: guitar', color: 'k2', text: 'Pick an instrument track and the Guitar tab. Number keys strum the chords of your key. Hold Shift for an up strum. Q to Y pluck one string each (low to high).',
    keys: { 1: 'I', 2: 'ii', 3: 'iii', 4: 'IV', 5: 'V', 6: 'vi', 7: 'vii', q: 'E low', w: 'A', e: 'D', r: 'G', t: 'B', y: 'E high', z: 'Lower', x: 'Higher' } },
  pads: { name: 'Beat: drum pads', color: 'k3', text: 'Pick a drums track. Each key hits one row, in the same order as the grid. Hold Shift for a loud hit.',
    keys: { a: 'Pad 1', s: '2', d: '3', f: '4', g: '5', h: '6', j: '7', k: '8', q: '9', w: '10', e: '11', r: '12', t: '13', y: '14', u: '15', i: '16' } },
  studio: { name: 'Recording studio', color: 'k4', text: 'For the timeline in the Studio.',
    keys: {} },
};
const GLOBAL = () => [[keyOf('play'), 'Play or stop (Studio, Beat, Mixer, Master, Player)'], [keyOf('undo'), 'Undo'], [keyOf('redo'), 'Redo'], [keyOf('hear'), 'What I hear'], [keyOf('guide'), 'Open this guide']];
const STUDIO_MORE = () => [[keyOf('record'), 'Record'], [keyOf('split'), 'Split the clip'], [keyOf('del'), 'Delete the selected clip'], [keyOf('home'), 'Jump to the start'], ['Ctrl + C / X / V', 'Copy, cut, paste a clip'], [keyOf('beatRec'), 'From the Beat maker: go record']];
const ART = [['Arrows', 'Move the selected layer (Shift = bigger steps)'], ['Delete', 'Delete the selected layer'], ['Ctrl + D', 'Duplicate the selected layer'], ['Ctrl + Z / Y', 'Undo, redo']];
const RECORD = [['Rec notes / Rec hits', 'Turn it on, press Space, then play. What you play is written into the pattern.'], ['Shift + click a pad in the grid', 'Loud (accent) hit'], ['Drag in the grid', 'Paint many hits at once']];

export function openKeyGuide(view, edit = false) {
  let cur = edit ? 'mine' : view === 'studio' ? 'studio' : 'piano';
  const board = el('div', { class: 'kbmap' }), info = el('p', { class: 'hint' }), tabs = el('div', { class: 'ptabs' });
  const cols = el('div', { class: 'kgcols' });
  const draw = () => {
    tabs.innerHTML = ''; tabs.append(...Object.entries(SECTIONS).map(([id, s]) => el('button', { class: 'ptab ' + s.color + (id === cur ? ' on' : ''), onclick: () => { cur = id; draw(); } }, s.name)), el('button', { class: 'ptab k4' + (cur === 'mine' ? ' on' : ''), onclick: () => { cur = 'mine'; draw(); } }, 'Change my keys'));
    cols.replaceChildren(list('Everywhere', GLOBAL()), list('Making beats', RECORD), list('Studio', STUDIO_MORE()), list('Cover art', ART));
    if (cur === 'mine') { info.textContent = 'Set your own shortcut keys.'; board.replaceChildren(keysEditor(draw)); cols.hidden = true; return; }
    cols.hidden = false;
    const S = SECTIONS[cur];
    if (cur === 'studio') { const b = (id, w) => { const c = keyOf(id).toLowerCase(); if (c.length === 1) S.keys[c] = w; }; S.keys = {}; b('record', 'Record'); b('split', 'Split'); }
    info.textContent = S.text;
    board.innerHTML = '';
    ROWS.forEach((row, ri) => board.append(el('div', { class: 'kbrow', style: `--indent:${ri * 0.5}` }, [...row].map(ch => {
      const what = S.keys[ch];
      return el('div', { class: 'kcap' + (what ? ' used ' + S.color : '') }, el('b', {}, ch.toUpperCase()), what ? el('small', {}, what) : null);
    }))));
    board.append(el('div', { class: 'kbrow' }, el('div', { class: 'kcap wide' + (cur === 'guitar' ? ' used k2' : '') }, el('b', {}, 'Shift'), cur === 'guitar' ? el('small', {}, 'Up strum') : cur === 'pads' ? el('small', {}, 'Loud') : null),
      el('div', { class: 'kcap space used k0' }, el('b', {}, 'Space'), el('small', {}, 'Play / stop'))));
  };
  const list = (title, rows) => el('div', { class: 'kglist' }, el('b', {}, title), rows.map(([k, d]) => el('div', {}, el('kbd', {}, k), el('span', {}, d))));
  draw();
  modal('Keys guide', el('div', { class: 'keyguide' }, tabs, info, board,
    cols));
}
