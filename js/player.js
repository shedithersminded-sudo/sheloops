// Simple music player: my songs with their cover art.
import { $, el, fmtTime } from './util.js';
import { helpBtn } from './help.js';
import { app, openProject, songEnd, emit } from './state.js';
import { db } from './store.js';
import { T, play, stop, currentPos } from './engine.js';

let bar, timeEl;
export async function renderPlayer() {
  const songs = (await db.all('projects')).sort((a, b) => b.updated - a.updated);
  if (app.view !== 'player') return;
  const view = $('#view'); view.innerHTML = '';
  const P = app.P;
  bar = el('input', { type: 'range', class: 'pbar', min: 0, max: 1000, value: 0, oninput: e => { const pos = e.target.value / 1000 * songEnd(); if (T.playing) play(pos); else app.playhead = pos; } });
  timeEl = el('span', { class: 'hint' });
  const art = P && P.cover ? el('img', { class: 'bigcover', src: P.cover, alt: '' }) : el('div', { class: 'bigcover blank' }, P ? P.name.slice(0, 2).toUpperCase() : '--');
  view.append(el('div', { class: 'player' },
    el('div', { class: 'nowplaying panel' }, art,
      el('div', { class: 'np-info' },
        el('small', {}, 'Now playing'), el('h1', {}, P ? P.name : 'No song'), el('p', {}, P && P.artist ? P.artist : ''),
        el('div', { class: 'np-ctl' },
          el('button', { class: 'hot big', onclick: () => { T.playing ? stop() : play(T.playing ? undefined : app.playhead); renderPlayer(); } }, T.playing ? 'Pause' : 'Play'),
          el('button', { onclick: () => { stop(); app.playhead = 0; renderPlayer(); } }, 'Back to start'),
          helpBtn('player')),
        bar, timeEl,
        el('div', { class: 'pbtns' }, el('button', { onclick: () => emit('goto:art') }, 'Change cover art'), el('button', { onclick: () => emit('goto:studio') }, 'Open in studio')))),
    el('h2', { class: 'h2' }, 'My songs'),
    el('div', { class: 'songlist' }, songs.map(s => el('button', { class: 'songrow' + (P && P.id === s.id ? ' on' : ''), onclick: async () => { stop(); await openProject(s); emit('goto:player'); } },
      s.cover ? el('img', { src: s.cover, alt: '' }) : el('span', { class: 'blank' }, s.name.slice(0, 2).toUpperCase()),
      el('b', {}, s.name), el('small', {}, s.artist || ''))))));
  playerTick();
}
export function playerTick() {
  if (!bar || !document.body.contains(bar) || !app.P) return;
  const pos = currentPos(), end = songEnd();
  if (document.activeElement !== bar) bar.value = Math.round(pos / end * 1000);
  timeEl.textContent = `${fmtTime(pos)} / ${fmtTime(end)}`;
}
