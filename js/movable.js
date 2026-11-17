// Movable panels: drag sections by their grip to put them where you like, fold them away, and it is remembered.
import { el, toast } from './util.js';

const KEY = 'loopden.panels';
const store = JSON.parse(localStorage.getItem(KEY) || '{}'); // { page: { order: [ids], folded: [ids] } }
const save = () => localStorage.setItem(KEY, JSON.stringify(store));
export const resetPanels = page => { delete store[page]; save(); };

// container: element whose children with data-panel are movable. page: a name for saving.
// opts.onChange(order) runs after a move (for grid layouts that need to know the order).
export function makeMovable(container, page, opts = {}) {
  const st = store[page] ||= { order: [], folded: [] };
  const kids = () => [...container.children].filter(k => k.dataset && k.dataset.panel);
  // put panels back in the saved order
  const byId = Object.fromEntries(kids().map(k => [k.dataset.panel, k]));
  const anchor = kids()[0] ? kids()[0].previousSibling : null;
  let ref = anchor ? anchor.nextSibling : container.firstChild;
  for (const id of st.order) { const k = byId[id]; if (k) { container.insertBefore(k, ref); ref = k.nextSibling; } }
  for (const k of kids()) {
    const id = k.dataset.panel, title = k.dataset.title || id;
    k.classList.add('mvpanel'); k.classList.toggle('folded', st.folded.includes(id));
    if (k.querySelector(':scope > .mvbar')) continue;
    const grip = el('span', { class: 'mvgrip', title: 'Drag to move this section' }, '⠿');
    const fold = el('button', { class: 'mvfold', title: 'Fold or unfold this section', onclick: e => { e.stopPropagation(); const f = !k.classList.contains('folded'); k.classList.toggle('folded', f); st.folded = st.folded.filter(x => x !== id); if (f) st.folded.push(id); save(); opts.onChange?.(order()); } });
    const bar = el('div', { class: 'mvbar' }, grip, el('span', { class: 'mvtitle' }, title), fold);
    k.prepend(bar);
    grip.addEventListener('pointerdown', e => startDrag(e, k));
    bar.addEventListener('dblclick', () => fold.click());
  }
  const order = () => kids().map(k => k.dataset.panel);
  function startDrag(e, k) {
    e.preventDefault();
    const line = el('div', { class: 'mvline' }); document.body.append(line);
    k.classList.add('mvdragging');
    let target = null, before = true;
    const move = ev => {
      const list = kids().filter(x => x !== k);
      let best = null, bd = Infinity;
      for (const x of list) { const r = x.getBoundingClientRect(), cy = r.top + r.height / 2, cx = r.left + r.width / 2, d = Math.hypot((ev.clientX - cx) * 0.4, ev.clientY - cy); if (d < bd) { bd = d; best = x; } }
      if (!best) return;
      const r = best.getBoundingClientRect(); before = ev.clientY < r.top + r.height / 2; target = best;
      Object.assign(line.style, { left: r.left + 'px', width: r.width + 'px', top: (before ? r.top - 5 : r.bottom + 3) + 'px' });
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); line.remove(); k.classList.remove('mvdragging');
      if (!target) return;
      container.insertBefore(k, before ? target : target.nextSibling);
      st.order = order(); save(); opts.onChange?.(st.order);
      k.animate([{ transform: 'scale(.98)', opacity: .6 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'ease-out' });
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }
  opts.onChange?.(order());
  return { order, reset: () => { resetPanels(page); toast('Layout reset.'); } };
}
// small "Reset layout" button for a page header
export const resetBtn = (page, rerender) => el('button', { class: 'mvreset', title: 'Put every section back where it started', onclick: () => { resetPanels(page); rerender(); toast('Layout reset.'); } }, 'Reset layout');
