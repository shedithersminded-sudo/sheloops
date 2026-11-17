// My studio appearance: themes, backgrounds, cursor, layout, workspaces.
import { el, clamp, resetCssVars } from './util.js';
import { db } from './store.js';

// ---------- color helpers ----------
const hex = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h.slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const rgba = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };
const lum = h => { const [r, g, b] = hex(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

// Build every theme color from a few base colors.
export function derive(bg, accent, text, extra = {}) {
  const light = lum(bg) > 0.5;
  const c = light ? {
    bg, text, led: accent, panel: mix(bg, '#ffffff', 0.75), panel2: mix(bg, text, 0.06), line: mix(bg, text, 0.14), line2: mix(bg, text, 0.24),
    dim: mix(bg, text, 0.55), well: mix(bg, text, 0.03), head: mix(bg, '#ffffff', 0.5), sel: mix(bg, accent, 0.12), pad: mix(bg, text, 0.1), pad2: mix(bg, text, 0.15),
    lcd: mix(bg, text, 0.85), nav: mix(bg, '#ffffff', 0.6), console: mix(bg, '#ffffff', 0.75), btn: mix(bg, '#ffffff', 0.85),
  } : {
    bg, text, led: accent, panel: mix(bg, text, 0.05), panel2: mix(bg, text, 0.09), line: mix(bg, text, 0.13), line2: mix(bg, text, 0.2),
    dim: mix(bg, text, 0.55), well: mix(bg, text, 0.025), head: mix(bg, text, 0.07), sel: mix(mix(bg, text, 0.07), accent, 0.1), pad: mix(bg, text, 0.1), pad2: mix(bg, text, 0.14),
    lcd: mix(bg, accent, 0.09), nav: mix(bg, text, 0.025), console: mix(bg, text, 0.05), btn: mix(bg, text, 0.09),
  };
  c.ledtext = lum(accent) > 0.55 ? '#111111' : '#ffffff';
  c.red = '#ff3b3b'; c.green = '#4cd964';
  return { ...c, ...extra };
}
const T = (id, name, bg, accent, text, tracks, extra) => ({ id, name, builtin: true, c: derive(bg, accent, text, extra), tracks });
export const THEMES = [
  T('midnight', 'Midnight Studio', '#0e0e10', '#ff6a1a', '#ebe7df', ['#ff6a1a', '#ffd23f', '#3fd0ff', '#9dff5c', '#ff5ca8', '#b18cff', '#5cffd6', '#ff8f6b']),
  T('purple', 'Purple Dream', '#120c1c', '#b388ff', '#efe6ff', ['#b388ff', '#ff7ad9', '#7aa2ff', '#c9a7ff', '#ff9ecf', '#8e7dff', '#e0b3ff', '#6fd3ff']),
  T('pink', 'Pink Paradise', '#1a0d14', '#ff5ca8', '#ffe8f3', ['#ff5ca8', '#ff9ac9', '#ffc0dc', '#ff7a90', '#d77aff', '#ffb36b', '#ff4f7b', '#f8a5ff']),
  T('neon', 'Neon Cyber', '#05070d', '#00f0ff', '#d8fbff', ['#00f0ff', '#ff2bd6', '#39ff14', '#fff200', '#7b61ff', '#ff6b00', '#00ffa3', '#ff3864'], { red: '#ff2bd6', green: '#39ff14' }),
  T('diamond', 'Black Diamond', '#050505', '#f2f2f2', '#f2f2f2', ['#ffffff', '#bfbfbf', '#8c8c8c', '#e6e6e6', '#a6a6a6', '#d9d9d9', '#737373', '#cccccc']),
  T('ocean', 'Ocean Blue', '#071422', '#3fa9ff', '#e3f2ff', ['#3fa9ff', '#40e0d0', '#7fd1ff', '#1e90ff', '#5cffd6', '#a0c4ff', '#00b4d8', '#90e0ef']),
  T('sunset', 'Sunset', '#1a0f12', '#ff7a45', '#ffeede', ['#ff7a45', '#ffb347', '#ff5e7e', '#ffd166', '#c86bfa', '#ff9f80', '#f72585', '#ffcf99']),
  T('gold', 'Luxury Gold', '#0d0b07', '#d4af37', '#f5ecd2', ['#d4af37', '#f0d878', '#b8860b', '#e6c76b', '#fff1b8', '#c9a227', '#8c6d1f', '#f7e08c']),
  T('rose', 'Rose Gold', '#1a1213', '#e8a598', '#fbe9e5', ['#e8a598', '#f4c2b8', '#d4887a', '#ffd7cf', '#c97b84', '#f6b8a8', '#b76e79', '#fde2dc']),
  T('minimal', 'Minimalist', '#f2f1ee', '#1d1d1f', '#1d1d1f', ['#1d1d1f', '#ff6a1a', '#3a86ff', '#2a9d8f', '#e76f51', '#8338ec', '#6c757d', '#e9c46a']),
  T('vaporwave', 'Vaporwave', '#1a0b2e', '#ff71ce', '#fdf0ff', ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff', '#fffb96', '#ff9de2', '#7af7ff', '#c8a2ff']),
  T('acid', 'Acid Green', '#060a05', '#39ff14', '#eaffdf', ['#39ff14', '#c6ff00', '#00ff9c', '#ffee00', '#7dff3a', '#00e5ff', '#b2ff59', '#64ffda']),
  T('blood', 'Blood Moon', '#100506', '#ff1744', '#ffe6e9', ['#ff1744', '#ff6d00', '#ff5252', '#ff8a80', '#d50000', '#ffab40', '#ff4081', '#ffd180']),
  T('ice', 'Ice Queen', '#06111a', '#9be7ff', '#eefaff', ['#9be7ff', '#3fa9ff', '#e3f2fd', '#7c4dff', '#80deea', '#b3e5fc', '#82b1ff', '#a7ffeb']),
  T('lava', 'Lava Lamp', '#140805', '#ff6d00', '#fff1e6', ['#ff6d00', '#ffab00', '#ff3d00', '#ffd740', '#ff9e80', '#dd2c00', '#ffcc80', '#ff6e40']),
  T('forest', 'Midnight Forest', '#07120d', '#2bd97a', '#e6fff1', ['#2bd97a', '#a5d6a7', '#00bfa5', '#cddc39', '#69f0ae', '#80cbc4', '#b9f6ca', '#ffd54f']),
  T('cotton', 'Cotton Candy', '#1a1020', '#ff9de2', '#fff5fc', ['#ff9de2', '#9dd9ff', '#c4a7ff', '#ffd1f2', '#a0f0ff', '#ffb3c7', '#d6b4ff', '#b3fff0']),
  T('ultraviolet', 'Ultraviolet', '#0b0516', '#b400ff', '#f3e6ff', ['#b400ff', '#7a00ff', '#ff00e6', '#3d00ff', '#e040fb', '#651fff', '#ea80fc', '#8c9eff']),
  T('ember', 'Ember', '#120a07', '#ffb347', '#fff0de', ['#ffb347', '#ff7043', '#ffd27a', '#ff8a65', '#ffcc80', '#e65100', '#ffe0b2', '#ffab91']),
  T('deepsea', 'Deep Sea', '#030b17', '#00f5d4', '#e0fffa', ['#00f5d4', '#0077b6', '#00b4d8', '#90e0ef', '#3a0ca3', '#48cae4', '#7209b7', '#caf0f8']),
  T('mono', 'Monochrome', '#0a0a0b', '#d9d9de', '#f0f0f2', ['#d9d9de', '#9aa0aa', '#c4c8d0', '#7d828c', '#e6e8ec', '#b0b4bc', '#5c6370', '#f5f5f7']),
  T('paper', 'Paper Studio', '#efe9df', '#d1495b', '#2b2522', ['#d1495b', '#00798c', '#edae49', '#66a182', '#30638e', '#8d5a97', '#e07a5f', '#3d405b']),
  T('cherry', 'Cherry Blossom', '#160d10', '#ffb7c5', '#fff0f3', ['#ffb7c5', '#ff8fab', '#fb6f92', '#ffc2d1', '#e5989b', '#ffd6e0', '#c9184a', '#f4acb7']),
  T('arcade', 'Arcade', '#07040f', '#ffe600', '#fffbe0', ['#ffe600', '#ff2bd6', '#00e5ff', '#39ff14', '#ff6d00', '#7c4dff', '#ff1744', '#00ff9c']),
];
export const THEME_KEYS = [['bg', 'Background'], ['panel', 'Panels'], ['nav', 'Menu bar'], ['btn', 'Buttons'], ['led', 'Accent / highlight'], ['ledtext', 'Text on accent'], ['text', 'Text'], ['dim', 'Soft text'], ['line', 'Lines'], ['red', 'Record button'], ['console', 'Mixing console'], ['sel', 'Selected'], ['well', 'Wells and meters'], ['head', 'Track headers'], ['pad', 'Drum pads'], ['lcd', 'Display']];

// ---------- stored look ----------
const KEY = 'loopden.look';
const DEFAULT_LAYOUT = { inspPos: 'bottom', inspSize: 340, editbar: true, masterbar: true, compact: false,
  toolbar: ['tostart', 'play', 'record', 'lcd', 'bpm', 'click', 'countin', 'loop', 'punch', 'monitor', 'meter', 'mic', 'automation'], hidden: [] };
export const TOOL_NAMES = { tostart: 'Back to start', play: 'Play', record: 'Record', lcd: 'Time display', bpm: 'BPM', click: 'Click', countin: 'Count in', loop: 'Loop', punch: 'Punch', monitor: 'Monitor', meter: 'Mic meter', mic: 'Mic sound', automation: 'Automation' };
export const look = Object.assign({
  theme: 'midnight', themes: [], wave: '',
  bg: { type: 'theme', c1: '#0e0e10', c2: '#2a1030', angle: 135, anim: 'aurora', dim: 0.35, blur: 0, hasImage: false },
  see: 0,
  cursor: { on: false, design: 'dot', color: '#ff6a1a', size: 24, glow: 0.5, trail: 'none', click: 'ripple', anim: 'none', image: null, safe: true },
  layout: { ...DEFAULT_LAYOUT }, workspaces: [],
  font: 'Fredoka', logo: { has: false, size: 34, shape: 'none', text: true },
  glow: { on: true, color: '', amount: 0.45, style: 'neon', text: '' },
  uifx: { glow: 'neon', motion: 'lively', pulse: 'off', flash: false },
}, JSON.parse(localStorage.getItem(KEY) || '{}'));
look.glow = { on: true, color: '', amount: 0.45, style: 'neon', text: '', ...(look.glow || {}) };
look.uifx = { glow: 'neon', motion: 'lively', pulse: 'off', flash: false, ...(look.uifx || {}) };
look.cursor = { trailLen: 450, spot: false, ...look.cursor };
look.layout = { ...DEFAULT_LAYOUT, ...look.layout };
// 2026-11 new studio look: move the old default font to the new one once
if ((look.skinV || 0) < 2) { if (!look.font || look.font === 'Fredoka') look.font = 'Comfortaa'; look.skinV = 2; }
// 2026-11: the running SHELOOPS logo becomes the default (your own picture stays one click away in Appearance)
if ((look.skinV || 0) < 3) { look.logo = { ...(look.logo || {}), mode: 'runner' }; look.skinV = 3; }
if (look.cursor) delete look.cursor.imgEl;
for (const k of DEFAULT_LAYOUT.toolbar) if (!look.layout.toolbar.includes(k)) look.layout.toolbar.push(k);
// never store the loaded cursor picture element (it turns into {} and breaks the next start)
export function saveLook() { localStorage.setItem(KEY, JSON.stringify(look, (k, v) => k === 'imgEl' ? undefined : v)); }
export const allThemes = () => [...THEMES, ...look.themes];
export const currentTheme = () => allThemes().find(t => t.id === look.theme) || THEMES[0];
export const BUILT_IN_WORKSPACES = [
  { id: 'beginner', name: 'Beginner', simple: true, layout: { ...DEFAULT_LAYOUT } },
  { id: 'pro', name: 'Pro', simple: false, layout: { ...DEFAULT_LAYOUT, inspPos: 'right', inspSize: 440, compact: true } },
];

// ---------- apply ----------
let bgUrl = null;
export async function applyLook() {
  const th = currentTheme(), root = document.documentElement;
  for (const [k, v] of Object.entries(th.c)) root.style.setProperty('--' + k, v);
  const see = look.see || 0;
  if (see > 0) for (const k of ['panel', 'console', 'nav', 'head', 'btn', 'panel2']) root.style.setProperty('--' + k, rgba(th.c[k], 1 - see));
  root.classList.toggle('light', lum(th.c.bg) > 0.5);
  resetCssVars();
  applyFont();
  applyHeadFont();
  applyGlow();
  applyUiFx();
  await applyLogo();
  await applyBackground();
  applyCursor();
  applyLayout();
}
export const trackColors = () => currentTheme().tracks || THEMES[0].tracks;

async function applyBackground() {
  let L = document.getElementById('bglayer');
  if (!L) { L = el('div', { id: 'bglayer' }, el('div', { class: 'bganim' }), el('div', { class: 'bgdim' })); document.body.prepend(L); }
  const b = look.bg, th = currentTheme().c, anim = L.firstChild, dim = L.lastChild;
  L.style.background = th.bg; L.style.filter = ''; anim.className = 'bganim'; anim.innerHTML = '';
  if (b.type === 'solid') L.style.background = b.c1;
  else if (b.type === 'gradient') L.style.background = `linear-gradient(${b.angle}deg, ${b.c1}, ${b.c2})`;
  else if (b.type === 'image' && b.hasImage) {
    if (!bgUrl) { const d = await db.get('audio', 'look-bg').catch(() => null); if (d && d.img) bgUrl = URL.createObjectURL(d.img); }
    if (bgUrl) { L.style.background = `${th.bg} url(${bgUrl}) center / cover no-repeat`; L.style.filter = b.blur ? `blur(${b.blur}px)` : ''; }
  } else if (b.type === 'animated') {
    anim.classList.add('a-' + b.anim);
    anim.style.setProperty('--a1', b.c1); anim.style.setProperty('--a2', b.c2);
    if (b.anim === 'bars') for (let i = 0; i < 32; i++) anim.append(el('i', { style: `--d:${(0.6 + Math.random() * 1.4).toFixed(2)}s;--h:${(20 + Math.random() * 70).toFixed(0)}%` }));
  }
  // darken only when there is something to darken (no picture uploaded yet = plain theme color)
  const plain = b.type === 'theme' || (b.type === 'image' && !bgUrl);
  dim.style.background = `rgba(0,0,0,${plain ? 0 : b.dim})`;
}
export async function setBackgroundImage(file) {
  const img = await createImageBitmap(file); // validates it is a picture
  img.close?.();
  await db.put('audio', 'look-bg', { img: file, name: file.name });
  if (bgUrl) URL.revokeObjectURL(bgUrl); bgUrl = null;
  look.bg.hasImage = true; look.bg.type = 'image'; saveLook(); await applyBackground();
}

// ---------- text glow ----------
export function applyGlow() {
  const g = look.glow, root = document.documentElement, th = currentTheme();
  root.classList.toggle('tglow', !!g.on);
  root.classList.toggle('tg-pulse', !!g.on && g.style === 'pulse');
  root.classList.toggle('tg-soft', !!g.on && g.style === 'soft');
  root.style.setProperty('--tgc', g.color || th.c.led);
  root.style.setProperty('--tga', String(g.amount));
  if (g.text) root.style.setProperty('--text', g.text); else root.style.setProperty('--text', th.c.text);
}
// ---------- style effects: how much things glow, move, pulse and flash ----------
export const UIFX_PRESETS = {
  'Clean pro': { glow: 'none', motion: 'calm', pulse: 'off', flash: false },
  'Calm studio': { glow: 'soft', motion: 'calm', pulse: 'slow', flash: false },
  'Neon club': { glow: 'neon', motion: 'lively', pulse: 'off', flash: false },
  'Party': { glow: 'max', motion: 'lively', pulse: 'fast', flash: true },
};
export function applyUiFx() {
  const f = look.uifx, r = document.documentElement, amt = { none: 0, soft: 28, neon: 55, max: 85 }[f.glow] ?? 55;
  r.style.setProperty('--glow', `color-mix(in srgb, var(--led) ${amt}%, transparent)`);
  for (const k of ['none', 'soft', 'neon', 'max']) r.classList.toggle('fxg-' + k, f.glow === k);
  for (const k of ['still', 'calm', 'lively']) r.classList.toggle('fxm-' + k, f.motion === k);
  for (const k of ['off', 'slow', 'fast']) r.classList.toggle('fxp-' + k, f.pulse === k);
  r.classList.toggle('fxflash', !!f.flash);
}
// ---------- font ----------
export const FONTS_UI = [['Comfortaa', 'SHELOOPS look (default)'], ['Fredoka', 'Round and friendly'], ['Baloo 2', 'Bubbly and bold'], ['Nunito', 'Soft and clean'], ['Quicksand', 'Light and airy'], ['Space Grotesk', 'Modern and simple'], ['Cascadia Mono', 'Studio code look (original)']];
export function applyFont() {
  const f = look.font || 'Comfortaa', mono = f === 'Cascadia Mono';
  document.documentElement.style.setProperty('--font', mono ? '"Cascadia Mono", Consolas, monospace' : `"${f}", "Nunito", system-ui, sans-serif`);
}
// heading font (titles, big words) can be chosen separately
export const HEAD_FONTS = [['Bungee', 'Block signage (default)'], ['Monoton', 'Neon tubes'], ['Righteous', 'Retro round'], ['Rubik Glitch', 'Glitched'], ['Permanent Marker', 'Hand drawn'], ['Press Start 2P', 'Arcade pixels'], ['Bebas Neue', 'Tall and clean'], ['Abril Fatface', 'Magazine'], ['Cinzel', 'Classic'], ['UnifrakturMaguntia', 'Gothic'], ['Pacifico', 'Script'], ['Lobster', 'Bold script']];
export function applyHeadFont() { const f = look.headFont; document.documentElement.style.setProperty('--display', f ? `"${f}", "Bungee", sans-serif` : "'Bungee', 'Righteous', var(--font)"); }
// ---------- logo (my own art, kept in this browser only) ----------
let logoUrl = null;
export async function logoURL() {
  if (!look.logo || !look.logo.has) return null;
  if (!logoUrl) { const d = await db.get('audio', 'look-logo').catch(() => null); if (d && d.img) logoUrl = URL.createObjectURL(d.img); }
  return logoUrl;
}
export async function setLogo(file) {
  await createImageBitmap(file); // make sure it is a picture
  await db.put('audio', 'look-logo', { img: file, name: file.name }); // stored exactly as uploaded
  if (logoUrl) URL.revokeObjectURL(logoUrl); logoUrl = null;
  look.logo = { size: 34, shape: 'none', text: true, ...(look.logo || {}), has: true, mode: 'mine' }; saveLook(); await applyLogo();
}
export async function removeLogo() {
  await db.del('audio', 'look-logo').catch(() => { }); if (logoUrl) URL.revokeObjectURL(logoUrl); logoUrl = null;
  look.logo.has = false; saveLook(); await applyLogo();
}
export async function applyLogo() {
  look.logo ||= { has: false, size: 34, shape: 'none', text: true };
  document.documentElement.style.setProperty('--logo-h', (look.logo.size || 34) + 'px');
  const url = await logoURL();
  let ico = document.querySelector('link[rel=icon]');
  if (url) { if (!ico) { ico = el('link', { rel: 'icon' }); document.head.append(ico); } ico.href = url; } else if (ico) ico.remove();
  document.dispatchEvent(new Event('logochange'));
}
// ---------- cursor ----------
let curStyle, overlay, halo, spot, trailCv, trailPts = [], parts = [], lastSafe = false, hue = 0;
export function cursorImage(c = look.cursor) {
  const S = clamp(c.size, 12, 64), pad = Math.round(c.glow * 12), W = S + pad * 2, cv = el('canvas', { width: W, height: W }), g = cv.getContext('2d');
  g.translate(pad, pad);
  g.shadowColor = c.color; g.shadowBlur = c.glow * 14;
  g.fillStyle = c.color; g.strokeStyle = c.color; g.lineWidth = Math.max(2, S / 10);
  const m = S / 2;
  const outline = () => { g.shadowBlur = 0; g.lineWidth = 1.5; g.strokeStyle = 'rgba(0,0,0,.6)'; g.stroke(); };
  let hx = pad + m, hy = pad + m;
  switch (c.design) {
    case 'dot': g.beginPath(); g.arc(m, m, S * 0.22, 0, 7); g.fill(); outline(); break;
    case 'ring': g.beginPath(); g.arc(m, m, S * 0.38, 0, 7); g.stroke(); g.beginPath(); g.arc(m, m, 2, 0, 7); g.fill(); break;
    case 'cross': g.beginPath(); g.moveTo(m, 2); g.lineTo(m, S - 2); g.moveTo(2, m); g.lineTo(S - 2, m); g.stroke(); break;
    case 'arrow': g.beginPath(); g.moveTo(1, 1); g.lineTo(1, S * 0.8); g.lineTo(S * 0.25, S * 0.6); g.lineTo(S * 0.45, S * 0.95); g.lineTo(S * 0.55, S * 0.9); g.lineTo(S * 0.36, S * 0.56); g.lineTo(S * 0.62, S * 0.56); g.closePath(); g.fill(); outline(); hx = pad + 1; hy = pad + 1; break;
    case 'star': g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? S * 0.2 : S * 0.46, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(m + r * Math.cos(a), m + r * Math.sin(a)); } g.closePath(); g.fill(); outline(); break;
    case 'heart': g.beginPath(); g.moveTo(m, S * 0.85); g.bezierCurveTo(S * 0.05, S * 0.5, S * 0.15, S * 0.1, m, S * 0.3); g.bezierCurveTo(S * 0.85, S * 0.1, S * 0.95, S * 0.5, m, S * 0.85); g.fill(); outline(); break;
    case 'note': g.beginPath(); g.ellipse(S * 0.35, S * 0.75, S * 0.18, S * 0.13, -0.4, 0, 7); g.fill(); g.fillRect(S * 0.48, S * 0.12, S * 0.07, S * 0.62); g.beginPath(); g.moveTo(S * 0.55, S * 0.12); g.quadraticCurveTo(S * 0.85, S * 0.2, S * 0.8, S * 0.45); g.lineTo(S * 0.55, S * 0.3); g.fill(); hx = pad + Math.round(S * 0.35); hy = pad + Math.round(S * 0.75); break;
    case 'image': if (c.imgEl instanceof HTMLImageElement && c.imgEl.complete) { g.shadowBlur = c.glow * 14; g.drawImage(c.imgEl, 0, 0, S, S); } hx = pad + 2; hy = pad + 2; break;
  }
  return { url: cv.toDataURL('image/png'), hx: Math.round(hx), hy: Math.round(hy) };
}
const SAFE = '.tl-scroll, .ed-body, .mixstrips, .autolane, .wave, .vkeys, input[type=range]';
export function applyCursor() {
  const c = look.cursor;
  curStyle ||= document.head.appendChild(el('style', { id: 'curstyle' }));
  if (c.design === 'image' && c.image && !(c.imgEl instanceof HTMLImageElement)) { const im = new Image(); im.onload = () => { c.imgEl = im; applyCursor(); }; im.src = c.image; return; }
  if (!c.on) { curStyle.textContent = ''; document.documentElement.classList.remove('ccur'); hideFx(); return; }
  const { url, hx, hy } = cursorImage(c);
  const safe = c.safe ? `html.ccur :is(${SAFE}), html.ccur :is(${SAFE}) :is(button, label, div, span) { cursor: default; }` : '';
  curStyle.textContent = `html.ccur body, html.ccur button, html.ccur label, html.ccur select, html.ccur a, html.ccur .tile, html.ccur .help { cursor: url(${url}) ${hx} ${hy}, auto; }\n${safe}`;
  document.documentElement.classList.add('ccur');
  setupFx();
}
function hideFx() { if (overlay) overlay.style.display = 'none'; }
function setupFx() {
  const c = look.cursor;
  if (!overlay) {
    overlay = el('div', { id: 'curfx' }); halo = el('div', { class: 'halo' }); spot = el('div', { class: 'spot' }); trailCv = el('canvas', { class: 'trail' });
    overlay.append(spot, trailCv, halo); document.body.append(overlay);
    const size = () => { trailCv.width = innerWidth; trailCv.height = innerHeight; }; size(); addEventListener('resize', size);
    addEventListener('pointermove', e => {
      if (!look.cursor.on) return;
      lastSafe = look.cursor.safe && !!(e.target.closest && e.target.closest(SAFE));
      halo.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; halo.style.opacity = lastSafe ? 0 : 1;
      spot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      if (look.cursor.trail !== 'none' && !lastSafe) trailPts.push({ x: e.clientX, y: e.clientY, t: performance.now(), r: Math.random() });
    }, { passive: true });
    addEventListener('pointerdown', e => {
      const k = look.cursor.click; if (!look.cursor.on || k === 'none') return;
      if (PARTICLE_CLICKS.has(k)) { burstParts(k, e.clientX, e.clientY); return; }
      const r = el('div', { class: 'clickfx ' + k, style: `left:${e.clientX}px;top:${e.clientY}px;--cc:${look.cursor.color}` });
      overlay.append(r); setTimeout(() => r.remove(), 600);
    }, { passive: true, capture: true });
    const loop = () => {
      const g = trailCv.getContext('2d'), now = performance.now(), col = look.cursor.color, mode = look.cursor.trail;
      g.clearRect(0, 0, trailCv.width, trailCv.height);
      const life = look.cursor.trailLen || 450; hue = (hue + 2) % 360;
      trailPts = trailPts.filter(p => now - p.t < life);
      if (look.cursor.on && mode !== 'none' && trailPts.length) {
        g.fillStyle = col; g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = 8 * look.cursor.glow;
        if (mode === 'comet') { g.lineCap = 'round'; for (let i = 1; i < trailPts.length; i++) { const a = i / trailPts.length; g.globalAlpha = a * 0.8; g.lineWidth = 1 + a * 9; g.beginPath(); g.moveTo(trailPts[i - 1].x, trailPts[i - 1].y); g.lineTo(trailPts[i].x, trailPts[i].y); g.stroke(); } }
        else if (mode === 'rainbow') for (const p of trailPts) { const a = 1 - (now - p.t) / life; g.globalAlpha = a; g.fillStyle = g.shadowColor = `hsl(${(p.t / 4) % 360} 100% 65%)`; g.beginPath(); g.arc(p.x, p.y, 5 * a + 1, 0, 7); g.fill(); }
        else if (mode === 'notes') for (const p of trailPts) { if (p.r > 0.3) continue; const a = 1 - (now - p.t) / life; g.globalAlpha = a; g.font = `${12 + p.r * 20}px sans-serif`; g.fillText(p.r > 0.15 ? '♪' : '♫', p.x + (p.r - 0.15) * 60, p.y - (1 - a) * 30); }
        else if (mode === 'bubbles') for (const p of trailPts) { const a = 1 - (now - p.t) / life; g.globalAlpha = a * 0.7; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x + (p.r - 0.5) * 20, p.y - (1 - a) * 24, 2 + p.r * 6, 0, 7); g.stroke(); }
        else if (mode === 'line') { g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); trailPts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.globalAlpha = 0.6; g.stroke(); }
        else for (const p of trailPts) {
          const a = 1 - (now - p.t) / life; g.globalAlpha = a * 0.8;
          if (mode === 'sparkle') { const s = 2 + p.r * 4, x = p.x + (p.r - 0.5) * 16, y = p.y + ((p.r * 7) % 1 - 0.5) * 16; g.fillRect(x - s / 2, y - 0.5, s, 1); g.fillRect(x - 0.5, y - s / 2, 1, s); }
          else { g.beginPath(); g.arc(p.x, p.y, 4 * a + 1, 0, 7); g.fill(); }
        }
        g.globalAlpha = 1;
      }
      if (parts.length) {
        parts = parts.filter(q => now - q.t < q.life);
        for (const q of parts) {
          const k = (now - q.t) / 1000, a = 1 - (now - q.t) / q.life, x = q.x + q.vx * k, y = q.y + q.vy * k + 260 * q.gr * k * k;
          g.globalAlpha = a; g.fillStyle = g.shadowColor = q.c; g.shadowBlur = 10 * look.cursor.glow;
          if (q.ch) { g.font = `${q.s}px sans-serif`; g.fillText(q.ch, x, y); }
          else if (q.ring) { g.strokeStyle = q.c; g.lineWidth = 2 * a; g.beginPath(); g.arc(q.x, q.y, 6 + k * q.vx, 0, 7); g.stroke(); }
          else { g.save(); g.translate(x, y); g.rotate(k * q.rot); g.fillRect(-q.s / 2, -q.s / 4, q.s, q.s / 2); g.restore(); }
        }
        g.globalAlpha = 1;
      }
      requestAnimationFrame(loop);
    };
    loop();
  }
  overlay.style.display = '';
  spot.style.display = c.spot ? 'block' : 'none'; spot.style.setProperty('--cc', c.color);
  halo.className = 'halo ' + (c.anim !== 'none' ? 'h-' + c.anim : '');
  halo.style.setProperty('--cc', c.color); halo.style.setProperty('--cs', (c.size * 1.6) + 'px');
}
const PARTICLE_CLICKS = new Set(['notes', 'confetti', 'shockwave', 'stars']);
function burstParts(k, x, y) {
  const col = look.cursor.color, t = performance.now(), R = Math.random;
  if (k === 'shockwave') { for (const [v, d] of [[90, 0], [150, 70], [210, 140]]) parts.push({ ring: true, x, y, vx: v, t: t + d, life: 600, c: col }); return; }
  for (let i = 0; i < (k === 'confetti' ? 22 : 8); i++) {
    const a = R() * Math.PI * 2, sp = 60 + R() * 160;
    if (k === 'confetti') parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, gr: 1, s: 5 + R() * 5, rot: R() * 12, t, life: 900, c: `hsl(${R() * 360} 95% 62%)` });
    else if (k === 'notes') parts.push({ x, y, vx: (R() - 0.5) * 120, vy: -60 - R() * 120, gr: 0.2, ch: R() > 0.5 ? '♪' : '♫', s: 14 + R() * 12, t, life: 900, c: col });
    else parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, gr: 0.4, ch: '✦', s: 10 + R() * 10, t, life: 700, c: col });
  }
}
export function resetCursor() { look.cursor = { on: false, design: 'dot', color: currentTheme().c.led, size: 24, glow: 0.5, trail: 'none', click: 'ripple', anim: 'none', image: null, safe: true, trailLen: 450, spot: false }; saveLook(); applyCursor(); }

// ---------- layout ----------
export function applyLayout() {
  const L = look.layout, b = document.body;
  b.classList.toggle('insp-right', L.inspPos === 'right');
  b.classList.toggle('no-editbar', !L.editbar);
  b.classList.toggle('no-masterbar', !L.masterbar);
  b.classList.toggle('compact', !!L.compact);
  document.documentElement.style.setProperty('--insp-size', L.inspSize + 'px');
}
export function arrangeToolbar(tb) {
  const L = look.layout, byK = {};
  for (const c of [...tb.children]) byK[c.dataset.k] = c;
  for (const k of L.toolbar) if (byK[k]) { tb.append(byK[k]); byK[k].hidden = L.hidden.includes(k); }
}
// Drag handle that resizes the studio inspector
export function inspectorGrip(box) {
  const grip = el('div', { class: 'insp-grip', title: 'Drag to resize' });
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); grip.setPointerCapture(e.pointerId);
    const right = look.layout.inspPos === 'right', start = right ? e.clientX : e.clientY, s0 = look.layout.inspSize;
    grip.onpointermove = ev => { const d = (right ? ev.clientX : ev.clientY) - start; look.layout.inspSize = clamp(s0 - d, 140, right ? 900 : 700); applyLayout(); };
    grip.onpointerup = () => { grip.onpointermove = null; saveLook(); };
  });
  box.prepend(grip);
}
