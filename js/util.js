import { helpBtn } from './help.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}

export const uid = () => Math.random().toString(36).slice(2, 10);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const pct = v => Math.round(v * 100) + '';
export const panFmt = v => Math.abs(v) < 0.02 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100);
export const dbFmt = v => (v <= 0.0001 ? '-inf' : (20 * Math.log10(v)).toFixed(1)) + ' dB';

export function fmtTime(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

let toastT;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
}

// Slider with label, value readout and an optional help button.
export function knob(label, min, max, step, val, on, fmt = v => v, help, cls = '') {
  const out = el('span', { class: 'val' }, fmt(val));
  const i = el('input', { type: 'range', min, max, step });
  i.value = val;
  if (cls.split(' ').includes('dial')) return dial(label, +min, +max, +step, val, on, fmt, help, cls, out, i);
  i.addEventListener('input', () => { const v = +i.value; out.textContent = fmt(v); on(v); });
  return el('label', { class: 'knob ' + cls }, el('span', { class: 'lab' }, el('span', {}, label, help ? helpBtn(help) : null), out), i);
}

// Rotary knob that lights up. Drag up or down, scroll, use arrow keys, double-click to reset.
function dial(label, min, max, step, val, on, fmt, help, cls, out, i) {
  const def = val, ring = el('span', { class: 'ring' }), cap = el('span', { class: 'cap' }, el('span', { class: 'tick' }));
  const d = el('span', { class: 'dialbody', title: 'Drag up or down. Double-click to reset.' }, ring, cap);
  const paint = v => { const p = (v - min) / ((max - min) || 1); d.style.setProperty('--p', p.toFixed(4)); if (min < 0 && max > 0) d.style.setProperty('--z', ((0 - min) / (max - min)).toFixed(4)); out.textContent = fmt(v); };
  const setV = v => { v = Math.round(clamp(v, min, max) / step) * step; v = +v.toFixed(6); if (v === +i.value) return; i.value = v; paint(v); on(v); };
  i.className = 'sr'; i.addEventListener('input', () => { paint(+i.value); on(+i.value); });
  d.addEventListener('pointerdown', e => {
    e.preventDefault(); d.setPointerCapture(e.pointerId); d.classList.add('drag'); i.focus({ preventScroll: true });
    let y = e.clientY, acc = +i.value;
    d.onpointermove = ev => { acc += (y - ev.clientY) * (max - min) / (ev.shiftKey ? 600 : 160); y = ev.clientY; setV(acc); };
    d.onpointerup = () => { d.onpointermove = null; d.classList.remove('drag'); };
  });
  d.addEventListener('wheel', e => { e.preventDefault(); setV(+i.value - Math.sign(e.deltaY) * Math.max(step, (max - min) / 50)); }, { passive: false });
  d.addEventListener('dblclick', () => setV(def));
  paint(val);
  return el('label', { class: 'knob dialknob ' + cls }, d, out, el('span', { class: 'lab' }, el('span', {}, label, help ? helpBtn(help) : null)), i);
}

export function toggle(label, on, set, help, cls = '') {
  const b = el('button', { class: 'tog ' + cls + (on ? ' on' : ''), type: 'button' }, label);
  b.addEventListener('click', () => { const v = !b.classList.contains('on'); b.classList.toggle('on', v); set(v); });
  return help ? el('span', { class: 'withhelp ' + cls }, b, helpBtn(help)) : b;
}

export function select(options, value, on, attrs = {}) {
  return el('select', { ...attrs, onchange: e => on(e.target.value) },
    options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return el('option', { value: v, selected: String(v) === String(value) }, l); }));
}

// Simple modal. Returns a close function.
export function modal(title, body, actions = []) {
  const close = () => wrap.remove();
  const wrap = el('div', { class: 'modal-wrap', onpointerdown: e => { if (e.target === wrap) close(); } },
    el('div', { class: 'modal' },
      el('div', { class: 'modal-head' }, el('h3', {}, title), el('button', { class: 'x', onclick: close }, '×')),
      el('div', { class: 'modal-body' }, body),
      actions.length ? el('div', { class: 'modal-foot' }, actions.map(([l, fn, c]) => el('button', { class: c || '', onclick: () => { if (fn() !== false) close(); } }, l))) : null,
    ));
  document.body.append(wrap);
  return close;
}

export function ask(title, label, value) {
  return new Promise(res => {
    const inp = el('input', { class: 'textin', value });
    const close = modal(title, el('label', { class: 'field' }, label, inp), [['Cancel', () => res(null)], ['OK', () => res(inp.value.trim() || null), 'hot']]);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { res(inp.value.trim() || null); close(); } });
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}

export function confirmBox(title, text, okLabel = 'Yes') {
  return new Promise(res => modal(title, el('p', {}, text), [['Cancel', () => res(false)], [okLabel, () => res(true), 'hot']]));
}

export function download(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
export const safeName = s => (s || 'song').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'song';

// Read a theme color (CSS variable) for canvas drawing
const varCache = new Map();
export function cssVar(n) {
  if (!varCache.has(n)) varCache.set(n, getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#000');
  return varCache.get(n);
}
export const resetCssVars = () => varCache.clear();
