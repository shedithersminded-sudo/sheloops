// Quick tour banners: a glowing strip of steps on each page. Hover or tap a step and the thing it
// talks about lights up and pulses, so you can see exactly where to click.
import { $, el } from './util.js';
import { settings, saveSettings } from './store.js';

export const TOURS = {
  studio: ['Make a song in the Studio', [
    ['Add a beat', 'Click "Add my beat file" or drag a beat onto the timeline.', '.editbar .hot'],
    ['Record', 'Press Record (or R). A click counts you in.', '#recbtn'],
    ['Make it sound good', 'Open Vocal presets: pick a style, then stack Enhance and Voice FX.', '.itabs'],
    ['Hear only what you want', '"What I hear" turns any part on or off while you work.', '#nav .hearbtn'],
    ['Move things around', 'Hover a section and drag its ⠿ grip to move it, or fold it away.', '.stpanel .mvbar']]],
  beat: ['Make a beat', [
    ['Pick a style', 'Choose a style and load it to start fast, or build from empty.', '#view select'],
    ['Draw', 'Click squares in the grid to add drum hits. Drag to paint many.', '.dgrid, .roll'],
    ['Play it live', 'Use the keys on the drum pads or the piano and guitar.', '.drumpads, .playpanel'],
    ['Shape the sound', 'Open "Effects and knobs" under each track.', '.fxdrawer']]],
  pads: ['Play the Pad machine', [
    ['Tap', 'Tap pads or press 1 2 3 4, Q W E R, A S D F, Z X C V.', '.mpadgrid'],
    ['Record a loop', 'Press Play loop, then Record pads, and tap along.', '.ploopbar'],
    ['Your voice', 'Record voice loop records you for exactly one loop.', '.voicebtn'],
    ['Edit a pad', 'Right-click a pad to change its sound and add effects.', '.ped']]],
  dj: ['DJ like a pro', [
    ['Load', 'Drag tracks onto the decks, or click A or B in your crate.', '.booth'],
    ['Play and sync', 'Press ▶ on one deck and SYNC on the other.', '.transport'],
    ['Mix', 'Use a transition, or slide the crossfader yourself.', '.trans'],
    ['Visuals', 'Pick looks and colors in the Visual desk, then go full screen.', '.lightdesk']]],
  look: ['Make the studio yours', [
    ['Theme', 'Pick a theme, or make your own palette from 3 colors.', '.themes, .mpanel'],
    ['Effects', 'Choose glow, pulsing, flashing or calm in Style effects.', '.uifx'],
    ['Text glow', 'Turn glow on and pick its color and strength.', '.glowpanel'],
    ['Mouse', 'Custom cursor, trails and click effects.', '.mpanel']]],
};
export function tourBanner(page) {
  const t = TOURS[page]; if (!t) return null;
  const hidden = (settings.hideTours || []).includes(page);
  let lit = [];
  const light = sel => { unlight(); lit = [...document.querySelectorAll(sel)].slice(0, 3); lit.forEach(n => n.classList.add('tourlit')); if (lit[0]) lit[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  const unlight = () => { lit.forEach(n => n.classList.remove('tourlit')); lit = []; };
  const box = el('div', { class: 'tour' + (hidden ? ' mini' : '') },
    el('div', { class: 'tourhead' }, el('span', { class: 'tourled' }), el('b', {}, t[0]), el('small', {}, hidden ? 'Quick tour (click to open)' : 'Hover a step to see where it is'),
      el('button', { class: 'sq', title: hidden ? 'Show the tour' : 'Hide the tour', onclick: () => { const h = settings.hideTours ||= []; const i = h.indexOf(page); if (i >= 0) h.splice(i, 1); else h.push(page); saveSettings(); const nb = tourBanner(page); nb.dataset.page = page; box.replaceWith(nb); } }, hidden ? '▸' : '×')),
    hidden ? null : el('div', { class: 'toursteps' }, ...t[1].map(([title, text, sel], k) => el('button', { class: 'tourstep', style: `--k:${k}`, onpointerenter: () => light(sel), onpointerleave: unlight, onclick: () => { light(sel); setTimeout(unlight, 2400); } },
      el('span', { class: 'tnum' }, k + 1), el('span', { class: 'ttext' }, el('b', {}, title), el('small', {}, text))))));
  return box;
}
// put the tour at the top of the page every time a page draws itself
export function initTours(currentView) {
  const view = $('#view'); if (!view) return;
  new MutationObserver(() => {
    const v = currentView(); if (!TOURS[v] || !view.firstElementChild) return;
    const first = view.firstElementChild;
    if (first.classList.contains('tour') && first.dataset.page === v) return;
    view.querySelectorAll(':scope > .tour').forEach(n => n.remove());
    const b = tourBanner(v); b.dataset.page = v; view.prepend(b);
  }).observe(view, { childList: true });
}
