// Keys guide: a picture of the computer keyboard that shows what every key does, per area.
import { el, modal } from './util.js';

const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const SECTIONS = {
  piano: { name: 'Beat: piano keys', color: 'k1', text: 'Pick an instrument track, then play it like a piano. The bottom letters are white keys, the row above are black keys.',
    keys: { a: 'C', w: 'C#', s: 'D', e: 'D#', d: 'E', f: 'F', t: 'F#', g: 'G', y: 'G#', h: 'A', u: 'A#', j: 'B', k: 'C', z: 'Oct -', x: 'Oct +' } },
  guitar: { name: 'Beat: guitar', color: 'k2', text: 'Pick an instrument track and the Guitar tab. Number keys strum the chords of your key. Hold Shift for an up strum. Q to Y pluck one string each (low to high).',
    keys: { 1: 'I', 2: 'ii', 3: 'iii', 4: 'IV', 5: 'V', 6: 'vi', 7: 'vii', q: 'E low', w: 'A', e: 'D', r: 'G', t: 'B', y: 'E high', z: 'Lower', x: 'Higher' } },
  pads: { name: 'Beat: drum pads', color: 'k3', text: 'Pick a drums track. Each key hits one row, in the same order as the grid. Hold Shift for a loud hit.',
    keys: { a: 'Pad 1', s: '2', d: '3', f: '4', g: '5', h: '6', j: '7', k: '8', q: '9', w: '10', e: '11', r: '12', t: '13', y: '14', u: '15', i: '16' } },
  studio: { name: 'Recording studio', color: 'k4', text: 'For the timeline in the Studio.',
    keys: { r: 'Record', s: 'Split' } },
};
const GLOBAL = [
  ['Space', 'Play or stop (Studio, Beat, Mixer, Master, Player)'],
  ['Ctrl + Z', 'Undo'], ['Ctrl + Y', 'Redo (or Ctrl + Shift + Z)'],
  ['?', 'Open this guide'],
];
const STUDIO_MORE = [['Delete', 'Delete the selected clip'], ['Home', 'Jump to the start'], ['Ctrl + C / X / V', 'Copy, cut, paste a clip']];
const ART = [['Arrows', 'Move the selected layer (Shift = bigger steps)'], ['Delete', 'Delete the selected layer'], ['Ctrl + D', 'Duplicate the selected layer'], ['Ctrl + Z / Y', 'Undo, redo']];
const RECORD = [['Rec notes / Rec hits', 'Turn it on, press Space, then play. What you play is written into the pattern.'], ['Shift + click a pad in the grid', 'Loud (accent) hit'], ['Drag in the grid', 'Paint many hits at once']];

export function openKeyGuide(view) {
  let cur = view === 'studio' ? 'studio' : 'piano';
  const board = el('div', { class: 'kbmap' }), info = el('p', { class: 'hint' }), tabs = el('div', { class: 'ptabs' });
  const draw = () => {
    const S = SECTIONS[cur];
    tabs.innerHTML = ''; tabs.append(...Object.entries(SECTIONS).map(([id, s]) => el('button', { class: 'ptab ' + s.color + (id === cur ? ' on' : ''), onclick: () => { cur = id; draw(); } }, s.name)));
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
    el('div', { class: 'kgcols' }, list('Everywhere', GLOBAL), list('Making beats', RECORD), list('Studio', STUDIO_MORE), list('Cover art', ART))));
}
